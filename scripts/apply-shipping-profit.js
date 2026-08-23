const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let text = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, name) {
  if (text.includes(newText)) return;
  if (!text.includes(oldText)) {
    throw new Error(name + ' marker not found.');
  }
  text = text.replace(oldText, newText);
}

replaceOnce(
  '  gross_profit: number;\n  notes?: string | null;',
  '  gross_profit: number;\n  shipping_cost?: number | null;\n  notes?: string | null;',
  'Sale type shipping_cost'
);

replaceOnce(
  '  quantity: "1",\n  notes: "",\n};',
  '  quantity: "1",\n  shipping_cost: "",\n  notes: "",\n};',
  'Sale form shipping_cost'
);

const saveSaleOld = [
  '  const quantity = Number(',
  '    saleForm.quantity || 0',
  '  );',
  '',
  '  if (',
  '    unitPrice < 0 ||',
  '    unitCost < 0 ||',
  '    quantity <= 0',
  '  ) {',
  '    setMessage(',
  '      "販売価格・原価・数量を正しく入力してください。"',
  '    );',
  '    return;',
  '  }'
].join('\n');

const saveSaleNew = [
  '  const quantity = Number(',
  '    saleForm.quantity || 0',
  '  );',
  '',
  '  const shippingCost = Number(',
  '    saleForm.shipping_cost || 0',
  '  );',
  '',
  '  if (',
  '    unitPrice < 0 ||',
  '    unitCost < 0 ||',
  '    shippingCost < 0 ||',
  '    quantity <= 0',
  '  ) {',
  '    setMessage(',
  '      "販売価格・原価・送料・数量を正しく入力してください。"',
  '    );',
  '    return;',
  '  }'
].join('\n');
replaceOnce(saveSaleOld, saveSaleNew, 'saveSale validation');

const afterRpcOld = [
  '    // RPC処理失敗',
  '    if (!data?.success) {',
  '      setMessage(',
  '        "売上登録に失敗しました。"',
  '      );',
  '      return;',
  '    }',
  '',
  '    // ==========================================',
  '    // 登録成功',
  '    // ==========================================',
  '',
  '    setMessage(',
  '      "売上を登録しました。"',
  '    );'
].join('\n');

const shippingCode = [
  '    // 送料を保存し、DB側で送料込みの実質粗利を再計算',
  '    let saleId = data?.sale_id ?? data?.id ?? null;',
  '',
  '    if (!saleId) {',
  '      const { data: latestSale } = await supabase',
  '        .from("sales_history")',
  '        .select("id")',
  '        .eq("product_id", saleForm.product_id)',
  '        .eq("sale_date", saleForm.sale_date)',
  '        .order("created_at", { ascending: false })',
  '        .limit(1)',
  '        .maybeSingle();',
  '',
  '      saleId = latestSale?.id ?? null;',
  '    }',
  '',
  '    if (!saleId) {',
  '      setMessage("売上は登録されましたが、送料の保存先を特定できませんでした。");',
  '      setSaleForm(initialSaleForm);',
  '      await loadAll();',
  '      return;',
  '    }',
  '',
  '    const { data: shippingResult, error: shippingUpdateError } =',
  '      await supabase.rpc("set_sale_shipping_cost", {',
  '        p_sale_id: saleId,',
  '        p_shipping_cost: shippingCost,',
  '      });',
  '',
  '    if (shippingUpdateError) {',
  '      setMessage(`送料の保存に失敗しました：${shippingUpdateError.message}`);',
  '      return;',
  '    }',
  '',
  '    if (!shippingResult?.success) {',
  '      setMessage(`送料の保存に失敗しました：${shippingResult?.message || "不明なエラー"}`);',
  '      return;',
  '    }'
].join('\n');

