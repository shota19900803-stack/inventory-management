const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let source = fs.readFileSync(file, 'utf8');

let changed = false;

const broken = '?? sale.sales_channel || "—")';
const fixed = '?? (sale.sales_channel || "—"))';

if (source.includes(broken)) {
  source = source.replace(broken, fixed);
  changed = true;
  console.log('Repaired Dashboard.tsx sales-channel fallback syntax.');
}

const oldColgroup = `<colgroup>
          <col style={{ width: 95 }} />
          <col style={{ width: 280 }} />
          <col style={{ width: 95 }} />
          <col style={{ width: 220 }} />
          <col style={{ width: 65 }} />
          <col style={{ width: 115 }} />
          <col style={{ width: 135 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 115 }} />
          <col style={{ width: 150 }} />
        </colgroup>`;

const newColgroup = `<colgroup>
          <col style={{ width: "10%" }} />
          <col style={{ width: "42%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "13%" }} />
        </colgroup>`;

if (source.includes(oldColgroup)) {
  source = source.replace(oldColgroup, newColgroup);
  changed = true;
  console.log('Normalized Dashboard.tsx recent-sales table to 6 columns.');
}

const oldPercentColgroup = `<colgroup>
          <col style={{ width: "10%" }} />
          <col style={{ width: "1%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "15%" }} />
        </colgroup>`;
if (source.includes(oldPercentColgroup)) {
  source = source.replace(oldPercentColgroup, newColgroup);
  changed = true;
  console.log('Corrected recent-sales column proportions.');
}

const oldProductCell = `<td style={{ padding: 10 }}>
                            {productMap[sale.product_id]
                              ?.name ?? "商品不明"}
                          </td>`;

const newProductCell = `<td
                            style={{
                              padding: 10,
                              minWidth: 0,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 14,
                                lineHeight: 1.45,
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 2,
                                overflow: "hidden",
                                wordBreak: "break-word",
                              }}
                            >
                              {productMap[sale.product_id]
                                ?.name ?? "商品不明"}
                            </div>
                          </td>`;

if (source.includes(oldProductCell)) {
  source = source.replace(oldProductCell, newProductCell);
  changed = true;
  console.log('Limited recent-sales product names to 2 lines.');
}

const oldTableWidth = `width: "100%",
                      minWidth: 1340,
          tableLayout: "fixed",`;
const newTableWidth = `width: "100%",
                      minWidth: 0,
                      tableLayout: "fixed",`;

if (source.includes(oldTableWidth)) {
  source = source.replace(oldTableWidth, newTableWidth);
  changed = true;
  console.log('Removed oversized min-width from recent-sales table.');
}

const historyStateMarker = `  const [historyProductId, setHistoryProductId] = useState("");`;
const historyStateReplacement = `${historyStateMarker}

  const historyPurchases = useMemo(
    () => historyProductId
      ? purchases.filter((purchase) => purchase.product_id === historyProductId)
      : [],
    [historyProductId, purchases]
  );

  const historySales = useMemo(
    () => historyProductId
      ? sales.filter((sale) => sale.product_id === historyProductId)
      : [],
    [historyProductId, sales]
  );`;

if (source.includes(historyStateMarker) && !source.includes('const historyPurchases = useMemo(')) {
  source = source.replace(historyStateMarker, historyStateReplacement);
  changed = true;
  console.log('Added product-specific purchase and sales history selectors.');
}

const historyScrollEffect = `
  useEffect(() => {
    if (!historyProductId) return;

    const timer = window.setTimeout(() => {
      document.getElementById("product-history-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);

    return () => window.clearTimeout(timer);
  }, [historyProductId]);
`;

if (!source.includes('document.getElementById("product-history-panel")')) {
  const insertBefore = `  const [editingProductId, setEditingProductId] =`;
  if (source.includes(insertBefore)) {
    source = source.replace(insertBefore, historyScrollEffect + `\n` + insertBefore);
    changed = true;
    console.log('Added auto-scroll to product history panel.');
  }
}

const historySectionMarker = `{historyProductId && (\n              <section style={cardStyle}>`;
const historySectionReplacement = `{historyProductId && (\n              <section id="product-history-panel" style={cardStyle}>`;
if (source.includes(historySectionMarker) && !source.includes('id="product-history-panel"')) {
  source = source.replace(historySectionMarker, historySectionReplacement);
  changed = true;
  console.log('Added product history panel anchor.');
}

const purchaseEmptyOld = `{purchases.length ===\n0 ? (`;
const purchaseEmptyNew = `{historyPurchases.length === 0 ? (`;
if (source.includes(purchaseEmptyOld)) {
  source = source.replace(purchaseEmptyOld, purchaseEmptyNew);
  changed = true;
  console.log('Filtered product history empty state for purchases.');
}

const purchaseMapOld = `{purchases.map(`;
const purchaseMapNew = `{historyPurchases.map(`;
if (source.includes(purchaseMapOld)) {
  source = source.replace(purchaseMapOld, purchaseMapNew);
  changed = true;
  console.log('Filtered product purchase history by product ID.');
}

