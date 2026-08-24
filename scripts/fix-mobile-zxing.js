const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let text = fs.readFileSync(file, "utf8");

// iPhone/Safariで初期表示時にZXing本体を読み込むと、
// カメラを使っていない状態でもDashboard全体が白画面になる場合があるため、
// ZXingはJANスキャン開始時だけ遅延ロードする。
text = text.replace(
  'import { BrowserMultiFormatReader } from "@zxing/browser";\n',
  'import type { BrowserMultiFormatReader } from "@zxing/browser";\n'
);

const old = 'const reader = new BrowserMultiFormatReader();';
const replacement = 'const { BrowserMultiFormatReader } = await import("@zxing/browser");\n      const reader = new BrowserMultiFormatReader();';

if (text.includes(old) && !text.includes('const { BrowserMultiFormatReader } = await import("@zxing/browser");')) {
  text = text.replace(old, replacement);
}

fs.writeFileSync(file, text, "utf8");
console.log("Applied mobile-safe lazy loading for ZXing.");
