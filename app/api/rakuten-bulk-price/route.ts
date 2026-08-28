import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type DebugEntry = {
  api: string;
  query?: string;
  status?: number;
  count?: number;
  message?: string;
  attempts?: number;
  returned?: number;
  available?: number;
  excluded?: number;
  priced?: number;
  sample?: Array<{ name: string; price: number | null; url: string | null; shop: string | null }>;
};
type RakutenItem = {
  itemName?: string;
  catchcopy?: string;
  itemCaption?: string;
  itemPrice?: number | string;
  itemPriceMin3?: number | string;
  itemUrl?: string;
  shopName?: string;
  shopCode?: string;
  itemCode?: string;
  availability?: number | string;
};
type ProductHit = {
  productCode?: string;
  productName?: string;
  productNo?: string;
  brandName?: string;
  makerName?: string;
  productUrlPC?: string;
  salesMinPrice?: number | string;
  usedExcludeSalesMinPrice?: number | string;
};

const ICHIBA_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const PRODUCT_API = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const normalize = (v: unknown) => cleanText(v).normalize("NFKC").toLowerCase().replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();
const compact = (v: unknown) => normalize(v).replace(/\s+/g, "");

const priceOf = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const EXCLUDED = [
  "中古", "中古品", "ユーズド", "used", "ジャンク", "ジャンク品",
  "開封済み", "開封済", "開封品", "箱なし", "箱無", "欠品", "訳あり",
  "アウトレット", "展示品", "リファービッシュ", "再生品", "難あり",
  "現状品", "動作未確認", "部品取り", "故障品"
];

function itemsOf(data: any): RakutenItem[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function productHitsOf(data: any): ProductHit[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.product ?? x?.item ?? x).filter(Boolean);
}

function isExcluded(item: RakutenItem) {
  const text = cleanText(`${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""}`).toLowerCase();
  return EXCLUDED.some((w) => text.includes(w.toLowerCase()));
}

function significantTokens(value: string) {
  const normalized = normalize(value);
  const spaced = normalized.split(" ").filter(Boolean);
  const tokens = spaced.length > 1
    ? spaced
    : (normalized.match(/[a-z0-9]+|[ぁ-んァ-ヶ一-龠]{2,}/g) ?? []);

  return Array.from(new Set(tokens))
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 10);
}

function candidateItems(items: RakutenItem[], debug: DebugEntry) {
  debug.returned = items.length;
  debug.available = items.filter((item) => Number(item.availability ?? 1) === 1).length;
  debug.excluded = items.filter((item) => Number(item.availability ?? 1) === 1 && isExcluded(item)).length;

  const priced = items
    .filter((item) => Number(item.availability ?? 1) === 1)
    .filter((item) => !isExcluded(item))
    .map((item) => {
      const price = priceOf(item.itemPriceMin3) ?? priceOf(item.itemPrice);
      return price == null ? null : { item, price };
    })
    .filter(Boolean) as Array<{ item: RakutenItem; price: number }>;

  debug.priced = priced.length;
  debug.sample = items.slice(0, 5).map((item) => ({
    name: cleanText(item.itemName ?? ""),
    price: priceOf(item.itemPriceMin3) ?? priceOf(item.itemPrice),
    url: item.itemUrl ?? null,
    shop: item.shopName ?? null,
  }));

  return priced;
}

function scoreCandidate(item: RakutenItem, product: Product, query: string, source: string) {
  const title = cleanText(`${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""}`);
  const norm = compact(title);
  const model = compact(product.model);
  const brand = compact(product.brand);
  const jan = cleanJan(product.jan);
  const titleDigits = title.replace(/\D/g, "");
  const queryTokens = significantTokens(query);
  const nameTokens = significantTokens(product.name);

  const hasJan = jan.length === 13 && titleDigits.includes(jan);
  const hasModel = model.length >= 3 && norm.includes(model);
  const hasBrand = brand.length >= 2 && norm.includes(brand);
  const queryHits = queryTokens.filter((t) => norm.includes(compact(t))).length;
  const nameHits = nameTokens.filter((t) => norm.includes(compact(t))).length;

  let score = 0;
  if (hasJan) score += 100000;
  if (hasModel) score += 50000;
  if (hasBrand) score += 2000;
  score += queryHits * 500;
  score += nameHits * 150;
  if (source === "JAN") score += 10000;
  if (source === "PRODUCT") score += 8000;

  return { score, hasJan, hasModel, hasBrand, queryHits, nameHits };
}

