const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// Add a searchable product picker to the purchase-registration form.
// This script is intentionally idempotent and safe for deployments where
// the purchase form has already been normalized or temporarily paused.
if (text.includes("// Applied purchase product search.")) {
  console.log("Purchase product search already applied.");
  process.exit(0);
}

const stateMarker = '  const [historyProductId, setHistoryProductId] = useState("");';
if (!text.includes(stateMarker)) {
  console.log(
    "Purchase search state insertion marker was not found; skipping purchase product search patch."
  );
  process.exit(0);
}

const stateBlock = `  const [purchaseProductSearch, setPurchaseProductSearch] = useState("");

  const filteredPurchaseProducts = useMemo(() => {
    const keyword = purchaseProductSearch.trim().toLowerCase();

    if (!keyword) {
      return products;
    }

    return products.filter((product) =>
      [
        product.name,
        product.jan_code,
        product.sku,
        product.model_number,
        product.brand,
        product.category,
      ].some((value) =>
        String(value ?? "").toLowerCase().includes(keyword)
      )
    );
  }, [products, purchaseProductSearch]);

${stateMarker}`;
text = text.replace(stateMarker, stateBlock);

const productLabelMarker = `                  <label>\n                    商品*\n                    <select`;
const start = text.indexOf(
  productLabelMarker,
  text.indexOf('{tab === "purchases" && (')
);
if (start === -1) {
  console.log(
    "Purchase product select marker was not found; skipping purchase product search patch."
  );
  process.exit(0);
}

const selectStart = text.indexOf("                    <select", start);
const selectEnd = text.indexOf("                    </select>", selectStart);
if (selectStart === -1 || selectEnd === -1) {
  console.log(
    "Purchase product select block was not found; skipping purchase product search patch."
  );
  process.exit(0);
}

const selectEndExclusive =
  selectEnd + "                    </select>".length;

const newSelect = `                    <div>
                      <input
                        style={inputStyle}
                        value={purchaseProductSearch}
                        onChange={(e) =>
                          setPurchaseProductSearch(e.target.value)
                        }
                        placeholder="商品名・JAN・SKU・型番・ブランドで検索"
                      />

                      <select
                        style={{
                          ...inputStyle,
                          marginTop: 8,
                        }}
                        value={purchaseForm.product_id}
                        onChange={(e) =>
                          setPurchaseForm({
                            ...purchaseForm,
                            product_id: e.target.value,
                          })
                        }
                      >
                        <option value="">商品を選択</option>

                        {filteredPurchaseProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                            {product.jan_code
                              ? "　(" + product.jan_code + ")"
                              : ""}
                          </option>
                        ))}
                      </select>

                      <div
                        style={{
                          marginTop: 5,
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        {filteredPurchaseProducts.length}件の商品から選択
                      </div>
                    </div>`;

text =
  text.slice(0, selectStart) +
  newSelect +
  text.slice(selectEndExclusive);

text += `\n// Applied purchase product search.\n`;
fs.writeFileSync(file, text, "utf8");
console.log("Applied searchable product picker to purchase registration.");
