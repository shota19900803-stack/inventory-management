const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const join = (lines) => lines.join("\n");

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
if (!text.includes("const [editingPurchaseId")) {
  const marker = join([
    "  const [saleForm, setSaleForm] =",
    "    useState(initialSaleForm);",
  ]);
  const addition = join([
    marker,
    "",
    "  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);",
    "  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);",
  ]);
  if (!text.includes(marker)) throw new Error("saleForm state marker not found");
  text = text.replace(marker, addition);
}

// ------------------------------------------------------------
// Edit/delete helpers
// ------------------------------------------------------------
if (!text.includes("async function editPurchaseRecord")) {
  const marker = "async function savePurchase(\n  event: React.FormEvent\n) {";
  const addition = join([
    "  function editPurchaseRecord(purchase: Purchase) {",
    "    setEditingPurchaseId(purchase.id);",
    "    setPurchaseForm({",
    "      product_id: purchase.product_id,",
    "      purchase_date: purchase.purchase_date,",
    "      supplier: purchase.supplier ?? \"\",",
    "      unit_cost: String(purchase.unit_cost ?? 0),",
    "      quantity: String(purchase.quantity ?? 1),",
    "      notes: purchase.notes ?? \"\",",
    "    });",
    "    setTab(\"purchases\");",
    "    window.scrollTo({ top: 0, behavior: \"smooth\" });",
    "  }",
    "",
    "  function editSaleRecord(sale: Sale) {",
    "    setEditingSaleId(sale.id);",
    "    setSaleForm({",
    "      product_id: sale.product_id,",
    "      sale_date: sale.sale_date,",
    "      sales_channel: sale.sales_channel ?? \"その他\",",
    "      order_number: sale.order_number ?? \"\",",
    "      unit_price: String(sale.unit_price ?? 0),",
    "      unit_cost: String(sale.unit_cost ?? 0),",
    "      quantity: String(sale.quantity ?? 1),",
    "      notes: sale.notes ?? \"\",",
    "    });",
    "    setTab(\"sales\");",
    "    window.scrollTo({ top: 0, behavior: \"smooth\" });",
    "  }",
    "",
    "  function cancelHistoryEdit() {",
    "    setEditingPurchaseId(null);",
    "    setEditingSaleId(null);",
    "    setPurchaseForm(initialPurchaseForm);",
    "    setSaleForm(initialSaleForm);",
    "  }",
    "",
    "  async function deletePurchaseRecord(purchase: Purchase) {",
    "    if (!window.confirm(`この仕入履歴を削除しますか？\\n\\n数量：${purchase.quantity}個\\n仕入金額：${yen(purchase.total_cost)}`)) return;",
    "    setSaving(true);",
    "    setMessage(\"\");",
    "    try {",
    "      const product = products.find((item) => item.id === purchase.product_id);",
    "      const currentStock = Number(product?.stock_quantity || 0);",
    "      const nextStock = currentStock - Number(purchase.quantity || 0);",
    "      if (nextStock < 0) {",
    "        setMessage(`仕入削除後の在庫がマイナスになるため削除できません。現在庫：${currentStock}個`);",
    "        return;",
    "      }",
    "      const stockResult = await supabase.from(\"products\").update({ stock_quantity: nextStock }).eq(\"id\", purchase.product_id);",
    "      if (stockResult.error) { setMessage(`在庫更新エラー：${stockResult.error.message}`); return; }",
    "      const result = await supabase.from(\"purchase_history\").delete().eq(\"id\", purchase.id);",
    "      if (result.error) {",
    "        await supabase.from(\"products\").update({ stock_quantity: currentStock }).eq(\"id\", purchase.product_id);",
    "        setMessage(`仕入削除エラー：${result.error.message}`);",
    "        return;",
    "      }",
    "      setMessage(\"仕入履歴を削除しました。在庫も調整しました。\");",
    "      await loadAll();",
    "    } finally {",
    "      setSaving(false);",
    "    }",
    "  }",
    "",
    "  async function deleteSaleRecord(sale: Sale) {",
    "    if (!window.confirm(`この売上履歴を削除しますか？\\n\\n数量：${sale.quantity}個\\n売上：${yen(sale.total_sales)}`)) return;",
    "    setSaving(true);",
    "    setMessage(\"\");",
    "    try {",
    "      const product = products.find((item) => item.id === sale.product_id);",
    "      const currentStock = Number(product?.stock_quantity || 0);",
    "      const nextStock = currentStock + Number(sale.quantity || 0);",
    "      const stockResult = await supabase.from(\"products\").update({ stock_quantity: nextStock }).eq(\"id\", sale.product_id);",
    "      if (stockResult.error) { setMessage(`在庫更新エラー：${stockResult.error.message}`); return; }",
    "      const result = await supabase.from(\"sales_history\").delete().eq(\"id\", sale.id);",
    "      if (result.error) {",
    "        await supabase.from(\"products\").update({ stock_quantity: currentStock }).eq(\"id\", sale.product_id);",
    "        setMessage(`売上削除エラー：${result.error.message}`);",
    "        return;",
    "      }",
    "      setMessage(\"売上履歴を削除しました。在庫も戻しました。\");",
    "      await loadAll();",
    "    } finally {",
    "      setSaving(false);",
    "    }",
    "  }",
    "",
    marker,
  ]);
  if (!text.includes(marker)) throw new Error("savePurchase marker not found");
  text = text.replace(marker, addition);
}

