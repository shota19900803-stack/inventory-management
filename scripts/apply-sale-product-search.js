const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// Add a searchable product picker to the sales-registration form.
// This script is intentionally idempotent and tolerant of earlier UI patches.
if (text.includes("// Applied sale product search.")) {
  console.log("Sale product search already applied.");
  process.exit(0);
}

// Insert the search state if it is not already present.
if (!text.includes("const [saleProductSearch, setSaleProductSearch]")) {
  const stateMarker = '  const [historyProductId, setHistoryProductId] = useState("");';

  if (!text.includes(stateMarker)) {
    throw new Error("Sale search state insertion marker was not found.");
  }

  const stateBlock = `  const [saleProductSearch, setSaleProductSearch] = useState("");

  const filteredSaleProducts = useMemo(() => {
    const keyword = saleProductSearch.trim().toLowerCase();

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
  }, [products, saleProductSearch]);

${stateMarker}`;

  text = text.replace(stateMarker, stateBlock);
}

const salesTabMarker = '{tab === "sales" && (';
const salesTabStart = text.indexOf(salesTabMarker);

if (salesTabStart === -1) {
  throw new Error("Sales tab marker was not found.");
}

// Do not depend on the exact JSX indentation or label text. Earlier build
// patches may already have changed the sales product selector.
const selectStart = text.indexOf("<select", salesTabStart);
const selectEnd = text.indexOf("</select>", selectStart);

if (selectStart === -1 || selectEnd === -1) {
  throw new Error("Sales product select block was not found.");
}

const selectEndExclusive = selectEnd + "</select>".length;

const newSelect = `                    <div>
                      <input
                        style={inputStyle}
                        value={saleProductSearch}
                        onChange={(e) =>
                          setSaleProductSearch(e.target.value)
                        }
                        placeholder="商品名・JAN・SKU・型番・ブランドで検索"
                      />

                      <select
                        style={{
                          ...inputStyle,
                          marginTop: 8,
                        }}
                        value={saleForm.product_id}
                        onChange={(e) => {
                          const product = products.find(
                            (item) => item.id === e.target.value
                          );

                          setSaleForm({
                            ...saleForm,
                            product_id: e.target.value,
                            unit_price:
                              product?.selling_price != null
                                ? String(product.selling_price)
                                : saleForm.unit_price,
                            unit_cost:
                              product?.cost_price != null
                                ? String(product.cost_price)
                                : saleForm.unit_cost,
                          });
                        }}
                      >
                        <option value="">商品を選択</option>

                        {filteredSaleProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                            {product.jan_code ? "　(" + product.jan_code + ")" : ""}
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
                        {filteredSaleProducts.length}件の商品から選択
                      </div>
                    </div>`;

text = text.slice(0, selectStart) + newSelect + text.slice(selectEndExclusive);

text += `\n// Applied sale product search.\n`;
fs.writeFileSync(file, text, "utf8");
console.log("Applied searchable product picker to sales registration.");
