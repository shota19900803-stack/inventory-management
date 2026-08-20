const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");
const join = (lines) => lines.join("\n");

// 棚卸し履歴の型を追加
if (!text.includes("type StocktakeHistory = {")) {
  const marker = join([
    "type Sale = {",
    "  id: string;",
    "  product_id: string;",
    "  sale_date: string;",
    "  sales_channel?: string | null;",
    "  order_number?: string | null;",
    "  unit_price: number;",
    "  unit_cost: number;",
    "  quantity: number;",
    "  total_sales: number;",
    "  total_cost: number;",
    "  gross_profit: number;",
    "  notes?: string | null;",
    "  is_cancelled: boolean;",
    "  created_at?: string;",
    "}",
  ]);
  const addition = join([
    marker,
    "",
    "type StocktakeHistory = {",
    "  id: string;",
    "  session_id: string;",
    "  product_id: string;",
    "  stock_before: number;",
    "  stock_counted: number;",
    "  difference: number;",
    "  created_at: string;",
    "};",
  ]);
  if (!text.includes(marker)) throw new Error("Sale type marker not found");
  text = text.replace(marker, addition);
}

// 履歴stateを追加
if (!text.includes("const [stocktakeHistory, setStocktakeHistory]")) {
  const marker = join([
    "  const [products, setProducts] = useState<Product[]>([]);",
    "  const [purchases, setPurchases] = useState<Purchase[]>([]);",
    "  const [sales, setSales] = useState<Sale[]>([]);",
  ]);
  const addition = join([
    marker,
    "  const [stocktakeHistory, setStocktakeHistory] = useState<StocktakeHistory[]>([]);",
  ]);
  if (!text.includes(marker)) throw new Error("data state marker not found");
  text = text.replace(marker, addition);
}

// loadAllで棚卸し履歴も取得
if (!text.includes('const stocktakeHistoryResult = await supabase')) {
  const marker = join([
    "  const [",
    "    productsResult,",
    "    purchasesResult,",
    "    salesResult,",
    "  ] = await Promise.all([",
  ]);
  const addition = join([
    "  const [",
    "    productsResult,",
    "    purchasesResult,",
    "    salesResult,",
    "  ] = await Promise.all([",
    "    supabase",
    "      .from(\"products\")",
    "      .select(\"*\")",
    "      .order(\"created_at\", { ascending: false })",
    "      .limit(1000),",
    "",
    "    supabase",
    "      .from(\"purchase_history\")",
    "      .select(\"*\")",
    "      .order(\"purchase_date\", { ascending: false })",
    "      .limit(2000),",
    "",
    "    supabase",
    "      .from(\"sales_history\")",
    "      .select(\"*\")",
    "      .eq(\"is_cancelled\", false)",
    "      .order(\"sale_date\", { ascending: false })",
    "      .limit(2000),",
    "",
    "    supabase",
    "      .from(\"stocktake_history\")",
    "      .select(\"*\")",
    "      .order(\"created_at\", { ascending: false })",
    "      .limit(500),",
    "  ]);",
  ]);
  if (!text.includes(marker)) throw new Error("loadAll promise marker not found");
  text = text.replace(marker, addition);

  const resultMarker = join([
    "if (salesResult.error) {",
    "  setMessage(",
    "    `売上履歴読み込みエラー：${salesResult.error.message}`",
    "  );",
    "} else {",
    "  setSales(",
    "    (salesResult.data ?? []) as Sale[]",
    "  );",
    "}",
  ]);
  const resultAddition = join([
    resultMarker,
    "",
    "  const { data: stocktakeHistoryData, error: stocktakeHistoryError } = await supabase",
    "    .from(\"stocktake_history\")",
    "    .select(\"*\")",
    "    .order(\"created_at\", { ascending: false })",
    "    .limit(500);",
    "",
    "  if (stocktakeHistoryError) {",
    "    console.warn(\"棚卸し履歴読み込みエラー：\", stocktakeHistoryError.message);",
    "  } else {",
    "    setStocktakeHistory((stocktakeHistoryData ?? []) as StocktakeHistory[]);",
    "  }",
  ]);
  if (!text.includes(resultMarker)) throw new Error("sales result marker not found");
  text = text.replace(resultMarker, resultAddition);
}

// 棚卸し履歴UIを追加
if (!text.includes('id="stocktake-history"')) {
  const marker = '        {tab === "sales" && (';
  const ui = join([
    '        {tab === "stocktake" && stocktakeHistory.length > 0 && (',
    '          <section id="stocktake-history" style={cardStyle}>',
    '            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>',
    '              <div>',
    '                <h2 style={{ margin: 0 }}>📚 棚卸し履歴</h2>',
    '                <p style={{ color: "#6b7280", margin: "6px 0 0" }}>確定した棚卸しの履歴を確認できます。</p>',
    '              </div>',
    '              <div style={{ fontWeight: 700, color: "#374151" }}>{stocktakeHistory.length}件</div>',
    '            </div>',
    '            <div style={{ overflowX: "auto", marginTop: 15 }}>',
    '              <table style={{ width: "100%", borderCollapse: "collapse" }}>',
    '                <thead>',
    '                  <tr>',
    '                    <th style={{ textAlign: "left", padding: 10 }}>日時</th>',
    '                    <th style={{ textAlign: "left", padding: 10 }}>商品</th>',
    '                    <th style={{ textAlign: "left", padding: 10 }}>JAN</th>',
    '                    <th style={{ textAlign: "right", padding: 10 }}>棚卸前</th>',
    '                    <th style={{ textAlign: "right", padding: 10 }}>実在庫</th>',
    '                    <th style={{ textAlign: "right", padding: 10 }}>差異</th>',
    '                  </tr>',
    '                </thead>',
    '                <tbody>',
    '                  {stocktakeHistory.map((history) => {',
    '                    const product = productMap[history.product_id];',
    '                    const diff = Number(history.difference || 0);',
    '                    return (',
    '                      <tr key={history.id} style={{ borderTop: "1px solid #f1f5f9" }}>',
    '                        <td style={{ padding: 10, whiteSpace: "nowrap" }}>{new Date(history.created_at).toLocaleString("ja-JP")}</td>',
    '                        <td style={{ padding: 10, fontWeight: 600 }}>{product?.name ?? "商品不明"}</td>',
    '                        <td style={{ padding: 10 }}>{product?.jan_code ?? "—"}</td>',
    '                        <td style={{ padding: 10, textAlign: "right" }}>{history.stock_before}</td>',
    '                        <td style={{ padding: 10, textAlign: "right" }}>{history.stock_counted}</td>',
    '                        <td style={{ padding: 10, textAlign: "right", fontWeight: 700, color: diff === 0 ? "#15803d" : diff > 0 ? "#2563eb" : "#dc2626" }}>{diff >= 0 ? "+" : ""}{diff}</td>',
    '                      </tr>',
    '                    );',
    '                  })}',
    '                </tbody>',
    '              </table>',
    '            </div>',
    '          </section>',
    '        )}',
    '',
    marker,
  ]);
  if (!text.includes(marker)) throw new Error("sales tab marker not found for history UI");
  text = text.replace(marker, ui);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied stocktake history UI patch.");
