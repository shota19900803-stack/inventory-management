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

// Rakuten recommends roughly 1 request/sec or less per application.
// This route intentionally performs at most TWO Rakuten API calls per lookup:
// Product Search (JAN) -> Item Search (exact product identity).
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

function buildIdentityQuery(product: any, requestedName: string, requestedModel: string, requestedBrand: string) {
  // Prefer the exact model/product number. It is much safer than a long Japanese title.
  const model = String(requestedModel || product?.productNo || "").trim();
  if (model.length >= 3) return model.slice(0, 80);

  const productName = String(requestedName || product?.productName || "").trim();
  if (productName) {
    const compact = productName.replace(/[\s　]+/g, " ");
    // Keep a useful, bounded identity phrase. Rakuten Item Search treats the
    // keyword as the product search signal; avoid issuing several exploratory calls.
    return compact.slice(0, 90);
  }

  const brand = String(requestedBrand || product?.brandName || product?.makerName || "").trim();
  return brand.slice(0, 60);
}

function chooseLowestNew(items: any[], jan: string, identityQuery: string) {
  const janDigits = normalize(jan);
  const queryTokens = identityQuery.split(/[\s　]+/).map(normalize).filter((v) => v.length >= 2);

  const candidates = items.map((item) => {
    const title = normalize(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""}`);
    const body = normalize(`${title} ${item?.itemCaption ?? ""} ${item?.itemCode ?? ""}`);
    const hasJan = body.includes(janDigits);
    const tokenHits = queryTokens.filter((token) => title.includes(token)).length;
    const score = (hasJan ? 1000 : 0) + tokenHits * 20;
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
      score,
      hasJan,
      tokenHits,
      excluded: isExcludedNewCondition(item),
    };
  }).filter((item) => item.price !== null && !item.excluded);

  if (!candidates.length) return null;

  // If JAN appears in an item result, it is the strongest possible match.
  const exactJan = candidates.filter((item) => item.hasJan);
  if (exactJan.length) {
    exactJan.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    return exactJan[0];
  }

  // Otherwise require at least one identity token. This avoids returning a
  // random cheap item when the JAN is absent from the listing text.
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
    rakuten: { available: false, lowestPrice: null, newListingCount: null, items: [], priceNaviUrl: null, productUrl: null, error: null, source: null, debug: [] },
    amazon: { available: false, lowestPrice: null, items: [], error: null, productUrl: `https://www.amazon.co.jp/s?k=${jan}` },
    price2alert: `https://price2alert.com/search?i=All&kwd=${jan}`,
  };

  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  const origin = rakutenOrigin(request.nextUrl.origin);

  if (appId && accessKey) {
    let product: any = null;
    let productError: string | null = null;

    try {
      product = await rakutenProductSearch(appId, accessKey, jan, origin, result.rakuten.debug);
      if (product) {
        result.rakuten.newListingCount = Number.isFinite(Number(product.usedExcludeSalesItemCount)) ? Number(product.usedExcludeSalesItemCount) : null;
        result.rakuten.priceNaviUrl = product.productUrlPC ?? product.productUrlMobile ?? product.searchUrl ?? null;
        result.rakuten.productUrl = result.rakuten.priceNaviUrl;

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

    // If Product Search has no usable new-only price, make exactly ONE Item Search
    // using the strongest identity available. This replaces the previous loop of
    // many exploratory searches that could trigger Rakuten HTTP 429.
    if (!result.rakuten.available && !productError) {
      try {
        const identityQuery = buildIdentityQuery(product, requestedName, requestedModel, requestedBrand);
        if (identityQuery.length >= 2) {
          const search = await rakutenItemSearch(appId, accessKey, identityQuery, origin, result.rakuten.debug);
          const chosen = chooseLowestNew(search.items, jan, identityQuery);
          if (chosen) {
            result.rakuten.available = true;
            result.rakuten.lowestPrice = chosen.price;
            result.rakuten.items = [chosen];
            result.rakuten.source = `IchibaItemSearch:${identityQuery}`;
            result.rakuten.error = null;
          } else {
            result.rakuten.error = "楽天市場の商品検索は成功しましたが、新品として採用できる価格商品が見つかりませんでした。";
          }
        } else {
          result.rakuten.error = "楽天市場の商品情報は取得できましたが、商品名・型番を特定できませんでした。";
        }
      } catch (error: any) {
        const itemError = error?.name === "AbortError" ? "楽天市場Item APIが8秒以内に応答しませんでした。" : error?.message || "楽天市場Item APIへの接続に失敗しました。";
        result.rakuten.error = itemError;
      }
    } else if (!result.rakuten.available && productError) {
      result.rakuten.error = productError;
    }
  } else {
    result.rakuten.error = "楽天APIの環境変数が未設定です。";
  }

  const amazonConfigured = Boolean(process.env.AMAZON_CREDENTIAL_ID && process.env.AMAZON_CREDENTIAL_SECRET && process.env.AMAZON_REFRESH_TOKEN);
  result.amazon.error = amazonConfigured ? "Amazon Creators API接続準備済み。認証情報を設定後、公式APIのOffer情報を取得します。" : "Amazon Creators APIの認証情報が未設定です。現在はAmazonの商品ページへのリンクを表示できます。";
  return NextResponse.json(result);
}
