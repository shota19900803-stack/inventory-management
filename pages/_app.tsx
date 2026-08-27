import type { AppProps } from "next/app";
import { useEffect } from "react";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (window.location.pathname !== "/") return;

    let timer: number | null = null;
    let reloading = false;

    const scheduleRefresh = () => {
      if (reloading) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        reloading = true;
        window.location.reload();
      }, 700);
    };

    const observer = new MutationObserver(() => {
      const text = document.body?.textContent || "";
      if (
        text.includes("売上を登録しました。") ||
        text.includes("売上を更新し、在庫も調整しました。")
      ) {
        scheduleRefresh();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return <Component {...pageProps} />;
}
