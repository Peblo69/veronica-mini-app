-- Stories table for user stories (24hr expiring content)
create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users(telegram_id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  thumbnail_url text,
  duration integer, -- for videos, in seconds
  view_count integer not null default 0,
  is_active boolean not null default true,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create index if not exists idx_stories_user on stories(user_id);
create index if not exists idx_stories_expires on stories(expires_at);
create index if not exists idx_stories_active on stories(is_active, expires_at);

-- Story views tracking
create table if not exists story_views (
  id bigserial primary key,
  story_id uuid not null references stories(id) on delete cascade,
  viewer_id bigint not null references users(telegram_id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique(story_id, viewer_id)
);

create index if not exists idx_story_views_story on story_views(story_id);
create index if not exists idx_story_views_viewer on story_views(viewer_id);

-- Withdrawals table for cash out requests
create table if not exists withdrawals (
  id bigserial primary key,
  user_id bigint not null references users(telegram_id) on delete cascade,
  amount integer not null check (amount > 0), -- Stars amount
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected', 'cancelled')),
  payout_method text not null default 'telegram_stars', -- could be 'bank', 'crypto', etc in future
  payout_details jsonb default '{}'::jsonb, -- wallet address, bank info, etc
  admin_notes text,
  processed_by bigint references users(telegram_id) on delete set null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_withdrawals_user on withdrawals(user_id);
create index if not exists idx_withdrawals_status on withdrawals(status);

-- RLS Policies for stories
alter table stories enable row level security;

-- Anyone can view active, non-expired stories
create policy "Anyone can view active stories" on stories
  for select using (is_active = true and expires_at > now());

-- Users can insert their own stories
create policy "Users can insert own stories" on stories
  for insert with check (true);

-- Users can update/delete their own stories
create policy "Users can update own stories" on stories
  for update using (true);

create policy "Users can delete own stories" on stories
  for delete using (true);

-- RLS Policies for story_views
alter table story_views enable row level security;

create policy "Anyone can view story views" on story_views
  for select using (true);

create policy "Users can insert own views" on story_views
  for insert with check (true);

-- RLS Policies for withdrawals
alter table withdrawals enable row level security;

-- Users can only see their own withdrawals
create policy "Users can view own withdrawals" on withdrawals
  for select using (true);

-- Users can create withdrawal requests
create policy "Users can create withdrawals" on withdrawals
  for insert with check (true);

-- Only admins can update withdrawals (via service role)
create policy "Users can cancel own pending withdrawals" on withdrawals
  for update using (status = 'pending');

-- Function to create a story
create or replace function create_story(
  p_user_id bigint,
  p_media_url text,
  p_media_type text,
  p_thumbnail_url text default null,
  p_duration integer default null
) returns uuid as $$
declare
  v_story_id uuid;
begin
  insert into stories (user_id, media_url, media_type, thumbnail_url, duration)
  values (p_user_id, p_media_url, p_media_type, p_thumbnail_url, p_duration)
  returning id into v_story_id;

  return v_story_id;
end;
$$ language plpgsql security definer;

-- Function to view a story (records view, increments count)
create or replace function view_story(
  p_story_id uuid,
  p_viewer_id bigint
) returns boolean as $$
begin
  -- Try to insert view (will fail silently if already viewed)
  insert into story_views (story_id, viewer_id)
  values (p_story_id, p_viewer_id)
  on conflict (story_id, viewer_id) do nothing;

  -- If we inserted a new view, increment the count
  if found then
    update stories set view_count = view_count + 1
    where id = p_story_id;
    return true;
  end if;

  return false;
end;
$$ language plpgsql security definer;

-- Function to get active stories for a user's feed
create or replace function get_feed_stories(p_viewer_id bigint)
returns table (
  id uuid,
  user_id bigint,
  media_url text,
  media_type text,
  thumbnail_url text,
  duration integer,
  view_count integer,
  created_at timestamptz,
  expires_at timestamptz,
  has_viewed boolean,
  user_first_name text,
  user_username text,
  user_avatar_url text,
  user_is_verified boolean
) as $$
begin
  return query
  select
    s.id,
    s.user_id,
    s.media_url,
    s.media_type,
    s.thumbnail_url,
    s.duration,
    s.view_count,
    s.created_at,
    s.expires_at,
    exists(select 1 from story_views sv where sv.story_id = s.id and sv.viewer_id = p_viewer_id) as has_viewed,
    u.first_name as user_first_name,
    u.username as user_username,
    u.avatar_url as user_avatar_url,
    u.is_verified as user_is_verified
  from stories s
  join users u on u.telegram_id = s.user_id
  where s.is_active = true
    and s.expires_at > now()
    and (
      -- Show user's own stories
      s.user_id = p_viewer_id
      -- Show stories from followed users
      or exists(select 1 from follows f where f.follower_id = p_viewer_id and f.following_id = s.user_id)
    )
  order by
    -- Unviewed stories first
    exists(select 1 from story_views sv where sv.story_id = s.id and sv.viewer_id = p_viewer_id),
    s.created_at desc;
end;
$$ language plpgsql security definer;

-- Function to request withdrawal
create or replace function request_withdrawal(
  p_user_id bigint,
  p_amount integer,
  p_payout_method text default 'telegram_stars',
  p_payout_details jsonb default '{}'::jsonb
) returns bigint as $$
declare
  v_balance integer;
  v_withdrawal_id bigint;
begin
  -- Check user's balance
  select stars_balance into v_balance from wallets where user_id = p_user_id;

  if v_balance is null or v_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  -- Create withdrawal request
  insert into withdrawals (user_id, amount, payout_method, payout_details)
  values (p_user_id, p_amount, p_payout_method, p_payout_details)
  returning id into v_withdrawal_id;

  -- Deduct from balance (held until processed)
  update wallets set
    stars_balance = stars_balance - p_amount,
    updated_at = now()
  where user_id = p_user_id;

  return v_withdrawal_id;
end;
$$ language plpgsql security definer;

-- Function to cancel withdrawal (returns funds)
create or replace function cancel_withdrawal(
  p_withdrawal_id bigint,
  p_user_id bigint
) returns boolean as $$
declare
  v_withdrawal withdrawals%rowtype;
begin
  select * into v_withdrawal from withdrawals
  where id = p_withdrawal_id and user_id = p_user_id and status = 'pending';

  if not found then
    return false;
  end if;

  -- Return funds to wallet
  update wallets set
    stars_balance = stars_balance + v_withdrawal.amount,
    updated_at = now()
  where user_id = p_user_id;

  -- Mark as cancelled
  update withdrawals set
    status = 'cancelled',
    processed_at = now()
  where id = p_withdrawal_id;

  return true;
end;
$$ language plpgsql security definer;

-- Cleanup job: mark expired stories as inactive (run via cron or scheduled function)
create or replace function cleanup_expired_stories() returns integer as $$
declare
  v_count integer;
begin
  update stories set is_active = false
  where is_active = true and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;
