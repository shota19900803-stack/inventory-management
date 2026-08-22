const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

function replaceFunction(sourceText, functionName, replacement) {
  const start = sourceText.indexOf(`  async function ${functionName}`);
  if (start === -1) {
    throw new Error(`${functionName} function not found.`);
  }

  const next = sourceText.indexOf("\n  async function ", start + 5);
  const end = next === -1 ? sourceText.length : next;
  return sourceText.slice(0, start) + replacement + sourceText.slice(end);
}

const newDeletePurchase = `  async function deletePurchase(purchase: Purchase) {
    const productName = productMap[purchase.product_id]?.name ?? "商品不明";
    const quantity = Number(purchase.quantity || 0);
    const currentStock = Number(productMap[purchase.product_id]?.stock_quantity || 0);
    const stockWillDecrease = Math.min(currentStock, quantity);
    const soldOrUsedQuantity = Math.max(quantity - currentStock, 0);

    const message = currentStock >= quantity
      ? \`この仕入を削除しますか？\\n\\n\${productName}\\n数量：\${quantity}個\\n仕入額：\${yen(purchase.total_cost)}\\n\\n削除すると現在庫から\${quantity}個減らします。\`
      : \`この仕入を削除しますか？\\n\\n\${productName}\\n仕入数量：\${quantity}個\\n現在庫：\${currentStock}個\\n\\nこの仕入のうち\${soldOrUsedQuantity}個は、すでに売却・使用されたと判断します。\\n仕入履歴だけを削除し、現在庫は\${currentStock}個のままにします。\`;

    if (!window.confirm(message)) return;

    setMessage("");
    try {
      if (stockWillDecrease > 0) {
        await adjustStock(purchase.product_id, -stockWillDecrease);
      }

      const { error } = await supabase
        .from("purchase_history")
        .delete()
        .eq("id", purchase.id);

      if (error) {
        if (stockWillDecrease > 0) {
          await adjustStock(purchase.product_id, stockWillDecrease);
        }
        throw new Error(error.message);
      }

      setMessage(
        currentStock >= quantity
          ? "仕入を削除しました。在庫も調整しました。"
          : "仕入履歴を削除しました。売却・使用済み" + soldOrUsedQuantity + "個分は在庫を変更していません。"
      );
      await loadAll();
    } catch (error: any) {
      setMessage("仕入削除エラー：" + (error?.message || String(error)));
    }
  }`;

const newDeleteSale = `  async function deleteSale(sale: Sale) {
    const productName = productMap[sale.product_id]?.name ?? "商品不明";
    const quantity = Number(sale.quantity || 0);

    if (!window.confirm(
      \`この売上を削除しますか？\\n\\n\${productName}\\n数量：\${quantity}個\\n売上：\${yen(sale.total_sales)}\\n\\n削除すると在庫が\${quantity}個戻ります。\`
    )) return;

    setMessage("");
    try {
      await adjustStock(sale.product_id, quantity);

      const { error } = await supabase
        .from("sales_history")
        .delete()
        .eq("id", sale.id);

      if (error) {
        await adjustStock(sale.product_id, -quantity);
        throw new Error(error.message);
      }

      setMessage("売上を削除しました。在庫を元に戻しました。");
      await loadAll();
    } catch (error: any) {
      setMessage("売上削除エラー：" + (error?.message || String(error)));
    }
  }`;

source = replaceFunction(source, "deletePurchase", newDeletePurchase);
source = replaceFunction(source, "deleteSale", newDeleteSale);

fs.writeFileSync(file, source);
console.log("Applied inventory-aware history delete behavior.");
