import { NextRequest, NextResponse } from "next/server";

function cleanJan(value: string) { return value.replace(/\D/g, "").slice(0, 13); }
function asPrice(value: unknown) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
function normalize(value: unknown) { return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s　\-‐‑–—_/・:：,.，。()（）［］【】「」『』]/g, ""); }

function isExcludedNewCondition(item: any) {
  const titleText = normalize(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""}`);
  const captionText = normalize(item?.itemCaption ?? "");
  const titleExcluded = ["中古", "中古品", "ジャンク", "訳あり", "アウトレット", "展示品", "リファービッシュ", "修理品", "整備済", "used", "junk", "refurbished"];
  const conditionPhrases = ["開封済", "開封品", "箱なし", "欠品あり", "欠品有り", "部品取り"];
  return titleExcluded.some((word) => titleText.includes(normalize(word))) || conditionPhrases.some((word) => captionText.includes(normalize(word)) || titleText.includes(normalize(word)));
}

function rakutenOrigin(requestOrigin: string) {
  const configured = process.env.RAKUTEN_API_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) return productionHost.startsWith("http") ? productionHost.replace(/\/$/, "") : `https://${productionHost}`;
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicAppUrl) return publicAppUrl.replace(/\/$/, "");
  return requestOrigin.replace(/\/$/, "");
}

const RAKUTEN_MIN_INTERVAL_MS = 1200;
let lastRakutenRequestAt = 0;
async function waitForRakutenSlot() {
  const waitMs = Math.max(0, RAKUTEN_MIN_INTERVAL_MS - (Date.now() - lastRakutenRequestAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRakutenRequestAt = Date.now();
}

async function fetchJson(url: URL, accessKey: string, origin: string, timeoutMs = 8000) {
  await waitForRakutenSlot();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accessKey, Origin: origin, Referer: `${origin}/`, "User-Agent": "inventory-management-rakuten-api/1.0" },
    });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
    return { response, data };
  } finally { clearTimeout(timer); }
}

function apiError(data: any, status: number) {
  return data?.errors?.errorMessage ?? data?.error_description ?? data?.error ?? `楽天市場API HTTP ${status}`;
}

async function rakutenProductSearch(applicationId: string, accessKey: string, jan: string, origin: string, debug: any[]) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", applicationId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);
  const { response, data } = await fetchJson(url, accessKey, origin);
  const items = Array.isArray(data?.items) ? data.items : [];
  debug.push({ api: "ProductSearch", query: jan, status: response.status, count: Number(data?.count ?? items.length), error: response.ok ? null : apiError(data, response.status) });
  if (!response.ok) throw new Error(apiError(data, response.status));
  return items[0] ?? null;
}

async function rakutenItemSearch(applicationId: string, accessKey: string, keyword: string, origin: string, debug: any[]) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", applicationId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "0");
  url.searchParams.set("purchaseType", "0");
  const { response, data } = await fetchJson(url, accessKey, origin);
  const items = Array.isArray(data?.items) ? data.items : [];
  debug.push({ api: "IchibaItemSearch", keyword, status: response.status, count: Number(data?.count ?? items.length), error: response.ok ? null : apiError(data, response.status) });
  if (!response.ok) throw new Error(apiError(data, response.status));
  return { items, count: Number(data?.count ?? items.length) };
}

function buildIdentityQuery(product: any, requestedName: string, requestedModel: string, requestedBrand: string, jan: string) {
  const model = String(requestedModel || product?.productNo || "").trim();
  if (model.length >= 3) return model.slice(0, 80);
  const productName = String(requestedName || product?.productName || "").trim();
  if (productName) return productName.replace(/[\s　]+/g, " ").slice(0, 90);
  const brand = String(requestedBrand || product?.brandName || product?.makerName || "").trim();
  if (brand.length >= 2) return brand.slice(0, 60);
  const caption = String(product?.productCaption || "").replace(/[\r\n]+/g, " ").replace(/[\s　]+/g, " ").trim();
  if (caption) {
    const firstPhrase = caption.split(/[。.!！?？]/)[0].trim();
    if (firstPhrase.length >= 3) return firstPhrase.slice(0, 90);
  }
  return jan;
}

