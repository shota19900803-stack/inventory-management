"use client";

import { useEffect, useMemo, useState } from "react";
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
const checked = (v: string | null | undefined) => v ? new Date(v).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "未取得";

export default function BulkRakutenPricePanel({ products, visible }: { products: Product[]; visible: boolean }) {
  const supabase = supabaseBrowser;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [localPrices, setLocalPrices] = useState<Record<string, number | null>>({});
  const [localCheckedAt, setLocalCheckedAt] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const nextPrices: Record<string, number | null> = {};
    const nextCheckedAt: Record<string, string | null> = {};
    for (const product of products) {
      nextPrices[product.id] = product.rakuten_lowest_price ?? null;
      nextCheckedAt[product.id] = product.rakuten_price_checked_at ?? null;
    }
    setLocalPrices(nextPrices);
    setLocalCheckedAt(nextCheckedAt);
  }, [products]);

  const eligible = useMemo(() => products.filter((p) => {
    const jan = String(p.jan_code || "").replace(/\D/g, "");
    return Number(p.stock_quantity || 0) > 0 && jan.length === 13;
  }), [products]);

  const stockTotal = useMemo(() => products.reduce((sum, p) => sum + Number(p.stock_quantity || 0), 0), [products]);

  const marketTotal = useMemo(() => eligible.reduce((sum, p) => {
    const price = localPrices[p.id];
    return sum + Number(p.stock_quantity || 0) * Number(price || 0);
  }, 0), [eligible, localPrices]);

  if (!visible) return null;

  async function updatePrices() {
    if (running || eligible.length === 0) return;

    setRunning(true);
    setProgress(0);
    setMessage("");
    setHasError(false);
    setErrors([]);

    let done = 0;
    let updated = 0;
    let failed = 0;
    const failedDetails: string[] = [];
    const checkedAt = new Date().toISOString();

    try {
      // 5件ずつ処理。API側も1回最大5JANなので、429対策をしながら順番に取得する。
      for (let i = 0; i < eligible.length; i += 5) {
        const chunk = eligible.slice(i, i + 5);
        const response = await fetch("/api/rakuten-bulk-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jans: chunk.map((p) => p.jan_code) }),
        });

        let data: any;
        try {
          data = await response.json();
        } catch {
          throw new Error(`楽天API応答の解析に失敗しました（${response.status}）`);
        }

        if (!response.ok) {
          throw new Error(data?.error || `楽天相場APIエラー（HTTP ${response.status}）`);
        }

        const byJan = new Map<string, Result>((data?.results || []).map((r: Result) => [r.jan, r]));

        for (const product of chunk) {
          const jan = String(product.jan_code || "").replace(/\D/g, "");
          const result = byJan.get(jan);

          if (!result || result.price == null) {
            failed += 1;
            failedDetails.push(`${product.name}（${jan}）：${result?.error || "新品価格なし"}`);
          } else {
            // select("id")を付けて、DBに実際に1行更新されたことまで確認する。
            const { data: updatedRows, error } = await supabase
              .from("products")
              .update({
                rakuten_lowest_price: result.price,
                rakuten_price_checked_at: checkedAt,
              })
              .eq("id", product.id)
              .select("id");

            if (error) {
              failed += 1;
              failedDetails.push(`${product.name}（${jan}）：DB保存エラー ${error.message}`);
            } else if (!updatedRows || updatedRows.length === 0) {
              failed += 1;
              failedDetails.push(`${product.name}（${jan}）：DB更新対象が0件（権限/RLSの可能性）`);
            } else {
              updated += 1;
              setLocalPrices((prev) => ({ ...prev, [product.id]: result.price }));
              setLocalCheckedAt((prev) => ({ ...prev, [product.id]: checkedAt }));
            }
          }

          done += 1;
          setProgress(done);
        }

        if (i + 5 < eligible.length) await wait(700);
      }

      setErrors(failedDetails);
      setHasError(failed > 0);
      setMessage(`完了：${updated}件保存 / ${failed}件は取得・保存できず`);
    } catch (error: any) {
      setErrors(failedDetails);
      setHasError(true);
      setMessage(`途中で停止：${error?.message || "取得に失敗しました。"}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section
      onClick={(e) => e.stopPropagation()}
      style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 20, marginBottom: 18, boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#dc2626", letterSpacing: 1 }}>📊 在庫相場管理</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 24 }}>楽天市場 新品最安値</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            在庫が1個以上あり、13桁JANが登録されている商品だけを自動取得します。在庫0の商品は対象外です。
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void updatePrices();
          }}
          disabled={running || eligible.length === 0}
          style={{ border: 0, borderRadius: 11, padding: "13px 18px", background: running ? "#9ca3af" : "#111827", color: "#fff", fontWeight: 800, cursor: running ? "default" : "pointer" }}
        >
          {running ? `🔄 更新中 ${progress}/${eligible.length}` : "🔄 在庫商品の相場を一括更新"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 16 }}>
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 13 }}><small>商品数</small><div style={{ fontSize: 22, fontWeight: 800 }}>{products.length}件</div></div>
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 13 }}><small>在庫総数</small><div style={{ fontSize: 22, fontWeight: 800 }}>{stockTotal.toLocaleString()}個</div></div>
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 13 }}><small>今回の対象</small><div style={{ fontSize: 22, fontWeight: 800 }}>{eligible.length}件</div></div>
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 13 }}><small>在庫の楽天相場合計</small><div style={{ fontSize: 22, fontWeight: 800 }}>{yen(marketTotal)}</div></div>
      </div>

      {running && (
        <div style={{ marginTop: 14, height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${eligible.length ? Math.round(progress / eligible.length * 100) : 0}%`, height: "100%", background: "#16a34a", transition: "width .2s" }} />
        </div>
      )}

      {message && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: hasError ? "#fff7ed" : "#f0fdf4", color: hasError ? "#9a3412" : "#166534", fontWeight: 700 }}>
          {message}
        </div>
      )}

      {errors.length > 0 && (
        <details style={{ marginTop: 10, color: "#9a3412" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>取得・保存できなかった商品（{errors.length}件）</summary>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            {errors.slice(0, 20).map((error, index) => <div key={`${error}-${index}`} style={{ padding: "4px 0" }}>{error}</div>)}
            {errors.length > 20 && <div>ほか {errors.length - 20}件</div>}
          </div>
        </details>
      )}

      {eligible.length > 0 && (
        <div style={{ marginTop: 18, overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12 }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {['商品', 'JAN', '在庫', '仕入原価', '楽天新品最安値', '相場在庫額', '最終取得'].map((h) => <th key={h} style={{ padding: 10, textAlign: h === '商品' || h === 'JAN' ? 'left' : 'right', fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {eligible.map((p) => {
                const qty = Number(p.stock_quantity || 0);
                const price = localPrices[p.id] ?? null;
                const checkedAt = localCheckedAt[p.id] ?? null;
                return (
                  <tr key={p.id}>
                    <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>{p.name}</td>
                    <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9', fontFamily: 'monospace' }}>{p.jan_code}</td>
                    <td style={{ padding: 10, textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{qty}</td>
                    <td style={{ padding: 10, textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{yen(p.cost_price)}</td>
                    <td style={{ padding: 10, textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontWeight: 800, color: price ? '#dc2626' : '#9ca3af' }}>{price ? yen(price) : '未取得'}</td>
                    <td style={{ padding: 10, textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>{price ? yen(price * qty) : '—'}</td>
                    <td style={{ padding: 10, textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: '#6b7280', whiteSpace: 'nowrap' }}>{checked(checkedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {eligible.length === 0 && <p style={{ margin: "14px 0 0", color: "#6b7280" }}>現在、相場取得対象の商品はありません。</p>}
    </section>
  );
}
