const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// JANを読んだ商品が既存商品なら、商品編集画面ではなく仕入登録へ直行。
const marker = `setPurchaseForm((prev) => ({\n        ...prev,\n        product_id: localProduct.id,\n        unit_cost: cost || prev.unit_cost,\n        quantity: prev.quantity || "1",\n      }));`;

if (text.includes(marker) && !text.includes('setTab("purchases");\n\n      setMessage(')) {
  text = text.replace(
    marker,
    marker + `\n\n      setTab("purchases");`
  );
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied existing JAN -> direct purchase registration flow.");
