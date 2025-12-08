-- Livestream core tables (idempotent)
create extension if not exists "uuid-ossp";

create table if not exists public.livestreams (
  id uuid primary key default uuid_generate_v4(),
  creator_id bigint not null references public.users(telegram_id) on delete cascade,
  title text not null,
  description text,
  thumbnail_url text,
  status text not null check (status in ('scheduled','live','ended')) default 'scheduled',
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  is_private boolean not null default false,
  entry_price integer not null default 0,
  room_name text,
  agora_channel text,
  viewer_count integer not null default 0,
  peak_viewers integer not null default 0,
  total_gifts_received integer not null default 0,
  total_tips_received integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.livestream_viewers (
  id bigserial primary key,
  livestream_id uuid not null references public.livestreams(id) on delete cascade,
  user_id bigint not null references public.users(telegram_id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  is_currently_watching boolean not null default true
);
create index if not exists livestream_viewers_stream_idx on public.livestream_viewers(livestream_id);
create index if not exists livestream_viewers_user_idx on public.livestream_viewers(user_id);

create table if not exists public.livestream_messages (
  id bigserial primary key,
  livestream_id uuid not null references public.livestreams(id) on delete cascade,
  user_id bigint not null references public.users(telegram_id) on delete cascade,
  content text,
  message_type text not null check (message_type in ('chat','gift','tip','system')),
  gift_id text,
  tip_amount integer,
  is_pinned boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists livestream_messages_stream_idx on public.livestream_messages(livestream_id);

create table if not exists public.livestream_tickets (
  id bigserial primary key,
  livestream_id uuid not null references public.livestreams(id) on delete cascade,
  user_id bigint not null references public.users(telegram_id) on delete cascade,
  amount integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists livestream_tickets_unique_user_stream on public.livestream_tickets(livestream_id, user_id);

create table if not exists public.streaming_usage (
  user_id bigint not null references public.users(telegram_id) on delete cascade,
  date date not null,
  minutes_used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Updated at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_livestreams on public.livestreams;
create trigger set_updated_at_livestreams
before update on public.livestreams
for each row execute function public.set_updated_at();

-- RLS
alter table public.livestreams enable row level security;
alter table public.livestream_viewers enable row level security;
alter table public.livestream_messages enable row level security;
alter table public.livestream_tickets enable row level security;
alter table public.streaming_usage enable row level security;

-- Livestreams: creators manage their rows; everyone can read live streams
-- Use telegram_id from JWT (stored as string) instead of auth.uid() to avoid uuid/bigint cast issues
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'livestreams' and policyname = 'livestreams_select_live'
  ) then
    create policy "livestreams_select_live" on public.livestreams
    for select using (
      status in ('live','scheduled')
      or creator_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint
    );
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'livestreams' and policyname = 'livestreams_insert_creator'
  ) then
    create policy "livestreams_insert_creator" on public.livestreams
    for insert with check (creator_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'livestreams' and policyname = 'livestreams_update_creator'
  ) then
    create policy "livestreams_update_creator" on public.livestreams
    for update using (creator_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint);
  end if;
end$$;

-- Viewers table: any authenticated user can insert/update their own row for a stream
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'livestream_viewers' and policyname = 'livestream_viewers_select'
  ) then
    create policy "livestream_viewers_select" on public.livestream_viewers
    for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'livestream_viewers' and policyname = 'livestream_viewers_upsert_self'
  ) then
    create policy "livestream_viewers_upsert_self" on public.livestream_viewers
    for all using (user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint) with check (user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint);
  end if;
end$$;

-- Messages: attendees can read; authors can insert their own chat; creators can moderate (update delete flag)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'livestream_messages' and policyname = 'livestream_messages_select'
  ) then
    create policy "livestream_messages_select" on public.livestream_messages
    for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'livestream_messages' and policyname = 'livestream_messages_insert_self'
  ) then
    create policy "livestream_messages_insert_self" on public.livestream_messages
    for insert with check (user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'livestream_messages' and policyname = 'livestream_messages_update_owner_or_creator'
  ) then
    create policy "livestream_messages_update_owner_or_creator" on public.livestream_messages
    for update using (
      user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint
      or exists(select 1 from public.livestreams ls where ls.id = livestream_id and ls.creator_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint)
    );
  end if;
end$$;

-- Tickets: users can read/insert their own ticket rows
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'livestream_tickets' and policyname = 'livestream_tickets_select'
  ) then
    create policy "livestream_tickets_select" on public.livestream_tickets
    for select using (
      user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint
      or exists(select 1 from public.livestreams ls where ls.id = livestream_id and ls.creator_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint)
    );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'livestream_tickets' and policyname = 'livestream_tickets_insert_self'
  ) then
    create policy "livestream_tickets_insert_self" on public.livestream_tickets
    for insert with check (user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint);
  end if;
end$$;

-- Streaming usage: user can read/update their own usage
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'streaming_usage' and policyname = 'streaming_usage_self'
  ) then
    create policy "streaming_usage_self" on public.streaming_usage
    for all using (user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint) with check (user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint);
  end if;
end$$;
