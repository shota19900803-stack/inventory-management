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
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", accessKey },
    });
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
  return /中古|中古品|ユーズド|used|ジャンク|開封済み|開封品|箱なし|欠品|訳あり|アウトレット|展示品|リファービッシュ|再生品|部品/.test(text);
}

function chooseItem(items: any[], p: Product, requireStrongMatch = false) {
  const jan = cleanJan(p.jan);
  const target = normalize(p.name);
  const model = normalize(p.model);
  const brand = normalize(p.brand);
  const candidates = items.map((item: any) => {
    if (!item || isExcluded(item)) return null;
    const price = Number(String(item.itemPrice ?? "").replace(/,/g, ""));
    if (!Number.isFinite(price) || price <= 0) return null;
    const rawText = cleanText(`${item.itemName ?? ""} ${item.itemCaption ?? ""} ${item.itemCode ?? ""}`);
    const digits = rawText.replace(/\D/g, "");
    const name = normalize(item.itemName);
    let score = 0;
    const hasJan = digits.includes(jan);
    if (hasJan) score += 10000;
    if (target && name === target) score += 800;
    if (target && name.includes(target)) score += 400;
    if (model && name.includes(model)) score += 250;
    if (brand && name.includes(brand)) score += 80;
    if (requireStrongMatch && !hasJan && !(model && name.includes(model)) && !(target && name.includes(target))) return null;
    return { item, price, score, hasJan };
  }).filter(Boolean) as Array<{ item: any; price: number; score: number; hasJan: boolean }>;
  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  return candidates[0] ?? null;
}

async function searchProduct(appId: string, accessKey: string, jan: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  // Access key is supplied in the required header; avoid duplicating it in the URL.
  url.searchParams.set("productCode", jan);
  // Do not restrict elements here. This avoids field-name/version mismatches and lets us
  // inspect the complete Product Search response when Rakuten changes output fields.
  return fetchJson(url, accessKey);
}

async function searchItems(appId: string, accessKey: string, keyword: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("hits", "30");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "1");
  url.searchParams.set("NGKeyword", "中古 中古品 ユーズド used ジャンク 開封済み 開封品 箱なし 欠品 訳あり アウトレット 展示品 リファービッシュ 再生品 部品");
  url.searchParams.set("elements", "itemName,itemPrice,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode");
  return fetchJson(url, accessKey);
}

function apiError(data: any, status: number) {
  return data?.error_description || data?.error || `HTTP ${status}`;
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) return NextResponse.json({ error: "楽天APIの環境変数が未設定です。Vercelの RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY を確認してください。", results: [] }, { status: 503 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 }); }
  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw.map((p: any) => ({ jan: cleanJan(p?.jan), name: cleanText(p?.name), brand: cleanText(p?.brand), model: cleanText(p?.model) }));
  const unique = Array.from(new Map(products.filter(p => p.jan.length === 13).map(p => [p.jan, p])).values());
  if (!unique.length) return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });
  if (unique.length > 5) return NextResponse.json({ error: "1回の取得は最大5商品です。", results: [] }, { status: 400 });

  const results: any[] = [];
  for (let i = 0; i < unique.length; i++) {
    const p = unique[i];
    const started = Date.now();
    let productError = "";
    let productDebug = "";

    try {
      // 1) Exact JAN in Rakuten Product Search / price navigation.
      try {
        const r = await searchProduct(appId, accessKey, p.jan);
        const productItems = itemsOf(r.data);
        productDebug = `商品価格ナビHTTP ${r.response.status} / 結果${productItems.length}件`;
        if (r.response.ok && productItems.length > 0) {
          const item = productItems[0];
          const newPrice = Number(String(item.usedExcludeSalesMinPrice ?? "").replace(/,/g, ""));
          const salesPrice = Number(String(item.salesMinPrice ?? "").replace(/,/g, ""));
          const fallbackPrice = Number(String(item.usedExcludeMinPrice ?? "").replace(/,/g, ""));
          if (Number.isFinite(newPrice) && newPrice > 0) {
            results.push({ jan: p.jan, price: newPrice, productName: item.productName ?? p.name, productCode: item.productCode ?? p.jan, source: "product-price-navigation-new", elapsedMs: Date.now() - started, error: null });
            continue;
          }
          if (Number.isFinite(salesPrice) && salesPrice > 0) {
            // Product Search exposes salesMinPrice as the purchasable minimum. It is used only
            // when the dedicated "used-excluded purchasable minimum" is unavailable.
            results.push({ jan: p.jan, price: salesPrice, productName: item.productName ?? p.name, productCode: item.productCode ?? p.jan, source: "product-price-navigation-sales-min-fallback", elapsedMs: Date.now() - started, error: null });
            continue;
          }
          if (Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
            results.push({ jan: p.jan, price: fallbackPrice, productName: item.productName ?? p.name, productCode: item.productCode ?? p.jan, source: "product-price-navigation-min-fallback", elapsedMs: Date.now() - started, error: null });
            continue;
          }
          productError = `商品価格ナビ：JAN製品は存在しますが価格がありません（itemCount=${item.itemCount ?? "?"}, salesItemCount=${item.salesItemCount ?? "?"}, usedExcludeSalesItemCount=${item.usedExcludeSalesItemCount ?? "?"}）`;
        } else {
          productError = `商品価格ナビ：${apiError(r.data, r.response.status)}`;
        }
      } catch (e: any) {
        productError = e?.name === "AbortError" ? "商品価格ナビ：8秒でタイムアウト" : `商品価格ナビ：${e?.message || "接続失敗"}`;
      }

      // 2) Rakuten Ichiba Item Search. Try exact JAN first, then model/name only if needed.
      const kws = Array.from(new Set([p.jan, p.model, p.brand && p.model ? `${p.brand} ${p.model}` : "", p.name].filter(Boolean)));
      let candidate: any = null;
      let matchedKeyword = "";
      const searchDebug: string[] = [];
      for (const keyword of kws) {
        try {
          const r = await searchItems(appId, accessKey, keyword);
          const list = itemsOf(r.data);
          searchDebug.push(`${keyword.slice(0, 24)}:${r.response.status}/${list.length}`);
          if (!r.response.ok) continue;
          const found = chooseItem(list, p, keyword !== p.name);
          if (found) { candidate = found; matchedKeyword = keyword; break; }
        } catch (e: any) {
          searchDebug.push(`${keyword.slice(0, 24)}:${e?.name === "AbortError" ? "timeout" : "error"}`);
        }
        await sleep(120);
      }

      if (candidate) {
        results.push({ jan: p.jan, price: candidate.price, productName: candidate.item.itemName ?? p.name, itemUrl: candidate.item.itemUrl ?? null, shopName: candidate.item.shopName ?? null, source: "rakuten-ichiba-item-search", matchedKeyword, elapsedMs: Date.now() - started, error: null });
      } else {
        results.push({ jan: p.jan, price: null, elapsedMs: Date.now() - started, error: `${productError || "商品価格ナビで価格なし"} / 楽天市場検索：${searchDebug.join(" | ") || "検索結果なし"}` });
      }
    } catch (e: any) {
      results.push({ jan: p.jan, price: null, elapsedMs: Date.now() - started, error: `${productDebug ? productDebug + " / " : ""}${e?.message || "楽天APIへの接続に失敗しました。"}` });
    }
    if (i < unique.length - 1) await sleep(350);
  }
  return NextResponse.json({ results });
}
