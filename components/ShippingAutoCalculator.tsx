"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";
import { PREFECTURES, CARRIERS, findRegion, type ShippingRateCard } from "../lib/shippingRates";

function setControlledInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function ShippingAutoCalculator() {
  const [open, setOpen] = useState(false), [cards, setCards] = useState<ShippingRateCard[]>([]);
  const [prefecture, setPrefecture] = useState("岡山県"), [carrier, setCarrier] = useState("クロネコヤマト");
  const [service, setService] = useState("宅急便コンパクト"), [size, setSize] = useState("default");
  const [manualAmount, setManualAmount] = useState(""), [status, setStatus] = useState("");

  useEffect(() => { supabaseBrowser.from("shipping_rate_cards").select("*").eq("active", true).order("sort_order").then(({data}) => setCards((data ?? []) as ShippingRateCard[])); }, []);
  const services = useMemo(() => Array.from(new Set(cards.filter(c => c.carrier === carrier).map(c => c.service))), [cards, carrier]);
  const region = findRegion(prefecture, carrier);
  const selectedCard = useMemo(() => cards.find(c => c.carrier === carrier && c.service === service && c.region === region) ?? null, [cards, carrier, service, region]);
  const sizeOptions = useMemo(() => carrier === "クロネコヤマト" ? [service] : selectedCard ? Object.keys(selectedCard.rates) : [], [carrier, service, selectedCard]);
  useEffect(() => { if (services.length && !services.includes(service)) setService(services[0]); }, [services, service]);
  useEffect(() => { if (sizeOptions.length && !sizeOptions.includes(size)) setSize(sizeOptions[0]); }, [sizeOptions, size]);
  const amount = manualAmount !== "" ? Number(manualAmount) : Number(selectedCard?.rates[size] ?? selectedCard?.rates.default ?? 0);

  const applyToSaleForm = () => {
    const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
    const input = inputs.find(i => i.placeholder?.includes("750")) || inputs.find(i => (i.parentElement?.textContent ?? "").trim().startsWith("送料"));
    if (!input) { setStatus("売上登録の送料欄が見つかりません。売上登録画面を開いてください。"); return; }
    setControlledInput(input, String(amount));
    setStatus(`送料 ¥${amount.toLocaleString()} を売上登録へ反映しました。`);
    setOpen(false);
  };

  return <>
    <button onClick={() => setOpen(true)} style={{position:"fixed",left:"50%",bottom:280,transform:"translateX(-50%)",zIndex:1100,border:0,borderRadius:999,padding:"13px 22px",background:"#0369a1",color:"white",fontWeight:900,fontSize:15,boxShadow:"0 8px 24px rgba(3,105,161,.25)"}}>🚚 送料自動計算</button>
    {open && <div style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(15,23,42,.48)",display:"flex",alignItems:"center",justifyContent:"center",padding:18}}>
      <div style={{width:"min(560px,100%)",maxHeight:"90vh",overflowY:"auto",background:"white",borderRadius:24,padding:24,boxShadow:"0 24px 80px rgba(0,0,0,.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:12,fontWeight:800,color:"#64748b"}}>SHIPPING CALCULATOR</div><h2 style={{margin:"4px 0 0",fontSize:25}}>🚚 発送費を自動計算</h2></div><button onClick={()=>setOpen(false)} style={{border:0,background:"#f1f5f9",borderRadius:999,padding:"8px 13px",fontWeight:800}}>閉じる</button></div>
        <p style={{color:"#64748b",lineHeight:1.6}}>配送先・配送会社・サイズを選ぶだけで送料を算出し、売上登録の送料欄へ反映します。</p>
        <div style={{display:"grid",gap:14}}>
          <label>配送先都道府県<select value={prefecture} onChange={e=>setPrefecture(e.target.value)} style={{width:"100%",padding:12,borderRadius:12,border:"1px solid #cbd5e1",marginTop:6}}>{PREFECTURES.map(p=><option key={p}>{p}</option>)}</select></label>
          <label>配送会社<select value={carrier} onChange={e=>setCarrier(e.target.value)} style={{width:"100%",padding:12,borderRadius:12,border:"1px solid #cbd5e1",marginTop:6}}>{CARRIERS.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>発送方法<select value={service} onChange={e=>setService(e.target.value)} style={{width:"100%",padding:12,borderRadius:12,border:"1px solid #cbd5e1",marginTop:6}}>{services.map(s=><option key={s}>{s}</option>)}</select></label>
          <label>{carrier === "クロネコヤマト" ? "発送方法" : "サイズ"}<select value={size} onChange={e=>setSize(e.target.value)} style={{width:"100%",padding:12,borderRadius:12,border:"1px solid #cbd5e1",marginTop:6}}>{sizeOptions.map(s=><option key={s}>{carrier === "クロネコヤマト" ? s : `${s}サイズ`}</option>)}</select></label>
          <label>送料を手動変更（任意）<input inputMode="numeric" value={manualAmount} onChange={e=>setManualAmount(e.target.value.replace(/\D/g,""))} placeholder={`自動：¥${amount.toLocaleString()}`} style={{width:"100%",padding:12,borderRadius:12,border:"1px solid #cbd5e1",marginTop:6,boxSizing:"border-box"}}/></label>
        </div>
        <div style={{marginTop:18,padding:18,borderRadius:16,background:"#f0f9ff",textAlign:"center"}}><div style={{color:"#0369a1",fontWeight:800}}>今回の送料</div><div style={{fontSize:32,fontWeight:900,marginTop:4}}>¥{amount.toLocaleString()}</div></div>
        {status && <div style={{marginTop:12,padding:12,borderRadius:12,background:"#ecfdf5",color:"#047857",fontWeight:700}}>{status}</div>}
        <button onClick={applyToSaleForm} style={{width:"100%",marginTop:16,padding:15,border:0,borderRadius:14,background:"#0369a1",color:"white",fontWeight:900,fontSize:16}}>送料を売上登録へ反映</button>
        <a href="/shipping-settings" style={{display:"block",textAlign:"center",marginTop:14,color:"#0369a1",fontWeight:800,textDecoration:"none"}}>⚙️ 送料設定を編集する</a>
      </div>
    </div>}
  </>;
}