const salesEmptyOld = `{sales.length === 0 ? (`;
const salesEmptyNew = `{historySales.length === 0 ? (`;
if (source.includes(salesEmptyOld)) {
  source = source.replace(salesEmptyOld, salesEmptyNew);
  changed = true;
  console.log('Filtered product history empty state for sales.');
}

const salesMapOld = `{sales.map(`;
const salesMapNew = `{historySales.map(`;
if (source.includes(salesMapOld)) {
  source = source.replace(salesMapOld, salesMapNew);
  changed = true;
  console.log('Filtered product sales history by product ID.');
}

// 在庫金額の総額をトップヘッダーで確認できるようにする。
const totalStockMarker = `  const totalStock = products.reduce(\n    (sum, product) =>\n      sum + Number(product.stock_quantity || 0),\n    0\n  );`;
const totalStockReplacement = `${totalStockMarker}

  const totalInventoryCost = products.reduce(
    (sum, product) => sum + Number(inventoryCostByProduct[product.id] ?? 0),
    0
  );`;
if (source.includes(totalStockMarker) && !source.includes('const totalInventoryCost = products.reduce(')) {
  source = source.replace(totalStockMarker, totalStockReplacement);
  changed = true;
  console.log('Added total inventory cost calculation.');
}

// 仕入・売上フォームで選択商品の在庫と原価をリアルタイム表示するための計算値。
const formStateMarker = `  const [selectedMonth, setSelectedMonth] =`;
const formStateReplacement = `  const selectedPurchaseProduct = useMemo(
    () => products.find((product) => product.id === purchaseForm.product_id) ?? null,
    [products, purchaseForm.product_id]
  );

  const purchaseCurrentStock = Number(selectedPurchaseProduct?.stock_quantity ?? 0);
  const purchaseOriginalQuantity = editingPurchaseId
    ? Number(purchases.find((purchase) => purchase.id === editingPurchaseId)?.quantity ?? 0)
    : 0;
  const purchaseNewStock = purchaseCurrentStock + Number(purchaseForm.quantity || 0) - purchaseOriginalQuantity;

  const selectedSaleProduct = useMemo(
    () => products.find((product) => product.id === saleForm.product_id) ?? null,
    [products, saleForm.product_id]
  );

  const saleCurrentStock = Number(selectedSaleProduct?.stock_quantity ?? 0);
  const saleOriginalQuantity = editingSaleId
    ? Number(sales.find((sale) => sale.id === editingSaleId)?.quantity ?? 0)
    : 0;
  const saleRemainingStock = saleCurrentStock + saleOriginalQuantity - Number(saleForm.quantity || 0);

${formStateMarker}`;
if (source.includes(formStateMarker) && !source.includes('const selectedPurchaseProduct = useMemo(')) {
  source = source.replace(formStateMarker, formStateReplacement);
  changed = true;
  console.log('Added purchase/sale stock preview calculations.');
}

// 仕入単価を編集した後もproducts.cost_priceを最新の仕入単価へ同期する。
// これにより売上登録画面の初期原価が古いまま残らない。
const purchaseUpdateMarker = `      const { error: se } = await supabase.from("products").update({ stock_quantity: currentStock + delta }).eq("id", original.product_id);`;
const purchaseUpdateReplacement = `      const { error: se } = await supabase.from("products").update({ stock_quantity: currentStock + delta }).eq("id", original.product_id);`;
if (source.includes(purchaseUpdateMarker) && !source.includes('const { data: latestPurchaseCost } = await supabase.from("purchase_history")')) {
  source = source.replace(purchaseUpdateMarker, `${purchaseUpdateReplacement}
      if (se) throw se;

      const { data: latestPurchaseCost, error: latestPurchaseCostError } = await supabase
        .from("purchase_history")
        .select("unit_cost")
        .eq("product_id", original.product_id)
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestPurchaseCostError) throw latestPurchaseCostError;
      const { error: costSyncError } = await supabase
        .from("products")
        .update({ cost_price: Number(latestPurchaseCost?.unit_cost ?? 0) })
        .eq("id", original.product_id);
      if (costSyncError) throw costSyncError;`);
  // The original line already had an immediately following `if (se) throw se;`.
  source = source.replace(`${purchaseUpdateReplacement}\n      if (se) throw se;\n      if (se) throw se;`, `${purchaseUpdateReplacement}\n      if (se) throw se;`);
  changed = true;
  console.log('Synced products.cost_price after purchase edit.');
}

