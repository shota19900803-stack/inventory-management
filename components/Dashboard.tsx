"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BrowserMultiFormatReader } from "@zxing/browser";
import { supabaseBrowser } from "../lib/supabase";
import ProductPriceResearchPanel from "./ProductPriceResearchPanel";

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
  shipping_cost?: number | null;
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
  shipping_cost: "",
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

  const [tab, setTabState] = useState<Tab>("dashboard");

  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      sessionStorage.setItem("inventory-active-tab", next);
    } catch {}
  };

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("inventory-active-tab");
      if (saved === "dashboard" || saved === "products" || saved === "purchases" || saved === "sales") {
        setTabState(saved as Tab);
      }
    } catch {}
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const filteredProducts = useMemo(() => {
  const keyword = productSearch.trim().toLowerCase();

  if (!keyword) {
    return products;
  }

  return products.filter((product) =>
    [
      product.name,
      product.jan_code,
      product.sku,
      product.model_number,
    ].some((value) =>
      String(value ?? "").toLowerCase().includes(keyword)
    )
  );
}, [products, productSearch]);
  const [purchaseProductSearch, setPurchaseProductSearch] = useState("");

  const filteredPurchaseProducts = useMemo(() => {
    const keyword = purchaseProductSearch.trim().toLowerCase();

    if (!keyword) {
      return products;
    }

    return products.filter((product) =>
      [
        product.name,
        product.jan_code,
        product.sku,
        product.model_number,
        product.brand,
        product.category,
      ].some((value) =>
        String(value ?? "").toLowerCase().includes(keyword)
      )
    );
  }, [products, purchaseProductSearch]);

  const [saleProductSearch, setSaleProductSearch] = useState("");

  const filteredSaleProducts = useMemo(() => {
    const keyword = saleProductSearch.trim().toLowerCase();

    if (!keyword) {
      return products;
    }

    return products.filter((product) =>
      [
        product.name,
        product.jan_code,
        product.sku,
        product.model_number,
        product.brand,
        product.category,
      ].some((value) =>
        String(value ?? "").toLowerCase().includes(keyword)
      )
    );
  }, [products, saleProductSearch]);

  const [historyProductId, setHistoryProductId] = useState("");

  const [editingProductId, setEditingProductId] =
    useState<string | null>(null);
  const [editingPurchaseId, setEditingPurchaseId] =
    useState<string | null>(null);
  const [editingSaleId, setEditingSaleId] =
    useState<string | null>(null);

  const [productForm, setProductForm] =
  useState(initialProductForm);

  const [purchaseForm, setPurchaseForm] =
    useState(initialPurchaseForm);

  const [saleForm, setSaleForm] =
    useState(initialSaleForm);

  const [selectedMonth, setSelectedMonth] =
  useState(today.slice(0, 7));

  // 最近の売上用：注文番号検索と表示月
  const [recentSalesOrderSearch, setRecentSalesOrderSearch] = useState("");
  const [recentSalesMonth, setRecentSalesMonth] = useState(today.slice(0, 7));

 const videoRef = useRef<HTMLVideoElement | null>(null);
const scannerRef = useRef<any>(null);
const controlsRef = useRef<any>(null);

