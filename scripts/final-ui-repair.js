const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const stateMarker = '  const [historyProductId, setHistoryProductId] = useState("");';

if (!text.includes('const [purchaseProductSearch, setPurchaseProductSearch]')) {
  if (!text.includes(stateMarker)) throw new Error("Search state marker was not found.");
  const block = `  const [purchaseProductSearch, setPurchaseProductSearch] = useState("");
  const [saleProductSearch, setSaleProductSearch] = useState("");

  const filteredPurchaseProducts = useMemo(() => {
    const keyword = purchaseProductSearch.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) =>
      [product.name, product.jan_code, product.sku, product.model_number, product.brand, product.category]
        .some((value) => String(value ?? "").toLowerCase().includes(keyword))
    );
  }, [products, purchaseProductSearch]);

  const filteredSaleProducts = useMemo(() => {
    const keyword = saleProductSearch.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) =>
      [product.name, product.jan_code, product.sku, product.model_number, product.brand, product.category]
        .some((value) => String(value ?? "").toLowerCase().includes(keyword))
    );
  }, [products, saleProductSearch]);

` + stateMarker;
  text = text.replace(stateMarker, block);
} else if (!text.includes("const filteredPurchaseProducts")) {
  const block = `  const filteredPurchaseProducts = purchaseProductSearch.trim()
    ? products.filter((product) => [product.name, product.jan_code, product.sku, product.model_number, product.brand, product.category].some((value) => String(value ?? "").toLowerCase().includes(purchaseProductSearch.trim().toLowerCase())))
    : products;

  const filteredSaleProducts = saleProductSearch.trim()
    ? products.filter((product) => [product.name, product.jan_code, product.sku, product.model_number, product.brand, product.category].some((value) => String(value ?? "").toLowerCase().includes(saleProductSearch.trim().toLowerCase())))
    : products;

` + stateMarker;
  text = text.replace(stateMarker, block);
}

function replaceFormField(tabMarker, nextLabelMarker, replacement, labelName) {
  const tabStart = text.indexOf(tabMarker);
  if (tabStart < 0) throw new Error(`${labelName} tab marker was not found.`);
  const fieldStart = text.indexOf("                  <label>", tabStart);
  const labelTextStart = text.indexOf(labelName, fieldStart);
  const nextLabel = text.indexOf(nextLabelMarker, fieldStart);
  if (fieldStart < 0 || labelTextStart < 0 || nextLabel < 0 || nextLabel <= fieldStart) {
    throw new Error(`${labelName} field boundaries were not found.`);
  }
  text = text.slice(0, fieldStart) + replacement + text.slice(nextLabel);
}

// Purchase: one search box + one product select + one JAN camera button.
const purchaseField = `                  <label>
                    商品*
                    <input
                      style={inputStyle}
                      type="search"
                      value={purchaseProductSearch}
                      onChange={(e) => setPurchaseProductSearch(e.target.value)}
                      placeholder="商品名・JAN・SKU・型番・ブランドで検索"
                    />
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                      {purchaseProductSearch.trim() ? filteredPurchaseProducts.length + "件が該当" : products.length + "件の商品から選択"}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                      <select
                        style={{ ...inputStyle, flex: 1 }}
                        value={purchaseForm.product_id}
                        onChange={(e) => setPurchaseForm({ ...purchaseForm, product_id: e.target.value })}
                      >
                        <option value="">商品を選択</option>
                        {filteredPurchaseProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}{product.jan_code ? "　[" + product.jan_code + "]" : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => startJanScanner("purchase")}
                        style={{ border: "none", background: "#15803d", color: "#fff", borderRadius: 10, padding: "12px 14px", fontWeight: 800, whiteSpace: "nowrap", cursor: "pointer" }}
                      >
                        📷 JAN
                      </button>
                    </div>
                  </label>
`;
replaceFormField('{tab === "purchases" && (', '                  <label>\n                    仕入日', purchaseField, '商品*');

// Sales: normalize to exactly one search box.
const saleField = `                  <label>
                    商品*
                    <input
                      style={inputStyle}
                      type="search"
                      value={saleProductSearch}
                      onChange={(e) => setSaleProductSearch(e.target.value)}
                      placeholder="商品名・JAN・SKU・型番・ブランドで検索"
                    />
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                      {saleProductSearch.trim() ? filteredSaleProducts.length + "件が該当" : products.length + "件の商品から選択"}
                    </div>
                    <select
                      style={{ ...inputStyle, marginTop: 6 }}
                      value={saleForm.product_id}
                      onChange={(e) => {
                        const product = products.find((item) => item.id === e.target.value);
                        setSaleForm({
                          ...saleForm,
                          product_id: e.target.value,
                          unit_price: product?.selling_price != null ? String(product.selling_price) : saleForm.unit_price,
                          unit_cost: product?.cost_price != null ? String(product.cost_price) : saleForm.unit_cost,
                        });
                        setSaleProductSearch("");
                      }}
                    >
                      <option value="">商品を選択</option>
                      {filteredSaleProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}{product.jan_code ? "　[" + product.jan_code + "]" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
`;
replaceFormField('{tab === "sales" && (', '                  <label>\n                    売上日', saleField, '商品*');

// Purchase scanning needs a video element on the purchase tab.
if (!text.includes("FINAL PURCHASE JAN SCANNER")) {
  const mainClose = text.lastIndexOf("</main>");
  if (mainClose < 0) throw new Error("Main closing tag was not found.");
  const scannerUi = `
        {/* FINAL PURCHASE JAN SCANNER */}
        {scanning && scannerTarget === "purchase" && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ width: "min(680px, 100%)", background: "#111827", borderRadius: 18, padding: 16, boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, marginBottom: 10 }}>📷 JANコード読取（仕入登録）</div>
              <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", display: "block", borderRadius: 12, background: "#000" }} />
              <div style={{ color: "#fff", textAlign: "center", marginTop: 10, fontWeight: 700 }}>{scannerMessage}</div>
              <button type="button" onClick={closeJanScanner} style={{ marginTop: 12, width: "100%", padding: "12px 16px", border: 0, borderRadius: 10, background: "#fff", color: "#111827", fontWeight: 800 }}>閉じる</button>
            </div>
          </div>
        )}
`;
  text = text.slice(0, mainClose) + scannerUi + text.slice(mainClose);
}

// Keep existing product action buttons visible at the right edge on mobile.
text = text.replace(
  '<td style={{ padding: 10 }}>\n                            <div\n                              style={{\n                                display: "flex",\n                                gap: 6,\n                                flexWrap: "wrap",\n                              }}',
  '<td style={{ padding: 10, position: "sticky", right: 0, background: "#fff", zIndex: 1 }}>\n                            <div\n                              style={{\n                                display: "flex",\n                                gap: 6,\n                                flexWrap: "wrap",\n                              }}'
);

fs.writeFileSync(file, text, "utf8");
console.log("Applied final UI repair: purchase JAN camera, single sales search, mobile product actions.");
