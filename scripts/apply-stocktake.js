const fs = require("fs");
const path = require("path");
const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");
const join = (lines) => lines.join("\n");

if (!text.includes('  | "stocktake";')) {
  text = text.replace('  | "sales";', '  | "sales"\n  | "stocktake";');
}

if (!text.includes("const [stocktakeSearch")) {
  const marker = join([
    '  const [saleForm, setSaleForm] =',
    '    useState(initialSaleForm);',
  ]);
  const addition = join([
    marker,
    '',
    '  const [stocktakeSearch, setStocktakeSearch] = useState("");',
    '  const [stocktakeCounts, setStocktakeCounts] = useState<Record<string, string>>({});',
    '  const [stocktakeStarted, setStocktakeStarted] = useState(false);',
    '  const [stocktakeSaving, setStocktakeSaving] = useState(false);',
  ]);
  if (!text.includes(marker)) throw new Error("sale form marker not found");
  text = text.replace(marker, addition);
}

if (!text.includes("const filteredStocktakeProducts")) {
  const marker = join([
    '  const lowStockProducts = products.filter(',
    '    (product) => Number(product.stock_quantity || 0) <= 0',
    '  );',
  ]);
  const addition = join([
    marker,
    '',
    '  const filteredStocktakeProducts = useMemo(() => {',
    '    const keyword = stocktakeSearch.trim().toLowerCase();',
    '    if (!keyword) return products;',
    '    return products.filter((product) =>',
    '      [product.name, product.jan_code, product.sku, product.model_number].some((value) =>',
    '        String(value ?? "").toLowerCase().includes(keyword)',
    '      )',
    '    );',
    '  }, [products, stocktakeSearch]);',
    '',
    '  const stocktakeCounted = Object.keys(stocktakeCounts).filter(',
    '    (id) => stocktakeCounts[id] !== ""',
    '  ).length;',
    '',
    '  const stocktakeDifference = products.reduce((sum, product) => {',
    '    const value = stocktakeCounts[product.id];',
    '    if (value === undefined || value === "") return sum;',
    '    return sum + Number(value) - Number(product.stock_quantity || 0);',
    '  }, 0);',
  ]);
  if (!text.includes(marker)) throw new Error("low stock marker not found");
  text = text.replace(marker, addition);
}

if (!text.includes("async function finalizeStocktake")) {
  const marker = join([
    '  const navButtonStyle = (',
    '    active: boolean',
    '  ): React.CSSProperties => ({',
  ]);
  const addition = join([
    '  function startStocktake() {',
    '    setStocktakeCounts({});',
    '    setStocktakeSearch("");',
    '    setStocktakeStarted(true);',
    '    setMessage("");',
    '  }',
    '',
    '  function setStocktakeCount(productId: string, value: string) {',
    '    const normalized = value.replace(/[^0-9]/g, "");',
    '    setStocktakeCounts((prev) => ({ ...prev, [productId]: normalized }));',
    '  }',
    '',
    '  async function finalizeStocktake() {',
    '    const items = products',
    '      .filter((product) => stocktakeCounts[product.id] !== undefined && stocktakeCounts[product.id] !== "")',
    '      .map((product) => ({ product_id: product.id, counted_stock: Number(stocktakeCounts[product.id]) }));',
    '',
    '    if (items.length === 0) {',
    '      setMessage("棚卸し数量を1件以上入力してください。");',
    '      return;',
    '    }',
    '',
    '    if (items.length < products.length) {',
    '      const ok = window.confirm(',
    '        "未カウントの商品が " + (products.length - items.length) + " 件あります。\\n入力した商品のみ棚卸しを確定します。よろしいですか？"',
    '      );',
    '      if (!ok) return;',
    '    }',
    '',
    '    if (!window.confirm("棚卸しを確定しますか？\\n対象 " + items.length + " 商品\\n差異合計 " + (stocktakeDifference >= 0 ? "+" : "") + stocktakeDifference + " 個")) return;',
    '',
    '    setStocktakeSaving(true);',
    '    setMessage("");',
    '    try {',
    '      const { data, error } = await supabase.rpc("finalize_stocktake", { p_items: items });',
    '      if (error) {',
    '        setMessage("棚卸し確定エラー：" + error.message);',
    '        return;',
    '      }',
    '      if (!data?.success) {',
    '        setMessage("棚卸し確定エラー：" + (data?.message || "確定処理に失敗しました。"));',
    '        return;',
    '      }',
    '      setMessage("棚卸しを確定しました。" + items.length + "商品を更新しました。");',
    '      setStocktakeCounts({});',
    '      setStocktakeStarted(false);',
    '      await loadAll();',
    '    } catch (error: any) {',
    '      setMessage("棚卸し確定エラー：" + (error?.message || "予期しないエラーが発生しました。"));',
    '    } finally {',
    '      setStocktakeSaving(false);',
    '    }',
    '  }',
    '',
    marker,
  ]);
  if (!text.includes(marker)) throw new Error("nav marker not found");
  text = text.replace(marker, addition);
}

if (!text.includes('tab === "stocktake"')) {
  const marker = join([
    '          <button',
    '            style={navButtonStyle(',
    '              tab === "sales"',
    '            )}',
    '            onClick={() => setTab("sales")}',
    '          >',
    '            💰 売上登録',
    '          </button>',
  ]);
  const addition = join([
    marker,
    '',
    '          <button',
    '            style={navButtonStyle(',
    '              tab === "stocktake"',
    '            )}',
    '            onClick={() => setTab("stocktake")}',
    '          >',
    '            📋 棚卸し',
    '          </button>',
  ]);
  if (!text.includes(marker)) throw new Error("sales nav marker not found");
  text = text.replace(marker, addition);
}

