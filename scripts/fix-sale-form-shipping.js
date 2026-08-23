const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let text = fs.readFileSync(file, 'utf8');

// Ensure the sale form has a shipping_cost field so TypeScript accepts
// saleForm.shipping_cost used by the shipping/profit UI.
if (!text.includes('shipping_cost: "",')) {
  const marker = '  quantity: "1",\n  notes: "",';

  if (!text.includes(marker)) {
    throw new Error('initialSaleForm shipping_cost marker not found.');
  }

  text = text.replace(
    marker,
    '  quantity: "1",\n  shipping_cost: "",\n  notes: "",'
  );

  fs.writeFileSync(file, text, 'utf8');
  console.log('Added shipping_cost to initialSaleForm.');
} else {
  console.log('shipping_cost already exists in the sale form.');
}
