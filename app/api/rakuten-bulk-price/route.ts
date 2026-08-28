import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type RakutenProduct = {
  productId?: string | number | null; productCode?: string | null; productName?: string | null;
  productNo?: string | null; brandName?: string | null; productUrlPC?: string | null;
  productUrlMobile?: string | null; itemCount?: number | null; salesItemCount?: number | null;
  usedExcludeCount?: number | null; usedExcludeSalesItemCount?: number | null;
  minPrice?: number | string | null; salesMinPrice?: number | string | null;
  usedExcludeMinPrice?: number | string | null; usedExcludeSalesMinPrice?: number | string | null;
};
type Item = {
  itemName?: string | null; itemCode?: string | null; itemPrice?: number | string | null;
  itemPriceMin3?: number | string | null; itemUrl?: string | null; shopName?: string | null;
  catchcopy?: string | null; itemCaption?: string | null; availability?: number | string | null;
};
type Diagnostic = {
  api: string; query?: string; status?: number; count?: number; returned?: number;
  elapsedMs?: number; message?: string; product?: Record<string, unknown> | null;
  sample?: Array<{ name: string; price: number | null; shop: string | null }>;
};

const ITEM_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const PRODUCT_API = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";

const clean = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const normalize = (v: unknown) => clean(v).toLowerCase().replace(/[「」『』【】［］()（）\[\]<>＜＞:：,，.!！?？・/\\_-]/g, "");
const toPrice = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const BAD_WORDS = ["中古", "ユーズド", "used", "ジャンク", "junk", "訳あり", "訳有り", "展示品", "開封済み", "開封済", "開封品", "箱なし", "箱無し", "欠品", "本体のみ", "パーツ", "部品", "アウトレット", "リファービッシュ", "修理品"];
function isBadItem(item: Item) {
  const text = clean(`${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""}`).toLowerCase();
  return BAD_WORDS.some((word) => text.includes(word.toLowerCase()));
}
function getProducts(data: any): RakutenProduct[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.product ?? x?.item ?? x).filter((x: any) => x && typeof x === "object");
}
function getItems(data: any): Item[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter((x: any) => x && typeof x === "object");
}

async function getJson(url: URL, accessKey: string, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json", accessKey } });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
    return { response, data };
  } finally { clearTimeout(timer); }
}

async function productByJan(appId: string, accessKey: string, jan: string) {
  const started = Date.now();
  const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  // productCode is JAN and must not be combined with service-specific parameters.
  url.searchParams.set("productCode", jan);
  const { response, data } = await getJson(url, accessKey);
  const products = getProducts(data);
  const product = products.find((x) => cleanJan(x.productCode) === jan) ?? products[0] ?? null;
  const diagnostic: Diagnostic = {
    api: "ProductSearch(JAN exact)", query: jan, status: response.status,
    count: Number(data?.count ?? products.length), returned: products.length,
    elapsedMs: Date.now() - started,
    message: response.ok ? undefined : clean(data?.error_description ?? data?.error ?? "楽天Product Search APIエラー"),
  };
  if (product) diagnostic.product = {
    productId: product.productId, productCode: product.productCode, productName: product.productName,
    productNo: product.productNo, brandName: product.brandName, itemCount: product.itemCount,
    salesItemCount: product.salesItemCount, usedExcludeCount: product.usedExcludeCount,
    usedExcludeSalesItemCount: product.usedExcludeSalesItemCount, minPrice: product.minPrice,
    salesMinPrice: product.salesMinPrice, usedExcludeMinPrice: product.usedExcludeMinPrice,
    usedExcludeSalesMinPrice: product.usedExcludeSalesMinPrice,
  };
  return { response, product, diagnostic };
}

