"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Product = {
  id: string;
  name: string;
  jan_code?: string | null;
  sku?: string | null;
  model_number?: string | null;
  brand?: string | null;
};

type Research = {
  jan: string;
  rakuten?: {
    available?: boolean;
    lowestPrice?: number | null;
    newListingCount?: number | null;
    items?: Array<{ name?: string | null; shopName?: string | null; price?: number | null; itemUrl?: string | null }>;
    priceNaviUrl?: string | null;
    productUrl?: string | null;
    error?: string | null;
  };
  amazon?: { lowestPrice?: number | null; productUrl?: string | null; error?: string | null };
  price2alert?: string;
};

type Slot = { productId: string; keyword: string; jan: string; research: Research | null; loading: boolean; error: string };

const cleanJan = (value: string) => value.replace(/\D/g, "").slice(0, 13);
const yen = (value: number | null | undefined) => value == null ? "取得不可" : `¥${Math.round(value).toLocaleString()}`;
const tempId = (jan: string) => `jan:${jan}`;
const emptySlot = (): Slot => ({ productId: "", keyword: "", jan: "", research: null, loading: false, error: "" });

export default function ProductPriceResearchPanel({ products, visible }: { products: Product[]; visible: boolean }) {
  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: 5 }, emptySlot));
  const [activeSuggestions, setActiveSuggestions] = useState<number | null>(null);
  const [scanningSlot, setScanningSlot] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<any>(null);

  const setSlot = (index: number, patch: Partial<Slot>) => {
    setSlots((prev) => prev.map((slot, i) => i === index ? { ...slot, ...patch } : slot));
  };

  const selectedProduct = (slot: Slot): Product | null => {
    const registered = products.find((item) => item.id === slot.productId);
    if (registered) return registered;
    if (slot.jan.length === 13) return { id: tempId(slot.jan), name: slot.keyword || `JAN ${slot.jan}`, jan_code: slot.jan };
    return null;
  };

  const selectProduct = (index: number, product: Product) => {
    setSlot(index, { productId: product.id, keyword: product.name, jan: cleanJan(String(product.jan_code ?? "")), research: null, loading: false, error: "" });
    setActiveSuggestions(null);
  };

  const clearSlot = (index: number) => setSlot(index, emptySlot());

  const suggestionsFor = (index: number) => {
    const keyword = slots[index].keyword.trim().toLowerCase();
    if (!keyword) return [];
    return products.filter((product) => [product.name, product.jan_code, product.sku, product.model_number, product.brand]
      .some((value) => String(value ?? "").toLowerCase().includes(keyword))).slice(0, 8);
  };

  const research = async (index: number, janOverride?: string) => {
    const jan = cleanJan(janOverride ?? slots[index].jan);
    if (jan.length !== 13) {
      setSlot(index, { error: "相場チェックには13桁のJANコードが必要です。" });
      return;
    }
    setSlot(index, { jan, loading: true, error: "", research: null });
    try {
      const response = await fetch(`/api/price-research?jan=${encodeURIComponent(jan)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as Research | null;
      if (!response.ok) throw new Error((data as any)?.error || `価格情報の取得に失敗しました（HTTP ${response.status}）。`);
      setSlot(index, { loading: false, research: data });
    } catch (error: any) {
      setSlot(index, { loading: false, error: error?.message || "相場チェックに失敗しました。" });
    }
  };

  const searchByJan = (index: number) => {
    const jan = cleanJan(slots[index].jan);
    if (jan.length !== 13) {
      setSlot(index, { jan, research: null, error: "JANコードは13桁で入力してください。" });
      return;
    }
    const found = products.find((product) => cleanJan(String(product.jan_code ?? "")) === jan);
    setSlot(index, {
      productId: found?.id ?? tempId(jan),
      keyword: found?.name ?? `JAN ${jan}`,
      jan,
      research: null,
      loading: true,
      error: found ? "" : "商品管理には未登録ですが、楽天市場を検索しています。",
    });
    window.setTimeout(() => void research(index, jan), 0);
  };

  const openPrice2Alert = (index: number) => {
    const jan = cleanJan(slots[index].jan);
    if (jan.length !== 13) {
      setSlot(index, { error: "Price2Alertを開くには13桁のJANコードが必要です。" });
      return;
    }
    window.open(`https://price2alert.com/search?i=All&kwd=${encodeURIComponent(jan)}`, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (scanningSlot === null) return;
    let cancelled = false;
    const slotIndex = scanningSlot;
    const start = async () => {
      try {
        if (!videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoRef.current, (result) => {
          if (cancelled || !result) return;
          const jan = cleanJan(result.getText());
          if (jan.length !== 13) return;
          const found = products.find((product) => cleanJan(String(product.jan_code ?? "")) === jan);
          setSlot(slotIndex, {
            productId: found?.id ?? tempId(jan),
            keyword: found?.name ?? `JAN ${jan}`,
            jan,
            research: null,
            loading: true,
            error: found ? "" : "商品管理には未登録ですが、楽天市場を検索しています。",
          });
          try { controls.stop(); } catch {}
          controlsRef.current = null;
          setScanningSlot(null);
          window.setTimeout(() => void research(slotIndex, jan), 0);
        });
        if (cancelled) controls.stop(); else controlsRef.current = controls;
      } catch (error) {
        console.error("JANスキャンエラー", error);
        if (!cancelled) {
          setSlot(slotIndex, { error: "カメラを起動できませんでした。Safariのカメラ使用許可を確認してください。" });
          setScanningSlot(null);
        }
      }
    };
    start();
    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch {}
      controlsRef.current = null;
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch {}
        videoRef.current.srcObject = null;
      }
    };
  }, [scanningSlot, products]);

  useEffect(() => () => { try { controlsRef.current?.stop(); } catch {} }, []);

  if (!visible) return null;

  return (
    <section onClick={() => setActiveSuggestions(null)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 20, marginBottom: 18, boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#dc2626", letterSpacing: 1 }}>📊 楽天市場 相場管理</div>
        <h2 style={{ margin: "4px 0 6px", fontSize: 24 }}>楽天市場 新品最安値</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>商品を最大5件。JANなら商品管理に未登録でも、そのまま楽天市場を検索できます。</p>
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
        {slots.map((slot, index) => {
          const suggestions = suggestionsFor(index);
          const product = selectedProduct(slot);
          const registered = !!product && products.some((item) => item.id === product.id);
          const result = slot.research;
          return (
            <div key={index} style={{ position: "relative", border: product ? "1px solid #cbd5e1" : "1px dashed #cbd5e1", borderRadius: 14, padding: 14, background: product ? "#f8fafc" : "#fff" }} onClick={(event) => event.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong>商品 {index + 1}</strong>
                {product && <button type="button" onClick={() => clearSlot(index)} style={{ border: 0, background: "transparent", color: "#64748b", fontWeight: 700 }}>クリア</button>}
              </div>

              <div style={{ position: "relative" }}>
                <input value={slot.keyword} onFocus={() => setActiveSuggestions(index)} onChange={(event) => { setSlot(index, { keyword: event.target.value, productId: "", research: null, error: "" }); setActiveSuggestions(index); }} placeholder="商品名・型番・SKUで検索" style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #cbd5e1", borderRadius: 10 }} />
                {activeSuggestions === index && suggestions.length > 0 && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 30, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, boxShadow: "0 10px 24px rgba(15,23,42,.14)", overflow: "hidden" }}>
                    {suggestions.map((item) => <button key={item.id} type="button" onClick={() => selectProduct(index, item)} style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #f1f5f9", background: "#fff", padding: "10px 12px" }}><div style={{ fontWeight: 800, fontSize: 13 }}>{item.name}</div><div style={{ color: "#64748b", fontSize: 11, marginTop: 3 }}>JAN {item.jan_code || "未登録"}</div></button>)}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                <input value={slot.jan} onChange={(event) => setSlot(index, { jan: cleanJan(event.target.value), productId: "", research: null, error: "" })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchByJan(index); } }} inputMode="numeric" placeholder="JANコードで検索（未登録OK）" style={{ minWidth: 0, flex: 1, boxSizing: "border-box", padding: "10px 11px", border: "1px solid #cbd5e1", borderRadius: 10 }} />
                <button type="button" onClick={() => searchByJan(index)} style={{ border: 0, borderRadius: 10, padding: "0 12px", background: "#e2e8f0", color: "#334155", fontWeight: 800, whiteSpace: "nowrap" }}>JAN検索</button>
                <button type="button" onClick={() => setScanningSlot(index)} style={{ border: 0, borderRadius: 10, padding: "0 11px", background: "#0f766e", color: "#fff", fontWeight: 800, whiteSpace: "nowrap" }}>📷 JAN読込</button>
              </div>

              {product && (
                <div style={{ marginTop: 12, padding: 11, borderRadius: 10, background: "#fff", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.45 }}>{result?.rakuten?.items?.[0]?.name || product.name}</div>
                  <div style={{ marginTop: 5, color: "#64748b", fontSize: 11 }}>JAN：{slot.jan || "—"}　/　商品管理：{registered ? "登録済み" : "未登録"}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button type="button" onClick={() => void research(index)} disabled={slot.loading} style={{ border: 0, borderRadius: 9, padding: "9px 11px", background: slot.loading ? "#cbd5e1" : "#111827", color: "#fff", fontWeight: 800 }}>{slot.loading ? "検索中…" : "🔎 相場をチェック"}</button>
                    <button type="button" onClick={() => openPrice2Alert(index)} style={{ border: "1px solid #cbd5e1", borderRadius: 9, padding: "9px 11px", background: "#fff", color: "#334155", fontWeight: 800 }}>📈 Price2Alert</button>
                  </div>

                  {result && (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <div style={{ padding: 12, borderRadius: 10, background: "#fff7f7", border: "1px solid #fee2e2" }}>
                        <div style={{ color: "#dc2626", fontWeight: 800 }}>🔴 楽天市場</div>
                        <div style={{ fontSize: 26, fontWeight: 900, marginTop: 3 }}>{yen(result.rakuten?.lowestPrice)}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                          {result.rakuten?.newListingCount != null && <span style={{ padding: "5px 8px", borderRadius: 999, background: "#fee2e2", color: "#991b1b", fontWeight: 800, fontSize: 12 }}>新品出品数 {result.rakuten.newListingCount}件</span>}
                          {result.rakuten?.priceNaviUrl && <a href={result.rakuten.priceNaviUrl} target="_blank" rel="noreferrer" style={{ padding: "5px 8px", borderRadius: 999, background: "#fff", border: "1px solid #fecaca", color: "#991b1b", fontWeight: 800, fontSize: 12 }}>🔗 商品価格ナビ</a>}
                        </div>
                        {result.rakuten?.items?.slice(0, 5).map((item, itemIndex) => <div key={`${item.shopName}-${itemIndex}`} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #fee2e2", display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}><div>{item.shopName || "ショップ不明"}{item.itemUrl && <><br /><a href={item.itemUrl} target="_blank" rel="noreferrer">商品を見る</a></>}</div><strong style={{ whiteSpace: "nowrap" }}>{yen(item.price)}</strong></div>)}
                        {result.rakuten?.error && !result.rakuten?.items?.length && <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>{result.rakuten.error}</div>}
                        {result.price2alert && <a href={result.price2alert} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 12 }}>📈 Price2Alertで価格推移を見る</a>}
                      </div>
                      <div style={{ padding: 12, borderRadius: 10, background: "#fffaf5", border: "1px solid #fed7aa" }}>
                        <div style={{ color: "#c2410c", fontWeight: 800 }}>🟠 Amazon</div>
                        <div style={{ fontSize: 20, fontWeight: 900, marginTop: 3 }}>{yen(result.amazon?.lowestPrice)}</div>
                        {result.amazon?.productUrl && <a href={result.amazon.productUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 12 }}>Amazonで商品を見る</a>}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {slot.error && <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: slot.error.includes("未登録ですが") ? "#eff6ff" : "#fff7ed", color: "#475569", fontSize: 12 }}>{slot.error}</div>}
            </div>
          );
        })}
      </div>

      {scanningSlot !== null && <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}><div style={{ width: "min(520px,100%)", background: "#fff", borderRadius: 18, padding: 16 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><strong>JANコードを読み取る</strong><button type="button" onClick={() => setScanningSlot(null)} style={{ border: 0, background: "transparent", fontWeight: 800 }}>閉じる</button></div><video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", background: "#0f172a", borderRadius: 12 }} /><p style={{ margin: "10px 0 0", color: "#64748b", fontSize: 12 }}>登録済み・未登録どちらのJANでも、読み取り後に楽天市場を検索します。</p></div></div>}
    </section>
  );
}
