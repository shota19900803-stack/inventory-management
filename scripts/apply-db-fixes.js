const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// products.cost_price is NOT NULL in the current Supabase schema.
// Treat an empty cost field as 0 so a newly scanned product can be registered
// before its actual purchase cost is known.
const oldCostPrice = `cost_price:\n        productForm.cost_price === ""\n          ? null\n          : Number(productForm.cost_price),`;
const newCostPrice = `cost_price:\n        productForm.cost_price === ""\n          ? 0\n          : Number(productForm.cost_price),`;

if (text.includes(oldCostPrice)) {
  text = text.replace(oldCostPrice, newCostPrice);
  console.log("Applied products.cost_price NOT NULL fix.");
} else if (text.includes(newCostPrice)) {
  console.log("products.cost_price NOT NULL fix already applied.");
} else {
  throw new Error("Product cost_price block was not found.");
}

// Supabase currently has overloaded cancel_sale functions:
// cancel_sale(uuid) and cancel_sale(uuid, text).
// Passing p_reason explicitly removes the RPC overload ambiguity.
const oldCancelRpc = `const { data, error } = await supabase.rpc("cancel_sale", {\n      p_sale_id: sale.id,\n    });`;
const newCancelRpc = `const { data, error } = await supabase.rpc("cancel_sale", {\n      p_sale_id: sale.id,\n      p_reason: "画面から売上取消",\n    });`;

if (text.includes(oldCancelRpc)) {
  text = text.replace(oldCancelRpc, newCancelRpc);
  console.log("Applied cancel_sale RPC overload fix.");
} else if (text.includes(newCancelRpc)) {
  console.log("cancel_sale RPC overload fix already applied.");
} else {
  throw new Error("cancel_sale RPC block was not found.");
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied DB compatibility fixes.");
