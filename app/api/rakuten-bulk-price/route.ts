import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const normalize = (v: unknown) => cleanText(v).toLowerCase().replace(/[【】\[\]（）()「」『』<>＜＞]/g, " ").replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: URL, accessKey: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json", accessKey } });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
    return { response, data };
  } finally { clearTimeout(timer); }
}

function itemsOf(data: any): any[] {
  return Array.isArray(data?.items) ? data.items.map((x: any) => x?.item ?? x).filter(Boolean) : [];
}
function isExcluded(item: any) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.itemCaption ?? ""}`).toLowerCase();
  return /中古|中古品|ユーズド|used|ジャンク|開封済み|開封品|箱なし|欠品|訳あり|アウトレット|展示品|リファービッシュ|再生品/.test(text);
}
function chooseItem(items: any[], p: Product) {
  const jan = cleanJan(p.jan), target = normalize(p.name), model = normalize(p.model), brand = normalize(p.brand);
  const candidates = items.map((item: any) => {
    if (!item || isExcluded(item)) return null;
    const price = Number(item.itemPrice ?? 0);
    if (!Number.isFinite(price) || price <= 0) return null;
    const text = cleanText(`${item.itemName ?? ""} ${item.itemCaption ?? ""} ${item.itemCode ?? ""}`);
    const digits = text.replace(/\D/g, ""), name = normalize(item.itemName);
    let score = 0;
    if (digits.includes(jan)) score += 10000;
    if (target && name === target) score += 500;
    if (target && name.includes(target)) score += 250;
    if (model && name.includes(model)) score += 150;
    if (brand && name.includes(brand)) score += 50;
    return { item, price, score };
  }).filter(Boolean) as Array<{ item: any; price: number; score: number }>;
  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  return candidates[0] ?? null;
}

async function searchProduct(appId: string, accessKey: string, jan: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json"); url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId); url.searchParams.set("accessKey", accessKey); url.searchParams.set("productCode", jan);
  url.searchParams.set("elements", "productId,productCode,productName,productNo,brandName,itemCount,salesItemCount,usedExcludeSalesItemCount,minPrice,salesMinPrice,usedExcludeMinPrice,usedExcludeSalesMinPrice");
  return fetchJson(url, accessKey);
}
async function searchItems(appId: string, accessKey: string, keyword: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json"); url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId); url.searchParams.set("accessKey", accessKey); url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("hits", "30"); url.searchParams.set("sort", "+itemPrice"); url.searchParams.set("availability", "1");
  url.searchParams.set("elements", "itemName,itemPrice,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode");
  return fetchJson(url, accessKey);
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID, accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) return NextResponse.json({ error: "楽天APIの環境変数が未設定です。", results: [] }, { status: 503 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 }); }
  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw.map((p: any) => ({ jan: cleanJan(p?.jan), name: cleanText(p?.name), brand: cleanText(p?.brand), model: cleanText(p?.model) }));
  const unique = Array.from(new Map(products.filter(p => p.jan.length === 13).map(p => [p.jan, p])).values());
  if (!unique.length) return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });
  if (unique.length > 5) return NextResponse.json({ error: "1回の取得は最大5商品です。", results: [] }, { status: 400 });

  const results: any[] = [];
  for (let i = 0; i < unique.length; i++) {
    const p = unique[i], started = Date.now();
    let productError = "";
    try {
      // A. JAN完全一致の楽天商品価格ナビ
      try {
        const r = await searchProduct(appId, accessKey, p.jan);
        if (r.response.ok) {
          const item = itemsOf(r.data)[0];
          if (item) {
            // 新品最安値は「中古を除く購入可能な最低価格」を最優先。
            const newPrice = Number(item.usedExcludeSalesMinPrice ?? 0);
            const salesPrice = Number(item.salesMinPrice ?? 0);
            if (newPrice > 0) {
              results.push({ jan: p.jan, price: newPrice, productName: item.productName ?? p.name, productCode: item.productCode ?? p.jan, source: "product-price-navigation", elapsedMs: Date.now() - started, error: null });
              continue;
            }
            productError = salesPrice > 0 ? `商品価格ナビ：新品除外価格なし（購入可能価格¥${salesPrice.toLocaleString()}）` : "商品価格ナビ：価格情報なし";
          } else productError = "商品価格ナビ：JAN一致の商品なし";
        } else productError = `商品価格ナビ：HTTP ${r.response.status} ${r.data?.error_description || r.data?.error || "エラー"}`;
      } catch (e: any) {
        productError = e?.name === "AbortError" ? "商品価格ナビ：8秒でタイムアウト" : `商品価格ナビ：${e?.message || "接続失敗"}`;
      }

      // B. JANだけでなく型番・商品名でも楽天市場を検索する。
      // JANが商品名/商品コードに含まれない店舗出品にも対応するためのフォールバック。
      const kws = Array.from(new Set([p.jan, p.model, p.brand && p.model ? `${p.brand} ${p.model}` : "", p.name.slice(0, 100)].filter(Boolean)));
      let candidate: any = null, matchedKeyword = "";
      for (const keyword of kws) {
        try {
          const r = await searchItems(appId, accessKey, keyword);
          if (!r.response.ok) continue;
          const found = chooseItem(itemsOf(r.data), p);
          if (found) { candidate = found; matchedKeyword = keyword; break; }
        } catch { /* 次の検索へ */ }
        await sleep(150);
      }
      if (candidate) {
        results.push({ jan: p.jan, price: candidate.price, productName: candidate.item.itemName ?? p.name, itemUrl: candidate.item.itemUrl ?? null, shopName: candidate.item.shopName ?? null, source: "rakuten-ichiba-item-search", matchedKeyword, elapsedMs: Date.now() - started, error: null });
      } else {
        results.push({ jan: p.jan, price: null, elapsedMs: Date.now() - started, error: `${productError || "商品価格ナビで価格なし"} / 楽天市場の商品検索でも新品出品を確認できませんでした。` });
      }
    } catch (e: any) {
      results.push({ jan: p.jan, price: null, elapsedMs: Date.now() - started, error: e?.message || "楽天APIへの接続に失敗しました。" });
    }
    if (i < unique.length - 1) await sleep(350);
  }
  return NextResponse.json({ results });
}
