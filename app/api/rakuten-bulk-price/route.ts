import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type RakutenProduct = { productId?: string | number | null; productCode?: string | null; productName?: string | null; productNo?: string | null; brandName?: string | null; makerName?: string | null; productUrlPC?: string | null; productUrlMobile?: string | null; searchUrl?: string | null; itemCount?: number | null; salesItemCount?: number | null; usedExcludeCount?: number | null; usedExcludeSalesItemCount?: number | null; minPrice?: number | string | null; salesMinPrice?: number | string | null; usedExcludeMinPrice?: number | string | null; usedExcludeSalesMinPrice?: number | string | null };
type Item = { itemName?: string | null; itemCode?: string | null; itemPrice?: number | string | null; itemPriceMin1?: number | string | null; itemPriceMin2?: number | string | null; itemPriceMin3?: number | string | null; itemUrl?: string | null; shopName?: string | null; catchcopy?: string | null; itemCaption?: string | null; availability?: number | string | null };
type Diagnostic = { api: string; query?: string; status?: number; count?: number; returned?: number; elapsedMs?: number; message?: string; product?: Record<string, unknown> | null; sample?: Array<{ name: string; price: number | null; shop: string | null }> };
type Candidate = { item: Item; price: number; score: number; reason: string[] };

const ITEM_API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const PRODUCT_API = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";
const BAD_WORDS = ["中古", "ユーズド", "used", "ジャンク", "junk", "訳あり", "訳有り", "展示品", "開封済み", "開封済", "開封品", "箱なし", "箱無し", "欠品", "本体のみ", "パーツ", "部品", "アウトレット", "リファービッシュ", "修理品", "動作未確認", "現状品", "難あり", "難有り", "ジャンク品", "中古品"];
const MARKETING_WORDS = new Set(["送料無料", "国内正規品", "正規品", "新品", "未開封", "即納", "ポイント", "ギフト", "プレゼント", "おもちゃ", "玩具", "特価", "セール", "最安", "限定", "予約"]);

const clean = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const normalize = (v: unknown) => clean(v).normalize("NFKC").toLowerCase().replace(/[「」『』【】［］()（）\[\]<>＜＞:：,，.!！?？・/\\_\-\s　]/g, "");
const toPrice = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

function getProducts(data: any): RakutenProduct[] { return Array.isArray(data?.items) ? data.items.map((x: any) => x?.product ?? x?.item ?? x).filter((x: any) => x && typeof x === "object") : []; }
function getItems(data: any): Item[] { return Array.isArray(data?.items) ? data.items.map((x: any) => x?.item ?? x).filter((x: any) => x && typeof x === "object") : []; }

async function getJson(url: URL, accessKey: string, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json", accessKey } });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1500) }; }
    return { response, data };
  } finally { clearTimeout(timer); }
}
function diagnosticMessage(data: any, fallback: string) { return clean(data?.error_description ?? data?.error ?? fallback); }

async function productByJan(appId: string, accessKey: string, jan: string) {
  const started = Date.now(); const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json"); url.searchParams.set("formatVersion", "2"); url.searchParams.set("applicationId", appId); url.searchParams.set("accessKey", accessKey); url.searchParams.set("productCode", jan);
  const { response, data } = await getJson(url, accessKey); const products = getProducts(data);
  const product = products.find((x) => cleanJan(x.productCode) === jan) ?? products[0] ?? null;
  const diagnostic: Diagnostic = { api: "ProductSearch(JAN exact)", query: jan, status: response.status, count: Number(data?.count ?? products.length), returned: products.length, elapsedMs: Date.now() - started, message: response.ok ? undefined : diagnosticMessage(data, "楽天Product Search APIエラー") };
  if (product) diagnostic.product = { productId: product.productId, productCode: product.productCode, productName: product.productName, productNo: product.productNo, brandName: product.brandName, makerName: product.makerName, productUrlPC: product.productUrlPC, searchUrl: product.searchUrl, itemCount: product.itemCount, salesItemCount: product.salesItemCount, usedExcludeCount: product.usedExcludeCount, usedExcludeSalesItemCount: product.usedExcludeSalesItemCount, minPrice: product.minPrice, salesMinPrice: product.salesMinPrice, usedExcludeMinPrice: product.usedExcludeMinPrice, usedExcludeSalesMinPrice: product.usedExcludeSalesMinPrice };
  return { response, product, diagnostic };
}

