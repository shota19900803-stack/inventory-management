const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

const refPattern = /const controlsRef = useRef<any>\(null\);\s*(?:const janLookupRef = useRef\(false\);\s*)?const \[scanning, setScanning\] = useState\(false\);/;

if (!refPattern.test(text)) {
  throw new Error("JAN scanner reference block was not found.");
}

text = text.replace(
  refPattern,
  `const controlsRef = useRef<any>(null);\nconst janLookupRef = useRef(false);\nconst [scanning, setScanning] = useState(false);`
);

const start = text.indexOf("const startJanScanner = () => {");
const end = text.indexOf("  const monthSales = useMemo", start);

if (start === -1 || end === -1) {
  throw new Error("JAN scanner block was not found.");
}

const newBlock = `function isValidJan13(value: string) {
  if (!/^\\d{13}$/.test(value)) return false;

  const digits = value.split("").map(Number);
  const check = digits
    .slice(0, 12)
    .reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 1 : 3), 0);

  return (10 - (check % 10)) % 10 === digits[12];
}

const startJanScanner = () => {
  setScannerMessage("カメラを起動しています…");
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

      const reader = new BrowserMultiFormatReader(undefined, 250);
      scannerRef.current = reader;

      const video = videoRef.current;
      video.setAttribute("autoplay", "true");
      video.setAttribute("muted", "true");
      video.setAttribute("playsinline", "true");
      video.muted = true;
      video.playsInline = true;

      setScannerMessage("JANコードを枠の中に入れてください");

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            frameRate: { ideal: 30, min: 15 },
          },
        },
        video,
        (result, error) => {
          if (cancelled || janLookupRef.current || !result) {
            if (error) console.log("スキャン中:", error);
            return;
          }

          const raw = result.getText().replace(/\\D/g, "");
          const now = Date.now();

          if (raw.length !== 13 || !isValidJan13(raw)) {
            if (error) console.log("スキャン中:", error);
            return;
          }

          if (raw === lastDetected && now - lastDetectedAt < 1500) {
            return;
          }

          lastDetected = raw;
          lastDetectedAt = now;
          console.log("JANコード検出:", raw);

          try {
            controlsRef.current?.stop();
          } catch {}

          controlsRef.current = null;
          scannerRef.current = null;
          setProductForm((prev) => ({
            ...prev,
            jan_code: raw,
          }));
          setScannerMessage(\`読み取り成功：\${raw}\`);

          window.setTimeout(() => {
            if (!cancelled) setScanning(false);
          }, 250);
        }
      );

      if (cancelled) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;

      try {
        await video.play();
      } catch (playError) {
        console.log("video.play待機:", playError);
      }
    } catch (error) {
      console.error("JANスキャンエラー:", error);

      if (!cancelled) {
        setScannerMessage("カメラを起動できませんでした。");
        alert(
          "カメラを起動できませんでした。\\n\\n" +
          "Safariのカメラ使用許可を確認して、もう一度お試しください。"
        );
        setScanning(false);
      }
    }
  };

  void startCamera();

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
}, [scanning]);
`;

text = text.slice(0, start) + newBlock + text.slice(end);
fs.writeFileSync(file, text, "utf8");
console.log("Applied stronger JAN scanner patch.");
