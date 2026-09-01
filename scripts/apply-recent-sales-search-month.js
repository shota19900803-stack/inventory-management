const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

if (source.includes("recentSalesOrderSearch")) {
  console.log("Recent sales search/month UI already applied.");
  process.exit(0);
}

const stateAnchor = `  const [selectedMonth, setSelectedMonth] =\n  useState(today.slice(0, 7));`;
const stateInsert = `${stateAnchor}\n\n  // 最近の売上用：注文番号検索と表示月\n  const [recentSalesOrderSearch, setRecentSalesOrderSearch] = useState(\"\");\n  const [recentSalesMonth, setRecentSalesMonth] = useState(today.slice(0, 7));`;

if (!source.includes(stateAnchor)) {
  throw new Error("selectedMonth state anchor not found.");
}
source = source.replace(stateAnchor, stateInsert);

const monthSalesAnchor = `  const monthSales = useMemo(() => {\n  return sales.filter(\n    (sale) => monthOf(sale.sale_date) === selectedMonth\n  );\n}, [sales, selectedMonth]);`;
const recentSalesMemo = `${monthSalesAnchor}\n\n  const filteredRecentSales = useMemo(() => {\n    const keyword = recentSalesOrderSearch.trim().toLowerCase();\n\n    return sales.filter((sale) => {\n      const matchesMonth = monthOf(sale.sale_date) === recentSalesMonth;\n      const matchesOrder = !keyword ||\n        String(sale.order_number ?? \"\").toLowerCase().includes(keyword);\n      return matchesMonth && matchesOrder;\n    });\n  }, [sales, recentSalesMonth, recentSalesOrderSearch]);`;

if (!source.includes(monthSalesAnchor)) {
  throw new Error("monthSales anchor not found.");
}
source = source.replace(monthSalesAnchor, recentSalesMemo);

const headingAnchor = `              <h2>最近の売上</h2>`;
const headingReplacement = `              <div\n                style={{\n                  display: "flex",\n                  justifyContent: "space-between",\n                  alignItems: "center",\n                  gap: 12,\n                  flexWrap: "wrap",\n                  marginBottom: 15,\n                }}\n              >\n                <h2 style={{ margin: 0 }}>最近の売上</h2>\n\n                <div\n                  style={{\n                    display: "flex",\n                    gap: 10,\n                    flexWrap: "wrap",\n                    alignItems: "center",\n                  }}\n                >\n                  <label style={{ fontWeight: 700 }}>\n                    月\n                    <select\n                      value={recentSalesMonth}\n                      onChange={(e) => setRecentSalesMonth(e.target.value)}\n                      style={{ ...inputStyle, marginLeft: 6, width: 150 }}\n                    >\n                      {months.map((month) => (\n                        <option value={month} key={month}>\n                          {month}\n                        </option>\n                      ))}\n                    </select>\n                  </label>\n\n                  <input\n                    style={{ ...inputStyle, width: 220 }}\n                    value={recentSalesOrderSearch}\n                    onChange={(e) => setRecentSalesOrderSearch(e.target.value)}\n                    placeholder="注文番号で検索"\n                  />\n                </div>\n              </div>\n\n              <div\n                style={{\n                  marginBottom: 12,\n                  color: "#6b7280",\n                  fontSize: 13,\n                }}\n              >\n                {recentSalesOrderSearch.trim()\n                  ? recentSalesMonth + "・注文番号「" + recentSalesOrderSearch.trim() + "」の検索結果：" + filteredRecentSales.length + "件"\n                  : recentSalesMonth + "の売上：" + filteredRecentSales.length + "件"}\n              </div>`;

if (!source.includes(headingAnchor)) {
  throw new Error("最近の売上 heading not found.");
}
source = source.replace(headingAnchor, headingReplacement);

const recentHeadingIndex = source.indexOf("<h2 style={{ margin: 0 }}>最近の売上</h2>");
const recentSectionStart = source.lastIndexOf("<section", recentHeadingIndex);
const recentSectionEnd = source.indexOf("</section>", recentHeadingIndex);
if (recentSectionStart < 0 || recentSectionEnd < 0) {
  throw new Error("Recent sales section boundaries not found.");
}

let recentSection = source.slice(recentSectionStart, recentSectionEnd);
recentSection = recentSection.replace(
  /\{sales\s*\.slice\(0, 100\)\s*\.map\(\(sale\) => \(/,
  "{filteredRecentSales.map((sale) => ("
);

const recentSalesChannelHeader = `                      <th style={{ padding: 10 }}>\n                        販売先\n                      </th>`;
if (recentSection.includes(recentSalesChannelHeader)) {
  recentSection = recentSection.replace(
    recentSalesChannelHeader,
    `${recentSalesChannelHeader}\n                      <th style={{ padding: 10 }}>\n                        注文番号\n                      </th>`
  );
}

const recentSalesChannelCell = `                          <td style={{ padding: 10 }}>\n                            {sale.sales_channel ||\n                              "—"}\n                          </td>`;
if (recentSection.includes(recentSalesChannelCell)) {
  recentSection = recentSection.replace(
    recentSalesChannelCell,
    `${recentSalesChannelCell}\n\n                          <td style={{ padding: 10, whiteSpace: "nowrap" }}>\n                            {sale.order_number || "—"}\n                          </td>`
  );
}

if (!recentSection.includes("filteredRecentSales.map")) {
  throw new Error("Recent sales map replacement failed.");
}

source = source.slice(0, recentSectionStart) + recentSection + source.slice(recentSectionEnd);
fs.writeFileSync(file, source, "utf8");
console.log("Applied recent sales order-number search and month filter.");
