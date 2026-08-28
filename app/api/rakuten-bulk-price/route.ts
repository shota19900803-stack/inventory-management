import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type DebugEntry = { api: string; query?: string; status?: number; count?: number; price?: number | null; message?: string };
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

type RakutenProduct = { productCode?: string; productName?: string | null; productNo?: string | null; brandName?: string | null; productUrlPC?: string | null; searchUrl?: string | null };

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
  "中古", "中古品", "ユーズド", "used", "ジャンク", "ジャンク品", "開封済み", "開封済", "開封品",
  "箱なし", "箱無", "欠品", "訳あり", "アウトレット", "展示品", "リファービッシュ", "再生品", "難あり",
  "現状品", "動作未確認", "部品取り", "返品不可", "難あり品"
];

function itemsOf(data: any): RakutenItem[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function productItemsOf(data: any): RakutenProduct[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x?.product ?? x).filter(Boolean);
}

function excluded(item: RakutenItem) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCaption ?? ""}`).toLowerCase();
  return EXCLUDED.some((w) => text.includes(w.toLowerCase()));
}

async function requestJson(url: URL, accessKey: string, debug: DebugEntry, api: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
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
    debug.api = api;
    debug.status = response.status;
    debug.message = response.ok ? undefined : (data?.error_description || data?.error || text.slice(0, 300));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

async function productSearchByJan(appId: string, accessKey: string, jan: string, debug: DebugEntry[]) {
  const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);

  const d: DebugEntry = { api: "ProductSearch(JAN)", query: jan };
  const { response, data } = await requestJson(url, accessKey, d, "ProductSearch(JAN)");
  const products = productItemsOf(data);
  d.count = Number(data?.count ?? products.length);
  debug.push(d);
  return response.ok ? products[0] ?? null : null;
}

async function ichibaSearch(appId: string, accessKey: string, keyword: string, debug: DebugEntry[]) {
  const url = new URL(ICHIBA_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "1");
  url.searchParams.set("orFlag", "0");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set("NGKeyword", EXCLUDED.slice(0, 8).join(" "));
  url.searchParams.set("elements", "itemName,catchcopy,itemCaption,itemPrice,itemPriceMin3,itemUrl,shopName,shopCode,itemCode,availability");

  const d: DebugEntry = { api: "IchibaItemSearch", query: keyword };
  const { response, data } = await requestJson(url, accessKey, d, "IchibaItemSearch");
  const items = itemsOf(data);
  d.count = Number(data?.count ?? items.length);
  debug.push(d);
  return response.ok ? items : [];
}

function significantTokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t))
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
}

function buildQueries(product: Product, resolved: RakutenProduct | null) {
  const name = cleanText(resolved?.productName || product.name);
  const model = cleanText(resolved?.productNo || product.model);
  const brand = cleanText(resolved?.brandName || product.brand);
  const tokens = significantTokens(name);
  const queries: string[] = [];

  // The Product Search API can still identify the product by JAN, but its
  // price/brand/model aggregate fields are no longer reliable. Use it only
  // as metadata and make the actual market-price lookup keyword based.
  if (model && model.length >= 3) queries.push(model);
  if (brand && model && !queries.includes(`${brand} ${model}`)) queries.push(`${brand} ${model}`);
  if (tokens.length >= 2) queries.push(tokens.slice(0, 2).join(" "));
  if (tokens.length >= 3) queries.push(tokens.slice(0, 3).join(" "));
  if (brand && tokens.length >= 2) queries.push(`${brand} ${tokens.slice(0, 2).join(" ")}`);

  return Array.from(new Set(queries.map(cleanText).filter((q) => q.length >= 2))).slice(0, 4);
}

function candidateItems(items: RakutenItem[]) {
  return items
    .filter((item) => Number(item.availability ?? 1) === 1)
    .filter((item) => !excluded(item))
    .map((item) => {
      const price = priceOf(item.itemPrice) ?? priceOf(item.itemPriceMin3);
      return price == null ? null : { item, price };
    })
    .filter(Boolean) as Array<{ item: RakutenItem; price: number }>;
}

function scoreCandidate(item: RakutenItem, product: Product, resolved: RakutenProduct | null, query: string) {
  const title = cleanText(`${item.itemName ?? ""} ${item.catchcopy ?? ""}`);
  const norm = compact(title);
  const nameTokens = significantTokens(cleanText(resolved?.productName || product.name));
  const queryTokens = significantTokens(query);
  const model = compact(resolved?.productNo || product.model);
  const brand = compact(resolved?.brandName || product.brand);
  const digits = title.replace(/\D/g, "");
  const jan = cleanJan(product.jan);

  const hasJan = jan.length === 13 && digits.includes(jan);
  const hasModel = model.length >= 3 && norm.includes(model);
  const hasBrand = brand.length >= 2 && norm.includes(brand);
  const queryHits = queryTokens.filter((t) => norm.includes(compact(t))).length;
  const nameHits = nameTokens.filter((t) => norm.includes(compact(t))).length;

  let score = 0;
  if (hasJan) score += 100000;
  if (hasModel) score += 50000;
  if (hasBrand) score += 1000;
  score += queryHits * 300;
  score += nameHits * 120;

  return { score, hasJan, hasModel, hasBrand, queryHits, nameHits };
}

function chooseBest(candidates: Array<{ item: RakutenItem; price: number }>, product: Product, resolved: RakutenProduct | null, query: string) {
  if (!candidates.length) return null;
  const scored = candidates.map((x) => ({ ...x, match: scoreCandidate(x.item, product, resolved, query) }));

  // A keyword search is already a constrained search in Rakuten. For a strong
  // model/JAN match, price is the deciding factor. For broad name searches,
  // require enough textual overlap before allowing the price to decide.
  const strong = scored.filter((x) => x.match.hasJan || x.match.hasModel || x.match.queryHits >= 2 || x.match.nameHits >= 2);
  const pool = strong.length ? strong : scored.filter((x) => x.match.queryHits >= 1 || x.match.nameHits >= 1);
  if (!pool.length) return null;
  pool.sort((a, b) => b.match.score - a.match.score || a.price - b.price);

  // Among candidates with comparable confidence, use the actual lowest price.
  const bestScore = pool[0].match.score;
  const comparable = pool.filter((x) => x.match.score >= Math.max(300, bestScore - 600));
  comparable.sort((a, b) => a.price - b.price);
  return comparable[0] ?? pool[0] ?? null;
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
    .map((p: any) => ({ jan: cleanJan(p?.jan), name: cleanText(p?.name), brand: cleanText(p?.brand), model: cleanText(p?.model) }))
    .filter((p) => p.jan.length === 13);
  const unique = Array.from(new Map(products.map((p) => [p.jan, p])).values()).slice(0, 5);
  if (!unique.length) return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });

  const results: any[] = [];

  for (const p of unique) {
    const debug: DebugEntry[] = [];
    const started = Date.now();
    try {
      const resolved = await productSearchByJan(appId, accessKey, p.jan, debug);
      const queries = buildQueries(p, resolved);
      const allCandidates = new Map<string, { item: RakutenItem; price: number; query: string }>();

      for (const q of queries) {
        const items = await ichibaSearch(appId, accessKey, q, debug);
        for (const candidate of candidateItems(items)) {
          const key = candidate.item.itemUrl || `${candidate.item.shopCode ?? ""}:${candidate.item.itemCode ?? ""}` || `${candidate.item.itemName}:${candidate.price}`;
          if (!allCandidates.has(key)) allCandidates.set(key, { ...candidate, query: q });
        }
        // Small pause avoids hammering the same API in a tight loop when a
        // single product needs multiple keyword variants.
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      const ranked = Array.from(allCandidates.values()).map((x) => ({
        ...x,
        match: scoreCandidate(x.item, p, resolved, x.query),
      }));

      const strong = ranked.filter((x) => x.match.hasJan || x.match.hasModel || x.match.queryHits >= 2 || x.match.nameHits >= 2);
      const usable = (strong.length ? strong : ranked.filter((x) => x.match.queryHits >= 1 || x.match.nameHits >= 1));
      usable.sort((a, b) => a.price - b.price || b.match.score - a.match.score);

      const chosen = usable[0] ?? null;
      const topCandidates = usable.slice(0, 8).map((x) => ({
        price: x.price,
        itemName: x.item.itemName ?? null,
        itemUrl: x.item.itemUrl ?? null,
        shopName: x.item.shopName ?? null,
        query: x.query,
        score: x.match.score,
      }));

      if (chosen) {
        results.push({
          jan: p.jan,
          price: chosen.price,
          productName: chosen.item.itemName ?? resolved?.productName ?? p.name,
          itemUrl: chosen.item.itemUrl ?? resolved?.productUrlPC ?? null,
          shopName: chosen.item.shopName ?? null,
          source: "IchibaItemSearch:keyword-research",
          matchedBy: chosen.match.hasJan ? "JAN" : chosen.match.hasModel ? "型番" : "商品名キーワード",
          elapsedMs: Date.now() - started,
          candidateCount: usable.length,
          candidates: topCandidates,
          debug,
          error: null,
        });
      } else {
        const apiErrors = debug.filter((d) => d.message).map((d) => `${d.api} ${d.status ?? "?"}: ${d.message}`).join(" / ");
        results.push({
          jan: p.jan,
          price: null,
          productName: resolved?.productName ?? p.name,
          elapsedMs: Date.now() - started,
          candidateCount: ranked.length,
          candidates: topCandidates,
          debug,
          error: apiErrors || "楽天市場の商品候補を取得できませんでした。検索キーワードを確認してください。",
        });
      }
    } catch (error: any) {
      results.push({
        jan: p.jan,
        price: null,
        productName: p.name,
        elapsedMs: Date.now() - started,
        debug,
        error: error?.name === "AbortError" ? "楽天APIが10秒以内に応答しませんでした。" : error?.message || "楽天APIへの接続に失敗しました。",
      });
    }
  }

  return NextResponse.json({ results });
}
