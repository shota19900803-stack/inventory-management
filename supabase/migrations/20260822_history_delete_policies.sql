-- Allow the browser-based inventory app to delete purchase/sales history.
-- RLS is not enabled/disabled here so existing table security is preserved.
-- If RLS is enabled, these permissive policies allow the app's current anon/authenticated
-- client to perform the delete operation used by the history management UI.

drop policy if exists "inventory app can delete purchase history" on public.purchase_history;
create policy "inventory app can delete purchase history"
on public.purchase_history
for delete
to anon, authenticated
using (true);

drop policy if exists "inventory app can delete sales history" on public.sales_history;
create policy "inventory app can delete sales history"
on public.sales_history
for delete
to anon, authenticated
using (true);
