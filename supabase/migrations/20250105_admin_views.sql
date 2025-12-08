-- Aggregated stats for admin dashboard

-- Orders summary by status and type (last 30 days)
create or replace view admin_order_summary as
select
  status,
  reference_type,
  count(*) as order_count,
  coalesce(sum(amount),0) as gross,
  coalesce(sum(fee),0) as fees,
  coalesce(sum(net),0) as net
from orders
where created_at >= now() - interval '30 days'
group by status, reference_type;

-- Sales by day (last 30 days)
create or replace view admin_sales_by_day as
select
  date_trunc('day', created_at) as day,
  count(*) as orders,
  coalesce(sum(amount),0) as gross,
  coalesce(sum(fee),0) as fees,
  coalesce(sum(net),0) as net
from orders
where created_at >= now() - interval '30 days'
  and status = 'completed'
group by 1
order by 1 desc;

-- Top creators by net earnings (last 30 days)
create or replace view admin_top_creators as
select
  creator_id,
  count(*) as orders,
  coalesce(sum(net),0) as net
from orders
where created_at >= now() - interval '30 days'
  and status = 'completed'
  and creator_id is not null
group by creator_id
order by net desc
limit 20;

-- Top buyers by gross spend (last 30 days)
create or replace view admin_top_buyers as
select
  user_id,
  count(*) as orders,
  coalesce(sum(amount),0) as gross
from orders
where created_at >= now() - interval '30 days'
  and status = 'completed'
group by user_id
order by gross desc
limit 20;

-- Live events (for realtime feed in admin)
-- rely on orders table realtime for inserts/updates
