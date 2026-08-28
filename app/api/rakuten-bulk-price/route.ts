import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type DebugEntry = { api: string; query?: string; status?: number; count?: number; price?: number | null; message?: string };
type RakutenItem = { itemName?: string; catchcopy?: string; itemPrice?: number | string; itemPriceMin3?: number | string; itemUrl?: string; shopName?: string; itemCode?: string; availability?: number };

const ICHIBA_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const normalize = (v: unknown) => cleanText(v).normalize("NFKC").toLowerCase().replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();
const compact = (v: unknown) => normalize(v).replace(/\s+/g, "");
const priceOf = (v: unknown) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

// Reject only obvious used/damaged listings. Do NOT inspect itemCaption: new-product
// descriptions can legitimately contain words such as parts/replacement.
const EXCLUDED = ["中古", "中古品", "ユーズド", "used", "ジャンク", "ジャンク品", "開封済み", "開封済", "開封品", "箱なし", "箱無", "欠品", "訳あり", "アウトレット", "展示品", "リファービッシュ", "再生品", "難あり", "現状品", "動作未確認"];

function itemsOf(data: any): RakutenItem[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function excluded(item: RakutenItem) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""}`).toLowerCase();
  return EXCLUDED.some((w) => text.includes(w.toLowerCase()));
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json", accessKey } });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
    const items = itemsOf(data);
    debug.push({ api: "IchibaItemSearch", query: keyword, status: response.status, count: Number(data?.count ?? items.length), message: response.ok ? undefined : (data?.error_description || data?.error || text.slice(0, 300)) });
    return response.ok ? items : [];
  } finally { clearTimeout(timer); }
}

function searchChunks(text: string) {
  const stop = new Set(["bandai", "spirits", "takara", "tomy", "bandaisspirits", "mg", "hg", "rg", "pg", "dx", "ver", "version", "新品", "国内正規品", "送料無料", "おもちゃ", "玩具", "セット", "1", "100", "144", "150", "200", "300", "500", "600", "scale", "スケール"]);
  const chunks = Array.from(new Set(cleanText(text).normalize("NFKC").split(/[\s　()（）【】［］\[\],，。!！?？/／:：・+]+/).map((x) => x.trim()).filter((x) => x.length >= 2 && !stop.has(x.toLowerCase()))));
  return chunks.sort((a, b) => b.length - a.length);
}

function buildQueries(p: Product) {
  const chunks = searchChunks(`${p.name} ${p.brand} ${p.model}`);
  const out: string[] = [];
  if (p.model && p.model.trim().length >= 2) out.push(cleanText(p.model));
  if (chunks.length >= 2) out.push(`${chunks[0]} ${chunks[1]}`);
  if (chunks.length >= 3) out.push(`${chunks[0]} ${chunks[2]}`);
  if (chunks.length >= 1) out.push(chunks[0]);
  return Array.from(new Set(out.map((q) => cleanText(q).slice(0, 128)))).slice(0, 3);
}

function choose(items: RakutenItem[], p: Product) {
  const jan = cleanJan(p.jan);
  const chunks = searchChunks(`${p.name} ${p.brand} ${p.model}`).map(compact).filter((x) => x.length >= 3);
  const model = compact(p.model);
  const candidates: Array<{ item: RakutenItem; price: number; score: number }> = [];

  for (const item of items) {
    if (!item || excluded(item) || Number(item.availability ?? 1) !== 1) continue;
    const price = priceOf(item.itemPriceMin3) ?? priceOf(item.itemPrice);
    if (price == null) continue;
    const title = cleanText(`${item.itemName ?? ""} ${item.catchcopy ?? ""}`);
    const norm = compact(title);
    const digits = title.replace(/\D/g, "");
    const hasJan = jan.length === 13 && (digits.includes(jan) || compact(item.itemCode).includes(jan));
    const hasModel = model.length >= 3 && norm.includes(model);
    const overlap = chunks.filter((c) => norm.includes(c)).length;
    if (!hasJan && !hasModel && overlap === 0) continue;
    let score = Math.min(overlap, 6) * 100;
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
      // IMPORTANT: Product/Search is no longer used for price. Rakuten changed
      // its aggregate price fields to null/empty on 2026-03-25.
      let allItems: RakutenItem[] = [];
      const seenCodes = new Set<string>();
      const searchTerms = [p.jan, ...buildQueries(p)];
      let chosen: { item: RakutenItem; price: number; score: number } | null = null;
      let source = "";

      for (const q of searchTerms) {
        const items = await ichibaSearch(appId, accessKey, q, debug);
        for (const item of items) {
          const key = String(item.itemCode ?? `${item.itemName ?? ""}|${item.itemPrice ?? ""}`);
          if (!seenCodes.has(key)) { seenCodes.add(key); allItems.push(item); }
        }
        chosen = choose(allItems, p);
        if (chosen) { source = `IchibaItemSearch:${q}`; break; }
      }

      if (chosen) {
        results.push({ jan: p.jan, price: chosen.price, productName: chosen.item.itemName ?? p.name, itemUrl: chosen.item.itemUrl ?? null, shopName: chosen.item.shopName ?? null, source, matchedBy: source.endsWith(p.jan) ? "JAN" : "商品名/型番", elapsedMs: Date.now() - started, debug, error: null });
      } else {
        results.push({ jan: p.jan, price: null, productName: p.name, elapsedMs: Date.now() - started, debug, error: debug.some((d) => d.status === 429) ? "楽天APIのリクエスト制限（429）です。少し時間を置いて再試行してください。" : debug.some((d) => d.status && d.status >= 400) ? `楽天APIエラー：${debug.filter((d) => d.message).map((d) => `${d.status} ${d.message}`).join(" / ")}` : "楽天市場から新品として採用できる商品を取得できませんでした。" });
      }
    } catch (error: any) {
      results.push({ jan: p.jan, price: null, elapsedMs: Date.now() - started, debug, error: error?.name === "AbortError" ? "楽天APIが10秒以内に応答しませんでした。" : error?.message || "楽天APIへの接続に失敗しました。" });
    }
  }
  return NextResponse.json({ results });
}
