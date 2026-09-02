import React from "react";

type Props = {
  salesTotal: number;
  grossProfit: number;
  inventoryValue: number;
  lowStockCount: number;
};

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

export default function DashboardStats({ salesTotal, grossProfit, inventoryValue, lowStockCount }: Props) {
  const items = [
    ["売上", yen.format(salesTotal)],
    ["粗利", yen.format(grossProfit)],
    ["在庫金額", yen.format(inventoryValue)],
    ["低在庫", `${lowStockCount}件`],
  ];

  return (
    <section aria-label="主要指標" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff" }}>
          <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 700 }}>{label}</div>
          <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900, color: "#111827" }}>{value}</div>
        </div>
      ))}
    </section>
  );
}
