import dynamic from "next/dynamic";
import { Component, useEffect, useState } from "react";

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
        <div style={{ marginTop: 8, color: "#6b7280" }}>読み込み中…</div>
      </div>
    </main>
  ),
});

const HistoryEditor = dynamic(() => import("../components/HistoryEditor"), { ssr: false });
const SalesActionsRpc = dynamic(() => import("../components/SalesActionsRpc"), { ssr: false });

class SafeBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("在庫管理画面エラー:", error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function Home() {
  const [desktopEnhancers, setDesktopEnhancers] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    setDesktopEnhancers(!mobile);

    // iPhone版では「在庫不足商品」カードを表示しない。
    // PC版の既存表示には影響させない。
    if (!mobile) return;

    let stopped = false;
    let observer: MutationObserver | null = null;

    const hideLowStockCard = () => {
      if (stopped) return true;

      const main = document.querySelector("main");
      if (!main) return false;

      const leaves = Array.from(main.querySelectorAll("*"));
      for (const leaf of leaves) {
        if (leaf.children.length !== 0) continue;

        const leafText = (leaf.textContent || "").replace(/\s/g, "");
        if (!leafText.includes("在庫不足商品")) continue;

        let node: HTMLElement | null = leaf.parentElement;
        for (let depth = 0; node && depth < 12; depth += 1) {
          const text = (node.textContent || "").replace(/\s/g, "");
          if (text.includes("在庫管理") && /\d+件/.test(text)) {
            node.style.display = "none";
            node.setAttribute("data-mobile-low-stock-hidden", "true");
            return true;
          }
          node = node.parentElement;
        }
      }

      return false;
    };

    const run = () => hideLowStockCard();
    run();

    const timer = window.setInterval(run, 700);
    observer = new MutationObserver(run);
    const root = document.querySelector("main") || document.body;
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      stopped = true;
      window.clearInterval(timer);
      observer?.disconnect();
    };
  }, []);

  return (
    <>
      <SafeBoundary>
        <Dashboard />
      </SafeBoundary>

      {desktopEnhancers && (
        <>
          <SafeBoundary><HistoryEditor /></SafeBoundary>
          <SafeBoundary><SalesActionsRpc /></SafeBoundary>
        </>
      )}

      <a
        href="/products"
        style={{
          position: "fixed", left: "50%", bottom: 82, transform: "translateX(-50%)", zIndex: 1001,
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "13px 22px", borderRadius: 999,
          background: "#15803d", color: "#fff", textDecoration: "none",
          fontWeight: 800, boxShadow: "0 8px 24px rgba(21,128,61,.28)",
          whiteSpace: "nowrap",
        }}
      >
        ＋ 商品登録
      </a>

      <a
        href="/management"
        style={{
          position: "fixed", left: 20, bottom: 20, zIndex: 1000,
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "13px 18px", borderRadius: 999,
          background: "#111827", color: "#fff", textDecoration: "none",
          fontWeight: 800, boxShadow: "0 8px 24px rgba(17,24,39,.2)",
        }}
      >
        📊 経営ダッシュボード
      </a>
      <a
        href="/accounting"
        style={{
          position: "fixed", right: 20, bottom: 20, zIndex: 1000,
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "13px 18px", borderRadius: 999,
          background: "#111827", color: "#fff", textDecoration: "none",
          fontWeight: 800, boxShadow: "0 8px 24px rgba(17,24,39,.2)",
        }}
      >
        📒 経理・帳簿
      </a>
    </>
  );
}
