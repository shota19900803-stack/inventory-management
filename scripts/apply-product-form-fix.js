const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// The product master does not need volatile reference buy/sell prices.
// Keep the DB's required columns populated for compatibility, but remove
// the fields from the product-registration UI and preserve existing values
// when editing an existing product.
if (!text.includes("Applied product form cleanup")) {
  // Remove the two volatile price fields from the product form UI.
  text = text.replace(
    /\n\s*<label>\s*現在の参考仕入価格[\s\S]*?<\/label>/,
    ""
  );
  text = text.replace(
    /\n\s*<label>\s*現在の参考販売価格[\s\S]*?<\/label>/,
    ""
  );

  // Preserve existing DB values on edit; use 0 only for newly created
  // products because the database columns are NOT NULL.
  const oldCost = `      cost_price:\n        productForm.cost_price === \"\"\n          ? null\n          : Number(productForm.cost_price),`;
  const newCost = `      cost_price:\n        editingProductId\n          ? Number(products.find((product) => product.id === editingProductId)?.cost_price ?? 0)\n          : 0,`;
  text = text.replace(oldCost, newCost);

  const oldSelling = `      selling_price:\n        productForm.selling_price === \"\"\n          ? null\n          : Number(productForm.selling_price),`;
  const newSelling = `      selling_price:\n        editingProductId\n          ? Number(products.find((product) => product.id === editingProductId)?.selling_price ?? 0)\n          : 0,`;
  text = text.replace(oldSelling, newSelling);

  // Inventory value is based on the latest actual purchase unit cost,
  // rather than a volatile reference price stored on the product master.
  const totalStockMarker = `  const totalStock = products.reduce(\n    (sum, product) =>\n      sum + Number(product.stock_quantity || 0),\n    0\n  );\n`;

  if (!text.includes("const latestPurchaseCostByProduct = useMemo")) {
    if (!text.includes(totalStockMarker)) {
      throw new Error("totalStock block was not found.");
    }

    const valueBlock = `${totalStockMarker}\n  const latestPurchaseCostByProduct = useMemo(() => {\n    const map: Record<string, number> = {};\n\n    [...purchases]\n      .sort((a, b) =>\n        String(b.purchase_date).localeCompare(String(a.purchase_date))\n      )\n      .forEach((purchase) => {\n        if (map[purchase.product_id] === undefined) {\n          map[purchase.product_id] = Number(purchase.unit_cost || 0);\n        }\n      });\n\n    return map;\n  }, [purchases]);\n`;

    text = text.replace(totalStockMarker, valueBlock);
  }

  // Replace the previous product-master-price based inventory valuation.
  text = text.replace(
    /  const totalStockValue = products\.reduce\([\s\S]*?\n  \);/,
    `  const totalStockValue = products.reduce(\n    (sum, product) =>\n      sum +\n      Number(product.stock_quantity || 0) *\n      Number(latestPurchaseCostByProduct[product.id] || 0),\n    0\n  );`
  );

  // Sale registration should use the latest actual purchase cost when
  // available, since the product master no longer stores a reference cost.
  if (!text.includes("function getLatestPurchaseCost")) {
    const openSaleMarker = `  function openSale(productId = \"\") {`;
    const helper = `  function getLatestPurchaseCost(productId: string) {\n    return latestPurchaseCostByProduct[productId] ?? 0;\n  }\n\n`;
    if (text.includes(openSaleMarker)) {
      text = text.replace(openSaleMarker, helper + openSaleMarker);
    }
  }

  text = text.replace(
    /unit_cost:\n\s*product\?\.cost_price != null\n\s*\? String\(product\.cost_price\)\n\s*:\n\s*\"\",/,
    `unit_cost:\n        getLatestPurchaseCost(productId) > 0\n          ? String(getLatestPurchaseCost(productId))\n          : \"\",`
  );

  text = text.replace(
    /unit_cost:\n\s*product\?\.cost_price !=\n\s*null\n\s*\? String\(\n\s*product\.cost_price\n\s*\)\n\s*:\n\s*saleForm\.unit_cost/,
    `unit_cost:\n                            getLatestPurchaseCost(e.target.value) > 0\n                              ? String(\n                                  getLatestPurchaseCost(e.target.value)\n                                )\n                              : saleForm.unit_cost`
  );

  text += `\n// Applied product form cleanup.\n`;
  fs.writeFileSync(file, text, "utf8");
  console.log("Applied product form cleanup: removed volatile reference prices and fixed inventory valuation.");
} else {
  console.log("Product form cleanup already applied.");
}
