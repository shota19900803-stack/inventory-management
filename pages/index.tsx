import dynamic from "next/dynamic";
import { Component, useEffect } from "react";
import { supabaseBrowser } from "../lib/supabase";

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
  useEffect(() => {
    let stopped = false;
    let observer: MutationObserver | null = null;
    const supabase = supabaseBrowser;

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
            node.setAttribute("data-low-stock-hidden", "true");
            return true;
          }
          node = node.parentElement;
        }
      }
      return false;
    };

    // 商品管理の「履歴」は、商品名の完全一致ではなくJANコードから商品IDを特定する。
    // 一覧表示では商品名セル内にJANも表示されるため、商品名に余計な表示情報が含まれていても安全に開ける。
    const bindProductHistoryButtons = () => {
      const main = document.querySelector("main");
      if (!main) return;

      const buttons = Array.from(main.querySelectorAll("button"));
      buttons.forEach((button) => {
        const text = (button.textContent || "").trim();
        if (text !== "履歴") return;
        if (button.getAttribute("data-product-history-bound") === "true") return;

        button.setAttribute("data-product-history-bound", "true");
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();

          const row = button.closest("tr");
          if (!row) return;

          const cells = Array.from(row.querySelectorAll("td"));
          const rowText = (cells[0]?.textContent || "").trim();
          if (!rowText) return;

          button.disabled = true;
          const originalText = button.textContent;
          button.textContent = "読込中…";

          try {
            // 商品名セルに表示されている13桁JANを優先して商品IDを取得する。
            const janMatches = rowText.match(/\d{13}/g) || [];
            let productId: string | null = null;

            if (janMatches.length > 0) {
              const jan = janMatches[janMatches.length - 1];
              const { data, error } = await supabase
                .from("products")
                .select("id")
                .eq("jan_code", jan)
                .limit(1)
                .maybeSingle();

              if (error) throw error;
              productId = data?.id ?? null;
            }

            // JANがない旧商品にも対応するため、最後に商品名完全一致をフォールバックとして残す。
            if (!productId) {
              const { data, error } = await supabase
                .from("products")
                .select("id")
                .eq("name", rowText)
                .limit(1)
                .maybeSingle();

              if (error) throw error;
              productId = data?.id ?? null;
            }

            if (!productId) {
              alert("この商品の履歴を開けませんでした。JANコードまたは商品情報を確認してください。");
              return;
            }

            window.location.href = `/product-history?productId=${encodeURIComponent(productId)}`;
          } catch (error) {
            console.error("商品履歴への移動に失敗:", error);
            alert("商品履歴を開けませんでした。もう一度お試しください。");
          } finally {
            button.disabled = false;
            button.textContent = originalText || "履歴";
          }
        });
      });
    };

    const run = () => {
      hideLowStockCard();
      bindProductHistoryButtons();
    };

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
      <SafeBoundary><Dashboard /></SafeBoundary>
      <a href="/sales-order" style={{ position: "fixed", left: "50%", bottom: 206, transform: "translateX(-50%)", zIndex: 1001, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 22px", borderRadius: 999, background: "#7c3aed", color: "#fff", textDecoration: "none", fontWeight: 900, boxShadow: "0 8px 24px rgba(124,58,237,.25)", whiteSpace: "nowrap" }}>💰 注文まとめ売上</a>
      <a href="/product-history" style={{ position: "fixed", left: "50%", bottom: 144, transform: "translateX(-50%)", zIndex: 1001, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 22px", borderRadius: 999, background: "#0f766e", color: "#fff", textDecoration: "none", fontWeight: 800, boxShadow: "0 8px 24px rgba(15,118,110,.25)", whiteSpace: "nowrap" }}>📦 商品別履歴</a>
      <a href="/products" style={{ position: "fixed", left: "50%", bottom: 82, transform: "translateX(-50%)", zIndex: 1001, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 22px", borderRadius: 999, background: "#15803d", color: "#fff", textDecoration: "none", fontWeight: 800, boxShadow: "0 8px 24px rgba(21,128,61,.28)", whiteSpace: "nowrap" }}>＋ 商品登録</a>
      <a href="/stocktake" style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 1001, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 22px", borderRadius: 999, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 900, boxShadow: "0 8px 24px rgba(17,24,39,.22)", whiteSpace: "nowrap" }}>📋 棚卸し</a>
      <a href="/management" style={{ position: "fixed", left: 20, bottom: 20, zIndex: 1000, display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 18px", borderRadius: 999, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 800, boxShadow: "0 8px 24px rgba(17,24,39,.2)" }}>📊 経営ダッシュボード</a>
      <a href="/accounting" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 1000, display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 18px", borderRadius: 999, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 800, boxShadow: "0 8px 24px rgba(17,24,39,.2)" }}>📒 経理・帳簿</a>
    </>
  );
}
