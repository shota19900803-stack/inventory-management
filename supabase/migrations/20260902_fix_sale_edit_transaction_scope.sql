CREATE OR REPLACE FUNCTION public.update_sale_history(
  p_sale_id uuid,
  p_product_id uuid,
  p_sale_date date,
  p_sales_channel text,
  p_order_number text,
  p_unit_price numeric,
  p_unit_cost numeric,
  p_quantity integer,
  p_notes text DEFAULT NULL,
  p_shipping_cost numeric DEFAULT 0
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS $$
DECLARE
  v_sale public.sales_history%rowtype;
  v_old_stock integer;
  v_new_stock integer;
  v_target_stock integer;
  v_target_new_stock integer;
  v_order_number text;
  v_shipping numeric;
  v_old_tx public.inventory_transactions%rowtype;
BEGIN
  IF p_sale_id IS NULL THEN RAISE EXCEPTION '売上履歴を指定してください。'; END IF;
  IF p_product_id IS NULL THEN RAISE EXCEPTION '商品を指定してください。'; END IF;
  IF p_unit_price < 0 OR p_unit_cost < 0 THEN RAISE EXCEPTION '販売価格・原価は0以上で入力してください。'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION '数量は1以上で入力してください。'; END IF;
  v_order_number := NULLIF(TRIM(p_order_number), '');
  v_shipping := COALESCE(p_shipping_cost, 0);
  IF v_shipping < 0 THEN RAISE EXCEPTION '送料は0円以上で入力してください。'; END IF;

  SELECT * INTO v_sale FROM public.sales_history WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '指定された売上履歴が見つかりません。'; END IF;
  IF v_sale.is_cancelled THEN RAISE EXCEPTION '取消済みの売上は編集できません。'; END IF;

  -- 同一注文の複数商品行を許可する。注文番号だけを一意キーとして扱わない。
  PERFORM 1 FROM public.products WHERE id IN (v_sale.product_id, p_product_id) ORDER BY id FOR UPDATE;
  SELECT COALESCE(stock_quantity, 0) INTO v_old_stock FROM public.products WHERE id = v_sale.product_id;
  IF v_old_stock IS NULL THEN RAISE EXCEPTION '元の商品が見つかりません。'; END IF;

  IF v_sale.product_id = p_product_id THEN
    v_new_stock := v_old_stock + v_sale.quantity - p_quantity;
    IF v_new_stock < 0 THEN RAISE EXCEPTION 'この訂正をすると在庫が不足します。現在庫: %, 元の販売数量: %, 新しい販売数量: %', v_old_stock, v_sale.quantity, p_quantity; END IF;
    UPDATE public.products SET stock_quantity = v_new_stock, updated_at = now() WHERE id = v_sale.product_id;
  ELSE
    v_new_stock := v_old_stock + v_sale.quantity;
    SELECT COALESCE(stock_quantity, 0) INTO v_target_stock FROM public.products WHERE id = p_product_id;
    IF v_target_stock IS NULL THEN RAISE EXCEPTION '訂正先の商品が見つかりません。'; END IF;
    v_target_new_stock := v_target_stock - p_quantity;
    IF v_target_new_stock < 0 THEN RAISE EXCEPTION '訂正先商品の在庫が不足しています。現在庫: %, 販売数量: %', v_target_stock, p_quantity; END IF;
    UPDATE public.products SET stock_quantity = v_new_stock, updated_at = now() WHERE id = v_sale.product_id;
    UPDATE public.products SET stock_quantity = v_target_new_stock, updated_at = now() WHERE id = p_product_id;
  END IF;

  UPDATE public.sales_history SET
    product_id = p_product_id,
    sale_date = p_sale_date,
    sales_channel = NULLIF(TRIM(p_sales_channel), ''),
    order_number = v_order_number,
    unit_price = p_unit_price,
    unit_cost = p_unit_cost,
    quantity = p_quantity,
    total_sales = p_unit_price * p_quantity,
    total_cost = p_unit_cost * p_quantity,
    gross_profit = ((p_unit_price - p_unit_cost) * p_quantity) - v_shipping,
    shipping_cost = v_shipping,
    notes = NULLIF(TRIM(p_notes), '')
  WHERE id = p_sale_id;

  -- 注文番号だけで全件削除せず、旧商品の該当する1件だけを更新する。
  IF v_sale.order_number IS NOT NULL AND NULLIF(TRIM(v_sale.order_number), '') IS NOT NULL THEN
    SELECT * INTO v_old_tx
    FROM public.inventory_transactions it
    WHERE it.transaction_type = 'sale'
      AND it.reference_number = NULLIF(TRIM(v_sale.order_number), '')
      AND it.product_id = v_sale.product_id
      AND it.quantity = v_sale.quantity
      AND COALESCE(it.is_cancelled, false) = false
    ORDER BY it.created_at DESC, it.id DESC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT * INTO v_old_tx
    FROM public.inventory_transactions it
    WHERE it.transaction_type = 'sale'
      AND it.product_id = v_sale.product_id
      AND it.reference_number IS NULL
      AND it.quantity = v_sale.quantity
      AND COALESCE(it.is_cancelled, false) = false
    ORDER BY it.created_at DESC, it.id DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF FOUND THEN
    UPDATE public.inventory_transactions
    SET product_id = p_product_id,
        quantity = p_quantity,
        stock_before = CASE WHEN v_sale.product_id = p_product_id THEN v_new_stock + p_quantity ELSE v_target_stock END,
        stock_after = CASE WHEN v_sale.product_id = p_product_id THEN v_new_stock ELSE v_target_new_stock END,
        reason = '売上訂正',
        reference_number = v_order_number,
        created_at = now()
    WHERE id = v_old_tx.id;
  ELSE
    INSERT INTO public.inventory_transactions
      (product_id, transaction_type, quantity, stock_before, stock_after, reason, reference_number)
    VALUES (
      p_product_id, 'sale', p_quantity,
      CASE WHEN v_sale.product_id = p_product_id THEN v_new_stock + p_quantity ELSE v_target_stock END,
      CASE WHEN v_sale.product_id = p_product_id THEN v_new_stock ELSE v_target_new_stock END,
      '売上訂正', v_order_number
    );
  END IF;

  RETURN json_build_object('success', true, 'sale_id', p_sale_id);
END;
$$;
