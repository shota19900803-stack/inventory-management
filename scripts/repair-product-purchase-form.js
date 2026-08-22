const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const productsMatch = text.match(/\{tab\s*===\s*["']products["']\s*&&\s*\(/);
const purchasesMatch = text.match(/\{tab\s*===\s*["']purchases["']\s*&&\s*\(/);

// Never fail the production build just because a repair is no longer needed.
if (!productsMatch || !purchasesMatch || productsMatch.index >= purchasesMatch.index) {
  console.log("Product/purchase tab markers not found; repair skipped.");
  process.exit(0);
}

const productsStart = productsMatch.index;
const purchasesStart = purchasesMatch.index;
let productsBlock = text.slice(productsStart, purchasesStart);

// A previous patch accidentally copied the purchase-registration fields into
// the product-registration tab. Remove those fields by their unique labels.
// This is intentionally label-based rather than dependent on exact indentation.
const purchaseLabels = [
  "商品\\*",
  "仕入日",
  "仕入先",
  "仕入単価\\*",
  "数量\\*",
  "メモ",
];

for (const label of purchaseLabels) {
  const pattern = new RegExp(
    `\\n\\s*<label>\\s*${label}[\\s\\S]*?<\\/label>`,
    "g"
  );
  productsBlock = productsBlock.replace(pattern, "");
}

// Remove the purchase total block that was also copied into the product tab.
productsBlock = productsBlock.replace(
  /\\n\\s*<div[\\s\\S]*?仕入合計[\\s\\S]*?<\\/div>/g,
  ""
);

// Remove old product-master-only inventory/reference price fields. Actual
// inventory is maintained by purchase/sales history.
for (const label of ["在庫数", "現在の参考仕入価格", "現在の参考販売価格"]) {
  const pattern = new RegExp(
    `\\n\\s*<label>\\s*${label}[\\s\\S]*?<\\/label>`,
    "g"
  );
  productsBlock = productsBlock.replace(pattern, "");
}

text = text.slice(0, productsStart) + productsBlock + text.slice(purchasesStart);
fs.writeFileSync(file, text, "utf8");
console.log("Product form repair completed: purchase fields removed from product tab.");
