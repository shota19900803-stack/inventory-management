import { NextRequest, NextResponse } from "next/server";

function cleanJan(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 13);
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/[\s　]+/g, " ").trim();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: URL, accessKey: string, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json", accessKey },
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return { response, data };
      if ((response.status === 429 || response.status === 503) && attempt < retries) {
        await sleep(1800 * (attempt + 1));
        continue;
      }
      return { response, data };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("楽天APIへの接続に失敗しました。");
}

async function searchProduct(appId: string, accessKey: string, jan: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  // Access Keyはヘッダーだけでなくクエリにも指定し、環境差による認証失敗を防ぐ。
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);
  url.searchParams.set("hits", "30");
  url.searchParams.set("elements", "productId,productCode,productName,productNo,brandName,itemCount,salesItemCount,usedExcludeCount,usedExcludeSalesItemCount,minPrice,salesMinPrice,usedExcludeMinPrice,usedExcludeSalesMinPrice");
  return fetchJson(url, accessKey);
}

async function searchItems(appId: string, accessKey: string, keyword: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("hits", "30");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "0");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set("elements", "itemName,itemPrice,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode");
  url.searchParams.set("NGKeyword", "中古 中古品 ユーズド used ジャンク 開封済み 開封品 箱なし 欠品 訳あり アウトレット 展示品 リファービッシュ 再生品");
  return fetchJson(url, accessKey);
}

function unwrapItems(data: any) {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function isExcluded(item: any) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.itemCaption ?? ""}`).toLowerCase();
  return /中古|中古品|ユーズド|used|ジャンク|開封済み|開封品|箱なし|欠品|訳あり|アウトレット|展示品|リファービッシュ|再生品/.test(text);
}

function normalize(value: unknown) {
  return cleanText(value).toLowerCase().replace(/[【】\[\]（）()「」『』<>＜＞]/g, " ").replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ").replace(/\s+/g, " ").trim();
}

function chooseItem(items: any[], product: { name: string; brand: string; model: string; jan: string }) {
  const target = normalize(product.name);
  const brand = normalize(product.brand);
  const model = normalize(product.model);
  const jan = cleanJan(product.jan);
  return items.map((item: any) => {
    if (!item || isExcluded(item)) return null;
    const name = normalize(item.itemName);
    const price = Number(item.itemPrice ?? 0);
    if (!name || !Number.isFinite(price) || price <= 0) return null;
    const text = cleanText(`${item.itemName ?? ""} ${item.itemCaption ?? ""} ${item.itemCode ?? ""}`);
    const digits = text.replace(/\D/g, "");
    let score = 0;
    if (jan && digits.includes(jan)) score += 300;
    if (target && name === target) score += 120;
    if (target && name.includes(target)) score += 80;
    if (model && name.includes(model)) score += 50;
    if (brand && name.includes(brand)) score += 25;
    return { item, price, score };
  }).filter(Boolean).sort((a: any, b: any) => b.score - a.score || a.price - b.price)[0] ?? null;
}

function keywordCandidates(p: { name: string; brand: string; model: string }) {
  const out: string[] = [];
  const name = cleanText(p.name);
  const brand = cleanText(p.brand);
  const model = cleanText(p.model);
  if (brand && model) out.push(`${brand} ${model}`);
  if (model) out.push(model);
  if (brand && name) out.push(`${brand} ${name.slice(0, 80)}`);
  if (name) out.push(name.slice(0, 100));
  return Array.from(new Set(out.filter(Boolean)));
}

type Product = { jan: string; name: string; brand: string; model: string };

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) return NextResponse.json({ error: "楽天APIの環境変数が未設定です。", results: [] }, { status: 503 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 }); }

  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw.map((p: any) => ({
    jan: cleanJan(p?.jan), name: cleanText(p?.name), brand: cleanText(p?.brand), model: cleanText(p?.model),
  }));
  const unique = Array.from(new Map(products.filter((p) => p.jan.length === 13).map((p) => [p.jan, p])).values());
  if (!unique.length) return NextResponse.json({ error: "有効な13桁JANの商品がありません。", results: [] }, { status: 400 });
  if (unique.length > 5) return NextResponse.json({ error: "1回の取得は最大5商品です。", results: [] }, { status: 400 });

  const results: any[] = [];
  for (let i = 0; i < unique.length; i += 1) {
    const p = unique[i];
    try {
      const r = await searchProduct(appId, accessKey, p.jan);
      if (r.response.ok) {
        const item = unwrapItems(r.data)[0];
        if (item) {
          // 新品最安値 = 中古を除く購入可能な最低価格。旧形式/欠損時はsalesMinPriceへフォールバック。
          const price = Number(item.usedExcludeSalesMinPrice ?? item.salesMinPrice ?? 0);
          if (Number.isFinite(price) && price > 0) {
            results.push({ jan: p.jan, price, productName: item.productName ?? p.name ?? null, productCode: item.productCode ?? p.jan, salesItemCount: Number(item.usedExcludeSalesItemCount ?? item.salesItemCount ?? 0) || null, source: "rakuten-product-search-new-only", error: null });
            if (i < unique.length - 1) await sleep(700);
            continue;
          }
        }
      }

      // 商品価格ナビで価格が取れない商品だけ、楽天市場の商品検索へフォールバック。
      let candidate: any = null;
      for (const keyword of [p.jan, ...keywordCandidates(p)]) {
        const r2 = await searchItems(appId, accessKey, keyword);
        if (r2.response.ok) {
          candidate = chooseItem(unwrapItems(r2.data), p);
          if (candidate) break;
        }
        await sleep(250);
      }
      if (candidate) {
        results.push({ jan: p.jan, price: candidate.price, productName: candidate.item.itemName ?? p.name ?? null, itemUrl: candidate.item.itemUrl ?? null, shopName: candidate.item.shopName ?? null, source: "rakuten-ichiba-item-search", error: null });
      } else {
        const detail = r.data?.error_description || r.data?.error || "楽天の商品価格ナビで新品価格を取得できませんでした。";
        results.push({ jan: p.jan, price: null, error: detail });
      }
    } catch (error: any) {
      results.push({ jan: p.jan, price: null, error: error?.name === "AbortError" ? "楽天APIがタイムアウトしました。" : error?.message || "楽天APIへの接続に失敗しました。" });
    }
    if (i < unique.length - 1) await sleep(700);
  }

  return NextResponse.json({ results });
}