if (!text.includes('id="stocktake-panel"')) {
  const marker = '        {tab === "sales" && (';
  const ui = join([
    '        {tab === "stocktake" && (',
    '          <>',
    '            <section style={cardStyle}>',
    '              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap" }}>',
    '                <div>',
    '                  <h2 style={{ marginBottom: 6 }}>📋 棚卸し</h2>',
    '                  <p style={{ color: "#6b7280", margin: 0 }}>システム在庫と実在庫を照合して、差異を確認・確定できます。</p>',
    '                </div>',
    '                {!stocktakeStarted ? (',
    '                  <button type="button" onClick={startStocktake} style={{ border: "none", background: "#111827", color: "#fff", padding: "12px 22px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>',
    '                    棚卸しを開始',
    '                  </button>',
    '                ) : (',
    '                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>',
    '                    <button type="button" onClick={() => setStocktakeCounts(Object.fromEntries(products.map((p) => [p.id, String(p.stock_quantity || 0)])))} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700, cursor: "pointer" }}>',
    '                      システム在庫を全入力',
    '                    </button>',
    '                    <button type="button" onClick={finalizeStocktake} disabled={stocktakeSaving} style={{ border: "none", background: "#15803d", color: "#fff", padding: "10px 16px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>',
    '                      {stocktakeSaving ? "確定中…" : "✅ 棚卸しを確定"}',
    '                    </button>',
    '                  </div>',
    '                )}',
    '              </div>',
    '            </section>',
    '',
    '            {!stocktakeStarted ? (',
    '              <section style={cardStyle}>',
    '                <h3>棚卸しの流れ</h3>',
    '                <ol style={{ lineHeight: 2, color: "#374151" }}>',
    '                  <li>「棚卸しを開始」を押す</li>',
    '                  <li>商品を検索し、実際の在庫数を入力する</li>',
    '                  <li>システム在庫との差異を確認する</li>',
    '                  <li>「棚卸しを確定」で在庫を更新する</li>',
    '                </ol>',
    '              </section>',
    '            ) : (',
    '              <>',
    '                <section id="stocktake-panel" style={cardStyle}>',
    '                  <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 12, alignItems: "end" }}>',
    '                    <label>商品検索（商品名・JAN・SKU・型番）<input style={inputStyle} value={stocktakeSearch} onChange={(e) => setStocktakeSearch(e.target.value)} placeholder="商品名やJANで検索" /></label>',
    '                    <div style={{ fontWeight: 700 }}>入力済み {stocktakeCounted} / {products.length}件　差異 {stocktakeDifference >= 0 ? "+" : ""}{stocktakeDifference}個</div>',
    '                  </div>',
    '                </section>',
    '',
    '                <section style={cardStyle}>',
    '                  <div style={{ overflowX: "auto" }}>',
    '                    <table style={{ width: "100%", borderCollapse: "collapse" }}>',
    '                      <thead>',
    '                        <tr>',
    '                          <th style={{ textAlign: "left", padding: 10 }}>商品</th>',
    '                          <th style={{ textAlign: "left", padding: 10 }}>JAN</th>',
    '                          <th style={{ textAlign: "right", padding: 10 }}>システム在庫</th>',
    '                          <th style={{ textAlign: "right", padding: 10 }}>実在庫</th>',
    '                          <th style={{ textAlign: "right", padding: 10 }}>差異</th>',
    '                        </tr>',
    '                      </thead>',
    '                      <tbody>',
    '                        {filteredStocktakeProducts.map((product) => {',
    '                          const counted = stocktakeCounts[product.id];',
    '                          const diff = counted === undefined || counted === "" ? null : Number(counted) - Number(product.stock_quantity || 0);',
    '                          return (',
    '                            <tr key={product.id} style={{ borderTop: "1px solid #f1f5f9" }}>',
    '                              <td style={{ padding: 10 }}><strong>{product.name}</strong><div style={{ fontSize: 12, color: "#6b7280" }}>{product.model_number || ""}</div></td>',
    '                              <td style={{ padding: 10 }}>{product.jan_code || "—"}</td>',
    '                              <td style={{ padding: 10, textAlign: "right", fontWeight: 700 }}>{Number(product.stock_quantity || 0)}</td>',
    '                              <td style={{ padding: 10, textAlign: "right" }}><input type="number" min="0" style={{ ...inputStyle, width: 120, marginLeft: "auto" }} value={counted ?? ""} placeholder="未入力" onChange={(e) => setStocktakeCount(product.id, e.target.value)} /></td>',
    '                              <td style={{ padding: 10, textAlign: "right", fontWeight: 700, color: diff === null ? "#6b7280" : diff === 0 ? "#15803d" : "#dc2626" }}>{diff === null ? "—" : (diff >= 0 ? "+" : "") + diff}</td>',
    '                            </tr>',
    '                          );',
    '                        })}',
    '                      </tbody>',
    '                    </table>',
    '                  </div>',
    '                  {filteredStocktakeProducts.length === 0 && <p>該当する商品がありません。</p>}',
    '                </section>',
    '              </>',
    '            )}',
    '          </>',
    '        )}',
    '',
    marker,
  ]);
  if (!text.includes(marker)) throw new Error("sales tab marker not found");
  text = text.replace(marker, ui);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied stocktake UI patch.");
