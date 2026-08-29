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
    items?: Array<{ shopName?: string | null; price?: number | null; itemUrl?: string | null }>;
    error?: string | null;
  };
  amazon?: { lowestPrice?: number | null; productUrl?: string | null; error?: string | null };
  price2alert?: string;
};

type Slot = { productId: string; keyword: string; jan: string; research: Research | null; loading: boolean; error: string };

const cleanJan = (value: string) => value.replace(/\D/g, "").slice(0, 13);
const yen = (value: number | null | undefined) => value == null ? "取得不可" : `¥${Math.round(value).toLocaleString()}`;
const emptySlot = (): Slot => ({ productId: "", keyword: "", jan: "", research: null, loading: false, error: "" });

export default function ProductPriceResearchPanel({ products, visible }: { products: Product[]; visible: boolean }) {
  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: 5 }, emptySlot));
  const [activeSuggestions, setActiveSuggestions] = useState<number | null>(null);
  const [scanningSlot, setScanningSlot] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<any>(null);

  useEffect(() => () => {
    try { controlsRef.current?.stop(); } catch {}
    controlsRef.current = null;
    scannerRef.current = null;
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch {}
      videoRef.current.srcObject = null;
    }
  }, []);

  const setSlot = (index: number, patch: Partial<Slot>) => {
    setSlots((prev) => prev.map((slot, i) => i === index ? { ...slot, ...patch } : slot));
  };

  const selectProduct = (index: number, product: Product) => {
    setSlot(index, {
      productId: product.id,
      keyword: product.name,
      jan: cleanJan(String(product.jan_code ?? "")),
      research: null,
      error: "",
    });
    setActiveSuggestions(null);
  };

  const clearSlot = (index: number) => {
    setSlot(index, emptySlot());
    setActiveSuggestions(null);
  };

  const suggestionsFor = (index: number) => {
    const keyword = slots[index].keyword.trim().toLowerCase();
    if (!keyword) return [];
    return products.filter((product) => [product.name, product.jan_code, product.sku, product.model_number, product.brand]
      .some((value) => String(value ?? "").toLowerCase().includes(keyword))).slice(0, 8);
  };

  const searchByJan = (index: number) => {
    const jan = cleanJan(slots[index].jan);
    setSlot(index, { jan, error: "", research: null });
    if (jan.length !== 13) {
      setSlot(index, { error: "JANコードは13桁で入力してください。" });
      return;
    }
    const found = products.find((product) => cleanJan(String(product.jan_code ?? "")) === jan);
    if (!found) {
      setSlot(index, { error: `JAN ${jan} の商品が商品管理に見つかりません。` });
      return;
    }
    selectProduct(index, found);
  };

  const openPrice2Alert = (index: number) => {
    const jan = cleanJan(slots[index].jan);
    if (jan.length !== 13) {
      setSlot(index, { error: "Price2Alertを開くには13桁のJANコードが必要です。" });
      return;
    }
    window.open(`https://price2alert.com/search?i=All&kwd=${encodeURIComponent(jan)}`, "_blank", "noopener,noreferrer");
  };

  const research = async (index: number) => {
    const slot = slots[index];
    const jan = cleanJan(slot.jan);
    if (jan.length !== 13) {
      setSlot(index, { error: "相場チェックには13桁のJANコードが必要です。" });
      return;
    }
    setSlot(index, { loading: true, error: "", research: null });
    try {
      const response = await fetch(`/api/price-research?jan=${encodeURIComponent(jan)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as Research | null;
      if (!response.ok) throw new Error((data as any)?.error || `価格情報の取得に失敗しました（HTTP ${response.status}）。`);
      setSlot(index, { loading: false, research: data });
    } catch (error: any) {
      setSlot(index, { loading: false, error: error?.message || "相場チェックに失敗しました。" });
    }
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
          if (!found) {
            setSlot(scanningSlot, { error: `JAN ${jan} は商品管理に登録されていません。` });
            return;
          }
          selectProduct(scanningSlot, found);
          try { controls.stop(); } catch {}
          controlsRef.current = null;
          scannerRef.current = null;
          setScanningSlot(null);
        });
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
      } catch (error) {
        console.error("JANスキャンエラー", error);
        if (!cancelled) {
          setSlot(scanningSlot, { error: "カメラを起動できませんでした。Safariのカメラ使用許可を確認してください。" });
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
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch {}
        videoRef.current.srcObject = null;
      }
    };
  }, [scanningSlot, products]);

  if (!visible) return null;

  return (
    <section onClick={() => setActiveSuggestions(null)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 20, marginBottom: 18, boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#dc2626", letterSpacing: 1 }}>📊 楽天市場 相場管理</div>
        <h2 style={{ margin: "4px 0 6px", fontSize: 24 }}>楽天市場 新品最安値</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>商品を自分で最大5件選択して、必要な商品だけ相場チェックできます。</p>
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
        {slots.map((slot, index) => {
          const suggestions = suggestionsFor(index);
          const product = products.find((item) => item.id === slot.productId);
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
                    {suggestions.map((item) => (
                      <button key={item.id} type="button" onClick={() => selectProduct(index, item)} style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #f1f5f9", background: "#fff", padding: "10px 12px" }}>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{item.name}</div>
                        <div style={{ color: "#64748b", fontSize: 11, marginTop: 3 }}>JAN {item.jan_code || "未登録"}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                <input value={slot.jan} onChange={(event) => setSlot(index, { jan: cleanJan(event.target.value), productId: "", research: null, error: "" })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchByJan(index); } }} inputMode="numeric" placeholder="JANコードで検索" style={{ minWidth: 0, flex: 1, boxSizing: "border-box", padding: "10px 11px", border: "1px solid #cbd5e1", borderRadius: 10 }} />
                <button type="button" onClick={() => searchByJan(index)} style={{ border: 0, borderRadius: 10, padding: "0 12px", background: "#e2e8f0", color: "#334155", fontWeight: 800, whiteSpace: "nowrap" }}>JAN検索</button>
                <button type="button" onClick={() => setScanningSlot(index)} style={{ border: 0, borderRadius: 10, padding: "0 11px", background: "#0f766e", color: "#fff", fontWeight: 800, whiteSpace: "nowrap" }}>📷 JAN読込</button>
              </div>

              {product && (
                <div style={{ marginTop: 12, padding: 11, borderRadius: 10, background: "#fff", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.45 }}>{product.name}</div>
                  <div style={{ marginTop: 5, color: "#64748b", fontSize: 11 }}>JAN：{product.jan_code || "—"}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button type="button" onClick={() => void research(index)} disabled={slot.loading} style={{ border: 0, borderRadius: 9, padding: "9px 11px", background: slot.loading ? "#cbd5e1" : "#111827", color: "#fff", fontWeight: 800 }}>{slot.loading ? "検索中…" : "🔎 相場をチェック"}</button>
                    <button type="button" onClick={() => openPrice2Alert(index)} style={{ border: "1px solid #cbd5e1", borderRadius: 9, padding: "9px 11px", background: "#fff", color: "#334155", fontWeight: 800 }}>📈 Price2Alert</button>
                  </div>

                  {result && (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <div style={{ padding: 12, borderRadius: 10, background: "#fff7f7", border: "1px solid #fee2e2" }}>
                        <div style={{ color: "#dc2626", fontWeight: 800 }}>🔴 楽天市場</div>
                        <div style={{ fontSize: 24, fontWeight: 900, marginTop: 3 }}>{yen(result.rakuten?.lowestPrice)}</div>
                        {result.rakuten?.items?.slice(0, 5).map((item, itemIndex) => (
                          <div key={`${item.shopName}-${itemIndex}`} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #fee2e2", display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                            <div>{item.shopName || "ショップ不明"}{item.itemUrl && <><br /><a href={item.itemUrl} target="_blank" rel="noreferrer">商品を見る</a></>}</div>
                            <strong style={{ whiteSpace: "nowrap" }}>{yen(item.price)}</strong>
                          </div>
                        ))}
                        {result.rakuten?.error && !result.rakuten?.items?.length && <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>{result.rakuten.error}</div>}
                        {result.price2alert && <a href={result.price2alert} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 12 }}>📈 価格推移を見る</a>}
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
              {slot.error && <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: "#fff7ed", color: "#9a3412", fontSize: 12, fontWeight: 700 }}>{slot.error}</div>}
            </div>
          );
        })}
      </div>

      {scanningSlot !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }} onClick={() => setScanningSlot(null)}>
          <div style={{ background: "#fff", borderRadius: 18, padding: 16, width: "min(520px,100%)" }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><strong>📷 商品 {scanningSlot + 1} のJAN読込</strong><button type="button" onClick={() => setScanningSlot(null)} style={{ border: 0, background: "#f1f5f9", borderRadius: 9, padding: "8px 12px", fontWeight: 700 }}>閉じる</button></div>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", borderRadius: 14, background: "#000", minHeight: 240 }} />
            <p style={{ margin: "10px 0 0", color: "#64748b", fontSize: 13 }}>JANバーコードをカメラ中央に映してください。商品管理に登録済みの商品を自動選択します。</p>
          </div>
        </div>
      )}
    </section>
  );
}
