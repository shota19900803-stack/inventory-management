const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "SalesShippingEnhancement.tsx");
let source = fs.readFileSync(file, "utf8");

const marker = "// Applied robust sale shipping sync fix.";
if (source.includes(marker)) {
  console.log("Robust sale shipping sync fix already applied.");
  process.exit(0);
}

const oldProductSelect = `const productSelect = Array.from(form.querySelectorAll("select")).find((el) => Array.from(el.options).some((o) => (o.textContent || "").trim() === "商品を選択")) as HTMLSelectElement | undefined;`;
const newProductSelect = `const productSelect = Array.from(form.querySelectorAll("select")).find((el) => Array.from(el.options).some((o) => /商品を選択/.test((o.textContent || "").trim()))) as HTMLSelectElement | undefined;`;

if (!source.includes(oldProductSelect)) {
  throw new Error("Sale shipping product selector block was not found.");
}
source = source.replace(oldProductSelect, newProductSelect);

const oldMatched = `const matched = rows.find((r) =>\n          Number(r.quantity || 0) === snapshot.quantity &&\n          Number(r.unit_price || 0) === snapshot.price &&\n          (snapshot.order ? String(r.order_number || "").trim() === snapshot.order : true)\n        );`;
const newMatched = `const normalizedOrder = snapshot.order.trim();\n        const matchedByOrder = normalizedOrder\n          ? rows.find((r) => String(r.order_number || "").trim() === normalizedOrder)\n          : null;\n        const matchedByFields = rows.find((r) =>\n          Number(r.quantity || 0) === snapshot.quantity &&\n          Number(r.unit_price || 0) === snapshot.price\n        );\n        const matched = matchedByOrder || matchedByFields;`;

if (!source.includes(oldMatched)) {
  throw new Error("Sale shipping matching block was not found.");
}
source = source.replace(oldMatched, newMatched);

source = source.replace(
  'for (let attempt = 0; attempt < 15; attempt++) {',
  'for (let attempt = 0; attempt < 20; attempt++) {'
);
source = source.replace(
  'await new Promise((resolve) => window.setTimeout(resolve, 300));',
  'await new Promise((resolve) => window.setTimeout(resolve, 250));'
);

source += `\n${marker}\n`;
fs.writeFileSync(file, source, "utf8");
console.log("Applied robust sale shipping sync fix.");
