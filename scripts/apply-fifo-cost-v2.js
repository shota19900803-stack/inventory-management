const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const marker = "  // FIFO COST LOGIC V2";
if (text.includes(marker)) {
  console.log("FIFO V2 already applied.");
  process.exit(0);
}

const saveSaleStart = text.indexOf("async function saveSale(");
if (saveSaleStart < 0) throw new Error("saveSale function not found.");

const helper = `  // FIFO COST LOGIC V2\n  // Sales consume purchase lots from oldest to newest. If one sale spans multiple lots,\n  // the stored unit cost is the weighted average of the lots consumed by that sale.\n  function getFifoUnitCost(productId: string, quantity: number, saleDate: string) {\n    const lots = purchases\n      .filter((purchase) => purchase.product_id === productId && purchase.purchase_date <= saleDate)\n      .sort((a, b) => {\n        const dateCompare = a.purchase_date.localeCompare(b.purchase_date);\n        if (dateCompare !== 0) return dateCompare;\n        return String(a.created_at ?? \"\").localeCompare(String(b.created_at ?? \"\"));\n      })\n      .map((purchase) => ({ ...purchase, remaining: Number(purchase.quantity || 0) }));\n\n    let priorSold = sales\n      .filter((sale) => sale.product_id === productId && !sale.is_cancelled && sale.sale_date <= saleDate)\n      .reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);\n\n    let remaining = Math.max(0, quantity);\n    let totalCost = 0;\n    let totalQuantity = 0;\n\n    for (const lot of lots) {\n      if (priorSold >= lot.remaining) {\n        priorSold -= lot.remaining;\n        continue;\n      }\n\n      const available = Math.max(0, lot.remaining - priorSold);\n      const take = Math.min(available, remaining);\n      if (take > 0) {\n        totalCost += take * Number(lot.unit_cost || 0);\n        totalQuantity += take;\n        remaining -= take;\n      }\n      priorSold = 0;\n      if (remaining <= 0) break;\n    }\n\n    if (totalQuantity > 0) return totalCost / totalQuantity;\n    return Number(products.find((item) => item.id === productId)?.cost_price || 0);\n  }\n\n`;
text = text.slice(0, saveSaleStart) + helper + text.slice(saveSaleStart);

const start = text.indexOf("async function saveSale(");
const end = text.indexOf("\n  async function", start + 10);
const blockEnd = end >= 0 ? end : text.length;
const saleBlock = text.slice(start, blockEnd);

const unitCostPattern = /  const unitCost = Number\(\n    saleForm\.unit_cost \|\| 0\n  \);/;
if (!unitCostPattern.test(saleBlock)) {
  throw new Error("Sale unit cost block not found.");
}

const replacement = `  const quantity = Number(\n    saleForm.quantity || 0\n  );\n\n  const unitCost = getFifoUnitCost(\n    saleForm.product_id,\n    quantity,\n    saleForm.sale_date\n  );`;
let patchedSaleBlock = saleBlock.replace(unitCostPattern, replacement);

// The original saveSale block already declares quantity immediately after unitCost.
// Remove that original declaration because the replacement above owns the quantity value.
patchedSaleBlock = patchedSaleBlock.replace(/(  const unitCost = getFifoUnitCost\([\\s\\S]*?\n  \);)\n\n  const quantity = Number\(\n    saleForm\.quantity \|\| 0\n  \);/, "$1");

text = text.slice(0, start) + patchedSaleBlock + text.slice(blockEnd);
fs.writeFileSync(file, text, "utf8");
console.log("Applied FIFO V2 to saveSale.");
