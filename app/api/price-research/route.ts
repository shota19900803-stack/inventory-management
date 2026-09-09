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

async function fetchJson(url: URL, accessKey: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accessKey },
    });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

async function rakutenItemSearch(applicationId: string, accessKey: string, keyword: string, debug: any[]) {
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
  const { response, data } = await fetchJson(url, accessKey);
  const items = Array.isArray(data?.items) ? data.items : [];
  debug.push({ api: "IchibaItemSearch", keyword, status: response.status, count: Number(data?.count ?? items.length) });
  if (!response.ok) throw new Error(data?.error_description || data?.error || `楽天市場API HTTP ${response.status}`);
  return { items, count: Number(data?.count ?? items.length) };
}

async function rakutenProductLookup(applicationId: string, accessKey: string, jan: string, debug: any[]) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", applicationId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);
  const { response, data } = await fetchJson(url, accessKey);
  const items = Array.isArray(data?.items) ? data.items : [];
  debug.push({ api: "ProductSearch", keyword: jan, status: response.status, count: Number(data?.count ?? items.length) });
  if (!response.ok) throw new Error(data?.error_description || data?.error || `楽天Product API HTTP ${response.status}`);
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

  if (appId && accessKey) {
    let product: any = null;
    let productError: string | null = null;

    // Product Search is the best source for the true new-only minimum and listing count.
    // However, a Product API permission/403 must NOT block the normal Item Search fallback.
    try {
      product = await rakutenProductLookup(appId, accessKey, jan, result.rakuten.debug);
      result.rakuten.newListingCount = product.newListingCount;
      result.rakuten.priceNaviUrl = product.productUrl;
      result.rakuten.productUrl = product.productUrl;
    } catch (error: any) {
      productError = error?.name === "AbortError"
        ? "楽天Product APIが8秒以内に応答しませんでした。"
        : error?.message || "楽天Product APIへの接続に失敗しました。";
      // Continue to Ichiba Item Search. This is intentionally a soft failure.
    }

    try {
      let search = await rakutenItemSearch(appId, accessKey, jan, result.rakuten.debug);
      let items = search.items;
      let chosen = chooseLowestNew(items, jan);
      let source = "IchibaItemSearch:JAN";

      // If JAN search returns no usable item, use product metadata when Product Search worked.
      if (!chosen && product) {
        const queries = compactQueries(product.productName, product.productNo, product.brandName);
        for (const query of queries) {
          search = await rakutenItemSearch(appId, accessKey, query, result.rakuten.debug);
          items = search.items;
          chosen = chooseLowestNew(items, jan);
          if (chosen) {
            source = `IchibaItemSearch:${query}`;
            break;
          }
        }
      }

      if (chosen || product?.newLowestPrice !== null) {
        result.rakuten.available = true;
        result.rakuten.lowestPrice = product?.newLowestPrice ?? chosen?.price ?? null;
        result.rakuten.items = chosen ? [chosen] : [];
        result.rakuten.source = product?.newLowestPrice !== null
          ? "ProductSearch:new-only"
          : source;

        // Product API may be blocked while Item Search still works. In that case,
        // keep the usable marketplace price instead of showing a misleading error.
        if (productError) {
          result.rakuten.error = null;
        }

        // Item Search returns the total matching count. It is only used as a fallback
        // listing count when Product Search could not provide its new-only count.
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
      result.rakuten.error = productError
        ? `${productError}／${itemError}`
        : itemError;
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
