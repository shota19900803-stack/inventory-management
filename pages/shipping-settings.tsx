import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";
import { CARRIERS, type ShippingRateCard } from "../lib/shippingRates";

type Wallet = { id: string; carrier: string; wallet_name: string; balance: number; active: boolean };
type Tx = { id: string; transaction_type: string; amount: number; description: string | null; created_at: string };
const money = (v: number) => `¥${Number(v || 0).toLocaleString()}`;

export default function ShippingSettings() {
  const [cards, setCards] = useState<ShippingRateCard[]>([]);
  const [carrier, setCarrier] = useState("佐川急便");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [charge, setCharge] = useState("50000");
  const [material, setMaterial] = useState("70");
  const [materialDescription, setMaterialDescription] = useState("宅急便コンパクト専用BOX");

  const load = async () => {
    const { data, error } = await supabaseBrowser.from("shipping_rate_cards").select("*").order("sort_order");
    if (error) setMessage(`読み込みエラー：${error.message}`); else setCards((data ?? []) as ShippingRateCard[]);
  };

  const loadWallet = async () => {
    const { data, error } = await supabaseBrowser.from("shipping_wallets").select("*").eq("carrier", "クロネコヤマト").eq("active", true).maybeSingle();
    if (error) { setMessage(`ヤマト残高読み込みエラー：${error.message}`); return; }
    setWallet(data as Wallet | null);
    if (!data) return;
    const { data: tx } = await supabaseBrowser.from("shipping_wallet_transactions").select("id,transaction_type,amount,description,created_at").eq("wallet_id", data.id).order("created_at", { ascending: false }).limit(30);
    setTransactions((tx ?? []) as Tx[]);
  };

  useEffect(() => { void load(); void loadWallet(); }, []);

  const groups = useMemo<Record<string, ShippingRateCard[]>>(() => {
    const result: Record<string, ShippingRateCard[]> = {};
    cards.filter(card => card.carrier === carrier).forEach(card => { if (!result[card.service]) result[card.service] = []; result[card.service].push(card); });
    return result;
  }, [cards, carrier]);

  const updateRate = (id: string, key: string, value: string) => setCards(prev => prev.map(card => card.id === id ? { ...card, rates: { ...card.rates, [key]: Number(value) || 0 } } : card));
  const save = async (card: ShippingRateCard) => {
    setSaving(true);
    const { error } = await supabaseBrowser.from("shipping_rate_cards").update({ rates: card.rates, updated_at: new Date().toISOString() }).eq("id", card.id);
    setSaving(false); setMessage(error ? `保存エラー：${error.message}` : "保存しました！");
  };

  async function addCharge() {
    if (!wallet) return;
    const amount = Number(charge || 0); if (amount <= 0) return setMessage("チャージ金額を入力してください。");
    setSaving(true); setMessage("");
    const { data, error } = await supabaseBrowser.rpc("add_shipping_wallet_charge", { p_wallet_id: wallet.id, p_amount: amount, p_description: `クロネコメンバー割チャージ ${money(amount)}` });
    setSaving(false);
    setMessage(error ? `チャージ登録エラー：${error.message}` : `チャージ登録完了。残高 ${money(Number(data?.balance || 0))}`);
    await loadWallet();
  }

  async function addMaterial() {
    if (!wallet) return;
    const amount = Number(material || 0); if (amount <= 0) return setMessage("資材金額を入力してください。");
    setSaving(true); setMessage("");
    const { data, error } = await supabaseBrowser.rpc("add_shipping_material_purchase", { p_wallet_id: wallet.id, p_amount: amount, p_description: materialDescription.trim() || "梱包資材購入" });
    setSaving(false);
    setMessage(error ? `資材購入登録エラー：${error.message}` : `資材購入を登録しました。残高 ${money(Number(data?.balance || 0))}`);
    await loadWallet();
  }

  const txLabel = (type: string) => ({ charge: "チャージ", shipping_debit: "発送利用", material_debit: "資材購入", reversal: "返金・取消", adjustment: "残高調整" } as Record<string,string>)[type] || type;

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", padding: "28px 18px 100px", fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,sans-serif", color: "#111827" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", letterSpacing: 2 }}>SHIPPING SETTINGS</div><h1 style={{ margin: "5px 0", fontSize: 34 }}>🚚 発送費設定</h1><p style={{ color: "#64748b", marginTop: 6 }}>送料表の設定とクロネコメンバー割の残高をここで管理できます。</p></div>
          <a href="/" style={{ padding: "12px 16px", borderRadius: 12, background: "#111827", color: "white", textDecoration: "none", fontWeight: 800 }}>← 在庫管理へ</a>
        </div>

        {message && <div style={{ padding: 13, background: message.includes("エラー") ? "#fff7ed" : "#ecfdf5", color: message.includes("エラー") ? "#b45309" : "#047857", borderRadius: 12, fontWeight: 800, marginTop: 16 }}>{message}</div>}

        <section style={{ marginTop: 20, background: "white", borderRadius: 20, padding: 22, boxShadow: "0 5px 20px rgba(15,23,42,.05)" }}>
          <div style={{ color: "#64748b", fontWeight: 900 }}>🐈‍⬛ クロネコメンバー割BIG</div>
          <div style={{ fontSize: 38, fontWeight: 950, marginTop: 3 }}>{money(Number(wallet?.balance || 0))}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>宅急便コンパクトを登録すると、送料＋専用BOX70円を自動で残高から減算します。</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, marginTop: 18 }}>
            <div style={{ padding: 16, borderRadius: 14, background: "#f8fafc" }}><strong>チャージを追加</strong><input inputMode="numeric" value={charge} onChange={e=>setCharge(e.target.value.replace(/\D/g,""))} style={inputStyle}/><button disabled={saving || !wallet} onClick={()=>void addCharge()} style={blueButton}>＋ チャージ登録</button></div>
            <div style={{ padding: 16, borderRadius: 14, background: "#f8fafc" }}><strong>資材購入を追加</strong><input inputMode="numeric" value={material} onChange={e=>setMaterial(e.target.value.replace(/\D/g,""))} style={inputStyle}/><input value={materialDescription} onChange={e=>setMaterialDescription(e.target.value)} style={{...inputStyle,marginTop:8}}/><button disabled={saving || !wallet} onClick={()=>void addMaterial()} style={tealButton}>📦 資材購入登録</button></div>
          </div>
          <div style={{ marginTop: 18, overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}><thead><tr>{["日時","区分","金額","内容"].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead><tbody>{transactions.map(tx=><tr key={tx.id}><td style={tdStyle}>{new Date(tx.created_at).toLocaleString("ja-JP")}</td><td style={tdStyle}>{txLabel(tx.transaction_type)}</td><td style={{...tdStyle,fontWeight:900,color:tx.transaction_type==='charge'||tx.transaction_type==='reversal'?"#047857":"#b91c1c"}}>{tx.transaction_type==='charge'||tx.transaction_type==='reversal'?'+':'-'}{money(Number(tx.amount))}</td><td style={tdStyle}>{tx.description || "—"}</td></tr>)}</tbody></table></div>
        </section>

        <div style={{ display: "flex", gap: 8, margin: "22px 0", flexWrap: "wrap" }}>{CARRIERS.map(name => <button key={name} onClick={()=>setCarrier(name)} style={{ border: 0, borderRadius: 999, padding: "11px 18px", background: carrier===name ? "#111827" : "#e5e7eb", color: carrier===name ? "white" : "#111827", fontWeight: 900 }}>{name}</button>)}</div>
        {Object.entries(groups).map(([service,list]) => <section key={service} style={{ background: "white", borderRadius: 20, padding: 20, marginBottom: 20, boxShadow: "0 5px 20px rgba(15,23,42,.05)" }}><h2 style={{ marginTop: 0 }}>{service}</h2><div style={{ display: "grid", gap: 12 }}>{list.map(card => <div key={card.id} style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 16 }}><div style={{ fontWeight: 900, fontSize: 17 }}>{card.region}</div><div style={{ color: "#64748b", fontSize: 13, margin: "4px 0 12px" }}>{card.prefectures.join("・")}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(105px,1fr))", gap: 9 }}>{Object.entries(card.rates).map(([key,value])=><label key={key} style={{ fontSize: 12, fontWeight: 800 }}>{key==="default"?"送料":`${key}サイズ`}<input inputMode="numeric" value={String(value)} onChange={e=>updateRate(card.id,key,e.target.value)} style={{ display:"block",width:"100%",boxSizing:"border-box",padding:9,borderRadius:9,border:"1px solid #cbd5e1",marginTop:4 }}/></label>)}</div><button disabled={saving} onClick={()=>void save(card)} style={{ marginTop:13,border:0,borderRadius:10,padding:"10px 15px",background:"#0369a1",color:"white",fontWeight:900 }}>{saving?"保存中…":"この地域を保存"}</button></div>)}</div></section>)}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = { width:"100%", boxSizing:"border-box", padding:11, borderRadius:10, border:"1px solid #cbd5e1", marginTop:8, background:"#fff" };
const blueButton: React.CSSProperties = { width:"100%", marginTop:9, padding:12, border:0, borderRadius:10, background:"#0369a1", color:"#fff", fontWeight:900, cursor:"pointer" };
const tealButton: React.CSSProperties = { width:"100%", marginTop:9, padding:12, border:0, borderRadius:10, background:"#0f766e", color:"#fff", fontWeight:900, cursor:"pointer" };
const thStyle: React.CSSProperties = { textAlign:"left", padding:10, borderBottom:"2px solid #e5e7eb", color:"#64748b", fontSize:12 };
const tdStyle: React.CSSProperties = { padding:10, borderBottom:"1px solid #f1f5f9", fontSize:13 };