async function itemSearch(appId: string, accessKey: string, query: string) {
  const started = Date.now();
  const url = new URL(ITEM_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", query.slice(0, 128));
  url.searchParams.set("availability", "1");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("elements", "itemName,itemCode,itemPrice,itemPriceMin3,itemUrl,shopName,catchcopy,itemCaption,availability");
  const { response, data } = await getJson(url, accessKey);
  const items = getItems(data);
  const diagnostic: Diagnostic = {
    api: "IchibaItemSearch", query, status: response.status,
    count: Number(data?.count ?? items.length), returned: items.length,
    elapsedMs: Date.now() - started,
    message: response.ok ? undefined : clean(data?.error_description ?? data?.error ?? "楽天Item Search APIエラー"),
    sample: items.slice(0, 5).map((item) => ({ name: clean(item.itemName), price: toPrice(item.itemPriceMin3) ?? toPrice(item.itemPrice), shop: item.shopName ?? null })),
  };
  return { response, items, diagnostic };
}

function directPrice(product: RakutenProduct | null) {
  if (!product) return { value: null as number | null, source: null as string | null };
  for (const [value, source] of [[product.usedExcludeSalesMinPrice, "usedExcludeSalesMinPrice"], [product.salesMinPrice, "salesMinPrice"]] as const) {
    const parsed = toPrice(value);
    if (parsed != null) return { value: parsed, source };
  }
  return { value: null, source: null };
}

function itemQueries(input: Product, product: RakutenProduct | null) {
  const values = [clean(product?.productNo), clean(input.model), clean(product?.productName), clean(input.name), clean(product?.brandName), clean(input.brand)].filter((x) => x.length >= 2);
  const out: string[] = [];
  for (const value of values) {
    out.push(value.slice(0, 64));
    const words = value.split(" ").filter(Boolean);
    if (words.length > 1) out.push(words.slice(0, 4).join(" ").slice(0, 64));
  }
  return Array.from(new Set(out));
}

function chooseItem(items: Item[], product: RakutenProduct | null, input: Product) {
  const model = normalize(product?.productNo || input.model);
  const name = normalize(product?.productName || input.name);
  const brand = normalize(product?.brandName || input.brand);
  const modelTokens = clean(product?.productNo || input.model).toLowerCase().split(/\s+/).filter((x) => x.length >= 2).slice(0, 6);
  const candidates = items.flatMap((item) => {
    if (isBadItem(item)) return [];
    const p = toPrice(item.itemPriceMin3) ?? toPrice(item.itemPrice);
    if (p == null) return [];
    const text = normalize(`${item.itemName ?? ""} ${item.catchcopy ?? ""}`);
    let score = 0;
    if (model && text.includes(model)) score += 100;
    if (name && text.includes(name)) score += 80;
    if (brand && text.includes(brand)) score += 20;
    score += modelTokens.filter((token) => text.includes(normalize(token))).length * 10;
    return [{ item, price: p, score }];
  });
  if (!candidates.length) return null;
  const strong = candidates.filter((x) => x.score >= 100);
  const medium = candidates.filter((x) => x.score >= 20);
  const pool = strong.length ? strong : medium.length ? medium : candidates;
  return [...pool].sort((a, b) => a.price - b.price)[0] ?? null;
}

function failure(input: Product, diagnostics: Diagnostic[], started: number, error: string, extra: Record<string, unknown> = {}) {
  return { jan: input.jan, price: null, lowestPrice: null, productName: input.name || null, elapsedMs: Date.now() - started, debug: diagnostics, ...extra, error };
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) return NextResponse.json({ results: [], error: "楽天APIの環境変数が未設定です。" }, { status: 503 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ results: [], error: "JSONが不正です。" }, { status: 400 }); }

  const products: Product[] = (Array.isArray(body?.products) ? body.products : [])
    .map((p: any) => ({ jan: cleanJan(p?.jan), name: clean(p?.name ?? p?.productName), brand: clean(p?.brand ?? p?.brandName ?? p?.makerName), model: clean(p?.model ?? p?.productNo) }))
    .filter((p) => p.jan.length === 13);
  const unique = Array.from(new Map(products.map((p) => [p.jan, p])).values()).slice(0, 5);
  if (!unique.length) return NextResponse.json({ results: [], error: "有効な13桁JANの商品がありません。" }, { status: 400 });

  const results: any[] = [];
  for (const input of unique) {
    const started = Date.now();
    const diagnostics: Diagnostic[] = [];
    try {
      const exact = await productByJan(appId, accessKey, input.jan);
      diagnostics.push(exact.diagnostic);
      if (exact.response.status === 429) {
        results.push(failure(input, diagnostics, started, "楽天APIがアクセス制限(429)を返しました。少し時間を置いて再検索してください。"));
        continue;
      }

      let resolved = exact.product;
      const resolvedName = clean(resolved?.productName) || input.name;
      const direct = directPrice(resolved);

      if (exact.response.ok && direct.value != null) {
        results.push({ jan: input.jan, price: direct.value, lowestPrice: direct.value, rakutenLowestPrice: direct.value,
          productName: resolvedName || null, itemUrl: resolved?.productUrlPC ?? resolved?.productUrlMobile ?? null,
          shopName: null, source: "Rakuten Product Search / JAN exact", matchedBy: "JAN", candidateCount: resolved?.usedExcludeSalesItemCount ?? resolved?.salesItemCount ?? 0,
          elapsedMs: Date.now() - started, priceSource: direct.source, debug: diagnostics, error: null });
        continue;
      }

      let chosen: { item: Item; price: number; score: number } | null = null;
      let matchedBy = "";
      let candidateCount = 0;
      for (const query of itemQueries(input, resolved).slice(0, 3)) {
        const searched = await itemSearch(appId, accessKey, query);
        diagnostics.push(searched.diagnostic);
        if (searched.response.status === 429) {
          results.push(failure(input, diagnostics, started, "楽天APIがアクセス制限(429)を返しました。少し時間を置いて再検索してください。", { productName: resolvedName || null }));
          matchedBy = "__RATE_LIMIT__";
          break;
        }
        if (!searched.response.ok) continue;
        candidateCount += searched.items.length;
        const picked = chooseItem(searched.items, resolved, input);
        if (picked) { chosen = picked; matchedBy = query; break; }
      }
      if (matchedBy === "__RATE_LIMIT__") continue;

      if (!chosen) {
        results.push(failure(input, diagnostics, started, "楽天市場の対象商品について、新品として採用できる最安値を確認できませんでした。", {
          productName: resolvedName || null, candidateCount,
          responseDiagnostics: {
            productSearch: diagnostics.find((d) => d.api === "ProductSearch(JAN exact)") ?? null,
            itemSearches: diagnostics.filter((d) => d.api === "IchibaItemSearch"),
          },
        }));
        continue;
      }

      results.push({ jan: input.jan, price: chosen.price, lowestPrice: chosen.price, rakutenLowestPrice: chosen.price,
        productName: clean(chosen.item.itemName) || resolvedName || null, itemUrl: chosen.item.itemUrl ?? null,
        shopName: chosen.item.shopName ?? null, source: "Rakuten Ichiba Item Search / fallback", matchedBy,
        priceSource: chosen.item.itemPriceMin3 != null ? "itemPriceMin3" : "itemPrice", candidateCount,
        elapsedMs: Date.now() - started, debug: diagnostics, error: null });
    } catch (error: any) {
      results.push(failure(input, diagnostics, started, error?.name === "AbortError" ? "楽天APIの応答がタイムアウトしました。" : error?.message || "楽天APIへの接続に失敗しました。"));
    }
  }
  return NextResponse.json({ results });
}
