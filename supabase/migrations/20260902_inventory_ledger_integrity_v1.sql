-- Inventory ledger integrity helpers.
-- Read-only diagnostics first; no existing stock values are changed.

begin;

create or replace function public.check_inventory_ledger_integrity()
returns table (
  product_id uuid,
  issue_type text,
  transaction_id uuid,
  expected_stock integer,
  actual_stock integer,
  detail text
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with ordered as (
    select
      it.*,
      lag(it.stock_after) over (
        partition by it.product_id
        order by it.created_at, it.id
      ) as previous_stock_after
    from public.inventory_transactions it
    where coalesce(it.is_cancelled, false) = false
  ),
  signed as (
    select
      o.*,
      case o.transaction_type
        when 'purchase' then o.quantity
        when 'sale' then -o.quantity
        when 'adjustment' then o.quantity
        when 'return' then o.quantity
        when 'transfer_in' then o.quantity
        when 'transfer_out' then -o.quantity
        when 'sale_cancel' then o.quantity
        else 0
      end as signed_quantity
    from ordered o
  )
  select
    s.product_id,
    'stock_transition'::text,
    s.id,
    s.stock_before + s.signed_quantity,
    s.stock_after,
    format('transaction_type=%s, quantity=%s, stock_before=%s', s.transaction_type, s.quantity, s.stock_before)
  from signed s
  where s.stock_after <> s.stock_before + s.signed_quantity

  union all

  select
    s.product_id,
    'chain_break'::text,
    s.id,
    s.previous_stock_after,
    s.stock_before,
    'stock_before does not match the previous ledger stock_after'
  from signed s
  where s.previous_stock_after is not null
    and s.stock_before <> s.previous_stock_after

  order by product_id, transaction_id;
$$;

revoke all on function public.check_inventory_ledger_integrity() from public;
grant execute on function public.check_inventory_ledger_integrity() to authenticated;

commit;
