"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { supabaseBrowser } from "../lib/supabase";

type Product = {
  id: string;
  jan_code?: string | null;
  sku?: string | null;
  name: string;
  model_number?: string | null;
  brand?: string | null;
  category?: string | null;
  stock_quantity?: number | null;
  cost_price?: number | null;
  selling_price?: number | null;
  image_url?: string | null;
  created_at?: string;
};

type Purchase = {
  id: string;
  product_id: string;
  purchase_date: string;
  supplier?: string | null;
  unit_cost: number;
  quantity: number;
  total_cost: number;
  notes?: string | null;
  created_at?: string;
};

type Sale = {
  id: string;
  product_id: string;
  sale_date: string;
  sales_channel?: string | null;
  order_number?: string | null;
  unit_price: number;
  unit_cost: number;
  quantity: number;
  total_sales: number;
  total_cost: number;
  gross_profit: number;
  notes?: string | null;
  is_cancelled: boolean;
  created_at?: string;
}

type Tab =
  | "dashboard"
  | "products"
  | "purchases"
  | "sales";

const today = new Date().toISOString().slice(0, 10);

const initialProductForm = {
  name: "",
  jan_code: "",
  sku: "",
  model_number: "",
  brand: "",
  category: "",
  stock_quantity: "0",
  cost_price: "",
  selling_price: "",
};

const initialPurchaseForm = {
  product_id: "",
  purchase_date: today,
  supplier: "",
  unit_cost: "",
  quantity: "1",
  notes: "",
};

const initialSaleForm = {
  product_id: "",
  sale_date: today,
  sales_channel: "楽天市場",
  order_number: "",
  unit_price: "",
  unit_cost: "",
  quantity: "1",
  notes: "",
};

function yen(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "¥0";
  return `¥${Number(value).toLocaleString()}`;
}

function monthOf(date: string) {
  return date.slice(0, 7);
}

export default function Dashboard() {
  const supabase = supabaseBrowser;

  const [tab, setTab] = useState<Tab>("dashboard");

  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const [historyProductId, setHistoryProductId] = useState("");

  const [editingProductId, setEditingProductId] =
    useState<string | null>(null);

  const [productForm, setProductForm] =
  useState(initialProductForm);

const videoRef = useRef<HTMLVideoElement | null>(null);

const [scanning, setScanning] = useState(false);

const startJanScanner = async () => {
  setScanning(true);

  try {
    if (!videoRef.current) {
      setScanning(false);
      return;
    }

    const reader = new BrowserMultiFormatReader();

console.log("JANスキャン開始");

const controls = await reader.decodeFromConstraints(
  {
    video: {
      facingMode: { ideal: "environment" },
    },
  },
  videoRef.current,
  (result, error) => {
    if (result) {
      const jan = result.getText();

      console.log("JANコード検出:", jan);
alert("JAN認識：" + jan);
      
      setProductForm((prev) => ({
        ...prev,
        jan_code: jan,
      }));

      controls.stop();
      setScanning(false);
    }

    if (error) {
      console.log("スキャン中:", error);
    }
  }
);

  } catch (error) {
    console.error(error);
    setScanning(false);

    alert(
      "カメラを起動できませんでした。\nカメラの使用を許可して、もう一度お試しください。"
    );
  }
};

  const [purchaseForm, setPurchaseForm] =
    useState(initialPurchaseForm);

  const [saleForm, setSaleForm] =
    useState(initialSaleForm);

  const [selectedMonth, setSelectedMonth] =
  useState(today.slice(0, 7));

 
const months = useMemo(() => {
  const set = new Set<string>();

  sales.forEach((sale) =>
    set.add(monthOf(sale.sale_date))
  );

  purchases.forEach((purchase) =>
    set.add(monthOf(purchase.purchase_date))
  );

  set.add(today.slice(0, 7));
return Array.from(set).sort().reverse();
}, [sales, purchases, today]);

async function loadAll() {
  setLoading(true);

  const [
    productsResult,
    purchasesResult,
    salesResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000),

    supabase
      .from("purchase_history")
      .select("*")
      .order("purchase_date", { ascending: false })
      .limit(2000),

    supabase
      .from("sales_history")
      .select("*")
      .eq("is_cancelled", false)
      .order("sale_date", { ascending: false })
      .limit(2000),
  ]);

  if (productsResult.error) {
    setMessage(
      `商品読み込みエラー：${productsResult.error.message}`
    );
  } else {
    setProducts(
      (productsResult.data ?? []) as Product[]
    );
  }

  if (purchasesResult.error) {
    setMessage(
      `仕入履歴読み込みエラー：${purchasesResult.error.message}`
    );
  } else {
    setPurchases(
      (purchasesResult.data ?? []) as Purchase[]
    );
  }

  if (salesResult.error) {
    setMessage(
      `売上履歴読み込みエラー：${salesResult.error.message}`
    );
  } else {
    setSales(
      (salesResult.data ?? []) as Sale[]
);
  

  setLoading(false);
}
const startJanScanner = () => {
  setScannerMessage(
    "カメラを起動しています…"
  );
  setScanning(true);
};

const closeJanScanner = () => {
  try {
    controlsRef.current?.stop();
  } catch {}

  controlsRef.current = null;
  scannerRef.current = null;

  setScanning(false);
};

