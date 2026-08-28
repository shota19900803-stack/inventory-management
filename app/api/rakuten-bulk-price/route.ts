import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type Item = {
  itemName?: string;
  itemCode?: string;
  itemPrice?: number | string | null;
  itemPriceMin3?: number | string | null;
  itemUrl?: string;
  shopName?: string;
  catchcopy?: string;
  itemCaption?: string;
  availability?: number | string | null;
};
type Debug = {
  api: string;
  query?: string;
  status?: number;
  count?: number;
  returned?: number;
  elapsedMs?: number;
  message?: string;
  sample?: Array<{ name: string; price: number | null; shop: string | null }>;
  product?: Record<string, unknown> | null;
};

const ITEM_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const PRODUCT_API = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const clean = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const norm = (v: unknown) => clean(v).toLowerCase().replace(/[「」『』【】［］()（）\[\]<>＜＞:：,，.!！?？・/\\_-]/g, "");
const price = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const BAD = [
  "中古", "ユーズド", "used", "ジャンク", "junk", "訳あり", "訳有り",
  "展示品", "開封済み", "開封済", "開封品", "箱なし", "箱無し", "欠品",
  "本体のみ", "パーツ", "部品", "アウトレット", "リファービッシュ", "修理品",
];

function isBad(item: Item) {
  const text = clean(`${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""}`).toLowerCase();
  return BAD.some((w) => text.includes(w.toLowerCase()));
}

function itemsOf(data: any): Item[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter((x: any) => x && typeof x === "object");
}

