import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type Product = {
  id: string;
  name: string;
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
  shipping_cost?: number;
  notes?: string | null;
  is_cancelled: boolean;
};

type Mode = "purchase" | "sale" | null;

const money = (value: number) => `¥${Number(value || 0).toLocaleString()}`;

const parseMoney = (value: string) => Number(value.replace(/[^0-9.-]/g, "")) || 0;

export default function HistoryEditor() {
  const supabase = supabaseBrowser;
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products]
  );

  async function loadData() {
    const [productsResult, purchasesResult, salesResult] = await Promise.all([
      supabase.from("products").select("id,name").order("name").limit(2000),
      supabase.from("purchase_history").select("*").order("purchase_date", { ascending: false }).limit(2000),
      supabase.from("sales_history").select("*").order("sale_date", { ascending: false }).limit(2000),
    ]);

    if (!productsResult.error) setProducts((productsResult.data || []) as Product[]);
    if (!purchasesResult.error) setPurchases((purchasesResult.data || []) as Purchase[]);
    if (!salesResult.error) setSales((salesResult.data || []) as Sale[]);
  }

  useEffect(() => {
    loadData();
  }, []);

  function buttonStyle(kind: "edit" | "delete") {
    return {
      border: kind === "delete" ? "1px solid #fecaca" : "1px solid #d1d5db",
      background: kind === "delete" ? "#fff5f5" : "#fff",
      color: kind === "delete" ? "#b91c1c" : "#374151",
      borderRadius: 7,
      padding: "5px 9px",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
    };
  }

  function findPurchaseFromRow(row: HTMLTableRowElement) {
    const cells = Array.from(row.cells).map((cell) => cell.textContent?.trim() || "");
    if (cells.length < 6) return null;

    const date = cells[0];
    const productName = cells[1];
    const supplier = cells[2] === "—" ? "" : cells[2];
    const unitCost = parseMoney(cells[3]);
    const quantity = Number(cells[4].replace(/[^0-9-]/g, ""));
    const total = parseMoney(cells[5]);

    return purchases.find((purchase) =>
      purchase.purchase_date === date &&
      (productMap.get(purchase.product_id) || "商品不明") === productName &&
      (purchase.supplier || "") === supplier &&
      Number(purchase.unit_cost) === unitCost &&
      Number(purchase.quantity) === quantity &&
      Number(purchase.total_cost) === total
    ) || null;
  }

  function findSaleFromRow(row: HTMLTableRowElement) {
    const cells = Array.from(row.cells).map((cell) => cell.textContent?.trim() || "");
    if (cells.length < 6) return null;

    const date = cells[0];
    const productName = cells[1];
    const channel = cells[2] === "—" ? "" : cells[2];
    const quantity = Number(cells[3].replace(/[^0-9-]/g, ""));
    const total = parseMoney(cells[4]);
    const gross = parseMoney(cells[5]);

    return sales.find((sale) =>
      !sale.is_cancelled &&
      sale.sale_date === date &&
      (productMap.get(sale.product_id) || "商品不明") === productName &&
      (sale.sales_channel || "") === channel &&
      Number(sale.quantity) === quantity &&
      Number(sale.total_sales) === total &&
      Number(sale.gross_profit) === gross
    ) || null;
  }

  function addButton(row: HTMLTableRowElement, label: string, onClick: () => void, kind: "edit" | "delete") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    Object.assign(button.style, buttonStyle(kind));
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    };
    return button;
  }

  useEffect(() => {
    const enhanceTables = () => {
      const sections = Array.from(document.querySelectorAll("main section"));

      sections.forEach((section) => {
        const title = section.querySelector("h2")?.textContent?.trim() || "";
        const table = section.querySelector("table");
        if (!table) return;

        if (title === "最近の仕入") {
          table.querySelectorAll("tbody tr").forEach((row) => {
            const tr = row as HTMLTableRowElement;
            if (tr.dataset.historyActions === "purchase") return;
            const purchase = findPurchaseFromRow(tr);
            if (!purchase) return;

            const cell = tr.insertCell(-1);
            cell.style.padding = "10px";
            cell.style.textAlign = "center";
            cell.style.whiteSpace = "nowrap";

            const wrap = document.createElement("div");
            Object.assign(wrap.style, { display: "flex", gap: "6px", justifyContent: "center" });
            wrap.appendChild(addButton(tr, "編集", () => {
              setError("");
              setEditingPurchase(purchase);
              setEditingSale(null);
              setMode("purchase");
            }, "edit"));
            wrap.appendChild(addButton(tr, "削除", () => deletePurchase(purchase), "delete"));
            cell.appendChild(wrap);
            tr.dataset.historyActions = "purchase";
          });
        }

        if (title === "最近の売上") {
          table.querySelectorAll("tbody tr").forEach((row) => {
            const tr = row as HTMLTableRowElement;
            if (tr.dataset.historyActions === "sale") return;
            const sale = findSaleFromRow(tr);
            if (!sale) return;

            const cell = tr.insertCell(-1);
            cell.style.padding = "10px";
            cell.style.textAlign = "center";
            cell.style.whiteSpace = "nowrap";

            const wrap = document.createElement("div");
            Object.assign(wrap.style, { display: "flex", gap: "6px", justifyContent: "center" });
            wrap.appendChild(addButton(tr, "編集", () => {
              setError("");
              setEditingSale(sale);
              setEditingPurchase(null);
              setMode("sale");
            }, "edit"));
            wrap.appendChild(addButton(tr, "取消", () => cancelSale(sale), "delete"));
            cell.appendChild(wrap);
            tr.dataset.historyActions = "sale";
          });
        }
      });
    };

    enhanceTables();
    const observer = new MutationObserver(enhanceTables);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(enhanceTables, 1200);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [purchases, sales, productMap]);

  async function deletePurchase(purchase: Purchase) {
    if (!window.confirm(`この仕入を削除しますか？\n\n${productMap.get(purchase.product_id) || "商品不明"}\n${purchase.purchase_date} / ${money(purchase.total_cost)} / ${purchase.quantity}個\n\n削除すると在庫数も元に戻します。`)) return;

    setError("");
    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc("delete_purchase_history", {
      p_purchase_id: purchase.id,
    });

    if (rpcError || data?.success === false) {
      setError(`仕入削除エラー：${rpcError?.message || data?.message || "削除できませんでした。"}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    await loadData();
    window.location.reload();
  }

  async function cancelSale(sale: Sale) {
    if (!window.confirm(`この売上を取消しますか？\n\n${productMap.get(sale.product_id) || "商品不明"}\n${sale.sale_date} / ${money(sale.total_sales)} / ${sale.quantity}個\n\n取消すると在庫が元に戻ります。`)) return;

    setError("");
    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc("cancel_sale", {
      p_sale_id: sale.id,
    });

    if (rpcError || data?.success === false) {
      setError(`売上取消エラー：${rpcError?.message || data?.message || "取消できませんでした。"}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    await loadData();
    window.location.reload();
  }

  async function updatePurchase(event: React.FormEvent) {
    event.preventDefault();
    if (!editingPurchase) return;
    setError("");
    setSaving(true);

    const form = new FormData(event.currentTarget as HTMLFormElement);
    const payload = {
      p_purchase_id: editingPurchase.id,
      p_product_id: String(form.get("product_id") || ""),
      p_purchase_date: String(form.get("purchase_date") || ""),
      p_supplier: String(form.get("supplier") || ""),
      p_unit_cost: Number(form.get("unit_cost") || 0),
      p_quantity: Number(form.get("quantity") || 0),
      p_notes: String(form.get("notes") || ""),
    };

    const { data, error: rpcError } = await supabase.rpc("update_purchase_history", payload);
    if (rpcError || data?.success === false) {
      setError(`仕入更新エラー：${rpcError?.message || data?.message || "更新できませんでした。"}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    setMode(null);
    setEditingPurchase(null);
    await loadData();
    window.location.reload();
  }

  async function updateSale(event: React.FormEvent) {
    event.preventDefault();
    if (!editingSale) return;
    setError("");
    setSaving(true);

    const form = new FormData(event.currentTarget as HTMLFormElement);
    const payload = {
      p_sale_id: editingSale.id,
      p_product_id: String(form.get("product_id") || ""),
      p_sale_date: String(form.get("sale_date") || ""),
      p_sales_channel: String(form.get("sales_channel") || ""),
      p_order_number: String(form.get("order_number") || ""),
      p_unit_price: Number(form.get("unit_price") || 0),
      p_unit_cost: Number(form.get("unit_cost") || 0),
      p_quantity: Number(form.get("quantity") || 0),
      p_shipping_cost: Number(form.get("shipping_cost") || 0),
      p_notes: String(form.get("notes") || ""),
    };

    const { data, error: rpcError } = await supabase.rpc("update_sale_history", payload);
    if (rpcError || data?.success === false) {
      setError(`売上更新エラー：${rpcError?.message || data?.message || "更新できませんでした。"}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    setMode(null);
    setEditingSale(null);
    await loadData();
    window.location.reload();
  }

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(17,24,39,.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  };

  const modalStyle: React.CSSProperties = {
    width: "min(760px, 100%)",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 9,
    fontSize: 15,
    background: "#fff",
  };

  if (!mode) return null;

  return (
    <div style={overlayStyle} onMouseDown={() => !saving && setMode(null)}>
      <div style={modalStyle} onMouseDown={(event) => event.stopPropagation()}>
        {mode === "purchase" && editingPurchase && (
          <form onSubmit={updatePurchase}>
            <h2 style={{ marginTop: 0 }}>仕入を編集</h2>
            <p style={{ color: "#6b7280" }}>間違えた仕入情報を修正できます。在庫数も自動で調整します。</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
              <label>商品<select name="product_id" defaultValue={editingPurchase.product_id} style={inputStyle}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label>仕入日<input name="purchase_date" type="date" defaultValue={editingPurchase.purchase_date} style={inputStyle} /></label>
              <label>仕入先<input name="supplier" defaultValue={editingPurchase.supplier || ""} style={inputStyle} /></label>
              <label>仕入単価<input name="unit_cost" type="number" min="0" defaultValue={editingPurchase.unit_cost} style={inputStyle} /></label>
              <label>数量<input name="quantity" type="number" min="1" defaultValue={editingPurchase.quantity} style={inputStyle} /></label>
              <label>メモ<input name="notes" defaultValue={editingPurchase.notes || ""} style={inputStyle} /></label>
            </div>
            <div style={{ marginTop: 16, fontWeight: 800, fontSize: 18 }}>
              仕入合計 {money(Number(editingPurchase.unit_cost) * Number(editingPurchase.quantity))}
            </div>
            {error && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: "#fff5f5", color: "#b91c1c", fontWeight: 700 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button type="submit" disabled={saving} style={{ border: 0, background: "#111827", color: "#fff", padding: "12px 20px", borderRadius: 9, fontWeight: 800 }}>{saving ? "更新中…" : "仕入を更新する"}</button>
              <button type="button" disabled={saving} onClick={() => setMode(null)} style={{ padding: "12px 20px", borderRadius: 9, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}>キャンセル</button>
            </div>
          </form>
        )}

        {mode === "sale" && editingSale && (
          <form onSubmit={updateSale}>
            <h2 style={{ marginTop: 0 }}>売上を編集</h2>
            <p style={{ color: "#6b7280" }}>間違えた売上情報を修正できます。在庫・粗利も自動で再計算します。</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
              <label>商品<select name="product_id" defaultValue={editingSale.product_id} style={inputStyle}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label>売上日<input name="sale_date" type="date" defaultValue={editingSale.sale_date} style={inputStyle} /></label>
              <label>販売先<select name="sales_channel" defaultValue={editingSale.sales_channel || "楽天市場"} style={inputStyle}><option>楽天市場</option><option>Amazon</option><option>Yahoo!ショッピング</option><option>メルカリ</option><option>店頭販売</option><option>その他</option></select></label>
              <label>注文番号<input name="order_number" defaultValue={editingSale.order_number || ""} style={inputStyle} /></label>
              <label>販売単価<input name="unit_price" type="number" min="0" defaultValue={editingSale.unit_price} style={inputStyle} /></label>
              <label>原価<input name="unit_cost" type="number" min="0" defaultValue={editingSale.unit_cost} style={inputStyle} /></label>
              <label>数量<input name="quantity" type="number" min="1" defaultValue={editingSale.quantity} style={inputStyle} /></label>
              <label>送料<input name="shipping_cost" type="number" min="0" defaultValue={editingSale.shipping_cost || 0} style={inputStyle} /></label>
              <label>メモ<input name="notes" defaultValue={editingSale.notes || ""} style={inputStyle} /></label>
            </div>
            <div style={{ display: "flex", gap: 30, flexWrap: "wrap", marginTop: 16, fontSize: 18 }}>
              <strong>売上 {money(Number(editingSale.unit_price) * Number(editingSale.quantity))}</strong>
              <strong style={{ color: "#15803d" }}>粗利 {money((Number(editingSale.unit_price) - Number(editingSale.unit_cost)) * Number(editingSale.quantity) - Number(editingSale.shipping_cost || 0))}</strong>
            </div>
            {error && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: "#fff5f5", color: "#b91c1c", fontWeight: 700 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button type="submit" disabled={saving} style={{ border: 0, background: "#111827", color: "#fff", padding: "12px 20px", borderRadius: 9, fontWeight: 800 }}>{saving ? "更新中…" : "売上を更新する"}</button>
              <button type="button" disabled={saving} onClick={() => setMode(null)} style={{ padding: "12px 20px", borderRadius: 9, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}>キャンセル</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
