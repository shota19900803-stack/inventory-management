const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// このスクリプトは prebuild で毎回実行されるため、すでに強化版が
// 適用済みでもエラーにせず、そのまま次の build 処理へ進める。
// 以前の参照ブロックが別の修正スクリプトによって書き換えられた場合も同様。
const hasJanLookup = text.includes("async function lookupProductByJan(");
const hasJanScanner = text.includes("const startJanScanner = () => {");
const hasZxingScanner = text.includes("BrowserMultiFormatReader");

if (hasJanLookup && hasJanScanner && hasZxingScanner) {
  console.log("JAN scanner/lookup is already applied; skipping duplicate patch.");
  process.exit(0);
}

const refPattern = /const controlsRef = useRef<any>\(null\);\s*(?:const janLookupRef = useRef\(false\);\s*)?const \[scanning, setScanning\] = useState\(false\);/;

if (!refPattern.test(text)) {
  // 旧コードでも新コードでもない場合は、ここで build を壊すより
  // 明示的にスキップして既存の JAN 読み取り機能を温存する。
  console.warn("JAN scanner reference block was not found; skipping JAN lookup patch.");
  process.exit(0);
}

text = text.replace(
  refPattern,
  `const controlsRef = useRef<any>(null);\nconst janLookupRef = useRef(false);\nconst [scanning, setScanning] = useState(false);`
);

const start = text.indexOf("const startJanScanner = () => {");
const end = text.indexOf("  const monthSales = useMemo", start);

if (start === -1 || end === -1) {
  console.warn("JAN scanner block was not found; skipping JAN lookup patch.");
  process.exit(0);
}

const newBlock = `function isValidJan13(value: string) {
  if (!/^\\d{13}$/.test(value)) return false;
  const digits = value.split("").map(Number);
  const check = digits.slice(0, 12).reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (check % 10)) % 10 === digits[12];
}

async function lookupProductByJan(jan: string) {
  if (janLookupRef.current) return;
  janLookupRef.current = true;
  setMessage("");
  setScannerMessage("商品情報を検索しています…");
  try {
    const localProduct = products.find((product) => String(product.jan_code ?? "").replace(/\\D/g, "") === jan);
    if (localProduct) {
      setEditingProductId(localProduct.id);
      setProductForm({
        name: localProduct.name ?? "",
        jan_code: localProduct.jan_code ?? jan,
        sku: localProduct.sku ?? "",
        model_number: localProduct.model_number ?? "",
        brand: localProduct.brand ?? "",
        category: localProduct.category ?? "",
        stock_quantity: String(localProduct.stock_quantity ?? 0),
        cost_price: localProduct.cost_price == null ? "" : String(localProduct.cost_price),
        selling_price: localProduct.selling_price == null ? "" : String(localProduct.selling_price),
      });
      setMessage("登録済みの商品を読み込みました。");
      setScannerMessage("読み取り成功：" + jan + "（登録済み商品）");
      return;
    }

    const response = await fetch("/api/jan-search?jan=" + encodeURIComponent(jan), { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "JAN商品検索に失敗しました。");

    setEditingProductId(null);
    setProductForm((prev) => ({
      ...prev,
      jan_code: jan,
      ...(data?.found && data.product ? {
        name: data.product.name ?? prev.name,
        model_number: data.product.model_number ?? prev.model_number,
        brand: data.product.brand ?? prev.brand,
        category: data.product.category ?? prev.category,
      } : {}),
    }));

    if (data?.found && data.product) {
      setMessage("商品情報を自動取得しました（" + data.product.source + "）。");
      setScannerMessage("商品情報取得成功：" + jan);
    } else {
      setMessage("JANは読み取れましたが、商品情報を取得できませんでした。商品名を入力してください。");
      setScannerMessage("JAN読み取り成功：" + jan);
    }
  } catch (error) {
    console.error("JAN商品情報取得エラー:", error);
    setEditingProductId(null);
    setProductForm((prev) => ({ ...prev, jan_code: jan }));
    setMessage("JANは読み取れましたが、商品情報の取得に失敗しました。");
    setScannerMessage("JAN読み取り成功：" + jan);
  } finally {
    janLookupRef.current = false;
  }
}

const startJanScanner = () => {
  setScannerMessage("カメラを起動しています…");
  setScanning(true);
};

const closeJanScanner = () => {
  try { controlsRef.current?.stop(); } catch {}
  controlsRef.current = null;
  scannerRef.current = null;
  setScanning(false);
};

useEffect(() => {
  if (!scanning) return;
  let cancelled = false;
  let lastDetected = "";
  let lastDetectedAt = 0;

  const startCamera = async () => {
    try {
      setScannerMessage("カメラを起動しています…");
      if (!videoRef.current) {
        setScannerMessage("カメラ画面を準備しています…");
        return;
      }

      const reader = new BrowserMultiFormatReader();
      scannerRef.current = reader;
      const video = videoRef.current;
      video.setAttribute("autoplay", "true");
      video.setAttribute("muted", "true");
      video.setAttribute("playsinline", "true");
      video.muted = true;
      video.playsInline = true;
      setScannerMessage("JANコードを枠の中に入れてください");

      const controls = await reader.decodeFromConstraints({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 15 },
        },
      }, video, (result, error) => {
        if (cancelled || janLookupRef.current || !result) {
          if (error) console.log("スキャン中:", error);
          return;
        }

        const raw = result.getText().replace(/\\D/g, "");
        const now = Date.now();
        if (raw.length !== 13 || !isValidJan13(raw)) return;
        if (raw === lastDetected && now - lastDetectedAt < 1500) return;
        lastDetected = raw;
        lastDetectedAt = now;
        console.log("JANコード検出:", raw);

        try { controlsRef.current?.stop(); } catch {}
        controlsRef.current = null;
        scannerRef.current = null;
        setProductForm((prev) => ({ ...prev, jan_code: raw }));
        setScannerMessage("読み取り成功：" + raw);
        setScanning(false);
        void lookupProductByJan(raw);
      });

      if (cancelled) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      try { await video.play(); } catch (playError) { console.log("video.play待機:", playError); }
    } catch (error) {
      console.error("JANスキャンエラー:", error);
      if (!cancelled) {
        setScannerMessage("カメラを起動できませんでした。");
        alert("カメラを起動できませんでした。\\n\\nSafariのカメラ使用許可を確認して、もう一度お試しください。");
        setScanning(false);
      }
    }
  };

  void startCamera();
  return () => {
    cancelled = true;
    try { controlsRef.current?.stop(); } catch {}
    controlsRef.current = null;
    scannerRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  };
}, [scanning, products]);
`;

text = text.slice(0, start) + newBlock + text.slice(end);
fs.writeFileSync(file, text, "utf8");
console.log("Applied stronger JAN scanner with lookup support.");
