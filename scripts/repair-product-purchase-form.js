const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const productsMatch = text.match(/\{tab\s*===\s*["']products["']\s*&&\s*\(/);
const purchasesMatch = text.match(/\{tab\s*===\s*["']purchases["']\s*&&\s*\(/);

// This cleanup must never make production builds fail just because a prior
// patch changed formatting or the repair is no longer needed.
if (!productsMatch || !purchasesMatch || productsMatch.index >= purchasesMatch.index) {
  console.log("Product/purchase tab markers not found; repair skipped.");
  process.exit(0);
}

const productsStart = productsMatch.index;
const purchasesStart = purchasesMatch.index;
let productsBlock = text.slice(productsStart, purchasesStart);

// Remove the accidentally embedded purchase form from the product tab.
// The product master has no 商品* selector; the purchase tab does.
const purchaseStart = productsBlock.search(/<label>\s*商品\*|<label[^>]*>\s*商品\*/);
const buttonArea = productsBlock.search(/<div\s*\n?\s*style=\{\{\s*display:\s*["']flex["'][\s\S]*?marginTop:\s*20/);

if (purchaseStart !== -1 && buttonArea !== -1 && buttonArea > purchaseStart) {
  productsBlock = productsBlock.slice(0, purchaseStart) + "\n                </div>\n\n" + productsBlock.slice(buttonArea);
  console.log("Removed accidental purchase fields from product form.");
}

// Product master should not expose manual stock/reference-price inputs.
productsBlock = productsBlock.replace(/\n\s*<label>\s*\n\s*在庫数[\s\S]*?<\/label>/g, "");
productsBlock = productsBlock.replace(/\n\s*<label>\s*\n\s*現在の参考仕入価格[\s\S]*?<\/label>/g, "");
productsBlock = productsBlock.replace(/\n\s*<label>\s*\n\s*現在の参考販売価格[\s\S]*?<\/label>/g, "");

text = text.slice(0, productsStart) + productsBlock + text.slice(purchasesStart);
fs.writeFileSync(file, text, "utf8");
console.log("Product form repair completed safely.");
