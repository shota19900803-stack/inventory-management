"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "inventory-quick-actions-position";

const DEFAULT_POSITION = {
  top: 158,
  right: 30,
};

export default function QuickActions() {
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startTop: number;
    startRight: number;
  } | null>(null);

  useEffect(() => {
    let disposed = false;

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          typeof parsed?.top === "number" &&
          typeof parsed?.right === "number"
        ) {
          setPosition({ top: parsed.top, right: parsed.right });
        }
      }
    } catch {}

    const hideLegacyShippingButton = () => {
      if (disposed) return;
      const buttons = Array.from(document.querySelectorAll("button"));
      const target = buttons.find(
        (button) =>
          !button.closest("[data-quick-actions]") &&
          (button.textContent || "").trim() === "🚚 送料自動計算"
      );
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

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    } catch {}
  }, [position]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => {
        const panelWidth = Math.min(560, Math.max(260, window.innerWidth - 60));
        const maxRight = Math.max(10, window.innerWidth - panelWidth - 10);
        const maxTop = Math.max(10, window.innerHeight - 90);

        return {
          top: Math.min(Math.max(10, current.top), maxTop),
          right: Math.min(Math.max(10, current.right), maxRight),
        };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const openShippingCalculator = () => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (item) =>
        !item.closest("[data-quick-actions]") &&
        (item.textContent || "").trim() === "🚚 送料自動計算"
    ) as HTMLButtonElement | undefined;

    if (button) button.click();
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startTop: position.top,
      startRight: position.right,
    };

    setDragging(true);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;

    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;

    const panelWidth = Math.min(560, Math.max(260, window.innerWidth - 60));
    const panelHeight = 120;
    const maxRight = Math.max(10, window.innerWidth - panelWidth - 10);
    const maxTop = Math.max(10, window.innerHeight - panelHeight);

    setPosition({
      top: Math.min(
        Math.max(10, dragRef.current.startTop + deltaY),
        maxTop
      ),
      right: Math.min(
        Math.max(10, dragRef.current.startRight - deltaX),
        maxRight
      ),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      setDragging(false);
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  };

  const resetPosition = () => {
    setPosition(DEFAULT_POSITION);
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
      data-quick-actions
      style={{
        position: "fixed",
        top: position.top,
        right: position.right,
        zIndex: 1050,
        width: "min(560px, calc(100vw - 60px))",
        padding: 12,
        borderRadius: 16,
        background: "rgba(255,255,255,.97)",
        border: "1px solid #e5e7eb",
        boxShadow: "0 10px 30px rgba(15,23,42,.12)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="ここをドラッグしてQuick Actionsを移動"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 9,
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#64748b", letterSpacing: 1 }}>
            QUICK ACTIONS
          </span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            よく使う機能
          </span>
          <span style={{ fontSize: 11, color: "#cbd5e1" }}>
            ↕ ドラッグで移動
          </span>
        </div>

        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={resetPosition}
          title="初期位置に戻す"
          style={{
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            color: "#64748b",
            borderRadius: 8,
            padding: "4px 7px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          ↺ 戻す
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={openShippingCalculator} style={buttonStyle("#0369a1")}>
          🚚 送料自動計算
        </button>
        <a
          href="/sales-order"
          style={{ ...buttonStyle("#7c3aed"), textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          💰 注文まとめ売上
        </a>
        <a
          href="/product-history"
          style={{ ...buttonStyle("#0f766e"), textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          📦 商品別履歴
        </a>
        <a
          href="/shipping-settings"
          style={{ ...buttonStyle("#334155"), textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          🐈‍⬛ ヤマト残高
        </a>
      </div>
    </section>
  );
}
