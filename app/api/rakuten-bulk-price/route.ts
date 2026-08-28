import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };

function cleanJan(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 13);
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/[\s　]+/g, " ").trim();
}

function normalize(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[【】\[\]（）()「」『』<>＜＞]/g, " ")
    .replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: URL, accessKey: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", accessKey },
    });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
    return { response, data, elapsedMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rakuten Product Search API.
 * Important: productCode(JAN) cannot be combined with service-specific
 * parameters such as hits/page/sort. Only common parameters are added.
 */
async function searchProduct(appId: string, accessKey: string, jan: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);
  // Keep the response small. These are common parameters and are allowed with productCode.
  url.searchParams.set("elements", "productId,productCode,productName,productNo,brandName,itemCount,salesItemCount,usedExcludeSalesItemCount,minPrice,salesMinPrice,usedExcludeMinPrice,usedExcludeSalesMinPrice");
  return fetchJson(url, accessKey);
}

/**
 * Rakuten Ichiba Item Search fallback.
 * A single JAN search is deliberately used instead of several sequential
 * keyword searches so one lookup cannot turn into a 30-60 second wait.
 */
async function searchItemsByJan(appId: string, accessKey: string, jan: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", jan);
  url.searchParams.set("hits", "30");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("elements", "itemName,itemPrice,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode");
  return fetchJson(url, accessKey);
}

function unwrapItems(data: any) {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function isExcluded(item: any) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.itemCaption ?? ""}`).toLowerCase();
  return /中古|中古品|ユーズド|used|ジャンク|開封済み|開封品|箱なし|欠品|訳あり|アウトレット|展示品|リファービッシュ|再生品/.test(text);
}

function chooseJanItem(items: any[], product: Product) {
  const jan = cleanJan(product.jan);
  const targetName = normalize(product.name);
  const model = normalize(product.model);
  const brand = normalize(product.brand);

  const candidates = items.map((item: any) => {
    if (!item || isExcluded(item)) return null;
    const price = Number(item?.itemPrice ?? 0);
    if (!Number.isFinite(price) || price <= 0) return null;
    const rawText = cleanText(`${item?.itemName ?? ""} ${item?.itemCaption ?? ""} ${item?.itemCode ?? ""}`);
    const digits = rawText.replace(/\D/g, "");
    const name = normalize(item?.itemName);
    let score = 0;
    if (digits.includes(jan)) score += 1000;
    if (name === targetName) score += 100;
    if (targetName && name.includes(targetName)) score += 60;
    if (model && name.includes(model)) score += 40;
    if (brand && name.includes(brand)) score += 20;
    return { item, price, score };
  }).filter(Boolean) as Array<{ item: any; price: number; score: number }>;

  // Prefer JAN-containing listings, then product-name/model matches, then price.
  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  return candidates[0] ?? null;
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) {
    return NextResponse.json({ error: "楽天APIの環境変数が未設定です。", results: [] }, { status: 503 });
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

  for (let i = 0; i < unique.length; i += 1) {
    const p = unique[i];
    const started = Date.now();
    let productApiMessage = "";

    try {
      // ① First choice: exact JAN -> Product Search / price navigation.
      try {
        const r = await searchProduct(appId, accessKey, p.jan);
        if (r.response.ok) {
          const item = unwrapItems(r.data)[0];
          if (item) {
            const newPrice = Number(item.usedExcludeSalesMinPrice ?? 0);
            const salesPrice = Number(item.salesMinPrice ?? 0);
            const fallbackPrice = Number(item.usedExcludeMinPrice ?? 0);
            const price = [newPrice, salesPrice, fallbackPrice].find((v) => Number.isFinite(v) && v > 0) ?? null;

            if (price != null) {
              results.push({
                jan: p.jan,
                price,
                productName: item.productName ?? p.name ?? null,
                productCode: item.productCode ?? p.jan,
                salesItemCount: Number(item.usedExcludeSalesItemCount ?? 0) || null,
                source: newPrice > 0 ? "rakuten-product-search-new-only" : "rakuten-product-search-sales-min",
                elapsedMs: Date.now() - started,
                error: null,
              });
              if (i < unique.length - 1) await sleep(350);
              continue;
            }
            productApiMessage = "楽天の商品価格ナビには製品がありますが、価格情報がありません。";
          } else {
            productApiMessage = "楽天の商品価格ナビでJANに一致する製品が見つかりませんでした。";
          }
        } else {
          productApiMessage = r.data?.error_description || r.data?.error || `楽天商品価格ナビ HTTP ${r.response.status}`;
        }
      } catch (error: any) {
        productApiMessage = error?.name === "AbortError" ? "楽天商品価格ナビが9秒でタイムアウトしました。" : error?.message || "楽天商品価格ナビへの接続に失敗しました。";
      }

      // ② Fallback: one JAN search in Ichiba Item Search, sorted by price.
      try {
        const r2 = await searchItemsByJan(appId, accessKey, p.jan);
        if (r2.response.ok) {
          const candidate = chooseJanItem(unwrapItems(r2.data), p);
          if (candidate) {
            results.push({
              jan: p.jan,
              price: candidate.price,
              productName: candidate.item.itemName ?? p.name ?? null,
              itemUrl: candidate.item.itemUrl ?? null,
              shopName: candidate.item.shopName ?? null,
              source: "rakuten-ichiba-item-search-jan",
              elapsedMs: Date.now() - started,
              error: null,
            });
            if (i < unique.length - 1) await sleep(350);
            continue;
          }
          results.push({
            jan: p.jan,
            price: null,
            error: `${productApiMessage || "商品価格ナビで価格なし"} 楽天市場の商品検索でもJAN一致の新品商品を確認できませんでした。`,
            elapsedMs: Date.now() - started,
          });
        } else {
          const itemError = r2.data?.error_description || r2.data?.error || `楽天市場商品検索 HTTP ${r2.response.status}`;
          results.push({
            jan: p.jan,
            price: null,
            error: `${productApiMessage || "商品価格ナビ取得失敗"} / ${itemError}`,
            elapsedMs: Date.now() - started,
          });
        }
      } catch (error: any) {
        results.push({
          jan: p.jan,
          price: null,
          error: `${productApiMessage || "商品価格ナビ取得失敗"} / ${error?.name === "AbortError" ? "楽天市場商品検索が9秒でタイムアウトしました。" : error?.message || "楽天市場商品検索への接続に失敗しました。"}`,
          elapsedMs: Date.now() - started,
        });
      }
    } catch (error: any) {
      results.push({
        jan: p.jan,
        price: null,
        error: error?.name === "AbortError" ? "楽天APIがタイムアウトしました。" : error?.message || "楽天APIへの接続に失敗しました。",
        elapsedMs: Date.now() - started,
      });
    }

    if (i < unique.length - 1) await sleep(350);
  }

  return NextResponse.json({ results });
}