useEffect(() => {
  if (!scanning) {
    return;
  }

  let cancelled = false;

  const startCamera = async () => {
    try {
      setScannerMessage(
        "カメラを起動しています…"
      );

      if (!videoRef.current) {
        setScannerMessage(
          "カメラ画面を準備しています…"
        );
        return;
      }

      const reader =
        new BrowserMultiFormatReader();

      scannerRef.current = reader;

      setScannerMessage(
        "JANコードをカメラに映してください"
      );

      const controls =
        await reader.decodeFromConstraints(
          {
            video: {
              facingMode: {
                ideal: "environment",
              },
            },
          },
          videoRef.current,
          (result, error) => {
            if (cancelled) {
              return;
            }

            if (result) {
              const jan =
                result
                  .getText()
                  .replace(/\D/g, "");

              console.log(
                "JANコード検出:",
                jan
              );

              if (jan.length === 13) {
                setProductForm((prev) => ({
                  ...prev,
                  jan_code: jan,
                }));

                setScannerMessage(
                  `読み取り成功：${jan}`
                );

                controls.stop();
                controlsRef.current = null;
                scannerRef.current = null;

                setTimeout(() => {
                  if (!cancelled) {
                    setScanning(false);
                  }
                }, 500);
              }
            }

            if (error) {
              console.log(
                "スキャン中:",
                error
              );
            }
          }
        );

      if (cancelled) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
    } catch (error) {
      console.error(
        "JANスキャンエラー:",
        error
      );

      if (!cancelled) {
        setScannerMessage(
          "カメラを起動できませんでした。"
        );

        alert(
          "カメラを起動できませんでした。\n\n" +
          "Safariのカメラ使用許可を確認して、もう一度お試しください。"
        );

        setScanning(false);
      }
    }
  };

  startCamera();

  return () => {
    cancelled = true;

    try {
      controlsRef.current?.stop();
    } catch {}

    controlsRef.current = null;
    scannerRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  };
}, [scanning]);
    return sales.filter(
      (sale) => monthOf(sale.sale_date) === selectedMonth
    );
  }, [sales, selectedMonth]);

  const monthSales = useMemo(() => {
  return sales.filter(
    (sale) => monthOf(sale.sale_date) === selectedMonth
  );
}, [sales, selectedMonth]);
  
  const monthPurchases = useMemo(() => {
    return purchases.filter(
      (purchase) =>
        monthOf(purchase.purchase_date) === selectedMonth
    );
  }, [purchases, selectedMonth]);

  const monthlySalesTotal = monthSales.reduce(
    (sum, sale) => sum + Number(sale.total_sales || 0),
    0
  );

  const monthlyCostTotal = monthSales.reduce(
    (sum, sale) => sum + Number(sale.total_cost || 0),
    0
  );

  const monthlyGrossProfit = monthSales.reduce(
    (sum, sale) => sum + Number(sale.gross_profit || 0),
    0
  );

  const monthlyPurchaseTotal = monthPurchases.reduce(
    (sum, purchase) => sum + Number(purchase.total_cost || 0),
    0
  );
const previousMonth = (() => {
  const date = new Date(`${selectedMonth}-01`);
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 7);
})();

const previousMonthSales = sales.filter(
  (sale) => monthOf(sale.sale_date) === previousMonth
);

const previousMonthlySalesTotal = previousMonthSales.reduce(
  (sum, sale) => sum + Number(sale.total_sales || 0),
  0
);
  const previousMonthlyCostTotal = previousMonthSales.reduce(
  (sum, sale) => sum + Number(sale.total_cost || 0),
  0
);
const previousMonthPurchases = purchases.filter(
  (purchase) =>
    monthOf(purchase.purchase_date) === previousMonth
);

const previousMonthlyPurchaseTotal = previousMonthPurchases.reduce(
  (sum, purchase) => sum + Number(purchase.total_cost || 0),
  0
);

const purchaseMonthDiff =
  monthlyPurchaseTotal - previousMonthlyPurchaseTotal;

const purchaseMonthDiffRate =
  previousMonthlyPurchaseTotal > 0
    ? (purchaseMonthDiff / previousMonthlyPurchaseTotal) * 100
    : null;
  const costMonthDiff =
  monthlyCostTotal - previousMonthlyCostTotal;

const costMonthDiffRate =
  previousMonthlyCostTotal > 0
    ? (costMonthDiff / previousMonthlyCostTotal) * 100
    : null;
const salesMonthDiff =
  monthlySalesTotal - previousMonthlySalesTotal;

