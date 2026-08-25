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
const purchasesMarker = '{tab === "purchases" && (';

if (!text.includes("<BulkRakutenPricePanel products={products}")) {
  const productsStart = text.indexOf(productsMarker);
  const purchasesStart = text.indexOf(purchasesMarker, productsStart + productsMarker.length);
  if (productsStart === -1 || purchasesStart === -1) {
    throw new Error("Product/purchase tab markers not found for bulk Rakuten panel.");
  }

  text =
    text.slice(0, productsStart) +
    productsMarker +
    `\n    <>\n      <BulkRakutenPricePanel products={products} visible={tab === "products"} />` +
    text.slice(productsStart + productsMarker.length);

  // purchasesMarker shifted after insertion; find it again and close the fragment before it.
  const shiftedPurchasesStart = text.indexOf(purchasesMarker, productsStart + productsMarker.length);
  if (shiftedPurchasesStart === -1) throw new Error("Purchase tab marker disappeared after insertion.");

  text =
    text.slice(0, shiftedPurchasesStart) +
    "\n    </>}\n\n" +
    text.slice(shiftedPurchasesStart);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied bulk Rakuten inventory price panel.");
