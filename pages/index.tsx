import { useEffect } from "react";
import Dashboard from "../components/Dashboard";

export default function Home() {
  useEffect(() => {
    const hideLowStockPanel = () => {
      const candidates = Array.from(document.querySelectorAll("body *"));
      const heading = candidates.find((element) =>
        (element.textContent || "").trim().includes("在庫不足商品") &&
        element.children.length === 0
      );

      if (!heading) return;

      let current = heading.parentElement;

      for (let depth = 0; current && depth < 8; depth += 1) {
        const rect = current.getBoundingClientRect();
        const style = window.getComputedStyle(current);
        const hasCardStyle =
          style.borderRadius !== "0px" ||
          style.borderTopWidth !== "0px" ||
          style.boxShadow !== "none";

        if (rect.width >= 220 && rect.height >= 120 && hasCardStyle) {
          current.style.display = "none";
          return;
        }

        current = current.parentElement;
      }
    };

    hideLowStockPanel();

    const observer = new MutationObserver(hideLowStockPanel);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Dashboard />
      <style jsx global>{`
        /* 在庫不足の常時警告は、トレンド商品の運用では情報量が多くなるため非表示 */
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
