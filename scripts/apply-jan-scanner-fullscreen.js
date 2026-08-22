const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

// Make the JAN scanner a full-screen camera view on phones/tablets.
const oldBlock = `      marginTop: 16,\n      padding: 10,\n      background: "#000",\n      borderRadius: 14,\n      width: "100%",\n      boxSizing: "border-box",`;

const newBlock = `      position: "fixed",\n      inset: 0,\n      zIndex: 9999,\n      margin: 0,\n      padding: 16,\n      background: "rgba(0,0,0,0.94)",\n      borderRadius: 0,\n      width: "100vw",\n      height: "100vh",\n      boxSizing: "border-box",\n      display: "flex",\n      flexDirection: "column",\n      justifyContent: "center",\n      overflowY: "auto",`;

if (source.includes(newBlock)) {
  console.log("JAN scanner fullscreen patch already applied.");
} else if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
  console.log("Applied JAN scanner fullscreen patch.");
} else {
  throw new Error("JAN scanner container style marker not found.");
}

const oldVideo = `        width: "100%",\n        height: "min(68vh, 520px)",\n        minHeight: 320,\n        display: "block",\n        objectFit: "cover",\n        borderRadius: 10,`;
const newVideo = `        width: "100%",\n        height: "min(72vh, 620px)",\n        minHeight: "45vh",\n        display: "block",\n        objectFit: "contain",\n        borderRadius: 12,\n        background: "#111",`;

if (source.includes(oldVideo)) {
  source = source.replace(oldVideo, newVideo);
}

// Rebuild the entire JAN input JSX block cleanly. Previous incremental patches
// introduced nested <label> elements and an extra closing tag, which caused
// the production TypeScript/JSX build to fail around the SKU field.
const janBlockPattern = /                  <label>\n  JANコード[\\s\\S]*?                  <label>\n                    SKU/;

const cleanJanBlock = `                  <label>
                    JANコード
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
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
                          gap: 10,
                          alignItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <button
                          type="button"
                          onClick={startJanScanner}
                          style={{
                            padding: "12px 18px",
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
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "none",
                            background: "#2563eb",
                            color: "#fff",
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
                          margin: 0,
                          padding: 16,
                          background: "rgba(0,0,0,0.94)",
                          borderRadius: 0,
                          width: "100vw",
                          height: "100vh",
                          boxSizing: "border-box",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          overflowY: "auto",
                        }}
                      >
                        <video
                          ref={videoRef}
                          autoPlay
                          muted
                          playsInline
                          style={{
                            width: "100%",
                            height: "min(72vh, 620px)",
                            minHeight: "45vh",
                            display: "block",
                            objectFit: "contain",
                            borderRadius: 12,
                            background: "#111",
                          }}
                        />

                        <div
                          style={{
                            color: "#fff",
                            textAlign: "center",
                            marginTop: 10,
                            fontWeight: 700,
                          }}
                        >
                          📷 JANコードをカメラに映してください
                        </div>

                        <button
                          type="button"
                          onClick={() => setScanning(false)}
                          style={{
                            marginTop: 10,
                            width: "100%",
                            padding: "10px",
                            background: "#fff",
                            color: "#111827",
                            border: "none",
                            borderRadius: 8,
                            fontWeight: 700,
                          }}
                        >
                          閉じる
                        </button>
                      </div>
                    )}
                  </label>
                  <label>
                    SKU`;

if (janBlockPattern.test(source)) {
  source = source.replace(janBlockPattern, cleanJanBlock);
  console.log("Rebuilt JAN input JSX block.");
} else {
  throw new Error("JAN input JSX block marker not found.");
}

fs.writeFileSync(file, source, "utf8");
console.log("JAN scanner fullscreen and JSX layout patch complete.");
