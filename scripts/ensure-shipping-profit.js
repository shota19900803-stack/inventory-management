const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

function once(find, replace, label) {
  if (text.includes(replace)) return false;
  if (!text.includes(find)) {
    console.log(`Shipping patch skipped: ${label}`);
    return false;
  }
  text = text.replace(find, replace);
  return true;
}

// Sale type + form state.
once(
  '  gross_profit: number;\n  notes?: string | null;',
  '  gross_profit: number;\n  shipping_cost?: number | null;\n  notes?: string | null;',
  "Sale type shipping_cost"
);
once(
  'const initialSaleForm = {\n  product_id: "",\n  sale_date: today,\n  sales_channel: "楽天市場",\n  order_number: "",\n  unit_price: "",\n  unit_cost: "",\n  quantity: "1",\n  notes: "",\n};',
  'const initialSaleForm = {\n  product_id: "",\n  sale_date: today,\n  sales_channel: "楽天市場",\n  order_number: "",\n  unit_price: "",\n  unit_cost: "",\n  quantity: "1",\n  shipping_cost: "",\n  notes: "",\n};',
  "initialSaleForm shipping_cost"
);

// saveSale validation.
once(
  '  const quantity = Number(\n    saleForm.quantity || 0\n  );\n\n  if (\n    unitPrice < 0 ||\n    unitCost < 0 ||\n    quantity <= 0\n  ) {',
  '  const quantity = Number(\n    saleForm.quantity || 0\n  );\n\n  const shippingCost = Number(\n    saleForm.shipping_cost || 0\n  );\n\n  if (\n    unitPrice < 0 ||\n    unitCost < 0 ||\n    shippingCost < 0 ||\n    quantity <= 0\n  ) {',
  "saveSale validation"
);
once(
  '      "販売価格・原価・数量を正しく入力してください。"',
  '      "販売価格・原価・送料・数量を正しく入力してください。"',
  "saveSale validation message"
);

// Save shipping immediately after register_sale succeeds. The RPC is added by
// the existing apply-shipping-rpc.js build step.
once(
  '    // ==========================================\n    // 登録成功\n    // ==========================================\n\n    setMessage(\n      "売上を登録しました。"\n    );',
  '    // ==========================================\n    // 送料保存\n    // ==========================================\n    let saleId = data?.sale_id ?? data?.id ?? null;\n\n    if (!saleId) {\n      const { data: latestSale } = await supabase\n        .from("sales_history")\n        .select("id")\n        .eq("product_id", saleForm.product_id)\n        .eq("sale_date", saleForm.sale_date)\n        .order("created_at", { ascending: false })\n        .limit(1)\n        .maybeSingle();\n      saleId = latestSale?.id ?? null;\n    }\n\n    if (saleId) {\n      const { error: shippingError } = await supabase.rpc("set_sale_shipping_cost", {\n        p_sale_id: saleId,\n        p_shipping_cost: shippingCost,\n      });\n      if (shippingError) {\n        setMessage(`送料の保存に失敗しました：${shippingError.message}`);\n        return;\n      }\n    }\n\n    // ==========================================\n    // 登録成功\n    // ==========================================\n\n    setMessage(\n      "売上を登録しました。"\n    );',
  "saveSale shipping persistence"
);

// Editing a sale should preserve and update shipping too.
once(
  '  setSaleForm({ product_id: sale.product_id, sale_date: sale.sale_date, sales_channel: sale.sales_channel ?? "楽天市場", order_number: sale.order_number ?? "", unit_price: String(sale.unit_price ?? ""), unit_cost: String(sale.unit_cost ?? ""), quantity: String(sale.quantity ?? 1), notes: sale.notes ?? "" });',
  '  setSaleForm({ product_id: sale.product_id, sale_date: sale.sale_date, sales_channel: sale.sales_channel ?? "楽天市場", order_number: sale.order_number ?? "", unit_price: String(sale.unit_price ?? ""), unit_cost: String(sale.unit_cost ?? ""), quantity: String(sale.quantity ?? 1), shipping_cost: String(sale.shipping_cost ?? ""), notes: sale.notes ?? "" });',
  "editSale shipping"
);
once(
  '  const unitPrice = Number(saleForm.unit_price || 0), unitCost = Number(saleForm.unit_cost || 0), quantity = Number(saleForm.quantity || 0);\n  if (unitPrice < 0 || unitCost < 0 || quantity <= 0) {',
  '  const unitPrice = Number(saleForm.unit_price || 0), unitCost = Number(saleForm.unit_cost || 0), quantity = Number(saleForm.quantity || 0), shippingCost = Number(saleForm.shipping_cost || 0);\n  if (unitPrice < 0 || unitCost < 0 || shippingCost < 0 || quantity <= 0) {',
  "updateSale validation"
);
once(
  'total_cost: unitCost * quantity, gross_profit: (unitPrice - unitCost) * quantity, notes: saleForm.notes.trim() || null',
  'total_cost: unitCost * quantity, gross_profit: (unitPrice - unitCost) * quantity - shippingCost, shipping_cost: shippingCost, notes: saleForm.notes.trim() || null',
  "updateSale shipping"
);

