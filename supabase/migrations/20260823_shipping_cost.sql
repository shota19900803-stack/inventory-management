-- 売上送料・送料込み実質粗利
-- Supabase SQL Editor または supabase db push で1回だけ適用してください。

alter table if exists public.sales_history
  add column if not exists shipping_cost numeric not null default 0;

alter table if exists public.sales_history
  drop constraint if exists sales_history_shipping_cost_check;

alter table if exists public.sales_history
  add constraint sales_history_shipping_cost_check
  check (shipping_cost >= 0);

-- 売上登録時・送料変更時に、送料込みの実質粗利を自動計算する。
create or replace function public.recalculate_sales_gross_profit()
returns trigger
language plpgsql
as $$
begin
  new.gross_profit :=
    coalesce(new.total_sales, 0)
    - coalesce(new.total_cost, 0)
    - coalesce(new.shipping_cost, 0);
  return new;
end;
$$;

drop trigger if exists sales_history_recalculate_gross_profit
  on public.sales_history;

create trigger sales_history_recalculate_gross_profit
before insert or update of total_sales, total_cost, shipping_cost
on public.sales_history
for each row
execute function public.recalculate_sales_gross_profit();

-- 画面側からRLSを直接回避せず、安全に送料だけ更新できるRPC。
create or replace function public.set_sale_shipping_cost(
  p_sale_id uuid,
  p_shipping_cost numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sale_id is null then
    return jsonb_build_object(
      'success', false,
      'message', '売上IDがありません。'
    );
  end if;

  if coalesce(p_shipping_cost, 0) < 0 then
    return jsonb_build_object(
      'success', false,
      'message', '送料は0円以上で入力してください。'
    );
  end if;

  update public.sales_history
  set shipping_cost = coalesce(p_shipping_cost, 0)
  where id = p_sale_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'message', '売上履歴が見つかりません。'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'shipping_cost', coalesce(p_shipping_cost, 0)
  );
end;
$$;

grant execute on function public.set_sale_shipping_cost(uuid, numeric)
to anon, authenticated;

-- 既存データも送料0円として明示的に実質粗利を再計算。
update public.sales_history
set gross_profit =
  coalesce(total_sales, 0)
  - coalesce(total_cost, 0)
  - coalesce(shipping_cost, 0);
