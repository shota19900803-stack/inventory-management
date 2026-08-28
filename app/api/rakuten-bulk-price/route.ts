import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type RakutenProduct = {
  productId?: string | number | null; productCode?: string | null; productName?: string | null;
  productNo?: string | null; brandName?: string | null; productUrlPC?: string | null;
  productUrlMobile?: string | null; searchUrl?: string | null; itemCount?: number | null;
  salesItemCount?: number | null; usedExcludeCount?: number | null; usedExcludeSalesItemCount?: number | null;
  minPrice?: number | string | null; salesMinPrice?: number | string | null;
  usedExcludeMinPrice?: number | string | null; usedExcludeSalesMinPrice?: number | string | null;
};
type Item = {
  itemName?: string | null; itemCode?: string | null; itemPrice?: number | string | null;
  itemPriceMin1?: number | string | null; itemPriceMin2?: number | string | null; itemPriceMin3?: number | string | null;
  itemUrl?: string | null; shopName?: string | null; catchcopy?: string | null; itemCaption?: string | null;
  availability?: number | string | null;
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
const normalizeLoose = (v: unknown) => normalize(v).replace(/[^0-9a-zぁ-んァ-ヶ一-龠]/gi, "");
const toPrice = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// These words are strong signals that the listing is not a normal new retail item.
const BAD_WORDS = [
  "中古", "ユーズド", "used", "ジャンク", "junk", "訳あり", "訳有り", "展示品",
  "開封済み", "開封済", "開封品", "箱なし", "箱無し", "欠品", "本体のみ", "パーツ",
  "部品", "アウトレット", "リファービッシュ", "修理品", "動作未確認", "現状品"
];
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
    const response = await fetch(url, {
      method: "GET", cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json", accessKey },
    });
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
  // JAN/productCode cannot be combined with service-specific search parameters.
  url.searchParams.set("productCode", jan);

  const { response, data } = await getJson(url, accessKey);
  const products = getProducts(data);
  const exact = products.find((x) => cleanJan(x.productCode) === jan) ?? null;
  const product = exact ?? products[0] ?? null;
  const diagnostic: Diagnostic = {
    api: "ProductSearch(JAN exact)", query: jan, status: response.status,
    count: Number(data?.count ?? products.length), returned: products.length,
    elapsedMs: Date.now() - started,
    message: response.ok ? undefined : clean(data?.error_description ?? data?.error ?? "楽天Product Search APIエラー"),
  };
  if (product) {
    diagnostic.product = {
      productId: product.productId, productCode: product.productCode, productName: product.productName,
      productNo: product.productNo, brandName: product.brandName, productUrlPC: product.productUrlPC,
      searchUrl: product.searchUrl, itemCount: product.itemCount, salesItemCount: product.salesItemCount,
      usedExcludeCount: product.usedExcludeCount, usedExcludeSalesItemCount: product.usedExcludeSalesItemCount,
      minPrice: product.minPrice, salesMinPrice: product.salesMinPrice,
      usedExcludeMinPrice: product.usedExcludeMinPrice, usedExcludeSalesMinPrice: product.usedExcludeSalesMinPrice,
    };
  }
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
  url.searchParams.set("elements", "itemName,itemCode,itemPrice,itemPriceMin1,itemPriceMin2,itemPriceMin3,itemUrl,shopName,catchcopy,itemCaption,availability");

  const { response, data } = await getJson(url, accessKey);
  const items = getItems(data);
  const diagnostic: Diagnostic = {
    api: "IchibaItemSearch", query, status: response.status,
    count: Number(data?.count ?? items.length), returned: items.length,
    elapsedMs: Date.now() - started,
    message: response.ok ? undefined : clean(data?.error_description ?? data?.error ?? "楽天Item Search APIエラー"),
    sample: items.slice(0, 8).map((item) => ({
      name: clean(item.itemName),
      price: toPrice(item.itemPriceMin3) ?? toPrice(item.itemPriceMin2) ?? toPrice(item.itemPriceMin1) ?? toPrice(item.itemPrice),
      shop: item.shopName ?? null,
    })),
  };
  return { response, items, diagnostic };
}

