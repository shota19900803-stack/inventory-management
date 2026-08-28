import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const normalize = (v: unknown) => cleanText(v).toLowerCase().replace(/[【】\[\]（）()「」『』<>＜＞]/g, " ").replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();

async function fetchJson(url: URL, accessKey: string, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Rakuten allows the access key either in the header OR as a query parameter.
    // Use the query parameter only to avoid duplicate authentication parameters.
    url.searchParams.set("accessKey", accessKey);
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function itemsOf(data: any): any[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function priceOf(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isExcluded(item: any) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCaption ?? ""}`).toLowerCase();
  return /中古|中古品|ユーズド|used|ジャンク|開封済み|開封品|箱なし|欠品|訳あり|アウトレット|展示品|リファービッシュ|再生品|部品/.test(text);
}

function chooseProductPrice(items: any[], p: Product) {
  const jan = cleanJan(p.jan);
  const target = normalize(p.name);
  const model = normalize(p.model);
  const brand = normalize(p.brand);

  const candidates = items.map((item: any) => {
    const price = priceOf(item?.usedExcludeSalesMinPrice) ?? priceOf(item?.salesMinPrice);
    if (price == null) return null;
    const code = cleanJan(item?.productCode);
    const name = normalize(item?.productName);
    const productNo = normalize(item?.productNo);
    const itemBrand = normalize(item?.brandName);
    let score = 0;
    if (code === jan) score += 10000;
    if (model && productNo === model) score += 5000;
    if (model && (name.includes(model) || productNo.includes(model))) score += 1000;
    if (brand && itemBrand === brand) score += 500;
    if (target && name === target) score += 400;
    if (target && name.includes(target)) score += 200;
    return { item, price, score };
  }).filter(Boolean) as Array<{ item: any; price: number; score: number }>;

  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  return candidates[0] ?? null;
}

function chooseIchibaItem(items: any[], p: Product) {
  const jan = cleanJan(p.jan);
  const target = normalize(p.name);
  const model = normalize(p.model);
  const brand = normalize(p.brand);

  const candidates = items.map((item: any) => {
    if (!item || isExcluded(item)) return null;
    const price = priceOf(item.itemPrice);
    if (price == null) return null;
    const searchable = cleanText(`${item.itemName ?? ""} ${item.itemCaption ?? ""} ${item.itemCode ?? ""}`);
    const digits = searchable.replace(/\D/g, "");
    const name = normalize(item.itemName);
    let score = 0;
    const hasJan = jan.length === 13 && digits.includes(jan);
    if (hasJan) score += 10000;
    if (model && name.includes(model)) score += 2500;
    if (brand && name.includes(brand)) score += 700;
    if (target && name === target) score += 1000;
    if (target && name.includes(target)) score += 400;
    return { item, price, score, hasJan };
  }).filter(Boolean) as Array<{ item: any; price: number; score: number; hasJan: boolean }>;

  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  return candidates.find((x) => x.hasJan) ?? candidates[0] ?? null;
}

async function productSearchByJan(appId: string, accessKey: string, jan: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  // productCode may not be combined with service-specific parameters.
  url.searchParams.set("productCode", jan);
  return fetchJson(url, accessKey);
}

async function productSearchByKeyword(appId: string, accessKey: string, keyword: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("hits", "30");
  return fetchJson(url, accessKey);
}

async function ichibaSearch(appId: string, accessKey: string, keyword: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("hits", "30");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "1");
  url.searchParams.set("elements", "itemName,itemPrice,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode,catchcopy");
  return fetchJson(url, accessKey);
}

function apiError(data: any, status: number) {
  return data?.error_description || data?.error || `HTTP ${status}`;
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (!appId || !accessKey) {
    return NextResponse.json({ error: "楽天APIの環境変数が未設定です。Vercelの RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY を確認してください。", results: [] }, { status: 503 });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 });
  }

  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw.map((p: any) => ({
    jan: cleanJan(p?.jan),
    name: cleanText(p?.name),
    brand: cleanText(p?.brand),
    model: cleanText(p?.model),
  }));

  const unique = Array.from(new Map(products.filter((p) => p.jan.length === 13).map((p) => [p.jan, p])).values());
  if (!unique.length) return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });
  if (unique.length > 5) return NextResponse.json({ error: "1回の取得は最大5商品です。", results: [] }, { status: 400 });

  const results: any[] = [];

  for (const p of unique) {
    const started = Date.now();
    const debug: string[] = [];
    let completed = false;

    try {
      // 1. Exact JAN in Rakuten Product Price Navigation.
      try {
        const r = await productSearchByJan(appId, accessKey, p.jan);
        const list = itemsOf(r.data);
        debug.push(`商品価格ナビJAN:${r.response.status}/${list.length}`);
        if (r.response.ok) {
          const found = chooseProductPrice(list, p);
          if (found) {
            results.push({ jan: p.jan, price: found.price, productName: found.item.productName ?? p.name, productCode: found.item.productCode ?? p.jan, source: "product-price-navigation", elapsedMs: Date.now() - started, error: null });
            completed = true;
          }
        } else debug.push(apiError(r.data, r.response.status));
      } catch (e: any) {
        debug.push(e?.name === "AbortError" ? "商品価格ナビJAN:timeout" : `商品価格ナビJAN:${e?.message || "error"}`);
      }

      if (completed) continue;

      // 2. Search Product Navigation by the model/name when JAN is not mapped.
      const keywords = Array.from(new Set([p.model, p.name].map(cleanText).filter((x) => x.length >= 2)));
      for (const keyword of keywords.slice(0, 2)) {
        try {
          const r = await productSearchByKeyword(appId, accessKey, keyword);
          const list = itemsOf(r.data);
          debug.push(`商品価格ナビ:${keyword.slice(0, 18)}:${r.response.status}/${list.length}`);
          if (r.response.ok) {
            const found = chooseProductPrice(list, p);
            if (found) {
              results.push({ jan: p.jan, price: found.price, productName: found.item.productName ?? p.name, productCode: found.item.productCode ?? null, source: "product-price-navigation-keyword", elapsedMs: Date.now() - started, error: null });
              completed = true;
              break;
            }
          } else debug.push(apiError(r.data, r.response.status));
        } catch (e: any) {
          debug.push(e?.name === "AbortError" ? `商品価格ナビ:${keyword.slice(0, 18)}:timeout` : `商品価格ナビ:${e?.message || "error"}`);
        }
      }

      if (completed) continue;

      // 3. One actual Ichiba listing search, using the most specific keyword first.
      const ichibaKeyword = cleanText(p.model || p.name);
      if (ichibaKeyword.length >= 2) {
        try {
          const r = await ichibaSearch(appId, accessKey, ichibaKeyword);
          const list = itemsOf(r.data);
          debug.push(`楽天市場:${ichibaKeyword.slice(0, 18)}:${r.response.status}/${list.length}`);
          if (r.response.ok) {
            const found = chooseIchibaItem(list, p);
            if (found) {
              results.push({ jan: p.jan, price: found.price, productName: found.item.itemName ?? p.name, itemUrl: found.item.itemUrl ?? null, shopName: found.item.shopName ?? null, source: "rakuten-ichiba-item-search", elapsedMs: Date.now() - started, error: null });
              completed = true;
            }
          } else debug.push(apiError(r.data, r.response.status));
        } catch (e: any) {
          debug.push(e?.name === "AbortError" ? "楽天市場:timeout" : `楽天市場:${e?.message || "error"}`);
        }
      }

      if (!completed) {
        results.push({ jan: p.jan, price: null, elapsedMs: Date.now() - started, error: debug.join(" / ") || "楽天API検索結果なし" });
      }
    } catch (e: any) {
      results.push({ jan: p.jan, price: null, elapsedMs: Date.now() - started, error: `${debug.join(" / ")} / ${e?.message || "楽天APIへの接続に失敗しました。"}` });
    }
  }

  return NextResponse.json({ results });
}
