const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let text = fs.readFileSync(file, 'utf8');

// Ensure the Sale type has shipping_cost.
if (!text.includes('  shipping_cost?: number | null;')) {
  const typeMarker = '  gross_profit: number;\n  notes?: string | null;';
  if (!text.includes(typeMarker)) {
    throw new Error('Sale type shipping_cost marker not found.');
  }
  text = text.replace(
    typeMarker,
    '  gross_profit: number;\n  shipping_cost?: number | null;\n  notes?: string | null;'
  );
}

// IMPORTANT: target initialSaleForm explicitly. A generic quantity/notes
// marker can match initialPurchaseForm first, which caused the build error
// "Property shipping_cost does not exist" on saleForm.shipping_cost.
const saleMarker = [
  'const initialSaleForm = {',
  '  product_id: "",',
  '  sale_date: today,',
  '  sales_channel: "楽天市場",',
  '  order_number: "",',
  '  unit_price: "",',
  '  unit_cost: "",',
  '  quantity: "1",',
  '  notes: "",',
  '};',
].join('\n');

const saleWithShipping = [
  'const initialSaleForm = {',
  '  product_id: "",',
  '  sale_date: today,',
  '  sales_channel: "楽天市場",',
  '  order_number: "",',
  '  unit_price: "",',
  '  unit_cost: "",',
  '  quantity: "1",',
  '  shipping_cost: "",',
  '  notes: "",',
  '};',
].join('\n');

if (!text.includes('const initialSaleForm = {') || !text.includes('  shipping_cost: "",\n  notes: "",\n};')) {
  if (!text.includes(saleMarker)) {
    throw new Error('initialSaleForm shipping_cost marker not found.');
  }
  text = text.replace(saleMarker, saleWithShipping);
}

fs.writeFileSync(file, text, 'utf8');
console.log('Fixed Sale shipping_cost initialization.');