// ------------------------------------------------------------
// Purchase edit branch inside savePurchase
// ------------------------------------------------------------
if (!text.includes("仕入編集：")) {
  const marker = join([
    "  setSaving(true);",
    "  setMessage(\"\");",
    "",
    "  try {",
  ]);
  const addition = join([
    "  setSaving(true);",
    "  setMessage(\"\");",
    "",
    "  if (editingPurchaseId) {",
    "    try {",
    "      const original = purchases.find((item) => item.id === editingPurchaseId);",
    "      if (!original) { setMessage(\"編集対象の仕入が見つかりません。\"); return; }",
    "      const oldQty = Number(original.quantity || 0);",
    "      const newQty = quantity;",
    "      const oldProduct = products.find((item) => item.id === original.product_id);",
    "      const newProduct = products.find((item) => item.id === purchaseForm.product_id);",
    "      if (!oldProduct || !newProduct) { setMessage(\"商品が見つかりません。\"); return; }",
    "      const oldStock = Number(oldProduct.stock_quantity || 0);",
    "      if (original.product_id === purchaseForm.product_id) {",
    "        const nextStock = oldStock - oldQty + newQty;",
    "        if (nextStock < 0) { setMessage(`在庫がマイナスになるため更新できません。現在庫：${oldStock}個`); return; }",
    "        const stockResult = await supabase.from(\"products\").update({ stock_quantity: nextStock }).eq(\"id\", oldProduct.id);",
    "        if (stockResult.error) { setMessage(`在庫更新エラー：${stockResult.error.message}`); return; }",
    "      } else {",
    "        const oldNext = oldStock - oldQty;",
    "        if (oldNext < 0) { setMessage(`元商品の在庫がマイナスになるため更新できません。現在庫：${oldStock}個`); return; }",
    "        const newStock = Number(newProduct.stock_quantity || 0) + newQty;",
    "        const oldStockResult = await supabase.from(\"products\").update({ stock_quantity: oldNext }).eq(\"id\", oldProduct.id);",
    "        if (oldStockResult.error) { setMessage(`在庫更新エラー：${oldStockResult.error.message}`); return; }",
    "        const newStockResult = await supabase.from(\"products\").update({ stock_quantity: newStock }).eq(\"id\", newProduct.id);",
    "        if (newStockResult.error) { await supabase.from(\"products\").update({ stock_quantity: oldStock }).eq(\"id\", oldProduct.id); setMessage(`在庫更新エラー：${newStockResult.error.message}`); return; }",
    "      }",
    "      const result = await supabase.from(\"purchase_history\").update({ product_id: purchaseForm.product_id, purchase_date: purchaseForm.purchase_date, supplier: purchaseForm.supplier.trim() || null, unit_cost: unitCost, quantity: newQty, total_cost: unitCost * newQty, notes: purchaseForm.notes.trim() || null }).eq(\"id\", editingPurchaseId);",
    "      if (result.error) { setMessage(`仕入編集エラー：${result.error.message}`); return; }",
    "      setMessage(\"仕入を更新しました。在庫も調整しました。\");",
    "      setEditingPurchaseId(null);",
    "      setPurchaseForm(initialPurchaseForm);",
    "      await loadAll();",
    "    } catch (error: any) { setMessage(`仕入編集エラー：${error?.message || \"予期しないエラーが発生しました。\"}`); } finally { setSaving(false); }",
    "    return;",
    "  }",
    "",
    "  try {",
  ]);
  if (!text.includes(marker)) throw new Error("purchase save try marker not found");
  text = text.replace(marker, addition);
}

