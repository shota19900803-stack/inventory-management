import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type ProductHit = {
  productId?: string | number;
  productCode?: string;
  productName?: string;
  productNo?: string;
  brandName?: string;
  makerName?: string;
  productUrlPC?: string;
  productUrlMobile?: string;
  searchUrl?: string;
};
type ItemHit = {
  itemName?: string;
  itemCode?: string;
  itemPrice?: number | string | null;
  itemPriceMin3?: number | string | null;
  itemUrl?: string;
  shopName?: string;
  shopCode?: string;
};
type DebugEntry = {
  api: string;
  query?: string;
  status?: number;
  count?: number;
  returned?: number;
  message?: string;
  elapsedMs?: number;
  responseKeys?: string[];
  sample?: Array<{
    name: string;
    price: number | null;
    url: string | null;
    shop: string | null;
  }>;
};

const PRODUCT_API = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";
const ITEM_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const priceOf = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function compactResponseKeys(data: any) {
  if (!data || typeof data !== "object") return [];
  return Object.keys(data).slice(0, 40);
}

function productHitsOf(data: any): ProductHit[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items
    .map((x: any) => x?.product ?? x?.item ?? x)
    .filter((x: any) => x && typeof x === "object");
}

function itemHitsOf(data: any): ItemHit[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items
    .map((x: any) => x?.item ?? x)
    .filter((x: any) => x && typeof x === "object");
}

const EXCLUDED_WORDS = [
  "中古",
  "ユーズド",
  "used",
  "ジャンク",
  "訳あり",
  "訳有り",
  "展示品",
  "開封済み",
  "開封品",
  "箱なし",
  "箱無し",
  "本体のみ",
  "パーツ",
  "部品",
];

function looksUsedOrDamaged(name: string) {
  const lower = name.toLowerCase();
  return EXCLUDED_WORDS.some((word) => lower.includes(word.toLowerCase()));
}

function pickItemPrice(item: ItemHit) {
  return priceOf(item.itemPriceMin3) ?? priceOf(item.itemPrice);
}

async function rakutenProductByJan(
  appId: string,
  accessKey: string,
  jan: string,
  debug: DebugEntry,
) {
  const started = Date.now();
  const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("productCode", jan);

  debug.api = "ProductSearch(JAN)";
  debug.query = jan;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", accessKey },
    });

    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 1000) };
    }

    const hits = productHitsOf(data);
    debug.status = response.status;
    debug.count = Number(data?.count ?? hits.length);
    debug.returned = hits.length;
    debug.elapsedMs = Date.now() - started;
    debug.responseKeys = compactResponseKeys(data);
    debug.message = response.ok
      ? undefined
      : data?.error_description || data?.error || text.slice(0, 500);

    return { response, data, hits };
  } finally {
    clearTimeout(timer);
  }
}