function directPrice(product: RakutenProduct | null) {
  if (!product) return { value: null as number | null, source: null as string | null };
  // For a Rakuten product group this is the most useful field: purchasable minimum excluding used listings.
  for (const [value, source] of [
    [product.usedExcludeSalesMinPrice, "usedExcludeSalesMinPrice"],
    [product.salesMinPrice, "salesMinPrice"],
  ] as const) {
    const parsed = toPrice(value);
    if (parsed != null) return { value: parsed, source };
  }
  return { value: null, source: null };
}

function compactQuery(v: string) {
  return clean(v).replace(/[\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 96);
}

function itemQueries(input: Product, product: RakutenProduct | null) {
  const name = clean(product?.productName) || clean(input.name);
  const model = clean(product?.productNo) || clean(input.model);
  const brand = clean(product?.brandName) || clean(input.brand);
  const out: string[] = [];

  // Price2Alert-style keyword search: use the product identity first, then progressively broader queries.
  // A JAN search is useful when shops put the JAN in the listing title, but it is not relied upon exclusively.
  if (input.jan.length === 13) out.push(input.jan);
  if (model.length >= 2) out.push(model);
  if (brand && model) out.push(`${brand} ${model}`);
  if (name) {
    out.push(name);
    const tokens = name.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) out.push(tokens.slice(0, 5).join(" "));
  }
  if (brand && name) out.push(`${brand} ${name}`);
  return Array.from(new Set(out.map(compactQuery).filter((x) => x.length >= 2)));
}

function tokenize(v: string) {
  return normalizeLoose(v).split(/(?=[0-9])|(?<=[0-9])/).filter((x) => x.length >= 2);
}

function chooseItem(items: Item[], product: RakutenProduct | null, input: Product) {
  const expectedJan = cleanJan(input.jan);
  const expectedModel = normalizeLoose(product?.productNo || input.model);
  const expectedBrand = normalizeLoose(product?.brandName || input.brand);
  const expectedName = normalizeLoose(product?.productName || input.name);
  const nameTokens = tokenize(clean(product?.productName || input.name)).slice(0, 12);
  const modelTokens = tokenize(clean(product?.productNo || input.model)).slice(0, 8);

  const candidates = items.flatMap((item) => {
    if (isBadItem(item)) return [];
    const price = toPrice(item.itemPriceMin3) ?? toPrice(item.itemPriceMin2) ?? toPrice(item.itemPriceMin1) ?? toPrice(item.itemPrice);
    if (price == null) return [];

    const textRaw = clean(`${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""}`);
    const text = normalizeLoose(textRaw);
    const itemName = normalizeLoose(item.itemName);
    let score = 0;
    let identity = false;

    // Exact JAN is the strongest possible signal.
    if (expectedJan && textRaw.includes(expectedJan)) { score += 250; identity = true; }
    if (expectedModel && text.includes(expectedModel)) { score += 180; identity = true; }
    if (expectedBrand && text.includes(expectedBrand)) score += 30;

    const modelHits = modelTokens.filter((token) => text.includes(normalizeLoose(token))).length;
    const nameHits = nameTokens.filter((token) => text.includes(normalizeLoose(token))).length;
    score += modelHits * 35;
    score += nameHits * 8;

    // A product title match is useful even if punctuation/spacing differs.
    if (expectedName && (itemName.includes(expectedName) || expectedName.includes(itemName))) {
      score += 120;
      identity = true;
    }

    // Never select an arbitrary cheap listing just because the keyword search returned it.
    // Require at least one product-identity signal, except when the JAN itself was the query and the API result contains it.
    if (!identity) return [];
    return [{ item, price, score }];
  });

  if (!candidates.length) return null;
  // Highest confidence first; within the same confidence, choose the cheapest.
  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  const bestScore = candidates[0].score;
  const strong = candidates.filter((x) => x.score >= Math.max(100, bestScore - 20));
  return [...strong].sort((a, b) => a.price - b.price)[0] ?? null;
}

