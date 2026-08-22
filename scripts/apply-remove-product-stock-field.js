const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const start = text.indexOf("                  <label>\n                    在庫数");
if (start === -1) {
  console.log("Product stock field already removed or not found.");
  process.exit(0);
}

const endMarker = "                  </label>\n\n                  <label>\n                    現在の参考仕入価格";
const end = text.indexOf(endMarker, start);
if (end === -1) {
  throw new Error("Product stock field end marker was not found.");
}

text = text.slice(0, start) + text.slice(end + "                  </label>\n\n".length);
fs.writeFileSync(file, text, "utf8");
console.log("Removed stock quantity input from product registration form.");
