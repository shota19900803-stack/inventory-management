import dynamic from "next/dynamic";
import { Component, useEffect, useLayoutEffect } from "react";
import { supabaseBrowser } from "../lib/supabase";
import SalesShippingEnhancement from "../components/SalesShippingEnhancement";
import QuickActions from "../components/QuickActions";
import ManagementSnapshot from "../components/ManagementSnapshot";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const Dashboard = dynamic(() => import("../components/Dashboard"), {
  ssr: false,
  loading: () => (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: "#111827" }}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800 }}>在庫管理</div><div style={{ marginTop: 8, color: "#6b7280" }}>読み込み中…</div></div>
    </main>
  ),
});

class SafeBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error("在庫管理画面エラー:", error); }
  handleReload = () => { window.location.reload(); };
  render() {
    if (this.state.hasError) return <main style={{ minHeight: "100vh", background: "#f6f7f9", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: "#111827" }}><section style={{ width: "min(520px, 100%)", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 28, boxShadow: "0 12px 30px rgba(17,24,39,.08)", textAlign: "center" }}><div style={{ fontSize: 34 }}>⚠️</div><h1 style={{ margin: "10px 0 0", fontSize: 22 }}>画面の読み込みに失敗しました</h1><p style={{ margin: "10px 0 20px", color: "#6b7280", lineHeight: 1.7 }}>一時的なエラーの可能性があります。再読み込みしてもう一度お試しください。</p><button type="button" onClick={this.handleReload} style={{ border: 0, borderRadius: 12, padding: "12px 20px", background: "#111827", color: "#fff", fontWeight: 800, cursor: "pointer" }}>再読み込み</button></section></main>;
    return this.props.children;
  }
}

export default function Home() {
  useIsoLayoutEffect(() => {
    let stopped = false;
    let observer: MutationObserver | null = null;
    const supabase = supabaseBrowser;

    // 古い「在庫不足商品」ブロックは、描画直後に非表示化する。
    // 700msポーリングは廃止して、チラつきを最小化する。
    const hideLowStockCard = () => {
      if (stopped) return true;
      const main = document.querySelector("main");
      if (!main) return false;
      for (const leaf of Array.from(main.querySelectorAll("*"))) {
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

    const hidePurchaseMarketCheck = () => {
      if (stopped) return;
      const main = document.querySelector("main");
      if (!main) return;
      Array.from(main.querySelectorAll("button")).forEach((button) => {
        const text = (button.textContent || "").replace(/\s/g, "").trim();
        if (text !== "相場チェック") return;
        if (button.getAttribute("data-market-check-hidden") === "true") return;
        button.style.display = "none";
        button.setAttribute("data-market-check-hidden", "true");
      });
    };

    const bindProductHistoryButtons = () => {
      if (stopped) return;
      const main = document.querySelector("main");
      if (!main) return;
      Array.from(main.querySelectorAll("button")).forEach((button) => {
        const text = (button.textContent || "").replace(/\s/g, "").trim();
        if (text !== "履歴") return;
        if (button.getAttribute("data-product-history-bound") === "true") return;
        button.setAttribute("data-product-history-bound", "true");
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const row = button.closest("tr");
          if (!row) return;
          const cells = Array.from(row.querySelectorAll("td"));
          const jan = (cells[1]?.textContent || "").replace(/\D/g, "");
          const productName = (cells[0]?.querySelector("strong")?.textContent || "").trim();
          button.disabled = true;
          const originalText = button.textContent;
          button.textContent = "読込中…";
          try {
            let productId: string | null = null;
            if (jan.length === 13) {
              const { data, error } = await supabase.from("products").select("id").eq("jan_code", jan).limit(1).maybeSingle();
              if (error) throw error;
              productId = data?.id ?? null;
            }
            if (!productId && productName) {
              const { data, error } = await supabase.from("products").select("id").eq("name", productName).limit(1).maybeSingle();
              if (error) throw error;
              productId = data?.id ?? null;
            }
            if (!productId) {
              alert("この商品の履歴を開けませんでした。商品情報を確認してください。");
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
      hidePurchaseMarketCheck();
      bindProductHistoryButtons();
    };

    run();
    const root = document.querySelector("main") || document.body;
    observer = new MutationObserver(run);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      stopped = true;
      observer?.disconnect();
    };
  }, []);

  return <><SafeBoundary><Dashboard/></SafeBoundary><ManagementSnapshot/><SalesShippingEnhancement/><QuickActions/>
    <style>{`
      /* 最近の売上：長い注文番号が売上金額へ食い込まないようにする */
      table:has([data-purchase-cost-header="true"]) th,
      table:has([data-purchase-cost-header="true"]) td {
        vertical-align: middle;
      }
      table:has([data-purchase-cost-header="true"]) th:nth-child(4),
      table:has([data-purchase-cost-header="true"]) td:nth-child(4) {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      table:has([data-purchase-cost-header="true"]) td:nth-child(6),
      table:has([data-purchase-cost-header="true"]) td:nth-child(7),
      table:has([data-purchase-cost-header="true"]) td:nth-child(8),
      table:has([data-purchase-cost-header="true"]) td:nth-child(9) {
        white-space: nowrap;
      }
    `}</style>
    <a href="/stocktake" style={{position:"fixed",left:"50%",bottom:20,transform:"translateX(-50%)",zIndex:1001,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,padding:"13px 22px",borderRadius:999,background:"#111827",color:"#fff",textDecoration:"none",fontWeight:900,boxShadow:"0 8px 24px rgba(17,24,39,.22)",whiteSpace:"nowrap"}}>📋 棚卸し</a><a href="/profit-analysis" style={{position:"fixed",left:20,bottom:72,zIndex:1000,display:"inline-flex",alignItems:"center",gap:8,padding:"13px 18px",borderRadius:999,background:"#166534",color:"#fff",textDecoration:"none",fontWeight:800,boxShadow:"0 8px 24px rgba(17,24,39,.2)"}}>💹 実質粗利</a><a href="/management" style={{position:"fixed",left:20,bottom:20,zIndex:1000,display:"inline-flex",alignItems:"center",gap:8,padding:"13px 18px",borderRadius:999,background:"#111827",color:"#fff",textDecoration:"none",fontWeight:800,boxShadow:"0 8px 24px rgba(17,24,39,.2)"}}>📊 経営ダッシュボード</a><a href="/accounting" style={{position:"fixed",right:20,bottom:20,zIndex:1000,display:"inline-flex",alignItems:"center",gap:8,padding:"13px 18px",borderRadius:999,background:"#111827",color:"#fff",textDecoration:"none",fontWeight:800,boxShadow:"0 8px 24px rgba(17,24,39,.2)"}}>📒 経理・帳簿</a></>;
}
