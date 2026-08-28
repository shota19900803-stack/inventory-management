import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const normalize = (v: unknown) => cleanText(v).toLowerCase().replace(/[【】\[\]（）()「」『』<>＜＞]/g, " ").replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();

async function fetchJson(url: URL, accessKey: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    url.searchParams.set("accessKey", accessKey);
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function itemsOf(data: any): any[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function priceOf(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const EXCLUDED_WORDS = [
  "中古", "中古品", "ユーズド", "used", "ジャンク", "開封済み", "開封品",
  "箱なし", "箱無", "欠品", "訳あり", "アウトレット", "展示品", "リファービッシュ",
  "再生品", "部品", "パーツ", "難あり", "現状品",
];

function isExcluded(item: any) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCaption ?? ""}`).toLowerCase();
  return EXCLUDED_WORDS.some((word) => text.includes(word.toLowerCase()));
}

function chooseIchibaItem(items: any[], p: Product) {
  const jan = cleanJan(p.jan);
  const target = normalize(p.name);
  const model = normalize(p.model);
  const brand = normalize(p.brand);

  const candidates = items.map((item: any) => {
    if (!item || isExcluded(item)) return null;

    // itemPriceMin3 is the purchasable minimum price when available.
    const price = priceOf(item.itemPriceMin3) ?? priceOf(item.itemPrice);
    if (price == null) return null;

    const searchable = cleanText(`${item.itemName ?? ""} ${item.itemCaption ?? ""} ${item.itemCode ?? ""}`);
    const digits = searchable.replace(/\D/g, "");
    const name = normalize(item.itemName);
    const code = cleanText(item.itemCode);

    let score = 0;
    const hasJan = jan.length === 13 && (digits.includes(jan) || code.includes(jan));
    if (hasJan) score += 10000;
    if (model && name.includes(model)) score += 2500;
    if (model && code.toLowerCase().includes(model)) score += 1800;
    if (brand && name.includes(brand)) score += 700;
    if (target && name === target) score += 1000;
    if (target && name.includes(target)) score += 400;

    return { item, price, score, hasJan };
  }).filter(Boolean) as Array<{ item: any; price: number; score: number; hasJan: boolean }>;

  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  return candidates.find((x) => x.hasJan) ?? candidates[0] ?? null;
}

function apiError(data: any, status: number) {
  return data?.error_description || data?.error || `HTTP ${status}`;
}

async function ichibaSearch(appId: string, accessKey: string, keyword: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("hits", "30");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "1");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set("NGKeyword", EXCLUDED_WORDS.join(" "));
  url.searchParams.set(
    "elements",
    "itemName,catchcopy,itemPrice,itemPriceMin3,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode"
  );
  return fetchJson(url, accessKey);
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (!appId || !accessKey) {
    return NextResponse.json(
      { error: "楽天APIの環境変数が未設定です。Vercelの RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY を確認してください。", results: [] },
      { status: 503 }
    );
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 });
  }

  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw.map((p: any) => ({
    jan: cleanJan(p?.jan),
    name: cleanText(p?.name),
    brand: cleanText(p?.brand),
    model: cleanText(p?.model),
  }));

  const unique = Array.from(new Map(products.filter((p) => p.jan.length === 13).map((p) => [p.jan, p])).values());
  if (!unique.length) return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });
  if (unique.length > 5) return NextResponse.json({ error: "1回の取得は最大5商品です。", results: [] }, { status: 400 });

  const results: any[] = [];

  for (const p of unique) {
    const started = Date.now();
    const debug: string[] = [];
    let completed = false;

    // IMPORTANT: Rakuten Product Search API's price fields such as
    // usedExcludeSalesMinPrice were changed to null/empty from 2026-03-25.
    // Therefore the actual lowest purchasable listing price must come from
    // the current Ichiba Item Search API instead of Product Search.
    const keywords = Array.from(new Set([
      p.jan,
      p.model,
      p.name,
    ].map(cleanText).filter((x) => x.length >= 2)));

    for (const keyword of keywords.slice(0, 3)) {
      try {
        const r = await ichibaSearch(appId, accessKey, keyword);
        const list = itemsOf(r.data);
        debug.push(`楽天市場:${keyword.slice(0, 18)}:${r.response.status}/${list.length}`);

        if (!r.response.ok) {
          debug.push(apiError(r.data, r.response.status));
          continue;
        }

        const found = chooseIchibaItem(list, p);
        if (!found) continue;

        // For a JAN search, only accept a listing that actually contains the
        // target JAN. For model/name fallback, require a meaningful match.
        const keywordIsJan = keyword === p.jan;
        if (keywordIsJan && !found.hasJan) continue;
        if (!keywordIsJan && found.score < 2500) continue;

        results.push({
          jan: p.jan,
          price: found.price,
          productName: found.item.itemName ?? p.name,
          itemUrl: found.item.itemUrl ?? null,
          shopName: found.item.shopName ?? null,
          source: "rakuten-ichiba-item-search",
          matchedBy: keywordIsJan ? "JAN" : keyword === p.model ? "型番" : "商品名",
          elapsedMs: Date.now() - started,
          error: null,
        });
        completed = true;
        break;
      } catch (e: any) {
        debug.push(e?.name === "AbortError" ? `楽天市場:${keyword.slice(0, 18)}:timeout` : `楽天市場:${e?.message || "error"}`);
      }
    }

    if (!completed) {
      results.push({
        jan: p.jan,
        price: null,
        elapsedMs: Date.now() - started,
        error: debug.join(" / ") || "楽天市場の新品候補が見つかりませんでした。",
      });
    }
  }

  return NextResponse.json({ results });
}
