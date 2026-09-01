const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

// 売上履歴の「最近の売上／今月の売上履歴」に仕入値（1個あたり）を追加する。
// 送料などの既存列は壊さず、売上の直後に挿入する。
const salesHeading = source.includes("<h2>最近の売上</h2>")
  ? "<h2>最近の売上</h2>"
  : source.includes("<h2>今月の売上履歴</h2>")
    ? "<h2>今月の売上履歴</h2>"
    : null;

if (salesHeading) {
  const headingIndex = source.indexOf(salesHeading);
  const sectionStart = source.lastIndexOf("<section", headingIndex);
  const nextSection = source.indexOf("<section", headingIndex + salesHeading.length);
  const sectionEnd = nextSection >= 0 ? nextSection : source.length;

  if (sectionStart >= 0) {
    let section = source.slice(sectionStart, sectionEnd);

    if (!section.includes('data-purchase-cost-header="true"')) {
      const salesHeader = /(<th[^>]*>\s*売上\s*<\/th>)/;
      if (salesHeader.test(section)) {
        section = section.replace(
          salesHeader,
          '$1\n                      <th style={{ padding: 10 }} data-purchase-cost-header="true">\n                        仕入値\n                      </th>'
        );
      }
    }

    if (!section.includes('data-purchase-cost-cell="true"')) {
      const salesCell = /(<td[^>]*>\s*\{yen\(\s*sale\.total_sales\s*\)\}\s*<\/td>)/;
      if (salesCell.test(section)) {
        section = section.replace(
          salesCell,
          '$1\n\n                          <td style={{ padding: 10, textAlign: "right" }} data-purchase-cost-cell="true">\n                            {yen(sale.unit_cost)}\n                          </td>'
        );
      }
    }

    source = source.slice(0, sectionStart) + section + source.slice(sectionEnd);
  }
}

// 商品一覧の「参考仕入」を、現在庫に対応する仕入金額へ変更する。
const productListStart = source.indexOf("<h2>商品一覧</h2>");
if (productListStart >= 0) {
  const tableStart = source.indexOf("<table", productListStart);
  const tableEnd = source.indexOf("</table>", tableStart);
  if (tableStart >= 0 && tableEnd >= 0) {
    const tableEndInclusive = tableEnd + "</table>".length;
    let table = source.slice(tableStart, tableEndInclusive);

    table = table.replace(
      /<th([^>]*)>\s*参考仕入\s*<\/th>/,
      '<th$1>\n                        在庫仕入金額\n                      </th>'
    );

    table = table.replace(
      /<td\n\s*style=\{\{\n\s*padding: 10,\n\s*textAlign: "right",\n\s*\}\}\n\s*>\n\s*\{yen\(\s*product\.cost_price\s*\)\}\n\s*<\/td>/,
      `<td
                            style={{
                              padding: 10,
                              textAlign: "right",
                              fontWeight: 700,
                            }}
                          >
                            {yen(
                              Number(product.stock_quantity || 0) *
                              Number(product.cost_price || 0)
                            )}
                          </td>`
    );

    source = source.slice(0, tableStart) + table + source.slice(tableEndInclusive);
  }
}

fs.writeFileSync(file, source, "utf8");
console.log("Applied sales purchase-cost and product inventory-value display patch.");
