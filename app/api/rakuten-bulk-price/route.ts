import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type DebugEntry = {
  api: string;
  query?: string;
  status?: number;
  count?: number;
  message?: string;
  attempts?: number;
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

const ICHIBA_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const normalize = (v: unknown) => cleanText(v).normalize("NFKC").toLowerCase().replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();
const compact = (v: unknown) => normalize(v).replace(/\s+/g, "");

const priceOf = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// These are filtered locally instead of being sent as Rakuten NGKeyword.
// NGKeyword can hide legitimate listings before we can inspect them.
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

function isExcluded(item: RakutenItem) {
  const text = cleanText(`${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""}`).toLowerCase();
  return EXCLUDED.some((w) => text.includes(w.toLowerCase()));
}

function significantTokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t))
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
}

function candidateItems(items: RakutenItem[]) {
  return items
    .filter((item) => Number(item.availability ?? 1) === 1)
    .filter((item) => !isExcluded(item))
    .map((item) => {
      const price = priceOf(item.itemPriceMin3) ?? priceOf(item.itemPrice);
      return price == null ? null : { item, price };
    })
    .filter(Boolean) as Array<{ item: RakutenItem; price: number }>;
}

function scoreCandidate(item: RakutenItem, product: Product, query: string, janSearch: boolean) {
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
  // A result returned by an exact JAN query is already highly informative.
  // Keep it above weak text-only matches, while still preferring explicit JAN/model hits.
  if (janSearch) score += 10000;

  return { score, hasJan, hasModel, hasBrand, queryHits, nameHits };
}

async function requestJson(url: URL, accessKey: string, debug: DebugEntry) {
  let lastResponse: Response | null = null;
  let lastData: any = {};

  for (let attempt = 1; attempt <= 2; attempt += 1) {
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

      lastResponse = response;
      lastData = data;
      debug.status = response.status;
      debug.attempts = attempt;
      debug.message = response.ok ? undefined : (data?.error_description || data?.error || text.slice(0, 300));

      // Rakuten documents 429 for request-limit excess. Give it one quiet retry.
      if (response.status === 429 && attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }
      return { response, data };
    } finally {
      clearTimeout(timer);
    }
  }

  return { response: lastResponse as Response, data: lastData };
}

async function ichibaSearch(appId: string, accessKey: string, keyword: string, debug: DebugEntry, janSearch = false) {
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
  // Restricted search is better for an exact JAN/model lookup. Broad search is used
  // only for the final product-name fallback.
  url.searchParams.set("field", janSearch ? "1" : "0");
  url.searchParams.set("orFlag", "0");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set("elements", "itemName,catchcopy,itemCaption,itemPrice,itemPriceMin3,itemUrl,shopName,shopCode,itemCode,availability");

  debug.api = janSearch ? "IchibaItemSearch(JAN)" : "IchibaItemSearch(keyword)";
  debug.query = q;
  const { response, data } = await requestJson(url, accessKey, debug);
  debug.count = Number(data?.count ?? itemsOf(data).length);
  return response?.ok ? itemsOf(data) : [];
}

function buildQueries(product: Product) {
  const queries: Array<{ q: string; jan: boolean }> = [];
  if (product.jan.length === 13) queries.push({ q: product.jan, jan: true });
  if (product.model.length >= 3) {
    queries.push({ q: product.brand ? `${product.brand} ${product.model}` : product.model, jan: false });
    queries.push({ q: product.model, jan: false });
  }
  if (product.name.length >= 2) queries.push({ q: product.name.slice(0, 128), jan: false });

  const seen = new Set<string>();
  return queries.filter((x) => {
    const key = `${x.jan ? "JAN" : "TEXT"}:${cleanText(x.q)}`;
    if (!x.q || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
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
      const all = new Map<string, { item: RakutenItem; price: number; query: string; janSearch: boolean }>();
      const queries = buildQueries(p);

      for (const target of queries) {
        const d: DebugEntry = { api: target.jan ? "IchibaItemSearch(JAN)" : "IchibaItemSearch(keyword)", query: target.q };
        const items = await ichibaSearch(appId, accessKey, target.q, d, target.jan);
        debug.push(d);

        for (const candidate of candidateItems(items)) {
          const key = candidate.item.itemUrl || `${candidate.item.shopCode ?? ""}:${candidate.item.itemCode ?? ""}` || `${candidate.item.itemName ?? ""}:${candidate.price}`;
          const existing = all.get(key);
          if (!existing || candidate.price < existing.price) {
            all.set(key, { ...candidate, query: target.q, janSearch: target.jan });
          }
        }

        // Stop after a successful JAN lookup. This is the critical change:
        // do not hammer Rakuten with unnecessary fallback searches.
        if (target.jan && all.size > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const ranked = Array.from(all.values()).map((x) => ({
        ...x,
        match: scoreCandidate(x.item, p, x.query, x.janSearch),
      }));

      const strong = ranked.filter((x) =>
        x.janSearch || x.match.hasJan || x.match.hasModel || x.match.queryHits >= 2 || x.match.nameHits >= 2
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
        matchedBy: x.match.hasJan ? "JAN" : x.match.hasModel ? "型番" : x.janSearch ? "JAN検索" : "商品名キーワード",
      }));

      if (chosen) {
        results.push({
          jan: p.jan,
          price: chosen.price,
          productName: chosen.item.itemName ?? p.name,
          itemUrl: chosen.item.itemUrl ?? null,
          shopName: chosen.item.shopName ?? null,
          source: "Rakuten Ichiba Item Search",
          matchedBy: chosen.match.hasJan ? "JAN" : chosen.match.hasModel ? "型番" : chosen.janSearch ? "JAN検索" : "商品名キーワード",
          candidateCount: usable.length,
          elapsedMs: Date.now() - started,
          candidates: topCandidates,
          debug,
          error: null,
        });
      } else {
        const apiErrors = debug.filter((d) => d.message).map((d) => `${d.api} ${d.status ?? "?"}: ${d.message}`).join(" / ");
        results.push({
          jan: p.jan,
          price: null,
          productName: p.name,
          candidateCount: ranked.length,
          elapsedMs: Date.now() - started,
          candidates: topCandidates,
          debug,
          error: apiErrors || `楽天候補0件：${queries.map((x) => x.q).join(" / ") || "検索条件なし"}`,
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
