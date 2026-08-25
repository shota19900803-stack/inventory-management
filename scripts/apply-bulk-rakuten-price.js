const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const importLine = 'import BulkRakutenPricePanel from "./BulkRakutenPricePanel";';
if (!text.includes(importLine)) {
  const importMarker = 'import { supabaseBrowser } from "../lib/supabase";';
  const index = text.indexOf(importMarker);
  if (index === -1) throw new Error("Supabase import marker not found.");
  const end = index + importMarker.length;
  text = text.slice(0, end) + "\n" + importLine + text.slice(end);
}

const productsMarker = '{tab === "products" && (';

if (!text.includes("<BulkRakutenPricePanel products={products}")) {
  const productsStart = text.indexOf(productsMarker);
  if (productsStart === -1) {
    throw new Error("Product tab marker not found for bulk Rakuten panel.");
  }

  // The products tab already owns its React fragment: `{... && ( <> ... </> )}`.
  // Insert the panel inside that existing fragment instead of creating another
  // fragment/closing pair, which previously produced invalid JSX at build time.
  const fragmentStart = text.indexOf("<>", productsStart + productsMarker.length);
  if (fragmentStart === -1) {
    throw new Error("Product tab fragment not found for bulk Rakuten panel.");
  }

  const insertAt = fragmentStart + "<>".length;
  const ui = `
            <BulkRakutenPricePanel products={products} visible={tab === "products"} />`;

  text = text.slice(0, insertAt) + ui + text.slice(insertAt);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied bulk Rakuten inventory price panel.");
