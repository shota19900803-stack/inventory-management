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

type MarketplaceCost = {
  id: string;
  platform: string;
  expense_month: string | null;
  billing_month: string | null;
  fee_type: string;
  description?: string | null;
  amount?: number | null;
  total_amount?: number | null;
  status?: string | null;
  source_filename?: string | null;
};

type Expense = {
  id: string;
  entry_date: string;
  category: string;
  description: string;
  amount: number;
  vendor?: string | null;
};

const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const monthOf = (d: string | null | undefined) => (d || "").slice(0, 7);

const CHANNELS = ["楽天市場", "Amazon", "メルカリ", "その他"] as const;
type Channel = (typeof CHANNELS)[number];

const channelLabel: Record<Channel, string> = {
  "楽天市場": "楽天",
  Amazon: "Amazon",
  "メルカリ": "メルカリ",
  その他: "その他",
};

export default function ProfitAnalysis() {
  const sb = supabaseBrowser;
  const [sales, setSales] = useState<Sale[]>([]);
  const [marketplaceCosts, setMarketplaceCosts] = useState<MarketplaceCost[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [salesResult, costResult, expenseResult] = await Promise.all([
        sb
          .from("sales_history")
          .select("id,sale_date,sales_channel,quantity,total_sales,total_cost,shipping_cost,is_cancelled")
          .eq("is_cancelled", false)
          .order("sale_date", { ascending: false })
          .limit(20000),
        sb
          .from("marketplace_cost_entries")
          .select("id,platform,expense_month,billing_month,fee_type,description,amount,total_amount,status,source_filename")
          .order("expense_month", { ascending: false })
          .limit(20000),
        sb
          .from("expense_entries")
          .select("id,entry_date,category,description,amount,vendor")
          .order("entry_date", { ascending: false })
          .limit(10000),
      ]);

      if (!alive) return;
      const errors = [salesResult.error, costResult.error, expenseResult.error].filter(Boolean);
      if (errors.length) setMessage(`一部データを読み込めませんでした：${errors[0]?.message}`);
      setSales((salesResult.data ?? []) as Sale[]);
      setMarketplaceCosts((costResult.data ?? []) as MarketplaceCost[]);
      setExpenses((expenseResult.data ?? []) as Expense[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [sb]);

  const months = useMemo(() => {
    const values = new Set<string>([thisMonth]);
    sales.forEach((s) => values.add(monthOf(s.sale_date)));
    marketplaceCosts.forEach((c) => { if (c.expense_month) values.add(monthOf(c.expense_month)); });
    expenses.forEach((e) => values.add(monthOf(e.entry_date)));
    values.delete("");
    return Array.from(values).sort().reverse();
  }, [sales, marketplaceCosts, expenses]);

  const monthSales = useMemo(() => sales.filter((s) => monthOf(s.sale_date) === selectedMonth), [sales, selectedMonth]);
  const monthCosts = useMemo(() => marketplaceCosts.filter((c) => monthOf(c.expense_month) === selectedMonth), [marketplaceCosts, selectedMonth]);
  const monthExpenses = useMemo(() => expenses.filter((e) => monthOf(e.entry_date) === selectedMonth), [expenses, selectedMonth]);

  const salesByChannel = useMemo(() => {
    const map: Record<Channel, { sales: number; cost: number; shipping: number; qty: number }> = {
      "楽天市場": { sales: 0, cost: 0, shipping: 0, qty: 0 },
      Amazon: { sales: 0, cost: 0, shipping: 0, qty: 0 },
      "メルカリ": { sales: 0, cost: 0, shipping: 0, qty: 0 },
      その他: { sales: 0, cost: 0, shipping: 0, qty: 0 },
    };
    monthSales.forEach((s) => {
      const channel = CHANNELS.includes((s.sales_channel || "その他") as Channel)
        ? (s.sales_channel as Channel)
        : "その他";
      map[channel].sales += Number(s.total_sales || 0);
      map[channel].cost += Number(s.total_cost || 0);
      map[channel].shipping += Number(s.shipping_cost || 0);
      map[channel].qty += Number(s.quantity || 0);
    });
    return map;
  }, [monthSales]);

  const costsByChannel = useMemo(() => {
    const map: Record<Channel, { amount: number; count: number; actual: boolean; byType: Record<string, number> }> = {
      "楽天市場": { amount: 0, count: 0, actual: false, byType: {} },
      Amazon: { amount: 0, count: 0, actual: false, byType: {} },
      "メルカリ": { amount: 0, count: 0, actual: false, byType: {} },
      その他: { amount: 0, count: 0, actual: false, byType: {} },
    };
    monthCosts.forEach((c) => {
      const channel = CHANNELS.includes(c.platform as Channel) ? (c.platform as Channel) : "その他";
      const amount = Number(c.amount ?? c.total_amount ?? 0);
      map[channel].amount += amount;
      map[channel].count += 1;
      map[channel].actual = true;
      map[channel].byType[c.fee_type] = (map[channel].byType[c.fee_type] || 0) + amount;
    });
    return map;
  }, [monthCosts]);

  const rows = useMemo(() => CHANNELS.map((channel) => {
    const salesData = salesByChannel[channel];
    const imported = costsByChannel[channel];
    let marketplaceFee = imported.amount;
    let feeSource = imported.actual ? "請求実績" : "未取込";

    // Mercari is a known fixed rule. Other channels do not use made-up rates:
    // they become actual costs once their statement is imported.
    if (channel === "メルカリ" && salesData.sales > 0 && !imported.actual) {
      marketplaceFee = salesData.sales * 0.10;
      feeSource = "10%ルール";
    }

    const productGross = salesData.sales - salesData.cost;
    const directProfit = productGross - salesData.shipping;
    const profit = directProfit - marketplaceFee;
    return {
      channel,
      ...salesData,
      ...imported,
      marketplaceFee,
      feeSource,
      productGross,
      directProfit,
      profit,
      margin: salesData.sales ? (profit / salesData.sales) * 100 : 0,
    };
  }).filter((r) => r.sales > 0 || r.cost > 0 || r.shipping > 0 || r.amount > 0), [salesByChannel, costsByChannel]);

  const total = useMemo(() => rows.reduce((a, r) => ({
    sales: a.sales + r.sales,
    cost: a.cost + r.cost,
    shipping: a.shipping + r.shipping,
    marketplaceFee: a.marketplaceFee + r.marketplaceFee,
    productGross: a.productGross + r.productGross,
    directProfit: a.directProfit + r.directProfit,
    profit: a.profit + r.profit,
  }), { sales: 0, cost: 0, shipping: 0, marketplaceFee: 0, productGross: 0, directProfit: 0, profit: 0 }), [rows]);

  const normalExpenses = monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const operatingProfit = total.profit - normalExpenses;
  const marketplaceActualTotal = monthCosts.reduce((sum, c) => sum + Number(c.amount ?? c.total_amount ?? 0), 0);
  const hasUnimportedSalesChannel = rows.some((r) => r.sales > 0 && !r.actual && r.channel !== "メルカリ");

  const typeBreakdown = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    monthCosts.forEach((c) => {
      const key = `${c.platform}｜${c.fee_type}`;
      map[key] ??= { amount: 0, count: 0 };
      map[key].amount += Number(c.amount ?? c.total_amount ?? 0);
      map[key].count += 1;
    });
    return Object.entries(map).sort((a, b) => b[1].amount - a[1].amount);
  }, [monthCosts]);

  if (loading) return <main style={{ padding: 40, fontFamily: "system-ui" }}>実質粗利分析を読み込んでいます…</main>;

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fb", padding: "28px 18px 70px", color: "#111827", fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 3, color: "#6b7280", fontWeight: 800 }}>CROSS NODE MANAGEMENT</div>
            <h1 style={{ margin: "4px 0", fontSize: 34 }}>実質粗利</h1>
            <p style={{ margin: 0, color: "#6b7280" }}>商品原価・送料・モール費用を含めて「本当に残る利益」を見る画面です。</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff" }}>
              {months.map((m) => <option key={m}>{m}</option>)}
            </select>
            <a href="/accounting" style={{ padding: "11px 15px", borderRadius: 10, background: "#166534", color: "#fff", textDecoration: "none", fontWeight: 800 }}>📄 請求PDF</a>
            <a href="/management" style={{ padding: "11px 15px", borderRadius: 10, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 700 }}>← 経営ダッシュボード</a>
          </div>
        </header>

        {message && <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", padding: "12px 16px", borderRadius: 10, marginBottom: 16 }}>{message}</div>}
        {hasUnimportedSalesChannel && <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: "12px 16px", borderRadius: 10, marginBottom: 16, lineHeight: 1.6 }}><b>⚠️ 未確定の販売関連費があります。</b> 楽天・Amazonは請求PDFを取り込むと実績費用が反映されます。未取込の費用を0円として「儲かっている」と判断しないでください。</div>}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          {[
            ["売上", total.sales],
            ["FIFO商品原価", total.cost],
            ["送料", total.shipping],
            ["商品粗利", total.productGross],
            ["モール費用", total.marketplaceFee],
            ["実質粗利", total.profit],
            ["一般経費", normalExpenses],
            ["営業利益（簡易）", operatingProfit],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{label}</div>
              <b style={{ display: "block", fontSize: 23, marginTop: 7, color: String(label).includes("利益") || label === "実質粗利" ? (Number(value) >= 0 ? "#15803d" : "#dc2626") : "#111827" }}>{yen(Number(value))}</b>
            </div>
          ))}
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>販売先別の実質粗利</h2>
              <p style={{ margin: "7px 0 0", color: "#6b7280", lineHeight: 1.6 }}>楽天・Amazonは取り込んだ請求実績、メルカリは売上の10%を使用。仮の一律手数料率は使いません。</p>
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 999, background: "#ecfdf5", color: "#166534", fontSize: 12, fontWeight: 800 }}>実績ベース</div>
          </div>
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
              <thead><tr>{["販売先", "売上", "FIFO原価", "送料", "モール費用", "費用の根拠", "実質粗利", "粗利率"].map((h) => <th key={h} style={{ padding: 10, borderBottom: "2px solid #e5e7eb", textAlign: h === "販売先" || h === "費用の根拠" ? "left" : "right", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => <tr key={r.channel}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{channelLabel[r.channel]}</td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>{yen(r.sales)}</td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>{yen(r.cost)}</td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>{yen(r.shipping)}</td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>{yen(r.marketplaceFee)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: r.feeSource === "未取込" ? "#b45309" : "#475569", fontSize: 12 }}>{r.feeSource}{r.actual ? `（${r.count}件）` : ""}</td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9", fontWeight: 900, color: r.profit >= 0 ? "#15803d" : "#dc2626" }}>{yen(r.profit)}</td>
                  <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{r.margin.toFixed(1)}%</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(280px,.8fr)", gap: 18, marginTop: 18 }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 }}>
            <h2 style={{ margin: 0 }}>今月のモール費用内訳</h2>
            {typeBreakdown.length === 0 ? (
              <p style={{ color: "#6b7280" }}>この月に登録されたモール請求費用はありません。</p>
            ) : (
              <div style={{ marginTop: 12 }}>
                {typeBreakdown.map(([key, value]) => <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}><span>{key}</span><b>{yen(value.amount)}</b></div>)}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontWeight: 900 }}><span>請求実績合計</span><span>{yen(marketplaceActualTotal)}</span></div>
              </div>
            )}
          </div>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 }}>
            <h2 style={{ margin: 0 }}>計算の考え方</h2>
            <div style={{ marginTop: 12, color: "#475569", lineHeight: 1.8 }}>
              <div><b>商品粗利</b> ＝ 売上 − FIFO商品原価</div>
              <div><b>実質粗利</b> ＝ 商品粗利 − 送料 − モール費用</div>
              <div><b>営業利益（簡易）</b> ＝ 実質粗利 − 一般経費</div>
            </div>
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#f8fafc", fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
              モール請求書の「発生月」で費用を計上し、「請求月」は請求書管理用に保持します。これにより、後から請求されるRPP等も売上が発生した月の利益へ反映できます。
            </div>
            <a href="/accounting" style={{ display: "inline-block", marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "#f1f5f9", color: "#111827", textDecoration: "none", fontWeight: 800 }}>📄 請求PDFを取り込む</a>
          </div>
        </section>

        <section style={{ marginTop: 18, padding: 16, borderRadius: 14, background: "#fff", border: "1px solid #e5e7eb", color: "#64748b", fontSize: 12, lineHeight: 1.7 }}>
          <b style={{ color: "#334155" }}>注意：</b> 楽天・Amazonの請求PDFをまだ取り込んでいない月は、モール費用が未計上の可能性があります。特に楽天・Amazonの実質粗利は、請求実績を取り込んでから判断してください。メルカリは現時点で10%固定ルールです。
        </section>
      </div>
    </main>
  );
}
