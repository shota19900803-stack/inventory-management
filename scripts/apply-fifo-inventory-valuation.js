const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const oldMapAnchor = `  const totalStock = products.reduce(\n    (sum, product) =>\n      sum + Number(product.stock_quantity || 0),\n    0\n  );`;

const newMapBlock = `  // 在庫評価は products.cost_price × 在庫数 ではなく、\n  // 仕入ロットをFIFOで消化した「実際に残っている在庫」の仕入額を使う。\n  // 例：890円×1個 + 2,000円×1個が残っていれば、在庫仕入金額は2,890円。\n  const inventoryCostByProduct = useMemo(() => {\n    const result: Record<string, number> = {};\n\n    for (const product of products) {\n      const targetStock = Math.max(0, Number(product.stock_quantity || 0));\n      if (targetStock === 0) {\n        result[product.id] = 0;\n        continue;\n      }\n\n      const lots = purchases\n        .filter((purchase) => purchase.product_id === product.id && Number(purchase.quantity || 0) > 0)\n        .sort((a, b) => {\n          const dateDiff = String(a.purchase_date).localeCompare(String(b.purchase_date));\n          if (dateDiff !== 0) return dateDiff;\n          const createdDiff = String(a.created_at || "").localeCompare(String(b.created_at || ""));\n          if (createdDiff !== 0) return createdDiff;\n          return String(a.id).localeCompare(String(b.id));\n        })\n        .map((purchase) => ({\n          remaining: Number(purchase.quantity || 0),\n          unitCost: Number(purchase.unit_cost || 0),\n        }));\n\n      const sold = sales\n        .filter((sale) => sale.product_id === product.id && !sale.is_cancelled && Number(sale.quantity || 0) > 0)\n        .sort((a, b) => {\n          const dateDiff = String(a.sale_date).localeCompare(String(b.sale_date));\n          if (dateDiff !== 0) return dateDiff;\n          const createdDiff = String(a.created_at || "").localeCompare(String(b.created_at || ""));\n          if (createdDiff !== 0) return createdDiff;\n          return String(a.id).localeCompare(String(b.id));\n        });\n\n      // 仕入ロットを古い順に売上数量で消化する。\n      for (const sale of sold) {\n        let remainingSaleQty = Number(sale.quantity || 0);\n        for (const lot of lots) {\n          if (remainingSaleQty <= 0) break;\n          const consume = Math.min(lot.remaining, remainingSaleQty);\n          lot.remaining -= consume;\n          remainingSaleQty -= consume;\n        }\n      }\n\n      const lotStock = lots.reduce((sum, lot) => sum + lot.remaining, 0);\n\n      // 履歴とproducts.stock_quantityが一致する通常ケースではロット評価を使用。\n      // 棚卸し等で一時的に差がある場合は、画面の在庫数を壊さず従来値へフォールバックする。\n      if (lotStock !== targetStock) {\n        result[product.id] = targetStock * Number(product.cost_price || 0);\n        continue;\n      }\n\n      result[product.id] = lots.reduce(\n        (sum, lot) => sum + lot.remaining * lot.unitCost,\n        0\n      );\n    }\n\n    return result;\n  }, [products, purchases, sales]);\n\n${oldMapAnchor}`;

if (text.includes("const inventoryCostByProduct = useMemo(() =>")) {
  console.log("FIFO inventory valuation already applied.");
} else if (text.includes(oldMapAnchor)) {
  text = text.replace(oldMapAnchor, newMapBlock);
  console.log("Applied FIFO inventory valuation map.");
} else {
  throw new Error("totalStock anchor was not found.");
}

const oldCell = `                          <td\n                            style={{\n                              padding: 10,\n                              textAlign: "right",\n                              fontWeight: 700,\n                            }}\n                          >\n                            {yen(\n                              Number(product.stock_quantity || 0) *\n                              Number(product.cost_price || 0)\n                            )}\n                          </td>`;

const newCell = `                          <td\n                            style={{\n                              padding: 10,\n                              textAlign: "right",\n                              fontWeight: 700,\n                            }}\n                            title="仕入履歴をFIFOで消化して残在庫の仕入額を計算"\n                          >\n                            {yen(inventoryCostByProduct[product.id] ?? 0)}\n                          </td>`;

if (text.includes(oldCell)) {
  text = text.replace(oldCell, newCell);
  console.log("Applied FIFO inventory valuation cell.");
} else if (text.includes(newCell)) {
  console.log("FIFO inventory valuation cell already applied.");
} else {
  throw new Error("inventory valuation cell was not found.");
}

fs.writeFileSync(file, text, "utf8");
console.log("FIFO inventory valuation fix complete.");
