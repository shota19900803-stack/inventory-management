import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type ItemHit = {
  itemName?: string;
  itemCode?: string;
  itemPrice?: number | string | null;
  itemPriceMin3?: number | string | null;
  itemUrl?: string;
  shopName?: string;
  shopCode?: string;
  catchcopy?: string;
  itemCaption?: string;
};
type ProductHit = {
  productId?: string | number;
  productCode?: string;
  productName?: string;
  productNo?: string;
  brandName?: string;
  makerName?: string;
  productUrlPC?: string;
  searchUrl?: string;
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
  sample?: Array<{ name: string; price: number | null; url: string | null; shop: string | null }>;
};

const ITEM_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const PRODUCT_API = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const priceOf = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const EXCLUDED_WORDS = [
  "中古", "ユーズド", "used", "ジャンク", "junk", "訳あり", "訳有り",
  "展示品", "開封済み", "開封済", "開封品", "箱なし", "箱無し", "欠品",
  "本体のみ", "パーツ", "部品", "アウトレット", "リファービッシュ", "修理品",
];

function looksUsedOrDamaged(item: ItemHit) {
  const text = cleanText(`${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""}`).toLowerCase();
  return EXCLUDED_WORDS.some((word) => text.includes(word.toLowerCase()));
}

function itemHitsOf(data: any): ItemHit[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter((x: any) => x && typeof x === "object");
}

function productHitsOf(data: any): ProductHit[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.product ?? x?.item ?? x).filter((x: any) => x && typeof x === "object");
}

function compactKeys(data: any) {
  return data && typeof data === "object" ? Object.keys(data).slice(0, 40) : [];
}

function pickPrice(item: ItemHit) {
  return priceOf(item.itemPriceMin3) ?? priceOf(item.itemPrice);
}

function chooseLowestNew(items: ItemHit[], jan: string) {
  const candidates = items
    .map((item) => ({ item, price: pickPrice(item) }))
    .filter(({ item, price }) => price != null && !looksUsedOrDamaged(item));

  // Prefer an exact JAN occurrence when the JAN is present in itemCode/title/copy.
  const exact = candidates.filter(({ item }) => {
    const text = `${item.itemCode ?? ""} ${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""}`
      .replace(/\D/g, "");
    return text.includes(jan);
  });

  const pool = exact.length ? exact : candidates;
  pool.sort((a, b) => (a.price as number) - (b.price as number));
  return pool[0] ?? null;
}

async function fetchJson(url: URL, accessKey: string, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

async function searchItems(
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
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "1");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("elements", "itemName,itemCode,itemPrice,itemPriceMin3,itemUrl,shopName,shopCode,catchcopy,itemCaption");

  debug.api = "IchibaItemSearch";
  debug.query = keyword;

  const { response, data } = await fetchJson(url, accessKey);
  const hits = itemHitsOf(data);
  debug.status = response.status;
  debug.count = Number(data?.count ?? hits.length);
  debug.returned = hits.length;
  debug.elapsedMs = Date.now() - started;
  debug.responseKeys = compactKeys(data);
  debug.message = response.ok ? undefined : data?.error_description || data?.error || "APIエラー";
  debug.sample = hits.slice(0, 5).map((item) => ({
    name: cleanText(item.itemName),
    price: pickPrice(item),
    url: item.itemUrl ?? null,
    shop: item.shopName ?? null,
  }));
  return { response, data, hits };
}