const salesMonthDiffRate =
  previousMonthlySalesTotal > 0
    ? (salesMonthDiff / previousMonthlySalesTotal) * 100
    : null;
  const monthlyTrendData = Array.from({ length: 6 }, (_, index) => {
  const date = new Date(`${selectedMonth}-01`);
  date.setMonth(date.getMonth() - (5 - index));

  const month = date.toISOString().slice(0, 7);

  const monthSalesData = sales.filter(
    (sale) => monthOf(sale.sale_date) === month
  );

  const monthPurchasesData = purchases.filter(
    (purchase) => monthOf(purchase.purchase_date) === month
  );

  const salesTotal = monthSalesData.reduce(
    (sum, sale) => sum + Number(sale.total_sales || 0),
    0
  );

  const purchaseTotal = monthPurchasesData.reduce(
    (sum, purchase) => sum + Number(purchase.total_cost || 0),
    0
  );

  const costTotal = monthSalesData.reduce(
    (sum, sale) => sum + Number(sale.total_cost || 0),
    0
  );

  const grossProfit = monthSalesData.reduce(
    (sum, sale) => sum + Number(sale.gross_profit || 0),
    0
  );

  return {
    month,
    sales: salesTotal,
    purchases: purchaseTotal,
    cost: costTotal,
    grossProfit,
  };
});
  const grossMargin =
    monthlySalesTotal > 0
      ? (monthlyGrossProfit / monthlySalesTotal) * 100
      : 0;

  const totalStock = products.reduce(
    (sum, product) =>
      sum + Number(product.stock_quantity || 0),
    0
  );

  const lowStockProducts = products.filter(
    (product) => Number(product.stock_quantity || 0) <= 0
  );

  function resetProductForm() {
    setEditingProductId(null);
    setProductForm(initialProductForm);
  }

  function editProduct(product: Product) {
    setEditingProductId(product.id);

    setProductForm({
      name: product.name ?? "",
      jan_code: product.jan_code ?? "",
      sku: product.sku ?? "",
      model_number: product.model_number ?? "",
      brand: product.brand ?? "",
      category: product.category ?? "",
      stock_quantity: String(
        product.stock_quantity ?? 0
      ),
      cost_price:
        product.cost_price == null
          ? ""
          : String(product.cost_price),
      selling_price:
        product.selling_price == null
          ? ""
          : String(product.selling_price),
    });

    setTab("products");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function saveProduct(
    event: React.FormEvent
  ) {
    event.preventDefault();

    if (!productForm.name.trim()) {
      setMessage("商品名を入力してください。");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      name: productForm.name.trim(),
      jan_code:
        productForm.jan_code.trim() || null,
      sku: productForm.sku.trim() || null,
      model_number:
        productForm.model_number.trim() || null,
      brand: productForm.brand.trim() || null,
      category:
        productForm.category.trim() || null,
      stock_quantity:
        Number(productForm.stock_quantity || 0),
      cost_price:
        productForm.cost_price === ""
          ? null
          : Number(productForm.cost_price),
      selling_price:
        productForm.selling_price === ""
          ? null
          : Number(productForm.selling_price),
    };

    const result = editingProductId
      ? await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProductId)
      : await supabase
          .from("products")
          .insert(payload);

    if (result.error) {
      setMessage(
        `保存エラー: ${result.error.message}`
      );
    } else {
      setMessage(
        editingProductId
          ? "商品を更新しました。"
          : "商品を登録しました。"
      );

      resetProductForm();
      await loadAll();
    }

    setSaving(false);
  }

  async function deleteProduct(id: string) {
    if (
      !window.confirm(
        "この商品を削除しますか？\n関連する履歴がある場合は削除できないことがあります。"
      )
    ) {
      return;
    }

    setMessage("");

    const result = await supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (result.error) {
      setMessage(
        `削除エラー: ${result.error.message}`
      );
    } else {
      setMessage("商品を削除しました。");
      await loadAll();
    }
  }

  function openPurchase(productId = "") {
    setPurchaseForm({
      ...initialPurchaseForm,
      product_id: productId,
    });

    setTab("purchases");
  }

  function openSale(productId = "") {
    const product = products.find(
      (item) => item.id === productId
    );

    setSaleForm({
      ...initialSaleForm,
      product_id: productId,
      unit_price:
        product?.selling_price != null
          ? String(product.selling_price)
          : "",
      unit_cost:
        product?.cost_price != null
          ? String(product.cost_price)
          : "",
    });

    setTab("sales");
  }

  async function savePurchase(
  event: React.FormEvent
) {
  event.preventDefault();

  if (!purchaseForm.product_id) {
    setMessage("商品を選択してください。");
    return;
  }

  const unitCost = Number(
    purchaseForm.unit_cost || 0
  );

  const quantity = Number(
    purchaseForm.quantity || 0
  );

  if (unitCost < 0 || quantity <= 0) {
    setMessage(
      "仕入単価と数量を正しく入力してください。"
    );
    return;
  }

  setSaving(true);
  setMessage("");

  try {
    const { data, error } = await supabase.rpc(
      "register_purchase",
      {
        p_product_id: purchaseForm.product_id,
        p_purchase_date: purchaseForm.purchase_date,
        p_supplier:
          purchaseForm.supplier.trim() || null,
        p_unit_cost: unitCost,
        p_quantity: quantity,
        p_notes:
          purchaseForm.notes.trim() || null,
      }
    );

    if (error) {
      setMessage(
        `仕入登録エラー：${error.message}`
      );
      return;
    }

    if (!data?.success) {
      setMessage("仕入登録に失敗しました。");
      return;
    }

    setMessage("仕入を登録しました。");

    setPurchaseForm(initialPurchaseForm);

    await loadAll();

  } catch (error: any) {
    setMessage(
      `仕入登録エラー：${
        error?.message ||
        "予期しないエラーが発生しました。"
      }`
    );
  } finally {
    setSaving(false);
  }
}
async function saveSale(
  event: React.FormEvent
) {
  event.preventDefault();

  if (!saleForm.product_id) {
    setMessage("商品を選択してください。");
    return;
  }

  const unitPrice = Number(
    saleForm.unit_price || 0
  );

  const unitCost = Number(
    saleForm.unit_cost || 0
  );

  const quantity = Number(
    saleForm.quantity || 0
  );

  if (
    unitPrice < 0 ||
    unitCost < 0 ||
    quantity <= 0
  ) {
    setMessage(
      "販売価格・原価・数量を正しく入力してください。"
    );
    return;
  }

  setSaving(true);
  setMessage("");

  try {
    // 商品を取得して、売上登録前の在庫数を確認
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

    const newStock = currentStock - quantity;

    // 在庫不足チェック
    if (newStock < 0) {
      setMessage(
        `在庫が不足しています。現在庫：${currentStock}個`
      );
      return;
    }

    // 売上登録
    const { data, error } = await supabase.rpc(
      "register_sale",
      {
        p_product_id: saleForm.product_id,
        p_sale_date: saleForm.sale_date,
        p_sales_channel:
          saleForm.sales_channel.trim() || null,
        p_order_number:
          saleForm.order_number.trim() || null,
        p_unit_price: unitPrice,
        p_unit_cost: unitCost,
        p_quantity: quantity,
        p_notes:
          saleForm.notes.trim() || null,
      }
    );

    if (error) {
      setMessage(
        `売上登録エラー：${error.message}`
      );
      return;
    }

    if (!data?.success) {
      setMessage(
        "売上登録に失敗しました。"
      );
      return;
    }

    // ==========================================
    // 在庫変動履歴に「売上」を記録
    // ==========================================
    const transactionResult = await supabase
      .from("inventory_transactions")
      .insert({
        product_id: saleForm.product_id,
        transaction_type: "sale",
        quantity: quantity,
        stock_before: currentStock,
        stock_after: newStock,
        reason: "売上",
        reference_number:
          saleForm.order_number.trim() || null,
      });

    if (transactionResult.error) {
      setMessage(
        `在庫履歴登録エラー：${transactionResult.error.message}`
      );
      return;
    }

    setMessage(
      "売上を登録しました。"
    );

    setSaleForm(initialSaleForm);

    await loadAll();

  } catch (error: any) {
    setMessage(
      `売上登録エラー：${
        error?.message ||
        "予期しないエラーが発生しました。"
      }`
    );
  } finally {
    setSaving(false);
  }
}
  async function cancelSale(sale: any) {
    const proceed = window.confirm(
      `この売上を取消しますか？\n\n売上金額：¥${yen(sale.total_sales)}\n数量：${sale.quantity}個`
    );

    if (!proceed) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      // すでに取消済みなら処理しない
      if (sale.is_cancelled) {
        setMessage("この売上はすでに取消済みです。");
        setSaving(false);
        return;
      }

      // 商品を取得
      const product = products.find(
        (item) => item.id === sale.product_id
      );

      if (!product) {
        setMessage("商品が見つかりません。");
        setSaving(false);
        return;
      }

      const currentStock = Number(product.stock_quantity || 0);
      const quantity = Number(sale.quantity || 0);
      const newStock = currentStock + quantity;

      // 在庫を元に戻す
      const stockResult = await supabase
        .from("products")
        .update({
          stock_quantity: newStock,
        })
        .eq("id", sale.product_id);

      if (stockResult.error) {
        setMessage(
          `在庫復元エラー：${stockResult.error.message}`
        );
        setSaving(false);
        return;
      }

      // 売上を取消済みにする
      const salesResult = await supabase
  .from("sales_history")
  .update({
    is_cancelled: true,
  })
  .eq("id", sale.id)
  .select("id, is_cancelled")
  .single();

      if (salesResult.error) {
        setMessage(
          `売上取消エラー：${salesResult.error.message}`
        );
        setSaving(false);
        return;
      }

      // 在庫履歴に取消を記録
      const transactionResult = await supabase
        .from("inventory_transactions")
        .insert({
          product_id: sale.product_id,
          transaction_type: "sale",
          quantity: quantity,
          stock_before: currentStock,
          stock_after: newStock,
          reason: "売上取消",
          reference_number: sale.order_number || null,
        });

      if (transactionResult.error) {
        setMessage(
          `在庫履歴登録エラー：${transactionResult.error.message}`
        );
        setSaving(false);
        return;
      }

      setMessage("売上を取消しました。在庫も元に戻しました。");

      await loadAll();

      setSaving(false);
    } catch (error) {
      setMessage(
        `売上取消エラー：${
          error instanceof Error ? error.message : String(error)
        }`
      );
      setSaving(false);
    }
  }
  

  
  const navButtonStyle = (
    active: boolean
  ): React.CSSProperties => ({
    border: "none",
    background: active ? "#111827" : "#f3f4f6",
    color: active ? "#fff" : "#374151",
    padding: "12px 18px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
  });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    border: "1px solid #d1d5db",
    borderRadius: 10,
    fontSize: 15,
    background: "#fff",
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 22,
    marginBottom: 20,
  };

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f6f7f9",
          padding: 40,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <h1>在庫管理</h1>
        <p>データを読み込んでいます…</p>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f6f7f9",
        padding: "28px 20px 60px",
        color: "#111827",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                letterSpacing: 3,
                fontWeight: 700,
                color: "#6b7280",
              }}
            >
              INVENTORY MANAGEMENT
            </div>

            <h1
              style={{
                margin: "4px 0 0",
                fontSize: 36,
              }}
            >
              在庫管理
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                background: "#fff",
                padding: "12px 18px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
              }}
            >
              商品数 <strong>{products.length}</strong>
            </div>

            <div
              style={{
                background: "#fff",
                padding: "12px 18px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
              }}
            >
              在庫数 <strong>{totalStock}</strong>
            </div>
          </div>
        </header>

        <nav
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <button
            style={navButtonStyle(
              tab === "dashboard"
            )}
            onClick={() => setTab("dashboard")}
          >
            📊 月次集計
          </button>

          <button
            style={navButtonStyle(
              tab === "products"
            )}
            onClick={() => setTab("products")}
          >
            📦 商品管理
          </button>

          <button
            style={navButtonStyle(
              tab === "purchases"
            )}
            onClick={() => setTab("purchases")}
          >
            🛒 仕入登録
          </button>

          <button
            style={navButtonStyle(
              tab === "sales"
            )}
            onClick={() => setTab("sales")}
          >
            💰 売上登録
          </button>
        </nav>

        {message && (
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #bbf7d0",
              color: "#166534",
              padding: "12px 16px",
              borderRadius: 10,
              marginBottom: 20,
            }}
          >
            {message}
          </div>
        )}

        {tab === "dashboard" && (
          <>
            <section style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 15,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>
                    月次集計
                  </h2>
                  <p
                    style={{
                      color: "#6b7280",
                      marginBottom: 0,
                    }}
                  >
                    売上・仕入・粗利を月ごとに確認できます。
                  </p>
                </div>

                <select
                  value={selectedMonth}
                  onChange={(e) =>
                    setSelectedMonth(e.target.value)
                  }
                  style={{
                    ...inputStyle,
                    width: 180,
                  }}
                >
                  {months.map((month) => (
                    <option
                      value={month}
                      key={month}
                    >
                      {month}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 15,
              }}
            >
              <div style={cardStyle}>
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: 14,
                  }}
                >
                  月間売上
                </div>
                <strong
                  style={{
                    fontSize: 28,
                    display: "block",
                    marginTop: 8,
                  }}
                >
                  {yen(monthlySalesTotal)}
                </strong>
                <div
  style={{
    marginTop: 6,
    fontSize: 14,
    color: salesMonthDiff >= 0 ? "#15803d" : "#dc2626",
    fontWeight: 600,
  }}
>
  前月比 {salesMonthDiff >= 0 ? "+" : ""}
  {yen(salesMonthDiff)}
  {salesMonthDiffRate !== null
    ? ` (${salesMonthDiffRate >= 0 ? "+" : ""}${salesMonthDiffRate.toFixed(1)}%)`
    : ""}
</div>
              </div>

              <div style={cardStyle}>
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: 14,
                  }}
                >
                  月間仕入
                </div>
                <strong
                  style={{
                    fontSize: 28,
                    display: "block",
                    marginTop: 8,
                  }}
                >
                  {yen(monthlyPurchaseTotal)}
                </strong>
             <div
  style={{
    marginTop: 6,
    fontSize: 14,
    color: purchaseMonthDiff >= 0 ? "#dc2626" : "#15803d",
    fontWeight: 600,
  }}
