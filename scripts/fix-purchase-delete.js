const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let source = fs.readFileSync(file, 'utf8');

const start = source.indexOf('async function deletePurchase(purchase: Purchase) {');
const end = source.indexOf('\nasync function savePurchase(', start);

if (start === -1 || end === -1) {
  throw new Error('Could not locate deletePurchase function in Dashboard.tsx');
}

const replacement = `async function deletePurchase(purchase: Purchase) {
  if (!window.confirm(\`この仕入を削除しますか？\\n\\n数量：\${purchase.quantity}個\\n合計：\${yen(purchase.total_cost)}\`)) return;

  setSaving(true);
  setMessage(\"\");

  try {
    const { data, error } = await supabase.rpc(\"delete_purchase\", {
      p_purchase_id: purchase.id,
    });

    if (error) throw error;

    if (!data?.success) {
      throw new Error(data?.message || \"仕入削除に失敗しました。\");
    }

    setMessage(\"仕入を削除し、在庫と原価も調整しました。\");
    await loadAll();
  } catch (error: any) {
    setMessage(\`仕入削除エラー：\${error?.message || String(error)}\`);
  } finally {
    setSaving(false);
  }
}
`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source, 'utf8');
console.log('Replaced purchase deletion with atomic delete_purchase RPC.');
