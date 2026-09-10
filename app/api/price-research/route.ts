import { NextRequest, NextResponse } from "next/server";

function cleanJan(value: string) { return value.replace(/\D/g, "").slice(0, 13); }
function asPrice(value: unknown) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
function normalize(value: unknown) { return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s　\-‐‑–—_/・:：,.，。()（）［］【】「」『』]/g, ""); }

function isExcludedNewCondition(item: any) {
  // Do not inspect the full description for generic words such as 「パーツ」「部品」.
  // New model kits legitimately mention parts in their product descriptions, which
  // previously caused every valid listing to be rejected as non-new.
  const titleText = normalize(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""}`);
  const captionText = normalize(item?.itemCaption ?? "");
  const titleExcluded = ["中古", "中古品", "ジャンク", "訳あり", "アウトレット", "展示品", "リファービッシュ", "修理品", "整備済", "used", "junk", "refurbished"];
  const conditionPhrases = ["開封済", "開封品", "箱なし", "欠品あり", "欠品有り", "部品取り"];
  return titleExcluded.some((word) => titleText.includes(normalize(word))) || conditionPhrases.some((word) => captionText.includes(normalize(word)) || titleText.includes(normalize(word)));
}

function extractHints(productName: string | null, productNo: string | null, brandName: string | null, makerName: string | null) {
  const source = `${productNo ?? ""} ${productName ?? ""}`;
  const result: string[] = [];
  const add = (value: string | null | undefined) => { const v = String(value ?? "").trim(); if (v.length >= 3 && !result.includes(v)) result.push(v); };
  for (const match of source.match(/[A-Z0-9]+(?:[-_/][A-Z0-9]+)+/gi) ?? []) add(match);
  for (const match of source.match(/\b[A-Z]{1,6}\d{2,}[A-Z0-9-]*\b/gi) ?? []) add(match);
  add(productNo);
  const colors = ["ブラック", "ホワイト", "グレー", "シルバー", "ブルー", "レッド", "ピンク", "グリーン", "パープル", "ベージュ", "ブラウン", "ゴールド", "ネイビー", "アイボリー", "オレンジ", "イエロー"];
  const name = normalize(productName);
  for (const color of colors) if (name.includes(normalize(color))) add(color);
  if (brandName) add(brandName);
  if (makerName) add(makerName);
  return result.slice(0, 8);
}

function buildQueries(productName: string | null, productNo: string | null, brandName: string | null, makerName: string | null) {
  const hints = extractHints(productName, productNo, brandName, makerName);
  const result: string[] = [];
  const add = (value: string | null | undefined) => { const v = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 100); if (v && !result.includes(v)) result.push(v); };
  for (const hint of hints) if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(hint) || hint.length <= 20) add(hint);
  if (productName) {
    const tokens = productName.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) add(tokens.slice(0, 3).join(" "));
    if (tokens.length >= 3) add(tokens.slice(0, 2).join(" "));
    const compact = productName.replace(/[\s　]+/g, "").trim();
    if (compact.length >= 4) { add(compact.slice(0, 18)); add(compact.slice(0, 10)); }
  }
  if (brandName && productNo) add(`${brandName} ${productNo}`);
  if (makerName && productNo) add(`${makerName} ${productNo}`);
  return { hints, queries: result.slice(0, 6) };
}

function rakutenOrigin(requestOrigin: string) {
  const configured = process.env.RAKUTEN_API_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) return productionHost.startsWith("http") ? productionHost.replace(/\/$/, "") : `https://${productionHost}`;
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicAppUrl) return publicAppUrl.replace(/\/$/, "");
  return requestOrigin.replace(/\/$/, "");
}

const RAKUTEN_MIN_INTERVAL_MS = 1200;
let lastRakutenRequestAt = 0;
async function waitForRakutenSlot() { const waitMs = Math.max(0, RAKUTEN_MIN_INTERVAL_MS - (Date.now() - lastRakutenRequestAt)); if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs)); lastRakutenRequestAt = Date.now(); }

async function fetchJson(url: URL, accessKey: string, origin: string, timeoutMs = 8000) {
  await waitForRakutenSlot();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: { accessKey, Origin: origin, Referer: `${origin}/`, "User-Agent": "inventory-management-rakuten-api/1.0" } });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
    return { response, data };
  } finally { clearTimeout(timer); }
}