>
  前月比 {purchaseMonthDiff >= 0 ? "+" : ""}
  {yen(purchaseMonthDiff)}
  {purchaseMonthDiffRate !== null
    ? ` (${purchaseMonthDiffRate >= 0 ? "+" : ""}${purchaseMonthDiffRate.toFixed(1)}%)`
    : ""}
</div>
              </div>

              <div style={cardStyle}>
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: 14,
                  }}
                >
                  売上原価
                </div>
                <strong
                  style={{
                    fontSize: 28,
                    display: "block",
                    marginTop: 8,
                  }}
                >
                  {yen(monthlyCostTotal)}
                </strong>
                <div
  style={{
    marginTop: 6,
    fontSize: 14,
    color: costMonthDiff >= 0 ? "#dc2626" : "#15803d",
    fontWeight: 600,
  }}
>
  前月比 {costMonthDiff >= 0 ? "+" : ""}
  {yen(costMonthDiff)}
  {costMonthDiffRate !== null
    ? ` (${costMonthDiffRate >= 0 ? "+" : ""}${costMonthDiffRate.toFixed(1)}%)`
    : ""}
</div>
              </div>

              <div style={cardStyle}>
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: 14,
                  }}
                >
                  粗利
                </div>
                <strong
                  style={{
                    fontSize: 28,
                    display: "block",
                    marginTop: 8,
                    color:
                      monthlyGrossProfit >= 0
                        ? "#15803d"
                        : "#dc2626",
                  }}
                >
                  {yen(monthlyGrossProfit)}
                </strong>

                <div
                  style={{
                    marginTop: 5,
                    color: "#6b7280",
                  }}
                >
                  粗利率 {grossMargin.toFixed(1)}%
                </div>
              </div>
              <div
  style={{
    ...cardStyle,
    cursor: "pointer",
  }}
  onClick={() => setTab("products")}
