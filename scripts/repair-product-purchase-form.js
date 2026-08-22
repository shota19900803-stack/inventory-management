const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// This script intentionally uses exact string replacements only.
// Do not use regex here: a previous version broke Vercel with
// `SyntaxError: Invalid regular expression` while parsing this script.

if (text.includes("Product/purchase form cleanup applied")) {
  console.log("Product/purchase form cleanup already applied.");
  process.exit(0);
}

const fieldsToRemove = [
  `
                  <label>
                    在庫数
                    <input
                      style={inputStyle}
                      type="number"
                      value={
                        productForm.stock_quantity
                      }
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          stock_quantity:
                            e.target.value,
                        })
                      }
                    />
                  </label>`,
  `
                  <label>
                    現在の参考仕入価格
                    <input
                      style={inputStyle}
                      type="number"
                      value={
                        productForm.cost_price
                      }
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          cost_price:
                            e.target.value,
                        })
                      }
                    />
                  </label>`,
  `
                  <label>
                    現在の参考販売価格
                    <input
                      style={inputStyle}
                      type="number"
                      value={
                        productForm.selling_price
                      }
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          selling_price:
                            e.target.value,
                        })
                      }
                    />
                  </label>`,
];

for (const field of fieldsToRemove) {
  text = text.replace(field, "");
}

// Product registration no longer owns inventory or price values.
// Preserve existing DB values when editing and use zero for newly-created
// products so the existing NOT NULL database columns remain compatible.
const oldCost = `      cost_price:
        productForm.cost_price === ""
          ? null
          : Number(productForm.cost_price),`;
const newCost = `      cost_price:
        editingProductId
          ? Number(
              products.find((product) => product.id === editingProductId)
                ?.cost_price ?? 0
            )
          : 0,`;

const oldSelling = `      selling_price:
        productForm.selling_price === ""
          ? null
          : Number(productForm.selling_price),`;
const newSelling = `      selling_price:
        editingProductId
          ? Number(
              products.find((product) => product.id === editingProductId)
                ?.selling_price ?? 0
            )
          : 0,`;

if (!text.includes(oldCost)) {
  throw new Error("Product save cost-price block was not found.");
}
if (!text.includes(oldSelling)) {
  throw new Error("Product save selling-price block was not found.");
}

text = text.replace(oldCost, newCost);
text = text.replace(oldSelling, newSelling);

text += `
// Product/purchase form cleanup applied
`;

fs.writeFileSync(file, text, "utf8");
console.log("Product/purchase form cleanup applied: registration form now contains product-master fields only.");
