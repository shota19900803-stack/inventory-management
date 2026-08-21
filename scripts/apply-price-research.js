const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");
const join = (lines) => lines.join("\n");

if (!text.includes("const [priceResearch, setPriceResearch]")) {
  const marker = join([
    '  const [saleForm, setSaleForm] =',
    '    useState(initialSaleForm);',
  ]);
  const addition = join([
    marker,
    '',
    '  const [priceResearch, setPriceResearch] = useState<any>(null);',
    '  const [priceResearchLoading, setPriceResearchLoading] = useState(false);',
  ]);
  if (!text.includes(marker)) throw new Error("sale form marker not found");
  text = text.replace(marker, addition);
}

if (!text.includes("async function researchPrices")) {
  const marker = join([
    '  function resetProductForm() {',
    '    setEditingProductId(null);',
    '    setProductForm(initialProductForm);',
    '  }',
  ]);
  const addition = join([
    marker,
    '',
    '  async function researchPrices(janValue = productForm.jan_code) {',
    '    const jan = String(janValue || "").replace(/\\D/g, "");',
    '    if (jan.length !== 13) {',
    '      setMessage("価格リサーチには13桁のJANコードが必要です。");',
    '      return;',
    '    }',
    '    setPriceResearchLoading(true);',
    '    setPriceResearch(null);',
    '    try {',
    '      const response = await fetch(`/api/price-research?jan=${encodeURIComponent(jan)}`, { cache: "no-store" });',
    '      const data = await response.json();',
    '      if (!response.ok) throw new Error(data?.error || "価格情報を取得できませんでした。");',
    '      setPriceResearch(data);',
    '    } catch (error: any) {',
    '      setMessage(`価格リサーチエラー：${error?.message || "取得に失敗しました。"}`);',
    '    } finally {',
    '      setPriceResearchLoading(false);',
    '    }',
    '  }',
  ]);
  if (!text.includes(marker)) throw new Error("product reset marker not found");
  text = text.replace(marker, addition);
}

if (!text.includes('id="price-research-panel"')) {
  const sectionMarker = join([
    '            </section>',
    '',
    '            <section style={cardStyle}>',
    '              <h2>最近の仕入</h2>',
  ]);

  const ui = join([
    '            <section id="price-research-panel" style={cardStyle}>',
    '              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>',
    '                <div>',
    '                  <h2 style={{ margin: 0 }}>💰 仕入れ価格リサーチ</h2>',
    '                  <p style={{ margin: "6px 0 0", color: "#6b7280" }}>JANから楽天市場・Amazonの価格を確認できます。</p>',
    '                </div>',
    '                <button type="button" disabled={priceResearchLoading} onClick={() => researchPrices()} style={{ border: "none", background: "#111827", color: "#fff", padding: "11px 18px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>',
    '                  {priceResearchLoading ? "検索中…" : "🔎 価格を調べる"}',
    '                </button>',
    '              </div>',
    '              {priceResearch && (',
    '                <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 15 }}>',
    '                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>',
    '                    <h3 style={{ marginTop: 0 }}>🔴 楽天市場</h3>',
    '                    <div style={{ fontSize: 28, fontWeight: 800 }}>{priceResearch.rakuten?.lowestPrice != null ? yen(priceResearch.rakuten.lowestPrice) : "取得不可"}</div>',
    '                    <div style={{ marginTop: 8, color: "#6b7280", fontSize: 13 }}>JAN：{priceResearch.jan}</div>',
    '                    {priceResearch.rakuten?.items?.slice(0, 5).map((item: any, index: number) => (',
    '                      <div key={`${item.shopName}-${index}`} style={{ padding: "10px 0", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 10 }}>',
    '                        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700 }}>{item.shopName || "ショップ不明"}</div>{item.itemUrl && <a href={item.itemUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>商品を見る</a>}</div>',
    '                        <strong style={{ whiteSpace: "nowrap" }}>{yen(item.price)}</strong>',
    '                      </div>',
    '                    ))}',
    '                    {priceResearch.rakuten?.error && !priceResearch.rakuten?.items?.length && <p style={{ color: "#6b7280" }}>{priceResearch.rakuten.error}</p>}',
    '                    <a href={priceResearch.price2alert} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10 }}>📈 Price2Alertで価格推移を見る</a>',
    '                  </div>',
    '                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>',
    '                    <h3 style={{ marginTop: 0 }}>🟠 Amazon</h3>',
    '                    {priceResearch.amazon?.lowestPrice != null ? <div style={{ fontSize: 28, fontWeight: 800 }}>{yen(priceResearch.amazon.lowestPrice)}</div> : <p style={{ color: "#6b7280" }}>Amazonの公式API情報を取得するには認証設定が必要です。</p>}',
    '                    <p style={{ color: "#6b7280", fontSize: 13 }}>新品のOffer情報はAmazon Creators APIを使用します。Amazonの商品ページを直接スクレイピングする方式は使いません。</p>',
    '                    <a href={priceResearch.amazon?.productUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8 }}>Amazonで商品を見る</a>',
    '                  </div>',
    '                </div>',
    '              )}',
    '            </section>',
    '',
  ]);

  if (!text.includes(sectionMarker)) throw new Error("purchase section marker not found");
  text = text.replace(sectionMarker, '            </section>\n\n' + ui + '            <section style={cardStyle}>\n              <h2>最近の仕入</h2>');
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied price research UI patch.");
