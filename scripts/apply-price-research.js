const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

function insertOnce(marker, addition, errorMessage) {
  if (text.includes(addition.trim())) return;
  const index = text.indexOf(marker);
  if (index === -1) throw new Error(errorMessage);
  text = text.slice(0, index) + addition + text.slice(index);
}

// State
if (!text.includes("const [priceResearch, setPriceResearch]")) {
  const marker = '  const [saleForm, setSaleForm] =\n    useState(initialSaleForm);';
  const addition = marker + '\n\n  const [priceResearch, setPriceResearch] = useState<any>(null);\n  const [priceResearchLoading, setPriceResearchLoading] = useState(false);';
  if (!text.includes(marker)) throw new Error("sale form marker not found");
  text = text.replace(marker, addition);
}

// Research function. It uses the selected product in the purchase form.
if (!text.includes("async function researchPurchasePrices")) {
  const marker = '  function resetProductForm() {';
  const addition = `  async function researchPurchasePrices() {
    const selectedProduct = productMap[purchaseForm.product_id];
    const jan = String(selectedProduct?.jan_code || "").replace(/\\D/g, "");

    if (jan.length !== 13) {
      setMessage("相場チェックには、JANコードが登録された商品を選択してください。");
      return;
    }

    setPriceResearchLoading(true);
    setPriceResearch(null);
    setMessage("");

    try {
      const response = await fetch(
        \`/api/price-research?jan=\${encodeURIComponent(jan)}\`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "価格情報を取得できませんでした。");
      }
      setPriceResearch(data);
    } catch (error: any) {
      setMessage(\`相場チェックエラー：\${error?.message || "取得に失敗しました。"}\`);
    } finally {
      setPriceResearchLoading(false);
    }
  }

`;
  if (!text.includes(marker)) throw new Error("product reset marker not found");
  text = text.replace(marker, addition + marker);
}

// Put the price research directly below the purchase registration form.
if (!text.includes('id="purchase-price-research"')) {
  const purchasesMarker = '{tab === "purchases" && (';
  const purchasesStart = text.indexOf(purchasesMarker);
  if (purchasesStart === -1) throw new Error("purchase tab marker not found");

  const formEnd = text.indexOf("</form>", purchasesStart);
  if (formEnd === -1) throw new Error("purchase registration form end not found");

  const insertAt = formEnd + "</form>".length;
  const ui = `

            <section id="purchase-price-research" style={{ ...cardStyle, marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0 }}>💰 相場チェック</h2>
                  <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
                    仕入登録で選択した商品を、JANコードから楽天市場の相場とAmazonの商品ページで確認できます。
                  </p>
                </div>
                <button
                  type="button"
                  disabled={priceResearchLoading || !purchaseForm.product_id}
                  onClick={researchPurchasePrices}
                  style={{ border: "none", background: "#111827", color: "#fff", padding: "11px 18px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}
                >
                  {priceResearchLoading ? "検索中…" : "🔎 相場をチェック"}
                </button>
              </div>

              {!purchaseForm.product_id && (
                <p style={{ marginTop: 14, color: "#6b7280" }}>まず仕入登録の商品を選択してください。</p>
              )}

              {purchaseForm.product_id && !priceResearch && (
                <p style={{ marginTop: 14, color: "#6b7280" }}>
                  商品を選択したら「相場をチェック」を押してください。
                </p>
              )}

              {priceResearch && (
                <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 15 }}>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
                    <h3 style={{ margin: "0 0 8px" }}>🔴 楽天市場</h3>
                    <div style={{ fontSize: 28, fontWeight: 800 }}>
                      {priceResearch.rakuten?.lowestPrice != null ? yen(priceResearch.rakuten.lowestPrice) : "取得不可"}
                    </div>
                    <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>JAN：{priceResearch.jan}</div>
                    {priceResearch.rakuten?.items?.slice(0, 5).map((item: any, index: number) => (
                      <div key={\`purchase-price-\${item.shopName}-\${index}\`} style={{ padding: "10px 0", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>{item.shopName || "ショップ不明"}</div>
                          {item.itemUrl && <a href={item.itemUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>商品を見る</a>}
                        </div>
                        <strong style={{ whiteSpace: "nowrap" }}>{yen(item.price)}</strong>
                      </div>
                    ))}
                    {priceResearch.rakuten?.error && !priceResearch.rakuten?.items?.length && (
                      <p style={{ color: "#6b7280" }}>{priceResearch.rakuten.error}</p>
                    )}
                    <a href={priceResearch.price2alert} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10 }}>
                      📈 価格推移を見る
                    </a>
                  </div>

                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
                    <h3 style={{ margin: "0 0 8px" }}>🟠 Amazon</h3>
                    {priceResearch.amazon?.lowestPrice != null ? (
                      <div style={{ fontSize: 28, fontWeight: 800 }}>{yen(priceResearch.amazon.lowestPrice)}</div>
                    ) : (
                      <p style={{ color: "#6b7280" }}>Amazonの価格情報は現在API認証が必要です。</p>
                    )}
                    <a href={priceResearch.amazon?.productUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8 }}>
                      Amazonで商品を見る
                    </a>
                  </div>
                </div>
              )}
            </section>`;

  text = text.slice(0, insertAt) + ui + text.slice(insertAt);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied purchase price research UI patch.");