function failure(input: Product, diagnostics: Diagnostic[], started: number, error: string, extra: Record<string, unknown> = {}) {
  return {
    jan: input.jan, price: null, lowestPrice: null, rakutenLowestPrice: null,
    productName: input.name || null, elapsedMs: Date.now() - started,
    debug: diagnostics, ...extra, error,
  };
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) {
    return NextResponse.json({ results: [], error: "楽天APIの環境変数が未設定です。" }, { status: 503 });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ results: [], error: "JSONが不正です。" }, { status: 400 }); }

  const products: Product[] = (Array.isArray(body?.products) ? body.products : [])
    .map((p: any) => ({
      jan: cleanJan(p?.jan), name: clean(p?.name ?? p?.productName),
      brand: clean(p?.brand ?? p?.brandName ?? p?.makerName), model: clean(p?.model ?? p?.productNo),
    }))
    .filter((p) => p.jan.length === 13);
  const unique = Array.from(new Map(products.map((p) => [p.jan, p])).values()).slice(0, 5);
  if (!unique.length) return NextResponse.json({ results: [], error: "有効な13桁JANの商品がありません。" }, { status: 400 });

  const results: any[] = [];
  for (const input of unique) {
    const started = Date.now();
    const diagnostics: Diagnostic[] = [];
    try {
      // 1) Exact JAN -> product group. This is the authoritative identity lookup.
      const exact = await productByJan(appId, accessKey, input.jan);
      diagnostics.push(exact.diagnostic);
      if (exact.response.status === 429) {
        results.push(failure(input, diagnostics, started, "楽天APIがアクセス制限(429)を返しました。少し時間を置いて再検索してください。"));
        continue;
      }
      if (!exact.response.ok && exact.response.status >= 500) {
        results.push(failure(input, diagnostics, started, "楽天Product Search APIが一時的に利用できません。時間を置いて再検索してください。"));
        continue;
      }

      const resolved = exact.product;
      const resolvedName = clean(resolved?.productName) || input.name;
      const direct = directPrice(resolved);

      // 2) Product Search's product-group price is the cleanest answer and avoids guessing among shops.
      if (exact.response.ok && direct.value != null) {
        results.push({
          jan: input.jan, price: direct.value, lowestPrice: direct.value, rakutenLowestPrice: direct.value,
          productName: resolvedName || null,
          itemUrl: resolved?.productUrlPC ?? resolved?.productUrlMobile ?? resolved?.searchUrl ?? null,
          shopName: null, source: "Rakuten Product Search / JAN exact",
          matchedBy: "JAN", candidateCount: resolved?.usedExcludeSalesItemCount ?? resolved?.salesItemCount ?? 0,
          elapsedMs: Date.now() - started, priceSource: direct.source, debug: diagnostics, error: null,
        });
        continue;
      }

      // 3) Fallback: Price2Alert-like keyword research against the actual Ichiba listings.
      let chosen: { item: Item; price: number; score: number } | null = null;
      let matchedBy = "";
      let candidateCount = 0;
      let rateLimited = false;

      for (const query of itemQueries(input, resolved).slice(0, 5)) {
        const searched = await itemSearch(appId, accessKey, query);
        diagnostics.push(searched.diagnostic);
        if (searched.response.status === 429) { rateLimited = true; break; }
        if (!searched.response.ok) continue;
        candidateCount += searched.items.length;
        const picked = chooseItem(searched.items, resolved, input);
        if (picked) {
          chosen = picked;
          matchedBy = query;
          break;
        }
      }

      if (rateLimited) {
        results.push(failure(input, diagnostics, started, "楽天APIがアクセス制限(429)を返しました。少し時間を置いて再検索してください。", { productName: resolvedName || null }));
        continue;
      }

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

      results.push({
        jan: input.jan, price: chosen.price, lowestPrice: chosen.price, rakutenLowestPrice: chosen.price,
        productName: clean(chosen.item.itemName) || resolvedName || null,
        itemUrl: chosen.item.itemUrl ?? null, shopName: chosen.item.shopName ?? null,
        source: "Rakuten Ichiba Item Search / keyword fallback", matchedBy,
        priceSource: chosen.item.itemPriceMin3 != null ? "itemPriceMin3" : chosen.item.itemPriceMin2 != null ? "itemPriceMin2" : "itemPrice",
        candidateCount, elapsedMs: Date.now() - started, debug: diagnostics, error: null,
      });
    } catch (error: any) {
      results.push(failure(input, diagnostics, started,
        error?.name === "AbortError" ? "楽天APIの応答がタイムアウトしました。" : error?.message || "楽天APIへの接続に失敗しました。"));
    }
  }

  return NextResponse.json({ results });
}
