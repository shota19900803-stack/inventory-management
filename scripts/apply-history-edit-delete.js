const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

const oldDeletePurchase = `  async function deletePurchase(purchase: Purchase) {
    if (!window.confirm(\`この仕入を削除しますか？\\n\\n\${productMap[purchase.product_id]?.name ?? "商品不明"}\\n数量：\${purchase.quantity}個\\n仕入額：\${yen(purchase.total_cost)}\`)) return;
    setMessage("");
    try {
      await adjustStock(purchase.product_id, -Number(purchase.quantity || 0));
      const { error } = await supabase.from("purchase_history").delete().eq("id", purchase.id);
      if (error) {
        await adjustStock(purchase.product_id, Number(purchase.quantity || 0));
        throw new Error(error.message);
      }
      setMessage("仕入を削除しました。在庫も調整しました。");
      await loadAll();
    } catch (error: any) {
      setMessage(\`仕入削除エラー：\${error?.message || String(error)}\`);
    }
  }`;

const newDeletePurchase = `  async function deletePurchase(purchase: Purchase) {
    const productName = productMap[purchase.product_id]?.name ?? "商品不明";
    const quantity = Number(purchase.quantity || 0);
    const currentStock = Number(productMap[purchase.product_id]?.stock_quantity || 0);

    if (currentStock < quantity) {
      setMessage(
        \`この仕入は削除できません。\\n\${productName}の現在庫は\${currentStock}個ですが、削除する仕入は\${quantity}個です。\\n\\nすでに売却・使用された商品が含まれているため、削除すると在庫計算が合わなくなります。\`
      );
      return;
    }

    if (!window.confirm(
      \`この仕入を削除しますか？\\n\\n\${productName}\\n数量：\${quantity}個\\n仕入額：\${yen(purchase.total_cost)}\\n\\n削除すると現在庫から\${quantity}個減らします。\`
    )) return;

    setMessage("");
    try {
      await adjustStock(purchase.product_id, -quantity);
      const { error } = await supabase.from("purchase_history").delete().eq("id", purchase.id);
      if (error) {
        await adjustStock(purchase.product_id, quantity);
        throw new Error(error.message);
      }
      setMessage("仕入を削除しました。在庫も調整しました。");
      await loadAll();
    } catch (error: any) {
      setMessage(\`仕入削除エラー：\${error?.message || String(error)}\`);
    }
  }`;

if (!source.includes(oldDeletePurchase)) {
  throw new Error("対象のdeletePurchase関数が見つかりません。");
}
source = source.replace(oldDeletePurchase, newDeletePurchase);

const oldDeleteSale = `  async function deleteSale(sale: Sale) {
    if (!window.confirm(\`この売上を削除しますか？\\n\\n\${productMap[sale.product_id]?.name ?? "商品不明"}\\n数量：\${sale.quantity}個\\n売上：\${yen(sale.total_sales)}\`)) return;
    setMessage("");
    try {
      await adjustStock(sale.product_id, Number(sale.quantity || 0));
      const { error } = await supabase.from("sales_history").delete().eq("id", sale.id);
      if (error) {
        await adjustStock(sale.product_id, -Number(sale.quantity || 0));
        throw new Error(error.message);
      }
      setMessage("売上を削除しました。在庫も元に戻しました。");
      await loadAll();
    } catch (error: any) {
      setMessage(\`売上削除エラー：\${error?.message || String(error)}\`);
    }
  }`;

const newDeleteSale = `  async function deleteSale(sale: Sale) {
    const productName = productMap[sale.product_id]?.name ?? "商品不明";
    const quantity = Number(sale.quantity || 0);
    const currentStock = Number(productMap[sale.product_id]?.stock_quantity || 0);

    if (!window.confirm(
      \`この売上を削除しますか？\\n\\n\${productName}\\n数量：\${quantity}個\\n売上：\${yen(sale.total_sales)}\\n\\n削除すると在庫が\${quantity}個戻ります。\`
    )) return;

    setMessage("");
    try {
      await adjustStock(sale.product_id, quantity);
      const { error } = await supabase.from("sales_history").delete().eq("id", sale.id);
      if (error) {
        await adjustStock(sale.product_id, -quantity);
        throw new Error(error.message);
      }
      setMessage("売上を削除しました。在庫も元に戻しました。");
      await loadAll();
    } catch (error: any) {
      setMessage(\`売上削除エラー：\${error?.message || String(error)}\`);
    }
  }`;

if (!source.includes(oldDeleteSale)) {
  throw new Error("対象のdeleteSale関数が見つかりません。");
}
source = source.replace(oldDeleteSale, newDeleteSale);

fs.writeFileSync(file, source);
console.log("Applied clearer history delete guards.");
