const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'Dashboard.tsx');
let text = fs.readFileSync(file, 'utf8');

const oldBlock = `    const { error: shippingUpdateError } = await supabase\n      .from("sales_history")\n      .update({\n        shipping_cost: shippingCost,\n        gross_profit: grossProfitWithShipping,\n      })\n      .eq("id", saleId);\n\n    if (shippingUpdateError) {\n      setMessage(\n        \`売上は登録されましたが、送料の保存に失敗しました：\${shippingUpdateError.message}\`\n      );\n      return;\n    }`;

const newBlock = `    const { data: shippingResult, error: shippingUpdateError } =\n      await supabase.rpc("set_sale_shipping_cost", {\n        p_sale_id: saleId,\n        p_shipping_cost: shippingCost,\n      });\n\n    if (shippingUpdateError) {\n      setMessage(\n        \`売上は登録されましたが、送料の保存に失敗しました：\${shippingUpdateError.message}\`\n      );\n      return;\n    }\n\n    if (!shippingResult?.success) {\n      setMessage(\n        \`売上は登録されましたが、送料の保存に失敗しました：\${shippingResult?.message || "不明なエラー"}\`\n      );\n      return;\n    }`;

if (text.includes(newBlock)) {
  console.log('Shipping RPC already applied.');
} else if (text.includes(oldBlock)) {
  text = text.replace(oldBlock, newBlock);
  fs.writeFileSync(file, text, 'utf8');
  console.log('Applied shipping RPC persistence.');
} else {
  throw new Error('Shipping persistence block was not found.');
}