function apiError(data: any, status: number) { return data?.errors?.errorMessage ?? data?.error_description ?? data?.error ?? `楽天市場API HTTP ${status}`; }

async function rakutenProductSearch(applicationId: string, accessKey: string, params: { jan?: string; keyword?: string }, origin: string, debug: any[]) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json"); url.searchParams.set("formatVersion", "2"); url.searchParams.set("applicationId", applicationId); url.searchParams.set("accessKey", accessKey);
  if (params.jan) url.searchParams.set("productCode", params.jan); else if (params.keyword) url.searchParams.set("keyword", params.keyword);
  const { response, data } = await fetchJson(url, accessKey, origin);
  const items = Array.isArray(data?.items) ? data.items : [];
  debug.push({ api: "ProductSearch", query: params.jan ?? params.keyword, status: response.status, count: Number(data?.count ?? items.length), error: response.ok ? null : apiError(data, response.status) });
  if (!response.ok) throw new Error(apiError(data, response.status));
  return items[0] ?? null;
}

async function rakutenItemSearch(applicationId: string, accessKey: string, keyword: string, origin: string, debug: any[]) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json"); url.searchParams.set("formatVersion", "2"); url.searchParams.set("applicationId", applicationId); url.searchParams.set("accessKey", accessKey); url.searchParams.set("keyword", keyword); url.searchParams.set("sort", "+itemPrice"); url.searchParams.set("hits", "30"); url.searchParams.set("page", "1"); url.searchParams.set("availability", "1"); url.searchParams.set("field", "0"); url.searchParams.set("purchaseType", "0");
  const { response, data } = await fetchJson(url, accessKey, origin);
  const items = Array.isArray(data?.items) ? data.items : [];
  debug.push({ api: "IchibaItemSearch", keyword, status: response.status, count: Number(data?.count ?? items.length), error: response.ok ? null : apiError(data, response.status) });
  if (!response.ok) throw new Error(apiError(data, response.status));
  return { items, count: Number(data?.count ?? items.length) };
}

function chooseLowestNew(items: any[], jan: string, hints: string[]) {
  const janDigits = normalize(jan); const normalizedHints = hints.map(normalize).filter((v) => v.length >= 3);
  const candidates = items.map((item) => {
    const text = normalize(`${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCaption ?? ""} ${item?.itemCode ?? ""}`);
    let score = text.includes(janDigits) ? 1000 : 0;
    for (const hint of normalizedHints) if (text.includes(hint)) score += hint.length >= 6 ? 20 : 8;
    return { name: item?.itemName ?? null, price: asPrice(item?.itemPrice), shopName: item?.shopName ?? null, itemUrl: item?.itemUrl ?? null, shopUrl: item?.shopUrl ?? null, itemCode: item?.itemCode ?? null, catchcopy: item?.catchcopy ?? null, itemCaption: item?.itemCaption ?? null, caption: item?.catchcopy ?? item?.itemCaption ?? null, score, excluded: isExcludedNewCondition(item) };
  }).filter((item) => item.price !== null && !item.excluded);
  if (!candidates.length) return null;
  const exactJan = candidates.filter((item) => normalize(`${item.name ?? ""} ${item.itemCode ?? ""} ${item.caption ?? ""}`).includes(janDigits));
  const pool = exactJan.length ? exactJan : candidates.filter((item) => item.score > 0);
  if (!pool.length) return null;
  pool.sort((a, b) => b.score - a.score || (a.price ?? Infinity) - (b.price ?? Infinity));
  return pool[0];
}

