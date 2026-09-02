-- Security hardening v1
-- The first production-safe step hardens SECURITY DEFINER search_path without
-- revoking existing RPC grants. Grant removal is intentionally deferred until
-- all browser callers are migrated behind an authenticated/server boundary.

begin;

alter function public.add_shipping_material_purchase(uuid,numeric,text) set search_path = public, pg_catalog;
alter function public.add_shipping_wallet_charge(uuid,numeric,text) set search_path = public, pg_catalog;
alter function public.adjust_inventory(uuid,integer,text) set search_path = public, pg_catalog;
alter function public.cancel_sale(uuid,text) set search_path = public, pg_catalog;
alter function public.delete_purchase_history(uuid) set search_path = public, pg_catalog;
alter function public.finalize_stocktake(jsonb) set search_path = public, pg_catalog;
alter function public.register_purchase(uuid,date,text,numeric,integer,text) set search_path = public, pg_catalog;
alter function public.register_sale(uuid,date,text,text,numeric,numeric,integer,text,numeric) set search_path = public, pg_catalog;
alter function public.register_sales_order(date,text,text,numeric,text,jsonb) set search_path = public, pg_catalog;
alter function public.set_sale_shipping_cost(uuid,numeric) set search_path = public, pg_catalog;
alter function public.sync_yamato_shipping_wallet(uuid,text,text,text,numeric,numeric) set search_path = public, pg_catalog;
alter function public.update_purchase_history(uuid,uuid,date,text,numeric,integer,text) set search_path = public, pg_catalog;
alter function public.update_sale_history(uuid,uuid,date,text,text,numeric,numeric,integer,text,numeric) set search_path = public, pg_catalog;

commit;