if (!text.includes('set_sale_shipping_cost')) {
  replaceOnce(
    afterRpcOld,
    [
      '    // RPC処理失敗',
      '    if (!data?.success) {',
      '      setMessage(',
      '        "売上登録に失敗しました。"',
      '      );',
      '      return;',
      '    }',
      '',
      shippingCode,
      '',
      '    // ==========================================',
      '    // 登録成功',
      '    // ==========================================',
      '',
      '    setMessage(',
      '      "売上を登録しました。送料込みで粗利を計算しました。"',
      '    );'
    ].join('\n'),
    'saveSale shipping RPC'
  );
}

const formLabelOld = [
  '                  <label>',
  '                    数量*',
  '                    <input',
  '                      style={inputStyle}',
  '                      type="number"',
  '                      min="1"',
  '                      value={',
  '                        saleForm.quantity',
  '                      }',
  '                      onChange={(e) =>',
  '                        setSaleForm({',
  '                          ...saleForm,',
  '                          quantity:',
  '                            e.target.value,',
  '                        })',
  '                      }',
  '                    />',
  '                  </label>',
  '',
  '                  <label>',
  '                    メモ'
].join('\n');

const formLabelNew = [
  '                  <label>',
  '                    数量*',
  '                    <input',
  '                      style={inputStyle}',
  '                      type="number"',
  '                      min="1"',
  '                      value={',
  '                        saleForm.quantity',
  '                      }',
  '                      onChange={(e) =>',
  '                        setSaleForm({',
  '                          ...saleForm,',
  '                          quantity:',
  '                            e.target.value,',
  '                        })',
  '                      }',
  '                    />',
  '                  </label>',
  '',
  '                  <label>',
  '                    送料',
  '                    <input',
  '                      style={inputStyle}',
  '                      type="number"',
  '                      min="0"',
  '                      value={saleForm.shipping_cost}',
  '                      onChange={(e) =>',
  '                        setSaleForm({',
  '                          ...saleForm,',
  '                          shipping_cost: e.target.value,',
  '                        })',
  '                      }',
  '                      placeholder="例：750"',
  '                    />',
  '                  </label>',
  '',
  '                  <label>',
  '                    メモ'
].join('\n');
replaceOnce(formLabelOld, formLabelNew, 'Sales form shipping field');

const descriptionOld = '                販売価格とその時点の原価を記録して、粗利を自動計算します。';
const descriptionNew = '                販売価格・原価・送料を記録して、送料込みの実質粗利を自動計算します。';
if (text.includes(descriptionOld)) text = text.replace(descriptionOld, descriptionNew);

const previewOld = [
  '                  <strong',
  '                    style={{',
  '                      color: "#15803d",',
  '                    }}',
  '                  >',
  '                    粗利{" "}',
  '                    {yen(',
  '                      (Number(',
  '                        saleForm.unit_price ||',
  '                          0',
  '                      ) -',
  '                        Number(',
  '                          saleForm.unit_cost ||',
  '                            0',
  '                        )) *',
  '                        Number(',
  '                          saleForm.quantity || 0',
  '                        )',
  '                    )}',
  '                  </strong>'
].join('\n');

const previewNew = [
  '                  <strong>',
  '                    原価{" "}',
  '                    {yen(Number(saleForm.unit_cost || 0) * Number(saleForm.quantity || 0))}',
  '                  </strong>',
  '',
  '                  <strong>',
  '                    送料{" "}',
  '                    {yen(Number(saleForm.shipping_cost || 0))}',
  '                  </strong>',
  '',
  '                  <strong',
  '                    style={{',
  '                      color:',
  '                        (Number(saleForm.unit_price || 0) * Number(saleForm.quantity || 0) -',
  '                          Number(saleForm.unit_cost || 0) * Number(saleForm.quantity || 0) -',
  '                          Number(saleForm.shipping_cost || 0)) >= 0',
  '                          ? "#15803d"',
  '                          : "#dc2626",',
  '                    }}',
  '                  >',
  '                    実質粗利{" "}',
  '                    {yen(',
  '                      Number(saleForm.unit_price || 0) * Number(saleForm.quantity || 0) -',
  '                        Number(saleForm.unit_cost || 0) * Number(saleForm.quantity || 0) -',
  '                        Number(saleForm.shipping_cost || 0)',
  '                    )}',
  '                  </strong>'
].join('\n');
replaceOnce(previewOld, previewNew, 'Sales profit preview');

