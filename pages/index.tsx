import dynamic from "next/dynamic";
import { Component } from "react";
import SalesShippingEnhancement from "../components/SalesShippingEnhancement";
import QuickActions from "../components/QuickActions";

const Dashboard = dynamic(() => import("../components/Dashboard"), {
  ssr: false,
  loading: () => (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: "#111827" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>在庫管理</div>
        <div style={{ marginTop: 8, color: "#6b7280" }}>読み込み中…</div>
      </div>
    </main>
  ),
});

class SafeBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error("在庫管理画面エラー:", error); }
  render() { if (this.state.hasError) return null; return this.props.children; }
}

export default function Home() {
  return (
    <>
      <SafeBoundary><Dashboard /></SafeBoundary>
      <SalesShippingEnhancement />
      <QuickActions />
      <a href="/stocktake" style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 1001, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 22px", borderRadius: 999, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 900, boxShadow: "0 8px 24px rgba(17,24,39,.22)", whiteSpace: "nowrap" }}>📋 棚卸し</a>
      <a href="/management" style={{ position: "fixed", left: 20, bottom: 20, zIndex: 1000, display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 18px", borderRadius: 999, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 800, boxShadow: "0 8px 24px rgba(17,24,39,.2)" }}>📊 経営ダッシュボード</a>
      <a href="/accounting" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 1000, display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 18px", borderRadius: 999, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 800, boxShadow: "0 8px 24px rgba(17,24,39,.2)" }}>📒 経理・帳簿</a>
    </>
  );
}

// Keep the entrypoint intentionally thin; feature logic lives in dedicated components.
