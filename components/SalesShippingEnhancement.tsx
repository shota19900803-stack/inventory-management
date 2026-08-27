import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabaseBrowser } from "../lib/supabase";
import { PREFECTURES, CARRIERS, findRegion, type ShippingRateCard, SAGAWA, YUPACK, NEKOPOS, COMPACT, SAGAWA_SIZES, YUPACK_SIZES, YAMATO_SERVICES } from "../lib/shippingRates";

const SERVICE_OPTIONS: Record<string, string[]> = {
  "佐川急便": ["飛脚宅配便"],
  "郵便局": ["ゆうパック"],
  "クロネコヤマト": [...YAMATO_SERVICES],
};
const SIZE_OPTIONS: Record<string, string[]> = {
  "佐川急便": [...SAGAWA_SIZES],
  "郵便局": [...YUPACK_SIZES],
};
const YAMATO_COMPACT_BOX_COST = 70;
const SIZE_STORAGE_KEY = "inventory-sales-shipping-size";

type SaleSnapshot = {
  productId: string;
  date: string;
  price: number;
  quantity: number;
  order: string;
};

function readSavedSize(carrier: string, sizes: string[]): string {
  if (!sizes.length) return "";
  try {
    const saved = JSON.parse(sessionStorage.getItem(SIZE_STORAGE_KEY) || "{}") as Record<string, string>;
    return saved[carrier] && sizes.includes(saved[carrier]) ? saved[carrier] : sizes[0];
  } catch {
    return sizes[0];
  }
}

function saveSize(carrier: string, size: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SIZE_STORAGE_KEY) || "{}") as Record<string, string>;
    saved[carrier] = size;
    sessionStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(saved));
  } catch {}
}

function fallbackAmount(carrier: string, service: string, prefecture: string, size: string): number {
  const region = findRegion(prefecture, carrier);
  if (!region) return 0;
  if (carrier === "佐川急便") {
    const i = SAGAWA_SIZES.indexOf(size);
    return i >= 0 ? Number(SAGAWA[region]?.[i] ?? 0) : 0;
  }
  if (carrier === "郵便局") {
    const i = YUPACK_SIZES.indexOf(size);
    return i >= 0 ? Number(YUPACK[region]?.[i] ?? 0) : 0;
  }
  if (carrier === "クロネコヤマト") {
    if (service === "ネコポス") return Number(NEKOPOS[region] ?? 0);
    if (service === "宅急便コンパクト") return Number(COMPACT[region] ?? 0);
  }
  return 0;
}

export default function SalesShippingEnhancement() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const findTarget = () => {
      const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4"));
      const heading = headings.find((el) => /売上を(登録|編集)/.test((el.textContent || "").trim()));
      const form = heading?.closest("section")?.querySelector("form") ?? null;
      if (!form) return;

      const legacy = Array.from(form.querySelectorAll("label")).find((label) => {
        const input = label.querySelector("input") as HTMLInputElement | null;
        return (label.textContent || "").trim().startsWith("送料") && !!input;
      });
      if (legacy) (legacy as HTMLElement).style.display = "none";

      const notes = Array.from(form.querySelectorAll("label")).find((label) => (label.textContent || "").trim().startsWith("メモ"));
      let host = form.querySelector("[data-sales-shipping-host]") as HTMLElement | null;
      if (!host) {
        host = document.createElement("div");
        host.dataset.salesShippingHost = "true";
        host.style.gridColumn = "1 / -1";
        (notes?.parentElement ?? form).appendChild(host);
      }
      setTarget(host);
    };

    findTarget();
    const timer = window.setInterval(findTarget, 700);
    return () => window.clearInterval(timer);
  }, []);

  if (!target) return null;
  return <SalesShippingPanel target={target} />;
}

type Props = { target: HTMLElement };

