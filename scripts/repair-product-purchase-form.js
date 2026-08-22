const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// This repair runs before every production build. Keep it deliberately
// string-based: regex parsing here previously caused Vercel's
// "Invalid regular expression" build failure.
const productsMarker = '{tab === "products" && (';
const purchasesMarker = '{tab === "purchases" && (';

const productsStart = text.indexOf(productsMarker);
const purchasesStart = text.indexOf(purchasesMarker, productsStart + productsMarker.length);

if (productsStart === -1 || purchasesStart === -1 || productsStart >= purchasesStart) {
  console.log("Product/purchase tab markers not found; repair skipped.");
  process.exit(0);
}

let productsBlock = text.slice(productsStart, purchasesStart);

function removeLabelBlock(source, labelStart) {
  const start = source.indexOf(labelStart);
  if (start === -1) return source;

  const end = source.indexOf("\n                  </label>", start);
  if (end === -1) return source;

  return source.slice(0, start) + source.slice(end + "\n                  </label>".length);
}

// A previous patch copied the purchase-registration fields into the product
// registration form. Remove those fields only from the product tab.
const purchaseFieldStarts = [
  "\n                  <label>\n                    商品*\n",
  "\n                  <label>\n                    仕入日\n",
  "\n                  <label>\n                    仕入先\n",
  "\n                  <label>\n                    仕入単価*\n",
  "\n                  <label>\n                    数量*\n",
  "\n                  <label>\n                    メモ\n",
];

for (const fieldStart of purchaseFieldStarts) {
  productsBlock = removeLabelBlock(productsBlock, fieldStart);
}

// Remove the copied purchase-total display from the product form.
const totalStart = productsBlock.indexOf(
  "\n                <div\n                  style={{\n                    marginTop: 15,\n                    fontSize: 18,\n                    fontWeight: 700,\n                  }}\n                >\n                  仕入合計"
);

if (totalStart !== -1) {
  const totalEnd = productsBlock.indexOf("\n                </div>", totalStart);
  if (totalEnd !== -1) {
    productsBlock =
      productsBlock.slice(0, totalStart) +
      productsBlock.slice(totalEnd + "\n                </div>".length);
  }
}

text =
  text.slice(0, productsStart) +
  productsBlock +
  text.slice(purchasesStart);

fs.writeFileSync(file, text, "utf8");
console.log("Product/purchase form repair completed safely.");
