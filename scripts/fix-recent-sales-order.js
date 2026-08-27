const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

const marker = "// Applied recent sales registration-order fix.";
if (source.includes(marker)) {
  console.log("Recent sales registration-order fix already applied.");
  process.exit(0);
}

const oldBlock = `.from("sales_history")\n      .select("*")\n      .eq("is_cancelled", false)\n      .order("sale_date", { ascending: false })\n      .limit(2000),`;

const newBlock = `.from("sales_history")\n      .select("*")\n      .eq("is_cancelled", false)\n      // 「最近の売上」は売上日ではなく、実際に登録した順で新しいものを上に表示する。\n      .order("created_at", { ascending: false, nullsFirst: false })\n      .order("sale_date", { ascending: false })\n      .limit(2000),`;

if (!source.includes(oldBlock)) {
  throw new Error("Recent sales query block was not found.");
}

source = source.replace(oldBlock, newBlock);
source += `\n${marker}\n`;
fs.writeFileSync(file, source, "utf8");
console.log("Applied recent sales registration-order fix.");
