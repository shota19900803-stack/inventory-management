-- Performance indexes for the current inventory and sales workload.
-- Keep existing single-column indexes; these composites target the actual
-- product/date/order access patterns used by FIFO and history screens.

create index if not exists purchase_history_product_date_created_idx
  on public.purchase_history (product_id, purchase_date asc, created_at asc, id asc);

create index if not exists sales_history_product_date_created_active_idx
  on public.sales_history (product_id, sale_date asc, created_at asc, id asc)
  where is_cancelled = false;

create index if not exists sales_history_date_created_active_idx
  on public.sales_history (sale_date desc, created_at desc)
  where is_cancelled = false;

create index if not exists inventory_transactions_product_created_idx
  on public.inventory_transactions (product_id, created_at desc);

create index if not exists import_history_created_by_idx
  on public.import_history (created_by);

create index if not exists inventory_transactions_created_by_idx
  on public.inventory_transactions (created_by);