const recentHeaderOld = [
  '                      <th style={{ padding: 10 }}>',
  '                        売上',
  '                      </th>',
  '                      <th style={{ padding: 10 }}>',
  '                        粗利',
  '                      </th>'
].join('\n');
const recentHeaderNew = [
  '                      <th style={{ padding: 10 }}>',
  '                        売上',
  '                      </th>',
  '                      <th style={{ padding: 10 }}>',
  '                        送料',
  '                      </th>',
  '                      <th style={{ padding: 10 }}>',
  '                        粗利',
  '                      </th>'
].join('\n');
replaceOnce(recentHeaderOld, recentHeaderNew, 'Recent sales shipping header');

const recentRowOld = [
  '                          <td style={{ padding: 10 }}>',
  '                            {yen(',
  '                              sale.total_sales',
  '                            )}',
  '                          </td>',
  '',
  '                          <td',
  '                            style={{',
  '                              padding: 10,',
  '                              fontWeight: 700,',
  '                              color:'
].join('\n');
const recentRowNew = [
  '                          <td style={{ padding: 10 }}>',
  '                            {yen(',
  '                              sale.total_sales',
  '                            )}',
  '                          </td>',
  '',
  '                          <td style={{ padding: 10 }}>',
  '                            {yen(sale.shipping_cost)}',
  '                          </td>',
  '',
  '                          <td',
  '                            style={{',
  '                              padding: 10,',
  '                              fontWeight: 700,',
  '                              color:'
].join('\n');
replaceOnce(recentRowOld, recentRowNew, 'Recent sales shipping row');

const monthlyCostOld = [
  '  const monthlyCostTotal = monthSales.reduce(',
  '    (sum, sale) => sum + Number(sale.total_cost || 0),',
  '    0',
  '  );',
  '',
  '  const monthlyGrossProfit'
].join('\n');
const monthlyCostNew = [
  '  const monthlyCostTotal = monthSales.reduce(',
  '    (sum, sale) => sum + Number(sale.total_cost || 0),',
  '    0',
  '  );',
  '',
  '  const monthlyShippingTotal = monthSales.reduce(',
  '    (sum, sale) => sum + Number(sale.shipping_cost || 0),',
  '    0',
  '  );',
  '',
  '  const monthlyGrossProfit'
].join('\n');
replaceOnce(monthlyCostOld, monthlyCostNew, 'Monthly shipping total');

const grossCardMarker = [
  '              <div style={cardStyle}>',
  '                <div',
  '                  style={{',
  '                    color: "#6b7280",',
  '                    fontSize: 14,',
  '                  }}',
  '                >',
  '                  粗利'
].join('\n');
const shippingCard = [
  '              <div style={cardStyle}>',
  '                <div',
  '                  style={{',
  '                    color: "#6b7280",',
  '                    fontSize: 14,',
  '                  }}',
  '                >',
  '                  送料',
  '                </div>',
  '                <strong',
  '                  style={{',
  '                    fontSize: 28,',
  '                    display: "block",',
  '                    marginTop: 8,',
  '                  }}',
  '                >',
  '                  {yen(monthlyShippingTotal)}',
  '                </strong>',
  '                <div',
  '                  style={{',
  '                    marginTop: 5,',
  '                    color: "#6b7280",',
  '                  }}',
  '                >',
  '                  送料負担',
  '                </div>',
  '              </div>',
  '',
  grossCardMarker
].join('\n');
replaceOnce(grossCardMarker, shippingCard, 'Monthly shipping card');

fs.writeFileSync(file, text, 'utf8');
console.log('Applied shipping-aware sales profit UI and persistence handling.');
