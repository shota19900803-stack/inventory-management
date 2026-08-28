import { NextRequest, NextResponse } from "next/server";

type Product = {
  jan: string;
  name: string;
  brand: string;
  model: string;
};

type DebugEntry = {
  api: string;
  status?: number;
  count?: number;
  message?: string;
};

const PRODUCT_API =
  "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";
const ICHIBA_API =
  "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";

const cleanJan = (v: unknown) =>
  String(v ?? "").replace(/\D/g, "").slice(0, 13);

const cleanText = (v: unknown) =>
  String(v ?? "").replace(/[\s　]+/g, " ").trim();

const normalize = (v: unknown) =>
  cleanText(v)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[【】\[\]（）()「」『』<>＜＞]/g, " ")
    .replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const EXCLUDED_WORDS = [
  "中古",
  "中古品",
  "ユーズド",
  "used",
  "ジャンク",
  "開封済み",
  "開封済",
  "開封品",
  "箱なし",
  "箱無",
  "欠品",
  "訳あり",
  "アウトレット",
  "展示品",
  "リファービッシュ",
  "再生品",
  "部品",
  "パーツ",
  "難あり",
  "現状品",
  "ジャンク品",
  "動作未確認",
];

function priceOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function itemsOf(data: any): any[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function isExcluded(item: any) {
  const text = cleanText(
    `${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCaption ?? ""}`
  ).toLowerCase();
  return EXCLUDED_WORDS.some((word) => text.includes(word.toLowerCase()));
}

async function fetchJson(
  url: URL,
  accessKey: string,
  timeoutMs = 10000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Rakuten documents accessKey as either a query parameter or a header.
    // Use the query parameter consistently for both APIs.
    url.searchParams.set("accessKey", accessKey);

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 1000) };
    }

    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * This is the primary path.
 * Rakuten Product Search accepts a JAN as productCode and exposes
 * usedExcludeSalesMinPrice, which is explicitly defined by Rakuten as
 * the minimum purchasable price excluding used items.
 */
async function lookupRakutenProductByJan(
  appId: string,
  accessKey: string,
  jan: string,
  debug: DebugEntry[]
) {
  const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("productCode", jan);

  const { response, data } = await fetchJson(url, accessKey);
  const items = itemsOf(data);

  debug.push({
    api: "ProductSearch(JAN)",
    status: response.status,
    count: Number(data?.count ?? items.length),
  });

  if (!response.ok) {
    debug.push({
      api: "ProductSearch(JAN)",
      message: data?.error_description || data?.error || `HTTP ${response.status}`,
    });
    return null;
  }

  const item = items[0];
  if (!item) return null;

  const newLowest =
    priceOf(item?.usedExcludeSalesMinPrice) ??
    priceOf(item?.usedExcludeSalesItemMinPrice);

  if (newLowest == null) return null;

  return {
    price: newLowest,
    productName: item?.productName ?? null,
    productNo: item?.productNo ?? null,
    brandName: item?.brandName ?? null,
    productUrl: item?.productUrlPC ?? null,
  };
}

function extractModels(text: string) {
  const matches = text.match(/\b[A-Z]{1,10}-[A-Z0-9]{2,}\b/gi) ?? [];
  return Array.from(new Set(matches.map((x) => x.toUpperCase())));
}

function makeFallbackQueries(p: Product, product: any) {
  const name = cleanText(product?.productName || p.name);
  const model = cleanText(p.model || product?.productNo || "");
  const brand = cleanText(p.brand || product?.brandName || "");
  const models = extractModels(`${p.name} ${name}`);
  const code = model || models[0] || "";

  const queries = [
    code,
    code && name ? `${code} ${name.slice(0, 70)}` : "",
    name.slice(0, 90),
    brand && code ? `${brand} ${code}` : "",
  ];

  return Array.from(new Set(queries.map(cleanText).filter((q) => q.length >= 2)))
    .slice(0, 4);
}

async function searchIchiba(
  appId: string,
  accessKey: string,
  keyword: string,
  debug: DebugEntry[]
) {
  const url = new URL(ICHIBA_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "0");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set(
    "NGKeyword",
    "中古 ジャンク 開封品 開封済 箱なし 欠品 部品 パーツ 訳あり アウトレット 展示品 リファービッシュ 修理品"
  );
  url.searchParams.set(
    "elements",
    "itemName,catchcopy,itemPrice,itemPriceMin3,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode"
  );

  const { response, data } = await fetchJson(url, accessKey);
  const items = itemsOf(data);

  debug.push({
    api: `IchibaItemSearch:${keyword.slice(0, 40)}`,
    status: response.status,
    count: Number(data?.count ?? items.length),
  });

  if (!response.ok) {
    debug.push({
      api: "IchibaItemSearch",
      message: data?.error_description || data?.error || `HTTP ${response.status}`,
    });
    return [];
  }

  return items;
}

