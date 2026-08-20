const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

if (text.includes("async function searchJanManually")) {
  console.log("Manual JAN search patch already applied.");
  process.exit(0);
}

const functionMarker = "const startJanScanner = () => {";
if (!text.includes(functionMarker)) {
  throw new Error("JAN scanner function marker was not found.");
}

const helper = `async function searchJanManually() {
  const jan = productForm.jan_code.replace(/\\D/g, "");

  if (!/^\\d{13}$/.test(jan)) {
    setMessage("JANコードは13桁で入力してください。");
    return;
  }

  await lookupProductByJan(jan);
}

`;

text = text.replace(functionMarker, helper + functionMarker);

const buttonMarker = `    📷 JAN読取\n  </button>\n</div>`;
if (!text.includes(buttonMarker)) {
  throw new Error("JAN scanner button block was not found.");
}

const searchButton = `    📷 JAN読取\n  </button>\n\n  <button\n    type="button"\n    onClick={searchJanManually}\n    style={{\n      padding: "10px 14px",\n      borderRadius: 10,\n      border: "none",\n      background: "#2563eb",\n      color: "#fff",\n      fontWeight: 700,\n      cursor: "pointer",\n      whiteSpace: "nowrap",\n    }}\n  >\n    🔎 JAN検索\n  </button>\n</div>`;

text = text.replace(buttonMarker, searchButton);

fs.writeFileSync(file, text, "utf8");
console.log("Applied manual JAN search button.");
