-- 棚卸し機能
-- Supabase SQL Editorで1回だけ実行してください。

create table if not exists public.stocktake_history (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  stock_before integer not null,
  stock_counted integer not null check (stock_counted >= 0),
  difference integer not null,
  created_at timestamptz not null default now()
);

create index if not exists stocktake_history_session_id_idx
  on public.stocktake_history(session_id);

create index if not exists stocktake_history_product_id_idx
  on public.stocktake_history(product_id);

alter table public.stocktake_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'stocktake_history'
      and policyname = 'stocktake_history_select'
  ) then
    create policy stocktake_history_select
      on public.stocktake_history
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

create or replace function public.finalize_stocktake(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid := gen_random_uuid();
  v_item jsonb;
  v_product_id uuid;
  v_counted integer;
  v_before integer;
  v_difference integer;
  v_updated integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('success', false, 'message', '棚卸し対象がありません。');
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_counted := (v_item->>'counted_stock')::integer;

    if v_counted is null or v_counted < 0 then
      raise exception '棚卸し数量が不正です。';
    end if;

    select stock_quantity
      into v_before
      from public.products
      where id = v_product_id
      for update;

    if not found then
      raise exception '商品が見つかりません。';
    end if;

    v_before := coalesce(v_before, 0);
    v_difference := v_counted - v_before;

    insert into public.stocktake_history (
      session_id,
      product_id,
      stock_before,
      stock_counted,
      difference
    ) values (
      v_session_id,
      v_product_id,
      v_before,
      v_counted,
      v_difference
    );

    update public.products
      set stock_quantity = v_counted
      where id = v_product_id;

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'updated_count', v_updated
  );
exception
  when others then
    raise;
end;
$$;

grant execute on function public.finalize_stocktake(jsonb) to anon, authenticated;