async function itemSearch(appId: string, accessKey: string, query: string) {
  const started = Date.now(); const url = new URL(ITEM_API);
  url.searchParams.set("format", "json"); url.searchParams.set("formatVersion", "2"); url.searchParams.set("applicationId", appId); url.searchParams.set("accessKey", accessKey); url.searchParams.set("keyword", query.slice(0, 100)); url.searchParams.set("availability", "1"); url.searchParams.set("sort", "+itemPrice"); url.searchParams.set("hits", "30"); url.searchParams.set("page", "1"); url.searchParams.set("elements", "itemName,itemCode,itemPrice,itemPriceMin1,itemPriceMin2,itemPriceMin3,itemUrl,shopName,catchcopy,itemCaption,availability");
  const { response, data } = await getJson(url, accessKey); const items = getItems(data);
  const diagnostic: Diagnostic = { api: "IchibaItemSearch", query, status: response.status, count: Number(data?.count ?? items.length), returned: items.length, elapsedMs: Date.now() - started, message: response.ok ? undefined : diagnosticMessage(data, "楽天Item Search APIエラー"), sample: items.slice(0, 8).map((item) => ({ name: clean(item.itemName), price: toPrice(item.itemPriceMin3) ?? toPrice(item.itemPriceMin2) ?? toPrice(item.itemPriceMin1) ?? toPrice(item.itemPrice), shop: item.shopName ?? null })) };
  return { response, items, diagnostic };
}

function directPrice(product: RakutenProduct | null) {
  const parsed = toPrice(product?.usedExcludeSalesMinPrice);
  return parsed == null ? { value: null as number | null, source: null as string | null } : { value: parsed, source: "usedExcludeSalesMinPrice" };
}
function isBadItem(item: Item) { const text = clean(`${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""}`).toLowerCase(); return BAD_WORDS.some((word) => text.includes(word.toLowerCase())); }
function splitSearchTokens(value: string) { return clean(value).normalize("NFKC").split(/[\s　/\\|｜,，、:：()（）「」『』【】［］]+/).map((x) => x.trim()).filter((x) => x.length >= 2 && !MARKETING_WORDS.has(x)); }
function bigrams(value: string) { const s = normalize(value); const out = new Set<string>(); for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2)); return out; }
function similarity(a: string, b: string) { const aa = bigrams(a), bb = bigrams(b); if (!aa.size || !bb.size) return 0; let hit = 0; for (const x of aa) if (bb.has(x)) hit += 1; return hit / (aa.size + bb.size - hit); }
function extractNumbers(value: string) { return Array.from(new Set((normalize(value).match(/\d{3,}/g) ?? []))); }
function significantTokens(input: Product, product: RakutenProduct | null) { return Array.from(new Set([clean(product?.productNo), clean(input.model), clean(product?.brandName), clean(input.brand), ...splitSearchTokens(clean(product?.productName || "")), ...splitSearchTokens(input.name)].filter(Boolean))).slice(0, 24); }