async function rakutenItemsByKeyword(
  appId: string,
  accessKey: string,
  keyword: string,
  debug: DebugEntry,
) {
  const started = Date.now();
  const url = new URL(ITEM_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "1");
  url.searchParams.set("hits", "30");
  url.searchParams.set(
    "elements",
    ["itemName", "itemCode", "itemPrice", "itemPriceMin3", "itemUrl", "shopName", "shopCode"].join(","),
  );

  debug.api = "IchibaItemSearch";
  debug.query = keyword;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", accessKey },
    });

    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 1000) };
    }

    const hits = itemHitsOf(data);
    debug.status = response.status;
    debug.count = Number(data?.count ?? hits.length);
    debug.returned = hits.length;
    debug.elapsedMs = Date.now() - started;
    debug.responseKeys = compactResponseKeys(data);
    debug.message = response.ok
      ? undefined
      : data?.error_description || data?.error || text.slice(0, 500);
    debug.sample = hits.slice(0, 5).map((item) => ({
      name: cleanText(item.itemName),
      price: pickItemPrice(item),
      url: item.itemUrl ?? null,
      shop: item.shopName ?? null,
    }));

    return { response, data, hits };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (!appId || !accessKey) {
    return NextResponse.json(
      {
        error: "楽天APIの環境変数が未設定です。",
        results: [],
        debug: [{
          api: "Rakuten",
          status: 503,
          message: `RAKUTEN_APPLICATION_ID=${appId ? "OK" : "MISSING"}, RAKUTEN_ACCESS_KEY=${accessKey ? "OK" : "MISSING"}`,
        }],
      },
      { status: 503 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 });
  }

  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw
    .map((p: any) => ({
      jan: cleanJan(p?.jan),
      name: cleanText(p?.name),
      brand: cleanText(p?.brand),
      model: cleanText(p?.model),
    }))
    .filter((p) => p.jan.length === 13);

  const unique = Array.from(new Map(products.map((p) => [p.jan, p])).values()).slice(0, 5);

  if (!unique.length) {
    return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });
  }

  const results: any[] = [];

  for (const p of unique) {
    const debugProduct: DebugEntry = { api: "ProductSearch(JAN)", query: p.jan };
    const debugItems: DebugEntry = { api: "IchibaItemSearch", query: "" };
    const started = Date.now();

    try {
      const productLookup = await rakutenProductByJan(appId, accessKey, p.jan, debugProduct);

      if (!productLookup.response.ok) {
        const is429 = productLookup.response.status === 429;
        results.push({
          jan: p.jan,
          price: null,
          productName: p.name,
          candidateCount: 0,
          elapsedMs: Date.now() - started,
          debug: [debugProduct],
          error: is429
            ? "楽天Product Searchがアクセス制限(429)を返しました。"
            : `楽天Product Search ${productLookup.response.status}: ${debugProduct.message || "APIエラー"}`,
        });
        continue;
      }

      const product = productLookup.hits[0];
      const resolvedName = cleanText(product?.productName) || p.name;
      const resolvedModel = cleanText(product?.productNo) || p.model;
      const resolvedBrand = cleanText(product?.makerName || product?.brandName) || p.brand;

      // Product Search's price fields are no longer reliable for current data.
      // Use it only to resolve the product identity, then get live purchasable
      // listings from Ichiba Item Search sorted by price ascending.
      const searchParts = [resolvedBrand, resolvedName, resolvedModel].filter(Boolean);
      const keyword = cleanText(searchParts.join(" "));

      if (!keyword || keyword.length < 2) {
        results.push({
          jan: p.jan,
          price: null,
          productName: resolvedName || p.name,
          candidateCount: 0,
          elapsedMs: Date.now() - started,
          debug: [debugProduct],
          error: "楽天の商品名を取得できず、市場検索条件を作れませんでした。",
        });
        continue;
      }

      const itemLookup = await rakutenItemsByKeyword(appId, accessKey, keyword, debugItems);
      const candidates = itemLookup.hits
        .map((item) => ({ item, price: pickItemPrice(item) }))
        .filter(({ item, price }) => price != null && !looksUsedOrDamaged(cleanText(item.itemName)))
        .sort((a, b) => (a.price as number) - (b.price as number));

      const best = candidates[0];

      if (!itemLookup.response.ok) {
        const is429 = itemLookup.response.status === 429;
        results.push({
          jan: p.jan,
          price: null,
          productName: resolvedName || p.name,
          candidateCount: 0,
          elapsedMs: Date.now() - started,
          debug: [debugProduct, debugItems],
          error: is429
            ? "楽天Ichiba Item Searchがアクセス制限(429)を返しました。"
            : `楽天Ichiba Item Search ${itemLookup.response.status}: ${debugItems.message || "APIエラー"}`,
        });
        continue;
      }

      if (!best) {
        results.push({
          jan: p.jan,
          price: null,
          productName: resolvedName || p.name,
          candidateCount: 0,
          elapsedMs: Date.now() - started,
          debug: [debugProduct, debugItems],
          error: "楽天市場の購入可能な新品候補を取得できませんでした。",
          responseDiagnostics: {
            productKeys: product ? Object.keys(product).slice(0, 50) : [],
            itemKeys: itemLookup.hits[0] ? Object.keys(itemLookup.hits[0]).slice(0, 50) : [],
          },
        });
        continue;
      }

      const price = best.price as number;
      const item = best.item;
      const productPage = product?.productUrlPC ?? product?.searchUrl ?? null;

      results.push({
        jan: p.jan,
        price,
        rakutenLowestPrice: price,
        lowestPrice: price,
        productName: cleanText(item.itemName) || resolvedName || p.name,
        itemUrl: item.itemUrl ?? productPage,
        shopName: item.shopName ?? resolvedBrand ?? null,
        source: "Rakuten Ichiba Item Search",
        matchedBy: "JAN→Product Search→Item Search",
        candidateCount: candidates.length,
        elapsedMs: Date.now() - started,
        resolvedProduct: {
          productId: product?.productId ?? null,
          productCode: product?.productCode ?? p.jan,
          productName: product?.productName ?? null,
          productNo: product?.productNo ?? null,
          brandName: product?.brandName ?? null,
          makerName: product?.makerName ?? null,
          productUrlPC: product?.productUrlPC ?? null,
          searchUrl: product?.searchUrl ?? null,
        },
        priceSource: "itemPriceMin3/itemPrice",
        debug: [debugProduct, debugItems],
        error: null,
      });
    } catch (error: any) {
      results.push({
        jan: p.jan,
        price: null,
        productName: p.name,
        elapsedMs: Date.now() - started,
        debug: [debugProduct, debugItems],
        error:
          error?.name === "AbortError"
            ? "楽天APIが12秒以内に応答しませんでした。"
            : error?.message || "楽天APIへの接続に失敗しました。",
      });
    }
  }

  return NextResponse.json({ results });
}
