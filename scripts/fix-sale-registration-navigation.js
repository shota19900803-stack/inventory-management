const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "Dashboard.tsx");
let source = fs.readFileSync(file, "utf8");

const saveStart = source.indexOf("async function saveSale(");
if (saveStart < 0) {
  throw new Error("saveSale function was not found.");
}

const nextFunction = source.indexOf("\nasync function ", saveStart + 10);
const saveEnd = nextFunction >= 0 ? nextFunction : source.length;
let saveBlock = source.slice(saveStart, saveEnd);

// 売上登録成功後に月次集計へ戻る古い処理を、必ず売上登録タブへ戻す処理に統一する。
saveBlock = saveBlock.replace(/setTab\(\s*[\"']dashboard[\"']\s*\)\s*;?/g, 'setTab("sales");');

const navigationMarker = "// FINAL: stay on sales tab after sale registration";

// 既存の成功処理が残っている場合は、そこへ確実に sales タブ固定＋上部スクロールを入れる。
const resetLoadPattern = /setSaleForm\(initialSaleForm\);[\s\S]{0,500}?await loadAll\(\);/;
if (resetLoadPattern.test(saveBlock)) {
  saveBlock = saveBlock.replace(resetLoadPattern, (match) => {
    const loadPos = match.lastIndexOf("await loadAll();");
    const beforeLoad = match.slice(0, loadPos);
    return `${beforeLoad}await loadAll();\n\n    ${navigationMarker}\n    setTab("sales");\n    if (typeof window !== "undefined") {\n      const restoreSaleView = () => {\n        try { document.activeElement?.blur(); } catch {}\n        window.scrollTo({ top: 0, left: 0, behavior: "auto" });\n      };\n      requestAnimationFrame(restoreSaleView);\n      window.setTimeout(restoreSaleView, 50);\n      window.setTimeout(restoreSaleView, 200);\n    }`;
  });
} else if (!saveBlock.includes(navigationMarker)) {
  // reset/load の書式が変わった場合でも、saveSale の最後の loadAll の直後へ注入する。
  const loadIndex = saveBlock.lastIndexOf("await loadAll();");
  if (loadIndex >= 0) {
    const insertAt = loadIndex + "await loadAll();".length;
    saveBlock = saveBlock.slice(0, insertAt) + `\n\n    ${navigationMarker}\n    setTab("sales");\n    if (typeof window !== "undefined") {\n      const restoreSaleView = () => {\n        try { document.activeElement?.blur(); } catch {}\n        window.scrollTo({ top: 0, left: 0, behavior: "auto" });\n      };\n      requestAnimationFrame(restoreSaleView);\n      window.setTimeout(restoreSaleView, 50);\n      window.setTimeout(restoreSaleView, 200);\n    }` + saveBlock.slice(insertAt);
  } else {
    throw new Error("sale registration loadAll block was not found.");
  }
}

source = source.slice(0, saveStart) + saveBlock + source.slice(saveEnd);

// 売上登録後に Dashboard が再描画・再マウントされても、sales タブを維持する。
// これで「画面下へ飛ぶ → 月次集計へ戻る」という状態リセットを防ぐ。
const persistenceMarker = "// FINAL: persist active inventory tab";
if (!source.includes(persistenceMarker)) {
  const oldState = `  const [tab, setTab] = useState<Tab>("dashboard");`;
  const newState = `  const [tab, setTabState] = useState<Tab>("dashboard");\n\n  const setTab = (next: Tab) => {\n    setTabState(next);\n    try {\n      sessionStorage.setItem("inventory-active-tab", next);\n    } catch {}\n  };\n\n  useEffect(() => {\n    try {\n      const saved = sessionStorage.getItem("inventory-active-tab");\n      if (saved === "dashboard" || saved === "products" || saved === "purchases" || saved === "sales") {\n        setTabState(saved as Tab);\n      }\n    } catch {}\n  }, []);`;

  if (!source.includes(oldState)) {
    throw new Error("Dashboard tab state block was not found.");
  }

  source = source.replace(oldState, newState);
  source += `\n${persistenceMarker}\n`;
}

fs.writeFileSync(file, source, "utf8");
console.log("Applied final sale registration navigation fix: stay on sales tab, persist tab, and restore scroll to top.");