async function getJson(url: URL, accessKey: string, timeoutMs = 12000) {
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
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

async function searchItems(appId: string, accessKey: string, query: string, debug: Debug) {
  const started = Date.now();
  const url = new URL(ITEM_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", query.slice(0, 128));
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("elements", "itemName,itemCode,itemPrice,itemPriceMin3,itemUrl,shopName,catchcopy,itemCaption,availability");

  debug.api = "IchibaItemSearch";
  debug.query = query;
  const { response, data } = await getJson(url, accessKey);
  const hits = itemsOf(data);
  debug.status = response.status;
  debug.count = Number(data?.count ?? hits.length);
  debug.returned = hits.length;
  debug.elapsedMs = Date.now() - started;
  debug.message = response.ok ? undefined : data?.error_description || data?.error || "APIエラー";
  debug.sample = hits.slice(0, 5).map((x) => ({
    name: clean(x.itemName),
    price: price(x.itemPriceMin3) ?? price(x.itemPrice),
    shop: x.shopName ?? null,
  }));
  return { response, data, hits };
}

async function lookupProductByJan(appId: string, accessKey: string, jan: string, debug: Debug) {
  const started = Date.now();
  const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  // productCode(JAN) must be used alone among service-specific parameters.
  url.searchParams.set("productCode", jan);
  debug.api = "ProductSearch(JAN)";
  debug.query = jan;

  const { response, data } = await getJson(url, accessKey);
  const first = Array.isArray(data?.items)
    ? (data.items[0]?.product ?? data.items[0]?.item ?? data.items[0])
    : null;
  debug.status = response.status;
  debug.count = Number(data?.count ?? 0);
  debug.returned = first ? 1 : 0;
  debug.elapsedMs = Date.now() - started;
  debug.message = response.ok ? undefined : data?.error_description || data?.error || "APIエラー";
  if (first && typeof first === "object") {
    debug.product = {
      productId: first.productId,
      productCode: first.productCode,
      productName: first.productName,
      productNo: first.productNo,
      brandName: first.brandName,
      itemCount: first.itemCount,
      salesItemCount: first.salesItemCount,
      usedExcludeSalesItemCount: first.usedExcludeSalesItemCount,
      minPrice: first.minPrice,
      salesMinPrice: first.salesMinPrice,
      usedExcludeMinPrice: first.usedExcludeMinPrice,
      usedExcludeSalesMinPrice: first.usedExcludeSalesMinPrice,
    };
  }
  return { response, product: first && typeof first === "object" ? first : null };
}

async function lookupProductByKeyword(appId: string, accessKey: string, query: string, debug: Debug) {
  const started = Date.now();
  const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", query.slice(0, 128));
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");

  debug.api = "ProductSearch(keyword)";
  debug.query = query;

  const { response, data } = await getJson(url, accessKey);
  const products = Array.isArray(data?.items)
    ? data.items.map((x: any) => x?.product ?? x?.item ?? x).filter((x: any) => x && typeof x === "object")
    : [];

  debug.status = response.status;
  debug.count = Number(data?.count ?? products.length);
  debug.returned = products.length;
  debug.elapsedMs = Date.now() - started;
  debug.message = response.ok ? undefined : data?.error_description || data?.error || "APIエラー";

  return { response, products };
}

function exactProductByJan(products: any[], jan: string, model: string, name: string) {
  const targetJan = cleanJan(jan);
  const targetModel = norm(model);
  const targetName = norm(name);

  const janMatch = products.find((x) => cleanJan(x?.productCode) === targetJan);
  if (janMatch) return janMatch;

  if (targetModel) {
    const modelMatch = products.find((x) => norm(x?.productNo) === targetModel);
    if (modelMatch) return modelMatch;
  }

  if (targetName) {
    const nameMatch = products.find((x) => {
      const n = norm(x?.productName);
      return n && (n === targetName || n.includes(targetName) || targetName.includes(n));
    });
    if (nameMatch) return nameMatch;
  }

  return null;
}

function queryCandidates(p: Product, resolved: any) {
  const raw = [
    resolved?.productNo,
    p.model,
    resolved?.productName,
    p.name,
    resolved?.brandName,
    p.brand,
  ].map(clean).filter((x) => x.length >= 2);

  const out: string[] = [];
  for (const v of raw) {
    out.push(v.slice(0, 64));
    const words = v.split(" ").filter(Boolean);
    if (words.length >= 2) {
      out.push(words.slice(0, Math.min(4, words.length)).join(" ").slice(0, 64));
    }
  }
  return Array.from(new Set(out));
}

function choose(items: Item[], reference: string): { item: Item; p: number } | null {
  const usable: Array<{ item: Item; p: number }> = [];
  for (const item of items) {
    if (isBad(item)) continue;
    const p = price(item.itemPriceMin3) ?? price(item.itemPrice);
    if (p != null) usable.push({ item, p });
  }
  if (!usable.length) return null;

  const ref = norm(reference);
  const refTokens = clean(reference)
    .toLowerCase()
    .split(/\s+/)
    .filter((x) => x.length >= 2)
    .slice(0, 8);

  const scored = usable.map((x) => {
    const text = norm(`${x.item.itemName ?? ""} ${x.item.catchcopy ?? ""}`);
    const tokenHits = refTokens.filter((t) => text.includes(norm(t))).length;
    const exact = ref && text.includes(ref) ? 100 : 0;
    return { ...x, score: exact + tokenHits * 5 };
  });

  const exact = scored.filter((x) => x.score >= 100);
  const pool = exact.length
    ? exact
    : scored.filter((x) => x.score >= Math.min(10, refTokens.length * 5));
  const sorted = [...(pool.length ? pool : scored)].sort((a, b) => a.p - b.p);
  return sorted[0] ?? null;
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) {
    return NextResponse.json({ results: [], error: "楽天APIの環境変数が未設定です。" }, { status: 503 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ results: [], error: "JSONが不正です。" }, { status: 400 });
  }

  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw
    .map((p: any) => ({
      jan: cleanJan(p?.jan),
      name: clean(p?.name ?? p?.productName),
      brand: clean(p?.brand ?? p?.brandName ?? p?.makerName),
      model: clean(p?.model ?? p?.productNo),
    }))
    .filter((p) => p.jan.length === 13);

  const unique = Array.from(new Map(products.map((p) => [p.jan, p])).values()).slice(0, 5);
  if (!unique.length) {
    return NextResponse.json({ results: [], error: "有効な13桁JANの商品がありません。" }, { status: 400 });
  }

  const results: any[] = [];

  for (const p of unique) {
    const started = Date.now();
    const productDebug: Debug = { api: "ProductSearch(JAN)", query: p.jan };
    const searchDebug: Debug[] = [];

    try {
      const lookup = await lookupProductByJan(appId, accessKey, p.jan, productDebug);
      let resolved = lookup.product;
      let resolvedName = clean(resolved?.productName) || p.name;

      const exactNewLowest = resolved
        ? price(resolved?.usedExcludeSalesMinPrice) ?? price(resolved?.salesMinPrice)
        : null;

      // Primary path: JAN exact product + Product Search price data.
      if (lookup.response.ok && exactNewLowest != null) {
        results.push({
          jan: p.jan,
          price: exactNewLowest,
          rakutenLowestPrice: exactNewLowest,
          lowestPrice: exactNewLowest,
          productName: resolvedName,
          itemUrl: resolved?.productUrlPC ?? resolved?.productUrlMobile ?? null,
          shopName: null,
          source: "Rakuten Product Search (JAN exact)",
          matchedBy: "JAN",
          candidateCount: 0,
          elapsedMs: Date.now() - started,
          priceSource: resolved?.usedExcludeSalesMinPrice != null ? "usedExcludeSalesMinPrice" : "salesMinPrice",
          debug: [productDebug],
          error: null,
        });
        continue;
      }

      // Recovery path: Product Search by a compact product keyword, then require
      // an exact JAN/model/name match before accepting its product-level price.
      const productQueries = Array.from(new Set([
        clean(resolved?.productNo),
        clean(p.model),
        clean(resolved?.productName),
        clean(p.name),
      ].filter((x) => x.length >= 2))).slice(0, 3);

      for (const query of productQueries) {
        const d: Debug = { api: "ProductSearch(keyword)", query };
        const searched = await lookupProductByKeyword(appId, accessKey, query, d);
        searchDebug.push(d);
        if (!searched.response.ok) continue;

        const exact = exactProductByJan(searched.products, p.jan, p.model, p.name);
        if (!exact) continue;

        const exactPrice = price(exact?.usedExcludeSalesMinPrice) ?? price(exact?.salesMinPrice);
        if (exactPrice == null) continue;

        resolved = exact;
        resolvedName = clean(exact?.productName) || resolvedName;
        results.push({
          jan: p.jan,
          price: exactPrice,
          rakutenLowestPrice: exactPrice,
          lowestPrice: exactPrice,
          productName: resolvedName,
          itemUrl: exact?.productUrlPC ?? exact?.productUrlMobile ?? null,
          shopName: null,
          source: "Rakuten Product Search (exact match)",
          matchedBy: query,
          candidateCount: searched.products.length,
          elapsedMs: Date.now() - started,
          priceSource: exact?.usedExcludeSalesMinPrice != null ? "usedExcludeSalesMinPrice" : "salesMinPrice",
          debug: [productDebug, ...searchDebug],
          error: null,
        });
        resolved = exact;
        break;
      }

      if (results[results.length - 1]?.jan === p.jan && results[results.length - 1]?.error === null) continue;

      // Last resort: live Ichiba item search. This is deliberately secondary so
      // the app does not depend on fuzzy matching when a JAN-exact product price
      // is available from Product Search.
      const queries = queryCandidates(p, resolved);
      let chosen: { item: Item; p: number } | null = null;
      let matchedBy = "";
      let candidateCount = 0;
      let rateLimited = false;

      for (const query of queries.slice(0, 4)) {
        const d: Debug = { api: "IchibaItemSearch", query };
        const search = await searchItems(appId, accessKey, query, d);
        searchDebug.push(d);

        if (!search.response.ok) {
          if (search.response.status === 429) {
            rateLimited = true;
            break;
          }
          continue;
        }

        candidateCount += search.hits.length;
        const picked = choose(search.hits, clean(resolved?.productName) || p.name);
        if (picked) {
          chosen = picked;
          matchedBy = query;
          break;
        }
      }

      if (rateLimited) {
        results.push({
          jan: p.jan,
          price: null,
          productName: resolvedName,
          candidateCount,
          elapsedMs: Date.now() - started,
          debug: [productDebug, ...searchDebug],
          error: "楽天APIがアクセス制限(429)を返しました。",
        });
        continue;
      }

      if (!chosen) {
        results.push({
          jan: p.jan,
          price: null,
          lowestPrice: null,
          productName: resolvedName,
          candidateCount,
          elapsedMs: Date.now() - started,
          debug: [productDebug, ...searchDebug],
          responseDiagnostics: {
            productSearch: {
              status: productDebug.status,
              count: productDebug.count,
              returned: productDebug.returned,
              message: productDebug.message,
              product: productDebug.product,
            },
            productKeywordSearches: searchDebug.filter((d) => d.api === "ProductSearch(keyword)").map((d) => ({
              query: d.query,
              status: d.status,
              count: d.count,
              returned: d.returned,
              message: d.message,
            })),
            itemSearches: searchDebug.filter((d) => d.api === "IchibaItemSearch").map((d) => ({
              query: d.query,
              status: d.status,
              count: d.count,
              returned: d.returned,
              message: d.message,
              sample: d.sample,
            })),
          },
          error: "楽天市場の購入可能な新品候補を取得できませんでした。",
        });
        continue;
      }

      const item = chosen.item;
      results.push({
        jan: p.jan,
        price: chosen.p,
        rakutenLowestPrice: chosen.p,
        lowestPrice: chosen.p,
        productName: clean(item.itemName) || resolvedName,
        itemUrl: item.itemUrl ?? null,
        shopName: item.shopName ?? null,
        source: "Rakuten Ichiba Item Search",
        matchedBy,
        candidateCount,
        elapsedMs: Date.now() - started,
        priceSource: item.itemPriceMin3 != null ? "itemPriceMin3" : "itemPrice",
        debug: [productDebug, ...searchDebug],
        error: null,
      });
    } catch (e: any) {
      results.push({
        jan: p.jan,
        price: null,
        productName: p.name,
        elapsedMs: Date.now() - started,
        debug: [productDebug, ...searchDebug],
        error: e?.name === "AbortError"
          ? "楽天APIの応答がタイムアウトしました。"
          : e?.message || "楽天APIへの接続に失敗しました。",
      });
    }
  }

  return NextResponse.json({ results });
}
