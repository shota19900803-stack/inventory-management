const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const oldBlock = `      selling_price:\n        productForm.selling_price === ""\n          ? null\n          : Number(productForm.selling_price),`;

const newBlock = `      // products.selling_price is NOT NULL in Supabase.\n      // JAN検索だけで商品登録する場合は販売価格が未確定なので、\n      // 空欄は0として保存し、後から商品編集で価格を設定できるようにする。\n      selling_price:\n        productForm.selling_price === ""\n          ? 0\n          : Number(productForm.selling_price),`;

if (!text.includes(oldBlock)) {
  if (text.includes(newBlock)) {
    console.log("Product selling price default is already fixed.");
    process.exit(0);
  }
  throw new Error("Product selling_price payload block was not found.");
}

text = text.replace(oldBlock, newBlock);
fs.writeFileSync(file, text, "utf8");
console.log("Applied product selling price default: empty selling_price is saved as 0.");
