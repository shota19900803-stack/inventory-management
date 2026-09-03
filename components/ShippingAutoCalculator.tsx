"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";
import {
  PREFECTURES,
  CARRIERS,
  findRegion,
  type ShippingRateCard,
  SAGAWA,
  YUPACK,
  NEKOPOS,
  COMPACT,
  SAGAWA_SIZES,
  YUPACK_SIZES,
  YAMATO_SERVICES,
} from "../lib/shippingRates";

const SERVICE_OPTIONS: Record<string, string[]> = {
  "佐川急便": ["飛脚宅配便"],
  "郵便局": ["ゆうパック", "レターパック"],
  "クロネコヤマト": [...YAMATO_SERVICES],
};

const SIZE_OPTIONS: Record<string, string[]> = {
  "佐川急便": [...SAGAWA_SIZES],
  "郵便局": [...YUPACK_SIZES],
};

function fallbackAmount(carrier: string, service: string, prefecture: string, size: string): number {
  // レターパックは全国一律600円。都道府県・サイズには依存しない。
  if (carrier === "郵便局" && service === "レターパック") return 600;

  const region = findRegion(prefecture, carrier);
  if (!region) return 0;

  if (carrier === "佐川急便") {
    const index = SAGAWA_SIZES.indexOf(size);
    return index >= 0 ? Number(SAGAWA[region]?.[index] ?? 0) : 0;
  }

  if (carrier === "郵便局") {
    const index = YUPACK_SIZES.indexOf(size);
    return index >= 0 ? Number(YUPACK[region]?.[index] ?? 0) : 0;
  }

  if (carrier === "クロネコヤマト") {
    if (service === "ネコポス") return Number(NEKOPOS[region] ?? 0);
    if (service === "宅急便コンパクト") return Number(COMPACT[region] ?? 0);
  }

  return 0;
}

