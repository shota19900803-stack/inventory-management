const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

if (text.includes("const janLookupRef = useRef(false);")) {
  console.log("JAN lookup patch already applied");
  process.exit(0);
}

const refOld = `const controlsRef = useRef<any>(null);\nconst [scanning, setScanning] = useState(false);`;
const refNew = `const controlsRef = useRef<any>(null);\nconst janLookupRef = useRef(false);\nconst [scanning, setScanning] = useState(false);`;

if (!text.includes(refOld)) {
  throw new Error("JAN scanner reference block was not found.");
}

text = text.replace(refOld, refNew);

const start = text.indexOf("const startJanScanner = () => {");
const end = text.indexOf("  const monthSales = useMemo", start);

if (start === -1 || end === -1) {
  throw new Error("JAN scanner block was not found.");
}

const newBlock = `async function lookupProductByJan(jan: string) {
  if (janLookupRef.current) {
    return;
  }

  janLookupRef.current = true;
  setMessage("");
  setScannerMessage("商品情報を検索しています…");

  try {
    const localProduct = products.find(
      (product) =>
        String(product.jan_code ?? "").replace(/\\D/g, "") === jan
    );

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
        cost_price:
          localProduct.cost_price == null
            ? ""
            : String(localProduct.cost_price),
        selling_price:
          localProduct.selling_price == null
            ? ""
            : String(localProduct.selling_price),
      });

      setMessage("登録済みの商品を読み込みました。");
      setScannerMessage(\`読み取り成功：\${jan}（登録済み商品）\`);
      return;
    }

    const response = await fetch(
      \`/api/jan-search?jan=\${encodeURIComponent(jan)}\`
    );

    const data = await response.json().catch(() => null);

    if (data?.found && data.product) {
      setEditingProductId(null);
      setProductForm((prev) => ({
        ...prev,
        jan_code: jan,
        name: data.product.name ?? prev.name,
        model_number:
          data.product.model_number ?? prev.model_number,
        brand: data.product.brand ?? prev.brand,
        category: data.product.category ?? prev.category,
      }));

      setMessage(
        \`商品情報を自動取得しました（\${data.product.source}）。\`
      );
      setScannerMessage(\`商品情報取得成功：\${jan}\`);
    } else {
      setProductForm((prev) => ({
        ...prev,
        jan_code: jan,
      }));
      setMessage(
        "JANは読み取れましたが、商品情報を取得できませんでした。商品名を入力してください。"
      );
      setScannerMessage(\`JAN読み取り成功：\${jan}\`);
    }
  } catch (error) {
    console.error("JAN商品情報取得エラー:", error);

    setProductForm((prev) => ({
      ...prev,
      jan_code: jan,
    }));

    setMessage(
      "JANは読み取れましたが、商品情報の取得に失敗しました。"
    );
    setScannerMessage(\`JAN読み取り成功：\${jan}\`);
  } finally {
    janLookupRef.current = false;
  }
}

const startJanScanner = () => {
  setScannerMessage(
    "カメラを起動しています…"
  );
  setScanning(true);
};

const closeJanScanner = () => {
  try {
    controlsRef.current?.stop();
  } catch {}

  controlsRef.current = null;
  scannerRef.current = null;

  setScanning(false);
};

useEffect(() => {
  if (!scanning) {
    return;
  }

  let cancelled = false;

  const startCamera = async () => {
    try {
      setScannerMessage(
        "カメラを起動しています…"
      );

      if (!videoRef.current) {
        setScannerMessage(
          "カメラ画面を準備しています…"
        );
        return;
      }

      const reader =
        new BrowserMultiFormatReader();

      scannerRef.current = reader;

      setScannerMessage(
        "JANコードをカメラに映してください"
      );

      const controls =
        await reader.decodeFromConstraints(
          {
            video: {
              facingMode: {
                ideal: "environment",
              },
            },
          },
          videoRef.current,
          (result, error) => {
            if (cancelled) {
              return;
            }

            if (result && !janLookupRef.current) {
              const jan =
                result
                  .getText()
                  .replace(/\\D/g, "");

              console.log(
                "JANコード検出:",
                jan
              );

              if (jan.length === 13) {
                try {
                  controls.stop();
                } catch {}

                controlsRef.current = null;
                scannerRef.current = null;

                setScanning(false);
                void lookupProductByJan(jan);
              }
            }

            if (error) {
              console.log(
                "スキャン中:",
                error
              );
            }
          }
        );

      if (cancelled) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
    } catch (error) {
      console.error(
        "JANスキャンエラー:",
        error
      );

      if (!cancelled) {
        setScannerMessage(
          "カメラを起動できませんでした。"
        );

        alert(
          "カメラを起動できませんでした。\\n\\n" +
          "Safariのカメラ使用許可を確認して、もう一度お試しください。"
        );

        setScanning(false);
      }
    }
  };

  startCamera();

  return () => {
    cancelled = true;

    try {
      controlsRef.current?.stop();
    } catch {}

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
console.log("Applied JAN auto product lookup patch.");
