"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type Sale = { sale_date:string; total_sales:number|null; total_cost:number|null; shipping_cost:number|null; gross_profit:number|null; sales_channel:string|null; is_cancelled:boolean };
type Product = { id:string; name:string; stock_quantity:number|null; cost_price:number|null; selling_price:number|null };
type Purchase = { purchase_date:string; total_cost:number|null };
type Expense = { entry_date:string; amount:number|null; category:string };

const yen=(n:number)=>`¥${Math.round(n).toLocaleString()}`;
const month=(d:string)=>d.slice(0,7);
const today=new Date().toISOString().slice(0,10);
const thisMonth=today.slice(0,7);

export default function Management(){
 const sb=supabaseBrowser;
 const [sales,setSales]=useState<Sale[]>([]); const [products,setProducts]=useState<Product[]>([]); const [purchases,setPurchases]=useState<Purchase[]>([]); const [expenses,setExpenses]=useState<Expense[]>([]); const [loading,setLoading]=useState(true); const [selected,setSelected]=useState(thisMonth);
 async function load(){
  setLoading(true);
  const [s,p,pu,e]=await Promise.all([
   sb.from("sales_history").select("sale_date,total_sales,total_cost,shipping_cost,gross_profit,sales_channel,is_cancelled").limit(10000),
   sb.from("products").select("id,name,stock_quantity,cost_price,selling_price").limit(10000),
   sb.from("purchase_history").select("purchase_date,total_cost").limit(10000),
   sb.from("expense_entries").select("entry_date,amount,category").limit(10000)
  ]);
  setSales((s.data||[]) as Sale[]); setProducts((p.data||[]) as Product[]); setPurchases((pu.data||[]) as Purchase[]); setExpenses((e.data||[]) as Expense[]); setLoading(false);
 }
 useEffect(()=>{load()},[]);
 const salesMonth=useMemo(()=>sales.filter(x=>!x.is_cancelled&&month(x.sale_date)===selected),[sales,selected]);
 const purchasesMonth=useMemo(()=>purchases.filter(x=>month(x.purchase_date)===selected),[purchases,selected]);
 const expensesMonth=useMemo(()=>expenses.filter(x=>month(x.entry_date)===selected),[expenses,selected]);
 const salesTotal=salesMonth.reduce((a,x)=>a+Number(x.total_sales||0),0);
 const costTotal=salesMonth.reduce((a,x)=>a+Number(x.total_cost||0),0);
 const shipping=salesMonth.reduce((a,x)=>a+Number(x.shipping_cost||0),0);
 const gross=salesMonth.reduce((a,x)=>a+Number(x.gross_profit||0),0);
 const expenseTotal=expensesMonth.reduce((a,x)=>a+Number(x.amount||0),0);
 const operating=gross-expenseTotal;
 const purchaseTotal=purchasesMonth.reduce((a,x)=>a+Number(x.total_cost||0),0);
 const stockUnits=products.reduce((a,x)=>a+Number(x.stock_quantity||0),0);
 const stockValue=products.reduce((a,x)=>a+Number(x.stock_quantity||0)*Number(x.cost_price||0),0);
 const months=useMemo(()=>Array.from(new Set([thisMonth,...sales.map(x=>month(x.sale_date)),...purchases.map(x=>month(x.purchase_date)),...expenses.map(x=>month(x.entry_date))])).sort().reverse(),[sales,purchases,expenses]);
 const channel=useMemo(()=>{const m:Record<string,number>={}; salesMonth.forEach(x=>m[x.sales_channel||"その他"]=(m[x.sales_channel||"その他"]||0)+Number(x.total_sales||0)); return Object.entries(m).sort((a,b)=>b[1]-a[1]);},[salesMonth]);
 const low=products.filter(x=>Number(x.stock_quantity||0)<=1).sort((a,b)=>Number(a.stock_quantity||0)-Number(b.stock_quantity||0)).slice(0,8);
 if(loading)return <main style={{padding:40,fontFamily:"system-ui"}}>経営ダッシュボードを読み込んでいます…</main>;
 const card={background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,.04)"} as React.CSSProperties;
 return <main style={{minHeight:"100vh",background:"#f5f7fb",padding:"28px 18px 60px",fontFamily:"system-ui,-apple-system,sans-serif",color:"#111827"}}>
  <div style={{maxWidth:1250,margin:"auto"}}>
   <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:15,flexWrap:"wrap",marginBottom:24}}><div><div style={{fontSize:12,letterSpacing:3,color:"#6b7280",fontWeight:800}}>CROSS NODE MANAGEMENT</div><h1 style={{margin:"4px 0",fontSize:34}}>経営ダッシュボード</h1><p style={{margin:0,color:"#6b7280"}}>仕入・在庫・販売・利益・経理をひとつに。</p></div><div style={{display:"flex",gap:10}}><select value={selected} onChange={e=>setSelected(e.target.value)} style={{padding:"11px 14px",borderRadius:10,border:"1px solid #d1d5db",background:"#fff"}}>{months.map(m=><option key={m}>{m}</option>)}</select><a href="/" style={{padding:"11px 15px",borderRadius:10,background:"#111827",color:"#fff",textDecoration:"none",fontWeight:700}}>← 管理画面</a></div></header>
   <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>{[["売上",salesTotal],["商品原価",costTotal],["送料",shipping],["粗利",gross],["経費",expenseTotal],["営業利益",operating],["仕入",purchaseTotal],["在庫金額",stockValue]].map(([l,v])=><div style={card} key={String(l)}><div style={{fontSize:13,color:"#6b7280"}}>{l}</div><strong style={{display:"block",fontSize:25,marginTop:7}}>{yen(Number(v))}</strong></div>)}</section>
   <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:18,marginTop:18}}>
    <div style={card}><h2 style={{marginTop:0}}>📈 販売先別売上</h2>{channel.length?channel.map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #eee"}}><span>{k}</span><b>{yen(v)}</b></div>):<p>この月の売上データはありません。</p>}</div>
    <div style={card}><h2 style={{marginTop:0}}>📦 在庫状況</h2><div style={{fontSize:14,color:"#6b7280"}}>在庫点数</div><strong style={{fontSize:30}}>{stockUnits.toLocaleString()}個</strong><div style={{marginTop:15,fontSize:14,color:"#6b7280"}}>要確認（在庫1個以下）</div>{low.map(p=><div key={p.id} style={{padding:"8px 0",borderBottom:"1px solid #eee",display:"flex",justifyContent:"space-between"}}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"75%"}}>{p.name}</span><b>{Number(p.stock_quantity||0)}個</b></div>)}</div>
   </section>
   <section style={{...card,marginTop:18}}><h2 style={{marginTop:0}}>🎯 経営を見るポイント</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><div><b>粗利率</b><div style={{fontSize:25,marginTop:5}}>{salesTotal?((gross/salesTotal)*100).toFixed(1):"0.0"}%</div></div><div><b>経費率</b><div style={{fontSize:25,marginTop:5}}>{salesTotal?((expenseTotal/salesTotal)*100).toFixed(1):"0.0"}%</div></div><div><b>営業利益率</b><div style={{fontSize:25,marginTop:5}}>{salesTotal?((operating/salesTotal)*100).toFixed(1):"0.0"}%</div></div><div><b>在庫回転の確認</b><div style={{fontSize:14,color:"#6b7280",marginTop:8}}>在庫金額と月間売上原価を見ながら、寝ている在庫をチェック。</div></div></div></section>
  </div>
 </main>;
}
