"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type Product = {
  id: string;
  name: string;
  jan_code?: string | null;
  stock_quantity?: number | null;
  cost_price?: number | null;
  rakuten_lowest_price?: number | null;
  rakuten_price_checked_at?: string | null;
};

type Result = {
  jan: string;
  price: number | null;
  error?: string | null;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const yen = (n: number | null | undefined) => n == null ? "—" : `¥${Math.round(n).toLocaleString()}`;

export default function BulkRakutenPricePanel({ products, visible }: { products: Product[]; visible: boolean }) {
  const supabase = supabaseBrowser;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [updatedCount, setUpdatedCount] = useState(0);

  const eligible = useMemo(() => products.filter((p) => {
    const jan = String(p.jan_code || "").replace(/\D/g, "");
    return Number(p.stock_quantity || 0) > 0 && jan.length === 13;
  }), [products]);

  const stockTotal = useMemo(() => products.reduce((sum, p) => sum + Number(p.stock_quantity || 0), 0), [products]);

  if (!visible) return null;

  async function updatePrices() {
    if (running || eligible.length === 0) return;
    setRunning(true);
    setProgress(0);
    setUpdatedCount(0);
    setMessage("");

    let done = 0;
    let updated = 0;
    let failed = 0;
    const checkedAt = new Date().toISOString();

    try {
      // 5件ずつ処理。各APIリクエスト内でも500ms間隔を入れる。
      for (let i = 0; i < eligible.length; i += 5) {
        const chunk = eligible.slice(i, i + 5);
        const response = await fetch("/api/rakuten-bulk-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jans: chunk.map((p) => p.jan_code) }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "楽天相場の取得に失敗しました。");

        const byJan = new Map<string, Result>((data?.results || []).map((r: Result) => [r.jan, r]));
        for (const product of chunk) {
          const jan = String(product.jan_code || "").replace(/\D/g, "");
          const result = byJan.get(jan);
          if (!result || result.price == null) {
            failed += 1;
          } else {
            const { error } = await supabase.from("products").update({
              rakuten_lowest_price: result.price,
              rakuten_price_checked_at: checkedAt,
            }).eq("id", product.id);
            if (error) failed += 1;
            else updated += 1;
          }
          done += 1;
          setProgress(done);
          setUpdatedCount(updated);
        }

        if (i + 5 < eligible.length) await wait(700);
      }

      setMessage(`完了：${updated}件更新 / ${failed}件は価格取得できず`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error: any) {
      setMessage(`途中で停止：${error?.message || "取得に失敗しました。"}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 20, marginBottom: 18, boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#dc2626", letterSpacing: 1 }}>📊 在庫相場管理</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 24 }}>楽天市場 新品最安値</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            在庫が1個以上あり、13桁JANが登録されている商品だけを自動取得します。
          </p>
        </div>
        <button type="button" onClick={updatePrices} disabled={running || eligible.length === 0}
          style={{ border: 0, borderRadius: 11, padding: "13px 18px", background: running ? "#9ca3af" : "#111827", color: "#fff", fontWeight: 800, cursor: running ? "default" : "pointer" }}>
          {running ? `🔄 更新中 ${progress}/${eligible.length}` : "🔄 在庫商品の相場を一括更新"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 16 }}>
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 13 }}><small>商品数</small><div style={{ fontSize: 22, fontWeight: 800 }}>{products.length}件</div></div>
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 13 }}><small>在庫総数</small><div style={{ fontSize: 22, fontWeight: 800 }}>{stockTotal.toLocaleString()}個</div></div>
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 13 }}><small>今回の対象</small><div style={{ fontSize: 22, fontWeight: 800 }}>{eligible.length}件</div></div>
      </div>

      {running && <div style={{ marginTop: 14, height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${eligible.length ? Math.round(progress / eligible.length * 100) : 0}%`, height: "100%", background: "#16a34a", transition: "width .2s" }} /></div>}
      {message && <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#f0fdf4", color: "#166534", fontWeight: 700 }}>{message}</div>}

      {eligible.length === 0 && <p style={{ margin: "14px 0 0", color: "#6b7280" }}>現在、相場取得対象の商品はありません。</p>}
    </section>
  );
}
