const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let text = fs.readFileSync(file, 'utf8');

// apply-shipping-profit.js now inserts the secure RPC directly.
// Keep this legacy script harmless so it cannot break the deployment.
if (text.includes('set_sale_shipping_cost')) {
  console.log('Shipping RPC already applied by apply-shipping-profit.js.');
  process.exit(0);
}

// Legacy fallback for an older Dashboard version.
const oldBlock = `    const { error: shippingUpdateError } = await supabase
      .from("sales_history")
      .update({
        shipping_cost: shippingCost,
        gross_profit: grossProfitWithShipping,
      })
      .eq("id", saleId);

    if (shippingUpdateError) {
      setMessage(
        \`売上は登録されましたが、送料の保存に失敗しました：\${shippingUpdateError.message}\`
      );
      return;
    }`;

const newBlock = `    const { data: shippingResult, error: shippingUpdateError } =
      await supabase.rpc("set_sale_shipping_cost", {
        p_sale_id: saleId,
        p_shipping_cost: shippingCost,
      });

    if (shippingUpdateError) {
      setMessage(
        \`売上は登録されましたが、送料の保存に失敗しました：\${shippingUpdateError.message}\`
      );
      return;
    }

    if (!shippingResult?.success) {
      setMessage(
        \`売上は登録されましたが、送料の保存に失敗しました：\${shippingResult?.message || "不明なエラー"}\`
      );
      return;
    }`;

if (text.includes(oldBlock)) {
  text = text.replace(oldBlock, newBlock);
  fs.writeFileSync(file, text, 'utf8');
  console.log('Applied legacy shipping RPC persistence.');
} else {
  console.log('Shipping RPC fallback not needed; continuing build.');
}
