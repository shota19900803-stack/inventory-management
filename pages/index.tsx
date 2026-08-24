import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("../components/Dashboard"), {
  ssr: false,
  loading: () => (
    <main
      style={{
        minHeight: "100vh",
        background: "#f6f7f9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>在庫管理</div>
        <div style={{ marginTop: 8, color: "#6b7280" }}>
          読み込み中…
        </div>
      </div>
    </main>
  ),
});

const HistoryEditor = dynamic(() => import("../components/HistoryEditor"), {
  ssr: false,
});

const SalesActionsRpc = dynamic(() => import("../components/SalesActionsRpc"), {
  ssr: false,
});

export default function Home() {
  return (
    <>
      <Dashboard />
      <HistoryEditor />
      <SalesActionsRpc />
      <a
        href="/management"
        style={{
          position: "fixed",
          left: 20,
          bottom: 20,
          zIndex: 1000,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "13px 18px",
          borderRadius: 999,
          background: "#111827",
          color: "#fff",
          textDecoration: "none",
          fontWeight: 800,
          boxShadow: "0 8px 24px rgba(17,24,39,.2)",
        }}
      >
        📊 経営ダッシュボード
      </a>
      <a
        href="/accounting"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 1000,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "13px 18px",
          borderRadius: 999,
          background: "#111827",
          color: "#fff",
          textDecoration: "none",
          fontWeight: 800,
          boxShadow: "0 8px 24px rgba(17,24,39,.2)",
        }}
      >
        📒 経理・帳簿
      </a>
    </>
  );
}
