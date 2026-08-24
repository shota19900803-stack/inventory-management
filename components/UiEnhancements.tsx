"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type SaleRow = {
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
  is_cancelled?: boolean;
};

type ProductRow = { id: string; name: string };

type EditState = {
  sale: SaleRow;
  productName: string;
};

function money(value: number) {
  return `¥${Number(value || 0).toLocaleString()}`;
}

function dateText(value: string) {
  return value?.slice(0, 10) ?? "";
}

function normalize(value: string) {
  return value.replace(/\s+/g, "").replace(/,/g, "").trim();
}

function hideLowStockCard() {
  const leaves = Array.from(document.querySelectorAll("body *")).filter(
    (element) =>
      element.children.length === 0 &&
      (element.textContent || "").trim() === "在庫不足商品"
  );

  for (const leaf of leaves) {
    let current: HTMLElement | null = leaf as HTMLElement;

    for (let depth = 0; current && depth < 10; depth += 1) {
      const text = current.textContent || "";
      const rect = current.getBoundingClientRect();

      if (
        text.includes("在庫管理") &&
        text.includes("在庫不足商品") &&
        rect.width >= 220 &&
        rect.height >= 150
      ) {
        current.style.display = "none";
        current.setAttribute("data-low-stock-hidden", "true");
        break;
      }

      current = current.parentElement;
    }
  }
}

