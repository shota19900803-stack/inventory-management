"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type Product = { id: string; name: string; jan_code?: string | null; stock_quantity?: number | null; cost_price?: number | null };
type Item = { id: string; name: string; jan_code: string | null; quantity: number; cost_price: number; value: number };
type Snapshot = { id: string; snapshot_date: string; total_units: number; product_count: number; stock_value: number; items: Item[]; created_at?: string; updated_at?: string };
const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const dateLabel = (s: string) => s.replace(/-/g, "/");

export default function StockSnapshots() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([
      supabaseBrowser.from("products").select("id,name,jan_code,stock_quantity,cost_price").limit(10000),
      supabaseBrowser.from("inventory_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(120),
    ]);
    if (p.error || s.error) {
      setMessage(`読み込みエラー：${p.error?.message || s.error?.message}`);
      setLoading(false);
      return;
    }
    setProducts((p.data || []) as Product[]);
    setSnapshots((s.data || []) as Snapshot[]);
    setLoading(false);
  }, []);

  const saveSnapshot = useCallback(async (silent = false) => {
    setSaving(true);
    if (!silent) setMessage("");
    const { data, error } = await supabaseBrowser.from("products").select("id,name,jan_code,stock_quantity,cost_price").limit(10000);
    if (error) {
      setMessage(`在庫の取得に失敗しました：${error.message}`);
      setSaving(false);
      return;
    }
    const rows = (data || []) as Product[];
    const items: Item[] = rows
      .filter((p) => Number(p.stock_quantity || 0) !== 0)
      .map((p) => {
        const quantity = Number(p.stock_quantity || 0);
        const cost_price = Number(p.cost_price || 0);
        return { id: p.id, name: p.name, jan_code: p.jan_code || null, quantity, cost_price, value: quantity * cost_price };
      });
    const total_units = items.reduce((sum, p) => sum + p.quantity, 0);
    const stock_value = items.reduce((sum, p) => sum + p.value, 0);
    const snapshot = {
      snapshot_date: today,
      total_units,
      product_count: items.length,
      stock_value,
      items,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabaseBrowser.from("inventory_snapshots").upsert(snapshot, { onConflict: "snapshot_date" });
    if (saveError) {
      setMessage(`保存に失敗しました：${saveError.message}`);
    } else {
      setMessage(silent ? `本日（${dateLabel(today)}）の在庫スナップショットを自動保存しました。` : `本日（${dateLabel(today)}）の在庫を保存しました。`);
      await load();
    }
    setSaving(false);
  }, [today, load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) await saveSnapshot(true);
    })();
    return () => { cancelled = true; };
  }, [load, saveSnapshot]);

  const selected = useMemo(() => snapshots.find((s) => s.snapshot_date === selectedDate) || snapshots[0], [snapshots, selectedDate]);
  const previous = useMemo(() => selected ? snapshots.filter((s) => s.snapshot_date < selected.snapshot_date).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0] : undefined, [snapshots, selected]);
  const currentValue = products.reduce((sum, p) => sum + Number(p.stock_quantity || 0) * Number(p.cost_price || 0), 0);
  const currentUnits = products.reduce((sum, p) => sum + Number(p.stock_quantity || 0), 0);
  const changed = useMemo(() => {
    if (!selected || !previous) return [];
    const oldItems = new Map((previous.items || []).map((x) => [x.id, x]));
    const newItems = new Map((selected.items || []).map((x) => [x.id, x]));
    return Array.from(new Set([...oldItems.keys(), ...newItems.keys()])).map((id) => {
      const oldItem = oldItems.get(id);
      const newItem = newItems.get(id);
      const quantityDelta = Number(newItem?.quantity || 0) - Number(oldItem?.quantity || 0);
      const valueDelta = Number(newItem?.value || 0) - Number(oldItem?.value || 0);
      return { id, name: newItem?.name || oldItem?.name || "商品名不明", quantityDelta, valueDelta };
    }).filter((x) => x.quantityDelta !== 0 || x.valueDelta !== 0).sort((a, b) => Math.abs(b.valueDelta) - Math.abs(a.valueDelta)).slice(0, 20);
  }, [selected, previous]);

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, boxShadow: "0 2px 8px rgba(0,0,0,.03)" };
  const button: React.CSSProperties = { border: 0, borderRadius: 10, padding: "11px 15px", fontWeight: 800, cursor: "pointer" };

  if (loading) return <main style={{ padding: 32, fontFamily: "system-ui" }}>在庫推移を読み込んでいます…</main>;

  return <main style={{ minHeight: "100vh", background: "#f5f7fb", padding: "24px 16px 60px", color: "#111827", fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,sans-serif" }}>
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div><div style={{ fontSize: 12, letterSpacing: 2, color: "#6b7280", fontWeight: 800 }}>INVENTORY HISTORY</div><h1 style={{ margin: "4px 0", fontSize: 30 }}>在庫推移・月末比較</h1><p style={{ margin: 0, color: "#6b7280" }}>在庫数と仕入原価ベースの在庫金額を記録・比較します。</p></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><a href="/management" style={{ ...button, background: "#fff", border: "1px solid #d1d5db", color: "#111827", textDecoration: "none" }}>← 経営ダッシュボード</a><button disabled={saving} onClick={() => saveSnapshot(false)} style={{ ...button, background: "#0f766e", color: "#fff", opacity: saving ? .65 : 1 }}>{saving ? "保存中…" : "📸 今日の在庫を保存"}</button></div>
      </header>
      {message && <div style={{ padding: 12, borderRadius: 10, marginBottom: 14, background: message.includes("失敗") || message.includes("エラー") ? "#fef2f2" : "#ecfdf5", color: message.includes("失敗") || message.includes("エラー") ? "#b91c1c" : "#166534" }}>{message}</div>}
      <div style={{ ...card, marginBottom: 16, background: "#eff6ff", borderColor: "#bfdbfe" }}><b>記録のしくみ</b><p style={{ margin: "6px 0 0", lineHeight: 1.7 }}>この画面を開くと、その日の在庫スナップショットを自動保存します。同じ日は最新の在庫で更新されます。月末の在庫を残したい場合は、月末当日にこの画面を開くか「今日の在庫を保存」を押してください。過去の9月分は遡って作成せず、保存を始めた日から正確な比較を蓄積します。</p></div>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 18 }}>
        <div style={card}><div style={{ color: "#6b7280", fontSize: 13 }}>現在の在庫数量</div><strong style={{ display: "block", fontSize: 27, marginTop: 6 }}>{currentUnits.toLocaleString()} 個</strong></div>
        <div style={card}><div style={{ color: "#6b7280", fontSize: 13 }}>現在の在庫金額（仕入原価）</div><strong style={{ display: "block", fontSize: 27, marginTop: 6 }}>{yen(currentValue)}</strong></div>
        <div style={card}><div style={{ color: "#6b7280", fontSize: 13 }}>保存済みスナップショット</div><strong style={{ display: "block", fontSize: 27, marginTop: 6 }}>{snapshots.length} 日分</strong></div>
      </section>
      <section style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0, fontSize: 20 }}>保存済み在庫の比較</h2><select value={selected?.snapshot_date || ""} onChange={(e) => setSelectedDate(e.target.value)} style={{ padding: 10, borderRadius: 9, border: "1px solid #d1d5db", background: "#fff" }}>{snapshots.map((s) => <option key={s.id} value={s.snapshot_date}>{dateLabel(s.snapshot_date)}</option>)}</select></div>
        {selected ? <><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 14 }}>
          <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc" }}><div style={{ color: "#6b7280", fontSize: 13 }}>{dateLabel(selected.snapshot_date)} 在庫金額</div><strong style={{ fontSize: 23 }}>{yen(Number(selected.stock_value))}</strong><div style={{ color: "#6b7280", fontSize: 12 }}>{Number(selected.total_units).toLocaleString()} 個 / {selected.product_count} 商品</div></div>
          <div style={{ padding: 14, borderRadius: 12, background: previous ? "#f0fdf4" : "#f8fafc" }}><div style={{ color: "#6b7280", fontSize: 13 }}>{previous ? `前回記録（${dateLabel(previous.snapshot_date)}）比` : "比較用の前回記録"}</div><strong style={{ fontSize: 23, color: previous && Number(selected.stock_value) - Number(previous.stock_value) < 0 ? "#15803d" : "#111827" }}>{previous ? `${Number(selected.stock_value) - Number(previous.stock_value) > 0 ? "+" : ""}${yen(Number(selected.stock_value) - Number(previous.stock_value))}` : "記録が増えると表示"}</strong><div style={{ color: "#6b7280", fontSize: 12 }}>{previous ? `${Number(selected.total_units) - Number(previous.total_units) > 0 ? "+" : ""}${(Number(selected.total_units) - Number(previous.total_units)).toLocaleString()} 個` : "次回の記録から比較できます"}</div></div>
        </div>
        {previous && <><h3 style={{ margin: "20px 0 8px", fontSize: 16 }}>在庫増減が大きい商品（最大20件）</h3><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}><thead><tr>{["商品","数量の増減","在庫金額の増減"].map((h) => <th key={h} style={{ textAlign: h === "商品" ? "left" : "right", padding: 9, borderBottom: "2px solid #e5e7eb" }}>{h}</th>)}</tr></thead><tbody>{changed.map((x) => <tr key={x.id}><td style={{ padding: 9, borderBottom: "1px solid #f1f5f9" }}>{x.name}</td><td style={{ textAlign: "right", padding: 9, borderBottom: "1px solid #f1f5f9", color: x.quantityDelta < 0 ? "#15803d" : "#b91c1c" }}>{x.quantityDelta > 0 ? "+" : ""}{x.quantityDelta.toLocaleString()}</td><td style={{ textAlign: "right", padding: 9, borderBottom: "1px solid #f1f5f9", color: x.valueDelta < 0 ? "#15803d" : "#b91c1c" }}>{x.valueDelta > 0 ? "+" : ""}{yen(x.valueDelta)}</td></tr>)}{changed.length === 0 && <tr><td colSpan={3} style={{ padding: 14, color: "#6b7280" }}>前回記録から在庫の変化はありません。</td></tr>}</tbody></table></div></>}
        </> : <p style={{ color: "#6b7280", marginTop: 14 }}>まだ在庫記録がありません。今日の在庫を保存して記録を開始してください。</p>}
      </section>
      <section style={card}><h2 style={{ margin: "0 0 12px", fontSize: 20 }}>在庫記録の履歴</h2>{snapshots.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}><thead><tr>{["記録日","在庫数量","在庫商品数","在庫金額（仕入原価）"].map((h) => <th key={h} style={{ textAlign: h === "記録日" ? "left" : "right", padding: 9, borderBottom: "2px solid #e5e7eb" }}>{h}</th>)}</tr></thead><tbody>{snapshots.map((s) => <tr key={s.id} onClick={() => setSelectedDate(s.snapshot_date)} style={{ cursor: "pointer", background: selected?.id === s.id ? "#eff6ff" : "#fff" }}><td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{dateLabel(s.snapshot_date)}</td><td style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #f1f5f9" }}>{Number(s.total_units).toLocaleString()}</td><td style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #f1f5f9" }}>{s.product_count}</td><td style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #f1f5f9", fontWeight: 700 }}>{yen(Number(s.stock_value))}</td></tr>)}</tbody></table></div> : <p style={{ color: "#6b7280" }}>保存した在庫記録はまだありません。</p>}</section>
    </div>
  </main>;
}