function candidateScore(item: Item, product: RakutenProduct | null, input: Product, query: string): Candidate | null {
  if (isBadItem(item)) return null;
  const price = toPrice(item.itemPriceMin3) ?? toPrice(item.itemPriceMin2) ?? toPrice(item.itemPriceMin1) ?? toPrice(item.itemPrice); if (price == null) return null;
  const raw = clean(`${item.itemName ?? ""} ${item.catchcopy ?? ""} ${item.itemCaption ?? ""}`); const itemName = clean(item.itemName); const text = normalize(raw); const nameNorm = normalize(itemName);
  const expectedName = clean(product?.productName || input.name); const expectedNameNorm = normalize(expectedName); const expectedModel = clean(product?.productNo || input.model); const expectedModelNorm = normalize(expectedModel); const expectedBrand = clean(product?.brandName || input.brand); const expectedBrandNorm = normalize(expectedBrand); const jan = cleanJan(input.jan);
  const reasons: string[] = []; let score = 0; let strongIdentity = false;
  if (jan && raw.includes(jan)) { score += 400; strongIdentity = true; reasons.push("JAN一致"); }
  if (expectedModelNorm && text.includes(expectedModelNorm)) { score += 260; strongIdentity = true; reasons.push("型番一致"); }
  if (expectedBrandNorm && text.includes(expectedBrandNorm)) { score += 45; reasons.push("メーカー一致"); }
  if (expectedNameNorm && (nameNorm.includes(expectedNameNorm) || expectedNameNorm.includes(nameNorm))) { score += 220; strongIdentity = true; reasons.push("商品名一致"); }
  const expectedNumbers = extractNumbers(`${expectedModel} ${expectedName}`); const itemNumbers = extractNumbers(raw); const numericHits = expectedNumbers.filter((n) => itemNumbers.includes(n));
  if (numericHits.length) { score += Math.min(120, numericHits.length * 40); reasons.push(`数字一致${numericHits.length}`); }
  const sim = similarity(expectedName, itemName);
  if (sim >= 0.72) { score += 150; strongIdentity = true; reasons.push(`名称類似${sim.toFixed(2)}`); } else if (sim >= 0.52) { score += 90; reasons.push(`名称類似${sim.toFixed(2)}`); }
  const tokenHits = significantTokens(input, product).filter((token) => token.length >= 3 && text.includes(normalize(token)));
  score += Math.min(120, tokenHits.length * 10);
  const queryIsJan = /^\d{13}$/.test(query); const threshold = queryIsJan ? 220 : 120;
  if (!strongIdentity || score < threshold) return null;
  return { item, price, score, reason: reasons };
}

