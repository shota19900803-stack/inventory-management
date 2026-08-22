const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const productsStart = text.indexOf('        {tab === "products" && (');
const purchasesStart = text.indexOf('        {tab === "purchases" && (', productsStart + 1);

if (productsStart === -1 || purchasesStart === -1) {
  throw new Error("Product/purchase tab markers were not found.");
}

let productsBlock = text.slice(productsStart, purchasesStart);

// A previous UI patch accidentally inserted the purchase-registration form
// into the product-registration form. Remove that whole injected section,
// while keeping the product form's own grid intact.
const purchaseFieldMarker = /\n\s*<label>\s*\n\s*商品\*\s*\n\s*<select[\s\S]*?(?=\n\s*<div\s*\n\s*style=\{\{\s*\n\s*display:\s*"flex",\s*\n\s*gap:\s*10,\s*\n\s*marginTop:\s*20,\s*\n\s*\}\}\s*\n\s*>)/;

if (purchaseFieldMarker.test(productsBlock)) {
  productsBlock = productsBlock.replace(
    purchaseFieldMarker,
    '\n                </div>\n\n'
  );
}

// Normalize the JAN field to one clean, valid JSX block. This also removes
// any nested <label> structure left by older scanner patches.
const janPattern = /\n\s*<label>\s*JANコード[\s\S]*?(?=\n\s*<label>\s*\n\s*SKU)/;

const janBlock = `
                  <div>
                    <label style={{ display: "block", marginBottom: 6 }}>
                      JANコード
                    </label>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "stretch",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        style={{
                          ...inputStyle,
                          flex: "1 1 280px",
                          minWidth: 0,
                        }}
                        inputMode="numeric"
                        value={productForm.jan_code}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            jan_code: e.target.value,
                          })
                        }
                        placeholder="JANコードを入力"
                      />

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        <button
                          type="button"
                          onClick={startJanScanner}
                          style={{
                            padding: "12px 16px",
                            background: "#15803d",
                            color: "#fff",
                            border: "none",
                            borderRadius: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          📷 JAN読取
                        </button>

                        <button
                          type="button"
                          onClick={searchJanManually}
                          style={{
                            padding: "12px 16px",
                            background: "#2563eb",
                            color: "#fff",
                            border: "none",
                            borderRadius: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          🔎 JAN検索
                        </button>
                      </div>
                    </div>

                    {scanning && (
                      <div
                        style={{
                          position: "fixed",
                          inset: 0,
                          zIndex: 9999,
                          background: "rgba(0,0,0,0.94)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 20,
                          boxSizing: "border-box",
                        }}
                      >
                        <div
                          style={{
                            width: "min(92vw, 720px)",
                            color: "#fff",
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              marginBottom: 12,
                            }}
                          >
                            📷 JANコードをカメラに映してください
                          </div>

                          <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            style={{
                              width: "100%",
                              maxHeight: "72vh",
                              minHeight: 280,
                              objectFit: "contain",
                              display: "block",
                              background: "#000",
                              borderRadius: 12,
                            }}
                          />

                          <div
                            style={{
                              marginTop: 10,
                              fontSize: 14,
                              color: "#d1d5db",
                            }}
                          >
                            {scannerMessage}
                          </div>

                          <button
                            type="button"
                            onClick={closeJanScanner}
                            style={{
                              marginTop: 14,
                              width: "100%",
                              padding: "12px 16px",
                              background: "#fff",
                              color: "#111827",
                              border: "none",
                              borderRadius: 10,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            閉じる
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
`;

if (!janPattern.test(productsBlock)) {
  throw new Error("Product JAN input block was not found.");
}
productsBlock = productsBlock.replace(janPattern, janBlock);

// Product master should not expose the old manual stock/reference-price
// fields. Inventory is managed through actual purchase/sale history.
productsBlock = productsBlock.replace(
  /\n\s*<label>\s*\n\s*在庫数[\s\S]*?<\/label>/g,
  ""
);
productsBlock = productsBlock.replace(
  /\n\s*<label>\s*\n\s*現在の参考仕入価格[\s\S]*?<\/label>/g,
  ""
);
productsBlock = productsBlock.replace(
  /\n\s*<label>\s*\n\s*現在の参考販売価格[\s\S]*?<\/label>/g,
  ""
);

text = text.slice(0, productsStart) + productsBlock + text.slice(purchasesStart);
fs.writeFileSync(file, text, "utf8");
console.log("Repaired product form: removed accidental purchase fields and normalized JAN controls.");
