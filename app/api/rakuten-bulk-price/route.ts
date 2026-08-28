import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type DebugEntry = { api: string; query?: string; status?: number; count?: number; price?: number | null; message?: string };

const ICHIBA_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const PRODUCT_API = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const normalize = (v: unknown) => cleanText(v).normalize("NFKC").toLowerCase().replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();
const priceOf = (v: unknown) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

const EXCLUDED = ["中古","中古品","ユーズド","used","ジャンク","ジャンク品","開封済み","開封済","開封品","箱なし","箱無","欠品","訳あり","アウトレット","展示品","リファービッシュ","再生品","難あり","現状品","動作未確認"];

function itemsOf(data: any) {
  return Array.isArray(data?.items) ? data.items.map((x: any) => x?.item ?? x).filter(Boolean) : [];
}
function excluded(item: any) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""}`).toLowerCase();
  return EXCLUDED.some((w) => text.includes(w.toLowerCase()));
}

async function getJson(url: URL, accessKey: string, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Send the new access key in both supported forms. This removes ambiguity
    // between Vercel/env configuration and Rakuten's header/query auth path.
    url.searchParams.set("accessKey", accessKey);
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json", accessKey } });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
    return { response, data };
  } finally { clearTimeout(timer); }
}

async function ichibaSearch(appId: string, accessKey: string, keyword: string, debug: DebugEntry[], orFlag = 0) {
  const url = new URL(ICHIBA_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("hits", "30");
  url.searchParams.set("page", "1");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "0");
  url.searchParams.set("orFlag", String(orFlag));
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set("elements", "itemName,catchcopy,itemPrice,itemPriceMin3,itemCaption,itemUrl,shopName,shopUrl,itemCode,availability");
  const { response, data } = await getJson(url, accessKey);
  const items = itemsOf(data);
  debug.push({ api: "IchibaItemSearch", query: keyword, status: response.status, count: Number(data?.count ?? items.length), message: response.ok ? undefined : (data?.error_description || data?.error) });
  return response.ok ? items : [];
}

async function productLookup(appId: string, accessKey: string, jan: string, debug: DebugEntry[]) {
  const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("productCode", jan);
  const { response, data } = await getJson(url, accessKey);
  const items = itemsOf(data);
  const product = items[0] ?? null;
  const directPrice = priceOf(product?.usedExcludeSalesMinPrice);
  debug.push({ api: "ProductSearch(JAN)", query: jan, status: response.status, count: Number(data?.count ?? items.length), price: directPrice, message: response.ok ? undefined : (data?.error_description || data?.error) });
  return { product, directPrice, ok: response.ok };
}

function modelCodes(text: string) {
  return Array.from(new Set((text.match(/\b[A-Z]{1,10}-[A-Z0-9]{2,}\b/gi) ?? []).map((x) => x.toUpperCase())));
}
function tokens(text: string) {
  const stop = new Set(["bandai","spirits","takara","tomy","mg","hg","rg","pg","1","100","144"]);
  return normalize(text).split(" ").filter((x) => x.length >= 2 && !stop.has(x));
}
function queries(p: Product, canonical: any) {
  const name = cleanText(canonical?.productName || p.name);
  const model = cleanText(canonical?.productNo || p.model || "");
  const codes = modelCodes(`${name} ${p.name}`);
  const out: string[] = [];
  for (const q of [model, ...codes, tokens(name).slice(0, 4).join(" "), tokens(name).slice(0, 6).join(" "), name]) {
    const x = cleanText(q).slice(0, 128);
    if (x.length >= 2 && !out.includes(x)) out.push(x);
  }
  return out.slice(0, 5);
}

function choose(items: any[], p: Product, canonical: any) {
  const jan = cleanJan(p.jan);
  const modelValues = [p.model, canonical?.productNo, ...modelCodes(`${p.name} ${canonical?.productName ?? ""}`)].map(normalize).filter((x) => x.length >= 3).map((x) => x.replace(/\s+/g, ""));
  const wanted = tokens(canonical?.productName || p.name).map((x) => x.replace(/\s+/g, ""));
  const candidates = items.map((item) => {
    if (!item || excluded(item)) return null;
    const price = priceOf(item?.itemPriceMin3) ?? priceOf(item?.itemPrice);
    if (price == null) return null;
    const text = cleanText(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCode ?? ""}`);
    const norm = normalize(text).replace(/\s+/g, "");
    const digits = text.replace(/\D/g, "");
    const hasJan = jan.length === 13 && digits.includes(jan);
    const hasModel = modelValues.some((m) => norm.includes(m));
    const matched = wanted.filter((t) => norm.includes(t)).length;
    if (!hasJan && !hasModel && matched < 2) return null;
    let score = matched * 1000;
    if (hasModel) score += 100000;
    if (hasJan) score += 1000000;
    return { item, price, score };
  }).filter(Boolean) as Array<{item:any;price:number;score:number}>;
  candidates.sort((a,b) => b.score - a.score || a.price - b.price);
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
      // 1. Search actual Rakuten Ichiba listings by the JAN keyword.
      // This avoids depending on Product Search's aggregate price fields.
      let items = await ichibaSearch(appId, accessKey, p.jan, debug, 0);
      let chosen = choose(items, p, null);
      let source = "IchibaItemSearch:JAN";

      // 2. Resolve the JAN to Rakuten's canonical product identity.
      const canonicalResult = await productLookup(appId, accessKey, p.jan, debug);
      const canonical = canonicalResult.product;

      // Product Search's aggregate field is used only as an explicit fallback.
      if (!chosen && canonicalResult.directPrice != null) {
        results.push({ jan: p.jan, price: canonicalResult.directPrice, productName: canonical?.productName ?? p.name, itemUrl: canonical?.productUrlPC ?? null, shopName: null, source: "ProductSearch:usedExcludeSalesMinPrice", matchedBy: "JAN", elapsedMs: Date.now() - started, debug, error: null });
        continue;
      }

      // 3. Search actual listings using canonical product identifiers.
      if (!chosen) {
        for (const q of queries(p, canonical)) {
          items = await ichibaSearch(appId, accessKey, q, debug, 0);
          chosen = choose(items, p, canonical);
          if (chosen) { source = `IchibaItemSearch:${q}`; break; }
          // A short OR search is useful when a seller uses slightly different wording.
          const qTokens = tokens(q);
          if (qTokens.length >= 2) {
            items = await ichibaSearch(appId, accessKey, qTokens.slice(0, 4).join(" "), debug, 1);
            chosen = choose(items, p, canonical);
            if (chosen) { source = `IchibaItemSearch:OR:${qTokens.slice(0,4).join(" ")}`; break; }
          }
        }
      }

      if (chosen) {
        results.push({ jan: p.jan, price: chosen.price, productName: chosen.item?.itemName ?? canonical?.productName ?? p.name, itemUrl: chosen.item?.itemUrl ?? null, shopName: chosen.item?.shopName ?? null, source, matchedBy: source, elapsedMs: Date.now() - started, debug, error: null });
      } else {
        const lastErrors = debug.filter((d) => d.message).map((d) => `${d.api} ${d.status ?? ""}: ${d.message}`).join(" / ");
        results.push({ jan: p.jan, price: null, productName: canonical?.productName ?? p.name, elapsedMs: Date.now() - started, debug, error: lastErrors || "楽天から新品として採用できる価格商品を取得できませんでした。" });
      }
    } catch (error: any) {
      results.push({ jan: p.jan, price: null, elapsedMs: Date.now() - started, debug, error: error?.name === "AbortError" ? "楽天APIが10秒以内に応答しませんでした。" : error?.message || "楽天APIへの接続に失敗しました。" });
    }
  }
  return NextResponse.json({ results });
}