function toItemView(item: any, jan: string) {
  const titleText = `${item?.itemName ?? ""} ${item?.catchcopy ?? ""}`;
  const captionText = String(item?.itemCaption ?? "");
  const normalized = normalize(`${titleText} ${captionText}`);
  const usedHint = ["中古", "中古品", "ジャンク", "訳あり", "アウトレット", "展示品", "リファービッシュ", "修理品", "整備済", "used", "junk", "refurbished", "開封済", "開封品", "箱なし", "欠品あり", "欠品有り", "部品取り"].some((word) => normalized.includes(normalize(word)));
  return {
    name: item?.itemName ?? null,
    price: asPrice(item?.itemPrice),
    shopName: item?.shopName ?? null,
    itemUrl: item?.itemUrl ?? null,
    shopUrl: item?.shopUrl ?? null,
    itemCode: item?.itemCode ?? null,
    catchcopy: item?.catchcopy ?? null,
    itemCaption: item?.itemCaption ?? null,
    caption: item?.catchcopy ?? item?.itemCaption ?? null,
    conditionHint: usedHint ? "中古・状態注意候補" : "新品候補（API上の正式な状態保証ではありません）",
    janMatched: normalize(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCaption ?? ""} ${item?.itemCode ?? ""}`).includes(normalize(jan)),
  };
}

function chooseLowestNew(items: any[], jan: string, identityQuery: string) {
  const janDigits = normalize(jan);
  const exactJanSearch = normalize(identityQuery) === janDigits;
  const queryTokens = identityQuery.split(/[\s　]+/).map(normalize).filter((v) => v.length >= 2);
  const candidates = items.map((item) => {
    const title = normalize(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""}`);
    const body = normalize(`${title} ${item?.itemCaption ?? ""} ${item?.itemCode ?? ""}`);
    const hasJan = body.includes(janDigits);
    const tokenHits = queryTokens.filter((token) => title.includes(token)).length;
    const score = (hasJan ? 1000 : 0) + tokenHits * 20;
    return { ...toItemView(item, jan), score, hasJan, tokenHits, excluded: isExcludedNewCondition(item) };
  }).filter((item) => item.price !== null && !item.excluded);
  if (!candidates.length) return null;
  if (exactJanSearch) {
    candidates.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    return candidates[0];
  }
  const exactJan = candidates.filter((item) => item.hasJan);
  if (exactJan.length) {
    exactJan.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    return exactJan[0];
  }
  const relevant = candidates.filter((item) => item.tokenHits > 0);
  if (!relevant.length) return null;
  relevant.sort((a, b) => b.score - a.score || (a.price ?? Infinity) - (b.price ?? Infinity));
  return relevant[0];
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const jan = cleanJan(params.get("jan") || "");
  const requestedName = String(params.get("name") || "").trim();
  const requestedModel = String(params.get("model") || "").trim();
  const requestedBrand = String(params.get("brand") || "").trim();

  if (jan.length !== 13) return NextResponse.json({ error: "13桁のJANコードを指定してください。" }, { status: 400 });

  const result: any = {
    jan,
    rakuten: {
      available: false,
      lowestPrice: null,
      newListingCount: null,
      items: [],
      priceNaviUrl: null,
      productUrl: null,
      error: null,
      source: null,
      debug: [],
      // Diagnostic snapshot: these are the exact Product Search fields Rakuten exposes.
      allListingCount: null,
      allAvailableCount: null,
      allMinPrice: null,
      newOnlyListingCount: null,
      newOnlyAvailableCount: null,
      newOnlyMinPrice: null,
      usedExcludedMinPrice: null,
      identityQuery: null,
    },
    amazon: { available: false, lowestPrice: null, items: [], error: null, productUrl: `https://www.amazon.co.jp/s?k=${jan}` },
    price2alert: `https://price2alert.com/search?i=All&kwd=${jan}`,
  };

  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  const origin = rakutenOrigin(request.nextUrl.origin);

  if (appId && accessKey) {
    let product: any = null;
    let productError: string | null = null;
    let identityQuery = jan;

    try {
      product = await rakutenProductSearch(appId, accessKey, jan, origin, result.rakuten.debug);
      if (product) {
        result.rakuten.allListingCount = asPrice(product.itemCount);
        result.rakuten.allAvailableCount = asPrice(product.salesItemCount);
        result.rakuten.allMinPrice = asPrice(product.minPrice);
        result.rakuten.newOnlyListingCount = asPrice(product.usedExcludeCount);
        result.rakuten.newOnlyAvailableCount = asPrice(product.usedExcludeSalesItemCount);
        result.rakuten.newOnlyMinPrice = asPrice(product.usedExcludeMinPrice);
        result.rakuten.usedExcludedMinPrice = asPrice(product.usedExcludeSalesMinPrice);
        result.rakuten.newListingCount = result.rakuten.newOnlyAvailableCount;
        result.rakuten.priceNaviUrl = product.productUrlPC ?? product.productUrlMobile ?? product.searchUrl ?? null;
        result.rakuten.productUrl = result.rakuten.priceNaviUrl;
        identityQuery = buildIdentityQuery(product, requestedName, requestedModel, requestedBrand, jan);
        result.rakuten.identityQuery = identityQuery;
        // For this diagnostic pass, do not trust the old heuristic as the primary
        // source. If Rakuten itself exposes a new-only minimum, use it directly.
        const newPrice = asPrice(product.usedExcludeSalesMinPrice);
        if (newPrice !== null) {
          result.rakuten.available = true;
          result.rakuten.lowestPrice = newPrice;
          result.rakuten.source = "ProductSearch:new-only";
        }
      }
    } catch (error: any) {
      productError = error?.name === "AbortError" ? "楽天Product APIが8秒以内に応答しませんでした。" : error?.message || "楽天Product APIへの接続に失敗しました。";
    }

    // Always make the second call during this diagnostic phase. We want to see
    // whether Item Search still exposes a mixed new/used list after the Rakuten
    // API change, even when Product Search already returned a new-only price.
    if (!productError) {
      try {
        const search = await rakutenItemSearch(appId, accessKey, identityQuery, origin, result.rakuten.debug);
        const views = search.items.map((item: any) => toItemView(item, jan)).filter((item: any) => item.price !== null).slice(0, 10);
        result.rakuten.items = views;

        if (!result.rakuten.available) {
          const chosen = chooseLowestNew(search.items, jan, identityQuery);
          if (chosen) {
            result.rakuten.available = true;
            result.rakuten.lowestPrice = chosen.price;
            result.rakuten.source = `IchibaItemSearch:${identityQuery}`;
          }
        }

        if (!result.rakuten.available) {
          const allMin = result.rakuten.allMinPrice != null ? `全体最安 ${result.rakuten.allMinPrice.toLocaleString()}円` : "全体最安 取得不可";
          const newMin = result.rakuten.usedExcludedMinPrice != null ? `新品除外最安 ${result.rakuten.usedExcludedMinPrice.toLocaleString()}円` : "新品除外最安 取得不可";
          result.rakuten.error = `診断中：${allMin} / ${newMin} / Item Search ${views.length}件。新品・中古の状態判定は別途確認します。`;
        }
      } catch (error: any) {
        const itemError = error?.name === "AbortError" ? "楽天市場Item APIが8秒以内に応答しませんでした。" : error?.message || "楽天市場Item APIへの接続に失敗しました。";
        result.rakuten.error = result.rakuten.available ? null : itemError;
      }
    } else if (!result.rakuten.available) {
      result.rakuten.error = productError;
    }
  } else {
    result.rakuten.error = "楽天APIの環境変数が未設定です。";
  }

  const amazonConfigured = Boolean(process.env.AMAZON_CREDENTIAL_ID && process.env.AMAZON_CREDENTIAL_SECRET && process.env.AMAZON_REFRESH_TOKEN);
  result.amazon.error = amazonConfigured ? "Amazon Creators API接続準備済み。認証情報を設定後、公式APIのOffer情報を取得します。" : "Amazon Creators APIの認証情報が未設定です。現在はAmazonの商品ページへのリンクを表示できます。";
  return NextResponse.json(result);
}
