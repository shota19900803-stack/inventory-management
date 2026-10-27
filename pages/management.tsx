import dynamic from "next/dynamic";

const Management = dynamic(() => import("../components/Management"), {
  ssr: false,
  loading: () => <main style={{ padding: 40, fontFamily: "system-ui" }}>経営システムを読み込んでいます…</main>,
});

export default function ManagementPage() {
  return <>
    <div style={{ background: "#f5f7fb", padding: "14px 18px 0", fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <a href="/stock-snapshots" style={{ display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "#0f766e", color: "#fff", textDecoration: "none", fontWeight: 800 }}>📦 在庫推移・月末比較を開く</a>
      </div>
    </div>
    <Management />
  </>;
}
