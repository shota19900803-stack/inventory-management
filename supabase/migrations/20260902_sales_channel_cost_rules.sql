-- Sales channel cost rules (additive / safe by default)
-- Rates are percentages. Existing rows are not modified.
create table if not exists public.sales_channel_cost_rules (
  id uuid primary key default gen_random_uuid(),
  sales_channel text not null,
  fee_rate numeric(7,4) not null default 0 check (fee_rate >= 0 and fee_rate <= 100),
  affiliate_rate numeric(7,4) not null default 0 check (affiliate_rate >= 0 and affiliate_rate <= 100),
  advertising_rate numeric(7,4) not null default 0 check (advertising_rate >= 0 and advertising_rate <= 100),
  fixed_fee numeric(12,2) not null default 0 check (fixed_fee >= 0),
  active boolean not null default true,
  valid_from date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_channel, valid_from)
);

create index if not exists idx_sales_channel_cost_rules_lookup
  on public.sales_channel_cost_rules (sales_channel, active, valid_from desc);

comment on table public.sales_channel_cost_rules is '販売チャネル別の手数料・広告・アフィリエイト費用ルール。初期値0で既存利益を変更しない。';
