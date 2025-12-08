-- Orders table to track every paid action
create table if not exists orders (
  id bigserial primary key,
  user_id bigint not null references users(telegram_id) on delete cascade,
  creator_id bigint references users(telegram_id) on delete set null,
  reference_type text not null check (reference_type in ('subscription', 'unlock', 'tip', 'livestream')),
  reference_id text not null,
  amount integer not null check (amount > 0), -- Stars amount
  fee integer not null default 0,
  net integer not null default 0,
  currency text not null default 'stars',
  status text not null default 'pending' check (status in ('pending', 'completed', 'refunded', 'failed')),
  payment_provider text default 'telegram_stars',
  provider_payment_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz,
  refunded_at timestamptz
);

create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_orders_creator on orders(creator_id);
create index if not exists idx_orders_status on orders(status);

-- Ledger to record debits/credits for users and platform
create table if not exists ledger_entries (
  id bigserial primary key,
  order_id bigint references orders(id) on delete cascade,
  user_id bigint references users(telegram_id) on delete cascade,
  amount integer not null, -- positive credit, negative debit
  role text not null check (role in ('user', 'creator', 'platform')),
  description text,
  created_at timestamptz default now()
);

create index if not exists idx_ledger_user on ledger_entries(user_id);
create index if not exists idx_ledger_order on ledger_entries(order_id);

-- Wallets for balances (net for creators, fees for platform)
create table if not exists wallets (
  user_id bigint primary key references users(telegram_id) on delete cascade,
  stars_balance integer not null default 0,
  updated_at timestamptz default now()
);

-- Ensure wallet exists for all users
insert into wallets (user_id)
select telegram_id from users
on conflict (user_id) do nothing;

-- Platform fee setting (single row)
create table if not exists platform_settings (
  id int primary key default 1,
  platform_fee_percent numeric not null default 15 -- % fee on gross
);
insert into platform_settings (id, platform_fee_percent) values (1, 15)
on conflict (id) do nothing;
