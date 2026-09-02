-- Security hardening v1
-- IMPORTANT: review the application's authenticated flow before applying this migration to production.
-- This migration is intentionally conservative: it does not revoke existing RPC access yet.
-- It documents and prepares the security boundary for the next migration.

begin;

-- Harden search_path for the dashboard reporting function so object resolution is deterministic.
create or replace function public.get_dashboard_month_summary(p_month date)
returns table (
  month_start date,
  sales_total numeric,
  sales_cost numeric,
  gross_profit numeric,
  purchase_total numeric,
  sales_count bigint,
  purchase_count bigint
)
language sql
stable
set search_path = public, pg_catalog
as $$
  select
    date_trunc('month', p_month)::date,
    coalesce((select sum(s.total_sales) from public.sales_history s where s.is_cancelled = false and s.sale_date >= date_trunc('month', p_month)::date and s.sale_date < (date_trunc('month', p_month) + interval '1 month')::date), 0),
    coalesce((select sum(s.total_cost) from public.sales_history s where s.is_cancelled = false and s.sale_date >= date_trunc('month', p_month)::date and s.sale_date < (date_trunc('month', p_month) + interval '1 month')::date), 0),
    coalesce((select sum(s.gross_profit) from public.sales_history s where s.is_cancelled = false and s.sale_date >= date_trunc('month', p_month)::date and s.sale_date < (date_trunc('month', p_month) + interval '1 month')::date), 0),
    coalesce((select sum(p.total_cost) from public.purchase_history p where p.purchase_date >= date_trunc('month', p_month)::date and p.purchase_date < (date_trunc('month', p_month) + interval '1 month')::date), 0),
    (select count(*) from public.sales_history s where s.is_cancelled = false and s.sale_date >= date_trunc('month', p_month)::date and s.sale_date < (date_trunc('month', p_month) + interval '1 month')::date),
    (select count(*) from public.purchase_history p where p.purchase_date >= date_trunc('month', p_month)::date and p.purchase_date < (date_trunc('month', p_month) + interval '1 month')::date);
$$;

-- Keep the existing grant for compatibility during the transition.
-- RPC execution should be narrowed after all callers are moved behind authenticated server-side boundaries.
grant execute on function public.get_dashboard_month_summary(date) to authenticated, anon;

commit;
