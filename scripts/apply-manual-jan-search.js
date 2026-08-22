const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

if (!text.includes("async function searchJanManually")) {
  const functionMarker = "const startJanScanner = () => {";
  if (!text.includes(functionMarker)) {
    throw new Error("JAN scanner function marker was not found.");
  }

  const helper = `async function searchJanManually() {
  const jan = productForm.jan_code.replace(/\\D/g, "");

  if (!/^\\d{13}$/.test(jan)) {
    setMessage("JANコードは13桁で入力してください。");
    return;
  }

  await lookupProductByJan(jan);
}

`;

  text = text.replace(functionMarker, helper + functionMarker);
}

// The JAN JSX may have different indentation depending on which prebuild
// patches have already run. Locate it structurally instead of relying on
// exact whitespace.
const janPattern = /\s*<label>\s*JANコード[\s\S]*?(?=\s*<label>\s*SKU)/;

if (!janPattern.test(text)) {
  throw new Error("JAN input block could not be located.");
}

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

text = text.replace(janPattern, janBlock);
fs.writeFileSync(file, text, "utf8");
console.log("Applied manual JAN search and restored JAN input layout.");
