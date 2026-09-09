import { NextRequest, NextResponse } from "next/server";

function cleanJan(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

function asPrice(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　\-‐‑–—_/・:：,.，。()（）［］【】]/g, "");
}

function isExcludedNewCondition(item: any) {
  const text = normalize(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCaption ?? ""}`);
  const excluded = [
    "中古", "ジャンク", "開封済", "開封品", "箱なし", "欠品", "部品", "パーツ",
    "訳あり", "アウトレット", "展示品", "リファービッシュ", "修理品", "used", "junk", "refurbished",
  ];
  return excluded.some((word) => text.includes(normalize(word)));
}

function compactQueries(productName: string | null, productNo: string | null, brandName: string | null) {
  const candidates = [productNo, productName, brandName && productName ? `${brandName} ${productName}` : null]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  const result: string[] = [];
  for (const candidate of candidates) {
    const compact = candidate.split(/\s+/).filter(Boolean).slice(0, 6).join(" ").slice(0, 120);
    if (compact && !result.includes(compact)) result.push(compact);
  }
  return result;
}

function rakutenOrigin(requestOrigin: string) {
  const configured = process.env.RAKUTEN_API_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    return productionHost.startsWith("http") ? productionHost.replace(/\/$/, "") : `https://${productionHost}`;
  }

  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicAppUrl) return publicAppUrl.replace(/\/$/, "");

  return requestOrigin.replace(/\/$/, "");
}

// Rakuten's documented per-application limit is 1 request/second.
// Keep a safety gap between API calls. Most successful JAN lookups use only
// Product Search, so a normal lookup now consumes just one Rakuten request.
const RAKUTEN_MIN_INTERVAL_MS = 1200;
let lastRakutenRequestAt = 0;

async function waitForRakutenSlot() {
  const now = Date.now();
  const waitMs = Math.max(0, RAKUTEN_MIN_INTERVAL_MS - (now - lastRakutenRequestAt));
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
      headers: {
        accessKey,
        Origin: origin,
        Referer: `${origin}/`,
        "User-Agent": "inventory-management-rakuten-api/1.0",
      },
    });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
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
  url.searchParams.set("field", "1");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set("NGKeyword", "中古 ジャンク 開封品 開封済 箱なし 欠品 部品 パーツ 訳あり アウトレット 展示品 リファービッシュ 修理品");
  const { response, data } = await fetchJson(url, accessKey, origin);
  const items = Array.isArray(data?.items) ? data.items : [];
  debug.push({ api: "IchibaItemSearch", keyword, status: response.status, count: Number(data?.count ?? items.length), error: data?.errors?.errorMessage ?? data?.error_description ?? data?.error ?? null });
  if (!response.ok) throw new Error(data?.errors?.errorMessage || data?.error_description || data?.error || `楽天市場API HTTP ${response.status}`);
  return { items, count: Number(data?.count ?? items.length) };
}

async function rakutenProductLookup(applicationId: string, accessKey: string, jan: string, origin: string, debug: any[]) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", applicationId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);
  const { response, data } = await fetchJson(url, accessKey, origin);
  const items = Array.isArray(data?.items) ? data.items : [];
  debug.push({ api: "ProductSearch", keyword: jan, status: response.status, count: Number(data?.count ?? items.length), error: data?.errors?.errorMessage ?? data?.error_description ?? data?.error ?? null });
  if (!response.ok) throw new Error(data?.errors?.errorMessage || data?.error_description || data?.error || `楽天Product API HTTP ${response.status}`);
  const item = items[0] ?? null;
  return {
    productName: item?.productName ?? null,
    productNo: item?.productNo ?? null,
    brandName: item?.brandName ?? null,
    productUrl: item?.productUrlPC ?? item?.productUrlMobile ?? item?.searchUrl ?? null,
    newListingCount: Number.isFinite(Number(item?.usedExcludeSalesItemCount)) ? Number(item.usedExcludeSalesItemCount) : null,
    newLowestPrice: asPrice(item?.usedExcludeSalesMinPrice),
  };
}