// ------------------------------------------------------------
// Sale edit branch inside saveSale
// ------------------------------------------------------------
if (!text.includes("売上編集：")) {
  const marker = join([
    "  setSaving(true);",
    "  setMessage(\"\");",
    "",
    "  try {",
    "    // 商品を取得して在庫数を確認",
  ]);
  const addition = join([
    "  setSaving(true);",
    "  setMessage(\"\");",
    "",
    "  if (editingSaleId) {",
    "    try {",
    "      const original = sales.find((item) => item.id === editingSaleId);",
    "      if (!original) { setMessage(\"編集対象の売上が見つかりません。\"); return; }",
    "      const oldQty = Number(original.quantity || 0);",
    "      const newQty = quantity;",
    "      const oldProduct = products.find((item) => item.id === original.product_id);",
    "      const newProduct = products.find((item) => item.id === saleForm.product_id);",
    "      if (!oldProduct || !newProduct) { setMessage(\"商品が見つかりません。\"); return; }",
    "      if (original.product_id === saleForm.product_id) {",
    "        const currentStock = Number(oldProduct.stock_quantity || 0);",
    "        const nextStock = currentStock + oldQty - newQty;",
    "        if (nextStock < 0) { setMessage(`在庫が不足するため更新できません。現在庫：${currentStock}個`); return; }",
    "        const stockResult = await supabase.from(\"products\").update({ stock_quantity: nextStock }).eq(\"id\", oldProduct.id);",
    "        if (stockResult.error) { setMessage(`在庫更新エラー：${stockResult.error.message}`); return; }",
    "      } else {",
    "        const oldCurrent = Number(oldProduct.stock_quantity || 0);",
    "        const newCurrent = Number(newProduct.stock_quantity || 0);",
    "        const newNext = newCurrent - newQty;",
    "        if (newNext < 0) { setMessage(`変更先商品の在庫が不足しています。現在庫：${newCurrent}個`); return; }",
    "        const oldNext = oldCurrent + oldQty;",
    "        const oldStockResult = await supabase.from(\"products\").update({ stock_quantity: oldNext }).eq(\"id\", oldProduct.id);",
    "        if (oldStockResult.error) { setMessage(`在庫更新エラー：${oldStockResult.error.message}`); return; }",
    "        const newStockResult = await supabase.from(\"products\").update({ stock_quantity: newNext }).eq(\"id\", newProduct.id);",
    "        if (newStockResult.error) { await supabase.from(\"products\").update({ stock_quantity: oldCurrent }).eq(\"id\", oldProduct.id); setMessage(`在庫更新エラー：${newStockResult.error.message}`); return; }",
    "      }",
    "      const totalSales = unitPrice * newQty;",
    "      const totalCost = unitCost * newQty;",
    "      const grossProfit = (unitPrice - unitCost) * newQty;",
    "      const result = await supabase.from(\"sales_history\").update({ product_id: saleForm.product_id, sale_date: saleForm.sale_date, sales_channel: saleForm.sales_channel.trim() || null, order_number: saleForm.order_number.trim() || null, unit_price: unitPrice, unit_cost: unitCost, quantity: newQty, total_sales: totalSales, total_cost: totalCost, gross_profit: grossProfit, notes: saleForm.notes.trim() || null }).eq(\"id\", editingSaleId);",
    "      if (result.error) { setMessage(`売上編集エラー：${result.error.message}`); return; }",
    "      setMessage(\"売上を更新しました。在庫も調整しました。\");",
    "      setEditingSaleId(null);",
    "      setSaleForm(initialSaleForm);",
    "      await loadAll();",
    "    } catch (error: any) { setMessage(`売上編集エラー：${error?.message || \"予期しないエラーが発生しました。\"}`); } finally { setSaving(false); }",
    "    return;",
    "  }",
    "",
    "  try {",
    "    // 商品を取得して在庫数を確認",
  ]);
  if (!text.includes(marker)) throw new Error("sale save try marker not found");
  text = text.replace(marker, addition);
}

