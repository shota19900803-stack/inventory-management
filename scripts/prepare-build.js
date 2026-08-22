const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const productsMarker = '{tab === "products" && (';
const purchasesMarker = '{tab === "purchases" && (';

const productsStart = text.indexOf(productsMarker);
const purchasesStart = text.indexOf(
  purchasesMarker,
  productsStart + productsMarker.length
);

if (productsStart === -1 || purchasesStart === -1) {
  throw new Error("Product/purchase tab markers were not found.");
}

let productsBlock = text.slice(productsStart, purchasesStart);

function removeSimpleLabel(source, labelText) {
  const marker = `\n                  <label>\n                    ${labelText}\n`;
  const start = source.indexOf(marker);
  if (start === -1) return source;

  const endMarker = "\n                  </label>";
  const end = source.indexOf(endMarker, start + marker.length);
  if (end === -1) {
    throw new Error(`Could not close product field: ${labelText}`);
  }

  return source.slice(0, start) + source.slice(end + endMarker.length);
}

// Product master should contain product identity only.
// Stock and volatile reference prices are maintained elsewhere.
for (const label of [
  "在庫数",
  "現在の参考仕入価格",
  "現在の参考販売価格",
]) {
  productsBlock = removeSimpleLabel(productsBlock, label);
}

// Guard against the old broken state where purchase-registration fields were
// accidentally copied into the product-registration form.
for (const label of [
  "商品*",
  "仕入日",
  "仕入先",
  "仕入単価*",
  "数量*",
  "メモ",
]) {
  productsBlock = removeSimpleLabel(productsBlock, label);
}

const totalMarker = "\n                <div\n                  style={{\n                    marginTop: 15,\n                    fontSize: 18,\n                    fontWeight: 700,\n                  }}\n                >\n                  仕入合計";

const totalStart = productsBlock.indexOf(totalMarker);
if (totalStart !== -1) {
  const totalEndMarker = "\n                </div>";
  const totalEnd = productsBlock.indexOf(
    totalEndMarker,
    totalStart + totalMarker.length
  );
  if (totalEnd === -1) {
    throw new Error("Could not close copied purchase total block.");
  }
  productsBlock =
    productsBlock.slice(0, totalStart) +
    productsBlock.slice(totalEnd + totalEndMarker.length);
}

text =
  text.slice(0, productsStart) +
  productsBlock +
  text.slice(purchasesStart);

fs.writeFileSync(file, text, "utf8");
console.log("Prepared product form: purchase fields removed; stock/reference-price fields removed.");
