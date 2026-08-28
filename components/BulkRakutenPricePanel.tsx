"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { supabaseBrowser } from "../lib/supabase";

type Product = {
  id: string;
  name: string;
  jan_code?: string | null;
  sku?: string | null;
  model_number?: string | null;
  brand?: string | null;
  stock_quantity?: number | null;
  cost_price?: number | null;
  rakuten_lowest_price?: number | null;
  rakuten_price_checked_at?: string | null;
};

type Result = {
  jan: string;
  price: number | null;
  productName?: string | null;
  itemUrl?: string | null;
  shopName?: string | null;
  error?: string | null;
};

type Slot = { productId: string; keyword: string; jan: string };

const yen = (n: number | null | undefined) => n == null ? "—" : `¥${Math.round(n).toLocaleString()}`;
const checked = (v: string | null | undefined) => v ? new Date(v).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "未取得";
const cleanJan = (value: string) => value.replace(/\D/g, "").slice(0, 13);
const emptySlot = (): Slot => ({ productId: "", keyword: "", jan: "" });

export default function BulkRakutenPricePanel({ products, visible }: { products: Product[]; visible: boolean }) {
  const supabase = supabaseBrowser;
  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: 5 }, emptySlot));
  const [localPrices, setLocalPrices] = useState<Record<string, number | null>>({});
  const [localCheckedAt, setLocalCheckedAt] = useState<Record<string, string | null>>({});
  const [running, setRunning] = useState(false);
  const [runningSlot, setRunningSlot] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [activeSuggestions, setActiveSuggestions] = useState<number | null>(null);
  const [scanningSlot, setScanningSlot] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const prices: Record<string, number | null> = {};
    const times: Record<string, string | null> = {};
    for (const product of products) {
      prices[product.id] = product.rakuten_lowest_price ?? null;
      times[product.id] = product.rakuten_price_checked_at ?? null;
    }
    setLocalPrices(prices);
    setLocalCheckedAt(times);
  }, [products]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const selectedProducts = slots.map((slot) => slot.productId ? productMap.get(slot.productId) ?? null : null);
  const selectedCount = selectedProducts.filter(Boolean).length;

  const setSlot = (index: number, patch: Partial<Slot>) => {
    setSlots((prev) => prev.map((slot, i) => i === index ? { ...slot, ...patch } : slot));
  };

  const selectProduct = (index: number, product: Product) => {
    setSlot(index, { productId: product.id, keyword: product.name, jan: String(product.jan_code ?? "") });
    setActiveSuggestions(null);
  };

  const clearSlot = (index: number) => {
    setSlot(index, emptySlot());
    setActiveSuggestions(null);
  };

  const suggestionsFor = (index: number) => {
    const keyword = slots[index].keyword.trim().toLowerCase();
    if (!keyword) return [];
    return products.filter((product) => [product.name, product.jan_code, product.sku, product.model_number, product.brand].some((value) => String(value ?? "").toLowerCase().includes(keyword))).slice(0, 8);
  };

  const searchByJan = (index: number) => {
    const jan = cleanJan(slots[index].jan);
    setSlot(index, { jan });
    if (jan.length !== 13) {
      setMessage("JANコードは13桁で入力してください。");
      setHasError(true);
      return;
    }
    const found = products.find((product) => cleanJan(String(product.jan_code ?? "")) === jan);
    if (!found) {
      setMessage(`JAN ${jan} の商品が商品管理に見つかりません。`);
      setHasError(true);
      return;
    }
    selectProduct(index, found);
    setMessage(`商品を選択しました：${found.name}`);
    setHasError(false);
  };

  useEffect(() => {
    if (scanningSlot === null) return;
    let cancelled = false;

    const start = async () => {
      try {
        if (!videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        scannerRef.current = reader;
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoRef.current, (result) => {
          if (cancelled || !result) return;
          const jan = cleanJan(result.getText());
          if (jan.length !== 13) return;
          const found = products.find((product) => cleanJan(String(product.jan_code ?? "")) === jan);
          if (found) {
            selectProduct(scanningSlot, found);
            setMessage(`JAN読込成功：${jan} → ${found.name}`);
            setHasError(false);
            controls.stop();
            controlsRef.current = null;
            scannerRef.current = null;
            setScanningSlot(null);
          } else {
            setMessage(`JAN ${jan} は商品管理に登録されていません。`);
            setHasError(true);
          }
        });
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
      } catch (error) {
        console.error("JANスキャンエラー", error);
        if (!cancelled) {
          setMessage("カメラを起動できませんでした。Safariのカメラ使用許可を確認してください。");
          setHasError(true);
          setScanningSlot(null);
        }
      }
    };
    start();
    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch {}
      controlsRef.current = null;
      scannerRef.current = null;
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
    };
  }, [scanningSlot, products]);

  const fetchPrices = async (targetIndexes: number[]) => {
    const unique: Product[] = [];
    const seen = new Set<string>();
    for (const index of targetIndexes) {
      const product = selectedProducts[index];
      if (product && !seen.has(product.id)) { unique.push(product); seen.add(product.id); }
    }
    if (!unique.length) {
      setMessage("先に商品を選択してください。");
      setHasError(true);
      return;
    }

    setRunning(true);
    setRunningSlot(targetIndexes.length === 1 ? targetIndexes[0] : null);
    setMessage("");
    setHasError(false);
    setErrors([]);

    try {
      const response = await fetch("/api/rakuten-bulk-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: unique.map((product) => ({ jan: product.jan_code, name: product.name, brand: product.brand, model: product.model_number })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `楽天APIエラー（HTTP ${response.status}）`);

      const byJan = new Map<string, Result>((data?.results || []).map((result: Result) => [cleanJan(result.jan), result]));
      const checkedAt = new Date().toISOString();
      let updated = 0;
      const failed: string[] = [];

      for (const product of unique) {
        const jan = cleanJan(String(product.jan_code ?? ""));
        const result = byJan.get(jan);
        if (!result || result.price == null) {
          failed.push(`${product.name}：${result?.error || "新品価格なし"}`);
          continue;
        }
        const { data: rows, error } = await supabase.from("products").update({ rakuten_lowest_price: result.price, rakuten_price_checked_at: checkedAt }).eq("id", product.id).select("id");
        if (error || !rows?.length) {
          failed.push(`${product.name}：${error?.message || "DB更新対象が0件"}`);
          continue;
        }
        updated += 1;
        setLocalPrices((prev) => ({ ...prev, [product.id]: result.price }));
        setLocalCheckedAt((prev) => ({ ...prev, [product.id]: checkedAt }));
      }

      setErrors(failed);
      setHasError(failed.length > 0);
      setMessage(failed.length ? `完了：${updated}件更新 / ${failed.length}件は取得できませんでした。` : `楽天市場の新品最安値を${updated}件更新しました。`);
    } catch (error: any) {
      setMessage(error?.message || "楽天最安値の取得に失敗しました。");
      setHasError(true);
    } finally {
      setRunning(false);
      setRunningSlot(null);
    }
  };

  if (!visible) return null;

  return (
    <section onClick={(event) => event.stopPropagation()} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 20, marginBottom: 18, boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#dc2626", letterSpacing: 1 }}>📊 楽天市場 相場管理</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 24 }}>楽天市場 新品最安値</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>商品を自分で最大5件選んで、必要な商品だけ楽天市場の新品最安値を検索できます。</p>
        </div>
        <button type="button" onClick={() => void fetchPrices([0,1,2,3,4])} disabled={running || selectedCount === 0} style={{ border: 0, borderRadius: 11, padding: "13px 18px", background: running ? "#9ca3af" : "#111827", color: "#fff", fontWeight: 800, cursor: running ? "default" : "pointer" }}>
          {running ? "🔄 楽天市場を検索中…" : `🔍 選択した${selectedCount}商品を検索`}
        </button>
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
        {slots.map((slot, index) => {
          const product = selectedProducts[index];
          const suggestions = suggestionsFor(index);
          const price = product ? localPrices[product.id] ?? product.rakuten_lowest_price ?? null : null;
          const checkedAt = product ? localCheckedAt[product.id] ?? product.rakuten_price_checked_at ?? null : null;
          return (
            <div key={index} style={{ position: "relative", border: product ? "1px solid #cbd5e1" : "1px dashed #cbd5e1", borderRadius: 14, padding: 14, background: product ? "#f8fafc" : "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong>商品 {index + 1}</strong>
                {product && <button type="button" onClick={() => clearSlot(index)} style={{ border: 0, background: "transparent", color: "#64748b", cursor: "pointer", fontWeight: 700 }}>クリア</button>}
              </div>

              <div style={{ position: "relative" }}>
                <input value={slot.keyword} onFocus={() => setActiveSuggestions(index)} onChange={(event) => { setSlot(index, { keyword: event.target.value, productId: "" }); setActiveSuggestions(index); }} placeholder="商品名・型番・SKUで検索" style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff" }} />
                {activeSuggestions === index && suggestions.length > 0 && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 30, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, boxShadow: "0 10px 24px rgba(15,23,42,.14)", overflow: "hidden" }}>
                    {suggestions.map((item) => <button type="button" key={item.id} onClick={() => selectProduct(index, item)} style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #f1f5f9", background: "#fff", padding: "10px 12px", cursor: "pointer" }}><div style={{ fontWeight: 800, fontSize: 13 }}>{item.name}</div><div style={{ color: "#64748b", fontSize: 11, marginTop: 3 }}>JAN {item.jan_code || "未登録"}　/ 在庫 {Number(item.stock_quantity || 0)}</div></button>)}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                <input value={slot.jan} onChange={(event) => setSlot(index, { jan: cleanJan(event.target.value), productId: "" })} onKeyDown={(event) => { if (event.key === "Enter") searchByJan(index); }} inputMode="numeric" placeholder="JANコードで検索" style={{ minWidth: 0, flex: 1, boxSizing: "border-box", padding: "10px 11px", border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff" }} />
                <button type="button" onClick={() => searchByJan(index)} style={{ border: 0, borderRadius: 10, padding: "0 12px", background: "#e2e8f0", color: "#334155", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>JAN検索</button>
                <button type="button" onClick={() => setScanningSlot(index)} style={{ border: 0, borderRadius: 10, padding: "0 11px", background: "#0f766e", color: "#fff", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>📷 JAN読込</button>
              </div>

              {product ? (
                <div style={{ marginTop: 12, padding: 11, borderRadius: 10, background: "#fff", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.45 }}>{product.name}</div>
                  <div style={{ marginTop: 5, color: "#64748b", fontSize: 11 }}>JAN：{product.jan_code || "—"}　/　在庫：{Number(product.stock_quantity || 0)}個</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 8, marginTop: 10 }}>
                    <div><div style={{ color: "#64748b", fontSize: 11 }}>楽天新品最安値</div><div style={{ color: "#dc2626", fontSize: 20, fontWeight: 900 }}>{yen(price)}</div><div style={{ color: "#94a3b8", fontSize: 10 }}>{checked(checkedAt)}</div></div>
                    <button type="button" onClick={() => void fetchPrices([index])} disabled={running} style={{ border: 0, borderRadius: 9, padding: "9px 11px", background: running ? "#cbd5e1" : "#111827", color: "#fff", fontWeight: 800, cursor: running ? "default" : "pointer", whiteSpace: "nowrap" }}>{running && runningSlot === index ? "検索中…" : "この商品を検索"}</button>
                  </div>
                </div>
              ) : <div style={{ marginTop: 10, color: "#94a3b8", fontSize: 12 }}>商品名検索・JAN検索・JAN読込のいずれかで商品を選択してください。</div>}
            </div>
          );
        })}
      </div>

      {message && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: hasError ? "#fff7ed" : "#f0fdf4", color: hasError ? "#9a3412" : "#166534", fontWeight: 700 }}>{message}</div>}
      {errors.length > 0 && <details style={{ marginTop: 10, color: "#9a3412" }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>取得できなかった商品（{errors.length}件）</summary><div style={{ marginTop: 8, fontSize: 13 }}>{errors.map((error, index) => <div key={`${error}-${index}`} style={{ padding: "4px 0" }}>{error}</div>)}</div></details>}

      {scanningSlot !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }} onClick={() => setScanningSlot(null)}>
          <div style={{ background: "#fff", borderRadius: 18, padding: 16, width: "min(520px,100%)" }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><strong>📷 商品 {scanningSlot + 1} のJAN読込</strong><button type="button" onClick={() => setScanningSlot(null)} style={{ border: 0, background: "#f1f5f9", borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontWeight: 700 }}>閉じる</button></div>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", borderRadius: 14, background: "#000", minHeight: 240 }} />
            <p style={{ margin: "10px 0 0", color: "#64748b", fontSize: 13 }}>JANバーコードをカメラ中央に映してください。商品管理に登録済みの商品を自動選択します。</p>
          </div>
        </div>
      )}
    </section>
  );
}