function buildQueries(input: Product, product: RakutenProduct | null) {
  const name = clean(product?.productName || input.name); const model = clean(product?.productNo || input.model); const brand = clean(product?.brandName || input.brand); const queries: string[] = [];
  if (/^\d{13}$/.test(input.jan)) queries.push(input.jan); if (model.length >= 2) queries.push(model); if (brand && model) queries.push(`${brand} ${model}`);
  const nameTokens = splitSearchTokens(name); if (brand && nameTokens.length) queries.push(`${brand} ${nameTokens.slice(0, 5).join(" ")}`); if (nameTokens.length) queries.push(nameTokens.slice(0, 6).join(" ")); if (name) queries.push(name.slice(0, 90));
  return Array.from(new Set(queries.map(clean).filter((q) => q.length >= 2))).slice(0, 4);
}
function failure(input: Product, diagnostics: Diagnostic[], started: number, error: string, extra: Record<string, unknown> = {}) { return { jan: input.jan, price: null, lowestPrice: null, rakutenLowestPrice: null, productName: input.name || null, elapsedMs: Date.now() - started, debug: diagnostics, ...extra, error }; }

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID; const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) return NextResponse.json({ results: [], error: "楽天APIの環境変数が未設定です。" }, { status: 503 });
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ results: [], error: "JSONが不正です。" }, { status: 400 }); }
  const products: Product[] = (Array.isArray(body?.products) ? body.products : []).map((p: any) => ({ jan: cleanJan(p?.jan), name: clean(p?.name ?? p?.productName), brand: clean(p?.brand ?? p?.brandName ?? p?.makerName), model: clean(p?.model ?? p?.productNo) })).filter((p) => p.jan.length === 13);
  const unique = Array.from(new Map(products.map((p) => [p.jan, p])).values()).slice(0, 5);
  if (!unique.length) return NextResponse.json({ results: [], error: "有効な13桁JANの商品がありません。" }, { status: 400 });
  const results: any[] = [];

  for (const input of unique) {
    const started = Date.now(); const diagnostics: Diagnostic[] = [];
    try {
      const exact = await productByJan(appId, accessKey, input.jan); diagnostics.push(exact.diagnostic);
      if (exact.response.status === 429) { results.push(failure(input, diagnostics, started, "楽天APIがアクセス制限(429)を返しました。少し時間を置いて再検索してください。")); continue; }
      if (exact.response.status === 503) { results.push(failure(input, diagnostics, started, "楽天APIが一時的に利用できません。時間を置いて再検索してください。")); continue; }

      const resolved = exact.product; const resolvedName = clean(resolved?.productName) || input.name; const direct = exact.response.ok ? directPrice(resolved) : { value: null as number | null, source: null as string | null };
      // Never label salesMinPrice as a new price: it can include used listings.
      // Only the documented used-excluded purchasable minimum is accepted directly.
      if (exact.response.ok && direct.value != null) {
        results.push({ jan: input.jan, price: direct.value, lowestPrice: direct.value, rakutenLowestPrice: direct.value, productName: resolvedName || null, itemUrl: resolved?.productUrlPC ?? resolved?.productUrlMobile ?? resolved?.searchUrl ?? null, shopName: null, source: "Rakuten Product Search / JAN exact", matchedBy: "JAN", candidateCount: resolved?.usedExcludeSalesItemCount ?? 0, elapsedMs: Date.now() - started, priceSource: direct.source, debug: diagnostics, error: null });
        continue;
      }

      const allCandidates: Candidate[] = []; const seenItemCodes = new Set<string>(); let candidateCount = 0; let rateLimited = false;
      for (const query of buildQueries(input, resolved)) {
        const searched = await itemSearch(appId, accessKey, query); diagnostics.push(searched.diagnostic);
        if (searched.response.status === 429) { rateLimited = true; break; }
        if (!searched.response.ok) continue;
        candidateCount += searched.items.length;
        for (const item of searched.items) {
          const code = clean(item.itemCode); if (code && seenItemCodes.has(code)) continue; if (code) seenItemCodes.add(code);
          const candidate = candidateScore(item, resolved, input, query); if (candidate) allCandidates.push(candidate);
        }
      }
      if (rateLimited) { results.push(failure(input, diagnostics, started, "楽天APIがアクセス制限(429)を返しました。少し時間を置いて再検索してください。", { productName: resolvedName || null })); continue; }
      allCandidates.sort((a, b) => b.score - a.score || a.price - b.price); const bestScore = allCandidates[0]?.score ?? 0; const highConfidence = allCandidates.filter((c) => c.score >= Math.max(220, bestScore - 35)); const chosen = [...highConfidence].sort((a, b) => a.price - b.price)[0] ?? null;
      if (!chosen) { results.push(failure(input, diagnostics, started, "楽天市場の対象商品について、新品として採用できる最安値を確認できませんでした。", { productName: resolvedName || null, candidateCount, acceptedCandidates: allCandidates.slice(0, 10).map((c) => ({ name: clean(c.item.itemName), price: c.price, score: c.score, reason: c.reason, shop: c.item.shopName ?? null })) })); continue; }
      results.push({ jan: input.jan, price: chosen.price, lowestPrice: chosen.price, rakutenLowestPrice: chosen.price, productName: clean(chosen.item.itemName) || resolvedName || null, itemUrl: chosen.item.itemUrl ?? null, shopName: chosen.item.shopName ?? null, source: "Rakuten Ichiba Item Search / verified fallback", matchedBy: chosen.reason.join("・") || "商品情報一致", candidateCount, elapsedMs: Date.now() - started, priceSource: chosen.item.itemPriceMin3 != null ? "itemPriceMin3" : chosen.item.itemPriceMin2 != null ? "itemPriceMin2" : "itemPrice", debug: diagnostics, error: null });
    } catch (error: any) {
      results.push(failure(input, diagnostics, started, error?.name === "AbortError" ? "楽天APIの応答がタイムアウトしました。" : error?.message || "楽天APIへの接続に失敗しました。"));
    }
  }
  return NextResponse.json({ results });
}
