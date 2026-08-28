import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type DebugEntry = { api: string; query?: string; status?: number; count?: number; price?: number | null; message?: string };
type RakutenItem = { itemName?: string; catchcopy?: string; itemPrice?: number | string; itemPriceMin3?: number | string; itemUrl?: string; shopName?: string; itemCode?: string; availability?: number | string };
type RakutenProduct = { productCode?: string; productName?: string; productNo?: string; brandName?: string };

const ICHIBA_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const PRODUCT_API = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const normalize = (v: unknown) => cleanText(v).normalize("NFKC").toLowerCase().replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();
const compact = (v: unknown) => normalize(v).replace(/\s+/g, "");
const priceOf = (v: unknown) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

// Only reject listings that are explicitly sold as used/damaged. Do not inspect
// itemCaption because legitimate new products often mention parts/replacements.
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
  url.searchParams.set("formatVersion", "1");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);
  url.searchParams.set("hits", "1");
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

function searchChunks(text: string) {
  const stop = new Set(["bandai", "spirits", "takara", "tomy", "bandaisspirits", "mg", "hg", "rg", "pg", "dx", "ver", "version", "新品", "国内正規品", "送料無料", "おもちゃ", "玩具", "セット", "scale", "スケール"]);
  const chunks = Array.from(new Set(cleanText(text).normalize("NFKC").split(/[\s　()（）【】［］\[\],，。!！?？/／:：・+]+/).map((x) => x.trim()).filter((x) => x.length >= 2 && !stop.has(x.toLowerCase()))));
  return chunks.sort((a, b) => b.length - a.length);
}

function buildQueries(p: Product, resolved?: RakutenProduct | null) {
  const exactModel = cleanText(resolved?.productNo || p.model);
  const exactName = cleanText(resolved?.productName || p.name);
  const brand = cleanText(resolved?.brandName || p.brand);
  const chunks = searchChunks(`${exactName} ${brand} ${exactModel}`);
  const out: string[] = [];
  if (exactModel.length >= 2) out.push(exactModel);
  if (chunks.length >= 2) out.push(`${chunks[0]} ${chunks[1]}`);
  if (chunks.length >= 3) out.push(`${chunks[0]} ${chunks[2]}`);
  if (chunks.length >= 1) out.push(chunks[0]);
  return Array.from(new Set(out.map((q) => cleanText(q).slice(0, 128)))).slice(0, 4);
}

function choose(items: RakutenItem[], p: Product, resolved?: RakutenProduct | null) {
  const jan = cleanJan(p.jan);
  const model = compact(resolved?.productNo || p.model);
  const referenceName = resolved?.productName || p.name;
  const chunks = searchChunks(`${referenceName} ${resolved?.brandName || p.brand} ${model}`).map(compact).filter((x) => x.length >= 3);
  const candidates: Array<{ item: RakutenItem; price: number; score: number }> = [];

  for (const item of items) {
    if (!item || excluded(item) || Number(item.availability ?? 1) !== 1) continue;
    const price = priceOf(item.itemPriceMin3) ?? priceOf(item.itemPrice);
    if (price == null) continue;
    const title = cleanText(`${item.itemName ?? ""} ${item.catchcopy ?? ""}`);
    const norm = compact(title);
    const digits = title.replace(/\D/g, "");
    const itemCode = compact(item.itemCode);
    const hasJan = jan.length === 13 && (digits.includes(jan) || itemCode.includes(jan));
    const hasModel = model.length >= 3 && norm.includes(model);
    const overlap = chunks.filter((c) => norm.includes(c)).length;
    if (!hasJan && !hasModel && overlap === 0) continue;
    let score = Math.min(overlap, 8) * 100;
    if (hasModel) score += 5000;
    if (hasJan) score += 100000;
    candidates.push({ item, price, score });
  }
  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  return candidates[0] ?? null;
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
      // JAN is a Product Search parameter, not an Ichiba Item Search keyword.
      // Resolve the official product name/model first, then search selling items.
      const resolved = await productSearchByJan(appId, accessKey, p.jan, debug);
      const searchTerms = buildQueries(p, resolved);
      const allItems: RakutenItem[] = [];
      const seenCodes = new Set<string>();
      let chosen: { item: RakutenItem; price: number; score: number } | null = null;
      let source = "";

      for (const q of searchTerms) {
        const items = await ichibaSearch(appId, accessKey, q, debug);
        for (const item of items) {
          const key = String(item.itemCode ?? `${item.itemName ?? ""}|${item.itemPrice ?? ""}`);
          if (!seenCodes.has(key)) { seenCodes.add(key); allItems.push(item); }
        }
        chosen = choose(allItems, p, resolved);
        if (chosen) { source = `IchibaItemSearch:${q}`; break; }
      }

      if (chosen) {
        results.push({ jan: p.jan, price: chosen.price, productName: chosen.item.itemName ?? resolved?.productName ?? p.name, itemUrl: chosen.item.itemUrl ?? null, shopName: chosen.item.shopName ?? null, source, matchedBy: compact(resolved?.productNo || p.model).length >= 3 && compact(chosen.item.itemName).includes(compact(resolved?.productNo || p.model)) ? "型番" : "商品名", elapsedMs: Date.now() - started, debug, error: null });
      } else {
        results.push({ jan: p.jan, price: null, productName: resolved?.productName ?? p.name, elapsedMs: Date.now() - started, debug, error: debug.some((d) => d.status === 429) ? "楽天APIのリクエスト制限（429）です。少し時間を置いて再試行してください。" : debug.some((d) => d.status && d.status >= 400) ? `楽天APIエラー：${debug.filter((d) => d.message).map((d) => `${d.status} ${d.message}`).join(" / ")}` : "楽天市場から新品として採用できる商品を取得できませんでした。" });
      }
    } catch (error: any) {
      results.push({ jan: p.jan, price: null, productName: p.name, elapsedMs: Date.now() - started, debug, error: error?.name === "AbortError" ? "楽天APIが10秒以内に応答しませんでした。" : error?.message || "楽天APIへの接続に失敗しました。" });
    }
  }
  return NextResponse.json({ results });
}
