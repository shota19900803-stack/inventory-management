import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { supabaseBrowser } from "../lib/supabase";

type Product = {
  id: string;
  name: string;
  jan_code?: string | null;
  sku?: string | null;
  stock_quantity?: number | null;
  selling_price?: number | null;
  cost_price?: number | null;
};

type Purchase = {
  id: string;
  product_id: string;
  purchase_date: string;
  supplier?: string | null;
  unit_cost: number;
  quantity: number;
};

type SaleLine = {
  id: string;
  product_id: string;
  unit_price: string;
  unit_cost: string;
  quantity: string;
};

const today = new Date().toISOString().slice(0, 10);

function yen(value: number) {
  return `¥${Number(value || 0).toLocaleString()}`;
}

const newLine = (product?: Product): SaleLine => ({
  id: `${Date.now()}-${Math.random()}`,
  product_id: product?.id ?? "",
  unit_price: product?.selling_price == null ? "" : String(product.selling_price),
  unit_cost: product?.cost_price == null ? "" : String(product.cost_price),
  quantity: "1",
});

export default function SalesOrderPage() {
  const supabase = supabaseBrowser;
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [saleDate, setSaleDate] = useState(today);
  const [channel, setChannel] = useState("楽天市場");
  const [orderNumber, setOrderNumber] = useState("");
  const [shippingCost, setShippingCost] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLineId, setScannerLineId] = useState<string | null>(null);
  const [scannerMessage, setScannerMessage] = useState("JANコードをカメラに映してください");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<any>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("products").select("*").order("name").limit(2000),
      supabase.from("purchase_history").select("*").order("purchase_date", { ascending: false }).limit(5000),
    ]).then(([p, h]) => {
      if (p.error) setMessage(`商品読み込みエラー：${p.error.message}`);
      else setProducts((p.data ?? []) as Product[]);
      if (!h.error) setPurchases((h.data ?? []) as Purchase[]);
    });
  }, []);

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) =>
      [product.name, product.jan_code, product.sku].some((value) => String(value ?? "").toLowerCase().includes(keyword))
    );
  }, [products, productSearch]);

  const totals = useMemo(() => {
    const sales = lines.reduce((sum, line) => sum + Number(line.unit_price || 0) * Number(line.quantity || 0), 0);
    const cost = lines.reduce((sum, line) => sum + Number(line.unit_cost || 0) * Number(line.quantity || 0), 0);
    const shipping = Number(shippingCost || 0);
    return { sales, cost, shipping, gross: sales - cost - shipping };
  }, [lines, shippingCost]);

  function updateLine(id: string, patch: Partial<SaleLine>) {
    setLines((prev) => prev.map((line) => line.id === id ? { ...line, ...patch } : line));
  }

  function selectProduct(id: string, lineId: string) {
    const product = productMap[id];
    updateLine(lineId, {
      product_id: id,
      unit_price: product?.selling_price == null ? "" : String(product.selling_price),
      unit_cost: product?.cost_price == null ? "" : String(product.cost_price),
    });
  }

  function selectPurchase(lineId: string, purchaseId: string) {
    const purchase = purchases.find((item) => item.id === purchaseId);
    if (!purchase) return;
    updateLine(lineId, { product_id: purchase.product_id, unit_cost: String(purchase.unit_cost) });
  }

  function openScanner(lineId: string) {
    setScannerLineId(lineId);
    setScannerMessage("JANコードをカメラに映してください");
    setScannerOpen(true);
  }

  function closeScanner() {
    try { scannerControlsRef.current?.stop(); } catch {}
    scannerControlsRef.current = null;
    setScannerOpen(false);
    setScannerLineId(null);
  }

  useEffect(() => {
    if (!scannerOpen || !scannerLineId) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    const start = async () => {
      try {
        if (!videoRef.current) return;
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => {
            if (cancelled || !result) return;
            const jan = result.getText().replace(/\D/g, "");
            if (jan.length !== 13) return;
            const matched = products.find((product) => String(product.jan_code ?? "").replace(/\D/g, "") === jan);
            if (!matched) {
              setScannerMessage(`JAN ${jan} の商品が見つかりません。商品管理から先に登録してください。`);
              return;
            }
            selectProduct(matched.id, scannerLineId);
            setScannerMessage(`読み取り成功：${matched.name}`);
            controls.stop();
            scannerControlsRef.current = null;
            window.setTimeout(() => { if (!cancelled) closeScanner(); }, 350);
          }
        );
        if (cancelled) controls.stop();
        else scannerControlsRef.current = controls;
      } catch (error) {
        console.error("JANスキャンエラー", error);
        if (!cancelled) setScannerMessage("カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。");
      }
    };

    start();
    return () => {
      cancelled = true;
      try { scannerControlsRef.current?.stop(); } catch {}
      scannerControlsRef.current = null;
    };
  }, [scannerOpen, scannerLineId, products]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setMessage("");

    if (!orderNumber.trim()) return setMessage("注文番号を入力してください。");
    if (!lines.length) return setMessage("商品を1点以上追加してください。");

    const items = lines.map((line) => ({
      product_id: line.product_id,
      unit_price: Number(line.unit_price || 0),
      unit_cost: Number(line.unit_cost || 0),
      quantity: Number(line.quantity || 0),
    }));

    if (items.some((item) => !item.product_id || item.quantity <= 0 || item.unit_price < 0 || item.unit_cost < 0)) {
      return setMessage("各商品の商品・価格・数量を正しく入力してください。");
    }

    const stockProblems = items
      .map((item) => ({ item, product: productMap[item.product_id] }))
      .filter(({ item, product }) => !product || Number(product.stock_quantity || 0) < item.quantity);
    if (stockProblems.length) {
      return setMessage(stockProblems.map(({ item, product }) => `${product?.name || "商品"}：在庫 ${Number(product?.stock_quantity || 0)}個 / 売上 ${item.quantity}個`).join("\n") + "\n在庫不足のため登録できません。");
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("register_sales_order", {
        p_sale_date: saleDate,
        p_sales_channel: channel.trim() || null,
        p_order_number: orderNumber.trim(),
        p_shipping_cost: Number(shippingCost || 0),
        p_notes: notes.trim() || null,
        p_items: items,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "注文登録に失敗しました。");

      setMessage(`注文を登録しました。${data.sale_count}明細・売上${yen(data.total_sales)}・粗利${yen(data.gross_profit)}`);
      setLines([newLine()]);
      setOrderNumber("");
      setShippingCost("0");
      setNotes("");
      setProductSearch("");
    } catch (error: any) {
      setMessage(`注文登録エラー：${error?.message || String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", padding: "28px 18px 70px", color: "#111827", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, letterSpacing: 2, color: "#6b7280", fontWeight: 800 }}>SALES ORDER</div>
            <h1 style={{ margin: "4px 0 0", fontSize: 32 }}>💰 注文単位で売上登録</h1>
            <p style={{ margin: "6px 0 0", color: "#6b7280" }}>1注文に複数商品をまとめて登録。JAN読み取り・原価履歴選択・原価違いの同一商品にも対応。</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => router.push("/product-history")} style={secondaryButtonStyle}>📦 商品履歴</button>
            <button type="button" onClick={() => router.push("/")} style={secondaryButtonStyle}>← 在庫管理</button>
          </div>
        </div>

        {message && <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, background: message.includes("エラー") || message.includes("不足") ? "#fff7ed" : "#ecfdf5", border: "1px solid #bbf7d0", color: "#166534", whiteSpace: "pre-wrap" }}>{message}</div>}

        <form onSubmit={submit}>
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>注文情報</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
              <label>注文番号*
                <input autoFocus value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="例：RKT-12345" style={inputStyle} />
              </label>
              <label>販売先
                <input value={channel} onChange={(e) => setChannel(e.target.value)} style={inputStyle} />
              </label>
              <label>売上日
                <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} style={inputStyle} />
              </label>
              <label>送料
                <input type="number" min="0" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} style={inputStyle} />
              </label>
            </div>
          </section>

          <section style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0 }}>商品明細</h2>
                <div style={{ marginTop: 5, color: "#6b7280", fontSize: 13 }}>JANをピッ → 商品自動選択 → 原価を選択 → 数量入力、の流れで登録できます。</div>
              </div>
              <button type="button" onClick={() => setLines((prev) => [...prev, newLine()])} style={addButtonStyle}>＋ 商品を追加</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="🔎 商品名・JAN・SKUで絞り込み（商品を選ぶ時に便利）" style={inputStyle} />
            </div>

            {lines.map((line, index) => {
              const selectedProduct = productMap[line.product_id];
              const stock = Number(selectedProduct?.stock_quantity || 0);
              const linePurchases = purchases.filter((purchase) => purchase.product_id === line.product_id);
              const lineSales = Number(line.unit_price || 0) * Number(line.quantity || 0);
              const lineCost = Number(line.unit_cost || 0) * Number(line.quantity || 0);
              const insufficient = !!selectedProduct && Number(line.quantity || 0) > stock;

              return (
                <div key={line.id} style={{ border: insufficient ? "2px solid #f59e0b" : "1px solid #e5e7eb", borderRadius: 12, padding: 15, marginBottom: 12, background: index % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <strong>商品 {index + 1}</strong>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => openScanner(line.id)} style={scanButtonStyle}>📷 JANを読む</button>
                      {lines.length > 1 && <button type="button" onClick={() => setLines((prev) => prev.filter((item) => item.id !== line.id))} style={deleteButtonStyle}>削除</button>}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 2fr) repeat(3, minmax(130px, 1fr))", gap: 12 }}>
                    <label>商品*
                      <select value={line.product_id} onChange={(e) => selectProduct(e.target.value, line.id)} style={inputStyle}>
                        <option value="">商品を選択</option>
                        {filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.name}（JAN {product.jan_code || "—"} / 在庫 {Number(product.stock_quantity || 0)}）</option>)}
                      </select>
                    </label>
                    <label>販売単価
                      <input type="number" min="0" value={line.unit_price} onChange={(e) => updateLine(line.id, { unit_price: e.target.value })} style={inputStyle} />
                    </label>
                    <label>原価
                      <input type="number" min="0" value={line.unit_cost} onChange={(e) => updateLine(line.id, { unit_cost: e.target.value })} style={inputStyle} />
                    </label>
                    <label>数量
                      <input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: e.target.value })} style={inputStyle} />
                    </label>
                  </div>

                  {line.product_id && (
                    <div style={{ marginTop: 12, padding: 12, background: insufficient ? "#fff7ed" : "#f8fafc", borderRadius: 10, fontSize: 13 }}>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", color: "#475569" }}>
                        <span>現在庫：<strong>{stock}個</strong></span>
                        <span>明細売上：<strong>{yen(lineSales)}</strong></span>
                        <span>明細原価：<strong>{yen(lineCost)}</strong></span>
                        {insufficient && <strong style={{ color: "#b45309" }}>⚠ 在庫不足</strong>}
                      </div>
                      {linePurchases.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <label>仕入履歴から原価を選択
                            <select defaultValue="" onChange={(e) => selectPurchase(line.id, e.target.value)} style={{ ...inputStyle, marginTop: 5 }}>
                              <option value="">現在の原価を使用</option>
                              {linePurchases.map((purchase) => (
                                <option key={purchase.id} value={purchase.id}>{purchase.purchase_date} / {purchase.supplier || "仕入先未設定"} / {yen(purchase.unit_cost)} / {purchase.quantity}個</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section style={cardStyle}>
            <label>メモ
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="必要なら注文単位のメモを入力" />
            </label>
          </section>

          <section style={{ background: "#111827", color: "#fff", borderRadius: 14, padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <div><div style={summaryLabel}>売上</div><strong style={summaryValue}>{yen(totals.sales)}</strong></div>
              <div><div style={summaryLabel}>原価</div><strong style={summaryValue}>{yen(totals.cost)}</strong></div>
              <div><div style={summaryLabel}>送料</div><strong style={summaryValue}>{yen(totals.shipping)}</strong></div>
              <div><div style={summaryLabel}>粗利</div><strong style={{ ...summaryValue, color: totals.gross >= 0 ? "#86efac" : "#fca5a5" }}>{yen(totals.gross)}</strong></div>
            </div>
            <button disabled={saving} type="submit" style={{ marginTop: 18, width: "100%", border: "none", background: "#fff", color: "#111827", padding: "15px 20px", borderRadius: 10, fontWeight: 900, fontSize: 16 }}>{saving ? "登録中…" : "この注文をまとめて登録する"}</button>
          </section>
        </form>
      </div>

      {scannerOpen && (
        <div style={modalOverlayStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div><h2 style={{ margin: 0 }}>📷 JANコード読み取り</h2><p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>{scannerMessage}</p></div>
              <button type="button" onClick={closeScanner} style={secondaryButtonStyle}>閉じる</button>
            </div>
            <div style={{ marginTop: 14, background: "#000", borderRadius: 12, overflow: "hidden", aspectRatio: "16 / 9" }}>
              <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>商品バーコードを中央に映してください。読み取り成功すると自動でこの明細に入ります。</div>
          </div>
        </div>
      )}
    </main>
  );
}

const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20, marginBottom: 16 };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", marginTop: 6, padding: "11px 12px", border: "1px solid #d1d5db", borderRadius: 9, background: "#fff", color: "#111827", fontSize: 14 };
const addButtonStyle: React.CSSProperties = { border: "none", background: "#15803d", color: "#fff", borderRadius: 9, padding: "10px 14px", fontWeight: 800 };
const scanButtonStyle: React.CSSProperties = { border: "none", background: "#0f766e", color: "#fff", borderRadius: 8, padding: "8px 11px", fontWeight: 800 };
const deleteButtonStyle: React.CSSProperties = { border: "none", background: "#fff1f2", color: "#b42318", borderRadius: 8, padding: "8px 10px", fontWeight: 800 };
const secondaryButtonStyle: React.CSSProperties = { padding: "10px 13px", borderRadius: 9, border: "1px solid #d1d5db", background: "#fff", fontWeight: 800, color: "#111827" };
const summaryLabel: React.CSSProperties = { color: "#9ca3af", fontSize: 13 };
const summaryValue: React.CSSProperties = { display: "block", marginTop: 4, fontSize: 23 };
const modalOverlayStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 };
const modalStyle: React.CSSProperties = { width: "min(760px, 100%)", background: "#fff", borderRadius: 16, padding: 18, boxSizing: "border-box" };
