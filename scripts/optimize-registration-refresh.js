const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

const purchaseOld = `    setMessage("仕入を登録しました。");\n\n    setPurchaseForm(initialPurchaseForm);\n\n    await loadAll();`;
const purchaseNew = `    setMessage("仕入を登録しました。");\n\n    // 登録直後に全履歴を再取得せず、RPCの結果をローカル状態へ反映する。\n    const newPurchase: Purchase = {\n      id: String(data.purchase_id),\n      product_id: purchaseForm.product_id,\n      purchase_date: purchaseForm.purchase_date,\n      supplier: purchaseForm.supplier.trim() || null,\n      unit_cost: unitCost,\n      quantity,\n      total_cost: unitCost * quantity,\n      notes: purchaseForm.notes.trim() || null,\n    };\n\n    setPurchases((prev) => [newPurchase, ...prev]);\n    setProducts((prev) =>\n      prev.map((item) =>\n        item.id === purchaseForm.product_id\n          ? {\n              ...item,\n              stock_quantity: Number(data.stock_after ?? item.stock_quantity ?? 0),\n              cost_price: unitCost,\n            }\n          : item\n      )\n    );\n\n    setPurchaseForm(initialPurchaseForm);`;

const saleOld = `    setMessage(\n      "売上を登録しました。"\n    );\n\n    setSaleForm(initialSaleForm);\n\n    await loadAll();`;
const saleNew = `    setMessage(\n      "売上を登録しました。"\n    );\n\n    // 登録直後に全履歴を再取得せず、RPCの結果をローカル状態へ反映する。\n    const newSale: Sale = {\n      id: String(data.sale_id),\n      product_id: saleForm.product_id,\n      sale_date: saleForm.sale_date,\n      sales_channel: saleForm.sales_channel.trim() || null,\n      order_number: saleForm.order_number.trim() || null,\n      unit_price: unitPrice,\n      unit_cost: Number(data.unit_cost ?? unitCost),\n      quantity,\n      total_sales: Number(data.total_sales ?? unitPrice * quantity),\n      total_cost: Number(data.total_cost ?? Number(data.unit_cost ?? unitCost) * quantity),\n      gross_profit: Number(data.gross_profit ?? ((unitPrice - Number(data.unit_cost ?? unitCost)) * quantity)),\n      notes: saleForm.notes.trim() || null,\n      is_cancelled: false,\n      created_at: new Date().toISOString(),\n    };\n\n    setSales((prev) => [newSale, ...prev]);\n    setProducts((prev) =>\n      prev.map((item) =>\n        item.id === saleForm.product_id\n          ? {\n              ...item,\n              stock_quantity: Number(data.stock_after ?? Math.max(0, Number(item.stock_quantity ?? 0) - quantity)),\n            }\n          : item\n      )\n    );\n\n    setSaleForm(initialSaleForm);`;

if (!source.includes(purchaseOld)) {
  throw new Error("Purchase registration block not found; aborting build patch.");
}
if (!source.includes(saleOld)) {
  throw new Error("Sale registration block not found; aborting build patch.");
}

source = source.replace(purchaseOld, purchaseNew);
source = source.replace(saleOld, saleNew);

fs.writeFileSync(file, source, "utf8");
console.log("[performance] registration refresh optimization applied");
