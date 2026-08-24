-- 仕入・売上履歴の編集／削除用RPC

CREATE OR REPLACE FUNCTION public.update_purchase_history(
  p_purchase_id uuid,
  p_product_id uuid,
  p_purchase_date date,
  p_supplier text,
  p_unit_cost numeric,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_purchase public.purchase_history%rowtype;
  v_old_stock integer;
  v_new_stock integer;
  v_old_product_stock integer;
  v_new_product_stock integer;
BEGIN
  IF p_purchase_id IS NULL THEN RAISE EXCEPTION '仕入履歴を指定してください。'; END IF;
  IF p_product_id IS NULL THEN RAISE EXCEPTION '商品を指定してください。'; END IF;
  IF p_unit_cost < 0 THEN RAISE EXCEPTION '仕入単価は0以上で入力してください。'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION '数量は1以上で入力してください。'; END IF;

  SELECT * INTO v_purchase FROM public.purchase_history WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '指定された仕入履歴が見つかりません。'; END IF;

  PERFORM 1 FROM public.products
  WHERE id IN (v_purchase.product_id, p_product_id)
  ORDER BY id FOR UPDATE;

  SELECT COALESCE(stock_quantity, 0) INTO v_old_stock FROM public.products WHERE id = v_purchase.product_id;
  IF v_old_stock IS NULL THEN RAISE EXCEPTION '元の商品が見つかりません。'; END IF;

  IF v_purchase.product_id = p_product_id THEN
    v_new_stock := v_old_stock - v_purchase.quantity + p_quantity;
    IF v_new_stock < 0 THEN
      RAISE EXCEPTION 'この訂正をすると在庫がマイナスになります。現在庫: %, 元の仕入数量: %, 新しい仕入数量: %', v_old_stock, v_purchase.quantity, p_quantity;
    END IF;
    UPDATE public.products SET stock_quantity = v_new_stock, cost_price = p_unit_cost, updated_at = now() WHERE id = v_purchase.product_id;
  ELSE
    v_new_stock := v_old_stock - v_purchase.quantity;
    IF v_new_stock < 0 THEN RAISE EXCEPTION '元の商品を訂正すると在庫がマイナスになります。現在庫: %, 仕入数量: %', v_old_stock, v_purchase.quantity; END IF;
    SELECT COALESCE(stock_quantity, 0) INTO v_old_product_stock FROM public.products WHERE id = p_product_id;
    IF v_old_product_stock IS NULL THEN RAISE EXCEPTION '訂正先の商品が見つかりません。'; END IF;
    v_new_product_stock := v_old_product_stock + p_quantity;
    UPDATE public.products SET stock_quantity = v_new_stock, updated_at = now() WHERE id = v_purchase.product_id;
    UPDATE public.products SET stock_quantity = v_new_product_stock, cost_price = p_unit_cost, updated_at = now() WHERE id = p_product_id;
  END IF;

  UPDATE public.purchase_history SET
    product_id = p_product_id,
    purchase_date = p_purchase_date,
    supplier = NULLIF(TRIM(p_supplier), ''),
    unit_cost = p_unit_cost,
    quantity = p_quantity,
    total_cost = p_unit_cost * p_quantity,
    notes = NULLIF(TRIM(p_notes), '')
  WHERE id = p_purchase_id;

  DELETE FROM public.inventory_transactions WHERE reference_number = p_purchase_id::text AND transaction_type = 'purchase';
  INSERT INTO public.inventory_transactions (product_id, transaction_type, quantity, stock_before, stock_after, reason, reference_number)
  VALUES (
    p_product_id, 'purchase', p_quantity,
    CASE WHEN v_purchase.product_id = p_product_id THEN v_new_stock - p_quantity ELSE v_new_product_stock - p_quantity END,
    CASE WHEN v_purchase.product_id = p_product_id THEN v_new_stock ELSE v_new_product_stock END,
    '仕入訂正', p_purchase_id::text
  );

  RETURN json_build_object('success', true, 'purchase_id', p_purchase_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_purchase_history(p_purchase_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_purchase public.purchase_history%rowtype;
  v_current_stock integer;
  v_new_stock integer;
BEGIN
  IF p_purchase_id IS NULL THEN RAISE EXCEPTION '仕入履歴を指定してください。'; END IF;
  SELECT * INTO v_purchase FROM public.purchase_history WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '指定された仕入履歴が見つかりません。'; END IF;

  SELECT COALESCE(stock_quantity, 0) INTO v_current_stock FROM public.products WHERE id = v_purchase.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '対象の商品が見つかりません。'; END IF;
  v_new_stock := v_current_stock - v_purchase.quantity;
  IF v_new_stock < 0 THEN RAISE EXCEPTION 'この仕入を削除すると在庫がマイナスになります。現在庫: %, 削除数量: %', v_current_stock, v_purchase.quantity; END IF;

  UPDATE public.products SET stock_quantity = v_new_stock, updated_at = now() WHERE id = v_purchase.product_id;
  DELETE FROM public.inventory_transactions WHERE reference_number = p_purchase_id::text AND transaction_type = 'purchase';
  DELETE FROM public.purchase_history WHERE id = p_purchase_id;
  INSERT INTO public.inventory_transactions (product_id, transaction_type, quantity, stock_before, stock_after, reason, reference_number, is_cancelled)
  VALUES (v_purchase.product_id, 'purchase_delete', v_purchase.quantity, v_current_stock, v_new_stock, '仕入削除', p_purchase_id::text, false);

  RETURN json_build_object('success', true, 'purchase_id', p_purchase_id);
END;
$$;

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
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_sale public.sales_history%rowtype;
  v_old_stock integer;
  v_new_stock integer;
  v_target_stock integer;
  v_target_new_stock integer;
  v_order_number text;
  v_shipping numeric;
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

  IF v_order_number IS NOT NULL AND EXISTS (SELECT 1 FROM public.sales_history WHERE order_number = v_order_number AND id <> p_sale_id) THEN
    RETURN json_build_object('success', false, 'code', 'DUPLICATE_ORDER', 'message', 'この注文番号はすでに登録されています。');
  END IF;

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

  DELETE FROM public.inventory_transactions WHERE reference_number = COALESCE(NULLIF(TRIM(v_sale.order_number), ''), p_sale_id::text) AND transaction_type = 'sale';
  INSERT INTO public.inventory_transactions (product_id, transaction_type, quantity, stock_before, stock_after, reason, reference_number)
  VALUES (
    p_product_id, 'sale', p_quantity,
    CASE WHEN v_sale.product_id = p_product_id THEN v_new_stock + p_quantity ELSE v_target_stock END,
    CASE WHEN v_sale.product_id = p_product_id THEN v_new_stock ELSE v_target_new_stock END,
    '売上訂正', COALESCE(v_order_number, p_sale_id::text)
  );

  RETURN json_build_object('success', true, 'sale_id', p_sale_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_purchase_history(uuid,uuid,date,text,numeric,integer,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_history(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_sale_history(uuid,uuid,date,text,text,numeric,numeric,integer,text,numeric) TO anon, authenticated;
