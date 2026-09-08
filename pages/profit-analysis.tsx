import dynamic from "next/dynamic";

const ProfitAnalysis = dynamic(() => import("../components/ProfitAnalysis"), {
  ssr: false,
  loading: () => <main style={{ padding: 40, fontFamily: "system-ui" }}>実質粗利分析を読み込んでいます…</main>,
});

export default function ProfitAnalysisPage() {
  return <ProfitAnalysis />;
}
