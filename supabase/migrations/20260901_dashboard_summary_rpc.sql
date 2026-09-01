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

grant execute on function public.get_dashboard_month_summary(date) to authenticated, anon;
