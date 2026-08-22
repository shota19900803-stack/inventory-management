const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

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

// Fix the PC JAN input layout. The previous scanner patch left a nested
// <label> around the scanner/search buttons, which could collapse the JAN
// input to almost zero width on desktop. Keep the mobile scanner behavior,
// but make the input and action buttons explicit flex items.
const oldJanLayout = `    <input\n      style={{\n        ...inputStyle,\n        flex: 1,\n      }}\n      inputMode="numeric"\n      value={productForm.jan_code}\n      onChange={(e) =>\n        setProductForm({\n          ...productForm,\n          jan_code: e.target.value,\n        })\n      }\n      placeholder="JANコードを入力"\n    />\n\n    <label\n      style={{\n        display: "inline-flex",\n        alignItems: "center",\n        justifyContent: "center",\n        padding: "12px 16px",\n        background: "#15803d",\n        color: "#fff",\n        borderRadius: 10,\n        fontWeight: 700,\n        cursor: "pointer",\n        whiteSpace: "nowrap",\n      }}\n    >\n <div style={{ display: "flex", gap: 10, alignItems: "center" }}>\n  <button\n    type="button"\n    onClick={startJanScanner}\n    style={{\n      padding: "12px 18px",\n      background: "#15803d",\n      color: "#fff",\n      border: "none",\n      borderRadius: 10,\n      fontWeight: 700,\n      cursor: "pointer",\n      whiteSpace: "nowrap",\n    }}\n  >\n    📷 JAN読取\n  </button>`;

const newJanLayout = `    <input\n      style={{\n        ...inputStyle,\n        flex: "1 1 280px",\n        minWidth: 0,\n      }}\n      inputMode="numeric"\n      value={productForm.jan_code}\n      onChange={(e) =>\n        setProductForm({\n          ...productForm,\n          jan_code: e.target.value,\n        })\n      }\n      placeholder="JANコードを入力"\n    />\n\n    <div\n      style={{\n        display: "flex",\n        gap: 10,\n        alignItems: "center",\n        flexShrink: 0,\n      }}\n    >\n      <button\n        type="button"\n        onClick={startJanScanner}\n        style={{\n          padding: "12px 18px",\n          background: "#15803d",\n          color: "#fff",\n          border: "none",\n          borderRadius: 10,\n          fontWeight: 700,\n          cursor: "pointer",\n          whiteSpace: "nowrap",\n        }}\n      >\n        📷 JAN読取\n      </button>`;

if (source.includes(newJanLayout)) {
  console.log("PC JAN input layout patch already applied.");
} else if (source.includes(oldJanLayout)) {
  source = source.replace(oldJanLayout, newJanLayout);
  source = source.replace(`    </label>\n  </div>\n</label>\n                  <label>\n                    SKU`, `    </div>\n  </div>\n</label>\n                  <label>\n                    SKU`);
  console.log("Applied PC JAN input layout patch.");
} else {
  throw new Error("JAN input layout marker not found.");
}

fs.writeFileSync(file, source, "utf8");
console.log("JAN scanner fullscreen and PC input layout patches complete.");
