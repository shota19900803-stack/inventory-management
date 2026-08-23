const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let text = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    '  gross_profit: number;\n  notes?: string | null;',
    '  gross_profit: number;\n  shipping_cost?: number | null;\n  notes?: string | null;',
    'Sale type shipping_cost',
  ],
  [
    '  quantity: "1",\n  notes: "",\n};',
    '  quantity: "1",\n  shipping_cost: "",\n  notes: "",\n};',
    'Sale form shipping_cost',
  ],
];

for (const [oldText, newText, name] of replacements) {
  if (text.includes(newText)) continue;
  if (!text.includes(oldText)) throw new Error(`${name} marker not found.`);
  text = text.replace(oldText, newText);
}

const saveSaleOld = `  const quantity = Number(\n    saleForm.quantity || 0\n  );\n\n  if (\n    unitPrice < 0 ||\n    unitCost < 0 ||\n    quantity <= 0\n  ) {\n    setMessage(\n      "販売価格・原価・数量を正しく入力してください。"\n    );\n    return;\n  }`;
const saveSaleNew = `  const quantity = Number(\n    saleForm.quantity || 0\n  );\n\n  const shippingCost = Number(\n    saleForm.shipping_cost || 0\n  );\n\n  if (\n    unitPrice < 0 ||\n    unitCost < 0 ||\n    shippingCost < 0 ||\n    quantity <= 0\n  ) {\n    setMessage(\n      "販売価格・原価・送料・数量を正しく入力してください。"\n    );\n    return;\n  }`;
if (!text.includes(saveSaleNew)) {
  if (!text.includes(saveSaleOld)) throw new Error('saveSale validation marker not found.');
  text = text.replace(saveSaleOld, saveSaleNew);
}

const afterRpcOld = `    // RPC処理失敗\n    if (!data?.success) {\n      setMessage(\n        "売上登録に失敗しました。"\n      );\n      return;\n    }\n\n    // ==========================================\n    // 登録成功\n    // ==========================================\n\n    setMessage(\n      "売上を登録しました。"\n    );`;
const afterRpcNew = `    // RPC処理失敗\n    if (!data?.success) {\n      setMessage(\n        "売上登録に失敗しました。"\n      );\n      return;\n    }\n\n    // 送料を売上履歴へ反映し、送料込みの実質粗利を保存\n    // register_sale() の既存仕様を壊さず、後処理で送料を追加します。\n    const totalSales = unitPrice * quantity;\n    const totalCost = unitCost * quantity;\n    const grossProfitWithShipping =\n      totalSales - totalCost - shippingCost;\n\n    let saleId = data?.sale_id ?? data?.id ?? null;\n\n    if (!saleId) {\n      const { data: latestSale } = await supabase\n        .from("sales_history")\n        .select("id")\n        .eq("product_id", saleForm.product_id)\n        .eq("sale_date", saleForm.sale_date)\n        .order("created_at", { ascending: false })\n        .limit(1)\n        .maybeSingle();\n\n      saleId = latestSale?.id ?? null;\n    }\n\n    if (!saleId) {\n      setMessage(\n        "売上は登録されましたが、送料の反映先を特定できませんでした。送料を0円として扱っています。"\n      );\n      setSaleForm(initialSaleForm);\n      await loadAll();\n      return;\n    }\n\n    const { error: shippingUpdateError } = await supabase\n      .from("sales_history")\n      .update({\n        shipping_cost: shippingCost,\n        gross_profit: grossProfitWithShipping,\n      })\n      .eq("id", saleId);\n\n    if (shippingUpdateError) {\n      setMessage(\n        `売上は登録されましたが、送料の保存に失敗しました：${shippingUpdateError.message}`\n      );\n      return;\n    }\n\n    // ==========================================\n    // 登録成功\n    // ==========================================\n\n    setMessage(\n      "売上を登録しました。送料込みで粗利を計算しました。"\n    );`;
if (!text.includes(afterRpcNew)) {
  if (!text.includes(afterRpcOld)) throw new Error('saveSale success marker not found.');
  text = text.replace(afterRpcOld, afterRpcNew);
}

