const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

const marker = "// Applied sale registration navigation fix.";
if (source.includes(marker)) {
  console.log("Sale registration navigation fix already applied.");
  process.exit(0);
}

const oldBlock = `    setSaleForm(initialSaleForm);\n\n    await loadAll();`;
const newBlock = `    setSaleForm(initialSaleForm);\n\n    // 登録後に月次集計へ戻らず、売上登録画面に留まる。\n    // 保存後の再描画でページ末尾へジャンプしないよう、画面上部へ戻す。\n    await loadAll();\n    setTab("sales");\n    requestAnimationFrame(() => {\n      window.scrollTo({ top: 0, behavior: "auto" });\n    });`;

if (!source.includes(oldBlock)) {
  throw new Error("Sale registration success block was not found.");
}

source = source.replace(oldBlock, newBlock);
source += `\n${marker}\n`;
fs.writeFileSync(file, source, "utf8");
console.log("Applied sale registration navigation fix.");