async function productByJan(
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
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);

  debug.api = "ProductSearch(JAN)";
  debug.query = jan;

  const { response, data } = await fetchJson(url, accessKey);
  const hits = productHitsOf(data);
  debug.status = response.status;
  debug.count = Number(data?.count ?? hits.length);
  debug.returned = hits.length;
  debug.elapsedMs = Date.now() - started;
  debug.responseKeys = compactKeys(data);
  debug.message = response.ok ? undefined : data?.error_description || data?.error || "APIエラー";

  return { response, data, hit: hits[0] ?? null };
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (!appId || !accessKey) {
    return NextResponse.json({
      error: "楽天APIの環境変数が未設定です。",
      results: [],
      debug: [{ api: "Rakuten", status: 503, message: "RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY を確認してください。" }],
    }, { status: 503 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 });
  }

  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw.map((p: any) => ({
    jan: cleanJan(p?.jan),
    name: cleanText(p?.name ?? p?.productName),
    brand: cleanText(p?.brand ?? p?.brandName ?? p?.makerName),
    model: cleanText(p?.model ?? p?.productNo),
  })).filter((p) => p.jan.length === 13);

  const unique = Array.from(new Map(products.map((p) => [p.jan, p])).values()).slice(0, 5);
  if (!unique.length) {
    return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });
  }

  const results: any[] = [];

  for (const p of unique) {
    const debugJan: DebugEntry = { api: "IchibaItemSearch", query: p.jan };
    const debugProduct: DebugEntry = { api: "ProductSearch(JAN)", query: p.jan };
    const debugFallback: DebugEntry = { api: "IchibaItemSearch(fallback)", query: "" };
    const started = Date.now();

    try {
      // 最優先：JANそのものを楽天市場の商品検索へ渡す。
      // 商品名へ変換してから検索するより、JAN一致商品を直接拾えるため誤爆が少ない。
      const direct = await searchItems(appId, accessKey, p.jan, debugJan);
      if (!direct.response.ok) {
        results.push({
          jan: p.jan, price: null, productName: p.name, candidateCount: 0,
          elapsedMs: Date.now() - started, debug: [debugJan],
          error: direct.response.status === 429
            ? "楽天Ichiba Item Searchがアクセス制限(429)を返しました。"
            : `楽天Ichiba Item Search ${direct.response.status}: ${debugJan.message || "APIエラー"}`,
        });
        continue;
      }

      let chosen = chooseLowestNew(direct.hits, p.jan);
      let source = "IchibaItemSearch:JAN";
      let resolvedProduct: ProductHit | null = null;

      // JAN直検索で見つからない場合だけProduct Searchで商品を解決し、
      // 型番→商品名の順に最大2回だけ市場検索する。
      if (!chosen) {
        const productLookup = await productByJan(appId, accessKey, p.jan, debugProduct);
        if (!productLookup.response.ok) {
          results.push({
            jan: p.jan, price: null, productName: p.name, candidateCount: 0,
            elapsedMs: Date.now() - started, debug: [debugJan, debugProduct],
            error: productLookup.response.status === 429
              ? "楽天Product Searchがアクセス制限(429)を返しました。"
              : `楽天Product Search ${productLookup.response.status}: ${debugProduct.message || "APIエラー"}`,
          });
          continue;
        }

        resolvedProduct = productLookup.hit;
        const queries = Array.from(new Set([
          cleanText(resolvedProduct?.productNo),
          cleanText(resolvedProduct?.productName),
          p.model,
          p.name,
        ].filter((v) => v && v.length >= 2))).slice(0, 2);

        for (const query of queries) {
          debugFallback.query = query;
          const fallback = await searchItems(appId, accessKey, query, debugFallback);
          if (!fallback.response.ok) {
            if (fallback.response.status === 429) {
              results.push({
                jan: p.jan, price: null, productName: p.name, candidateCount: 0,
                elapsedMs: Date.now() - started, debug: [debugJan, debugProduct, debugFallback],
                error: "楽天Ichiba Item Searchがアクセス制限(429)を返しました。",
              });
              chosen = null;
              break;
            }
            continue;
          }
          const candidate = chooseLowestNew(fallback.hits, p.jan);
          if (candidate) {
            chosen = candidate;
            source = `IchibaItemSearch:${query}`;
            break;
          }
        }
      }

      if (!chosen) {
        results.push({
          jan: p.jan,
          price: null,
          productName: cleanText(resolvedProduct?.productName) || p.name,
          candidateCount: 0,
          elapsedMs: Date.now() - started,
          debug: [debugJan, ...(resolvedProduct ? [debugProduct, debugFallback] : [])],
          responseDiagnostics: {
            directCandidates: direct.hits.slice(0, 5).map((x) => ({ name: x.itemName, price: pickPrice(x), code: x.itemCode })),
          },
          error: "楽天市場の購入可能な新品候補を取得できませんでした。",
        });
        continue;
      }

      const item = chosen.item;
      const price = chosen.price as number;
      results.push({
        jan: p.jan,
        price,
        rakutenLowestPrice: price,
        lowestPrice: price,
        productName: cleanText(item.itemName) || cleanText(resolvedProduct?.productName) || p.name,
        itemUrl: item.itemUrl ?? resolvedProduct?.productUrlPC ?? resolvedProduct?.searchUrl ?? null,
        shopName: item.shopName ?? resolvedProduct?.makerName ?? resolvedProduct?.brandName ?? null,
        source: "Rakuten Ichiba Item Search",
        matchedBy: source,
        candidateCount: 1,
        elapsedMs: Date.now() - started,
        resolvedProduct: resolvedProduct ? {
          productId: resolvedProduct.productId ?? null,
          productCode: resolvedProduct.productCode ?? p.jan,
          productName: resolvedProduct.productName ?? null,
          productNo: resolvedProduct.productNo ?? null,
          brandName: resolvedProduct.brandName ?? null,
          makerName: resolvedProduct.makerName ?? null,
          productUrlPC: resolvedProduct.productUrlPC ?? null,
          searchUrl: resolvedProduct.searchUrl ?? null,
        } : null,
        priceSource: item.itemPriceMin3 != null ? "itemPriceMin3" : "itemPrice",
        debug: [debugJan, ...(resolvedProduct ? [debugProduct, debugFallback] : [])],
        error: null,
      });
    } catch (error: any) {
      results.push({
        jan: p.jan,
        price: null,
        productName: p.name,
        elapsedMs: Date.now() - started,
        debug: [debugJan, debugProduct, debugFallback],
        error: error?.name === "AbortError"
          ? "楽天APIが12秒以内に応答しませんでした。"
          : error?.message || "楽天APIへの接続に失敗しました。",
      });
    }
  }

  return NextResponse.json({ results });
}
