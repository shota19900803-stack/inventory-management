const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const oldBlock = `      cost_price:\n        productForm.cost_price === ""\n          ? null\n          : Number(productForm.cost_price),`;

const newBlock = `      // products.cost_price is NOT NULL in Supabase.\n      // When a product is registered from JAN search, the purchase cost may\n      // not be known yet, so store 0 and allow the real cost to be entered\n      // later through purchase registration.\n      cost_price:\n        productForm.cost_price === ""\n          ? 0\n          : Number(productForm.cost_price),`;

if (!text.includes(oldBlock)) {
  if (text.includes(newBlock)) {
    console.log("Product cost default is already fixed.");
    process.exit(0);
  }
  throw new Error("Product cost payload block was not found.");
}

text = text.replace(oldBlock, newBlock);
fs.writeFileSync(file, text, "utf8");
console.log("Applied product cost default: empty cost_price is saved as 0.");
