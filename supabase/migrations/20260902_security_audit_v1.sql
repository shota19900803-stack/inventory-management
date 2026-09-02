-- Security audit v1
-- Read-only diagnostic queries. Run in Supabase SQL Editor before changing RPC grants.

-- 1) Functions that use SECURITY DEFINER and their current execute grants.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;

-- 2) Functions whose search_path is not explicitly pinned.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.prosecdef = true
    or p.proconfig is null
    or not exists (
      select 1
      from unnest(p.proconfig) cfg
      where cfg like 'search_path=%'
    )
  )
order by p.proname;

-- 3) Inventory ledger sanity check.
select
  count(*) as transaction_count,
  count(*) filter (where quantity is null) as null_quantity_count
from public.inventory_transactions;

-- 4) Current stock snapshot.
select
  count(*) as product_count,
  coalesce(sum(stock_quantity), 0) as total_stock_units,
  coalesce(sum(stock_quantity * coalesce(cost_price, 0)), 0) as estimated_stock_cost
from public.products;
