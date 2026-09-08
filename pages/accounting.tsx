import dynamic from "next/dynamic";
import MarketplacePdfImporter from "../components/MarketplacePdfImporter";

const Accounting = dynamic(() => import("../components/Accounting"), {
  ssr: false,
  loading: () => <main style={{ padding: 40, fontFamily: "system-ui" }}>経理・帳簿を読み込んでいます…</main>,
});

export default function AccountingPage() {
  return (
    <>
      <Accounting />
      <div style={{ position: "fixed", top: 18, right: 18, zIndex: 1200, width: "min(900px, calc(100vw - 36px))" }}>
        <MarketplacePdfImporter />
      </div>
    </>
  );
}