async function requestJson(url: URL, accessKey: string, debug: DebugEntry) {
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
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }

    debug.status = response.status;
    debug.attempts = 1;
    debug.message = response.ok ? undefined : (data?.error_description || data?.error || text.slice(0, 500));

    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

async function productSearchByJan(appId: string, accessKey: string, jan: string, debug: DebugEntry) {
  const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);
  url.searchParams.set("hits", "5");

  debug.api = "ProductSearch(JAN)";
  debug.query = jan;
  const { response, data } = await requestJson(url, accessKey, debug);
  const hits = productHitsOf(data);
  debug.count = Number(data?.count ?? hits.length);
  debug.returned = hits.length;
  debug.sample = hits.slice(0, 5).map((p) => ({
    name: cleanText(`${p.productName ?? ""} ${p.productNo ?? ""} ${p.brandName ?? ""}`),
    price: priceOf(p.salesMinPrice),
    url: p.productUrlPC ?? null,
    shop: p.makerName ?? p.brandName ?? null,
  }));
  return response.ok ? hits : [];
}

async function ichibaSearch(appId: string, accessKey: string, keyword: string, debug: DebugEntry, source = "KEYWORD") {
  const q = cleanText(keyword).slice(0, 128);
  if (!q) return [];

  const url = new URL(ICHIBA_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", q);
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "1");
  url.searchParams.set("orFlag", "0");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set("elements", "itemName,catchcopy,itemCaption,itemPrice,itemPriceMin3,itemUrl,shopName,shopCode,itemCode,availability");

  debug.api = source === "PRODUCT" ? "IchibaItemSearch(PRODUCT)" : "IchibaItemSearch(KEYWORD)";
  debug.query = q;
  const { response, data } = await requestJson(url, accessKey, debug);
  const items = itemsOf(data);
  debug.count = Number(data?.count ?? items.length);
  return response.ok ? items : [];
}

