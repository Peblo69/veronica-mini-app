-- Admin audit log table to track privileged actions
create table if not exists admin_audit_logs (
  id bigserial primary key,
  actor text not null, -- identifier of admin/operator
  action text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_admin_audit_logs_action on admin_audit_logs(action);
create index if not exists idx_admin_audit_logs_created_at on admin_audit_logs(created_at desc);