function chooseFallbackItem(items: any[], p: Product, product: any) {
  const jan = cleanJan(p.jan);
  const model = normalize(
    p.model || product?.productNo || extractModels(`${p.name} ${product?.productName ?? ""}`)[0] || ""
  ).replace(/\s+/g, "");
  const productName = normalize(product?.productName || p.name).replace(/\s+/g, "");

  const candidates = items
    .map((item: any) => {
      if (!item || isExcluded(item)) return null;

      const price =
        priceOf(item?.itemPriceMin3) ?? priceOf(item?.itemPrice);
      if (price == null) return null;

      const text = cleanText(
        `${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCaption ?? ""} ${item?.itemCode ?? ""}`
      );
      const normalizedText = normalize(text).replace(/\s+/g, "");
      const digits = text.replace(/\D/g, "");

      const hasJan = jan.length === 13 && digits.includes(jan);
      const hasModel = !!model && normalizedText.includes(model);
      const hasName = !!productName && normalizedText.includes(productName);

      // Fallback must have a meaningful identity match. Never take an
      // unrelated cheap Rakuten item merely because the API returned it.
      if (!hasJan && !hasModel && !hasName) return null;

      let score = 0;
      if (hasJan) score += 1000000;
      if (hasModel) score += 100000;
      if (hasName) score += 10000;

      return { item, price, score };
    })
    .filter(Boolean) as Array<{ item: any; price: number; score: number }>;

  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  return candidates[0] ?? null;
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (!appId || !accessKey) {
    return NextResponse.json(
      {
        error:
          "楽天APIの環境変数が未設定です。Vercelの RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY を確認してください。",
        results: [],
      },
      { status: 503 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSONが不正です。", results: [] },
      { status: 400 }
    );
  }

  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw.map((p: any) => ({
    jan: cleanJan(p?.jan),
    name: cleanText(p?.name),
    brand: cleanText(p?.brand),
    model: cleanText(p?.model),
  }));

  const unique = Array.from(
    new Map(
      products
        .filter((p) => p.jan.length === 13)
        .map((p) => [p.jan, p])
    ).values()
  );

  if (!unique.length) {
    return NextResponse.json(
      { error: "有効な13桁JANの商品がありません。", results: [] },
      { status: 400 }
    );
  }

  if (unique.length > 5) {
    return NextResponse.json(
      { error: "1回の取得は最大5商品です。", results: [] },
      { status: 400 }
    );
  }

  const results: any[] = [];

  for (const p of unique) {
    const started = Date.now();
    const debug: DebugEntry[] = [];

    try {
      // PRIMARY: one JAN lookup. This directly returns Rakuten's aggregate
      // lowest purchasable price excluding used items.
      const product = await lookupRakutenProductByJan(
        appId,
        accessKey,
        p.jan,
        debug
      );

      if (product?.price != null) {
        results.push({
          jan: p.jan,
          price: product.price,
          productName: product.productName || p.name,
          itemUrl: product.productUrl,
          shopName: null,
          source: "rakuten-product-search-usedExcludeSalesMinPrice",
          matchedBy: "JAN完全一致",
          elapsedMs: Date.now() - started,
          debug,
          error: null,
        });
        continue;
      }

      // FALLBACK: if Rakuten has no aggregate price for this JAN, search the
      // actual marketplace using Rakuten's canonical product name/model.
      let canonical: any = null;
      try {
        const url = new URL(PRODUCT_API);
        url.searchParams.set("format", "json");
        url.searchParams.set("formatVersion", "2");
        url.searchParams.set("applicationId", appId);
        url.searchParams.set("productCode", p.jan);
        const r = await fetchJson(url, accessKey);
        const list = itemsOf(r.data);
        canonical = list[0] ?? null;
      } catch {
        // The primary lookup already recorded its status. Continue with local data.
      }

      const queries = makeFallbackQueries(p, canonical);
      for (const query of queries) {
        const items = await searchIchiba(appId, accessKey, query, debug);
        const chosen = chooseFallbackItem(items, p, canonical);
        if (!chosen) continue;

        results.push({
          jan: p.jan,
          price: chosen.price,
          productName: chosen.item.itemName ?? p.name,
          itemUrl: chosen.item.itemUrl ?? null,
          shopName: chosen.item.shopName ?? null,
          source: "rakuten-ichiba-item-search-fallback",
          matchedBy: query,
          elapsedMs: Date.now() - started,
          debug,
          error: null,
        });
        canonical = null;
        break;
      }

      if (results[results.length - 1]?.jan !== p.jan) {
        results.push({
          jan: p.jan,
          price: null,
          elapsedMs: Date.now() - started,
          debug,
          error:
            "楽天の商品価格ナビに新品最安値がなく、市場検索でも商品を特定できませんでした。",
        });
      }
    } catch (error: any) {
      results.push({
        jan: p.jan,
        price: null,
        elapsedMs: Date.now() - started,
        debug,
        error:
          error?.name === "AbortError"
            ? "楽天APIが10秒以内に応答しませんでした。"
            : error?.message || "楽天APIへの接続に失敗しました。",
      });
    }
  }

  return NextResponse.json({ results });
}
