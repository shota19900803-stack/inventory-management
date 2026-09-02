-- Sales-channel cost rules.
-- Rates are percentages. Defaults are intentionally zero so existing historical
-- profit is not silently rewritten until the operator configures real rates.

begin;

create table if not exists public.sales_channel_cost_rules (
  id uuid primary key default gen_random_uuid(),
  channel text not null unique,
  fee_rate numeric not null default 0 check (fee_rate >= 0),
  affiliate_rate numeric not null default 0 check (affiliate_rate >= 0),
  advertising_rate numeric not null default 0 check (advertising_rate >= 0),
  fixed_fee numeric not null default 0 check (fixed_fee >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales_channel_cost_rules enable row level security;

create index if not exists idx_sales_channel_cost_rules_active
  on public.sales_channel_cost_rules(active);

-- Keep configuration available to the existing browser application during the
-- migration period. Mutation permissions should be narrowed when auth is in place.
drop policy if exists sales_channel_cost_rules_select on public.sales_channel_cost_rules;
create policy sales_channel_cost_rules_select
  on public.sales_channel_cost_rules for select
  to anon, authenticated
  using (true);

drop policy if exists sales_channel_cost_rules_insert on public.sales_channel_cost_rules;
create policy sales_channel_cost_rules_insert
  on public.sales_channel_cost_rules for insert
  to authenticated
  with check (true);

drop policy if exists sales_channel_cost_rules_update on public.sales_channel_cost_rules;
create policy sales_channel_cost_rules_update
  on public.sales_channel_cost_rules for update
  to authenticated
  using (true)
  with check (true);

insert into public.sales_channel_cost_rules(channel)
values ('楽天市場'), ('Amazon'), ('Yahoo!'), ('メルカリ'), ('その他')
on conflict (channel) do nothing;

commit;
