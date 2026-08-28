import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const normalize = (v: unknown) => cleanText(v).toLowerCase().replace(/[【】\[\]（）()「」『』<>＜＞]/g, " ").replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();

const EXCLUDED_WORDS = ["中古", "中古品", "ユーズド", "used", "ジャンク", "開封済み", "開封済", "開封品", "箱なし", "箱無", "欠品", "訳あり", "アウトレット", "展示品", "リファービッシュ", "再生品", "部品", "パーツ", "難あり", "現状品"];

async function fetchJson(url: URL, accessKey: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    url.searchParams.set("accessKey", accessKey);
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
    return { response, data };
  } finally { clearTimeout(timer); }
}

function itemsOf(data: any): any[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function priceOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isExcluded(item: any) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCaption ?? ""}`).toLowerCase();
  return EXCLUDED_WORDS.some((word) => text.includes(word.toLowerCase()));
}

function extractModels(name: string) {
  const matches = name.match(/\b[A-Z]{1,8}-\d{2,}[A-Z0-9]*\b/gi) ?? [];
  return Array.from(new Set(matches.map((x) => x.toUpperCase())));
}

function japaneseCore(name: string, model: string, brand: string) {
  let s = cleanText(name);
  for (const value of [model, brand, "BANDAI SPIRITS", "BANDAI", "MG", "HG", "RG", "PG", "EG", "1/100", "1/144", "1/60", "色分け済み", "プラモデル", "ガンプラ"]) {
    if (!value) continue;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(escaped, "ig"), " ");
  }
  s = s.replace(/\b\d{13}\b/g, " ").replace(/\s+/g, " ").trim();
  const tokens = s.split(" ").filter((x) => x.length >= 2);
  return tokens.slice(0, 2).join(" ");
}

function buildQueries(p: Product) {
  const model = cleanText(p.model);
  const brand = cleanText(p.brand);
  const extracted = extractModels(p.name);
  const code = model || extracted[0] || "";
  const core = japaneseCore(p.name, code, brand);
  const fullName = cleanText(p.name).replace(/\b\d{13}\b/g, "").slice(0, 80);

  // Keep each request simple. Rakuten keyword search is AND by default,
  // so overly long product names can eliminate the correct item entirely.
  return Array.from(new Set([
    code,
    core,
    code && core ? `${code} ${core}` : "",
    fullName,
  ].map(cleanText).filter((x) => x.length >= 2))).slice(0, 4);
}

function chooseIchibaItem(items: any[], p: Product, query: string) {
  const jan = cleanJan(p.jan);
  const modelRaw = p.model || extractModels(p.name)[0] || "";
  const model = normalize(modelRaw).replace(/\s+/g, "");
  const brand = normalize(p.brand).replace(/\s+/g, "");
  const core = normalize(japaneseCore(p.name, modelRaw, p.brand)).replace(/\s+/g, "");
  const q = normalize(query).replace(/\s+/g, "");

  const candidates = items.map((item: any) => {
    if (!item || isExcluded(item)) return null;
    const price = priceOf(item.itemPriceMin3) ?? priceOf(item.itemPrice);
    if (price == null) return null;

    const searchable = cleanText(`${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""} ${item.itemCode ?? ""}`);
    const digits = searchable.replace(/\D/g, "");
    const name = normalize(item.itemName).replace(/\s+/g, "");
    const code = normalize(item.itemCode).replace(/\s+/g, "");
    const hasJan = jan.length === 13 && (digits.includes(jan) || code.includes(jan));
    const hasModel = !!model && (name.includes(model) || code.includes(model));
    const hasBrand = !!brand && name.includes(brand);
    const hasCore = !!core && name.includes(core);
    const hasQuery = !!q && (name.includes(q) || code.includes(q));

    let score = 0;
    if (hasJan) score += 1000000;
    if (hasModel) score += 100000;
    if (hasCore) score += 10000;
    if (hasBrand) score += 1000;
    if (hasQuery) score += 100;

    return { item, price, score };
  }).filter(Boolean) as Array<{ item: any; price: number; score: number }>;

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  return candidates[0];
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
  // Do not use field=1 here. Restricted search can be too aggressive for
  // model-number/JAN-like keywords and can hide valid marketplace items.
  url.searchParams.set("elements", "itemName,catchcopy,itemPrice,itemPriceMin3,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode");
  return fetchJson(url, accessKey);
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) return NextResponse.json({ error: "楽天APIの環境変数が未設定です。Vercelの RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY を確認してください。", results: [] }, { status: 503 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 }); }
  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw.map((p: any) => ({ jan: cleanJan(p?.jan), name: cleanText(p?.name), brand: cleanText(p?.brand), model: cleanText(p?.model) }));
  const unique = Array.from(new Map(products.filter((p) => p.jan.length === 13).map((p) => [p.jan, p])).values());
  if (!unique.length) return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });
  if (unique.length > 5) return NextResponse.json({ error: "1回の取得は最大5商品です。", results: [] }, { status: 400 });

  const results: any[] = [];
  for (const p of unique) {
    const started = Date.now();
    const debug: string[] = [];
    let completed = false;
    const queries = buildQueries(p);

    for (const query of queries) {
      try {
        const r = await ichibaSearch(appId, accessKey, query);
        const list = itemsOf(r.data);
        debug.push(`${query.slice(0, 32)}:${r.response.status}/${list.length}`);
        if (!r.response.ok) {
          debug.push(apiError(r.data, r.response.status));
          continue;
        }
        const found = chooseIchibaItem(list, p, query);
        if (!found) continue;
        results.push({
          jan: p.jan,
          price: found.price,
          productName: found.item.itemName ?? p.name,
          itemUrl: found.item.itemUrl ?? null,
          shopName: found.item.shopName ?? null,
          source: "rakuten-ichiba-item-search",
          matchedBy: query === p.jan ? "JAN" : "商品特定検索",
          elapsedMs: Date.now() - started,
          error: null,
        });
        completed = true;
        break;
      } catch (e: any) {
        debug.push(e?.name === "AbortError" ? `${query.slice(0, 32)}:timeout` : `${query.slice(0, 32)}:${e?.message || "error"}`);
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