// Sales form UI.
once(
  '                  <label>\n                    メモ\n                    <input\n                      style={inputStyle}\n                      value={saleForm.notes}',
  '                  <label>\n                    送料\n                    <input\n                      style={inputStyle}\n                      type="number"\n                      min="0"\n                      value={saleForm.shipping_cost}\n                      onChange={(e) =>\n                        setSaleForm({\n                          ...saleForm,\n                          shipping_cost: e.target.value,\n                        })\n                      }\n                      placeholder="例：750"\n                    />\n                  </label>\n\n                  <label>\n                    メモ\n                    <input\n                      style={inputStyle}\n                      value={saleForm.notes}',
  "sales form shipping field"
);

// Replace the simple gross-profit preview with shipping-aware profit.
once(
  '                  <strong\n                    style={{\n                      color: "#15803d",\n                    }}\n                  >\n                    粗利{" "}\n                    {yen(\n                      (Number(\n                        saleForm.unit_price ||\n                          0\n                      ) -\n                        Number(\n                          saleForm.unit_cost ||\n                            0\n                        )) *\n                        Number(\n                          saleForm.quantity || 0\n                        )\n                    )}\n                  </strong>',
  '                  <strong>\n                    送料{" "}\n                    {yen(Number(saleForm.shipping_cost || 0))}\n                  </strong>\n\n                  <strong\n                    style={{\n                      color:\n                        (Number(saleForm.unit_price || 0) * Number(saleForm.quantity || 0) -\n                          Number(saleForm.unit_cost || 0) * Number(saleForm.quantity || 0) -\n                          Number(saleForm.shipping_cost || 0)) >= 0\n                          ? "#15803d"\n                          : "#dc2626",\n                    }}\n                  >\n                    実質粗利{" "}\n                    {yen(\n                      Number(saleForm.unit_price || 0) * Number(saleForm.quantity || 0) -\n                        Number(saleForm.unit_cost || 0) * Number(saleForm.quantity || 0) -\n                        Number(saleForm.shipping_cost || 0)\n                    )}\n                  </strong>',
  "sales profit preview"
);

// Recent sales table: add a shipping column only if the current table does not
// already have one. This intentionally does not depend on the fragile marker
// that caused the Vercel build to fail.
once(
  '                      <th style={{ padding: 10 }}>\n                        売上\n                      </th>\n                      <th style={{ padding: 10 }}>\n                        粗利\n                      </th>',
  '                      <th style={{ padding: 10 }}>\n                        売上\n                      </th>\n                      <th style={{ padding: 10 }}>\n                        送料\n                      </th>\n                      <th style={{ padding: 10 }}>\n                        粗利\n                      </th>',
  "recent sales shipping header"
);
once(
  '                          <td style={{ padding: 10 }}>\n                            {yen(\n                              sale.total_sales\n                            )}\n                          </td>\n\n                          <td style={{ padding: 10, fontWeight: 700, color: sale.gross_profit >= 0 ? "#15803d" : "#dc2626" }}>',
  '                          <td style={{ padding: 10 }}>\n                            {yen(\n                              sale.total_sales\n                            )}\n                          </td>\n\n                          <td style={{ padding: 10 }}>\n                            {yen(sale.shipping_cost)}\n                          </td>\n\n                          <td style={{ padding: 10, fontWeight: 700, color: sale.gross_profit >= 0 ? "#15803d" : "#dc2626" }}>',
  "recent sales shipping row"
);

// Also expose shipping in the product history sales table if present.
once(
  '                          <th style={{ padding: 8 }}>\n                            粗利\n                          </th>',
  '                          <th style={{ padding: 8 }}>\n                            送料\n                          </th>\n                          <th style={{ padding: 8 }}>\n                            粗利\n                          </th>',
  "history sales shipping header"
);
once(
  '                              <td\n                                style={{\n                                  padding: 8,\n                                  fontWeight: 700,\n                                }}\n                              >\n                                {yen(\n                                  sale.gross_profit\n                                )}\n                              </td>',
  '                              <td style={{ padding: 8 }}>\n                                {yen(sale.shipping_cost)}\n                              </td>\n\n                              <td\n                                style={{\n                                  padding: 8,\n                                  fontWeight: 700,\n                                }}\n                              >\n                                {yen(\n                                  sale.gross_profit\n                                )}\n                              </td>',
  "history sales shipping row"
);

fs.writeFileSync(file, text, "utf8");
console.log("Applied robust shipping-aware sales patch.");
