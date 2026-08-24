const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const oldConstructor = "new BrowserMultiFormatReader(undefined, 250)";
const newConstructor = "new BrowserMultiFormatReader()";

if (text.includes(oldConstructor)) {
  text = text.replaceAll(oldConstructor, newConstructor);
  fs.writeFileSync(file, text, "utf8");
  console.log("Fixed ZXing BrowserMultiFormatReader constructor.");
} else {
  console.log("ZXing constructor already compatible; no change needed.");
}
