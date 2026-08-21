const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

if (!source.includes("const [editingPurchaseId")) {
  const marker = '  const [purchaseForm, setPurchaseForm] =\n    useState(initialPurchaseForm);';
  const insert = `${marker}\n\n  const [editingPurchaseId, setEditingPurchaseId] =\n    useState<string | null>(null);\n\n  const [editingSaleId, setEditingSaleId] =\n    useState<string | null>(null);`;
  if (!source.includes(marker)) throw new Error("purchase form state marker not found");
  source = source.replace(marker, insert);
}

if (!source.includes("async function editPurchase")) {
  const marker = '  async function savePurchase(\n  event: React.FormEvent\n) {';
  const helpers = `  function resetPurchaseForm() {\n    setEditingPurchaseId(null);\n    setPurchaseForm(initialPurchaseForm);\n  }\n\n  function editPurchase(purchase: Purchase) {\n    setEditingPurchaseId(purchase.id);\n    setPurchaseForm({\n      product_id: purchase.product_id ?? "",\n      purchase_date: purchase.purchase_date ?? today,\n      supplier: purchase.supplier ?? "",\n      unit_cost: String(purchase.unit_cost ?? 0),\n      quantity: String(purchase.quantity ?? 1),\n      notes: purchase.notes ?? "",\n    });\n    setTab("purchases");\n    window.scrollTo({ top: 0, behavior: "smooth" });\n  }\n\n  function resetSaleForm() {\n    setEditingSaleId(null);\n    setSaleForm(initialSaleForm);\n  }\n\n  function editSale(sale: Sale) {\n    setEditingSaleId(sale.id);\n    setSaleForm({\n      product_id: sale.product_id ?? "",\n      sale_date: sale.sale_date ?? today,\n      sales_channel: sale.sales_channel ?? "楽天市場",\n      order_number: sale.order_number ?? "",\n      unit_price: String(sale.unit_price ?? 0),\n      unit_cost: String(sale.unit_cost ?? 0),\n      quantity: String(sale.quantity ?? 1),\n      notes: sale.notes ?? "",\n    });\n    setTab("sales");\n    window.scrollTo({ top: 0, behavior: "smooth" });\n  }\n\n  async function adjustStock(productId: string, delta: number) {\n    const { data, error } = await supabase\n      .from("products")\n      .select("stock_quantity")\n      .eq("id", productId)\n      .single();\n\n    if (error || !data) {\n      throw new Error(error?.message || "商品在庫を取得できませんでした。");\n    }\n\n    const nextStock = Number(data.stock_quantity || 0) + delta;\n    if (nextStock < 0) {\n      throw new Error(`在庫が不足しています。現在庫：${Number(data.stock_quantity || 0)}個`);\n    }\n\n    const { error: updateError } = await supabase\n      .from("products")\n      .update({ stock_quantity: nextStock })\n      .eq("id", productId);\n\n    if (updateError) throw new Error(updateError.message);\n  }\n\n  async function deletePurchase(purchase: Purchase) {\n    if (!window.confirm(`この仕入を削除しますか？\\n\\n${productMap[purchase.product_id]?.name ?? "商品不明"}\\n数量：${purchase.quantity}個\\n仕入額：${yen(purchase.total_cost)}`)) return;\n    setMessage("");\n    try {\n      await adjustStock(purchase.product_id, -Number(purchase.quantity || 0));\n      const { error } = await supabase.from("purchase_history").delete().eq("id", purchase.id);\n      if (error) {\n        await adjustStock(purchase.product_id, Number(purchase.quantity || 0));\n        throw new Error(error.message);\n      }\n      setMessage("仕入を削除しました。在庫も調整しました。");\n      await loadAll();\n    } catch (error: any) {\n      setMessage(`仕入削除エラー：${error?.message || String(error)}`);\n    }\n  }\n\n  async function deleteSale(sale: Sale) {\n    if (!window.confirm(`この売上を削除しますか？\\n\\n${productMap[sale.product_id]?.name ?? "商品不明"}\\n数量：${sale.quantity}個\\n売上：${yen(sale.total_sales)}`)) return;\n    setMessage("");\n    try {\n      await adjustStock(sale.product_id, Number(sale.quantity || 0));\n      const { error } = await supabase.from("sales_history").delete().eq("id", sale.id);\n      if (error) {\n        await adjustStock(sale.product_id, -Number(sale.quantity || 0));\n        throw new Error(error.message);\n      }\n      setMessage("売上を削除しました。在庫も元に戻しました。");\n      await loadAll();\n    } catch (error: any) {\n      setMessage(`売上削除エラー：${error?.message || String(error)}`);\n    }\n  }\n\n`;
  if (!source.includes(marker)) throw new Error("savePurchase marker not found");
  source = source.replace(marker, helpers + marker);
}

