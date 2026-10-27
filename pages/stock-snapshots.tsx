import dynamic from "next/dynamic";

const StockSnapshots = dynamic(() => import("../components/StockSnapshots"), {
  ssr: false,
  loading: () => <main style={{ padding: 40, fontFamily: "system-ui" }}>在庫推移を読み込んでいます…</main>,
});

export default function StockSnapshotsPage() {
  return <StockSnapshots />;
}