>
  <div
    style={{
      color: lowStockProducts.length > 0 ? "#dc2626" : "#15803d",
      fontSize: 14,
      fontWeight: 600,
    }}
  >
    在庫管理
  </div>

  <strong
    style={{
      fontSize: 28,
      display: "block",
      marginTop: 8,
      color: lowStockProducts.length > 0 ? "#dc2626" : "#15803d",
    }}
  >
    {lowStockProducts.length}件
  </strong>

<div
  style={{
    marginTop: 6,
    fontSize: 14,
    fontWeight: 600,
    color: lowStockProducts.length > 0 ? "#dc2626" : "#15803d",
  }}
>
  {lowStockProducts.length > 0
    ? "⚠️ 在庫不足商品"
    : "✓ 在庫は問題ありません"}
</div>

{lowStockProducts.length > 0 && (
  <div style={{ marginTop: 8 }}>
    {lowStockProducts.map((product) => (
      <div
        key={product.id}
        style={{
          padding: "10px 0",
          borderTop: "1px solid #e5e7eb",
          cursor: "pointer",
        }}
        onClick={(e) => {
          e.stopPropagation();
          openPurchase(product.id);
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#111827",
          }}
        >
          {product.name || "商品名未設定"}
        </div>

        <div
          style={{
            marginTop: 3,
            fontSize: 12,
            color: "#dc2626",
          }}
        >
          在庫 {Number(product.stock_quantity || 0)}個
          {"　→ 仕入登録"}
        </div>
      </div>
    ))}
  </div>
)}
                {lowStockProducts.length > 0 && (
  <div
    style={{
      marginTop: 14,
      paddingTop: 12,
      borderTop: "1px solid #e5e7eb",
    }}
  >
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#dc2626",
        marginBottom: 8,
      }}
    >
      ⚠️ 在庫不足商品
    </div>

    {lowStockProducts.slice(0, 5).map((product) => {
      const stock = product.stock_quantity ?? 0;

      return (
        <div
          key={product.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "7px 0",
            borderBottom: "1px solid #f1f5f9",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {product.name}
          </div>

          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: stock === 0 ? "#dc2626" : "#d97706",
              whiteSpace: "nowrap",
            }}
          >
            {stock === 0 ? "欠品" : `残り ${stock}個`}
          </div>
        </div>
      );
    })}

    {lowStockProducts.length > 5 && (
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: "#6b7280",
          textAlign: "right",
        }}
      >
        他 {lowStockProducts.length - 5}件
      </div>
    )}
  </div>
)}
</div>
            </section>

            <section style={cardStyle}>
              <h2>今月の売上履歴</h2>

              {monthSales.length === 0 ? (
                <p>この月の売上はありません。</p>
              ) : (
                <div
                  style={{
                    overflowX: "auto",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: 10 }}>
                          日付
                        </th>
                        <th style={{ textAlign: "left", padding: 10 }}>
                          商品
                        </th>
                        <th style={{ textAlign: "left", padding: 10 }}>
                          販売先
                        </th>
                        <th style={{ textAlign: "right", padding: 10 }}>
  売上
</th>

<th style={{ textAlign: "right", padding: 10 }}>
  粗利
</th>

<th style={{ textAlign: "center", padding: 10 }}>
  操作
</th>
                      </tr>
                    </thead>

                    <tbody>
                      {monthSales.map((sale) => (
                        <tr key={sale.id}>
                          <td style={{ padding: 10 }}>
                            {sale.sale_date}
                          </td>

                          <td style={{ padding: 10 }}>
                            {productMap[sale.product_id]
                              ?.name ?? "商品不明"}
                          </td>

                          <td style={{ padding: 10 }}>
                            {sale.sales_channel || "—"}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign: "right",
                            }}
                          >
                            {yen(sale.total_sales)}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign: "right",
                              fontWeight: 700,
                            }}
                          >
                            {yen(sale.gross_profit)}
                          </td>
                          <td
  style={{
    padding: 10,
    textAlign: "center",
  }}
>
  {sale.is_cancelled ? (
    <span
      style={{
        color: "#b42318",
        fontWeight: 700,
      }}
    >
      取消済み
    </span>
  ) : (
    <button
      type="button"
      onClick={() => cancelSale(sale)}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        border: "1px solid #f0b4b4",
        background: "#fff5f5",
        color: "#b42318",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      取消
    </button>
  )}
</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "products" && (
          <>
            <section style={cardStyle}>
              <h2>
                {editingProductId
                  ? "商品を編集"
                  : "商品を登録"}
              </h2>

              <form onSubmit={saveProduct}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 15,
                  }}
                >
                  <label>
                    商品名*
                    <input
                      style={inputStyle}
                      value={productForm.name}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          name: e.target.value,
                        })
                      }
                      placeholder="例：ポケモンカード BOX"
                    />
                  </label>

                 <label>
  JANコード
  <div
    style={{
      display: "flex",
      gap: 8,
      alignItems: "center",
    }}
  >
    <input
      style={{
        ...inputStyle,
        flex: 1,
      }}
      inputMode="numeric"
      value={productForm.jan_code}
      onChange={(e) =>
        setProductForm({
          ...productForm,
          jan_code: e.target.value,
        })
      }
      placeholder="JANコードを入力"
    />

    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 16px",
        background: "#15803d",
        color: "#fff",
        borderRadius: 10,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
 <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
  <button
    type="button"
    onClick={startJanScanner}
    style={{
      padding: "12px 18px",
      background: "#15803d",
      color: "#fff",
      border: "none",
      borderRadius: 10,
      fontWeight: 700,
      cursor: "pointer",
      whiteSpace: "nowrap",
    }}
  >
    📷 JAN読取
  </button>
