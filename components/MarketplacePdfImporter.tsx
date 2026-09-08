"use client";

import { useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type Entry = {
  platform: string;
  document_type: string;
  invoice_date: string | null;
  expense_month: string | null;
  billing_month: string | null;
  fee_type: string;
  description: string;
  amount: number;
  tax_amount: number | null;
  total_amount: number | null;
  category: string;
  status: string;
  source_filename: string;
  source_hash: string;
  source_line_key: string;
  raw_text: string;
};

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

export default function MarketplacePdfImporter() {
  const supabase = supabaseBrowser;
  const [file, setFile] = useState<File | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [platform, setPlatform] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function analyze() {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setEntries([]);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/accounting/import-marketplace-pdf", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "PDFを解析できませんでした。");
      setPlatform(data.platform || "");
      setEntries((data.entries || []) as Entry[]);
      setMessage(data.entries?.length ? `${data.entries.length}件を読み取りました。内容を確認して登録できます。` : "費用明細を見つけられませんでした。別の帳票を選んでください。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDFの解析に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!entries.length) return;
    setBusy(true);
    setMessage("");
    try {
      const hash = entries[0].source_hash;
      const { data: existing, error: existingError } = await supabase
        .from("marketplace_cost_entries")
        .select("id")
        .eq("source_hash", hash)
        .limit(1);
      if (existingError) throw existingError;
      if ((existing || []).length > 0) {
        setMessage("このPDFはすでに登録済みです。二重計上を防ぐため登録しませんでした。");
        return;
      }

      const { error } = await supabase.from("marketplace_cost_entries").insert(entries);
      if (error) throw error;
      setMessage(`${entries.length}件を経理データへ登録しました。`);
      setEntries([]);
      setFile(null);
      const input = document.getElementById("marketplace-pdf-input") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登録に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return (
    <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 20, marginBottom: 20, boxShadow: "0 2px 10px rgba(17,24,39,.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 1.5, color: "#6b7280", fontWeight: 800 }}>AUTO ACCOUNTING</div>
          <h2 style={{ margin: "4px 0 5px" }}>📄 モール請求書を自動経理</h2>
          <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6 }}>
            楽天・AmazonのPDFをアップロードすると、費目・発生月・請求月を読み取り、登録前に確認できます。
          </p>
        </div>
        <div style={{ padding: "7px 11px", borderRadius: 999, background: "#ecfdf5", color: "#166534", fontSize: 12, fontWeight: 800 }}>二重計上防止あり</div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
        <input id="marketplace-pdf-input" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button type="button" onClick={analyze} disabled={!file || busy} style={{ border: 0, borderRadius: 10, padding: "10px 16px", background: "#111827", color: "#fff", fontWeight: 800, cursor: !file || busy ? "not-allowed" : "pointer", opacity: !file || busy ? 0.55 : 1 }}>
          {busy ? "処理中…" : "PDFを読み取る"}
        </button>
        {platform && <span style={{ fontWeight: 800 }}>{platform}</span>}
      </div>

      {message && <div style={{ marginTop: 12, padding: "10px 13px", borderRadius: 10, background: "#f8fafc", color: "#374151" }}>{message}</div>}

      {entries.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, gap: 12, flexWrap: "wrap" }}>
            <div><b>読み取り結果</b><span style={{ marginLeft: 10, color: "#6b7280" }}>{entries.length}件 / 税抜合計 {yen(total)}</span></div>
            <button type="button" onClick={save} disabled={busy} style={{ border: 0, borderRadius: 10, padding: "10px 16px", background: "#166534", color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.55 : 1 }}>経理へ登録</button>
          </div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["発生月", "請求月", "費目", "内容", "税抜", "税込", "状態"].map((h) => <th key={h} style={{ textAlign: h === "費目" || h === "内容" ? "left" : "right", padding: 9, borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{entries.map((entry, index) => <tr key={`${entry.source_line_key}-${index}`}>
                <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{entry.expense_month?.slice(0, 7) || "—"}</td>
                <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{entry.billing_month?.slice(0, 7) || "—"}</td>
                <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", fontWeight: 700 }}>{entry.fee_type}</td>
                <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{entry.description}</td>
                <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{yen(entry.amount)}</td>
                <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{entry.total_amount == null ? "—" : yen(entry.total_amount)}</td>
                <td style={{ padding: 9, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{entry.status}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>※ 自動登録前に明細を確認できます。楽天の「支払額」や決済金等は費用として二重計上しないよう、請求費目だけを取り込む設計です。</div>
        </>
      )}
    </section>
  );
}
