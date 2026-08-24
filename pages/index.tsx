import Dashboard from "../components/Dashboard";

export default function Home() {
  return (
    <>
      <Dashboard />
      <style jsx global>{`
        /* 在庫不足の常時警告は、トレンド商品の運用では情報量が多くなるため非表示 */
        /* 月次集計カードの右端（在庫管理カード）を確実に非表示にする */
        main > div > section:nth-of-type(2) > div:nth-of-type(5),
        main > div > section:nth-of-type(2) > div:nth-child(5),
        main > div > section:nth-of-type(2) > div > div:nth-of-type(5),
        main > div > section:nth-of-type(2) > div > div:nth-child(5) {
          display: none !important;
        }
      `}</style>
      <a href="/management" style={{ position:"fixed", left:20, bottom:20, zIndex:1000, display:"inline-flex", alignItems:"center", gap:8, padding:"13px 18px", borderRadius:999, background:"#111827", color:"#fff", textDecoration:"none", fontWeight:800, boxShadow:"0 8px 24px rgba(17,24,39,.2)" }}>
        📊 経営ダッシュボード
      </a>
      <a href="/accounting" style={{ position:"fixed", right:20, bottom:20, zIndex:1000, display:"inline-flex", alignItems:"center", gap:8, padding:"13px 18px", borderRadius:999, background:"#111827", color:"#fff", textDecoration:"none", fontWeight:800, boxShadow:"0 8px 24px rgba(17,24,39,.2)" }}>
        📒 経理・帳簿
      </a>
    </>
  );
}
