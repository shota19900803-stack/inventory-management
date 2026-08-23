const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let text = fs.readFileSync(file, 'utf8');

// Ensure the Sale type exposes shipping_cost before shipping-aware code is compiled.
if (!text.includes('  shipping_cost?: number | null;')) {
  const marker = '  gross_profit: number;\n  notes?: string | null;';
  if (!text.includes(marker)) {
    throw new Error('Sale type marker not found.');
  }
  text = text.replace(
    marker,
    '  gross_profit: number;\n  shipping_cost?: number | null;\n  notes?: string | null;'
  );
}

// Ensure shipping_cost is added to the SALE form specifically.
// The previous patch used a generic quantity/notes marker, which matched
// initialPurchaseForm first and left initialSaleForm without shipping_cost.
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

if (!text.includes('  shipping_cost: "",\n  notes: "",\n};')) {
  if (!text.includes(saleMarker)) {
    throw new Error('initialSaleForm marker not found.');
  }
  text = text.replace(saleMarker, saleWithShipping);
}

fs.writeFileSync(file, text, 'utf8');
console.log('Ensured shipping_cost exists on Sale type and initialSaleForm.');
