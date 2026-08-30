const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const marker = '  // FIFO COST LOGIC';
if (!text.includes(marker)) {
  const insertBefore = '  const saleField = `';
  const at = text.indexOf(insertBefore);
  if (at < 0) throw new Error("Sale field marker not found.");

  const helper = `  // FIFO COST LOGIC\n  // Sales consume purchase lots from oldest to newest. When one sale quantity spans\n  // multiple lots, the unit cost is the weighted average of the consumed lots.\n  const getFifoUnitCost = (productId: string, quantity: number, saleDate: string) => {\n    const lots = purchases\n      .filter((purchase) => purchase.product_id === productId && purchase.purchase_date <= saleDate)\n      .sort((a, b) => {\n        const dateCompare = a.purchase_date.localeCompare(b.purchase_date);\n        if (dateCompare !== 0) return dateCompare;\n        return String(a.created_at ?? \"\").localeCompare(String(b.created_at ?? \"\"));\n      })\n      .map((purchase) => ({ ...purchase, remaining: Number(purchase.quantity || 0) }));\n\n    const priorSoldQuantity = sales\n      .filter((sale) => sale.product_id === productId && !sale.is_cancelled && sale.sale_date <= saleDate)\n      .reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);\n\n    let alreadyConsumed = priorSoldQuantity;\n    let remainingToCost = Math.max(0, Number(quantity || 0));\n    let totalCost = 0;\n    let totalQuantity = 0;\n\n    for (const lot of lots) {\n      if (alreadyConsumed >= lot.remaining) {\n        alreadyConsumed -= lot.remaining;\n        continue;\n      }\n\n      const available = Math.max(0, lot.remaining - alreadyConsumed);\n      const take = Math.min(available, remainingToCost);\n      if (take > 0) {\n        totalCost += take * Number(lot.unit_cost || 0);\n        totalQuantity += take;\n        remainingToCost -= take;\n      }\n      alreadyConsumed = 0;\n\n      if (remainingToCost <= 0) break;\n    }\n\n    if (totalQuantity > 0) return totalCost / totalQuantity;\n\n    const product = products.find((item) => item.id === productId);\n    return Number(product?.cost_price || 0);\n  };\n\n`;
  text = text.slice(0, at) + helper + text.slice(at);
}

const old = 'unit_cost: product?.cost_price != null ? String(product.cost_price) : saleForm.unit_cost,';
const next = 'unit_cost: String(getFifoUnitCost(e.target.value, Number(saleForm.quantity || 1), saleForm.sale_date)),';
if (text.includes(old)) {
  text = text.replace(old, next);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied FIFO purchase-cost logic to sales registration.");
