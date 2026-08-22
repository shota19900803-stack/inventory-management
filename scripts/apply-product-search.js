const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const stateMarker = '  const [historyProductId, setHistoryProductId] = useState("");';
if (!text.includes("purchaseProductSearch")) {
  if (!text.includes(stateMarker)) {
    throw new Error("Product search state marker was not found.");
  }

  const searchState = `  const [purchaseProductSearch, setPurchaseProductSearch] = useState("");
  const [saleProductSearch, setSaleProductSearch] = useState("");

  const purchaseFilteredProducts = useMemo(() => {
    const keyword = purchaseProductSearch.trim().toLowerCase();
    if (!keyword) return products;

    return products.filter((product) =>
      [product.name, product.jan_code, product.sku, product.model_number, product.brand]
        .some((value) => String(value ?? "").toLowerCase().includes(keyword))
    );
  }, [products, purchaseProductSearch]);

  const saleFilteredProducts = useMemo(() => {
    const keyword = saleProductSearch.trim().toLowerCase();
    if (!keyword) return products;

    return products.filter((product) =>
      [product.name, product.jan_code, product.sku, product.model_number, product.brand]
        .some((value) => String(value ?? "").toLowerCase().includes(keyword))
    );
  }, [products, saleProductSearch]);

`;
  text = text.replace(stateMarker, searchState + stateMarker);
}

const purchaseOld = `                  <label>\n                    商品*\n                    <select\n                      style={inputStyle}\n                      value={\n                        purchaseForm.product_id\n                      }\n                      onChange={(e) =>\n                        setPurchaseForm({\n                          ...purchaseForm,\n                          product_id:\n                            e.target.value,\n                        })\n                      }\n                    >\n                      <option value="">\n                        商品を選択\n                      </option>\n\n                      {products.map(\n                        (product) => (\n                          <option\n                            key={product.id}\n                            value={product.id}\n                          >\n                            {product.name}\n                          </option>\n                        )\n                      )}\n                    </select>\n                  </label>`;

const purchaseNew = `                  <label>\n                    商品*\n                    <input\n                      style={inputStyle}\n                      type="search"\n                      value={purchaseProductSearch}\n                      onChange={(e) =>\n                        setPurchaseProductSearch(e.target.value)\n                      }\n                      placeholder="商品名・JAN・SKU・型番・ブランドで検索"\n                    />\n                    <div\n                      style={{\n                        marginTop: 6,\n                        fontSize: 12,\n                        color: "#6b7280",\n                      }}\n                    >\n                      {purchaseProductSearch.trim()\n                        ? `${purchaseFilteredProducts.length}件が該当`\n                        : `${products.length}件の商品から選択`}\n                    </div>\n                    <select\n                      style={{ ...inputStyle, marginTop: 6 }}\n                      value={purchaseForm.product_id}\n                      onChange={(e) => {\n                        setPurchaseForm({\n                          ...purchaseForm,\n                          product_id: e.target.value,\n                        });\n                        setPurchaseProductSearch("");\n                      }}\n                    >\n                      <option value="">\n                        商品を選択\n                      </option>\n\n                      {purchaseFilteredProducts.map((product) => (\n                        <option key={product.id} value={product.id}>\n                          {product.name}\n                          {product.jan_code ? `　[${product.jan_code}]` : ""}\n                        </option>\n                      ))}\n                    </select>\n                  </label>`;

if (text.includes(purchaseOld)) {
  text = text.replace(purchaseOld, purchaseNew);
} else if (!text.includes("purchaseProductSearch")) {
  throw new Error("Purchase product selector block was not found.");
}

const saleOld = `                  <label>\n                    商品*\n                    <select\n                      style={inputStyle}\n                      value={\n                        saleForm.product_id\n                      }\n                      onChange={(e) => {\n                        const product =\n                          products.find(\n                            (item) =>\n                              item.id ===\n                              e.target.value\n                          );\n\n                        setSaleForm({\n                          ...saleForm,\n                          product_id:\n                            e.target.value,\n                          unit_price:\n                            product?.selling_price !=\n                            null\n                              ? String(\n                                  product.selling_price\n                                )\n                              : saleForm.unit_price,\n                          unit_cost:\n                            product?.cost_price !=\n                            null\n                              ? String(\n                                  product.cost_price\n                                )\n                              : saleForm.unit_cost,\n                        });\n                      }}\n                    >\n                      <option value="">\n                        商品を選択\n                      </option>\n\n                      {products.map(\n                        (product) => (\n                          <option\n                            key={product.id}\n                            value={product.id}\n                          >\n                            {product.name}\n                          </option>\n                        )\n                      )}\n                    </select>\n                  </label>`;

const saleNew = `                  <label>\n                    商品*\n                    <input\n                      style={inputStyle}\n                      type="search"\n                      value={saleProductSearch}\n                      onChange={(e) =>\n                        setSaleProductSearch(e.target.value)\n                      }\n                      placeholder="商品名・JAN・SKU・型番・ブランドで検索"\n                    />\n                    <div\n                      style={{\n                        marginTop: 6,\n                        fontSize: 12,\n                        color: "#6b7280",\n                      }}\n                    >\n                      {saleProductSearch.trim()\n                        ? `${saleFilteredProducts.length}件が該当`\n                        : `${products.length}件の商品から選択`}\n                    </div>\n                    <select\n                      style={{ ...inputStyle, marginTop: 6 }}\n                      value={saleForm.product_id}\n                      onChange={(e) => {\n                        const product = products.find(\n                          (item) => item.id === e.target.value\n                        );\n\n                        setSaleForm({\n                          ...saleForm,\n                          product_id: e.target.value,\n                          unit_price:\n                            product?.selling_price != null\n                              ? String(product.selling_price)\n                              : saleForm.unit_price,\n                          unit_cost:\n                            product?.cost_price != null\n                              ? String(product.cost_price)\n                              : saleForm.unit_cost,\n                        });\n                        setSaleProductSearch("");\n                      }}\n                    >\n                      <option value="">\n                        商品を選択\n                      </option>\n\n                      {saleFilteredProducts.map((product) => (\n                        <option key={product.id} value={product.id}>\n                          {product.name}\n                          {product.jan_code ? `　[${product.jan_code}]` : ""}\n                        </option>\n                      ))}\n                    </select>\n                  </label>`;

if (text.includes(saleOld)) {
  text = text.replace(saleOld, saleNew);
} else if (!text.includes("saleProductSearch")) {
  throw new Error("Sales product selector block was not found.");
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied searchable product selectors to purchase and sales forms.");
