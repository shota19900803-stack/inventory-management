import { NextRequest, NextResponse } from "next/server";

function cleanJan(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 13);
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/[\s　]+/g, " ").trim();
}

function normalize(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[【】\[\]（）()「」『』<>＜＞]/g, " ")
    .replace(/[^0-9a-zぁ-んァ-ヶ一-龠 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: URL, accessKey: string, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        accessKey,
      },
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) return { response, data };

    if ((response.status === 429 || response.status === 503) && attempt < retries) {
      await sleep(1800 * (attempt + 1));
      continue;
    }

    return { response, data };
  }

  throw new Error("楽天APIへの接続に失敗しました。");
}

async function searchRakutenProduct(appId: string, accessKey: string, jan: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("productCode", jan);
  // productCode(JAN)指定時は、hits等のサービス固有検索条件を併用しない。
  url.searchParams.set(
    "elements",
    "productCode,productName,productNo,brandName,itemCount,salesItemCount,usedExcludeCount,usedExcludeSalesItemCount,salesMinPrice,usedExcludeMinPrice,usedExcludeSalesMinPrice"
  );
  return fetchJson(url, accessKey);
}

async function searchRakutenItems(
  appId: string,
  accessKey: string,
  keyword: string,
  sort = "+itemPrice"
) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("keyword", keyword.slice(0, 128));
  url.searchParams.set("hits", "30");
  url.searchParams.set("sort", sort);
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "0");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set(
    "elements",
    "itemName,itemPrice,itemPriceMin1,itemPriceMin2,itemPriceMin3,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode"
  );
  url.searchParams.set(
    "NGKeyword",
    "中古 中古品 ユーズド used ジャンク ジャンク品 開封済み 開封品 箱なし 箱欠品 欠品 訳あり アウトレット 展示品 リファービッシュ 再生品"
  );
  return fetchJson(url, accessKey);
}

function extractItems(data: any) {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((entry: any) => entry?.item ?? entry).filter(Boolean);
}

function isExcludedItem(item: any) {
  const text = cleanText(`${item?.itemName ?? ""} ${item?.itemCaption ?? ""}`).toLowerCase();
  return /中古|中古品|ユーズド|used|ジャンク|開封済み|開封品|箱なし|箱欠品|欠品|訳あり|アウトレット|展示品|リファービッシュ|再生品/.test(text);
}

