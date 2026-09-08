const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let source = fs.readFileSync(file, 'utf8');

const broken = '?? sale.sales_channel || "—")';
const fixed = '?? (sale.sales_channel || "—"))';

if (source.includes(broken)) {
  source = source.replace(broken, fixed);
  fs.writeFileSync(file, source, 'utf8');
  console.log('Repaired Dashboard.tsx sales-channel fallback syntax.');
} else {
  console.log('Dashboard.tsx sales-channel fallback syntax is already valid.');
}
