import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type DebugEntry = { api: string; query?: string; status?: number; count?: number; price?: number | null; message?: string };
type RakutenItem = { itemName?: string; catchcopy?: string; itemPrice?: number | string; itemPriceMin3?: number | string; itemUrl?: string; shopName?: string; itemCode?: string; availability?: number | string };
type RakutenProduct = { productCode?: string; productName?: string; productNo?: string; brandName?: string; productUrlPC?: string; salesMinPrice?: number | string | null; usedExcludeSalesMinPrice?: number | string | null; usedExcludeSalesItemCount?: number | string | null };

const ICHIBA_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const PRODUCT_API = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const normalize = (v: unknown) => cleanText(v).normalize("NFKC").toLowerCase().replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();
const compact = (v: unknown) => normalize(v).replace(/\s+/g, "");
const priceOf = (v: unknown) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

const EXCLUDED = ["中古", "中古品", "ユーズド", "used", "ジャンク", "ジャンク品", "開封済み", "開封済", "開封品", "箱なし", "箱無", "欠品", "訳あり", "アウトレット", "展示品", "リファービッシュ", "再生品", "難あり", "現状品", "動作未確認"];

function itemsOf(data: any): RakutenItem[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function productItemsOf(data: any): RakutenProduct[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x?.product ?? x).filter(Boolean);
}