// ------------------------------------------------------------
// Purchase form heading + buttons
// ------------------------------------------------------------
text = text.replace(
  '<h2>仕入を登録</h2>',
  '<h2>{editingPurchaseId ? "仕入を編集" : "仕入を登録"}</h2>'
);

const purchaseSubmitOld = '{saving\n                    ? "登録中…"\n                    : "仕入を登録する"}';
const purchaseSubmitNew = '{saving ? "保存中…" : editingPurchaseId ? "仕入を更新する" : "仕入を登録する"}';
if (text.includes(purchaseSubmitOld) && !text.includes(purchaseSubmitNew)) {
  text = text.replace(purchaseSubmitOld, purchaseSubmitNew);
}

if (!text.includes('onClick={cancelHistoryEdit}')) {
  const marker = join([
    '                <button',
    '                  type="submit"',
    '                  disabled={saving}',
  ]);
  const buttonEnd = join([
    '                </button>',
  ]);
  const idx = text.indexOf(marker);
  if (idx >= 0) {
    const end = text.indexOf(buttonEnd, idx);
    if (end >= 0) {
      const insertAt = end + buttonEnd.length;
      text = text.slice(0, insertAt) + join([
        '',
        '                {editingPurchaseId && (',
        '                  <button type="button" onClick={cancelHistoryEdit} style={{ marginTop: 15, marginLeft: 8, padding: "12px 20px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700, cursor: "pointer" }}>',
        '                    キャンセル',
        '                  </button>',
        '                )}',
      ]) + text.slice(insertAt);
    }
  }
}

// ------------------------------------------------------------
// Purchase recent table operations
// ------------------------------------------------------------
if (!text.includes("仕入を編集する")) {
  const marker = join([
    '                      <th style={{ padding: 10 }}>',
    '                        合計',
    '                      </th>',
  ]);
  const addition = join([
    marker,
    '                      <th style={{ padding: 10 }}>操作</th>',
  ]);
  // There are multiple 合計 headers; target the one after 最近の仕入 by replacing the last occurrence.
  const sectionPos = text.indexOf('<h2>最近の仕入</h2>');
  const pos = text.indexOf(marker, sectionPos);
  if (sectionPos >= 0 && pos >= 0) text = text.slice(0, pos) + text.slice(pos).replace(marker, addition) + text.slice(pos + text.slice(pos).indexOf(marker) + marker.length);

  const rowMarker = join([
    '                          <td style={{ padding: 10 }}>',
    '                            {yen(',
    '                              purchase.total_cost',
    '                            )}',
    '                          </td>',
  ]);
  const rowAddition = join([
    rowMarker,
    '                          <td style={{ padding: 10 }}>',
    '                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>',
    '                              <button type="button" onClick={() => editPurchaseRecord(purchase)}>編集</button>',
    '                              <button type="button" onClick={() => deletePurchaseRecord(purchase)} style={{ color: "#dc2626" }}>削除</button>',
    '                            </div>',
    '                          </td>',
  ]);
  if (text.includes(rowMarker)) text = text.replace(rowMarker, rowAddition);
}

// ------------------------------------------------------------
// Sale form heading + cancel
// ------------------------------------------------------------
text = text.replace(
  '<h2>売上を登録</h2>',
  '<h2>{editingSaleId ? "売上を編集" : "売上を登録"}</h2>'
);

const saleSubmitOld = '{saving\n                    ? "登録中…"\n                    : "売上を登録する"}';
const saleSubmitNew = '{saving ? "保存中…" : editingSaleId ? "売上を更新する" : "売上を登録する"}';
if (text.includes(saleSubmitOld) && !text.includes(saleSubmitNew)) {
  text = text.replace(saleSubmitOld, saleSubmitNew);
}

