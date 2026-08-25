import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabaseBrowser } from "../lib/supabase";

type Product = { id: string; name: string; jan_code?: string | null; sku?: string | null; stock_quantity?: number | null; cost_price?: number | null; selling_price?: number | null };
type Purchase = { id: string; product_id: string; purchase_date: string; supplier?: string | null; unit_cost: number; quantity: number; total_cost: number };
type Sale = { id: string; product_id: string; sale_date: string; sales_channel?: string | null; order_number?: string | null; unit_price: number; unit_cost: number; quantity: number; total_sales: number; total_cost: number; gross_profit: number };

function yen(value: number) { return `¥${Number(value || 0).toLocaleString()}`; }

export default function ProductHistoryPage() {
  const supabase = supabaseBrowser;
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("products").select("*").order("name").limit(2000),
      supabase.from("purchase_history").select("*").order("purchase_date", { ascending: false }).limit(5000),
      supabase.from("sales_history").select("*").eq("is_cancelled", false).order("sale_date", { ascending: false }).limit(5000),
    ]).then(([p, h, s]) => {
      if (p.error) setMessage(`商品読み込みエラー：${p.error.message}`); else setProducts((p.data ?? []) as Product[]);
      if (h.error) setMessage(`仕入履歴読み込みエラー：${h.error.message}`); else setPurchases((h.data ?? []) as Purchase[]);
      if (s.error) setMessage(`売上履歴読み込みエラー：${s.error.message}`); else setSales((s.data ?? []) as Sale[]);
    });
  }, []);

  useEffect(() => {
    if (typeof router.query.productId === "string") setProductId(router.query.productId);
  }, [router.query.productId]);

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((item) => [item.name, item.jan_code, item.sku].some((value) => String(value ?? "").toLowerCase().includes(keyword)));
  }, [products, productSearch]);

  const product = products.find((item) => item.id === productId);
  const productPurchases = useMemo(() => purchases.filter((item) => item.product_id === productId), [purchases, productId]);
  const productSales = useMemo(() => sales.filter((item) => item.product_id === productId), [sales, productId]);
  const purchaseTotal = productPurchases.reduce((sum, item) => sum + Number(item.total_cost || 0), 0);
  const salesTotal = productSales.reduce((sum, item) => sum + Number(item.total_sales || 0), 0);
  const grossTotal = productSales.reduce((sum, item) => sum + Number(item.gross_profit || 0), 0);

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", padding: "28px 18px 70px", color: "#111827", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div><div style={{ fontSize: 13, letterSpacing: 2, color: "#6b7280", fontWeight: 800 }}>PRODUCT HISTORY</div><h1 style={{ margin: "4px 0 0", fontSize: 32 }}>📦 商品別の履歴</h1><p style={{ margin: "6px 0 0", color: "#6b7280" }}>同じ商品でも、仕入日・仕入先・仕入価格ごとの履歴を確認できます。</p></div>
          <div style={{ display: "flex", gap: 8 }}><button onClick={() => router.push("/sales-order")} style={buttonStyle}>💰 注文売上</button><button onClick={() => router.push("/")} style={buttonStyle}>← 在庫管理へ</button></div>
        </div>

        {message && <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" }}>{message}</div>}

        <section style={cardStyle}>
          <label>商品を検索
            <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="商品名・JAN・SKUで検索" style={inputStyle} />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>商品を選択
            <select value={productId} onChange={(e) => setProductId(e.target.value)} style={inputStyle}>
              <option value="">商品を選択してください</option>
              {filteredProducts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.jan_code ? ` / JAN ${item.jan_code}` : ""}</option>)}
            </select>
          </label>
          <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>{filteredProducts.length}件の商品から選択</div>
        </section>

        {product && <>
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>{product.name}</h2>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", color: "#4b5563" }}><span>JAN：<strong>{product.jan_code || "—"}</strong></span><span>在庫：<strong>{Number(product.stock_quantity || 0)}個</strong></span><span>現在の参考仕入：<strong>{yen(Number(product.cost_price || 0))}</strong></span><span>参考販売：<strong>{yen(Number(product.selling_price || 0))}</strong></span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 16 }}>
              <div style={statStyle}><span>仕入件数</span><strong>{productPurchases.length}件</strong></div>
              <div style={statStyle}><span>仕入総額</span><strong>{yen(purchaseTotal)}</strong></div>
              <div style={statStyle}><span>売上総額</span><strong>{yen(salesTotal)}</strong></div>
              <div style={statStyle}><span>累計粗利</span><strong style={{ color: grossTotal >= 0 ? "#15803d" : "#b42318" }}>{yen(grossTotal)}</strong></div>
            </div>
          </section>

          <section style={cardStyle}>
            <h2>🛒 仕入履歴</h2>
            {productPurchases.length === 0 ? <p>この商品の仕入履歴はありません。</p> : <div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr><th style={th}>仕入日</th><th style={th}>仕入先</th><th style={thRight}>仕入単価</th><th style={thRight}>数量</th><th style={thRight}>合計</th></tr></thead><tbody>{productPurchases.map((item) => <tr key={item.id}><td style={td}>{item.purchase_date}</td><td style={td}>{item.supplier || "—"}</td><td style={tdRight}>{yen(item.unit_cost)}</td><td style={tdRight}>{item.quantity}</td><td style={tdRight}>{yen(item.total_cost)}</td></tr>)}</tbody></table></div>}
          </section>

          <section style={cardStyle}>
            <h2>💰 売上履歴</h2>
            {productSales.length === 0 ? <p>この商品の売上履歴はありません。</p> : <div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr><th style={th}>売上日</th><th style={th}>販売先</th><th style={th}>注文番号</th><th style={thRight}>売価</th><th style={thRight}>原価</th><th style={thRight}>数量</th><th style={thRight}>粗利</th></tr></thead><tbody>{productSales.map((item) => <tr key={item.id}><td style={td}>{item.sale_date}</td><td style={td}>{item.sales_channel || "—"}</td><td style={td}>{item.order_number || "—"}</td><td style={tdRight}>{yen(item.unit_price)}</td><td style={tdRight}>{yen(item.unit_cost)}</td><td style={tdRight}>{item.quantity}</td><td style={{ ...tdRight, fontWeight: 800 }}>{yen(item.gross_profit)}</td></tr>)}</tbody></table></div>}
          </section>
        </>}
      </div>
    </main>
  );
}

const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20, marginBottom: 16 };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", marginTop: 6, padding: "12px", border: "1px solid #d1d5db", borderRadius: 9, background: "#fff", fontSize: 14 };
const buttonStyle: React.CSSProperties = { padding: "11px 16px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontWeight: 800 };
const statStyle: React.CSSProperties = { background: "#f8fafc", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 5 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { padding: 10, textAlign: "left", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" };
const thRight: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: 10, borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" };
const tdRight: React.CSSProperties = { ...td, textAlign: "right" };