function excluded(item: RakutenItem) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""}`).toLowerCase();
  return EXCLUDED.some((w) => text.includes(w.toLowerCase()));
}

async function requestJson(url: URL, accessKey: string, debug: DebugEntry, api: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json", accessKey } });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
    debug.api = api;
    debug.status = response.status;
    debug.message = response.ok ? undefined : (data?.error_description || data?.error || text.slice(0, 300));
    return { response, data };
  } finally { clearTimeout(timer); }
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
  d.price = products[0] ? (priceOf(products[0].usedExcludeSalesMinPrice) ?? priceOf(products[0].salesMinPrice)) : null;
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
  url.searchParams.set("field", "0");
  url.searchParams.set("orFlag", "0");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set("elements", "itemName,catchcopy,itemPrice,itemPriceMin3,itemUrl,shopName,itemCode,availability");

  const d: DebugEntry = { api: "IchibaItemSearch", query: keyword };
  const { response, data } = await requestJson(url, accessKey, d, "IchibaItemSearch");
  const items = itemsOf(data);
  d.count = Number(data?.count ?? items.length);
  debug.push(d);
  return response.ok ? items : [];
}

function significantTokens(value: string) {
  return normalize(value).split(" ").filter((t) => t.length >= 2 && !/^\d+$/.test(t)).slice(0, 8);
}

function searchTerms(product: Product, resolved: RakutenProduct | null) {
  const name = cleanText(resolved?.productName || product.name);
  const model = cleanText(resolved?.productNo || product.model);
  const brand = cleanText(resolved?.brandName || product.brand);
  const out: string[] = [];
  if (product.jan) out.push(product.jan);
  if (model) out.push(model);
  if (name) out.push(name);
  const tokens = significantTokens(name);
  if (tokens.length >= 2) out.push(tokens.slice(0, 4).join(" "));
  if (brand && name) out.push(`${brand} ${tokens.slice(0, 4).join(" ")}`.trim());
  return Array.from(new Set(out.map(cleanText).filter((q) => q.length >= 2))).slice(0, 5);
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

function chooseLowestNew(items: RakutenItem[], product: Product, resolved: RakutenProduct | null, query: string) {
  const candidates = candidateItems(items);
  if (!candidates.length) return null;

  const jan = cleanJan(product.jan);
  const model = compact(resolved?.productNo || product.model);
  const reference = compact(resolved?.productName || product.name);
  const q = compact(query);
  const qTokens = significantTokens(query);

  const scored = candidates.map(({ item, price }) => {
    const title = cleanText(`${item.itemName ?? ""} ${item.catchcopy ?? ""}`);
    const norm = compact(title);
    const digits = title.replace(/\D/g, "");
    const code = compact(item.itemCode);
    const hasJan = jan.length === 13 && (digits.includes(jan) || code.includes(jan));
    const hasModel = model.length >= 3 && norm.includes(model);
    const hasFullName = reference.length >= 4 && norm.includes(reference);
    const tokenHits = qTokens.filter((t) => t.length >= 2 && norm.includes(compact(t))).length;
    const score = (hasJan ? 100000 : 0) + (hasModel ? 10000 : 0) + (hasFullName ? 5000 : 0) + tokenHits * 100;
    return { item, price, score, hasJan, hasModel, hasFullName, tokenHits };
  });

  // A JAN query is already the strongest identifier supplied to Rakuten's
  // keyword search. Rakuten itemCode is a shop-specific code, and JAN is not
  // guaranteed to appear in the returned title/code. Requiring the JAN to be
  // echoed back here was causing valid listings (including the test product)
  // to be discarded and reported as "not retrieved".
  if (q === compact(jan)) {
    scored.sort((a, b) => a.price - b.price);
    return scored[0] ?? null;
  }

  const confident = scored.filter((x) => x.hasJan || x.hasModel || x.hasFullName || x.tokenHits >= Math.min(3, Math.max(1, qTokens.length)));
  const pool = confident.length ? confident : scored;
  pool.sort((a, b) => b.score - a.score || a.price - b.price);
  return pool[0] ?? null;
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) return NextResponse.json({ error: "楽天APIの環境変数が未設定です。", results: [] }, { status: 503 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 }); }
  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw.map((p: any) => ({ jan: cleanJan(p?.jan), name: cleanText(p?.name), brand: cleanText(p?.brand), model: cleanText(p?.model) })).filter((p) => p.jan.length === 13);
  const unique = Array.from(new Map(products.map((p) => [p.jan, p])).values()).slice(0, 5);
  if (!unique.length) return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });

  const results: any[] = [];
  for (const p of unique) {
    const debug: DebugEntry[] = [];
    const started = Date.now();
    try {
      const resolved = await productSearchByJan(appId, accessKey, p.jan, debug);
      const aggregatedPrice = resolved ? priceOf(resolved.usedExcludeSalesMinPrice) : null;

      if (aggregatedPrice != null) {
        results.push({ jan: p.jan, price: aggregatedPrice, productName: resolved?.productName ?? p.name, itemUrl: resolved?.productUrlPC ?? null, shopName: null, source: "ProductSearch:usedExcludeSalesMinPrice", matchedBy: "JAN", elapsedMs: Date.now() - started, debug, error: null });
        continue;
      }

      let chosen: { item: RakutenItem; price: number } | null = null;
      let source = "";
      for (const q of searchTerms(p, resolved)) {
        const items = await ichibaSearch(appId, accessKey, q, debug);
        const current = chooseLowestNew(items, p, resolved, q);
        if (current) { chosen = current; source = `IchibaItemSearch:${q}`; break; }
      }

      if (chosen) {
        results.push({ jan: p.jan, price: chosen.price, productName: chosen.item.itemName ?? resolved?.productName ?? p.name, itemUrl: chosen.item.itemUrl ?? null, shopName: chosen.item.shopName ?? null, source, matchedBy: "楽天市場検索", elapsedMs: Date.now() - started, debug, error: null });
      } else {
        const apiErrors = debug.filter((d) => d.message).map((d) => `${d.api} ${d.status ?? "?"}: ${d.message}`).join(" / ");
        results.push({ jan: p.jan, price: null, productName: resolved?.productName ?? p.name, elapsedMs: Date.now() - started, debug, error: apiErrors || "楽天市場から新品として採用できる価格を取得できませんでした。" });
      }
    } catch (error: any) {
      results.push({ jan: p.jan, price: null, productName: p.name, elapsedMs: Date.now() - started, debug, error: error?.name === "AbortError" ? "楽天APIが10秒以内に応答しませんでした。" : error?.message || "楽天APIへの接続に失敗しました。" });
    }
  }

  return NextResponse.json({ results });
}