export default function UiEnhancements() {
  const supabase = supabaseBrowser;
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const enhance = async () => {
      if (disposed) return;

      hideLowStockCard();

      const heading = Array.from(document.querySelectorAll("h1,h2,h3,h4"))
        .find((element) => (element.textContent || "").includes("最近の売上"));

      if (!heading) {
        timer = setTimeout(enhance, 500);
        return;
      }

      const section = heading.closest("section") || heading.parentElement;
      const table = section?.querySelector("table");

      if (!table) {
        timer = setTimeout(enhance, 500);
        return;
      }

      if (!table.querySelector("[data-sales-actions-header]")) {
        const headerRow = table.querySelector("thead tr");
        if (headerRow) {
          const th = document.createElement("th");
          th.textContent = "操作";
          th.setAttribute("data-sales-actions-header", "true");
          th.style.whiteSpace = "nowrap";
          headerRow.appendChild(th);
        }
      }

      const rows = Array.from(table.querySelectorAll("tbody tr"));
      if (!rows.length) {
        timer = setTimeout(enhance, 700);
        return;
      }

      const [{ data: sales }, { data: products }] = await Promise.all([
        supabase
          .from("sales_history")
          .select("*")
          .eq("is_cancelled", false)
          .order("sale_date", { ascending: false })
          .limit(2000),
        supabase.from("products").select("id,name").limit(2000),
      ]);

      if (disposed) return;

      const saleRows = (sales ?? []) as SaleRow[];
      const productRows = (products ?? []) as ProductRow[];
      const productMap = new Map(productRows.map((product) => [product.id, product.name]));
      const used = new Set<string>();

      rows.forEach((row) => {
        if (row.querySelector("[data-sales-actions]")) return;

        const cells = Array.from(row.querySelectorAll("td"));
        const rowText = normalize(row.textContent || "");
        const rowDate = (cells[0]?.textContent || "").replace(/\s/g, "");
        const rowSales = normalize(cells.find((cell) => /¥[0-9,]+/.test(cell.textContent || ""))?.textContent || "");

        const sale = saleRows.find((candidate) => {
          if (used.has(candidate.id)) return false;
          const productName = productMap.get(candidate.product_id) || "";
          const dateMatch = rowDate.includes(dateText(candidate.sale_date));
          const productMatch = productName ? rowText.includes(normalize(productName)) : false;
          const salesMatch = rowSales.includes(String(Math.round(candidate.total_sales || 0)));
          return dateMatch && productMatch && salesMatch;
        });

        if (!sale) return;
        used.add(sale.id);

        const td = document.createElement("td");
        td.setAttribute("data-sales-actions", sale.id);
        td.style.whiteSpace = "nowrap";
        td.style.padding = "10px 8px";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "編集";
        editButton.style.cssText = "border:0;border-radius:8px;padding:7px 10px;background:#111827;color:#fff;font-weight:700;cursor:pointer;margin-right:6px;";
        editButton.onclick = () => {
          setEditState({ sale, productName: productMap.get(sale.product_id) || "" });
        };

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "削除";
        deleteButton.style.cssText = "border:1px solid #ef4444;border-radius:8px;padding:7px 10px;background:#fff;color:#dc2626;font-weight:700;cursor:pointer;";
        deleteButton.onclick = async () => {
          if (!window.confirm("この売上データを削除しますか？\n\n削除すると帳簿・月次集計からも消えます。")) return;

          const { error } = await supabase
            .from("sales_history")
            .delete()
            .eq("id", sale.id);

          if (error) {
            window.alert(`削除できませんでした。\n${error.message}`);
            return;
          }

          window.location.reload();
        };

        td.append(editButton, deleteButton);
        row.appendChild(td);
      });

      hideLowStockCard();
      timer = setTimeout(enhance, 1200);
    };

    enhance();

    const observer = new MutationObserver(() => {
      hideLowStockCard();
      if (!timer) enhance();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [supabase]);

  const closeEditor = () => setEditState(null);

  const saveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editState) return;

    const form = new FormData(event.currentTarget);
    const sale = editState.sale;
    const saleDate = String(form.get("sale_date") || sale.sale_date).slice(0, 10);
    const salesChannel = String(form.get("sales_channel") || "").trim();
    const orderNumber = String(form.get("order_number") || "").trim();
    const unitPrice = Number(form.get("unit_price") || 0);
    const unitCost = Number(form.get("unit_cost") || 0);
    const quantity = Number(form.get("quantity") || 0);
    const shippingCost = Number(form.get("shipping_cost") || 0);
    const notes = String(form.get("notes") || "").trim();

    if (quantity <= 0 || unitPrice < 0 || unitCost < 0 || shippingCost < 0) {
      window.alert("数量・金額を正しく入力してください。");
      return;
    }

    const totalSales = unitPrice * quantity;
    const totalCost = unitCost * quantity;
    const grossProfit = totalSales - totalCost - shippingCost;

    setSaving(true);

    const { error } = await supabase
      .from("sales_history")
      .update({
        sale_date: saleDate,
        sales_channel: salesChannel,
        order_number: orderNumber || null,
        unit_price: unitPrice,
        unit_cost: unitCost,
        quantity,
        total_sales: totalSales,
        total_cost: totalCost,
        gross_profit: grossProfit,
        shipping_cost: shippingCost,
        notes: notes || null,
      })
      .eq("id", sale.id);

    setSaving(false);

    if (error) {
      window.alert(`更新できませんでした。\n${error.message}`);
      return;
    }

    closeEditor();
    window.location.reload();
  };

  if (!editState) return null;

  const sale = editState.sale;
  const shippingCost = Number(sale.shipping_cost || 0);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={saveEdit} style={{ width: "min(620px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 18, padding: 24, boxShadow: "0 24px 80px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 700 }}>売上データ編集</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 22 }}>{editState.productName || "商品"}</h2>
          </div>
          <button type="button" onClick={closeEditor} style={{ border: 0, background: "#f3f4f6", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontWeight: 700 }}>閉じる</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>売上日<input name="sale_date" type="date" defaultValue={dateText(sale.sale_date)} required style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 9 }} /></label>
          <label style={{ display: "grid", gap: 6 }}>販売先<input name="sales_channel" defaultValue={sale.sales_channel || ""} style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 9 }} /></label>
          <label style={{ display: "grid", gap: 6 }}>注文番号<input name="order_number" defaultValue={sale.order_number || ""} style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 9 }} /></label>
          <label style={{ display: "grid", gap: 6 }}>数量<input name="quantity" type="number" min="1" step="1" defaultValue={sale.quantity} required style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 9 }} /></label>
          <label style={{ display: "grid", gap: 6 }}>販売単価<input name="unit_price" type="number" min="0" step="1" defaultValue={sale.unit_price} required style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 9 }} /></label>
          <label style={{ display: "grid", gap: 6 }}>仕入単価<input name="unit_cost" type="number" min="0" step="1" defaultValue={sale.unit_cost} required style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 9 }} /></label>
          <label style={{ display: "grid", gap: 6 }}>送料<input name="shipping_cost" type="number" min="0" step="1" defaultValue={shippingCost} style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 9 }} /></label>
          <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>メモ<textarea name="notes" defaultValue={sale.notes || ""} rows={3} style={{ padding: 10, border: "1px solid #d1d5db", borderRadius: 9, resize: "vertical" }} /></label>
        </div>

        <div style={{ marginTop: 18, padding: 14, background: "#f9fafb", borderRadius: 10, color: "#374151", fontWeight: 700 }}>
          売上 {money(sale.total_sales)} → 編集後は「単価 × 数量」で再計算<br />
          粗利も「売上 − 原価 − 送料」で自動再計算します。
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" onClick={closeEditor} style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 10, padding: "11px 18px", cursor: "pointer", fontWeight: 700 }}>キャンセル</button>
          <button type="submit" disabled={saving} style={{ border: 0, background: "#111827", color: "#fff", borderRadius: 10, padding: "11px 20px", cursor: "pointer", fontWeight: 800 }}>{saving ? "保存中…" : "変更を保存"}</button>
        </div>
      </form>
    </div>
  );
}
