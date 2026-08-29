import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { supabaseBrowser } from "../lib/supabase";

const initialForm = { name: "", jan_code: "", sku: "", model_number: "", brand: "", category: "", stock_quantity: "0" };
function cleanJan(value: string) { return value.replace(/\D/g, "").slice(0, 13); }

export default function ProductsPage() {
  const supabase = supabaseBrowser;
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lastLookupJan = useRef("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerStartingRef = useRef(false);

  const update = (key: keyof typeof initialForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  function stopScanner() {
    try { controlsRef.current?.stop(); } catch {}
    controlsRef.current = null;
    readerRef.current = null;
    try { streamRef.current?.getTracks().forEach((track) => track.stop()); } catch {}
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      try { video.pause(); } catch {}
      video.srcObject = null;
    }
    scannerStartingRef.current = false;
    setScanning(false);
  }

  async function startScanner() {
    if (scannerStartingRef.current || scanning || lookingUp) return;
    scannerStartingRef.current = true;
    setError("");
    setMessage("📷 カメラを起動しています…");
    setScanning(true);

    try {
      const video = videoRef.current;
      if (!video) throw new Error("video element unavailable");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera unavailable");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      video.setAttribute("playsinline", "true");
      await video.play();

      const hints = new Map<DecodeHintType, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
      const reader = new BrowserMultiFormatReader(hints);
      readerRef.current = reader;

      setMessage("📷 JANバーコードを枠の中に入れてください。");
      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (!result) return;
        const jan = cleanJan(result.getText());
        if (jan.length !== 13) return;
        stopScanner();
        lastLookupJan.current = "";
        setForm((prev) => ({ ...prev, jan_code: jan }));
        setMessage("✅ JANを読み取りました。商品情報を取得しています…");
        void lookupByJan(jan);
      });
      controlsRef.current = controls;
    } catch (scannerError) {
      console.error("JANバーコード読取エラー:", scannerError);
      try { streamRef.current?.getTracks().forEach((track) => track.stop()); } catch {}
      streamRef.current = null;
      setScanning(false);
      setError("カメラを起動できませんでした。Safariのカメラ許可を確認してください。");
      setMessage("");
    } finally {
      scannerStartingRef.current = false;
    }
  }

  useEffect(() => () => {
    try { controlsRef.current?.stop(); } catch {}
    try { streamRef.current?.getTracks().forEach((track) => track.stop()); } catch {}
  }, []);

  async function lookupByJan(rawJan = form.jan_code) {
    const jan = cleanJan(rawJan);
    if (jan.length !== 13) { setError("JANコードは13桁で入力してください。"); return; }
    if (lastLookupJan.current === jan) return;
    lastLookupJan.current = jan; setLookingUp(true); setError(""); setMessage("JANから商品情報を取得しています…");
    try {
      const response = await fetch(`/api/jan-search?jan=${encodeURIComponent(jan)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "JAN商品情報の取得に失敗しました。");
      if (data?.found && data?.product) {
        const product = data.product;
        setForm((prev) => ({ ...prev, jan_code: jan, name: product.name || prev.name, brand: product.brand || prev.brand, category: product.category || prev.category }));
        setMessage("✅ JANから商品情報を自動入力しました。必要なら内容を修正して登録できます。");
      } else {
        setForm((prev) => ({ ...prev, jan_code: jan }));
        setMessage("JANは確認できましたが、商品情報が見つかりませんでした。商品名を入力してください。");
      }
    } catch (lookupError) {
      console.error("JAN商品情報取得エラー:", lookupError);
      setForm((prev) => ({ ...prev, jan_code: jan }));
      setMessage("JANは入力されましたが、商品情報の自動取得に失敗しました。");
    } finally { setLookingUp(false); }
  }

  function handleJanChange(value: string) {
    const jan = cleanJan(value);
    if (jan.length < 13) { lastLookupJan.current = ""; setForm((prev) => ({ ...prev, jan_code: jan })); return; }
    setForm((prev) => ({ ...prev, jan_code: jan })); void lookupByJan(jan);
  }

  function openPrice2Alert() {
    const jan = cleanJan(form.jan_code);
    if (jan.length !== 13) {
      setError("Price2Alertを開くには13桁のJANコードを入力してください。");
      return;
    }
    const url = `https://price2alert.com/search?i=All&kwd=${encodeURIComponent(jan)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setMessage("🔎 Price2Alertの楽天市場検索を開きました。新品の価格を確認できます。");
  }

  async function saveProduct(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (!form.name.trim()) { setError("商品名を入力してください。"); return; }
    const jan = cleanJan(form.jan_code);
    if (jan && jan.length !== 13) { setError("JANコードは13桁で入力してください。"); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), jan_code: jan || null, sku: form.sku.trim() || null, model_number: form.model_number.trim() || null, brand: form.brand.trim() || null, category: form.category.trim() || null, stock_quantity: Number(form.stock_quantity || 0) };
    const { error } = await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) { setError(`保存エラー：${error.message}`); return; }
    setMessage("商品を登録しました！"); setForm(initialForm); lastLookupJan.current = "";
  }

  const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "14px 15px", marginTop: 7, border: "1px solid #d1d5db", borderRadius: 11, fontSize: 16, background: "#fff" };
  const fieldStyle: React.CSSProperties = { marginBottom: 15 };

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", padding: "24px 16px 90px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: "#111827" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}><div><div style={{ color: "#6b7280", fontSize: 13, fontWeight: 700 }}>📦 在庫管理</div><h1 style={{ margin: "3px 0 0", fontSize: 30 }}>商品登録</h1></div><Link href="/" style={{ textDecoration: "none", color: "#111827", background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 13px", fontWeight: 700 }}>← 戻る</Link></div>
        <section style={{ background: "#fff", borderRadius: 18, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,.05)" }}>
          <p style={{ marginTop: 0, color: "#6b7280" }}>JANを入力すると商品情報を自動取得できます。カメラでJANバーコードを読み取ることもできます。</p>
          <form onSubmit={saveProduct}>
            <label style={fieldStyle}>商品名 *<input style={inputStyle} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="例：ポケモンカード BOX" /></label>
            <div style={{ marginBottom: 18 }}><label style={{ display: "block", fontWeight: 700 }}>JANコード<input style={inputStyle} inputMode="numeric" value={form.jan_code} onChange={(e) => handleJanChange(e.target.value)} onBlur={() => { if (cleanJan(form.jan_code).length === 13) void lookupByJan(); }} placeholder="13桁のJANコード" /></label><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginTop: 9 }}><button type="button" onClick={startScanner} disabled={scanning || lookingUp} style={{ border: 0, borderRadius: 11, padding: "13px 10px", background: scanning || lookingUp ? "#d1d5db" : "#111827", color: "#fff", fontWeight: 800, fontSize: 14 }}>📷 JANをカメラで読取</button><button type="button" onClick={() => void lookupByJan()} disabled={lookingUp || cleanJan(form.jan_code).length !== 13} style={{ border: 0, borderRadius: 11, padding: "13px 10px", background: lookingUp || cleanJan(form.jan_code).length !== 13 ? "#d1d5db" : "#15803d", color: "#fff", fontWeight: 800, fontSize: 14 }}>{lookingUp ? "🔎 取得中…" : "🔎 情報を取得"}</button><button type="button" onClick={openPrice2Alert} disabled={cleanJan(form.jan_code).length !== 13} style={{ border: 0, borderRadius: 11, padding: "13px 10px", background: cleanJan(form.jan_code).length !== 13 ? "#d1d5db" : "#2563eb", color: "#fff", fontWeight: 800, fontSize: 14 }}>📈 相場チェック</button></div></div>
            <div style={{ marginBottom: 18, padding: 12, borderRadius: 16, background: "#111827", display: scanning ? "block" : "none" }}><div style={{ position: "relative", overflow: "hidden", borderRadius: 12, background: "#000", aspectRatio: "16 / 9" }}><video ref={videoRef} muted playsInline autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /><div style={{ position: "absolute", left: "10%", right: "10%", top: "32%", height: "36%", border: "3px solid #fff", borderRadius: 12, boxShadow: "0 0 0 9999px rgba(0,0,0,.25)" }} /><div style={{ position: "absolute", left: 0, right: 0, bottom: 10, textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 14, textShadow: "0 1px 3px #000" }}>JANバーコードを枠内へ</div></div><button type="button" onClick={stopScanner} style={{ width: "100%", marginTop: 10, border: "1px solid #4b5563", borderRadius: 10, padding: "11px", background: "#fff", color: "#111827", fontWeight: 800 }}>カメラを閉じる</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 0 }}><label style={fieldStyle}>SKU<input style={inputStyle} value={form.sku} onChange={(e) => update("sku", e.target.value)} placeholder="任意" /></label><label style={fieldStyle}>型番<input style={inputStyle} value={form.model_number} onChange={(e) => update("model_number", e.target.value)} placeholder="任意" /></label><label style={fieldStyle}>ブランド<input style={inputStyle} value={form.brand} onChange={(e) => update("brand", e.target.value)} placeholder="例：BANDAI" /></label><label style={fieldStyle}>カテゴリ<input style={inputStyle} value={form.category} onChange={(e) => update("category", e.target.value)} placeholder="例：玩具" /></label><label style={fieldStyle}>初期在庫<input style={inputStyle} type="number" min="0" value={form.stock_quantity} onChange={(e) => update("stock_quantity", e.target.value)} /></label></div>
            {error && <div style={{ margin: "4px 0 12px", padding: 12, borderRadius: 10, background: "#fff1f2", color: "#b42318", fontWeight: 700 }}>{error}</div>}{message && <div style={{ margin: "4px 0 12px", padding: 12, borderRadius: 10, background: "#f0fdf4", color: "#166534", fontWeight: 700 }}>{message}</div>}
            <button type="submit" disabled={saving || lookingUp || scanning} style={{ width: "100%", border: 0, borderRadius: 12, padding: "15px 18px", background: saving || lookingUp || scanning ? "#9ca3af" : "#111827", color: "#fff", fontSize: 16, fontWeight: 800 }}>{saving ? "登録中…" : "＋ 商品を登録する"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
