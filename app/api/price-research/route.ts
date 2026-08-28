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
  const text = normalize(
    `${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCaption ?? ""}`
  );

  const excluded = [
    "中古",
    "ジャンク",
    "開封済",
    "開封品",
    "箱なし",
    "欠品",
    "部品",
    "パーツ",
    "訳あり",
    "アウトレット",
    "展示品",
    "リファービッシュ",
    "修理品",
    "used",
    "junk",
    "refurbished",
  ];

  return excluded.some((word) => text.includes(normalize(word)));
}

function compactQueries(productName: string | null, productNo: string | null, brandName: string | null) {
  const candidates = [productNo, productName, brandName && productName ? `${brandName} ${productName}` : null]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  const result: string[] = [];
  for (const candidate of candidates) {
    // Very long product names become overly restrictive AND searches on Rakuten.
    // Prefer model/series tokens and keep the fallback query short.
    const tokens = candidate.split(/\s+/).filter(Boolean);
    const compact = tokens.slice(0, 6).join(" ").slice(0, 120);
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
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

async function rakutenItemSearch(
  applicationId: string,
  accessKey: string,
  keyword: string,
  debug: any[]
) {
  const url = new URL(
    "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701"
  );
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
  debug.push({
    api: "IchibaItemSearch",
    keyword,
    status: response.status,
    count: Number(data?.count ?? items.length),
  });

  if (!response.ok) {
    throw new Error(
      data?.error_description || data?.error || `楽天市場API HTTP ${response.status}`
    );
  }

  return items;
}

async function rakutenProductLookup(
  applicationId: string,
  accessKey: string,
  jan: string,
  debug: any[]
) {
  const url = new URL(
    "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801"
  );
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", applicationId);
  url.searchParams.set("accessKey", accessKey);
  // productCode is JAN. Do not send hits/page/sort/etc. with it.
  url.searchParams.set("productCode", jan);

  const { response, data } = await fetchJson(url, accessKey);
  const items = Array.isArray(data?.items) ? data.items : [];
  debug.push({
    api: "ProductSearch",
    keyword: jan,
    status: response.status,
    count: Number(data?.count ?? items.length),
  });

  if (!response.ok) {
    throw new Error(
      data?.error_description || data?.error || `楽天Product API HTTP ${response.status}`
    );
  }

  const item = items[0] ?? null;
  return {
    productName: item?.productName ?? null,
    productNo: item?.productNo ?? null,
    brandName: item?.brandName ?? null,
    productUrl: item?.productUrlPC ?? null,
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
  const exactJan = candidates.filter((item) => {
    const haystack = normalize(`${item.name ?? ""} ${item.itemCode ?? ""} ${item.caption ?? ""}`);
    return haystack.includes(janDigits);
  });

  const pool = exactJan.length > 0 ? exactJan : candidates;
  pool.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return pool[0] ?? null;
}

export async function GET(request: NextRequest) {
  const jan = cleanJan(request.nextUrl.searchParams.get("jan") || "");

  if (jan.length !== 13) {
    return NextResponse.json(
      { error: "13桁のJANコードを指定してください。" },
      { status: 400 }
    );
  }

  const result: any = {
    jan,
    rakuten: {
      available: false,
      lowestPrice: null,
      items: [],
      error: null,
      source: null,
      debug: [],
    },
    amazon: { available: false, lowestPrice: null, items: [], error: null },
    price2alert: `https://price2alert.com/search?i=All&kwd=${jan}`,
  };

  const rakutenAppId = process.env.RAKUTEN_APPLICATION_ID;
  const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (rakutenAppId && rakutenAccessKey) {
    try {
      // 1) First ask the current Rakuten Ichiba Item Search API directly by JAN.
      // This API exposes actual selling item prices and can sort by price ascending.
      let items = await rakutenItemSearch(
        rakutenAppId,
        rakutenAccessKey,
        jan,
        result.rakuten.debug
      );
      let chosen = chooseLowestNew(items, jan);
      let source = "IchibaItemSearch:JAN";

      // 2) If JAN is not indexed as a keyword, resolve the JAN to a Rakuten
      // Product and search the actual marketplace by a compact product identifier.
      if (!chosen) {
        const product = await rakutenProductLookup(
          rakutenAppId,
          rakutenAccessKey,
          jan,
          result.rakuten.debug
        );
        const queries = compactQueries(
          product.productName,
          product.productNo,
          product.brandName
        );

        for (const query of queries) {
          items = await rakutenItemSearch(
            rakutenAppId,
            rakutenAccessKey,
            query,
            result.rakuten.debug
          );
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
      } else {
        result.rakuten.error =
          "楽天市場の商品検索は成功しましたが、新品として採用できる価格商品が見つかりませんでした。";
      }
    } catch (error: any) {
      result.rakuten.error = error?.name === "AbortError"
        ? "楽天APIが8秒以内に応答しませんでした。"
        : error?.message || "楽天APIへの接続に失敗しました。";
    }
  } else {
    result.rakuten.error = "楽天APIの環境変数が未設定です。";
  }

  const amazonConfigured = Boolean(
    process.env.AMAZON_CREDENTIAL_ID &&
      process.env.AMAZON_CREDENTIAL_SECRET &&
      process.env.AMAZON_REFRESH_TOKEN
  );

  if (!amazonConfigured) {
    result.amazon.error =
      "Amazon Creators APIの認証情報が未設定です。現在はAmazonの商品ページへのリンクを表示できます。";
  } else {
    result.amazon.error =
      "Amazon Creators API接続準備済み。認証情報を設定後、公式APIのOffer情報を取得します。";
  }

  result.amazon.productUrl = `https://www.amazon.co.jp/s?k=${jan}`;

  return NextResponse.json(result);
}
