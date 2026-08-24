import dynamic from "next/dynamic";

const Management = dynamic(() => import("../components/Management"), {
  ssr: false,
  loading: () => <main style={{ padding: 40, fontFamily: "system-ui" }}>経営システムを読み込んでいます…</main>,
});

export default function ManagementPage() {
  return <Management />;
}