export async function GET(request: NextRequest) {
  const jan = cleanJan(request.nextUrl.searchParams.get("jan") || "");
  if (jan.length !== 13) return NextResponse.json({ error: "13桁のJANコードを指定してください。" }, { status: 400 });
  const result: any = { jan, rakuten: { available: false, lowestPrice: null, newListingCount: null, items: [], priceNaviUrl: null, productUrl: null, error: null, source: null, debug: [] }, amazon: { available: false, lowestPrice: null, items: [], error: null, productUrl: `https://www.amazon.co.jp/s?k=${jan}` }, price2alert: `https://price2alert.com/search?i=All&kwd=${jan}` };
  const appId = process.env.RAKUTEN_APPLICATION_ID; const accessKey = process.env.RAKUTEN_ACCESS_KEY; const origin = rakutenOrigin(request.nextUrl.origin);

  if (appId && accessKey) {
    let product: any = null; let productError: string | null = null;
    try {
      product = await rakutenProductSearch(appId, accessKey, { jan }, origin, result.rakuten.debug);
      if (product) {
        result.rakuten.newListingCount = Number.isFinite(Number(product.usedExcludeSalesItemCount)) ? Number(product.usedExcludeSalesItemCount) : null;
        result.rakuten.priceNaviUrl = product.productUrlPC ?? product.productUrlMobile ?? product.searchUrl ?? null;
        result.rakuten.productUrl = result.rakuten.priceNaviUrl;
        const newPrice = asPrice(product.usedExcludeSalesMinPrice);
        if (newPrice !== null) { result.rakuten.available = true; result.rakuten.lowestPrice = newPrice; result.rakuten.source = "ProductSearch:new-only"; }
      }
    } catch (error: any) { productError = error?.name === "AbortError" ? "楽天Product APIが8秒以内に応答しませんでした。" : error?.message || "楽天Product APIへの接続に失敗しました。"; }

    if (!result.rakuten.available && product && !product.productName && !product.productNo) {
      try {
        const keywordProduct = await rakutenProductSearch(appId, accessKey, { keyword: jan }, origin, result.rakuten.debug);
        if (keywordProduct) {
          product = { ...product, ...keywordProduct };
          result.rakuten.priceNaviUrl = keywordProduct.productUrlPC ?? keywordProduct.productUrlMobile ?? keywordProduct.searchUrl ?? result.rakuten.priceNaviUrl;
          result.rakuten.productUrl = result.rakuten.priceNaviUrl;
          if (result.rakuten.newListingCount === null && Number.isFinite(Number(keywordProduct.usedExcludeSalesItemCount))) result.rakuten.newListingCount = Number(keywordProduct.usedExcludeSalesItemCount);
          const newPrice = asPrice(keywordProduct.usedExcludeSalesMinPrice);
          if (newPrice !== null) { result.rakuten.available = true; result.rakuten.lowestPrice = newPrice; result.rakuten.source = "ProductSearch:keyword-new-only"; }
        }
      } catch (error: any) { if (!productError) productError = error?.message || "楽天Product APIのキーワード検索に失敗しました。"; }
    }

    if (!result.rakuten.available) {
      try {
        const built = buildQueries(product?.productName ?? null, product?.productNo ?? null, product?.brandName ?? null, product?.makerName ?? null);
        const queries = [jan, ...built.queries];
        let chosen: any = null; let chosenQuery = "";
        for (const query of [...new Set(queries)]) {
          if (!query) continue;
          const hints = query === jan ? [] : [query, ...built.hints];
          const search = await rakutenItemSearch(appId, accessKey, query, origin, result.rakuten.debug);
          const candidate = chooseLowestNew(search.items, jan, hints);
          if (candidate) { chosen = candidate; chosenQuery = query; break; }
        }
        if (chosen) {
          result.rakuten.available = true; result.rakuten.lowestPrice = chosen.price; result.rakuten.items = [chosen]; result.rakuten.source = `IchibaItemSearch:${chosenQuery}`; result.rakuten.error = null;
        } else {
          result.rakuten.error = productError ? `${productError}／楽天市場の商品検索でも新品価格を確認できませんでした。` : "楽天市場の商品検索は成功しましたが、新品として採用できる価格商品が見つかりませんでした。";
        }
      } catch (error: any) {
        const itemError = error?.name === "AbortError" ? "楽天市場Item APIが8秒以内に応答しませんでした。" : error?.message || "楽天市場Item APIへの接続に失敗しました。";
        result.rakuten.error = productError ? `${productError}／${itemError}` : itemError;
      }
    }
  } else result.rakuten.error = "楽天APIの環境変数が未設定です。";

  const amazonConfigured = Boolean(process.env.AMAZON_CREDENTIAL_ID && process.env.AMAZON_CREDENTIAL_SECRET && process.env.AMAZON_REFRESH_TOKEN);
  result.amazon.error = amazonConfigured ? "Amazon Creators API接続準備済み。認証情報を設定後、公式APIのOffer情報を取得します。" : "Amazon Creators APIの認証情報が未設定です。現在はAmazonの商品ページへのリンクを表示できます。";
  return NextResponse.json(result);
}
