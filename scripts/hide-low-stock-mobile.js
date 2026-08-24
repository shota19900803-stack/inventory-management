const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const marker = `...cardStyle,\n    cursor: "pointer",\n  }}\n  onClick={() => setTab("products")}`;
const replacement = `...cardStyle,\n    cursor: "pointer",\n    display:\n      typeof window !== "undefined" && window.innerWidth <= 767\n        ? "none"\n        : undefined,\n  }}\n  onClick={() => setTab("products")}`;

if (text.includes("window.innerWidth <= 767")) {
  console.log("Mobile low-stock card is already hidden; skipping.");
  process.exit(0);
}

if (!text.includes(marker)) {
  console.warn("Low-stock card marker not found; skipping mobile hide patch.");
  process.exit(0);
}

text = text.replace(marker, replacement);
fs.writeFileSync(file, text, "utf8");
console.log("Applied direct mobile hide for low-stock card.");
