import { NextRequest, NextResponse } from "next/server";

type Product = { jan: string; name: string; brand: string; model: string };
type ProductHit = {
  productId?: string | number;
  productCode?: string;
  productName?: string;
  productNo?: string;
  brandName?: string;
  makerName?: string;
  productUrlPC?: string;
  salesItemCount?: number | string;
  usedExcludeSalesItemCount?: number | string;
  salesMinPrice?: number | string;
  usedExcludeSalesMinPrice?: number | string;
};
type DebugEntry = {
  api: string;
  query?: string;
  status?: number;
  count?: number;
  returned?: number;
  message?: string;
  elapsedMs?: number;
  sample?: Array<{
    name: string;
    price: number | null;
    url: string | null;
    shop: string | null;
  }>;
};

const PRODUCT_API = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";

const cleanJan = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);
const cleanText = (v: unknown) => String(v ?? "").replace(/[\s　]+/g, " ").trim();
const priceOf = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function productHitsOf(data: any): ProductHit[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.product ?? x?.item ?? x).filter(Boolean);
}

async function productSearchByJan(
  appId: string,
  accessKey: string,
  jan: string,
  debug: DebugEntry,
) {
  const started = Date.now();
  const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);

  // IMPORTANT: Rakuten's Product Search API documents productCode (JAN) as
  // mutually exclusive with service-specific search parameters. In the JAN
  // lookup route, do NOT send hits/elements/etc. Sending them together can
  // turn an otherwise valid JAN lookup into an API error.
  url.searchParams.set("productCode", jan);

  debug.api = "ProductSearch(JAN)";
  debug.query = jan;

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
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 1000) };
    }

    const hits = productHitsOf(data);
    debug.status = response.status;
    debug.count = Number(data?.count ?? hits.length);
    debug.returned = hits.length;
    debug.elapsedMs = Date.now() - started;
    debug.message = response.ok
      ? undefined
      : data?.error_description || data?.error || text.slice(0, 500);
    debug.sample = hits.slice(0, 3).map((p) => ({
      name: cleanText(`${p.productName ?? ""} ${p.productNo ?? ""} ${p.brandName ?? ""}`),
      price: priceOf(p.usedExcludeSalesMinPrice) ?? priceOf(p.salesMinPrice),
      url: p.productUrlPC ?? null,
      shop: p.makerName ?? p.brandName ?? null,
    }));

    return { response, hits };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (!appId || !accessKey) {
    return NextResponse.json(
      { error: "楽天APIの環境変数が未設定です。", results: [] },
      { status: 503 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSONが不正です。", results: [] },
      { status: 400 },
    );
  }

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

  if (!unique.length) {
    return NextResponse.json(
      { error: "有効な13桁JANの商品がありません。", results: [] },
      { status: 400 },
    );
  }

  const results: any[] = [];

  // One JAN = one Product Search request.
  for (const p of unique) {
    const debug: DebugEntry = { api: "ProductSearch(JAN)", query: p.jan };
    const started = Date.now();

    try {
      const { response, hits } = await productSearchByJan(appId, accessKey, p.jan, debug);
      const hit = hits[0];

      if (!response.ok) {
        const is429 = response.status === 429;
        results.push({
          jan: p.jan,
          price: null,
          productName: p.name,
          candidateCount: 0,
          elapsedMs: Date.now() - started,
          debug: [debug],
          error: is429
            ? "楽天APIがアクセス制限(429)を返しました。少し時間を置いて再検索してください。"
            : `楽天Product Search ${response.status}: ${debug.message || "APIエラー"}`,
        });
        continue;
      }

      if (!hit) {
        results.push({
          jan: p.jan,
          price: null,
          productName: p.name,
          candidateCount: 0,
          elapsedMs: Date.now() - started,
          debug: [debug],
          error: "このJANに一致する楽天プロダクト製品が見つかりませんでした。",
        });
        continue;
      }

      const newLowest = priceOf(hit.usedExcludeSalesMinPrice);
      const fallbackLowest = priceOf(hit.salesMinPrice);
      const price = newLowest ?? fallbackLowest;
      const salesCount = Number(hit.usedExcludeSalesItemCount ?? hit.salesItemCount ?? 0);

      results.push({
        jan: p.jan,
        price,
        productName: cleanText(hit.productName) || p.name,
        itemUrl: hit.productUrlPC ?? null,
        shopName: hit.makerName ?? hit.brandName ?? null,
        source: "Rakuten Product Search",
        matchedBy: "JAN",
        candidateCount: salesCount,
        elapsedMs: Date.now() - started,
        resolvedProduct: {
          productId: hit.productId ?? null,
          productCode: hit.productCode ?? p.jan,
          productName: hit.productName ?? null,
          productNo: hit.productNo ?? null,
          brandName: hit.brandName ?? null,
          makerName: hit.makerName ?? null,
          productUrlPC: hit.productUrlPC ?? null,
        },
        priceSource: newLowest != null
          ? "usedExcludeSalesMinPrice"
          : fallbackLowest != null
            ? "salesMinPrice(fallback)"
            : null,
        salesItemCount: Number(hit.salesItemCount ?? 0),
        usedExcludeSalesItemCount: Number(hit.usedExcludeSalesItemCount ?? 0),
        salesMinPrice: fallbackLowest,
        usedExcludeSalesMinPrice: newLowest,
        debug: [debug],
        error: price == null ? "楽天プロダクトは見つかりましたが新品最安値が取得できませんでした。" : null,
      });
    } catch (error: any) {
      results.push({
        jan: p.jan,
        price: null,
        productName: p.name,
        elapsedMs: Date.now() - started,
        debug: [debug],
        error:
          error?.name === "AbortError"
            ? "楽天APIが12秒以内に応答しませんでした。"
            : error?.message || "楽天APIへの接続に失敗しました。",
      });
    }
  }

  return NextResponse.json({ results });
}
