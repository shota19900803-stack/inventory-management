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

function compactQueries(productName: string | null, productNo: string | null, brandName: string | null, makerName: string | null, productCaption: string | null) {
  const candidates = [
    productNo,
    productName,
    brandName && productName ? `${brandName} ${productName}` : null,
    makerName && productName ? `${makerName} ${productName}` : null,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  const result: string[] = [];
  const add = (value: string) => {
    const compact = value.split(/\s+/).filter(Boolean).slice(0, 6).join(" ").slice(0, 120);
    if (compact && !result.includes(compact)) result.push(compact);
  };

  for (const candidate of candidates) add(candidate);

  // Long Rakuten product names often contain shop-specific suffixes.
  // Try a short leading chunk as a broader fallback as well.
  if (productName) {
    const tokens = productName.split(/\s+/).filter(Boolean);
    if (tokens.length > 2) add(tokens.slice(0, 4).join(" "));
    if (tokens.length > 4) add(tokens.slice(0, 3).join(" "));
  }

  // Product caption is only a last resort because it can be very long.
  if (productCaption) {
    const captionTokens = productCaption.split(/\s+/).filter(Boolean);
    if (captionTokens.length > 0) add(captionTokens.slice(0, 5).join(" "));
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
  // Broad search gives us more useful matches; used/junk listings are removed below.
  url.searchParams.set("field", "0");
  url.searchParams.set("purchaseType", "0");

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
    makerName: item?.makerName ?? null,
    productCaption: item?.productCaption ?? null,
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
      catchcopy: item?.catchcopy ?? null,
      itemCaption: item?.itemCaption ?? null,
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

    // Product Search is used first to resolve the JAN to a Rakuten product name,
    // model number and Product Price Navi URL. The 2025-08-01 API documentation
    // notes that several old price/count fields may be null after the 2026 change,
    // so Item Search is the price source when those fields are unavailable.
    try {
      product = await rakutenProductLookup(appId, accessKey, jan, origin, result.rakuten.debug);
      result.rakuten.newListingCount = product.newListingCount;
      result.rakuten.priceNaviUrl = product.productUrl;
      result.rakuten.productUrl = product.productUrl;

      if (product.newLowestPrice !== null) {
        result.rakuten.available = true;
        result.rakuten.lowestPrice = product.newLowestPrice;
        result.rakuten.source = "ProductSearch:new-only";
      }
    } catch (error: any) {
      productError = error?.name === "AbortError"
        ? "楽天Product APIが8秒以内に応答しませんでした。"
        : error?.message || "楽天Product APIへの接続に失敗しました。";
    }

    if (!result.rakuten.available) {
      try {
        let chosen: any = null;
        let source = "";
        let lastSearchCount = 0;

        // JAN itself is useful when shops include the JAN in the listing title.
        // Then progressively broaden using the product metadata returned by Product Search.
        const queries = [jan, ...compactQueries(
          product?.productName ?? null,
          product?.productNo ?? null,
          product?.brandName ?? null,
          product?.makerName ?? null,
          product?.productCaption ?? null,
        )];

        const seenQueries = new Set<string>();
        for (const query of queries) {
          if (!query || seenQueries.has(query)) continue;
          seenQueries.add(query);

          const search = await rakutenItemSearch(appId, accessKey, query, origin, result.rakuten.debug);
          lastSearchCount = search.count;
          const candidate = chooseLowestNew(search.items, jan);
          if (candidate) {
            chosen = candidate;
            source = `IchibaItemSearch:${query}`;
            break;
          }
        }

        if (chosen) {
          result.rakuten.available = true;
          result.rakuten.lowestPrice = chosen.price;
          result.rakuten.items = [chosen];
          result.rakuten.source = source;
          result.rakuten.error = null;
          if (result.rakuten.newListingCount === null && lastSearchCount > 0) {
            result.rakuten.newListingCount = lastSearchCount;
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
