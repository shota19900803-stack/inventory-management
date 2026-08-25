import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { supabaseBrowser } from "../lib/supabase";

type Product = {
  id: string;
  jan_code?: string | null;
  sku?: string | null;
  name: string;
  model_number?: string | null;
  brand?: string | null;
  stock_quantity?: number | null;
  cost_price?: number | null;
};

type CountLine = Product & {
  actualQuantity: number;
};

const normalizeJan = (value: string) => value.replace(/\D/g, "");

export default function StocktakePage() {
  const supabase = supabaseBrowser;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<CountLine[]>([]);
  const [janInput, setJanInput] = useState("");
  const [selected, setSelected] = useState<CountLine | null>(null);
  const [actualQuantity, setActualQuantity] = useState("0");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const productByJan = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((product) => {
      const jan = normalizeJan(product.jan_code ?? "");
      if (jan) map.set(jan, product);
    });
    return map;
  }, [products]);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,jan_code,sku,name,model_number,brand,stock_quantity,cost_price")
        .order("name")
        .limit(2000);
      if (error) {
        setMessage(`商品読み込みエラー：${error.message}`);
        return;
      }
      setProducts((data ?? []) as Product[]);
    };
    load();
  }, []);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;

    const start = async () => {
      try {
        if (!videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => {
            if (cancelled || !result) return;
            const jan = normalizeJan(result.getText());
            if (jan.length !== 13) return;
            handleJan(jan);
            controls.stop();
            controlsRef.current = null;
            setScanning(false);
          }
        );
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setMessage("カメラを起動できませんでした。Safariのカメラ許可を確認してください。");
          setScanning(false);
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch {}
      controlsRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };
  }, [scanning]);

  const handleJan = (rawJan: string) => {
    const jan = normalizeJan(rawJan);
    if (!jan) return;
    const product = productByJan.get(jan);
    if (!product) {
      setSelected(null);
      setMessage(`JAN ${jan} の商品が見つかりません。`);
      return;
    }

    const existing = lines.find((line) => line.id === product.id);
    const next = existing?.actualQuantity ?? Number(product.stock_quantity ?? 0);
    const line: CountLine = { ...product, actualQuantity: next };
    setSelected(line);
    setActualQuantity(String(next));
    setJanInput(jan);
    setMessage(`${product.name} を読み取りました`);
  };

  const applyCount = () => {
    if (!selected) return;
    const quantity = Math.max(0, Number.parseInt(actualQuantity || "0", 10) || 0);
    const nextLine: CountLine = { ...selected, actualQuantity: quantity };
    setLines((current) => {
      const exists = current.some((line) => line.id === selected.id);
      return exists
        ? current.map((line) => line.id === selected.id ? nextLine : line)
        : [nextLine, ...current];
    });
    setSelected(nextLine);
    setMessage("棚卸し数量をセットしました");
  };

  const adjust = (delta: number) => {
    setActualQuantity((value) => String(Math.max(0, (Number.parseInt(value || "0", 10) || 0) + delta)));
  };

  const saveAll = async () => {
    if (!lines.length) {
      setMessage("まだ棚卸し商品がありません。");
      return;
    }
    if (!confirm(`${lines.length}商品の実在庫を確定します。よろしいですか？`)) return;
    setSaving(true);
    setMessage("");

    for (const line of lines) {
      const { error } = await supabase
        .from("products")
        .update({ stock_quantity: line.actualQuantity })
        .eq("id", line.id);
      if (error) {
        setMessage(`保存エラー：${line.name} / ${error.message}`);
        setSaving(false);
        return;
      }
    }

    setProducts((current) => current.map((product) => {
      const line = lines.find((item) => item.id === product.id);
      return line ? { ...product, stock_quantity: line.actualQuantity } : product;
    }));
    setMessage(`棚卸し完了：${lines.length}商品を更新しました。`);
    setSaving(false);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", padding: "24px 16px 110px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: "#111827" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <a href="/" style={{ color: "#6b7280", textDecoration: "none", fontWeight: 700 }}>← 在庫管理に戻る</a>
        <h1 style={{ fontSize: 38, margin: "18px 0 6px" }}>📋 棚卸し</h1>
        <p style={{ color: "#6b7280", marginTop: 0 }}>JANをピッ → システム在庫を確認 → 実在庫を入力。商品ごとに素早く棚卸しできます。</p>

        <section style={{ background: "#fff", borderRadius: 22, padding: 22, boxShadow: "0 4px 20px rgba(0,0,0,.06)", marginTop: 20 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={janInput} onChange={(e) => setJanInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleJan(janInput); }} placeholder="JANコードを入力" inputMode="numeric" style={{ flex: "1 1 300px", padding: "16px", border: "1px solid #d1d5db", borderRadius: 14, fontSize: 18 }} />
            <button onClick={() => handleJan(janInput)} style={{ padding: "14px 20px", border: 0, borderRadius: 14, background: "#111827", color: "#fff", fontWeight: 800 }}>検索</button>
            <button onClick={() => setScanning(true)} style={{ padding: "14px 20px", border: 0, borderRadius: 14, background: "#15803d", color: "#fff", fontWeight: 800 }}>📷 JANをスキャン</button>
          </div>

          {selected && (
            <div style={{ marginTop: 20, border: "2px solid #111827", borderRadius: 18, padding: 20 }}>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{selected.jan_code || "JANなし"}</div>
              <div style={{ fontSize: 22, fontWeight: 900, marginTop: 5 }}>{selected.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginTop: 18 }}>
                <div style={{ background: "#f3f4f6", borderRadius: 14, padding: 16 }}><div style={{ color: "#6b7280", fontSize: 13 }}>システム在庫</div><strong style={{ fontSize: 30 }}>{Number(selected.stock_quantity ?? 0)}</strong><span> 個</span></div>
                <div style={{ background: "#ecfdf5", borderRadius: 14, padding: 16 }}><div style={{ color: "#047857", fontSize: 13 }}>実在庫</div><input value={actualQuantity} onChange={(e) => setActualQuantity(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ width: "100%", boxSizing: "border-box", border: 0, background: "transparent", fontSize: 30, fontWeight: 900, outline: "none" }} /></div>
                <div style={{ background: Number(actualQuantity || 0) - Number(selected.stock_quantity ?? 0) === 0 ? "#f3f4f6" : "#fff7ed", borderRadius: 14, padding: 16 }}><div style={{ color: "#6b7280", fontSize: 13 }}>差異</div><strong style={{ fontSize: 30 }}>{Number(actualQuantity || 0) - Number(selected.stock_quantity ?? 0) > 0 ? "+" : ""}{Number(actualQuantity || 0) - Number(selected.stock_quantity ?? 0)}</strong><span> 個</span></div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button onClick={() => adjust(-1)} style={{ padding: "12px 18px", borderRadius: 12, border: "1px solid #d1d5db", background: "#fff", fontSize: 20 }}>−1</button>
                <button onClick={() => adjust(1)} style={{ padding: "12px 18px", borderRadius: 12, border: "1px solid #d1d5db", background: "#fff", fontSize: 20 }}>＋1</button>
                <button onClick={applyCount} style={{ padding: "12px 22px", borderRadius: 12, border: 0, background: "#111827", color: "#fff", fontWeight: 800 }}>この数量をセット</button>
              </div>
            </div>
          )}

          {message && <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#f0fdf4", color: "#166534", fontWeight: 700 }}>{message}</div>}
        </section>

        <section style={{ background: "#fff", borderRadius: 22, padding: 22, boxShadow: "0 4px 20px rgba(0,0,0,.06)", marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div><h2 style={{ margin: 0 }}>今回の棚卸し</h2><div style={{ color: "#6b7280", marginTop: 5 }}>{lines.length}商品</div></div>
            <button onClick={saveAll} disabled={saving || !lines.length} style={{ padding: "14px 22px", border: 0, borderRadius: 14, background: saving || !lines.length ? "#9ca3af" : "#15803d", color: "#fff", fontWeight: 900 }}>{saving ? "保存中…" : "✓ 棚卸しを確定"}</button>
          </div>
          {lines.length === 0 ? <p style={{ color: "#9ca3af" }}>JANをスキャンするとここに追加されます。</p> : <div style={{ overflowX: "auto", marginTop: 15 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={{ textAlign: "left", padding: 10 }}>商品</th><th style={{ padding: 10 }}>JAN</th><th style={{ padding: 10 }}>システム</th><th style={{ padding: 10 }}>実在庫</th><th style={{ padding: 10 }}>差異</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}><td style={{ padding: 10, borderTop: "1px solid #eee", fontWeight: 700 }}>{line.name}</td><td style={{ padding: 10, borderTop: "1px solid #eee" }}>{line.jan_code}</td><td style={{ padding: 10, borderTop: "1px solid #eee", textAlign: "center" }}>{Number(line.stock_quantity ?? 0)}</td><td style={{ padding: 10, borderTop: "1px solid #eee", textAlign: "center", fontWeight: 900 }}>{line.actualQuantity}</td><td style={{ padding: 10, borderTop: "1px solid #eee", textAlign: "center" }}>{line.actualQuantity - Number(line.stock_quantity ?? 0)}</td></tr>)}</tbody></table></div>}
        </section>
      </div>

      {scanning && <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
        <div style={{ width: "min(620px,100%)", background: "#111827", borderRadius: 22, padding: 18, color: "#fff" }}>
          <h2 style={{ margin: "0 0 12px" }}>📷 JANコード読み取り</h2>
          <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", borderRadius: 16, background: "#000", minHeight: 300, objectFit: "cover" }} />
          <p style={{ textAlign: "center", fontWeight: 700 }}>JANコードをカメラに映してください</p>
          <button onClick={() => setScanning(false)} style={{ width: "100%", padding: 14, border: 0, borderRadius: 14, fontWeight: 900 }}>閉じる</button>
        </div>
      </div>}

      <a href="/" style={{ position: "fixed", left: 20, bottom: 20, zIndex: 1000, padding: "13px 18px", borderRadius: 999, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 800 }}>← 在庫管理</a>
    </main>
  );
}
