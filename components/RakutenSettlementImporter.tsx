"use client";

import { useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type Settlement = {
  platform: "楽天市場";
  document_type: "楽天精算・振込明細";
  source_hash: string;
  source_filename: string;
  settlement_date: string | null;
  payment_period_start: string | null;
  payment_period_end: string | null;
  payment_calculation_amount: number;
  billing_cutoff_date: string | null;
  billing_calculation_amount: number;
  net_transfer_amount: number;
  status: "予定" | "確定";
};

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const date = (v: string | null) => v ? v.replace(/-/g, "/") : "—";

export default function RakutenSettlementImporter() {
  const supabase = supabaseBrowser;
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function analyze() {
    if (!file) return;
    setBusy(true); setMessage(""); setSettlement(null);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/accounting/import-rakuten-settlement", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "精算PDFを解析できませんでした。");
      setSettlement(data.settlement as Settlement);
      setMessage("精算・振込情報を読み取りました。登録前に確認してください。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDFの解析に失敗しました。");
    } finally { setBusy(false); }
  }

  async function save() {
    if (!settlement) return;
    setBusy(true); setMessage("");
    try {
      const { data: existing, error: existingError } = await supabase.from("rakuten_settlements").select("id").eq("source_hash", settlement.source_hash).limit(1);
      if (existingError) throw existingError;
      if ((existing || []).length) { setMessage("この精算PDFはすでに登録済みです。二重登録を防止しました。"); return; }
      const { error } = await supabase.from("rakuten_settlements").insert(settlement);
      if (error) throw error;
      setMessage("楽天の精算・振込情報を登録しました。利益計算とは分離して資金繰りに反映します。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登録に失敗しました。");
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} style={{ position: "fixed", right: 20, bottom: 124, zIndex: 1200, border: 0, borderRadius: 999, padding: "11px 17px", background: "#1d4ed8", color: "#fff", fontWeight: 900, boxShadow: "0 8px 24px rgba(17,24,39,.18)", cursor: "pointer" }}>💰 楽天の精算・振込を取り込む</button>
    {open && <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(17,24,39,.42)", padding: 20, overflowY: "auto" }}>
      <section style={{ width: "min(1000px, 100%)", margin: "20px auto", background: "#fff", borderRadius: 18, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div><div style={{ fontSize: 12, letterSpacing: 1.5, color: "#6b7280", fontWeight: 800 }}>CASHFLOW</div><h2 style={{ margin: "4px 0 5px" }}>💰 楽天の精算・振込を自動管理</h2><p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6 }}>売上・請求・実際の振込を分けて管理します。請求額は利益計算へ、振込額は資金繰りへ使います。</p></div>
          <button type="button" onClick={() => setOpen(false)} style={{ border: 0, background: "#f3f4f6", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontWeight: 800 }}>閉じる</button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}><input type="file" accept="application/pdf,.pdf" onChange={(e) => { setFile(e.target.files?.[0] || null); setSettlement(null); setMessage(""); }} /><button type="button" onClick={analyze} disabled={!file || busy} style={{ border: 0, borderRadius: 10, padding: "10px 16px", background: "#111827", color: "#fff", fontWeight: 800, opacity: !file || busy ? .55 : 1 }}>{busy ? "読み取り中…" : "精算PDFを読み取る"}</button></div>
        {message && <div style={{ marginTop: 12, padding: "10px 13px", borderRadius: 10, background: "#f8fafc", color: "#374151" }}>{message}</div>}
        {settlement && <>
          <div style={{ marginTop: 18, padding: 16, borderRadius: 14, background: "#eff6ff", border: "1px solid #bfdbfe" }}><b>この数字は「利益」と「資金繰り」を分けて扱います。</b><div style={{ marginTop: 7, color: "#475569", lineHeight: 1.7 }}>請求額 {yen(settlement.billing_calculation_amount)} は対象の発生月の販売関連費。振込額 {yen(settlement.net_transfer_amount)} は {date(settlement.settlement_date)} の入金予定です。</div></div>
          <div style={{ overflowX: "auto", marginTop: 14 }}><table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}><tbody>
            <tr><th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>振込予定日</th><td style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>{date(settlement.settlement_date)}</td></tr>
            <tr><th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>決済確定期間</th><td style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>{date(settlement.payment_period_start)} ～ {date(settlement.payment_period_end)}</td></tr>
            <tr><th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>楽天からの支払計算額</th><td style={{ padding: 10, borderBottom: "1px solid #e5e7eb", textAlign: "right", fontWeight: 800 }}>{yen(settlement.payment_calculation_amount)}</td></tr>
            <tr><th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>楽天からの請求計算額</th><td style={{ padding: 10, borderBottom: "1px solid #e5e7eb", textAlign: "right", fontWeight: 800 }}>{date(settlement.billing_cutoff_date)}締分　{yen(settlement.billing_calculation_amount)}</td></tr>
            <tr><th style={{ textAlign: "left", padding: 10 }}>実際の振込予定額</th><td style={{ padding: 10, textAlign: "right", fontSize: 20, fontWeight: 900, color: "#166534" }}>{yen(settlement.net_transfer_amount)}</td></tr>
          </tbody></table></div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><button type="button" onClick={save} disabled={busy} style={{ border: 0, borderRadius: 10, padding: "10px 16px", background: "#166534", color: "#fff", fontWeight: 800 }}>資金繰りへ登録</button></div>
        </>}
      </section>
    </div>}
  </>;
}