if (!source.includes("if (editingPurchaseId) {")) {
  const marker = '  setSaving(true);\n  setMessage("");\n\n  try {\n    const { data, error } = await supabase.rpc(\n      "register_purchase",';
  const replacement = `  setSaving(true);\n  setMessage("");\n\n  if (editingPurchaseId) {\n    try {\n      const oldPurchase = purchases.find((item) => item.id === editingPurchaseId);\n      if (!oldPurchase) throw new Error("編集対象の仕入が見つかりません。");\n\n      if (oldPurchase.product_id !== purchaseForm.product_id) {\n        await adjustStock(oldPurchase.product_id, -Number(oldPurchase.quantity || 0));\n        try {\n          await adjustStock(purchaseForm.product_id, quantity);\n        } catch (error) {\n          await adjustStock(oldPurchase.product_id, Number(oldPurchase.quantity || 0));\n          throw error;\n        }\n      } else {\n        await adjustStock(oldPurchase.product_id, quantity - Number(oldPurchase.quantity || 0));\n      }\n\n      const { error } = await supabase\n        .from("purchase_history")\n        .update({\n          product_id: purchaseForm.product_id,\n          purchase_date: purchaseForm.purchase_date,\n          supplier: purchaseForm.supplier.trim() || null,\n          unit_cost: unitCost,\n          quantity,\n          total_cost: unitCost * quantity,\n          notes: purchaseForm.notes.trim() || null,\n        })\n        .eq("id", editingPurchaseId);\n\n      if (error) throw new Error(error.message);\n      setMessage("仕入を更新しました。在庫も調整しました。");\n      resetPurchaseForm();\n      await loadAll();\n    } catch (error: any) {\n      setMessage(`仕入更新エラー：${error?.message || String(error)}`);\n    } finally {\n      setSaving(false);\n    }\n    return;\n  }\n\n  try {\n    const { data, error } = await supabase.rpc(\n      "register_purchase",`;
  if (!source.includes(marker)) throw new Error("purchase rpc marker not found");
  source = source.replace(marker, replacement);
}

if (!source.includes("if (editingSaleId) {")) {
  const marker = '  setSaving(true);\n  setMessage("");\n\n  try {\n    // 商品を取得して在庫数を確認';
  const replacement = `  setSaving(true);\n  setMessage("");\n\n  if (editingSaleId) {\n    try {\n      const oldSale = sales.find((item) => item.id === editingSaleId);\n      if (!oldSale) throw new Error("編集対象の売上が見つかりません。");\n\n      const oldQuantity = Number(oldSale.quantity || 0);\n      if (oldSale.product_id !== saleForm.product_id) {\n        await adjustStock(oldSale.product_id, oldQuantity);\n        try {\n          await adjustStock(saleForm.product_id, -quantity);\n        } catch (error) {\n          await adjustStock(oldSale.product_id, -oldQuantity);\n          throw error;\n        }\n      } else {\n        await adjustStock(oldSale.product_id, oldQuantity - quantity);\n      }\n\n      const totalSales = unitPrice * quantity;\n      const totalCost = unitCost * quantity;\n      const grossProfit = totalSales - totalCost;\n      const { error } = await supabase\n        .from("sales_history")\n        .update({\n          product_id: saleForm.product_id,\n          sale_date: saleForm.sale_date,\n          sales_channel: saleForm.sales_channel.trim() || null,\n          order_number: saleForm.order_number.trim() || null,\n          unit_price: unitPrice,\n          unit_cost: unitCost,\n          quantity,\n          total_sales: totalSales,\n          total_cost: totalCost,\n          gross_profit: grossProfit,\n          notes: saleForm.notes.trim() || null,\n        })\n        .eq("id", editingSaleId);\n\n      if (error) throw new Error(error.message);\n      setMessage("売上を更新しました。在庫も調整しました。");\n      resetSaleForm();\n      await loadAll();\n    } catch (error: any) {\n      setMessage(`売上更新エラー：${error?.message || String(error)}`);\n    } finally {\n      setSaving(false);\n    }\n    return;\n  }\n\n  try {\n    // 商品を取得して在庫数を確認`;
  if (!source.includes(marker)) throw new Error("sale stock marker not found");
  source = source.replace(marker, replacement);
}

const purchaseHeading = '<h2>仕入を登録</h2>';
if (source.includes(purchaseHeading)) {
  source = source.replace(purchaseHeading, '<h2>{editingPurchaseId ? "仕入を編集" : "仕入を登録"}</h2>');
}
const purchaseButton = '{saving\n                    ? "登録中…"\n                    : "仕入を登録する"}';
if (source.includes(purchaseButton) && !source.includes('editingPurchaseId ? "更新する" : "仕入を登録する"')) {
  source = source.replace(purchaseButton, '{saving\n                    ? "保存中…"\n                    : editingPurchaseId\n                    ? "更新する"\n                    : "仕入を登録する"}');
}
const purchaseFormEnd = '              </form>\n            </section>\n\n            <section style={cardStyle}>\n              <h2>最近の仕入</h2>';
if (source.includes(purchaseFormEnd) && !source.includes('onClick={resetPurchaseForm}')) {
  source = source.replace(purchaseFormEnd, '              <div style={{ display: "flex", gap: 10, marginTop: 15, flexWrap: "wrap" }}>\n                {editingPurchaseId && (\n                  <button type="button" onClick={resetPurchaseForm} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}>キャンセル</button>\n                )}\n              </div>\n              </form>\n            </section>\n\n            <section style={cardStyle}>\n              <h2>最近の仕入</h2>');
}