function chooseLowestNew(items: any[], jan: string) {
  const candidates = items
    .map((item) => ({
      name: item?.itemName ?? null,
      price: asPrice(item?.itemPrice),
      shopName: item?.shopName ?? null,
      itemUrl: item?.itemUrl ?? null,
      shopUrl: item?.shopUrl ?? null,
      itemCode: item?.itemCode ?? null,
      caption: item?.catchcopy ?? item?.itemCaption ?? null,
    }))
    .filter((item) => item.price !== null)
    .filter((item) => !isExcludedNewCondition(item));
  const janDigits = normalize(jan);
  const exactJan = candidates.filter((item) =>
    normalize(`${item.name ?? ""} ${item.itemCode ?? ""} ${item.caption ?? ""}`).includes(janDigits),
  );
  const pool = exactJan.length > 0 ? exactJan : candidates;
  pool.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return pool[0] ?? null;
}

export async function GET(request: NextRequest) {
  const jan = cleanJan(request.nextUrl.searchParams.get("jan") || "");
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
    },
    amazon: {
      available: false,
      lowestPrice: null,
      items: [],
      error: null,
      productUrl: `https://www.amazon.co.jp/s?k=${jan}`,
    },
    price2alert: `https://price2alert.com/search?i=All&kwd=${jan}`,
  };

  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  const origin = rakutenOrigin(request.nextUrl.origin);

  if (appId && accessKey) {
    let product: any = null;
    let productError: string | null = null;

    // Product Search is the preferred path because it can return the true
    // new-only minimum, new listing count, and Product Price Navi URL in one request.
    try {
      product = await rakutenProductLookup(appId, accessKey, jan, origin, result.rakuten.debug);
      result.rakuten.newListingCount = product.newListingCount;
      result.rakuten.priceNaviUrl = product.productUrl;
      result.rakuten.productUrl = product.productUrl;

      // If Product Search already has the new-only price, stop here.
      // This avoids an unnecessary second request and keeps us safely under
      // Rakuten's per-application request limit.
      if (product.newLowestPrice !== null) {
        result.rakuten.available = true;
        result.rakuten.lowestPrice = product.newLowestPrice;
        result.rakuten.source = "ProductSearch:new-only";
        result.rakuten.error = null;
      }
    } catch (error: any) {
      productError = error?.name === "AbortError"
        ? "楽天Product APIが8秒以内に応答しませんでした。"
        : error?.message || "楽天Product APIへの接続に失敗しました。";
    }

    // Only fall back to Item Search when Product Search could not supply a
    // usable new-only price. This is deliberately a fallback, not the normal path.
    if (!result.rakuten.available) {
      try {
        let search = await rakutenItemSearch(appId, accessKey, jan, origin, result.rakuten.debug);
        let items = search.items;
        let chosen = chooseLowestNew(items, jan);
        let source = "IchibaItemSearch:JAN";

        if (!chosen && product) {
          const queries = compactQueries(product.productName, product.productNo, product.brandName);
          for (const query of queries) {
            search = await rakutenItemSearch(appId, accessKey, query, origin, result.rakuten.debug);
            items = search.items;
            chosen = chooseLowestNew(items, jan);
            if (chosen) {
              source = `IchibaItemSearch:${query}`;
              break;
            }
          }
        }

        if (chosen) {
          result.rakuten.available = true;
          result.rakuten.lowestPrice = chosen.price;
          result.rakuten.items = [chosen];
          result.rakuten.source = source;
          result.rakuten.error = null;
          if (result.rakuten.newListingCount === null && source === "IchibaItemSearch:JAN" && search.count > 0) {
            result.rakuten.newListingCount = search.count;
          }
        } else {
          result.rakuten.error = productError
            ? `${productError}／楽天市場の商品検索でも新品価格を確認できませんでした。`
            : "楽天市場の商品検索は成功しましたが、新品として採用できる価格商品が見つかりませんでした。";
        }
      } catch (error: any) {
        const itemError = error?.name === "AbortError"
          ? "楽天市場Item APIが8秒以内に応答しませんでした。"
          : error?.message || "楽天市場Item APIへの接続に失敗しました。";
        result.rakuten.error = productError ? `${productError}／${itemError}` : itemError;
      }
    }
  } else {
    result.rakuten.error = "楽天APIの環境変数が未設定です。";
  }

  const amazonConfigured = Boolean(
    process.env.AMAZON_CREDENTIAL_ID &&
    process.env.AMAZON_CREDENTIAL_SECRET &&
    process.env.AMAZON_REFRESH_TOKEN,
  );
  result.amazon.error = amazonConfigured
    ? "Amazon Creators API接続準備済み。認証情報を設定後、公式APIのOffer情報を取得します。"
    : "Amazon Creators APIの認証情報が未設定です。現在はAmazonの商品ページへのリンクを表示できます。";

  return NextResponse.json(result);
}
