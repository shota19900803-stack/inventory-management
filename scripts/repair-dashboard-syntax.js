const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let source = fs.readFileSync(file, 'utf8');

let changed = false;

const broken = '?? sale.sales_channel || "—")';
const fixed = '?? (sale.sales_channel || "—"))';

if (source.includes(broken)) {
  source = source.replace(broken, fixed);
  changed = true;
  console.log('Repaired Dashboard.tsx sales-channel fallback syntax.');
}

// 「今月の売上履歴」は実際には6列（日付・商品・販売先・売上・粗利・操作）なのに、
// 以前の10列分のcolgroupが残っていたため右側に大きな余白が発生していた。
// ビルド時に6列へ正規化し、商品名は最大2行で収める。
const oldColgroup = `<colgroup>
          <col style={{ width: 95 }} />
          <col style={{ width: 280 }} />
          <col style={{ width: 95 }} />
          <col style={{ width: 220 }} />
          <col style={{ width: 65 }} />
          <col style={{ width: 115 }} />
          <col style={{ width: 135 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 115 }} />
          <col style={{ width: 150 }} />
        </colgroup>`;

const newColgroup = `<colgroup>
          <col style={{ width: 110 }} />
          <col style={{ width: 1 }} />
          <col style={{ width: 135 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 155 }} />
        </colgroup>`;

if (source.includes(oldColgroup)) {
  source = source.replace(oldColgroup, newColgroup);
  changed = true;
  console.log('Normalized Dashboard.tsx recent-sales table to 6 columns.');
}

// 商品列は幅を自動配分し、商品名を最大2行で表示する。
const oldProductCell = `<td style={{ padding: 10 }}>
                            {productMap[sale.product_id]
                              ?.name ?? "商品不明"}
                          </td>`;

const newProductCell = `<td
                            style={{
                              padding: 10,
                              minWidth: 0,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 14,
                                lineHeight: 1.45,
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 2,
                                overflow: "hidden",
                                wordBreak: "break-word",
                              }}
                            >
                              {productMap[sale.product_id]
                                ?.name ?? "商品不明"}
                            </div>
                          </td>`;

if (source.includes(oldProductCell)) {
  source = source.replace(oldProductCell, newProductCell);
  changed = true;
  console.log('Limited recent-sales product names to 2 lines.');
}

// テーブル本体も不要な固定最小幅を外して、カード幅を有効活用する。
const oldTableWidth = `width: "100%",
                      minWidth: 1340,
          tableLayout: "fixed",`;
const newTableWidth = `width: "100%",
                      minWidth: 0,
                      tableLayout: "fixed",`;

if (source.includes(oldTableWidth)) {
  source = source.replace(oldTableWidth, newTableWidth);
  changed = true;
  console.log('Removed oversized min-width from recent-sales table.');
}

if (changed) {
  fs.writeFileSync(file, source, 'utf8');
} else {
  console.log('Dashboard.tsx repairs are already applied.');
}
