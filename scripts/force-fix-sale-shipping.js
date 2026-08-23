const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// Make the Sale type explicitly include shipping_cost.
if (!/type Sale = \{[\s\S]*?shipping_cost\?: number \| null;/.test(text)) {
  const marker = "  gross_profit: number;\n  notes?: string | null;";
  if (!text.includes(marker)) {
    throw new Error("Could not find Sale type marker.");
  }
  text = text.replace(
    marker,
    "  gross_profit: number;\n  shipping_cost?: number | null;\n  notes?: string | null;"
  );
}

// Make initialSaleForm explicitly contain shipping_cost. Only target the
// sale form so the purchase form is never accidentally modified.
const saleStart = text.indexOf("const initialSaleForm = {");
if (saleStart < 0) {
  throw new Error("Could not find initialSaleForm.");
}
const saleEnd = text.indexOf("};", saleStart);
if (saleEnd < 0) {
  throw new Error("Could not find end of initialSaleForm.");
}
const saleBlock = text.slice(saleStart, saleEnd + 2);
if (!saleBlock.includes("shipping_cost:")) {
  const quantityMarker = '  quantity: "1",';
  if (!saleBlock.includes(quantityMarker)) {
    throw new Error("Could not find quantity in initialSaleForm.");
  }
  const fixedSaleBlock = saleBlock.replace(
    quantityMarker,
    quantityMarker + '\n  shipping_cost: "",'
  );
  text = text.slice(0, saleStart) + fixedSaleBlock + text.slice(saleEnd + 2);
}

fs.writeFileSync(file, text, "utf8");
console.log("Force-fixed Sale type and initialSaleForm shipping_cost.");