function chooseItem(items: any[], productName: string, brand: string, model: string, jan: string) {
  const target = normalize(productName);
  const brandN = normalize(brand);
  const modelN = normalize(model);
  const janN = cleanJan(jan);
  const targetTokens = target.split(" ").filter((v) => v.length >= 2).slice(0, 12);

  const scored = items
    .map((item: any) => {
      const name = normalize(item?.itemName);
      if (!name || isExcludedItem(item)) return null;

      const price = Number(item?.itemPrice ?? item?.itemPriceMin3 ?? item?.itemPriceMin2 ?? 0);
      if (!Number.isFinite(price) || price <= 0) return null;

      const original = cleanText(`${item?.itemName ?? ""} ${item?.itemCaption ?? ""}`);
      const digits = original.replace(/\D/g, "");
      let score = 0;

      if (janN && digits.includes(janN)) score += 200;
      if (target && name === target) score += 120;
      if (target && name.includes(target)) score += 80;
      if (modelN && name.includes(modelN)) score += 45;
      if (brandN && name.includes(brandN)) score += 25;
      for (const token of targetTokens) if (name.includes(token)) score += 4;

      return { item, score, price };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score || a.price - b.price);

  return scored.length ? scored[0] : null;
}

function buildKeywordCandidates(product: { name: string; brand: string; model: string }) {
  const candidates: string[] = [];
  const name = cleanText(product.name);
  const brand = cleanText(product.brand);
  const model = cleanText(product.model);

  if (model && brand) candidates.push(`${brand} ${model}`);
  if (model) candidates.push(model);
  if (brand && name) candidates.push(`${brand} ${name.slice(0, 80)}`);

  const tokens = normalize(name)
    .split(" ")
    .filter((token) => token.length >= 2)
    .slice(0, 5);
  if (tokens.length) candidates.push(tokens.join(" "));
  if (name) candidates.push(name.slice(0, 100));

  return Array.from(new Set(candidates.filter(Boolean)));
}

type RakutenProduct = {
  jan: string;
  name: string;
  brand: string;
  model: string;
};

export async function POST(request: NextRequest) {
  const appId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (!appId || !accessKey) {
    return NextResponse.json(
      { error: "楽天APIの環境変数が未設定です。", results: [] },
      { status: 503 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSONが不正です。", results: [] }, { status: 400 });
  }

  const rawProducts = Array.isArray(body?.products) ? body.products : [];
  const rawJans = Array.isArray(body?.jans) ? body.jans : [];

  const products: RakutenProduct[] = rawProducts.length
    ? rawProducts.map((p: any) => ({
        jan: cleanJan(p?.jan),
        name: cleanText(p?.name),
        brand: cleanText(p?.brand),
        model: cleanText(p?.model),
      }))
    : rawJans.map((jan: unknown) => ({ jan: cleanJan(jan), name: "", brand: "", model: "" }));

  const unique: RakutenProduct[] = Array.from(
    new Map<string, RakutenProduct>(products.filter((p) => p.jan.length === 13).map((p) => [p.jan, p])).values()
  );

  if (unique.length > 5) {
    return NextResponse.json({ error: "1回の取得は最大5商品です。", results: [] }, { status: 400 });
  }

  const results: any[] = [];

  for (let i = 0; i < unique.length; i += 1) {
    const product = unique[i];
    const jan = product.jan;

    try {
      let productApiError = "";
      let productApiSeen = false;

      // ① JAN完全一致：楽天商品価格ナビ
      try {
        const productResult = await searchRakutenProduct(appId, accessKey, jan);
        const productItems = extractItems(productResult.data);
        const item = productItems[0];

        if (productResult.response.ok && item) {
          productApiSeen = true;
          const newPrice = Number(item?.usedExcludeSalesMinPrice ?? 0);
          const newCount = Number(item?.usedExcludeSalesItemCount ?? 0);

          if (Number.isFinite(newPrice) && newPrice > 0) {
            results.push({
              jan,
              price: newPrice,
              productName: item?.productName ?? product.name ?? null,
              productCode: item?.productCode ?? jan,
              salesItemCount: newCount || null,
              source: "rakuten-product-search-new-only",
              error: null,
            });
            if (i < unique.length - 1) await sleep(900);
            continue;
          }
        } else {
          productApiError =
            productResult.data?.error_description ||
            productResult.data?.error ||
            `商品価格ナビ HTTP ${productResult.response.status}`;
        }
      } catch (error: any) {
        productApiError = error?.message || "商品価格ナビへの接続に失敗しました。";
      }

      // ② JANを楽天市場の商品名・説明文から検索
      let candidate: any = null;
      let itemApiError = "";
      try {
        const janResult = await searchRakutenItems(appId, accessKey, jan);
        if (janResult.response.ok) {
          candidate = chooseItem(extractItems(janResult.data), product.name, product.brand, product.model, jan);
        } else {
          itemApiError =
            janResult.data?.error_description ||
            janResult.data?.error ||
            `楽天市場JAN検索 HTTP ${janResult.response.status}`;
        }
      } catch (error: any) {
        itemApiError = error?.message || "楽天市場JAN検索への接続に失敗しました。";
      }

      // ③ 商品名・ブランド・型番の複数パターンで検索
      if (!candidate && product.name) {
        const keywords = buildKeywordCandidates(product);
        for (const keyword of keywords) {
          try {
            const nameResult = await searchRakutenItems(appId, accessKey, keyword);
            if (nameResult.response.ok) {
              candidate = chooseItem(
                extractItems(nameResult.data),
                product.name,
                product.brand,
                product.model,
                jan
              );
              if (candidate) break;
            } else if (!itemApiError) {
              itemApiError =
                nameResult.data?.error_description ||
                nameResult.data?.error ||
                `楽天市場商品名検索 HTTP ${nameResult.response.status}`;
            }
          } catch (error: any) {
            if (!itemApiError) itemApiError = error?.message || "楽天市場商品名検索に失敗しました。";
          }
          await sleep(250);
        }
      }

      if (candidate) {
        results.push({
          jan,
          price: candidate.price,
          productName: candidate.item?.itemName ?? product.name ?? null,
          itemUrl: candidate.item?.itemUrl ?? null,
          shopName: candidate.item?.shopName ?? null,
          source: "rakuten-ichiba-item-search-new-filtered",
          error: null,
        });
      } else {
        results.push({
          jan,
          price: null,
          error:
            productApiError ||
            itemApiError ||
            (productApiSeen
              ? "楽天の商品価格ナビには製品がありますが、新品購入可能価格を取得できませんでした。"
              : "楽天市場で新品価格を確認できませんでした。"),
        });
      }
    } catch (error: any) {
      results.push({
        jan,
        price: null,
        error: error?.message || "楽天APIへの接続に失敗しました。",
      });
    }

    if (i < unique.length - 1) await sleep(900);
  }

  return NextResponse.json({ results });
}