export default function ShippingAutoCalculator() {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<ShippingRateCard[]>([]);
  const [prefecture, setPrefecture] = useState("岡山県");
  const [carrier, setCarrier] = useState("クロネコヤマト");
  const [service, setService] = useState("宅急便コンパクト");
  const [size, setSize] = useState("60");
  const [manualAmount, setManualAmount] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    supabaseBrowser
      .from("shipping_rate_cards")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (active) setCards((data ?? []) as ShippingRateCard[]);
      });
    return () => { active = false; };
  }, []);

  const services = useMemo(() => SERVICE_OPTIONS[carrier] ?? [], [carrier]);
  const sizes = useMemo(() => SIZE_OPTIONS[carrier] ?? [], [carrier]);
  const region = findRegion(prefecture, carrier);

  useEffect(() => {
    if (!services.includes(service)) setService(services[0] ?? "");
  }, [services, service]);

  useEffect(() => {
    if (sizes.length > 0) {
      if (!sizes.includes(size)) setSize(sizes[0]);
    } else if (size !== "") {
      setSize("");
    }
  }, [sizes, size]);

  const dbCard = useMemo(
    () => cards.find((c) => c.carrier === carrier && c.service === service && c.region === region) ?? null,
    [cards, carrier, service, region],
  );

  const dbAmount = Number(dbCard?.rates[size] ?? dbCard?.rates.default ?? 0);
  const defaultAmount = fallbackAmount(carrier, service, prefecture, size);
  // レターパックは設定DBに値があっても、指定の600円を優先する。
  const autoAmount = carrier === "郵便局" && service === "レターパック"
    ? 600
    : (dbAmount > 0 ? dbAmount : defaultAmount);
  const amount = manualAmount === "" ? autoAmount : Number(manualAmount);

  const applyToSaleForm = () => {
    const nextAmount = Math.max(0, Number(amount || 0));

    // 新しい発送費パネルへ直接反映する。
    window.dispatchEvent(new CustomEvent("shipping-calculator-apply", {
      detail: { amount: nextAmount },
    }));

    // 旧送料欄が残っている画面でも反映できるようにしておく。
    const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
    const input = inputs.find((i) => i.placeholder?.includes("750")) || inputs.find((i) => (i.parentElement?.textContent ?? "").trim().startsWith("送料"));
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, String(nextAmount));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setStatus(`送料 ¥${nextAmount.toLocaleString()} を売上登録へ反映しました。`);
    setOpen(false);
  };

  const buttonStyle: React.CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: 280,
    transform: "translateX(-50%)",
    zIndex: 1100,
    border: 0,
    borderRadius: 999,
    padding: "13px 22px",
    background: "#0369a1",
    color: "white",
    fontWeight: 900,
    fontSize: 15,
    boxShadow: "0 8px 24px rgba(3,105,161,.25)",
    cursor: "pointer",
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={buttonStyle}>
        🚚 送料自動計算
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,23,42,.48)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div style={{ width: "min(560px,100%)", maxHeight: "90vh", overflowY: "auto", background: "white", borderRadius: 24, padding: 24, boxShadow: "0 24px 80px rgba(0,0,0,.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b" }}>SHIPPING CALCULATOR</div>
                <h2 style={{ margin: "4px 0 0", fontSize: 25 }}>🚚 発送費を自動計算</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{ border: 0, background: "#f1f5f9", borderRadius: 999, padding: "8px 13px", fontWeight: 800, cursor: "pointer" }}>閉じる</button>
            </div>

            <p style={{ color: "#64748b", lineHeight: 1.6 }}>配送先・配送会社・発送方法を選ぶだけで送料を算出し、売上登録へ反映します。</p>

            <div style={{ display: "grid", gap: 14 }}>
              <label>
                配送先都道府県
                <select value={prefecture} onChange={(e) => { setPrefecture(e.target.value); setManualAmount(""); }} style={inputStyle}>
                  {PREFECTURES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>

              <label>
                配送会社
                <select value={carrier} onChange={(e) => { setCarrier(e.target.value); setManualAmount(""); }} style={inputStyle}>
                  {CARRIERS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>

              <label>
                発送方法
                <select value={service} onChange={(e) => { setService(e.target.value); setManualAmount(""); }} style={inputStyle}>
                  {services.length === 0 && <option value="">発送方法を選択</option>}
                  {services.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>

              {sizes.length > 0 && (
                <label>
                  サイズ
                  <select value={size} onChange={(e) => { setSize(e.target.value); setManualAmount(""); }} style={inputStyle}>
                    {sizes.map((s) => <option key={s} value={s}>{s}サイズ</option>)}
                  </select>
                </label>
              )}

              <label>
                送料を手動変更（任意）
                <input inputMode="numeric" value={manualAmount} onChange={(e) => setManualAmount(e.target.value.replace(/\D/g, ""))} placeholder={`自動：¥${autoAmount.toLocaleString()}`} style={inputStyle} />
              </label>
            </div>

            <div style={{ marginTop: 18, padding: 18, borderRadius: 16, background: "#f0f9ff", textAlign: "center" }}>
              <div style={{ color: "#0369a1", fontWeight: 800 }}>今回の送料</div>
              <div style={{ fontSize: 32, fontWeight: 900, marginTop: 4 }}>¥{amount.toLocaleString()}</div>
            </div>

            {status && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#ecfdf5", color: "#047857", fontWeight: 700 }}>{status}</div>}

            <button type="button" onClick={applyToSaleForm} style={{ width: "100%", marginTop: 16, padding: 15, border: 0, borderRadius: 14, background: "#0369a1", color: "white", fontWeight: 900, fontSize: 16, cursor: "pointer" }}>
              送料を売上登録へ反映
            </button>
            <a href="/shipping-settings" style={{ display: "block", textAlign: "center", marginTop: 14, color: "#0369a1", fontWeight: 800, textDecoration: "none" }}>
              ⚙️ 送料設定を編集する
            </a>
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  marginTop: 6,
  background: "#fff",
};
