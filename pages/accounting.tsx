import dynamic from "next/dynamic";

const Accounting = dynamic(() => import("../components/Accounting"), {
  ssr: false,
  loading: () => <main style={{ padding: 40, fontFamily: "system-ui" }}>経理・帳簿を読み込んでいます…</main>,
});

export default function AccountingPage() {
  return <Accounting />;
}
