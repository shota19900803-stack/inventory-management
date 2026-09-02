-- Read-only inventory reconciliation helpers.
-- Does not modify stock. Use this before changing inventory mutation semantics.

create or replace function public.get_inventory_reconciliation(p_product_id uuid default null)
returns table (
  product_id uuid,
  product_name text,
  recorded_stock numeric,
  ledger_stock numeric,
  difference numeric
)
language sql
stable
set search_path = public, pg_catalog
as $$
  with ledger as (
    select
      it.product_id,
      coalesce(sum(it.quantity), 0) as ledger_stock
    from public.inventory_transactions it
    where p_product_id is null or it.product_id = p_product_id
    group by it.product_id
  )
  select
    p.id,
    p.name,
    coalesce(p.stock_quantity, 0)::numeric,
    coalesce(l.ledger_stock, 0)::numeric,
    (coalesce(p.stock_quantity, 0) - coalesce(l.ledger_stock, 0))::numeric
  from public.products p
  left join ledger l on l.product_id = p.id
  where p_product_id is null or p.id = p_product_id
  order by abs(coalesce(p.stock_quantity, 0) - coalesce(l.ledger_stock, 0)) desc, p.name;
$$;

comment on function public.get_inventory_reconciliation(uuid) is 'Read-only comparison of products.stock_quantity and inventory_transactions totals.';
