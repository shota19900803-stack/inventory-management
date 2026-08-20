const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

if (!text.includes("const totalStockValue = products.reduce")) {
  const marker = `  const totalStock = products.reduce(\n    (sum, product) =>\n      sum + Number(product.stock_quantity || 0),\n    0\n  );\n`;

  if (!text.includes(marker)) {
    throw new Error("totalStock block was not found.");
  }

  const block = `${marker}\n  const totalStockValue = products.reduce(\n    (sum, product) =>\n      sum +\n      Number(product.stock_quantity || 0) *\n      Number(product.cost_price || 0),\n    0\n  );\n`;

  text = text.replace(marker, block);
}

if (!text.includes("在庫金額")) {
  const marker = `            <div\n              style={{\n                background: "#fff",\n                padding: "12px 18px",\n                borderRadius: 12,\n                border: "1px solid #e5e7eb",\n              }}\n            >\n              在庫数 <strong>{totalStock}</strong>\n            </div>`;

  if (!text.includes(marker)) {
    throw new Error("header inventory count block was not found.");
  }

  const block = `${marker}\n\n            <div\n              style={{\n                background: "#fff",\n                padding: "12px 18px",\n                borderRadius: 12,\n                border: "1px solid #e5e7eb",\n              }}\n            >\n              在庫金額 <strong>{yen(totalStockValue)}</strong>\n            </div>`;

  text = text.replace(marker, block);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied inventory value display patch.");
