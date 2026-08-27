const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'pages', 'index.tsx');
let text = fs.readFileSync(file, 'utf8');
if (!text.includes('ShippingAutoCalculator')) {
  text = text.replace('import { supabaseBrowser } from "../lib/supabase";\n','import { supabaseBrowser } from "../lib/supabase";\nimport ShippingAutoCalculator from "../components/ShippingAutoCalculator";\n');
  text = text.replace('      <SafeBoundary><Dashboard /></SafeBoundary>\n','      <SafeBoundary><Dashboard /></SafeBoundary>\n      <ShippingAutoCalculator />\n');
  fs.writeFileSync(file, text, 'utf8');
  console.log('Applied shipping auto calculator UI.');
} else console.log('Shipping auto calculator UI already applied.');