// Add a cancel button after the sale submit button.
if (!text.includes('editingSaleId && (')) {
  const marker = saleSubmitNew;
  const pos = text.indexOf(marker);
  if (pos >= 0) {
    const close = text.indexOf('</button>', pos);
    if (close >= 0) {
      const insertAt = close + '</button>'.length;
      text = text.slice(0, insertAt) + join([
        '',
        '                {editingSaleId && (',
        '                  <button type="button" onClick={cancelHistoryEdit} style={{ marginTop: 15, marginLeft: 8, padding: "12px 20px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700, cursor: "pointer" }}>',
        '                    キャンセル',
        '                  </button>',
        '                )}',
      ]) + text.slice(insertAt);
    }
  }
}

// ------------------------------------------------------------
// Sale recent table operations
// ------------------------------------------------------------
if (!text.includes("売上を編集する")) {
  const sectionPos = text.indexOf('<h2>最近の売上</h2>');
  const headerMarker = join([
    '                      <th style={{ padding: 10 }}>',
    '                        粗利',
    '                      </th>',
  ]);
  const pos = text.indexOf(headerMarker, sectionPos);
  if (sectionPos >= 0 && pos >= 0) {
    text = text.slice(0, pos) + text.slice(pos).replace(headerMarker, headerMarker + '\n                      <th style={{ padding: 10 }}>操作</th>') + text.slice(pos + text.slice(pos).indexOf(headerMarker) + headerMarker.length);
  }

  const rowMarker = join([
    '                          <td',
    '                            style={{',
    '                              padding: 10,',
    '                              fontWeight: 700,',
    '                              color:',
    '                                sale.gross_profit >=',
    '                                0',
    '                                  ? "#15803d"',
    '                                  : "#dc2626",',
    '                            }}',
    '                          >',
    '                            {yen(',
    '                              sale.gross_profit',
    '                            )}',
    '                          </td>',
  ]);
  const rowAddition = join([
    rowMarker,
    '                          <td style={{ padding: 10 }}>',
    '                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>',
    '                              <button type="button" onClick={() => editSaleRecord(sale)}>編集</button>',
    '                              <button type="button" onClick={() => deleteSaleRecord(sale)} style={{ color: "#dc2626" }}>削除</button>',
    '                            </div>',
    '                          </td>',
  ]);
  if (text.includes(rowMarker)) text = text.replace(rowMarker, rowAddition);
}

// ------------------------------------------------------------
// Larger JAN scanner: fullscreen modal on phones/desktop.
// ------------------------------------------------------------
if (!text.includes('id="jan-scanner-overlay"')) {
  const oldStart = '  <div\n    style={{\n      marginTop: 16,\n      padding: 12,\n      background: "#000",\n      borderRadius: 12,\n    }}\n  >';
  const newStart = join([
    '  <div',
    '    id="jan-scanner-overlay"',
    '    style={{',
    '      position: "fixed",',
    '      inset: 0,',
    '      zIndex: 9999,',
    '      background: "rgba(0,0,0,0.92)",',
    '      padding: 16,',
    '      boxSizing: "border-box",',
    '      display: "flex",',
    '      alignItems: "center",',
    '      justifyContent: "center",',
    '    }}',
    '  >',
    '    <div style={{ width: "min(920px, 100%)", maxHeight: "100%", overflowY: "auto", background: "#000", borderRadius: 16, padding: 12, boxSizing: "border-box" }}>',
  ]);
  if (text.includes(oldStart)) {
    text = text.replace(oldStart, newStart);
    const videoStyleOld = join([
      '      style={{',
      '        width: "100%",',
      '        display: "block",',
      '        borderRadius: 8,',
      '      }}',
    ]);
    const videoStyleNew = join([
      '      style={{',
      '        width: "100%",',
      '        maxHeight: "72vh",',
      '        minHeight: "45vh",',
      '        objectFit: "cover",',
      '        display: "block",',
      '        borderRadius: 12,',
      '        background: "#111",',
      '      }}',
    ]);
    if (text.includes(videoStyleOld)) text = text.replace(videoStyleOld, videoStyleNew);

    const closeMarker = join([
      '    <button',
      '      type="button"',
      '      onClick={() => setScanning(false)}',
      '      style={{',
    ]);
    if (text.includes(closeMarker)) {
      text = text.replace(closeMarker, join([
        '    </div>',
        '',
        closeMarker,
      ]));
    }
  }
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied purchase/sales edit-delete and larger JAN scanner patch.");
