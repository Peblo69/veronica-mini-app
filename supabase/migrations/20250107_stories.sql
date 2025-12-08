-- Stories table for temporary media (24h style)
create extension if not exists "uuid-ossp";

create table if not exists public.stories (
  id uuid primary key default uuid_generate_v4(),
  user_id bigint not null references public.users(telegram_id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image','video')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);
create index if not exists stories_user_idx on public.stories(user_id);
create index if not exists stories_expires_idx on public.stories(expires_at);

alter table public.stories enable row level security;

-- Ensure columns exist if table was already present without user_id
alter table public.stories
  add column if not exists user_id bigint references public.users(telegram_id) on delete cascade,
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists expires_at timestamptz default (now() + interval '24 hours'),
  add column if not exists created_at timestamptz default now();

-- Anyone can read non-expired stories; owners can insert their own
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'stories' and policyname = 'stories_select_non_expired'
  ) then
    create policy "stories_select_non_expired" on public.stories
    for select using (expires_at > now());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'stories' and policyname = 'stories_insert_self'
  ) then
    create policy "stories_insert_self" on public.stories
    for insert with check (user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id')::bigint);
  end if;
end$$;
