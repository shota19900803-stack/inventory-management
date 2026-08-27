"use client";

import { useEffect } from "react";

export default function QuickActions() {
  useEffect(() => {
    let disposed = false;
    const hideLegacyShippingButton = () => {
      if (disposed) return;
      const buttons = Array.from(document.querySelectorAll("button"));
      const target = buttons.find((button) => (button.textContent || "").trim() === "🚚 送料自動計算");
      if (target) {
        target.setAttribute("data-legacy-shipping-button", "true");
        target.style.display = "none";
      }
    };

    hideLegacyShippingButton();
    const timer = window.setInterval(hideLegacyShippingButton, 500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  const openShippingCalculator = () => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (item) => (item.textContent || "").trim() === "🚚 送料自動計算"
    ) as HTMLButtonElement | undefined;
    if (button) button.click();
  };

  const buttonStyle = (background: string): React.CSSProperties => ({
    border: 0,
    borderRadius: 12,
    padding: "11px 16px",
    background,
    color: "#fff",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 5px 14px rgba(15,23,42,.12)",
    whiteSpace: "nowrap",
  });

  return (
    <section
      style={{
        position: "fixed",
        top: 158,
        right: 30,
        zIndex: 1050,
        width: "min(455px, calc(100vw - 60px))",
        padding: 12,
        borderRadius: 16,
        background: "rgba(255,255,255,.97)",
        border: "1px solid #e5e7eb",
        boxShadow: "0 10px 30px rgba(15,23,42,.12)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: "#64748b", letterSpacing: 1 }}>QUICK ACTIONS</span>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>よく使う機能</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={openShippingCalculator} style={buttonStyle("#0369a1")}>🚚 送料自動計算</button>
        <a href="/sales-order" style={{ ...buttonStyle("#7c3aed"), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>💰 注文まとめ売上</a>
        <a href="/product-history" style={{ ...buttonStyle("#0f766e"), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>📦 商品別履歴</a>
      </div>
    </section>
  );
}