function SalesShippingPanel({ target }: Props) {
  const [cards, setCards] = useState<ShippingRateCard[]>([]);
  const [prefecture, setPrefecture] = useState("岡山県");
  const [carrier, setCarrier] = useState("クロネコヤマト");
  const [service, setService] = useState("宅急便コンパクト");
  const [size, setSize] = useState("60");
  const [manualAmount, setManualAmount] = useState("");
  const [appliedMessage, setAppliedMessage] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const snapshotRef = useRef<SaleSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    supabaseBrowser.from("shipping_rate_cards").select("*").eq("active", true).order("sort_order").then(({ data }) => {
      if (active) setCards((data ?? []) as ShippingRateCard[]);
    });
    return () => { active = false; };
  }, []);

  const loadWallet = () => {
    supabaseBrowser.from("shipping_wallets").select("balance").eq("carrier", "クロネコヤマト").eq("active", true).maybeSingle().then(({ data }) => {
      setWalletBalance(data?.balance == null ? null : Number(data.balance));
    });
  };
  useEffect(loadWallet, []);

  const services = useMemo(() => SERVICE_OPTIONS[carrier] ?? [], [carrier]);
  const sizes = useMemo(() => SIZE_OPTIONS[carrier] ?? [], [carrier]);
  const region = findRegion(prefecture, carrier);

  useEffect(() => {
    if (!services.includes(service)) {
      setService(services[0] ?? "");
      setManualAmount("");
      setAppliedMessage("");
    }
  }, [services, service]);

  useEffect(() => {
    if (sizes.length) setSize((current) => sizes.includes(current) ? current : readSavedSize(carrier, sizes));
    else setSize("");
  }, [carrier, sizes]);

  useEffect(() => {
    if (sizes.length && size && sizes.includes(size)) saveSize(carrier, size);
  }, [carrier, size, sizes]);

  useEffect(() => {
    const onApply = (event: Event) => {
      const amount = Number((event as CustomEvent<{ amount?: number }>).detail?.amount ?? 0);
      if (!Number.isFinite(amount) || amount < 0) return;
      setManualAmount(String(Math.round(amount)));
      setAppliedMessage(`送料 ¥${Math.round(amount).toLocaleString()} を反映しました。`);
    };
    window.addEventListener("shipping-calculator-apply", onApply);
    return () => window.removeEventListener("shipping-calculator-apply", onApply);
  }, []);

  const dbCard = useMemo(() => cards.find((c) => c.carrier === carrier && c.service === service && c.region === region) ?? null, [cards, carrier, service, region]);
  const dbAmount = Number(dbCard?.rates[size] ?? dbCard?.rates.default ?? 0);
  const autoAmount = dbAmount > 0 ? dbAmount : fallbackAmount(carrier, service, prefecture, size);
  const amount = manualAmount === "" ? autoAmount : Number(manualAmount);
  const isCompact = carrier === "クロネコヤマト" && service === "宅急便コンパクト";
  const materialCost = isCompact ? YAMATO_COMPACT_BOX_COST : 0;
  const walletDebit = Math.max(0, Number(amount || 0)) + materialCost;

  useEffect(() => {
    const form = target.closest("form");
    if (!form) return;
    let pending = false;
    let timer: number | null = null;

    const readInput = (labelText: string) => {
      const label = Array.from(form.querySelectorAll("label")).find((el) => (el.textContent || "").trim().startsWith(labelText));
      return (label?.querySelector("input") as HTMLInputElement | null)?.value?.trim() || "";
    };

    const captureSnapshot = () => {
      const productSelect = Array.from(form.querySelectorAll("select")).find((el) => Array.from(el.options).some((o) => (o.textContent || "").trim() === "商品を選択")) as HTMLSelectElement | undefined;
      const numbers = Array.from(form.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
      const snapshot: SaleSnapshot = {
        productId: productSelect?.value || "",
        date: (form.querySelector('input[type="date"]') as HTMLInputElement | null)?.value || "",
        price: Number(numbers[0]?.value || 0),
        quantity: Number(numbers[2]?.value || 1),
        order: readInput("注文番号"),
      };
      snapshotRef.current = snapshot;
      return snapshot;
    };

    const syncAfterSave = async (snapshot: SaleSnapshot | null) => {
      if (pending || !snapshot?.productId || !snapshot.date) return;
      pending = true;
      const shipping = Math.max(0, Number(amount || 0));

      for (let attempt = 0; attempt < 15; attempt++) {
        const { data, error } = await supabaseBrowser
          .from("sales_history")
          .select("id,total_sales,total_cost,quantity,unit_price,order_number,shipping_cost,shipping_carrier,shipping_service,shipping_size,shipping_material_cost,shipping_wallet_transaction_id,created_at")
          .eq("product_id", snapshot.productId)
          .eq("sale_date", snapshot.date)
          .eq("is_cancelled", false)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          setAppliedMessage(`⚠️ 送料の保存に失敗：${error.message}`);
          break;
        }

        const rows = (data ?? []) as any[];
        const matched = rows.find((r) =>
          Number(r.quantity || 0) === snapshot.quantity &&
          Number(r.unit_price || 0) === snapshot.price &&
          (snapshot.order ? String(r.order_number || "").trim() === snapshot.order : true)
        );

        if (matched) {
          const already =
            Number(matched.shipping_cost || 0) === shipping &&
            String(matched.shipping_carrier || "") === carrier &&
            String(matched.shipping_service || "") === service &&
            String(matched.shipping_size || "") === size &&
            Number(matched.shipping_material_cost || 0) === materialCost;

          if (!already) {
            const { data: syncData, error: syncError } = await supabaseBrowser.rpc("sync_yamato_shipping_wallet", {
              p_sale_id: matched.id,
              p_carrier: carrier,
              p_service: service,
              p_size: size || null,
              p_shipping_cost: shipping,
              p_material_cost: materialCost,
            });

            if (syncError || syncData?.success === false) {
              console.error("送料同期エラー", syncError || syncData);
              setAppliedMessage(`⚠️ 送料の保存に失敗：${syncError?.message || syncData?.message || "確認してください"}`);
            } else {
              setAppliedMessage(`登録完了：送料 ¥${shipping.toLocaleString()} ＋ 専用BOX ¥${materialCost.toLocaleString()} を反映しました。`);
              if (syncData?.balance != null) setWalletBalance(Number(syncData.balance));
              else loadWallet();
            }
          }
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
      pending = false;
    };

    const scheduleSync = () => {
      const snapshot = snapshotRef.current ?? captureSnapshot();
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void syncAfterSave(snapshot); }, 600);
    };

    const onSubmit = () => {
      captureSnapshot();
      scheduleSync();
    };

    const onClick = (event: Event) => {
      const button = event.target as HTMLElement | null;
      if (!button) return;
      const text = (button.textContent || "").trim();
      if (text.includes("売上を登録") || text.includes("売上を更新する")) {
        captureSnapshot();
        scheduleSync();
      }
    };

    form.addEventListener("submit", onSubmit, true);
    form.addEventListener("click", onClick, true);
    return () => {
      form.removeEventListener("submit", onSubmit, true);
      form.removeEventListener("click", onClick, true);
      if (timer) window.clearTimeout(timer);
    };
  }, [target, amount, carrier, service, size, materialCost]);

  return createPortal(
    <section data-sales-shipping-panel="true" style={{ marginTop: 18, padding: 18, borderRadius: 16, background: "#f0f9ff", border: "1px solid #bae6fd" }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: "#0369a1", letterSpacing: 1 }}>SHIPPING</div>
      <h3 style={{ margin: "4px 0 6px" }}>🚚 発送費</h3>
      <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: 13 }}>配送先・配送会社・発送方法（必要な場合はサイズ）を選ぶだけで送料を自動計算します。</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        <label>配送先都道府県<select value={prefecture} onChange={(e) => { setPrefecture(e.target.value); setManualAmount(""); setAppliedMessage(""); }} style={inputStyle}>{PREFECTURES.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label>配送会社<select value={carrier} onChange={(e) => { setCarrier(e.target.value); setManualAmount(""); setAppliedMessage(""); }} style={inputStyle}>{CARRIERS.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>発送方法<select value={service} onChange={(e) => { setService(e.target.value); setManualAmount(""); setAppliedMessage(""); }} style={inputStyle}>{services.map((s) => <option key={s}>{s}</option>)}</select></label>
        {sizes.length > 0 && <label>サイズ<select value={size} onChange={(e) => { const next = e.currentTarget.value; setSize(next); saveSize(carrier, next); setManualAmount(""); setAppliedMessage(""); }} style={inputStyle}>{sizes.map((s) => <option key={s} value={s}>{s}サイズ</option>)}</select></label>}
        <label>送料（手動変更可）<input inputMode="numeric" value={manualAmount} onChange={(e) => { setManualAmount(e.target.value.replace(/\D/g, "")); setAppliedMessage(""); }} placeholder={`自動：¥${autoAmount.toLocaleString()}`} style={inputStyle} /></label>
      </div>
      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ color: "#64748b", fontSize: 13 }}>{autoAmount ? `自動計算：¥${autoAmount.toLocaleString()}` : "送料設定が見つかりません"}{isCompact && <div style={{ marginTop: 4 }}>＋ 専用BOX：¥{YAMATO_COMPACT_BOX_COST.toLocaleString()}（1発送につき）</div>}{appliedMessage && <div style={{ color: appliedMessage.startsWith("⚠️") ? "#b45309" : "#047857", fontWeight: 700, marginTop: 4 }}>{appliedMessage}</div>}</div>
        <div style={{ textAlign: "right" }}><strong style={{ display: "block", fontSize: 24, color: "#0369a1" }}>送料 ¥{Number(amount || 0).toLocaleString()}</strong>{isCompact && <span style={{ color: "#475569", fontSize: 12 }}>ヤマト残高減少予定 ¥{walletDebit.toLocaleString()}</span>}{walletBalance != null && carrier === "クロネコヤマト" && <span style={{ display: "block", color: "#047857", fontSize: 12, fontWeight: 800 }}>現在のヤマト残高 ¥{walletBalance.toLocaleString()}</span>}</div>
      </div>
      <div style={{ marginTop: 10, color: "#475569", fontSize: 12 }}>登録後の粗利は「売上 − 原価 − 送料 − 専用BOX代」で計算します。宅急便コンパクトは1発送につき専用BOX代70円もヤマト残高から自動減算します。</div>
    </section>,
    target,
  );
}

const inputStyle: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", padding: 11, borderRadius: 10, border: "1px solid #cbd5e1", marginTop: 6, background: "#fff" };