"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type Product = { id: string; name: string };
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
  shipping_cost?: number | null;
  notes?: string | null;
  is_cancelled: boolean;
};

const money = (v: number) => `¥${Number(v || 0).toLocaleString()}`;
const clean = (v: string) => v.replace(/\s+/g, "").trim();

export default function SalesActionsRpc() {
  const supabase = supabaseBrowser;
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [saving, setSaving] = useState(false);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  useEffect(() => {
    let dead = false;
    let timer: number | undefined;

    const load = async () => {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from("products").select("id,name").limit(2000),
        supabase.from("sales_history").select("*").eq("is_cancelled", false).order("sale_date", { ascending: false }).limit(2000),
      ]);
      if (!dead) {
        setProducts((p || []) as Product[]);
        setSales((s || []) as Sale[]);
      }
    };

    const hideLowStock = () => {
      // 「⚠️ 在庫不足商品」のようにアイコン等が付く場合も拾う。
      const leaves = Array.from(document.querySelectorAll("body *")).filter((el) => {
        if (el.children.length !== 0) return false;
        const text = clean(el.textContent || "");
        return text.includes("在庫不足商品");
      });

      leaves.forEach((leaf) => {
        let node = leaf as HTMLElement | null;
        for (let i = 0; node && i < 12; i += 1) {
          const text = clean(node.textContent || "");
          const rect = node.getBoundingClientRect();
          const cardSize = rect.width >= 220 && rect.width <= 520 && rect.height >= 150;
          const hasWarning = text.includes("在庫不足商品");
          const hasCount = /\d+件/.test(text);

          if (cardSize && hasWarning && hasCount) {
            node.style.display = "none";
            node.dataset.lowStockHidden = "true";
            break;
          }
          node = node.parentElement;
        }
      });
    };

    const enhance = () => {
      hideLowStock();
      const heading = Array.from(document.querySelectorAll("h2,h3")).find((el) => clean(el.textContent || "") === "最近の売上");
      const table = heading?.closest("section")?.querySelector("table");
      if (!table) return;

      const header = table.querySelector("thead tr");
      if (header && !header.querySelector("[data-sale-action-header]")) {
        const th = document.createElement("th");
        th.textContent = "操作";
        th.dataset.saleActionHeader = "true";
        header.appendChild(th);
      }

      table.querySelectorAll("tbody tr").forEach((row) => {
        const tr = row as HTMLTableRowElement;
        if (tr.dataset.saleActionRow === "true") return;
        const cells = Array.from(tr.cells);
        if (cells.length < 7) return;

        const date = (cells[0].textContent || "").replace(/\s/g, "");
        const productName = clean(cells[1].textContent || "");
        const channel = clean(cells[2].textContent || "").replace(/—/g, "");
        const quantity = Number((cells[3].textContent || "").replace(/[^0-9-]/g, ""));
        const totalSales = Number((cells[4].textContent || "").replace(/[^0-9-]/g, ""));

        const sale = sales.find((s) =>
          !s.is_cancelled &&
          s.sale_date === date &&
          clean(productMap.get(s.product_id) || "") === productName &&
          clean(s.sales_channel || "").replace(/—/g, "") === channel &&
          Number(s.quantity) === quantity &&
          Number(s.total_sales) === totalSales
        );
        if (!sale) return;

        const cell = tr.insertCell(-1);
        cell.style.whiteSpace = "nowrap";
        cell.style.padding = "10px";
        cell.style.textAlign = "center";

        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "編集";
        edit.style.cssText = "border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:7px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer;margin-right:6px";
        edit.onclick = () => setEditing(sale);

        const del = document.createElement("button");
        del.type = "button";
        del.textContent = "削除";
        del.style.cssText = "border:1px solid #fecaca;background:#fff5f5;color:#b91c1c;border-radius:7px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer";
        del.onclick = async () => {
          if (!window.confirm("この売上を削除しますか？\n\n削除すると在庫を元に戻し、帳簿・月次集計からも消えます。")) return;
          setSaving(true);
          const { data, error } = await supabase.rpc("cancel_sale", { p_sale_id: sale.id });
          setSaving(false);
          if (error || data?.success === false) {
            window.alert(`削除できませんでした。\n${error?.message || data?.message || "エラー"}`);
            return;
          }
          window.location.reload();
        };

        cell.append(edit, del);
        tr.dataset.saleActionRow = "true";
      });
    };

    load();
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    timer = window.setInterval(enhance, 1200);

    return () => {
      dead = true;
      observer.disconnect();
      if (timer) window.clearInterval(timer);
    };
  }, [supabase, sales, productMap]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      p_sale_id: editing.id,
      p_product_id: String(form.get("product_id") || editing.product_id),
      p_sale_date: String(form.get("sale_date") || editing.sale_date),
      p_sales_channel: String(form.get("sales_channel") || ""),
      p_order_number: String(form.get("order_number") || ""),
      p_unit_price: Number(form.get("unit_price") || 0),
      p_unit_cost: Number(form.get("unit_cost") || 0),
      p_quantity: Number(form.get("quantity") || 0),
      p_shipping_cost: Number(form.get("shipping_cost") || 0),
      p_notes: String(form.get("notes") || ""),
    };
    if (payload.p_quantity <= 0) return window.alert("数量は1以上で入力してください。");
    setSaving(true);
    const { data, error } = await supabase.rpc("update_sale_history", payload);
    setSaving(false);
    if (error || data?.success === false) {
      window.alert(`更新できませんでした。\n${error?.message || data?.message || "エラー"}`);
      return;
    }
    setEditing(null);
    window.location.reload();
  };

  if (!editing) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(17,24,39,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <form onSubmit={save} style={{ width: "min(720px,100%)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 18, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div><div style={{ fontSize: 13, color: "#6b7280", fontWeight: 700 }}>売上データ編集</div><h2 style={{ margin: "4px 0 0" }}>{productMap.get(editing.product_id) || "商品"}</h2></div>
          <button type="button" onClick={() => setEditing(null)} style={{ border: 0, background: "#f3f4f6", borderRadius: 9, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>閉じる</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label>売上日<input name="sale_date" type="date" defaultValue={editing.sale_date} required style={inputStyle} /></label>
          <label>商品<select name="product_id" defaultValue={editing.product_id} style={inputStyle}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>販売先<input name="sales_channel" defaultValue={editing.sales_channel || ""} style={inputStyle} /></label>
          <label>注文番号<input name="order_number" defaultValue={editing.order_number || ""} style={inputStyle} /></label>
          <label>販売単価<input name="unit_price" type="number" min="0" defaultValue={editing.unit_price} style={inputStyle} /></label>
          <label>仕入単価<input name="unit_cost" type="number" min="0" defaultValue={editing.unit_cost} style={inputStyle} /></label>
          <label>数量<input name="quantity" type="number" min="1" defaultValue={editing.quantity} style={inputStyle} /></label>
          <label>送料<input name="shipping_cost" type="number" min="0" defaultValue={editing.shipping_cost || 0} style={inputStyle} /></label>
          <label style={{ gridColumn: "1 / -1" }}>メモ<textarea name="notes" defaultValue={editing.notes || ""} rows={3} style={inputStyle} /></label>
        </div>
        <p style={{ background: "#f9fafb", borderRadius: 10, padding: 12, fontSize: 13, color: "#4b5563" }}>保存時に在庫を含めて既存の売上更新処理を実行します。売上・原価・送料・粗利も再計算されます。</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={() => setEditing(null)} style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 9, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>キャンセル</button>
          <button type="submit" disabled={saving} style={{ border: 0, background: "#111827", color: "#fff", borderRadius: 9, padding: "10px 18px", fontWeight: 800, cursor: "pointer" }}>{saving ? "保存中…" : "変更を保存"}</button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
  padding: "10px 11px",
  border: "1px solid #d1d5db",
  borderRadius: 9,
  background: "#fff",
};
