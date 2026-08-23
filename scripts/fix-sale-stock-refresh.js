const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

if (text.includes("// Applied sale stock refresh fix.")) {
  console.log("Sale stock refresh fix already applied.");
  process.exit(0);
}

const oldBlock = `  try {
    // 商品を取得して在庫数を確認
    const product = products.find(
      (item) => item.id === saleForm.product_id
    );

    if (!product) {
      setMessage("商品が見つかりません。");
      return;
    }

    const currentStock = Number(
      product.stock_quantity || 0
    );

    const newStock =
      currentStock - quantity;

    // 在庫不足チェック
    if (newStock < 0) {
      setMessage(
        \`在庫が不足しています。現在庫：\${currentStock}個\`
      );
      return;
    }
`;

const newBlock = `  try {
    // 売上登録直前にDBから最新在庫を取得する。
    // 画面に残っている古いproducts配列を在庫判定に使わない。
    const { data: latestProduct, error: latestProductError } =
      await supabase
        .from("products")
        .select("id, name, stock_quantity, selling_price, cost_price")
        .eq("id", saleForm.product_id)
        .single();

    if (latestProductError || !latestProduct) {
      setMessage(
        \`商品在庫の取得に失敗しました：\${
          latestProductError?.message || "商品が見つかりません。"
        }\`
      );
      return;
    }

    const currentStock = Number(
      latestProduct.stock_quantity || 0
    );

    // 画面側の商品一覧も最新在庫へ同期する。
    setProducts((currentProducts) =>
      currentProducts.map((item) =>
        item.id === latestProduct.id
          ? {
              ...item,
              stock_quantity: currentStock,
              selling_price:
                latestProduct.selling_price ?? item.selling_price,
              cost_price:
                latestProduct.cost_price ?? item.cost_price,
            }
          : item
      )
    );

    const newStock =
      currentStock - quantity;

    // 在庫不足チェック
    if (newStock < 0) {
      setMessage(
        \`在庫が不足しています。現在庫：\${currentStock}個、販売数量：\${quantity}個\`
      );
      return;
    }
`;

if (!text.includes(oldBlock)) {
  throw new Error("Sale stock validation block was not found.");
}

text = text.replace(oldBlock, newBlock);
text += `\n// Applied sale stock refresh fix.\n`;
fs.writeFileSync(file, text, "utf8");
console.log("Applied sale stock refresh fix.");
