import { NextRequest, NextResponse } from "next/server";

type Product = {
  jan: string;
  name: string;
  brand: string;
  model: string;
};

type DebugEntry = {
  api: string;
  status?: number;
  count?: number;
  message?: string;
  price?: number | null;
};

const PRODUCT_API =
  "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";
const ICHIBA_API =
  "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";

const cleanJan = (v: unknown) =>
  String(v ?? "").replace(/\D/g, "").slice(0, 13);

const cleanText = (v: unknown) =>
  String(v ?? "").replace(/[\s　]+/g, " ").trim();

const normalize = (v: unknown) =>
  cleanText(v)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[【】\[\]（）()「」『』<>＜＞]/g, " ")
    .replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const EXCLUDED_WORDS = [
  "中古",
  "中古品",
  "ユーズド",
  "used",
  "ジャンク",
  "ジャンク品",
  "開封済み",
  "開封済",
  "開封品",
  "箱なし",
  "箱無",
  "欠品",
  "訳あり",
  "アウトレット",
  "展示品",
  "リファービッシュ",
  "再生品",
  "難あり",
  "現状品",
  "動作未確認",
];

function priceOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function itemsOf(data: any): any[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((x: any) => x?.item ?? x).filter(Boolean);
}

function isExcluded(item: any) {
  const text = cleanText(
    `${item?.itemName ?? ""} ${item?.catchcopy ?? ""}`
  ).toLowerCase();
  return EXCLUDED_WORDS.some((word) => text.includes(word.toLowerCase()));
}

async function fetchJson(url: URL, accessKey: string, timeoutMs = 10000) {
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
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 1000) };
    }

    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * JAN -> Rakuten Product Search.
 * Product Search is the authoritative identity lookup. When Rakuten has
 * current price information for the JAN, use usedExcludeSalesMinPrice
 * directly: it means the lowest purchasable price excluding used items.
 */
