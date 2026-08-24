const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// JANカメラは「映像だけ大きくする」のではなく、
// スマホ上でカメラの親コンテナも横幅いっぱいに広げる。
// 既存のZXing読み取り処理は変更しない。

const cameraLayoutEffect = `
  // JANカメラをスマホ幅いっぱいで使いやすくする。
  // 現在のUIがPC向けの横並びレイアウトでも、カメラ起動時だけ縦並びに直す。
  useEffect(() => {
    if (!scanning) return;

    const timer = window.setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;

      video.style.width = "100%";
      video.style.maxWidth = "none";
      video.style.height = "min(72vh, 680px)";
      video.style.minHeight = "45vh";
      video.style.display = "block";
      video.style.objectFit = "contain";
      video.style.margin = "0";
      video.style.background = "#111";
      video.style.borderRadius = "12px";

      const videoParent = video.parentElement;
      if (videoParent) {
        videoParent.style.width = "100%";
        videoParent.style.maxWidth = "none";
        videoParent.style.boxSizing = "border-box";
      }

      // videoから上へたどり、カメラ部分を横並びにしている親を探す。
      // 見つかった親を縦並び＋スマホ幅に変更することで、
      // 「左側に大きな空白、右側だけカメラ」という状態を解消する。
      let node: HTMLElement | null = video.parentElement;
      for (let i = 0; node && i < 6; i += 1) {
        const computed = window.getComputedStyle(node);
        if (computed.display === "flex" && computed.flexDirection !== "column") {
          node.style.flexDirection = "column";
          node.style.alignItems = "stretch";
          node.style.justifyContent = "center";
          node.style.width = "calc(100vw - 24px)";
          node.style.maxWidth = "720px";
          node.style.marginLeft = "auto";
          node.style.marginRight = "auto";
          node.style.boxSizing = "border-box";
          node.style.gap = "10px";
          break;
        }
        node = node.parentElement;
      }
    }, 50);

    return () => window.clearTimeout(timer);
  }, [scanning]);
`;

if (!text.includes("// JANカメラをスマホ幅いっぱいで使いやすくする。")) {
  const marker = "useEffect(() => {\n  if (!scanning) {";
  if (!text.includes(marker)) {
    throw new Error("JAN scanner effect marker not found.");
  }
  text = text.replace(marker, cameraLayoutEffect + "\n" + marker);
}

// 既存のvideoスタイルも見つかる場合は、高さだけ確実に拡大する。
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