const formLabelOld = `                  <label>\n                    数量*\n                    <input\n                      style={inputStyle}\n                      type="number"\n                      min="1"\n                      value={\n                        saleForm.quantity\n                      }\n                      onChange={(e) =>\n                        setSaleForm({\n                          ...saleForm,\n                          quantity:\n                            e.target.value,\n                        })\n                      }\n                    />\n                  </label>\n\n                  <label>\n                    メモ`;
const formLabelNew = `                  <label>\n                    数量*\n                    <input\n                      style={inputStyle}\n                      type="number"\n                      min="1"\n                      value={\n                        saleForm.quantity\n                      }\n                      onChange={(e) =>\n                        setSaleForm({\n                          ...saleForm,\n                          quantity:\n                            e.target.value,\n                        })\n                      }\n                    />\n                  </label>\n\n                  <label>\n                    送料\n                    <input\n                      style={inputStyle}\n                      type="number"\n                      min="0"\n                      value={saleForm.shipping_cost}\n                      onChange={(e) =>\n                        setSaleForm({\n                          ...saleForm,\n                          shipping_cost: e.target.value,\n                        })\n                      }\n                      placeholder="例：750"\n                    />\n                  </label>\n\n                  <label>\n                    メモ`;
if (!text.includes(formLabelNew)) {
  if (!text.includes(formLabelOld)) throw new Error('Sales form quantity marker not found.');
  text = text.replace(formLabelOld, formLabelNew);
}

const descriptionOld = '                販売価格とその時点の原価を記録して、粗利を自動計算します。';
const descriptionNew = '                販売価格・原価・送料を記録して、送料込みの実質粗利を自動計算します。';
if (text.includes(descriptionOld)) text = text.replace(descriptionOld, descriptionNew);

const previewOld = `                  <strong\n                    style={{\n                      color: "#15803d",\n                    }}\n                  >\n                    粗利{" "}\n                    {yen(\n                      (Number(\n                        saleForm.unit_price ||\n                          0\n                      ) -\n                        Number(\n                          saleForm.unit_cost ||\n                            0\n                        )) *\n                        Number(\n                          saleForm.quantity || 0\n                        )\n                    )}\n                  </strong>`;
const previewNew = `                  <strong>\n                    原価{" "}\n                    {yen(\n                      Number(saleForm.unit_cost || 0) *\n                        Number(saleForm.quantity || 0)\n                    )}\n                  </strong>\n\n                  <strong>\n                    送料{" "}\n                    {yen(Number(saleForm.shipping_cost || 0))}\n                  </strong>\n\n                  <strong\n                    style={{\n                      color:\n                        (Number(saleForm.unit_price || 0) * Number(saleForm.quantity || 0) -\n                          Number(saleForm.unit_cost || 0) * Number(saleForm.quantity || 0) -\n                          Number(saleForm.shipping_cost || 0)) >= 0\n                          ? "#15803d"\n                          : "#dc2626",\n                    }}\n                  >\n                    実質粗利{" "}\n                    {yen(\n                      Number(saleForm.unit_price || 0) * Number(saleForm.quantity || 0) -\n                        Number(saleForm.unit_cost || 0) * Number(saleForm.quantity || 0) -\n                        Number(saleForm.shipping_cost || 0)\n                    )}\n                  </strong>`;
if (!text.includes(previewNew)) {
  if (!text.includes(previewOld)) throw new Error('Sales preview gross profit marker not found.');
  text = text.replace(previewOld, previewNew);
}

const recentHeaderOld = `                      <th style={{ padding: 10 }}>\n                        売上\n                      </th>\n                      <th style={{ padding: 10 }}>\n                        粗利\n                      </th>`;
const recentHeaderNew = `                      <th style={{ padding: 10 }}>\n                        売上\n                      </th>\n                      <th style={{ padding: 10 }}>\n                        送料\n                      </th>\n                      <th style={{ padding: 10 }}>\n                        粗利\n                      </th>`;
if (!text.includes(recentHeaderNew)) {
  if (!text.includes(recentHeaderOld)) throw new Error('Recent sales header marker not found.');
  text = text.replace(recentHeaderOld, recentHeaderNew);
}

const recentRowOld = `                          <td style={{ padding: 10 }}>\n                            {yen(\n                              sale.total_sales\n                            )}\n                          </td>\n\n                          <td\n                            style={{\n                              padding: 10,\n                              fontWeight: 700,\n                              color:`;
const recentRowNew = `                          <td style={{ padding: 10 }}>\n                            {yen(\n                              sale.total_sales\n                            )}\n                          </td>\n\n                          <td style={{ padding: 10 }}>\n                            {yen(sale.shipping_cost)}\n                          </td>\n\n                          <td\n                            style={{\n                              padding: 10,\n                              fontWeight: 700,\n                              color:`;
if (!text.includes(recentRowNew)) {
  if (!text.includes(recentRowOld)) throw new Error('Recent sales row marker not found.');
  text = text.replace(recentRowOld, recentRowNew);
}