</div>

{scanning && (
  <div
    style={{
      marginTop: 16,
      padding: 12,
      background: "#000",
      borderRadius: 12,
    }}
  >
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{
        width: "100%",
        display: "block",
        borderRadius: 8,
      }}
    />

    <div
      style={{
        color: "#fff",
        textAlign: "center",
        marginTop: 10,
        fontWeight: 700,
      }}
    >
      📷 JANコードをカメラに映してください
    </div>

    <button
      type="button"
      onClick={() => setScanning(false)}
      style={{
        marginTop: 10,
        width: "100%",
        padding: "10px",
        background: "#fff",
        color: "#111827",
        border: "none",
        borderRadius: 8,
        fontWeight: 700,
      }}
    >
      閉じる
    </button>
  </div>
)}
    </label>
  </div>
</label>
                  <label>
                    SKU
                    <input
                      style={inputStyle}
                      value={productForm.sku}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          sku: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    型番
                    <input
                      style={inputStyle}
                      value={productForm.model_number}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          model_number:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    ブランド
                    <input
                      style={inputStyle}
                      value={productForm.brand}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          brand: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    カテゴリ
                    <input
                      style={inputStyle}
                      value={productForm.category}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          category:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    在庫数
                    <input
                      style={inputStyle}
                      type="number"
                      value={
                        productForm.stock_quantity
                      }
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          stock_quantity:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    現在の参考仕入価格
                    <input
                      style={inputStyle}
                      type="number"
                      value={
                        productForm.cost_price
                      }
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          cost_price:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    現在の参考販売価格
                    <input
                      style={inputStyle}
                      type="number"
                      value={
                        productForm.selling_price
                      }
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          selling_price:
                            e.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 20,
                  }}
                >
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      border: "none",
                      background: "#111827",
                      color: "#fff",
                      padding: "12px 24px",
                      borderRadius: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {saving
                      ? "保存中…"
                      : editingProductId
                      ? "更新する"
                      : "登録する"}
                  </button>

                  {editingProductId && (
                    <button
                      type="button"
                      onClick={resetProductForm}
                      style={{
                        padding: "12px 20px",
                        borderRadius: 10,
                        border:
                          "1px solid #d1d5db",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      キャンセル
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  gap: 15,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <h2>商品一覧</h2>

                <input
                  style={{
                    ...inputStyle,
                    maxWidth: 400,
                  }}
                  value={productSearch}
                  onChange={(e) =>
                    setProductSearch(
                      e.target.value
                    )
                  }
                  placeholder="商品名・JAN・SKU・型番で検索"
                />
              </div>

              <div
                style={{
                  overflowX: "auto",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 10 }}>
                        商品
                      </th>
                      <th style={{ textAlign: "left", padding: 10 }}>
                        JAN
                      </th>
                      <th style={{ textAlign: "left", padding: 10 }}>
                        SKU
                      </th>
                      <th style={{ textAlign: "right", padding: 10 }}>
                        在庫
                      </th>
                      <th style={{ textAlign: "right", padding: 10 }}>
                        参考仕入
                      </th>
                      <th style={{ textAlign: "right", padding: 10 }}>
                        参考販売
                      </th>
                      <th style={{ padding: 10 }} />
                    </tr>
                  </thead>

                  <tbody>
                    {filteredProducts.map(
                      (product) => (
                        <tr key={product.id}>
                          <td style={{ padding: 10 }}>
                            <strong>
                              {product.name}
                            </strong>

                            <div
                              style={{
                                fontSize: 12,
                                color: "#6b7280",
                              }}
                            >
                              {product.model_number ||
                                ""}
                            </div>
                          </td>

                          <td style={{ padding: 10 }}>
                            {product.jan_code || "—"}
                          </td>

                          <td style={{ padding: 10 }}>
                            {product.sku || "—"}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign: "right",
                              fontWeight: 700,
                            }}
                          >
                            {product.stock_quantity ??
                              0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign: "right",
                            }}
                          >
                            {yen(
                              product.cost_price
                            )}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign: "right",
                            }}
                          >
                            {yen(
                              product.selling_price
                            )}
                          </td>

                          <td style={{ padding: 10 }}>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                onClick={() =>
                                  editProduct(
                                    product
                                  )
                                }
                              >
                                編集
                              </button>

                              <button
                                onClick={() =>
                                  openPurchase(
                                    product.id
                                  )
                                }
                              >
                                仕入
                              </button>

                              <button
                                onClick={() =>
                                  openSale(
                                    product.id
                                  )
                                }
                              >
                                売上
                              </button>

                              <button
  type="button"
  onClick={() =>
    setHistoryProductId(
      product.id
    )
  }
>
                                履歴
                              </button>

                              <button
                                onClick={() =>
                                  deleteProduct(
                                    product.id
                                  )
                                }
                                style={{
                                  color: "#dc2626",
                                }}
                              >
                                削除
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {filteredProducts.length === 0 && (
                <p>商品がありません。</p>
              )}
            </section>

            {historyProductId && (
              <section style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems: "center",
                  }}
                >
                  
                    <h2>
  {products.find(
    (product) => product.id === historyProductId
  )?.name ?? "商品"} の履歴

                  </h2>

                  <button
                    onClick={() =>
                      setHistoryProductId("")
                    }
                  >
                    閉じる
                  </button>
                </div>

                <h3>仕入履歴</h3>

                {purchases.length ===
0 ? (
  <p>仕入履歴はありません。</p>
) : (
                  <div
                    style={{
                      overflowX: "auto",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse:
                          "collapse",
                      }}
                    >
                      <thead>
                        <tr>
                          <th style={{ padding: 8 }}>
                            日付
                          </th>
                          <th style={{ padding: 8 }}>
                            仕入先
                          </th>
                          <th style={{ padding: 8 }}>
                            単価
                          </th>
                          <th style={{ padding: 8 }}>
                            数量
                          </th>
                          <th style={{ padding: 8 }}>
                            合計
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                       {purchases.map(
  (purchase) => (
                            <tr
                              key={
                                purchase.id
                              }
                            >
                              <td style={{ padding: 8 }}>
                                {
                                  purchase.purchase_date
                                }
                              </td>

                              <td style={{ padding: 8 }}>
                                {purchase.supplier ||
                                  "—"}
                              </td>

                              <td style={{ padding: 8 }}>
                                {yen(
                                  purchase.unit_cost
                                )}
                              </td>

                              <td style={{ padding: 8 }}>
                                {
                                  purchase.quantity
                                }
                              </td>

                              <td style={{ padding: 8 }}>
                                {yen(
                                  purchase.total_cost
                                )}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                <h3 style={{ marginTop: 30 }}>
                  売上履歴
                </h3>

               {sales.length === 0 ? (
                  <p>売上履歴はありません。</p>
                ) : (
                  <div
                    style={{
                      overflowX: "auto",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse:
                          "collapse",
                      }}
                    >
                      <thead>
                        <tr>
                          <th style={{ padding: 8 }}>
                            日付
                          </th>
                          <th style={{ padding: 8 }}>
                            販売先
                          </th>
                          <th style={{ padding: 8 }}>
                            売価
                          </th>
                          <th style={{ padding: 8 }}>
                            原価
                          </th>
                          <th style={{ padding: 8 }}>
                            数量
                          </th>
                          <th style={{ padding: 8 }}>
                            粗利
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                       {sales.map(
                          (sale) => (
                            <tr key={sale.id}>
                              <td style={{ padding: 8 }}>
                                {sale.sale_date}
                              </td>

                              <td style={{ padding: 8 }}>
                                {sale.sales_channel ||
                                  "—"}
                              </td>

                              <td style={{ padding: 8 }}>
                                {yen(
                                  sale.unit_price
                                )}
                              </td>

                              <td style={{ padding: 8 }}>
                                {yen(
                                  sale.unit_cost
                                )}
                              </td>

                              <td style={{ padding: 8 }}>
                                {sale.quantity}
                              </td>

                              <td
                                style={{
                                  padding: 8,
                                  fontWeight: 700,
                                }}
                              >
                                {yen(
                                  sale.gross_profit
                                )}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {tab === "purchases" && (
          <>
            <section style={cardStyle}>
              <h2>仕入を登録</h2>

              <p
                style={{
                  color: "#6b7280",
                }}
              >
                同じ商品でも、仕入先・仕入日・仕入価格ごとに履歴を残せます。
              </p>

              <form onSubmit={savePurchase}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 15,
                  }}
                >
                  <label>
                    商品*
                    <select
                      style={inputStyle}
                      value={
                        purchaseForm.product_id
                      }
                      onChange={(e) =>
                        setPurchaseForm({
                          ...purchaseForm,
                          product_id:
                            e.target.value,
                        })
                      }
                    >
                      <option value="">
                        商品を選択
                      </option>

                      {products.map(
                        (product) => (
                          <option
                            key={product.id}
                            value={product.id}
                          >
                            {product.name}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label>
                    仕入日
                    <input
                      style={inputStyle}
                      type="date"
                      value={
                        purchaseForm.purchase_date
                      }
                      onChange={(e) =>
                        setPurchaseForm({
                          ...purchaseForm,
                          purchase_date:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    仕入先
                    <input
                      style={inputStyle}
                      value={
                        purchaseForm.supplier
                      }
                      onChange={(e) =>
                        setPurchaseForm({
                          ...purchaseForm,
                          supplier:
                            e.target.value,
                        })
                      }
                      placeholder="例：ヤマダ電機"
                    />
                  </label>

                  <label>
                    仕入単価*
                    <input
                      style={inputStyle}
                      type="number"
                      value={
                        purchaseForm.unit_cost
                      }
                      onChange={(e) =>
                        setPurchaseForm({
                          ...purchaseForm,
                          unit_cost:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    数量*
                    <input
                      style={inputStyle}
                      type="number"
                      min="1"
                      value={
                        purchaseForm.quantity
                      }
                      onChange={(e) =>
                        setPurchaseForm({
                          ...purchaseForm,
                          quantity:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    メモ
                    <input
                      style={inputStyle}
                      value={
                        purchaseForm.notes
                      }
                      onChange={(e) =>
                        setPurchaseForm({
                          ...purchaseForm,
                          notes:
                            e.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <div
                  style={{
                    marginTop: 15,
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  仕入合計{" "}
                  {yen(
                    Number(
                      purchaseForm.unit_cost || 0
                    ) *
                      Number(
                        purchaseForm.quantity || 0
                      )
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    marginTop: 15,
                    border: "none",
                    background: "#111827",
                    color: "#fff",
                    padding: "12px 25px",
                    borderRadius: 10,
                    fontWeight: 700,
                  }}
                >
                  {saving
                    ? "登録中…"
                    : "仕入を登録する"}
                </button>
              </form>
            </section>

            <section style={cardStyle}>
              <h2>最近の仕入</h2>

              <div
                style={{
                  overflowX: "auto",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse:
                      "collapse",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ padding: 10 }}>
                        日付
                      </th>
                      <th style={{ padding: 10 }}>
                        商品
                      </th>
                      <th style={{ padding: 10 }}>
                        仕入先
                      </th>
                      <th style={{ padding: 10 }}>
                        単価
                      </th>
                      <th style={{ padding: 10 }}>
                        数量
                      </th>
                      <th style={{ padding: 10 }}>
                        合計
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {purchases
                      .slice(0, 100)
                      .map((purchase) => (
                        <tr
                          key={purchase.id}
                        >
                          <td style={{ padding: 10 }}>
                            {
                              purchase.purchase_date
                            }
                          </td>

                          <td style={{ padding: 10 }}>
                            {productMap[
                              purchase.product_id
                            ]?.name ??
                              "商品不明"}
                          </td>

                          <td style={{ padding: 10 }}>
                            {purchase.supplier ||
                              "—"}
                          </td>

                          <td style={{ padding: 10 }}>
                            {yen(
                              purchase.unit_cost
                            )}
                          </td>

                          <td style={{ padding: 10 }}>
                            {purchase.quantity}
                          </td>

                          <td style={{ padding: 10 }}>
                            {yen(
                              purchase.total_cost
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {tab === "sales" && (
          <>
            <section style={cardStyle}>
              <h2>売上を登録</h2>

              <p
                style={{
                  color: "#6b7280",
                }}
              >
                販売価格とその時点の原価を記録して、粗利を自動計算します。
              </p>

              <form onSubmit={saveSale}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 15,
                  }}
                >
                  <label>
                    商品*
                    <select
                      style={inputStyle}
                      value={
                        saleForm.product_id
                      }
                      onChange={(e) => {
                        const product =
                          products.find(
                            (item) =>
                              item.id ===
                              e.target.value
                          );

                        setSaleForm({
                          ...saleForm,
                          product_id:
                            e.target.value,
                          unit_price:
                            product?.selling_price !=
                            null
                              ? String(
                                  product.selling_price
                                )
                              : saleForm.unit_price,
                          unit_cost:
                            product?.cost_price !=
                            null
                              ? String(
                                  product.cost_price
                                )
                              : saleForm.unit_cost,
                        });
                      }}
                    >
                      <option value="">
                        商品を選択
                      </option>

                      {products.map(
                        (product) => (
                          <option
                            key={product.id}
                            value={product.id}
                          >
                            {product.name}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label>
                    売上日
                    <input
                      style={inputStyle}
                      type="date"
                      value={saleForm.sale_date}
                      onChange={(e) =>
                        setSaleForm({
                          ...saleForm,
                          sale_date:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    販売先
                    <select
                      style={inputStyle}
                      value={
                        saleForm.sales_channel
                      }
                      onChange={(e) =>
                        setSaleForm({
                          ...saleForm,
                          sales_channel:
                            e.target.value,
                        })
                      }
                    >
                      <option>
                        楽天市場
                      </option>
                      <option>
                        Amazon
                      </option>
                      <option>
                        Yahoo!ショッピング
                      </option>
                      <option>
                        メルカリ
                      </option>
                      <option>
                        店頭販売
                      </option>
                      <option>
                        その他
                      </option>
                    </select>
                  </label>

                  <label>
                    注文番号
                    <input
                      style={inputStyle}
                      value={
                        saleForm.order_number
                      }
                      onChange={(e) =>
                        setSaleForm({
                          ...saleForm,
                          order_number:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    販売単価*
                    <input
                      style={inputStyle}
                      type="number"
                      value={
                        saleForm.unit_price
                      }
                      onChange={(e) =>
                        setSaleForm({
                          ...saleForm,
                          unit_price:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    原価*
                    <input
                      style={inputStyle}
                      type="number"
                      value={
                        saleForm.unit_cost
                      }
                      onChange={(e) =>
                        setSaleForm({
                          ...saleForm,
                          unit_cost:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    数量*
                    <input
                      style={inputStyle}
                      type="number"
                      min="1"
                      value={
                        saleForm.quantity
                      }
                      onChange={(e) =>
                        setSaleForm({
                          ...saleForm,
                          quantity:
                            e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    メモ
                    <input
                      style={inputStyle}
                      value={saleForm.notes}
                      onChange={(e) =>
                        setSaleForm({
                          ...saleForm,
                          notes:
                            e.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 30,
                    flexWrap: "wrap",
                    marginTop: 20,
                    fontSize: 18,
                  }}
                >
                  <strong>
                    売上{" "}
                    {yen(
                      Number(
                        saleForm.unit_price ||
                          0
                      ) *
                        Number(
                          saleForm.quantity || 0
                        )
                    )}
                  </strong>

                  <strong
                    style={{
                      color: "#15803d",
                    }}
                  >
                    粗利{" "}
                    {yen(
                      (Number(
                        saleForm.unit_price ||
                          0
                      ) -
                        Number(
                          saleForm.unit_cost ||
                            0
                        )) *
                        Number(
                          saleForm.quantity || 0
                        )
                    )}
                  </strong>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    marginTop: 15,
                    border: "none",
                    background: "#111827",
                    color: "#fff",
                    padding: "12px 25px",
                    borderRadius: 10,
                    fontWeight: 700,
                  }}
                >
                  {saving
                    ? "登録中…"
                    : "売上を登録する"}
                </button>
              </form>
            </section>

            <section style={cardStyle}>
              <h2>最近の売上</h2>

              <div
                style={{
                  overflowX: "auto",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse:
                      "collapse",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ padding: 10 }}>
                        日付
                      </th>
                      <th style={{ padding: 10 }}>
                        商品
                      </th>
                      <th style={{ padding: 10 }}>
                        販売先
                      </th>
                      <th style={{ padding: 10 }}>
                        数量
                      </th>
                      <th style={{ padding: 10 }}>
                        売上
                      </th>
                      <th style={{ padding: 10 }}>
                        粗利
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {sales
                      .slice(0, 100)
                      .map((sale) => (
                        <tr key={sale.id}>
                          <td style={{ padding: 10 }}>
                            {sale.sale_date}
                          </td>

                          <td style={{ padding: 10 }}>
                            {productMap[
                              sale.product_id
                            ]?.name ??
                              "商品不明"}
                          </td>

                          <td style={{ padding: 10 }}>
                            {sale.sales_channel ||
                              "—"}
                          </td>

                          <td style={{ padding: 10 }}>
                            {sale.quantity}
                          </td>

                          <td style={{ padding: 10 }}>
                            {yen(
                              sale.total_sales
                            )}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              fontWeight: 700,
                              color:
                                sale.gross_profit >=
                                0
                                  ? "#15803d"
                                  : "#dc2626",
                            }}
                          >
                            {yen(
                              sale.gross_profit
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