async function lookupProductByJan(
  appId: string,
  accessKey: string,
  jan: string,
  debug: DebugEntry[]
) {
  const url = new URL(PRODUCT_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("productCode", jan);

  const { response, data } = await fetchJson(url, accessKey);
  const items = itemsOf(data);
  const product = items[0] ?? null;
  const directPrice = priceOf(product?.usedExcludeSalesMinPrice);

  debug.push({
    api: "ProductSearch(JAN)",
    status: response.status,
    count: Number(data?.count ?? items.length),
    price: directPrice,
  });

  if (!response.ok) {
    debug.push({
      api: "ProductSearch(JAN)",
      message:
        data?.error_description || data?.error || `HTTP ${response.status}`,
    });
    return null;
  }

  return {
    product,
    directPrice,
  };
}

function extractModels(text: string) {
  const matches = text.match(/\b[A-Z]{1,10}-[A-Z0-9]{2,}\b/gi) ?? [];
  return Array.from(new Set(matches.map((x) => x.toUpperCase())));
}

function meaningfulNameTokens(text: string) {
  const generic = new Set([
    "bandai",
    "spirits",
    "mg",
    "hg",
    "rg",
    "pg",
    "1",
    "100",
    "144",
    "24",
    "64",
  ]);

  return normalize(text)
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .filter((x) => !generic.has(x));
}

function compactNameQuery(name: string) {
  const tokens = meaningfulNameTokens(name);
  return tokens.slice(0, 5).join(" ");
}

function makeFallbackQueries(p: Product, canonical: any) {
  const sourceName = cleanText(canonical?.productName || p.name);
  const model = cleanText(p.model || canonical?.productNo || "");
  const brand = cleanText(p.brand || canonical?.brandName || "");
  const models = extractModels(`${p.name} ${sourceName}`);
  const code = model || models[0] || "";
  const shortName = compactNameQuery(sourceName);

  const queries = [
    code,
    code && shortName ? `${code} ${shortName}` : "",
    shortName,
    brand && code ? `${brand} ${code}` : "",
  ];

  return Array.from(
    new Set(queries.map(cleanText).filter((q) => q.length >= 2))
  ).slice(0, 4);
}

async function searchIchiba(
  appId: string,
  accessKey: string,
  keyword: string,
  debug: DebugEntry[]
) {
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
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set(
    "elements",
    "itemName,catchcopy,itemPrice,itemPriceMin3,itemCaption,itemUrl,shopName,shopUrl,itemCode"
  );

  const { response, data } = await fetchJson(url, accessKey);
  const items = itemsOf(data);

  debug.push({
    api: `IchibaItemSearch:${keyword.slice(0, 40)}`,
    status: response.status,
    count: Number(data?.count ?? items.length),
  });

  if (!response.ok) {
    debug.push({
      api: "IchibaItemSearch",
      message:
        data?.error_description || data?.error || `HTTP ${response.status}`,
    });
    return [];
  }

  return items;
}

function chooseFallbackItem(items: any[], p: Product, canonical: any) {
  const jan = cleanJan(p.jan);
  const modelValues = [
    p.model,
    canonical?.productNo,
    ...extractModels(`${p.name} ${canonical?.productName ?? ""}`),
  ]
    .map(normalize)
    .map((x) => x.replace(/\s+/g, ""))
    .filter((x) => x.length >= 2);

  const wantedNameTokens = meaningfulNameTokens(
    canonical?.productName || p.name
  );

  const candidates = items
    .map((item: any) => {
      if (!item || isExcluded(item)) return null;

      const price = priceOf(item?.itemPriceMin3) ?? priceOf(item?.itemPrice);
      if (price == null) return null;

      const text = cleanText(
        `${item?.itemName ?? ""} ${item?.catchcopy ?? ""} ${item?.itemCode ?? ""}`
      );
      const normalizedText = normalize(text).replace(/\s+/g, "");
      const digits = text.replace(/\D/g, "");

      const hasJan = jan.length === 13 && digits.includes(jan);
      const hasModel = modelValues.some((model) =>
        normalizedText.includes(model)
      );
      const matchedNameTokens = wantedNameTokens.filter((token) =>
        normalizedText.includes(token.replace(/\s+/g, ""))
      ).length;

      // Strong match: exact JAN or model. Name-only fallback needs at least
      // two meaningful tokens so a broad query cannot return an unrelated item.
      const identityMatch = hasJan || hasModel || matchedNameTokens >= 2;
      if (!identityMatch) return null;

      let score = 0;
      if (hasJan) score += 1_000_000;
      if (hasModel) score += 100_000;
      score += Math.min(matchedNameTokens, 10) * 1_000;

      return { item, price, score };
    })
    .filter(Boolean) as Array<{ item: any; price: number; score: number }>;

  candidates.sort((a, b) => b.score - a.score || a.price - b.price);
  return candidates[0] ?? null;
}

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (!appId || !accessKey) {
    return NextResponse.json(
      {
        error:
          "楽天APIの環境変数が未設定です。Vercelの RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY を確認してください。",
        results: [],
      },
      { status: 503 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSONが不正です。", results: [] },
      { status: 400 }
    );
  }

  const raw = Array.isArray(body?.products) ? body.products : [];
  const products: Product[] = raw.map((p: any) => ({
    jan: cleanJan(p?.jan),
    name: cleanText(p?.name),
    brand: cleanText(p?.brand),
    model: cleanText(p?.model),
  }));

  const unique = Array.from(
    new Map(
      products
        .filter((p) => p.jan.length === 13)
        .map((p) => [p.jan, p])
    ).values()
  );

  if (!unique.length) {
    return NextResponse.json(
      { error: "有効な13桁JANの商品がありません。", results: [] },
      { status: 400 }
    );
  }

  if (unique.length > 5) {
    return NextResponse.json(
      { error: "1回の取得は最大5商品です。", results: [] },
      { status: 400 }
    );
  }

  const results: any[] = [];

  for (const p of unique) {
    const started = Date.now();
    const debug: DebugEntry[] = [];

    try {
      const canonicalResult = await lookupProductByJan(
        appId,
        accessKey,
        p.jan,
        debug
      );
      const canonical = canonicalResult?.product ?? null;

      // First choice: Rakuten Product Search's own aggregate price.
      // This is exactly the metric we want: purchasable lowest price
      // excluding used items.
      if (canonicalResult?.directPrice != null) {
        results.push({
          jan: p.jan,
          price: canonicalResult.directPrice,
          productName: canonical?.productName ?? p.name,
          itemUrl: canonical?.productUrlPC ?? null,
          shopName: null,
          source: "rakuten-product-search-used-exclude-sales-min-price",
          matchedBy: "JAN",
          elapsedMs: Date.now() - started,
          debug,
          error: null,
        });
        continue;
      }

      // Product Search can legitimately have no current purchasable new
      // price. In that case, search actual Ichiba listings as a fallback.
      const queries = makeFallbackQueries(p, canonical);
      let chosen: { item: any; price: number; score: number } | null = null;
      let matchedBy: string | null = null;

      for (const query of queries) {
        const items = await searchIchiba(appId, accessKey, query, debug);
        const candidate = chooseFallbackItem(items, p, canonical);
        if (candidate) {
          chosen = candidate;
          matchedBy = query;
          break;
        }
      }

      if (chosen) {
        results.push({
          jan: p.jan,
          price: chosen.price,
          productName: chosen.item.itemName ?? canonical?.productName ?? p.name,
          itemUrl: chosen.item.itemUrl ?? null,
          shopName: chosen.item.shopName ?? null,
          source: "rakuten-ichiba-item-search",
          matchedBy,
          elapsedMs: Date.now() - started,
          debug,
          error: null,
        });
      } else {
        results.push({
          jan: p.jan,
          price: null,
          productName: canonical?.productName ?? p.name,
          elapsedMs: Date.now() - started,
          debug,
          error:
            "楽天の購入可能な新品価格が取得できませんでした。商品自体に新品在庫がない場合もあります。",
        });
      }
    } catch (error: any) {
      results.push({
        jan: p.jan,
        price: null,
        elapsedMs: Date.now() - started,
        debug,
        error:
          error?.name === "AbortError"
            ? "楽天APIが10秒以内に応答しませんでした。"
            : error?.message || "楽天APIへの接続に失敗しました。",
      });
    }
  }

  return NextResponse.json({ results });
}