// 仕入削除後も、残っている最新仕入単価をproducts.cost_priceへ同期する。
const deleteStockMarker = `    const { error: se } = await supabase.from("products").update({ stock_quantity: currentStock - Number(purchase.quantity) }).eq("id", purchase.product_id);`;
if (source.includes(deleteStockMarker) && !source.includes('const { data: latestPurchaseCostAfterDelete }')) {
  source = source.replace(deleteStockMarker, `${deleteStockMarker}
    if (se) throw se;
    const { data: latestPurchaseCostAfterDelete, error: latestPurchaseCostAfterDeleteError } = await supabase
      .from("purchase_history")
      .select("unit_cost")
      .eq("product_id", purchase.product_id)
      .order("purchase_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestPurchaseCostAfterDeleteError) throw latestPurchaseCostAfterDeleteError;
    const { error: costSyncAfterDeleteError } = await supabase
      .from("products")
      .update({ cost_price: Number(latestPurchaseCostAfterDelete?.unit_cost ?? 0) })
      .eq("id", purchase.product_id);
    if (costSyncAfterDeleteError) throw costSyncAfterDeleteError;`);
  source = source.replace(`${deleteStockMarker}\n    if (se) throw se;\n    if (se) throw se;`, `${deleteStockMarker}\n    if (se) throw se;`);
  changed = true;
  console.log('Synced products.cost_price after purchase delete.');
}

// 仕入登録画面に「現在庫」「登録後在庫」「登録原価」を表示。
const purchaseSummaryMarker = `                <div\n                  style={{\n                    marginTop: 15,\n                    fontSize: 18,\n                    fontWeight: 700,\n                  }}\n                >\n                  仕入合計`;
const purchaseSummaryReplacement = `                <div
                  style={{
                    marginTop: 15,
                    padding: "14px 16px",
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                  }}
                >
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
                    <strong>現在庫 {purchaseCurrentStock.toLocaleString()}個</strong>
                    <span style={{ color: "#6b7280" }}>→</span>
                    <strong style={{ color: purchaseNewStock < 0 ? "#dc2626" : "#15803d" }}>
                      登録後 {purchaseNewStock.toLocaleString()}個
                    </strong>
                    <span style={{ color: "#6b7280" }}>
                      現在の登録原価 {yen(selectedPurchaseProduct?.cost_price ?? 0)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 15,
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  仕入合計`;
if (source.includes(purchaseSummaryMarker) && !source.includes('登録後 {purchaseNewStock.toLocaleString()}個')) {
  source = source.replace(purchaseSummaryMarker, purchaseSummaryReplacement);
  changed = true;
  console.log('Added purchase stock/cost preview panel.');
}

// 売上登録画面に「現在庫」「販売後残数」を表示。編集時は元の売上数量を戻してから再計算。
const saleSummaryMarker = `                <div\n                  style={{\n                    display: "flex",\n                    gap: 30,`;
const saleSummaryReplacement = `                <div
                  style={{
                    marginTop: 20,
                    padding: "16px",
                    background: saleRemainingStock < 0 ? "#fef2f2" : saleRemainingStock <= 1 ? "#fff7ed" : "#f0fdf4",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>在庫確認</div>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
                    <strong style={{ fontSize: 20 }}>現在庫 {saleCurrentStock.toLocaleString()}個</strong>
                    <span style={{ color: "#6b7280" }}>− 販売 {Number(saleForm.quantity || 0).toLocaleString()}個 →</span>
                    <strong style={{ fontSize: 24, color: saleRemainingStock < 0 ? "#dc2626" : saleRemainingStock <= 1 ? "#d97706" : "#15803d" }}>
                      残り {saleRemainingStock.toLocaleString()}個
                    </strong>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
                    原価 {yen(selectedSaleProduct?.cost_price ?? saleForm.unit_cost ?? 0)} ／ 販売後の在庫を確認してから登録できます。
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 30,`;
if (source.includes(saleSummaryMarker) && !source.includes('在庫確認')) {
  source = source.replace(saleSummaryMarker, saleSummaryReplacement);
  changed = true;
  console.log('Added sale remaining-stock preview panel.');
}

// 商品選択時は、最新のproducts.cost_priceを原価欄へ反映する。
const saleSelectOld = `unit_cost: product?.cost_price != null ? String(product.cost_price) : saleForm.unit_cost,`;
const saleSelectNew = `unit_cost: product?.cost_price != null ? String(product.cost_price) : saleForm.unit_cost,`;
// Keep this explicit marker for idempotency; the current assignment is already correct.
if (source.includes(saleSelectOld) && !source.includes('// latest products.cost_price is used for new sales')) {
  source = source.replace(saleSelectOld, `${saleSelectNew}\n                          // latest products.cost_price is used for new sales`);
  changed = true;
  console.log('Documented sale cost source.');
}

// トップヘッダーへ在庫金額を追加。
const headerStockMarker = `              在庫数 <strong>{totalStock}</strong>\n            </div>`;
const headerStockReplacement = `              在庫数 <strong>{totalStock}</strong>
            </div>

            <div
              style={{
                background: "#fff",
                padding: "12px 18px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
              }}
            >
              在庫金額 <strong>{yen(totalInventoryCost)}</strong>
            </div>`;
if (source.includes(headerStockMarker) && !source.includes('在庫金額 <strong>{yen(totalInventoryCost)}</strong>')) {
  source = source.replace(headerStockMarker, headerStockReplacement);
  changed = true;
  console.log('Added total inventory cost to dashboard header.');
}

if (changed) {
  fs.writeFileSync(file, source, 'utf8');
} else {
  console.log('Dashboard.tsx repairs are already applied.');
}
