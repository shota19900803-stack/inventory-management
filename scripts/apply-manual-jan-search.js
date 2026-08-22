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

// Replace the entire JAN field with one clean, predictable layout.
// The previous patch accidentally nested the scanner controls inside a <label>,
// which made the input collapse to a tiny box and hid the JAN検索 button.
const janStart = text.indexOf("                  <label>\n  JANコード");
const janEndMarker = "                  <label>\n                    SKU";
const janEnd = text.indexOf(janEndMarker, janStart);

if (janStart === -1 || janEnd === -1) {
  throw new Error("JAN input layout block was not found.");
}

const janBlock = `                  <label>
                    JANコード
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "stretch",
                      }}
                    >
                      <input
                        style={{
                          ...inputStyle,
                          flex: 1,
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
                  </label>
`;

text = text.slice(0, janStart) + janBlock + text.slice(janEnd);

fs.writeFileSync(file, text, "utf8");
console.log("Applied manual JAN search and restored JAN input layout.");
