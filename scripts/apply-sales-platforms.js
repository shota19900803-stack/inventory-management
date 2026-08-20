const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

if (!text.includes('function salesPlatformGroup(')) {
  const marker = 'function monthOf(date: string) {\n  return date.slice(0, 7);\n}\n';
  if (!text.includes(marker)) {
    throw new Error("monthOf function was not found.");
  }

  text = text.replace(
    marker,
    `${marker}\nfunction salesPlatformGroup(channel: string | null | undefined) {\n  if (channel === "楽天市場") return "楽天市場";\n  if (channel === "Amazon") return "Amazon";\n  return "その他";\n}\n`
  );
}

if (!text.includes('const platformSalesSummary = useMemo')) {
  const marker = `  const monthPurchases = useMemo(() => {\n    return purchases.filter(\n      (purchase) =>\n        monthOf(purchase.purchase_date) === selectedMonth\n    );\n  }, [purchases, selectedMonth]);\n`;

  if (!text.includes(marker)) {
    throw new Error("monthPurchases block was not found.");
  }

  const block = `${marker}\n  const platformSalesSummary = useMemo(() => {\n    const summary = {\n      楽天市場: { sales: 0, grossProfit: 0, count: 0, quantity: 0 },\n      Amazon: { sales: 0, grossProfit: 0, count: 0, quantity: 0 },\n      その他: { sales: 0, grossProfit: 0, count: 0, quantity: 0 },\n    };\n\n    monthSales.forEach((sale) => {\n      const platform = salesPlatformGroup(sale.sales_channel);\n      summary[platform].sales += Number(sale.total_sales || 0);\n      summary[platform].grossProfit += Number(sale.gross_profit || 0);\n      summary[platform].count += 1;\n      summary[platform].quantity += Number(sale.quantity || 0);\n    });\n\n    return summary;\n  }, [monthSales]);\n`;

  text = text.replace(marker, block);
}

if (!text.includes('プラットフォーム別売上')) {
  const marker = `            <section style={cardStyle}>\n              <h2>今月の売上履歴</h2>`;

  if (!text.includes(marker)) {
    throw new Error("monthly sales history section was not found.");
  }

  const section = `            <section style={cardStyle}>\n              <div\n                style={{\n                  display: "flex",\n                  justifyContent: "space-between",\n                  alignItems: "center",\n                  gap: 15,\n                  flexWrap: "wrap",\n                }}\n              >\n                <div>\n                  <h2 style={{ margin: 0 }}>プラットフォーム別売上</h2>\n                  <p style={{ color: "#6b7280", marginBottom: 0 }}>\n                    {selectedMonth} の売上を販売先ごとに確認できます。\n                  </p>\n                </div>\n              </div>\n\n              <div\n                style={{\n                  display: "grid",\n                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",\n                  gap: 15,\n                  marginTop: 18,\n                }}\n              >\n                {(["楽天市場", "Amazon", "その他"] as const).map((platform) => {\n                  const summary = platformSalesSummary[platform];\n                  return (\n                    <div\n                      key={platform}\n                      style={{\n                        border: "1px solid #e5e7eb",\n                        borderRadius: 14,\n                        padding: 18,\n                        background: "#fff",\n                      }}\n                    >\n                      <div style={{ fontSize: 15, fontWeight: 700 }}>\n                        {platform}\n                      </div>\n                      <strong style={{ display: "block", fontSize: 26, marginTop: 8 }}>\n                        {yen(summary.sales)}\n                      </strong>\n                      <div style={{ marginTop: 6, color: "#15803d", fontWeight: 700 }}>\n                        粗利 {yen(summary.grossProfit)}\n                      </div>\n                      <div style={{ marginTop: 8, color: "#6b7280", fontSize: 13 }}>\n                        {summary.count}件 / {summary.quantity}個\n                      </div>\n                    </div>\n                  );\n                })}\n              </div>\n            </section>\n\n            <section style={cardStyle}>\n              <h2>今月の売上履歴</h2>`;

  text = text.replace(marker, section);
}

const oldOptions = `                      <option>\n                        楽天市場\n                      </option>\n                      <option>\n                        Amazon\n                      </option>\n                      <option>\n                        Yahoo!ショッピング\n                      </option>\n                      <option>\n                        メルカリ\n                      </option>\n                      <option>\n                        店頭販売\n                      </option>\n                      <option>\n                        その他\n                      </option>`;

const newOptions = `                      <option value="楽天市場">\n                        楽天市場\n                      </option>\n                      <option value="Amazon">\n                        Amazon\n                      </option>\n                      <option value="その他">\n                        その他\n                      </option>`;

if (text.includes(oldOptions)) {
  text = text.replace(oldOptions, newOptions);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied sales platform management patch.");
