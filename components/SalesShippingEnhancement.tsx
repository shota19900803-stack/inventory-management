import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabaseBrowser } from "../lib/supabase";
import { PREFECTURES, CARRIERS, findRegion, type ShippingRateCard } from "../lib/shippingRates";

export default function SalesShippingEnhancement() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let timer: number | null = null;
    const findTarget = () => {
      const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4"));
      const heading = headings.find((el) => (el.textContent || "").includes("売上を登録"));
      const form = heading?.closest("section")?.querySelector("form") ?? null;
      if (!form) return;

      const labels = Array.from(form.querySelectorAll("label"));
      const notesLabel = labels.find((label) => (label.textContent || "").trim().startsWith("メモ"));

      if (notesLabel) {
        let host = notesLabel.parentElement?.querySelector("[data-sales-shipping-host]") as HTMLElement | null;
        if (!host) {
          host = document.createElement("div");
          host.setAttribute("data-sales-shipping-host", "true");
          host.style.gridColumn = "1 / -1";
          notesLabel.parentElement?.appendChild(host);
        }
        setTarget(host);
        return;
      }

      let host = form.querySelector("[data-sales-shipping-host]") as HTMLElement | null;
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-sales-shipping-host", "true");
        form.appendChild(host);
      }
      setTarget(host);
    };

    findTarget();
    timer = window.setInterval(findTarget, 700);
    return () => {
      if (timer) window.clearInterval(timer);
    };
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
  const [size, setSize] = useState("default");
  const [manualAmount, setManualAmount] = useState("");

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

  const services = useMemo(
    () => Array.from(new Set(cards.filter((c) => c.carrier === carrier).map((c) => c.service))),
    [cards, carrier],
  );

  const region = findRegion(prefecture, carrier);

  const selectedCard = useMemo(
    () => cards.find((c) => c.carrier === carrier && c.service === service && c.region === region) ?? null,
    [cards, carrier, service, region],
  );

  const sizeOptions = useMemo(
    () => carrier === "クロネコヤマト" ? [service] : selectedCard ? Object.keys(selectedCard.rates) : [],
    [carrier, service, selectedCard],
  );

  useEffect(() => {
    if (services.length && !services.includes(service)) setService(services[0]);
  }, [services, service]);

  useEffect(() => {
    if (sizeOptions.length && !sizeOptions.includes(size)) setSize(sizeOptions[0]);
  }, [sizeOptions, size]);

  const autoAmount = Number(selectedCard?.rates[size] ?? selectedCard?.rates.default ?? 0);
  const amount = manualAmount === "" ? autoAmount : Number(manualAmount);

  useEffect(() => {
    const form = target.closest("form");
    if (!form) return;

    const readValue = (labelText: string) => {
      const label = Array.from(form.querySelectorAll("label")).find((el) => (el.textContent || "").trim().startsWith(labelText));
      return (label?.querySelector("input") as HTMLInputElement | null)?.value?.trim() || "";
    };

    const onSubmit = () => {
      if (amount < 0) return;

      const productSelect = Array.from(form.querySelectorAll("select")).find((el) =>
        Array.from(el.options).some((option) => option.textContent === "商品を選択"),
      ) as HTMLSelectElement | undefined;

      const productId = productSelect?.value || "";
      const dateInput = form.querySelector('input[type="date"]') as HTMLInputElement | null;
      const priceInput = Array.from(form.querySelectorAll("input[type=number]"))[0] as HTMLInputElement | undefined;
      const quantityInput = Array.from(form.querySelectorAll("input[type=number]"))[2] as HTMLInputElement | undefined;
      const orderNumber = readValue("注文番号");

      if (!productId || !dateInput) return;

      const saleDate = dateInput.value;
      const unitPrice = Number(priceInput?.value || 0);
      const quantity = Number(quantityInput?.value || 1);

      window.setTimeout(async () => {
        const { data } = await supabaseBrowser
          .from("sales_history")
          .select("id,total_sales,total_cost,quantity,unit_price,order_number,created_at")
          .eq("product_id", productId)
          .eq("sale_date", saleDate)
          .eq("is_cancelled", false)
          .order("created_at", { ascending: false })
          .limit(30);

        const rows = (data ?? []) as any[];
        const matched = rows.find((row) =>
          Number(row.quantity || 0) === quantity &&
          Number(row.unit_price || 0) === unitPrice &&
          (orderNumber ? String(row.order_number || "").trim() === orderNumber : true),
        ) ?? rows[0];

        if (!matched) return;

        const grossProfit = Number(matched.total_sales || 0) - Number(matched.total_cost || 0) - amount;

        await supabaseBrowser
          .from("sales_history")
          .update({ shipping_cost: amount, gross_profit: grossProfit })
          .eq("id", matched.id);
      }, 1000);
    };

    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [target, amount]);

  return createPortal(
    <section style={{ marginTop: 18, padding: 18, borderRadius: 16, background: "#f0f9ff", border: "1px solid #bae6fd" }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: "#0369a1", letterSpacing: 1 }}>SHIPPING</div>
      <h3 style={{ margin: "4px 0 6px" }}>🚚 発送費</h3>
      <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: 13 }}>配送先・配送会社・発送方法から送料を自動計算します。必要なら手動変更できます。</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        <label>配送先都道府県
          <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)} style={inputStyle}>
            {PREFECTURES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label>配送会社
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} style={inputStyle}>
            {CARRIERS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>発送方法
          <select value={service} onChange={(e) => setService(e.target.value)} style={inputStyle}>
            {services.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>{carrier === "クロネコヤマト" ? "発送方法" : "サイズ"}
          <select value={size} onChange={(e) => setSize(e.target.value)} style={inputStyle}>
            {sizeOptions.map((s) => <option key={s}>{carrier === "クロネコヤマト" ? s : `${s}サイズ`}</option>)}
          </select>
        </label>
        <label>送料（手動変更可）
          <input inputMode="numeric" value={manualAmount} onChange={(e) => setManualAmount(e.target.value.replace(/\D/g, ""))} placeholder={`自動：¥${autoAmount.toLocaleString()}`} style={inputStyle} />
        </label>
      </div>
      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ color: "#64748b", fontSize: 13 }}>自動計算：{autoAmount ? `¥${autoAmount.toLocaleString()}` : "送料設定未登録"}</div>
        <strong style={{ fontSize: 24, color: "#0369a1" }}>送料 ¥{amount.toLocaleString()}</strong>
      </div>
      <div style={{ marginTop: 10, color: "#475569", fontSize: 12 }}>登録後の粗利は「売上 − 原価 − 送料」で計算します。</div>
    </section>,
    target,
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: 11,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  marginTop: 6,
  background: "#fff",
};
