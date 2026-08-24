const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// JANカメラの表示だけを改善するパッチ。
// ZXingの読み取り処理そのものには触れない。
const marker = "  const monthSales = useMemo(() => {";

const effect = `  // JANカメラ起動時に、カメラ表示をスマホ幅いっぱいに整える。\n  useEffect(() => {\n    if (!scanning) return;\n\n    const timer = window.setTimeout(() => {\n      const video = videoRef.current;\n      if (!video) return;\n\n      video.style.width = "100%";\n      video.style.maxWidth = "none";\n      video.style.height = "min(72vh, 680px)";\n      video.style.minHeight = "45vh";\n      video.style.display = "block";\n      video.style.objectFit = "contain";\n      video.style.margin = "0";\n      video.style.background = "#111";\n      video.style.borderRadius = "12px";\n\n      let node = video.parentElement;\n      for (let i = 0; node && i < 6; i += 1) {\n        const computed = window.getComputedStyle(node);\n        if (computed.display === "flex") {\n          node.style.flexDirection = "column";\n          node.style.alignItems = "stretch";\n          node.style.justifyContent = "center";\n          node.style.width = "calc(100vw - 24px)";\n          node.style.maxWidth = "720px";\n          node.style.marginLeft = "auto";\n          node.style.marginRight = "auto";\n          node.style.boxSizing = "border-box";\n          node.style.gap = "10px";\n          break;\n        }\n        node = node.parentElement;\n      }\n\n      const parent = video.parentElement;\n      if (parent) {\n        parent.style.width = "100%";\n        parent.style.maxWidth = "none";\n        parent.style.boxSizing = "border-box";\n      }\n    }, 50);\n\n    return () => window.clearTimeout(timer);\n  }, [scanning]);\n\n`;

if (!text.includes("// JANカメラ起動時に、カメラ表示をスマホ幅いっぱいに整える。")) {
  const index = text.indexOf(marker);
  if (index === -1) {
    throw new Error("JAN camera UI insertion marker not found.");
  }
  text = text.slice(0, index) + effect + text.slice(index);
}

// JSX側に既存のvideoスタイルがある場合も、大きさを確実に上書きする。
text = text.replace(
  /style=\{\{\s*width: "100%",\s*display: "block",\s*borderRadius: 8,\s*\}\}/,
  `style={{
        width: "100%",
        height: "min(72vh, 680px)",
        minHeight: "45vh",
        display: "block",
        objectFit: "contain",
        borderRadius: 12,
        background: "#111",
      }}`
);

fs.writeFileSync(file, text, "utf8");
console.log("Applied mobile full-width JAN camera layout.");
