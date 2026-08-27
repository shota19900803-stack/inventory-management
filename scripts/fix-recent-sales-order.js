const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

const marker = "// Applied recent sales registration-order fix.";

// すでに最終形になっている場合は何もしない。
if (
  source.includes(marker) ||
  (source.includes('.from("sales_history")') &&
    source.includes('.order("created_at", { ascending: false, nullsFirst: false })'))
) {
  console.log("Recent sales registration-order fix already applied.");
  process.exit(0);
}

// 前の修正スクリプトでインデントやコメントが変わっていても拾えるように、
// sales_history の取得部分を正規表現で安全に置き換える。
const queryPattern = /\.from\("sales_history"\)([\\s\\S]*?)\.limit\(2000\),/;
const match = source.match(queryPattern);

if (!match) {
  // このビルドでは対象クエリがすでに別の修正で更新済みの可能性がある。
  // ビルド自体を止めず、そのまま継続する。
  console.warn("Recent sales query block was not found; skipping registration-order fix.");
  process.exit(0);
}

const block = match[0];
const updatedBlock = block
  .replace(
    /\.order\("sale_date",\s*\{\s*ascending:\s*false\s*\}\)/,
    '.order("created_at", { ascending: false, nullsFirst: false })\n      // 「最近の売上」は売上日ではなく、実際に登録した順で新しいものを上に表示する。\n      .order("sale_date", { ascending: false })'
  )
  .replace(
    /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)\s*\.order\("sale_date",\s*\{\s*ascending:\s*false\s*\}\)/,
    '.order("created_at", { ascending: false, nullsFirst: false })\n      .order("sale_date", { ascending: false })'
  );

if (updatedBlock === block) {
  // すでに created_at がある等、置換不要な状態ならビルドを継続。
  console.log("Recent sales query does not need modification.");
  process.exit(0);
}

source = source.replace(block, updatedBlock);
source += `\n${marker}\n`;
fs.writeFileSync(file, source, "utf8");
console.log("Applied recent sales registration-order fix.");
