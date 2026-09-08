"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type Sale = {
  id: string;
  sale_date: string;
  sales_channel?: string | null;
  quantity?: number | null;
  total_sales?: number | null;
  total_cost?: number | null;
  shipping_cost?: number | null;
  is_cancelled?: boolean;
};

const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const monthOf = (d: string) => d.slice(0, 7);

const CHANNELS = ["楽天市場", "Amazon", "Yahoo!ショッピング", "メルカリ", "その他"] as const;
type Channel = (typeof CHANNELS)[number];

type RateMap = Record<Channel, number>;

const initialMarketplaceRates: RateMap = {
  "楽天市場": 8,
  Amazon: 10,
  "Yahoo!ショッピング": 6,
  "メルカリ": 10,
  その他: 0,
};

const initialAdRates: RateMap = {
  "楽天市場": 3,
  Amazon: 0,
  "Yahoo!ショッピング": 0,
  "メルカリ": 0,
  その他: 0,
};

export default function ProfitAnalysis() {
  const sb = supabaseBrowser;
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);
  const [marketplaceRates, setMarketplaceRates] = useState<RateMap>(initialMarketplaceRates);
  const [adRates, setAdRates] = useState<RateMap>(initialAdRates);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await sb
        .from("sales_history")
        .select("id,sale_date,sales_channel,quantity,total_sales,total_cost,shipping_cost,is_cancelled")
        .eq("is_cancelled", false)
        .order("sale_date", { ascending: false })
        .limit(20000);
      if (error) setMessage(`売上読み込みエラー：${error.message}`);
      setSales((data ?? []) as Sale[]);
      setLoading(false);
    })();
  }, [sb]);

  const months = useMemo(
    () => Array.from(new Set([thisMonth, ...sales.map((s) => monthOf(s.sale_date))])).sort().reverse(),
    [sales]
  );

  const monthSales = useMemo(
    () => sales.filter((s) => monthOf(s.sale_date) === selectedMonth),
    [sales, selectedMonth]
  );

  const rows = useMemo(() => {
    const map: Record<string, { sales: number; cost: number; shipping: number; qty: number }> = {};
    monthSales.forEach((s) => {
      const channel = CHANNELS.includes((s.sales_channel || "その他") as Channel)
        ? ((s.sales_channel || "その他") as Channel)
        : "その他";
      map[channel] ??= { sales: 0, cost: 0, shipping: 0, qty: 0 };
      map[channel].sales += Number(s.total_sales || 0);
      map[channel].cost += Number(s.total_cost || 0);
      map[channel].shipping += Number(s.shipping_cost || 0);
      map[channel].qty += Number(s.quantity || 0);
    });

    return CHANNELS.map((channel) => {
      const v = map[channel] || { sales: 0, cost: 0, shipping: 0, qty: 0 };
      const marketplaceFee = v.sales * (marketplaceRates[channel] / 100);
      const adFee = v.sales * (adRates[channel] / 100);
      const productGross = v.sales - v.cost;
      const directProfit = productGross - v.shipping;
      const actualLikeProfit = directProfit - marketplaceFee - adFee;
      return {
        channel,
        ...v,
        marketplaceFee,
        adFee,
        productGross,
        directProfit,
        actualLikeProfit,
        margin: v.sales ? (actualLikeProfit / v.sales) * 100 : 0,
      };
    }).filter((r) => r.sales > 0 || r.cost > 0 || r.shipping > 0);
  }, [monthSales, marketplaceRates, adRates]);

  const total = useMemo(
    () => rows.reduce(
      (a, r) => ({
        sales: a.sales + r.sales,
        cost: a.cost + r.cost,
        shipping: a.shipping + r.shipping,
        marketplaceFee: a.marketplaceFee + r.marketplaceFee,
        adFee: a.adFee + r.adFee,
        productGross: a.productGross + r.productGross,
        directProfit: a.directProfit + r.directProfit,
        actualLikeProfit: a.actualLikeProfit + r.actualLikeProfit,
      }),
      { sales: 0, cost: 0, shipping: 0, marketplaceFee: 0, adFee: 0, productGross: 0, directProfit: 0, actualLikeProfit: 0 }
    ),
    [rows]
  );

  const updateRate = (kind: "marketplace" | "ad", channel: Channel, value: string) => {
    const n = Math.max(0, Number(value) || 0);
    if (kind === "marketplace") setMarketplaceRates((p) => ({ ...p, [channel]: n }));
    else setAdRates((p) => ({ ...p, [channel]: n }));
  };

  if (loading) return <main style={{ padding: 40, fontFamily: "system-ui" }}>実質粗利分析を読み込んでいます…</main>;

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fb", padding: "28px 18px 70px", color: "#111827", fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 3, color: "#6b7280", fontWeight: 800 }}>CROSS NODE MANAGEMENT</div>
            <h1 style={{ margin: "4px 0", fontSize: 34 }}>実質粗利シミュレーター</h1>
            <p style={{ margin: 0, color: "#6b7280" }}>「本当に経営判断に使える粗利」を試算する画面です。</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff" }}>
              {months.map((m) => <option key={m}>{m}</option>)}
            </select>
            <a href="/management" style={{ padding: "11px 15px", borderRadius: 10, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 700 }}>← 経営ダッシュボード</a>
          </div>
        </header>

        {message && <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", padding: "12px 16px", borderRadius: 10, marginBottom: 16 }}>{message}</div>}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 12 }}>
          {[
            ["売上", total.sales],
            ["FIFO商品原価", total.cost],
            ["送料", total.shipping],
            ["商品粗利", total.productGross],
            ["販売関連費（見込）", total.marketplaceFee + total.adFee],
            ["実質粗利", total.actualLikeProfit],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{label}</div>
              <b style={{ display: "block", fontSize: 24, marginTop: 7, color: label === "実質粗利" ? (Number(value) >= 0 ? "#15803d" : "#dc2626") : "#111827" }}>{yen(Number(value))}</b>
            </div>
          ))}
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>販売関連費の試算率</h2>
              <p style={{ margin: "7px 0 0", color: "#6b7280", lineHeight: 1.6 }}>現在はデモ用の仮設定です。楽天の請求書・RMSデータをもらえれば、実際の費目に合わせてここを確定仕様にできます。</p>
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 999, background: "#fff7ed", color: "#9a3412", fontSize: 12, fontWeight: 800 }}>⚠️ 仮設定</div>
          </div>
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
              <thead><tr>{["販売先", "販売手数料率", "RPP・広告等", "売上", "販売手数料", "広告費", "実質粗利", "実質粗利率"].map((h) => <th key={h} style={{ padding: 9, borderBottom: "2px solid #e5e7eb", textAlign: h === "販売先" ? "left" : "right", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => <tr key={r.channel}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{r.channel}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}><label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="number" min="0" step="0.1" value={marketplaceRates[r.channel]} onChange={(e) => updateRate("marketplace", r.channel, e.target.value)} style={{ width: 70, padding: "7px 6px", border: "1px solid #d1d5db", borderRadius: 8, textAlign: "right" }} />%</label></td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}><label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="number" min="0" step="0.1" value={adRates[r.channel]} onChange={(e) => updateRate("ad", r.channel, e.target.value)} style={{ width: 70, padding: "7px 6px", border: "1px solid #d1d5db", borderRadius: 8, textAlign: "right" }} />%</label></td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>{yen(r.sales)}</td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>{yen(r.marketplaceFee)}</td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>{yen(r.adFee)}</td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9", fontWeight: 800, color: r.actualLikeProfit >= 0 ? "#15803d" : "#dc2626" }}>{yen(r.actualLikeProfit)}</td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{r.margin.toFixed(1)}%</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20, marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>この画面で見る数字</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            {[
              ["① 商品粗利", "売上 − FIFO商品原価"],
              ["② 実質粗利", "商品粗利 − 送料 − 販売関連費"],
              ["③ 実質粗利率", "実質粗利 ÷ 売上"],
              ["④ 後から確定", "請求書到着時に見込額→確定額へ"],
            ].map(([title, desc]) => <div key={title} style={{ background: "#f8fafc", borderRadius: 12, padding: 14 }}><b>{title}</b><div style={{ marginTop: 5, color: "#6b7280", lineHeight: 1.6 }}>{desc}</div></div>)}
          </div>
        </section>
      </div>
    </main>
  );
}