const [scanning, setScanning] = useState(false);
const [scannerTarget, setScannerTarget] = useState<"product" | "purchase">("product");
const [scannerMessage, setScannerMessage] =
  useState("カメラを起動しています…");
  const productMap = useMemo(
  () =>
    Object.fromEntries(
      products.map((product) => [product.id, product])
    ),
  [products]
);
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

  const withTimeout = async (request, label) => {
    try {
      return await Promise.race([
        request,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(label + "の読み込みがタイムアウトしました。")), 10000)
        ),
      ]);
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : label + "の読み込みに失敗しました。",
        },
      };
    }
  };

  const [productsResult, purchasesResult, salesResult] = await Promise.all([
    withTimeout(
      supabase.from("products").select("*").order("created_at", { ascending: false }).limit(1000),
      "商品"
    ),
    withTimeout(
      supabase.from("purchase_history").select("*").order("purchase_date", { ascending: false }).limit(2000),
      "仕入履歴"
    ),
    withTimeout(
      supabase.from("sales_history").select("*").eq("is_cancelled", false).order("created_at", { ascending: false, nullsFirst: false })
      // 「最近の売上」は売上日ではなく、実際に登録した順で新しいものを上に表示する。
      .order("sale_date", { ascending: false }).limit(2000),
      "売上履歴"
    ),
  ]);

  let firstError = "";

  if (productsResult.error) {
    firstError ||= "商品読み込みエラー：" + productsResult.error.message;
  } else {
    setProducts((productsResult.data ?? []) as Product[]);
  }

  if (purchasesResult.error) {
    firstError ||= "仕入履歴読み込みエラー：" + purchasesResult.error.message;
  } else {
    setPurchases((purchasesResult.data ?? []) as Purchase[]);
  }

  if (salesResult.error) {
    firstError ||= "売上履歴読み込みエラー：" + salesResult.error.message;
  } else {
    setSales((salesResult.data ?? []) as Sale[]);
  }

  if (firstError) setMessage(firstError);
  setLoading(false);
}
useEffect(() => {
  loadAll();
}, []);
const startJanScanner = (target: "product" | "purchase" = "product") => {
  setScannerTarget(target);
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

      const ZXingBrowser = await import("@zxing/browser");
      const Reader = ZXingBrowser.BrowserMultiFormatReader as any;
      const reader = new Reader();

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
                if (scannerTarget === "purchase") {
                  const matched = products.find((product) => String(product.jan_code ?? "").replace(/\D/g, "") === jan);
                  if (matched) {
                    setPurchaseForm((prev) => ({ ...prev, product_id: matched.id }));
                    setScannerMessage(`読み取り成功：${jan} → ${matched.name}`);
                  } else {
                    setScannerMessage(`JAN ${jan} の商品が商品管理にありません。先に商品登録してください。`);
                  }
                } else {
                  setProductForm((prev) => ({ ...prev, jan_code: jan }));
                  setScannerMessage(`読み取り成功：${jan}`);
                }

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

  // JANカメラ起動時に、カメラ表示をスマホ幅いっぱいに整える。
  useEffect(() => {
    if (!scanning) return;

    const timer = window.setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;

      video.style.width = "100%";
      video.style.maxWidth = "none";
      video.style.height = "min(72vh, 680px)";
      video.style.minHeight = "45vh";
      video.style.display = "block";
      video.style.objectFit = "contain";
      video.style.margin = "0";
      video.style.background = "#111";
      video.style.borderRadius = "12px";

      let node = video.parentElement;
      for (let i = 0; node && i < 6; i += 1) {
        const computed = window.getComputedStyle(node);
        if (computed.display === "flex") {
          node.style.flexDirection = "column";
          node.style.alignItems = "stretch";
          node.style.justifyContent = "center";
          node.style.width = "calc(100vw - 24px)";
          node.style.maxWidth = "720px";
          node.style.marginLeft = "auto";
          node.style.marginRight = "auto";
          node.style.boxSizing = "border-box";
          node.style.gap = "10px";
          break;
        }
        node = node.parentElement;
      }

      const parent = video.parentElement;
      if (parent) {
        parent.style.width = "100%";
        parent.style.maxWidth = "none";
        parent.style.boxSizing = "border-box";
      }
    }, 50);

    return () => window.clearTimeout(timer);
  }, [scanning]);

  const monthSales = useMemo(() => {
  return sales.filter(
    (sale) => monthOf(sale.sale_date) === selectedMonth
  );
}, [sales, selectedMonth]);

  const filteredRecentSales = useMemo(() => {
    const keyword = recentSalesOrderSearch.trim().toLowerCase();

    return sales.filter((sale) => {
      const matchesMonth = monthOf(sale.sale_date) === recentSalesMonth;
      const matchesOrder = !keyword ||
        String(sale.order_number ?? "").toLowerCase().includes(keyword);
      return matchesMonth && matchesOrder;
    });
  }, [sales, recentSalesMonth, recentSalesOrderSearch]);
  
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

  // 在庫評価は products.cost_price × 在庫数 ではなく、
  // 仕入ロットをFIFOで消化した「実際に残っている在庫」の仕入額を使う。
  // 例：890円×1個 + 2,000円×1個が残っていれば、在庫仕入金額は2,890円。
  const inventoryCostByProduct = useMemo(() => {
    const result: Record<string, number> = {};

    for (const product of products) {
      const targetStock = Math.max(0, Number(product.stock_quantity || 0));
      if (targetStock === 0) {
        result[product.id] = 0;
        continue;
      }

      const lots = purchases
        .filter((purchase) => purchase.product_id === product.id && Number(purchase.quantity || 0) > 0)
        .sort((a, b) => {
          const dateDiff = String(a.purchase_date).localeCompare(String(b.purchase_date));
          if (dateDiff !== 0) return dateDiff;
          const createdDiff = String(a.created_at || "").localeCompare(String(b.created_at || ""));
          if (createdDiff !== 0) return createdDiff;
          return String(a.id).localeCompare(String(b.id));
        })
        .map((purchase) => ({
          remaining: Number(purchase.quantity || 0),
          unitCost: Number(purchase.unit_cost || 0),
        }));

      const sold = sales
        .filter((sale) => sale.product_id === product.id && !sale.is_cancelled && Number(sale.quantity || 0) > 0)
        .sort((a, b) => {
          const dateDiff = String(a.sale_date).localeCompare(String(b.sale_date));
          if (dateDiff !== 0) return dateDiff;
          const createdDiff = String(a.created_at || "").localeCompare(String(b.created_at || ""));
          if (createdDiff !== 0) return createdDiff;
          return String(a.id).localeCompare(String(b.id));
        });

      // 仕入ロットを古い順に売上数量で消化する。
      for (const sale of sold) {
        let remainingSaleQty = Number(sale.quantity || 0);
        for (const lot of lots) {
          if (remainingSaleQty <= 0) break;
          const consume = Math.min(lot.remaining, remainingSaleQty);
          lot.remaining -= consume;
          remainingSaleQty -= consume;
        }
      }

      const lotStock = lots.reduce((sum, lot) => sum + lot.remaining, 0);

      // 履歴とproducts.stock_quantityが一致する通常ケースではロット評価を使用。
      // 棚卸し等で一時的に差がある場合は、画面の在庫数を壊さず従来値へフォールバックする。
      if (lotStock !== targetStock) {
        result[product.id] = targetStock * Number(product.cost_price || 0);
        continue;
      }

      result[product.id] = lots.reduce(
        (sum, lot) => sum + lot.remaining * lot.unitCost,
        0
      );
    }

    return result;
  }, [products, purchases, sales]);

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
      // products.cost_price is NOT NULL in Supabase.
      // When a product is registered from JAN search, the purchase cost may
      // not be known yet, so store 0 and allow the real cost to be entered
      // later through purchase registration.
      cost_price:
        productForm.cost_price === ""
          ? 0
          : Number(productForm.cost_price),
      // products.selling_price is NOT NULL in Supabase.
      // JAN検索だけで商品登録する場合は販売価格が未確定なので、
      // 空欄は0として保存し、後から商品編集で価格を設定できるようにする。
      selling_price:
        productForm.selling_price === ""
          ? 0
          : Number(productForm.selling_price),
    };

    // 新規商品登録時、同じJANが既に登録されていれば重複登録せず、既存商品を選択した状態で仕入登録画面へ移動する。
    if (!editingProductId && payload.jan_code) {
      const normalizedJan = String(payload.jan_code).replace(/\D/g, "");
      const existing = products.find(
        (product) =>
          String(product.jan_code ?? "").replace(/\D/g, "") === normalizedJan
      );

      if (existing) {
        setSaving(false);
        setMessage(
          `このJANは既に登録済みです：「${existing.name}」\n仕入登録画面を開きました。`
        );
        setPurchaseForm({
          ...initialPurchaseForm,
          product_id: existing.id,
          unit_cost:
            existing.cost_price == null ? "" : String(existing.cost_price),
        });
        setTab("purchases");
        setEditingProductId(null);
        setProductForm(initialProductForm);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

    const result = editingProductId
      ? await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProductId)
          .select("*")
          .single()
      : await supabase
          .from("products")
          .insert(payload)
          .select("*")
          .single();

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

      const savedProduct = result.data as Product | null;
      if (savedProduct) {
        setProducts((prev) => {
          if (editingProductId) {
            return prev.map((product) =>
              product.id === editingProductId ? savedProduct : product
            );
          }
          return [savedProduct, ...prev];
        });
      }
      resetProductForm();
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
    setEditingPurchaseId(null);
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

  function editPurchase(purchase: Purchase) {
  setEditingPurchaseId(purchase.id);
  setPurchaseForm({ product_id: purchase.product_id, purchase_date: purchase.purchase_date, supplier: purchase.supplier ?? "", unit_cost: String(purchase.unit_cost ?? ""), quantity: String(purchase.quantity ?? 1), notes: purchase.notes ?? "" });
  setTab("purchases");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deletePurchase(purchase: Purchase) {
  if (!window.confirm(`この仕入を削除しますか？\n\n数量：${purchase.quantity}個\n合計：${yen(purchase.total_cost)}`)) return;
  setSaving(true); setMessage("");
  try {
    const product = products.find((item) => item.id === purchase.product_id);
    const currentStock = Number(product?.stock_quantity ?? 0);
    if (!product) throw new Error("商品が見つかりません。");
    if (currentStock < Number(purchase.quantity)) throw new Error(`現在庫が${purchase.quantity}個未満のため削除できません。先に関連する売上を確認してください。`);
    const { error: de } = await supabase.from("purchase_history").delete().eq("id", purchase.id);
    if (de) throw de;
    const { error: se } = await supabase.from("products").update({ stock_quantity: currentStock - Number(purchase.quantity) }).eq("id", purchase.product_id);
    if (se) throw se;
    setMessage("仕入を削除し、在庫も調整しました。");
    await loadAll();
  } catch (error: any) { setMessage(`仕入削除エラー：${error?.message || String(error)}`); }
  finally { setSaving(false); }
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
    if (editingPurchaseId) {
      const original = purchases.find((item) => item.id === editingPurchaseId);
      if (!original) throw new Error("編集対象の仕入が見つかりません。");
      if (original.product_id !== purchaseForm.product_id) throw new Error("仕入商品の変更は安全のためできません。商品を変更する場合は削除して新しく登録してください。");
      const product = products.find((item) => item.id === original.product_id);
      if (!product) throw new Error("商品が見つかりません。");
      const delta = quantity - Number(original.quantity);
      const currentStock = Number(product.stock_quantity || 0);
      if (currentStock + delta < 0) throw new Error("数量を減らすと在庫がマイナスになるため更新できません。");
      const { error: ue } = await supabase.from("purchase_history").update({ purchase_date: purchaseForm.purchase_date, supplier: purchaseForm.supplier.trim() || null, unit_cost: unitCost, quantity, total_cost: unitCost * quantity, notes: purchaseForm.notes.trim() || null }).eq("id", editingPurchaseId);
      if (ue) throw ue;
      const { error: se } = await supabase.from("products").update({ stock_quantity: currentStock + delta }).eq("id", original.product_id);
      if (se) throw se;
      setMessage("仕入を更新し、在庫も調整しました。");
      setEditingPurchaseId(null); setPurchaseForm(initialPurchaseForm); await loadAll(); return;
    }

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

    // 登録直後に全履歴を再取得せず、RPCの結果をローカル状態へ反映する。
    const newPurchase: Purchase = {
      id: String(data.purchase_id),
      product_id: purchaseForm.product_id,
      purchase_date: purchaseForm.purchase_date,
      supplier: purchaseForm.supplier.trim() || null,
      unit_cost: unitCost,
      quantity,
      total_cost: unitCost * quantity,
      notes: purchaseForm.notes.trim() || null,
    };

    setPurchases((prev) => [newPurchase, ...prev]);
    setProducts((prev) =>
      prev.map((item) =>
        item.id === purchaseForm.product_id
          ? {
              ...item,
              stock_quantity: Number(data.stock_after ?? item.stock_quantity ?? 0),
              cost_price: unitCost,
            }
          : item
      )
    );

    setPurchaseForm(initialPurchaseForm);

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

  // 二重送信防止
  if (saving) {
    return;
  }

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

  const shippingCost = Number(
    saleForm.shipping_cost || 0
  );

  if (
    unitPrice < 0 ||
    unitCost < 0 ||
    shippingCost < 0 ||
    quantity <= 0
  ) {
    setMessage(
      "販売価格・原価・送料・数量を正しく入力してください。"
    );
    return;
  }

  setSaving(true);
  setMessage("");

  try {
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
        `商品在庫の取得に失敗しました：${
          latestProductError?.message || "商品が見つかりません。"
        }`
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
        `在庫が不足しています。現在庫：${currentStock}個、販売数量：${quantity}個`
      );
      return;
    }

    // ==========================================
    // 売上登録
    // ==========================================

    // register_sale() 側で
    // ・売上履歴
    // ・商品在庫
    // ・在庫変動履歴
    // をまとめて処理する
    const { data, error } =
      await supabase.rpc(
        "register_sale",
        {
          p_product_id:
            saleForm.product_id,

          p_sale_date:
            saleForm.sale_date,

          p_sales_channel:
            saleForm.sales_channel.trim() ||
            null,

          p_order_number:
            saleForm.order_number.trim() ||
            null,

          p_unit_price:
            unitPrice,

          p_unit_cost:
            unitCost,

          p_quantity:
            quantity,

          p_notes:
            saleForm.notes.trim() || null,
        }
      );

    // RPCエラー
    if (error) {
      setMessage(
        `売上登録エラー：${error.message}`
      );
      return;
    }

    // RPC処理失敗
    if (!data?.success) {
      setMessage(
        "売上登録に失敗しました。"
      );
      return;
    }

    // ==========================================
    // 送料保存
    // ==========================================
    let saleId = data?.sale_id ?? data?.id ?? null;

    if (!saleId) {
      const { data: latestSale } = await supabase
        .from("sales_history")
        .select("id")
        .eq("product_id", saleForm.product_id)
        .eq("sale_date", saleForm.sale_date)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      saleId = latestSale?.id ?? null;
    }

    if (saleId) {
      const { error: shippingError } = await supabase.rpc("set_sale_shipping_cost", {
        p_sale_id: saleId,
        p_shipping_cost: shippingCost,
      });
      if (shippingError) {
        setMessage(`送料の保存に失敗しました：${shippingError.message}`);
        return;
      }
    }

    // ==========================================
    // 登録成功
    // ==========================================

    setMessage(
      "売上を登録しました。"
    );

    // 登録直後に全履歴を再取得せず、RPCの結果をローカル状態へ反映する。
    const newSale: Sale = {
      id: String(data.sale_id),
      product_id: saleForm.product_id,
      sale_date: saleForm.sale_date,
      sales_channel: saleForm.sales_channel.trim() || null,
      order_number: saleForm.order_number.trim() || null,
      unit_price: unitPrice,
      unit_cost: Number(data.unit_cost ?? unitCost),
      quantity,
      total_sales: Number(data.total_sales ?? unitPrice * quantity),
      total_cost: Number(data.total_cost ?? Number(data.unit_cost ?? unitCost) * quantity),
      gross_profit: Number(data.gross_profit ?? ((unitPrice - Number(data.unit_cost ?? unitCost)) * quantity)),
      notes: saleForm.notes.trim() || null,
      is_cancelled: false,
      created_at: new Date().toISOString(),
    };

    setSales((prev) => [newSale, ...prev]);
    setProducts((prev) =>
      prev.map((item) =>
        item.id === saleForm.product_id
          ? {
              ...item,
              stock_quantity: Number(data.stock_after ?? Math.max(0, Number(item.stock_quantity ?? 0) - quantity)),
            }
          : item
      )
    );

    setSaleForm(initialSaleForm);

    // FINAL: stay on sales tab after sale registration
    setTab("sales");
    if (typeof window !== "undefined") {
      const restoreSaleView = () => {
        try {
          const activeEl = document.activeElement;
          if (activeEl instanceof HTMLElement) {
            activeEl.blur();
          }
        } catch {}
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      };
      requestAnimationFrame(restoreSaleView);
      window.setTimeout(restoreSaleView, 50);
      window.setTimeout(restoreSaleView, 200);
    }

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

function editSale(sale: Sale) {
  if (sale.is_cancelled) { setMessage("取消済みの売上は編集できません。"); return; }
  setEditingSaleId(sale.id);
  setSaleForm({ product_id: sale.product_id, sale_date: sale.sale_date, sales_channel: sale.sales_channel ?? "楽天市場", order_number: sale.order_number ?? "", unit_price: String(sale.unit_price ?? ""), unit_cost: String(sale.unit_cost ?? ""), quantity: String(sale.quantity ?? 1), shipping_cost: String(sale.shipping_cost ?? ""), notes: sale.notes ?? "" });
  setTab("sales");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteSale(sale: Sale) { await cancelSale(sale); }

async function updateSale(event: React.FormEvent) {
  event.preventDefault(); if (!editingSaleId) return;
  const original = sales.find((item) => item.id === editingSaleId);
  if (!original) { setMessage("編集対象の売上が見つかりません。"); return; }
  if (original.product_id !== saleForm.product_id) { setMessage("売上商品の変更は安全のためできません。取消して新しく登録してください。"); return; }
  const unitPrice = Number(saleForm.unit_price || 0), unitCost = Number(saleForm.unit_cost || 0), quantity = Number(saleForm.quantity || 0), shippingCost = Number(saleForm.shipping_cost || 0);
  if (unitPrice < 0 || unitCost < 0 || shippingCost < 0 || quantity <= 0) { setMessage("販売価格・原価・数量を正しく入力してください。"); return; }
  setSaving(true); setMessage("");
  try {
    const product = products.find((item) => item.id === original.product_id);
    if (!product) throw new Error("商品が見つかりません。");
    const currentStock = Number(product.stock_quantity || 0), delta = Number(original.quantity) - quantity;
    if (currentStock + delta < 0) throw new Error(`在庫が不足しています。現在庫：${currentStock}個`);
    const { error: ue } = await supabase.from("sales_history").update({ sale_date: saleForm.sale_date, sales_channel: saleForm.sales_channel.trim() || null, order_number: saleForm.order_number.trim() || null, unit_price: unitPrice, unit_cost: unitCost, quantity, total_sales: unitPrice * quantity, total_cost: unitCost * quantity, gross_profit: (unitPrice - unitCost) * quantity - shippingCost, shipping_cost: shippingCost, notes: saleForm.notes.trim() || null }).eq("id", editingSaleId);
    if (ue) throw ue;
    const { error: se } = await supabase.from("products").update({ stock_quantity: currentStock + delta }).eq("id", original.product_id);
    if (se) throw se;
    setMessage("売上を更新し、在庫も調整しました。"); setEditingSaleId(null); setSaleForm(initialSaleForm); await loadAll();
  } catch (error: any) { setMessage(`売上更新エラー：${error?.message || String(error)}`); }
  finally { setSaving(false); }
}

async function cancelSale(sale: any) {
  const proceed = window.confirm(
    `この売上を取消しますか？\n\n売上金額：¥${Number(sale.total_sales || 0).toLocaleString()}\n数量：${Number(sale.quantity || 0)}個`
  );

  if (!proceed) {
    return;
  }

  setMessage("");

  try {
    // すでに取消済みなら処理しない
    if (sale.is_cancelled) {
      setMessage("この売上はすでに取消済みです。");
      return;
    }

    // SupabaseのDB関数で売上取消を実行
    // 在庫復元・売上取消・在庫履歴登録をDB側でまとめて処理
    const { data, error } = await supabase.rpc("cancel_sale", {
      p_sale_id: sale.id,
    });

    if (error) {
      setMessage(`売上取消エラー：${error.message}`);
      return;
    }

    // DB関数からエラーが返された場合
    if (data?.success === false) {
      setMessage(`売上取消エラー：${data.message || "取消処理に失敗しました。"}`);
      return;
    }

    setMessage("売上を取消しました。在庫も元に戻しました。");

    // 最新データを再取得
    await loadAll();

  } catch (error) {
    setMessage(
      `売上取消エラー：${
        error instanceof Error ? error.message : String(error)
      }`
    );
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
    display:
      typeof window !== "undefined" && window.innerWidth <= 767
        ? "none"
        : undefined,
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
    <>
      <button
        type="button"
        onClick={() => editSale(sale)}
        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontWeight: 700, cursor: "pointer", marginRight: 6 }}
      >
        編集
      </button><button
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
    </>
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
            <ProductPriceResearchPanel products={products} visible={tab === "products"} />
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
    onClick={() => startJanScanner("product")}
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
        height: "min(72vh, 680px)",
        minHeight: "45vh",
        display: "block",
        objectFit: "contain",
        borderRadius: 12,
        background: "#111",
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
                        在庫仕入金額
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
                              fontWeight: 700,
                            }}
                            title="仕入履歴をFIFOで消化して残在庫の仕入額を計算"
                          >
                            {yen(inventoryCostByProduct[product.id] ?? 0)}
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

                          <td style={{ padding: 10, position: "sticky", right: 0, background: "#fff", zIndex: 1 }}>
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
                            送料
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

                              <td style={{ padding: 8 }}>
                                {yen(sale.shipping_cost)}
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
              <h2>{editingPurchaseId ? "仕入を編集" : "仕入を登録"}</h2>

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
                    <input
                      style={inputStyle}
                      type="search"
                      value={purchaseProductSearch}
                      onChange={(e) => setPurchaseProductSearch(e.target.value)}
                      placeholder="商品名・JAN・SKU・型番・ブランドで検索"
                    />
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                      {purchaseProductSearch.trim() ? filteredPurchaseProducts.length + "件が該当" : products.length + "件の商品から選択"}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                      <select
                        style={{ ...inputStyle, flex: 1 }}
                        value={purchaseForm.product_id}
                        onChange={(e) => setPurchaseForm({ ...purchaseForm, product_id: e.target.value })}
                      >
                        <option value="">商品を選択</option>
                        {filteredPurchaseProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}{product.jan_code ? "　[" + product.jan_code + "]" : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => startJanScanner("purchase")}
                        style={{ border: "none", background: "#15803d", color: "#fff", borderRadius: 10, padding: "12px 14px", fontWeight: 800, whiteSpace: "nowrap", cursor: "pointer" }}
                      >
                        📷 JAN
                      </button>
                    </div>
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
                  {saving ? "保存中…" : editingPurchaseId ? "仕入を更新する" : "仕入を登録する"}
                </button>
                {editingPurchaseId && (
                  <button type="button" onClick={() => { setEditingPurchaseId(null); setPurchaseForm(initialPurchaseForm); }} style={{ marginTop: 15, marginLeft: 8, border: "1px solid #d1d5db", background: "#fff", padding: "12px 18px", borderRadius: 10, fontWeight: 700 }}>キャンセル</button>
                )}
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
                      <th style={{ padding: 10 }}>操作</th>
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
                            {yen(purchase.total_cost)}
                          </td>
                          <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                            <button type="button" onClick={() => editPurchase(purchase)} style={{ marginRight: 6 }}>編集</button>
                            <button type="button" onClick={() => void deletePurchase(purchase)} style={{ color: "#dc2626" }}>削除</button>
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
              <h2>{editingSaleId ? "売上を編集" : "売上を登録"}</h2>

              <p
                style={{
                  color: "#6b7280",
                }}
              >
                販売価格とその時点の原価を記録して、粗利を自動計算します。
              </p>

              <form onSubmit={editingSaleId ? updateSale : saveSale}>
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
                    <input
                      style={inputStyle}
                      type="search"
                      value={saleProductSearch}
                      onChange={(e) => setSaleProductSearch(e.target.value)}
                      placeholder="商品名・JAN・SKU・型番・ブランドで検索"
                    />
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                      {saleProductSearch.trim() ? filteredSaleProducts.length + "件が該当" : products.length + "件の商品から選択"}
                    </div>
                    <select
                      style={{ ...inputStyle, marginTop: 6 }}
                      value={saleForm.product_id}
                      onChange={(e) => {
                        const product = products.find((item) => item.id === e.target.value);
                        setSaleForm({
                          ...saleForm,
                          product_id: e.target.value,
                          unit_price: product?.selling_price != null ? String(product.selling_price) : saleForm.unit_price,
                          unit_cost: product?.cost_price != null ? String(product.cost_price) : saleForm.unit_cost,
                        });
                        setSaleProductSearch("");
                      }}
                    >
                      <option value="">商品を選択</option>
                      {filteredSaleProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}{product.jan_code ? "　[" + product.jan_code + "]" : ""}
                        </option>
                      ))}
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
                    送料
                    <input
                      style={inputStyle}
                      type="number"
                      min="0"
                      value={saleForm.shipping_cost}
                      onChange={(e) =>
                        setSaleForm({
                          ...saleForm,
                          shipping_cost: e.target.value,
                        })
                      }
                      placeholder="例：750"
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

                  <strong>
                    送料{" "}
                    {yen(Number(saleForm.shipping_cost || 0))}
                  </strong>

                  <strong
                    style={{
                      color:
                        (Number(saleForm.unit_price || 0) * Number(saleForm.quantity || 0) -
                          Number(saleForm.unit_cost || 0) * Number(saleForm.quantity || 0) -
                          Number(saleForm.shipping_cost || 0)) >= 0
                          ? "#15803d"
                          : "#dc2626",
                    }}
                  >
                    実質粗利{" "}
                    {yen(
                      Number(saleForm.unit_price || 0) * Number(saleForm.quantity || 0) -
                        Number(saleForm.unit_cost || 0) * Number(saleForm.quantity || 0) -
                        Number(saleForm.shipping_cost || 0)
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
                  {saving ? "保存中…" : editingSaleId ? "売上を更新する" : "売上を登録する"}
                </button>
                {editingSaleId && (
                  <button type="button" onClick={() => { setEditingSaleId(null); setSaleForm(initialSaleForm); }} style={{ marginTop: 15, marginLeft: 8, border: "1px solid #d1d5db", background: "#fff", padding: "12px 18px", borderRadius: 10, fontWeight: 700 }}>キャンセル</button>
                )}
              </form>
            </section>

            <section style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 15,
                }}
              >
                <h2 style={{ margin: 0 }}>最近の売上</h2>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <label style={{ fontWeight: 700 }}>
                    月
                    <select
                      value={recentSalesMonth}
                      onChange={(e) => setRecentSalesMonth(e.target.value)}
                      style={{ ...inputStyle, marginLeft: 6, width: 150 }}
                    >
                      {months.map((month) => (
                        <option value={month} key={month}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </label>

                  <input
                    style={{ ...inputStyle, width: 220 }}
                    value={recentSalesOrderSearch}
                    onChange={(e) => setRecentSalesOrderSearch(e.target.value)}
                    placeholder="注文番号で検索"
                  />
                </div>
              </div>

              <div
                style={{
                  marginBottom: 12,
                  color: "#6b7280",
                  fontSize: 13,
                }}
              >
                {recentSalesOrderSearch.trim()
                  ? recentSalesMonth + "・注文番号「" + recentSalesOrderSearch.trim() + "」の検索結果：" + filteredRecentSales.length + "件"
                  : recentSalesMonth + "の売上：" + filteredRecentSales.length + "件"}
              </div>

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
                        注文番号
                      </th>
                      <th style={{ padding: 10 }}>
                        数量
                      </th>
                      <th style={{ padding: 10 }}>
                        売上
                      </th>
                      <th style={{ padding: 10 }} data-purchase-cost-header="true">
                        仕入値
                      </th>
                      <th style={{ padding: 10 }}>
                        送料
                      </th>
                      <th style={{ padding: 10 }}>
                        粗利
                      </th>
                      <th style={{ padding: 10 }}>操作</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRecentSales.map((sale) => (
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

                          <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                            {sale.order_number || "—"}
                          </td>

                          <td style={{ padding: 10 }}>
                            {sale.quantity}
                          </td>

                          <td style={{ padding: 10 }}>
                            {yen(
                              sale.total_sales
                            )}
                          </td>

                          <td style={{ padding: 10, textAlign: "right" }} data-purchase-cost-cell="true">
                            {yen(sale.unit_cost)}
                          </td>

                          <td style={{ padding: 10 }}>
                            {yen(sale.shipping_cost)}
                          </td>

                          <td style={{ padding: 10, fontWeight: 700, color: sale.gross_profit >= 0 ? "#15803d" : "#dc2626" }}>
                            {yen(sale.gross_profit)}
                          </td>
                          <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                            <button type="button" onClick={() => editSale(sale)} style={{ marginRight: 6 }}>編集</button>
                            <button type="button" onClick={() => void deleteSale(sale)} style={{ color: "#dc2626" }}>取消/削除</button>
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
    
        {/* FINAL PURCHASE JAN SCANNER */}
        {scanning && scannerTarget === "purchase" && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ width: "min(680px, 100%)", background: "#111827", borderRadius: 18, padding: 16, boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, marginBottom: 10 }}>📷 JANコード読取（仕入登録）</div>
              <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", display: "block", borderRadius: 12, background: "#000" }} />
              <div style={{ color: "#fff", textAlign: "center", marginTop: 10, fontWeight: 700 }}>{scannerMessage}</div>
              <button type="button" onClick={closeJanScanner} style={{ marginTop: 12, width: "100%", padding: "12px 16px", border: 0, borderRadius: 10, background: "#fff", color: "#111827", fontWeight: 800 }}>閉じる</button>
            </div>
          </div>
        )}
</main>
  );
}

// Applied purchase product search.

// Applied sale product search.

// Applied sale stock refresh fix.

// FINAL: persist active inventory tab

// Applied recent sales registration-order fix.
