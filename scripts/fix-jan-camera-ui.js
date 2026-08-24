const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// iPhoneでJANを合わせやすいよう、カメラ映像を大きくする。
// 既存のZXing読み取り処理は変更しない。
text = text.replace(
  /style=\{\{\s*width: "100%",\s*display: "block",\s*borderRadius: 8,\s*\}\}/,
  `style={{
        width: "100%",
        height: "min(58vh, 520px)",
        minHeight: 320,
        display: "block",
        objectFit: "cover",
        borderRadius: 10,
        background: "#111",
      }}`
);

// カメラコンテナ自体もスマホでは余白を減らして大きく表示。
text = text.replace(
  /style=\{\{\s*marginTop: 16,\s*padding: 12,\s*background: "#000",\s*borderRadius: 12,\s*\}\}/,
  `style={{
      marginTop: 16,
      padding: 8,
      background: "#000",
      borderRadius: 12,
      width: "100%",
      boxSizing: "border-box",
    }}`
);

fs.writeFileSync(file, text, "utf8");
console.log("Applied larger JAN camera preview UI.");
