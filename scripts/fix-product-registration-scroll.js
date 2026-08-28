const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

const saveStart = source.indexOf("async function saveProduct(");
if (saveStart < 0) {
  throw new Error("saveProduct function was not found.");
}

const nextFunction = source.indexOf("\n  async function ", saveStart + 10);
const saveEnd = nextFunction >= 0 ? nextFunction : source.length;
let saveBlock = source.slice(saveStart, saveEnd);

const scrollMarker = "// FINAL: preserve product registration scroll position";

if (!saveBlock.includes(scrollMarker)) {
  const eventMarker = "    event.preventDefault();";
  if (!saveBlock.includes(eventMarker)) {
    throw new Error("saveProduct event.preventDefault() was not found.");
  }

  saveBlock = saveBlock.replace(
    eventMarker,
    `${eventMarker}\n\n    const productScrollY =\n      typeof window !== "undefined" ? window.scrollY : 0;`
  );

  const loadMarker = "      await loadAll();";
  const loadIndex = saveBlock.lastIndexOf(loadMarker);
  if (loadIndex < 0) {
    throw new Error("saveProduct loadAll() was not found.");
  }

  const insertAt = loadIndex + loadMarker.length;
  saveBlock =
    saveBlock.slice(0, insertAt) +
    `\n\n      ${scrollMarker}\n      if (typeof window !== "undefined") {\n        requestAnimationFrame(() => {\n          window.scrollTo({\n            top: productScrollY,\n            left: 0,\n            behavior: "auto",\n          });\n        });\n      }` +
    saveBlock.slice(insertAt);

  // Duplicate-JAN handling used to jump to the very top unnecessarily.
  saveBlock = saveBlock.replace(
    /\n        window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\);/g,
    ""
  );

  source = source.slice(0, saveStart) + saveBlock + source.slice(saveEnd);
  fs.writeFileSync(file, source, "utf8");
  console.log("Applied product registration scroll preservation fix.");
} else {
  console.log("Product registration scroll preservation fix already applied.");
}
