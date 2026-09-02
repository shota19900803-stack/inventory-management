const fs = require('fs');

const path = 'components/Dashboard.tsx';
const s = fs.readFileSync(path, 'utf8');

// This script used to perform a one-time regex rewrite during every Vercel
// prebuild. Once the rewrite had already been applied, the old source pattern
// no longer existed and the script incorrectly failed the entire build.
//
// The actual fixes are already present in Dashboard.tsx. From now on this
// prebuild step only verifies that those fixes are present and exits cleanly.
const checks = [
  [
    'loadAll timeout/parallel loading fix',
    'const [productsResult, purchasesResult, salesResult] = await Promise.all([',
  ],
  [
    'saveProduct update/insert result fix',
    'const result = editingProductId',
  ],
  [
    'saveProduct incremental refresh fix',
    'const savedProduct = result.data as Product | null;',
  ],
];

for (const [label, marker] of checks) {
  if (!s.includes(marker)) {
    throw new Error(`${label} is missing from ${path}`);
  }
}

console.log('load-all fixes already present; skipping one-time rewrite.');