const purchaseHeader = '                      <th style={{ padding: 10 }}>\n                        合計\n                      </th>\n                    </tr>';
if (source.includes(purchaseHeader) && !source.includes('仕入操作')) {
  source = source.replace(purchaseHeader, '                      <th style={{ padding: 10 }}>\n                        合計\n                      </th>\n                      <th style={{ padding: 10 }}>\n                        操作\n                      </th>\n                    </tr>');
}
const purchaseRow = '                          <td style={{ padding: 10 }}>\n                            {yen(\n                              purchase.total_cost\n                            )}\n                          </td>\n                        </tr>';
if (source.includes(purchaseRow) && !source.includes('editPurchase(purchase)')) {
  source = source.replace(purchaseRow, '                          <td style={{ padding: 10 }}>\n                            {yen(\n                              purchase.total_cost\n                            )}\n                          </td>\n                          <td style={{ padding: 10 }}>\n                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>\n                              <button type="button" onClick={() => editPurchase(purchase)}>編集</button>\n                              <button type="button" onClick={() => deletePurchase(purchase)} style={{ color: "#dc2626" }}>削除</button>\n                            </div>\n                          </td>\n                        </tr>');
}

const saleHeading = '<h2>売上を登録</h2>';
if (source.includes(saleHeading)) {
  source = source.replace(saleHeading, '<h2>{editingSaleId ? "売上を編集" : "売上を登録"}</h2>');
}
const saleButton = '{saving\n                    ? "登録中…"\n                    : "売上を登録する"}';
if (source.includes(saleButton) && !source.includes('editingSaleId ? "更新する" : "売上を登録する"')) {
  source = source.replace(saleButton, '{saving\n                    ? "保存中…"\n                    : editingSaleId\n                    ? "更新する"\n                    : "売上を登録する"}');
}
const saleFormEnd = '              </form>\n            </section>\n\n            <section style={cardStyle}>\n              <h2>最近の売上</h2>';
if (source.includes(saleFormEnd) && !source.includes('onClick={resetSaleForm}')) {
  source = source.replace(saleFormEnd, '              {editingSaleId && (\n                <button type="button" onClick={resetSaleForm} style={{ marginTop: 15, padding: "12px 20px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}>キャンセル</button>\n              )}\n              </form>\n            </section>\n\n            <section style={cardStyle}>\n              <h2>最近の売上</h2>');
}

const saleHeader = '                      <th style={{ padding: 10 }}>\n                        粗利\n                      </th>\n                    </tr>';
if (source.includes(saleHeader) && !source.includes('売上操作')) {
  source = source.replace(saleHeader, '                      <th style={{ padding: 10 }}>\n                        粗利\n                      </th>\n                      <th style={{ padding: 10 }}>\n                        操作\n                      </th>\n                    </tr>');
}
const saleRow = '                          <td\n                            style={{\n                              padding: 10,\n                              fontWeight: 700,\n                              color:\n                                sale.gross_profit >=\n                                0\n                                  ? "#15803d"\n                                  : "#dc2626",\n                            }}\n                          >\n                            {yen(\n                              sale.gross_profit\n                            )}\n                          </td>\n                        </tr>';
if (source.includes(saleRow) && !source.includes('editSale(sale)')) {
  source = source.replace(saleRow, '                          <td\n                            style={{\n                              padding: 10,\n                              fontWeight: 700,\n                              color:\n                                sale.gross_profit >=\n                                0\n                                  ? "#15803d"\n                                  : "#dc2626",\n                            }}\n                          >\n                            {yen(\n                              sale.gross_profit\n                            )}\n                          </td>\n                          <td style={{ padding: 10 }}>\n                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>\n                              <button type="button" onClick={() => editSale(sale)}>編集</button>\n                              <button type="button" onClick={() => deleteSale(sale)} style={{ color: "#dc2626" }}>削除</button>\n                            </div>\n                          </td>\n                        </tr>');
}

// JAN scanner: make the preview much larger on phones while keeping it responsive.
const oldVideoStyle = `        width: "100%",\n        display: "block",\n        borderRadius: 8,`;
const newVideoStyle = `        width: "100%",\n        height: "min(68vh, 520px)",\n        minHeight: 320,\n        display: "block",\n        objectFit: "cover",\n        borderRadius: 10,`;
if (source.includes(oldVideoStyle)) source = source.replace(oldVideoStyle, newVideoStyle);

const oldScannerBox = `      marginTop: 16,\n      padding: 12,\n      background: "#000",\n      borderRadius: 12,`;
const newScannerBox = `      marginTop: 16,\n      padding: 10,\n      background: "#000",\n      borderRadius: 14,\n      width: "100%",\n      boxSizing: "border-box",`;
if (source.includes(oldScannerBox)) source = source.replace(oldScannerBox, newScannerBox);

fs.writeFileSync(file, source, "utf8");
console.log("Applied purchase/sales edit-delete actions and enlarged JAN scanner.");
