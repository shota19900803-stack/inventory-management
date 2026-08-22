const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// Remove only the product registration stock input.
// Do not rely on exact indentation/adjacent labels because previous UI patches
// may have changed the surrounding JSX layout.
const startMarker = /\n\s*<label>\s*\n\s*在庫数\s*\n/;
const startMatch = text.match(startMarker);

if (!startMatch || startMatch.index == null) {
  console.log("Product stock field already removed or not found.");
  process.exit(0);
}

const start = startMatch.index;
const afterStart = start + startMatch[0].length;

// The stock label is a simple label containing one input. Find the next label
// at the same JSX level and remove everything between them.
const nextLabelMatch = text.slice(afterStart).match(/\n\s*<label>\s*\n/);

if (!nextLabelMatch || nextLabelMatch.index == null) {
  throw new Error("Product stock field next label marker was not found.");
}

const end = afterStart + nextLabelMatch.index;

text = text.slice(0, start) + "\n" + text.slice(end);
fs.writeFileSync(file, text, "utf8");
console.log("Removed stock quantity input from product registration form.");
