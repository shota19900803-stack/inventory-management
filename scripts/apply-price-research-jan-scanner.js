const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");
const join = (lines) => lines.join("\n");

// Add dedicated scanner state/refs for the purchase price research panel.
// This is intentionally separate from the product-registration scanner so
// scanning from the purchase tab works reliably on both PC and smartphone.
if (!text.includes("priceResearchScanning")) {
  const stateMarker = join([
    '  const [priceResearch, setPriceResearch] = useState<any>(null);',
    '  const [priceResearchLoading, setPriceResearchLoading] = useState(false);',
  ]);

  const stateAddition = join([
    stateMarker,
    '  const priceResearchVideoRef = useRef<HTMLVideoElement | null>(null);',
    '  const priceResearchScannerRef = useRef<BrowserMultiFormatReader | null>(null);',
    '  const priceResearchControlsRef = useRef<any>(null);',
    '  const [priceResearchScanning, setPriceResearchScanning] = useState(false);',
    '  const [priceResearchScannerMessage, setPriceResearchScannerMessage] = useState("カメラを起動しています…");',
  ]);

  if (!text.includes(stateMarker)) {
    throw new Error("price research state marker not found.");
  }

  text = text.replace(stateMarker, stateAddition);
}

// Add scanner controls and lifecycle immediately before the price research UI.
if (!text.includes("async function startPriceResearchJanScanner")) {
  const functionMarker = '  async function researchPrices(janValue = productForm.jan_code) {';
  const functionStart = text.indexOf(functionMarker);
  if (functionStart === -1) {
    throw new Error("researchPrices function marker not found.");
  }

  const helper = join([
    '  const closePriceResearchJanScanner = () => {',
    '    try { priceResearchControlsRef.current?.stop(); } catch {}',
    '    priceResearchControlsRef.current = null;',
    '    priceResearchScannerRef.current = null;',
    '    setPriceResearchScanning(false);',
    '  };',
    '',
    '  const startPriceResearchJanScanner = () => {',
    '    setPriceResearchScannerMessage("カメラを起動しています…");',
    '    setPriceResearchScanning(true);',
    '  };',
    '',
    '  useEffect(() => {',
    '    if (!priceResearchScanning) return;',
    '',
    '    let cancelled = false;',
    '',
    '    const startCamera = async () => {',
    '      try {',
    '        if (!priceResearchVideoRef.current) return;',
    '        const reader = new BrowserMultiFormatReader();',
    '        priceResearchScannerRef.current = reader;',
    '        setPriceResearchScannerMessage("JANコードをカメラに映してください");',
    '',
    '        const controls = await reader.decodeFromConstraints(',
    '          { video: { facingMode: { ideal: "environment" } } },',
    '          priceResearchVideoRef.current,',
    '          (result) => {',
    '            if (cancelled || !result) return;',
    '            const jan = result.getText().replace(/\\D/g, "");',
    '            if (jan.length !== 13) return;',
    '',
    '            setProductForm((prev) => ({ ...prev, jan_code: jan }));',
    '            setPriceResearchScannerMessage(`読み取り成功：${jan}`);',
    '            try { controls.stop(); } catch {}',
    '            priceResearchControlsRef.current = null;',
    '            priceResearchScannerRef.current = null;',
    '            setTimeout(() => {',
    '              if (!cancelled) {',
    '                setPriceResearchScanning(false);',
    '                researchPrices(jan);',
    '              }',
    '            }, 300);',
    '          }',
    '        );',
    '',
    '        if (cancelled) {',
    '          try { controls.stop(); } catch {}',
    '          return;',
    '        }',
    '        priceResearchControlsRef.current = controls;',
    '      } catch (error) {',
    '        console.error("価格リサーチJANスキャンエラー:", error);',
    '        if (!cancelled) {',
    '          setPriceResearchScannerMessage("カメラを起動できませんでした。");',
    '          alert("カメラを起動できませんでした。\\n\\nブラウザのカメラ使用許可を確認して、もう一度お試しください。");',
    '          setPriceResearchScanning(false);',
    '        }',
    '      }',
    '    };',
    '',
    '    startCamera();',
    '',
    '    return () => {',
    '      cancelled = true;',
    '      try { priceResearchControlsRef.current?.stop(); } catch {}',
    '      priceResearchControlsRef.current = null;',
    '      priceResearchScannerRef.current = null;',
    '      if (priceResearchVideoRef.current) {',
    '        priceResearchVideoRef.current.pause();',
    '        priceResearchVideoRef.current.srcObject = null;',
    '      }',
    '    };',
    '  }, [priceResearchScanning]);',
    '',
  ]);

  text = text.slice(0, functionStart) + helper + text.slice(functionStart);
}

// Add the camera button and full-screen scanner to the existing price research panel.
if (!text.includes("startPriceResearchJanScanner()")) {
  const buttonMarker = '                <button type="button" disabled={priceResearchLoading} onClick={() => researchPrices()}';
  const buttonStart = text.indexOf(buttonMarker);
  if (buttonStart === -1) {
    throw new Error("price research button marker not found.");
  }

  const buttonEnd = text.indexOf('</button>', buttonStart);
  if (buttonEnd === -1) {
    throw new Error("price research button end marker not found.");
  }
  const buttonCloseEnd = buttonEnd + '</button>'.length;

  const replacement = join([
    '                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>',
    '                  <button type="button" disabled={priceResearchLoading} onClick={() => startPriceResearchJanScanner()} style={{ border: "none", background: "#15803d", color: "#fff", padding: "11px 18px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>',
    '                    📷 JAN読取',
    '                  </button>',
    '                  <button type="button" disabled={priceResearchLoading} onClick={() => researchPrices()} style={{ border: "none", background: "#111827", color: "#fff", padding: "11px 18px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>',
    '                    {priceResearchLoading ? "検索中…" : "🔎 価格を調べる"}',
    '                  </button>',
    '                </div>',
  ]);

  text = text.slice(0, buttonStart) + replacement + text.slice(buttonCloseEnd);
}

if (!text.includes("priceResearchVideoRef.current")) {
  throw new Error("price research scanner implementation was not inserted.");
}

if (!text.includes("priceResearchScanning && (")) {
  const panelMarker = '              {priceResearch && (';
  const panelStart = text.indexOf(panelMarker);
  if (panelStart === -1) {
    throw new Error("price research result panel marker not found.");
  }

  const overlay = join([
    '              {priceResearchScanning && (',
    '                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, boxSizing: "border-box" }}>',
    '                  <div style={{ width: "min(92vw, 720px)", color: "#fff", textAlign: "center" }}>',
    '                    <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>📷 仕入れ価格リサーチ用JANコードを映してください</div>',
    '                    <video ref={priceResearchVideoRef} autoPlay muted playsInline style={{ width: "100%", maxHeight: "72vh", minHeight: 280, objectFit: "contain", display: "block", background: "#000", borderRadius: 12 }} />',
    '                    <div style={{ marginTop: 10, fontSize: 14, color: "#d1d5db" }}>{priceResearchScannerMessage}</div>',
    '                    <button type="button" onClick={closePriceResearchJanScanner} style={{ marginTop: 14, width: "100%", padding: "12px 16px", background: "#fff", color: "#111827", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>閉じる</button>',
    '                  </div>',
    '                </div>',
    '              )}',
  ]);

  text = text.slice(0, panelStart) + overlay + '\n' + text.slice(panelStart);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied JAN scanner to purchase price research.");