const monthlyCostBlockOld = `  const monthlyCostTotal = monthSales.reduce(\n    (sum, sale) => sum + Number(sale.total_cost || 0),\n    0\n  );\n\n  const monthlyGrossProfit`;
const monthlyCostBlockNew = `  const monthlyCostTotal = monthSales.reduce(\n    (sum, sale) => sum + Number(sale.total_cost || 0),\n    0\n  );\n\n  const monthlyShippingTotal = monthSales.reduce(\n    (sum, sale) => sum + Number(sale.shipping_cost || 0),\n    0\n  );\n\n  const monthlyGrossProfit`;
if (!text.includes(monthlyCostBlockNew)) {
  if (!text.includes(monthlyCostBlockOld)) throw new Error('Monthly cost marker not found.');
  text = text.replace(monthlyCostBlockOld, monthlyCostBlockNew);
}

const trendOld = `  const grossProfit = monthSalesData.reduce(\n    (sum, sale) => sum + Number(sale.gross_profit || 0),\n    0\n  );\n\n  return {\n    month,\n    sales: salesTotal,\n    purchases: purchaseTotal,\n    cost: costTotal,\n    grossProfit,\n  };`;
const trendNew = `  const grossProfit = monthSalesData.reduce(\n    (sum, sale) => sum + Number(sale.gross_profit || 0),\n    0\n  );\n\n  const shipping = monthSalesData.reduce(\n    (sum, sale) => sum + Number(sale.shipping_cost || 0),\n    0\n  );\n\n  return {\n    month,\n    sales: salesTotal,\n    purchases: purchaseTotal,\n    cost: costTotal,\n    shipping,\n    grossProfit,\n  };`;
if (!text.includes(trendNew)) {
  if (!text.includes(trendOld)) throw new Error('Trend gross profit marker not found.');
  text = text.replace(trendOld, trendNew);
}

const grossCardMarker = `              <div style={cardStyle}>\n                <div\n                  style={{\n                    color: "#6b7280",\n                    fontSize: 14,\n                  }}\n                >\n                  粗利\n`;
const shippingCard = `              <div style={cardStyle}>\n                <div\n                  style={{\n                    color: "#6b7280",\n                    fontSize: 14,\n                  }}\n                >\n                  送料\n                </div>\n                <strong\n                  style={{\n                    fontSize: 28,\n                    display: "block",\n                    marginTop: 8,\n                  }}\n                >\n                  {yen(monthlyShippingTotal)}\n                </strong>\n                <div\n                  style={{\n                    marginTop: 5,\n                    color: "#6b7280",\n                  }}\n                >\n                  売上に対する送料負担\n                </div>\n              </div>\n\n`;
if (!text.includes(shippingCard)) {
  if (!text.includes(grossCardMarker)) throw new Error('Gross card marker not found.');
  text = text.replace(grossCardMarker, shippingCard + grossCardMarker);
}

const historyHeaderOld = `                          <th style={{ padding: 8 }}>\n                            数量\n                          </th>\n                          <th style={{ padding: 8 }}>\n                            粗利\n                          </th>`;
const historyHeaderNew = `                          <th style={{ padding: 8 }}>\n                            数量\n                          </th>\n                          <th style={{ padding: 8 }}>\n                            送料\n                          </th>\n                          <th style={{ padding: 8 }}>\n                            粗利\n                          </th>`;
if (!text.includes(historyHeaderNew)) {
  if (!text.includes(historyHeaderOld)) throw new Error('History sales header marker not found.');
  text = text.replace(historyHeaderOld, historyHeaderNew);
}

const historyRowOld = `                              <td style={{ padding: 8 }}>\n                                {sale.quantity}\n                              </td>\n\n                              <td\n                                style={{\n                                  padding: 8,\n                                  fontWeight: 700,\n                                }}\n                              >`;
const historyRowNew = `                              <td style={{ padding: 8 }}>\n                                {sale.quantity}\n                              </td>\n\n                              <td style={{ padding: 8 }}>\n                                {yen(sale.shipping_cost)}\n                              </td>\n\n                              <td\n                                style={{\n                                  padding: 8,\n                                  fontWeight: 700,\n                                }}\n                              >`;
if (!text.includes(historyRowNew)) {
  if (!text.includes(historyRowOld)) throw new Error('History sales row marker not found.');
  text = text.replace(historyRowOld, historyRowNew);
}

fs.writeFileSync(file, text, 'utf8');
console.log('Applied shipping-aware sales profit UI and persistence handling.');
