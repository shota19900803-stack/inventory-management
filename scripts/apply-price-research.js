const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const importLine = 'import ProductPriceResearchPanel from "./ProductPriceResearchPanel";';
if (!text.includes(importLine)) {
  const marker = 'import { supabaseBrowser } from "../lib/supabase";';
  const index = text.indexOf(marker);
  if (index === -1) throw new Error("Supabase import marker not found.");
  const end = index + marker.length;
  text = text.slice(0, end) + "\n" + importLine + text.slice(end);
}

if (!text.includes("<ProductPriceResearchPanel products={products}")) {
  const productsMarker = '{tab === "products" && (';
  const productsStart = text.indexOf(productsMarker);
  if (productsStart === -1) throw new Error("Product tab marker not found.");

  const fragmentStart = text.indexOf("<>", productsStart + productsMarker.length);
  if (fragmentStart === -1) throw new Error("Product tab fragment not found.");

  const insertAt = fragmentStart + "<>".length;
  const ui = `\n            <ProductPriceResearchPanel products={products} visible={tab === "products"} />`;
  text = text.slice(0, insertAt) + ui + text.slice(insertAt);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied product-management five-slot market check panel.");