function buildQueries(product: Product, productHit?: ProductHit) {
  const queries: Array<{ q: string; source: string }> = [];
  const productName = cleanText(productHit?.productName);
  const productNo = cleanText(productHit?.productNo);
  const brand = cleanText(productHit?.brandName || productHit?.makerName || product.brand);
  const name = productName || product.name;
  const model = productNo || product.model;

  if (product.jan.length === 13) queries.push({ q: product.jan, source: "JAN" });
  if (model.length >= 3 && brand.length >= 2) queries.push({ q: `${brand} ${model}`, source: "PRODUCT" });
  if (model.length >= 3) queries.push({ q: model, source: "PRODUCT" });

  const tokens = significantTokens(name).filter((t) => !/^\d{8,13}$/.test(t));
  if (brand.length >= 2 && tokens.length) queries.push({ q: `${brand} ${tokens.slice(0, 4).join(" ")}`, source: "PRODUCT" });
  if (tokens.length) queries.push({ q: tokens.slice(0, 5).join(" "), source: "KEYWORD" });

  const seen = new Set<string>();
  return queries.filter((x) => {
    const key = `${x.source}:${cleanText(x.q)}`;
    if (!x.q || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) {
    return NextResponse.json({ error: "楽天APIの環境変数が未設定です。", results: [] }, { status: 503 });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 }); }

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
  if (!unique.length) return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });

  const results: any[] = [];

  for (const p of unique) {
    const debug: DebugEntry[] = [];
    const started = Date.now();
    try {
      const productDebug: DebugEntry = { api: "ProductSearch(JAN)", query: p.jan };
      const productHits = await productSearchByJan(appId, accessKey, p.jan, productDebug);
      debug.push(productDebug);

      const productHit = productHits[0];
      const resolved: Product = {
        jan: p.jan,
        name: cleanText(productHit?.productName) || p.name,
        brand: cleanText(productHit?.brandName || productHit?.makerName) || p.brand,
        model: cleanText(productHit?.productNo) || p.model,
      };

      const all = new Map<string, { item: RakutenItem; price: number; query: string; source: string }>();
      const queries = buildQueries(resolved, productHit);
      let rateLimited = false;

      for (const target of queries) {
        // A JAN is an identifier for Product Search, not a guaranteed searchable
        // field in every shop's Item Search title. Product Search resolves JAN ->
        // product name/model first; Item Search then finds the actual offers.
        if (target.source === "JAN") continue;

        const d: DebugEntry = { api: "IchibaItemSearch", query: target.q };
        const items = await ichibaSearch(appId, accessKey, target.q, d, target.source);
        debug.push(d);

        if (d.status === 429) {
          rateLimited = true;
          break;
        }

        const priced = candidateItems(items, d);
        for (const candidate of priced) {
          const key = candidate.item.itemUrl || `${candidate.item.shopCode ?? ""}:${candidate.item.itemCode ?? ""}` || `${candidate.item.itemName ?? ""}:${candidate.price}`;
          const existing = all.get(key);
          if (!existing || candidate.price < existing.price) {
            all.set(key, { item: candidate.item, price: candidate.price, query: target.q, source: target.source });
          }
        }

        // If a highly specific product-number query returned candidates, stop
        // early to avoid unnecessary API traffic. Otherwise continue to broaden.
        if (all.size > 0 && (target.source === "PRODUCT" || productHit)) break;
        await new Promise((resolve) => setTimeout(resolve, 900));
      }

      const ranked = Array.from(all.values()).map((x) => ({
        ...x,
        match: scoreCandidate(x.item, resolved, x.query, x.source),
      }));

      const strong = ranked.filter((x) =>
        x.match.hasJan || x.match.hasModel || x.match.queryHits >= 2 || x.match.nameHits >= 2 || x.source === "PRODUCT"
      );
      const usable = (strong.length ? strong : ranked.filter((x) => x.match.queryHits >= 1 || x.match.nameHits >= 1));
      usable.sort((a, b) => a.price - b.price || b.match.score - a.match.score);

      const chosen = usable[0] ?? null;
      const topCandidates = usable.slice(0, 10).map((x) => ({
        price: x.price,
        itemName: x.item.itemName ?? null,
        itemUrl: x.item.itemUrl ?? null,
        shopName: x.item.shopName ?? null,
        query: x.query,
        score: x.match.score,
        matchedBy: x.match.hasJan ? "JAN" : x.match.hasModel ? "型番" : x.source === "PRODUCT" ? "楽天製品情報" : "商品名キーワード",
      }));

      if (chosen) {
        results.push({
          jan: p.jan,
          price: chosen.price,
          productName: chosen.item.itemName ?? resolved.name,
          itemUrl: chosen.item.itemUrl ?? null,
          shopName: chosen.item.shopName ?? null,
          source: "Rakuten Ichiba Item Search",
          matchedBy: chosen.match.hasJan ? "JAN" : chosen.match.hasModel ? "型番" : chosen.source === "PRODUCT" ? "楽天製品情報" : "商品名キーワード",
          candidateCount: usable.length,
          elapsedMs: Date.now() - started,
          candidates: topCandidates,
          debug,
          error: null,
        });
      } else {
        const apiErrors = debug.filter((d) => d.message).map((d) => `${d.api} ${d.status ?? "?"}: ${d.message}`).join(" / ");
        const diagnostic = rateLimited
          ? "楽天APIがアクセス制限(429)を返しました。追加検索は停止しています。"
          : apiErrors || `楽天市場の商品候補を特定できませんでした。楽天製品検索=${productHit ? "成功" : "0件"} / 検索=${queries.map((x) => x.q).join(" / ") || "なし"}`;
        results.push({
          jan: p.jan,
          price: null,
          productName: resolved.name,
          candidateCount: ranked.length,
          elapsedMs: Date.now() - started,
          resolvedProduct: productHit ? {
            productName: productHit.productName ?? null,
            productNo: productHit.productNo ?? null,
            brandName: productHit.brandName ?? null,
            makerName: productHit.makerName ?? null,
            productUrlPC: productHit.productUrlPC ?? null,
          } : null,
          candidates: topCandidates,
          debug,
          error: diagnostic,
        });
      }
    } catch (error: any) {
      results.push({
        jan: p.jan,
        price: null,
        productName: p.name,
        elapsedMs: Date.now() - started,
        debug,
        error: error?.name === "AbortError" ? "楽天APIが12秒以内に応答しませんでした。" : error?.message || "楽天APIへの接続に失敗しました。",
      });
    }
  }

  return NextResponse.json({ results });
}
