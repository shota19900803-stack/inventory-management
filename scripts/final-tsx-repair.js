const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// Repair malformed sibling buttons in the monthly sales action cell.
// JSX requires multiple siblings to be wrapped in a fragment/container.
text = text.replace(
  /(<button\s+type="button"\s+onClick=\{\(\) => editSale\(sale\)\}[\s\S]*?<\/button>)\s*(<button\s+type="button"\s+onClick=\{\(\) => cancelSale\(sale\)\}[\s\S]*?<\/button>)/,
  "<>$1$2</>"
);

// Repair the product JAN field if repeated scanner UI was inserted inside
// the label. Keep one clean JAN input + scanner button.
const janStart = text.indexOf("                  <label>\n  JANコード");
const skuStart = janStart >= 0
  ? text.indexOf("                  <label>\n                    SKU", janStart)
  : -1;

if (janStart >= 0 && skuStart > janStart) {
  const janBlock = `                  <label>\n                    JANコード\n                    <div\n                      style={{\n                        display: "flex",\n                        gap: 8,\n                        alignItems: "center",\n                      }}\n                    >\n                      <input\n                        style={{ ...inputStyle, flex: 1 }}\n                        inputMode="numeric"\n                        value={productForm.jan_code}\n                        onChange={(e) =>\n                          setProductForm({\n                            ...productForm,\n                            jan_code: e.target.value,\n                          })\n                        }\n                        placeholder="JANコードを入力"\n                      />\n                      <button\n                        type="button"\n                        onClick={() => startJanScanner("product")}\n                        style={{\n                          border: "none",\n                          background: "#15803d",\n                          color: "#fff",\n                          borderRadius: 10,\n                          padding: "12px 14px",\n                          fontWeight: 800,\n                          whiteSpace: "nowrap",\n                        }}\n                      >\n                        📷 JAN\n                      </button>\n                    </div>\n                  </label>\n\n`;
  text = text.slice(0, janStart) + janBlock + text.slice(skuStart);
}

// ZXing 0.2.x is valid at runtime, but the static class import can surface
// as a type-only value error in the Next.js TypeScript build. Use a dynamic
// import and an explicit runtime constructor instead.
text = text.replace(
  'import { BrowserMultiFormatReader } from "@zxing/browser";\n',
  ""
);

text = text.replace(
  'const scannerRef = useRef<BrowserMultiFormatReader | null>(null);',
  'const scannerRef = useRef<any>(null);'
);

text = text.replace(
  '      const reader =\n        new BrowserMultiFormatReader();',
  '      const ZXingBrowser = await import("@zxing/browser");\n      const Reader = ZXingBrowser.BrowserMultiFormatReader as any;\n      const reader = new Reader();'
);

// If an earlier repair left the old constructor on one line, fix that too.
text = text.replace(
  '      const reader = new BrowserMultiFormatReader();',
  '      const ZXingBrowser = await import("@zxing/browser");\n      const Reader = ZXingBrowser.BrowserMultiFormatReader as any;\n      const reader = new Reader();'
);

// If the monthly sales cell still contains the unwrapped pair, fix it using
// a narrower exact replacement as a second safety net.
text = text.replace(
  /(<button\s+type="button"\s+onClick=\{\(\) => editSale\(sale\)\}[\s\S]*?<\/button>)\n\s*(<button\s+type="button"\s+onClick=\{\(\) => cancelSale\(sale\)\}[\s\S]*?<\/button>)/,
  "<>$1$2</>"
);

fs.writeFileSync(file, text, "utf8");
console.log("Applied final TSX syntax + ZXing repair.");
