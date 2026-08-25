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
  const url = new URL(
    "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801"
  );

  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("productCode", jan);
  url.searchParams.set("hits", "1");
  url.searchParams.set(
    "elements",
    "productCode,productName,productNo,brandName,salesMinPrice,usedExcludeSalesMinPrice,salesItemCount,usedExcludeSalesItemCount"
  );

  return fetchJson(url, accessKey);
}

async function searchRakutenItems(
  appId: string,
  accessKey: string,
  keyword: string,
  sort = "+itemPrice"
) {
  const url = new URL(
    "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701"
  );

  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("hits", "30");
  url.searchParams.set("sort", sort);
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "1");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set(
    "elements",
    "itemName,itemPrice,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode"
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

function chooseItem(items: any[], productName: string, brand: string, model: string) {
  const target = normalize(productName);
  const brandN = normalize(brand);
  const modelN = normalize(model);
  const tokens = target.split(" ").filter((v) => v.length >= 2).slice(0, 8);

  const scored = items
    .map((item: any) => {
      const name = normalize(item?.itemName);
      if (!name) return null;

      const lowerOriginal = cleanText(item?.itemName).toLowerCase();
      if (/中古|中古品|ユーズド|used|ジャンク|開封済み|開封品|箱なし|欠品|訳あり|アウトレット|展示品|リファービッシュ|再生品/.test(lowerOriginal)) {
        return null;
      }

      const price = Number(item?.itemPrice ?? 0);
      if (!Number.isFinite(price) || price <= 0) return null;

      let score = 0;
      if (target && name === target) score += 100;
      if (target && name.includes(target)) score += 60;
      if (modelN && name.includes(modelN)) score += 35;
      if (brandN && name.includes(brandN)) score += 20;
      for (const token of tokens) if (name.includes(token)) score += 3;

      return { item, score, price };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score || a.price - b.price);

  return scored.length ? scored[0] : null;
}

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

  const products = rawProducts.length
    ? rawProducts.map((p: any) => ({
        jan: cleanJan(p?.jan),
        name: cleanText(p?.name),
        brand: cleanText(p?.brand),
        model: cleanText(p?.model),
      }))
    : rawJans.map((jan: unknown) => ({ jan: cleanJan(jan), name: "", brand: "", model: "" }));

  const unique = Array.from(
    new Map(products.filter((p: any) => p.jan.length === 13).map((p: any) => [p.jan, p])).values()
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

      // 第一候補：楽天の商品価格ナビ。JANをproductCodeとして正確に照合する。
      try {
        const productResult = await searchRakutenProduct(appId, accessKey, jan);
        const productItems = extractItems(productResult.data);
        const item = productItems[0];

        if (productResult.response.ok && item) {
          const newPrice = Number(item?.usedExcludeSalesMinPrice ?? 0);
          const newCount = Number(item?.usedExcludeSalesItemCount ?? 0);

          // 「新品最安値」なので、中古を含むsalesMinPriceは使わない。
          if (Number.isFinite(newPrice) && newPrice > 0 && newCount > 0) {
            results.push({
              jan,
              price: newPrice,
              productName: item?.productName ?? product.name ?? null,
              productCode: item?.productCode ?? jan,
              salesItemCount: newCount,
              source: "rakuten-product-search-new-only",
              error: null,
            });
            if (i < unique.length - 1) await sleep(700);
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

      // 第二候補：JAN検索。楽天市場側にJANが検索語として登録されている商品を拾う。
      let candidate: any = null;
      let itemApiError = "";

      try {
        const janResult = await searchRakutenItems(appId, accessKey, jan);
        if (janResult.response.ok) {
          candidate = chooseItem(extractItems(janResult.data), product.name, product.brand, product.model);
        } else {
          itemApiError =
            janResult.data?.error_description ||
            janResult.data?.error ||
            `楽天市場検索 HTTP ${janResult.response.status}`;
        }
      } catch (error: any) {
        itemApiError = error?.message || "楽天市場検索への接続に失敗しました。";
      }

      // 第三候補：商品名検索。JANが楽天の商品名に入っていないケースに対応する。
      if (!candidate && product.name) {
        try {
          const keyword = [product.name, product.model, product.brand]
            .filter(Boolean)
            .join(" ")
            .slice(0, 128);
          const nameResult = await searchRakutenItems(appId, accessKey, keyword);
          if (nameResult.response.ok) {
            candidate = chooseItem(extractItems(nameResult.data), product.name, product.brand, product.model);
          } else if (!itemApiError) {
            itemApiError =
              nameResult.data?.error_description ||
              nameResult.data?.error ||
              `商品名検索 HTTP ${nameResult.response.status}`;
          }
        } catch (error: any) {
          if (!itemApiError) itemApiError = error?.message || "商品名検索に失敗しました。";
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
            "楽天市場で新品価格を確認できませんでした。",
        });
      }
    } catch (error: any) {
      results.push({ jan, price: null, error: error?.message || "楽天APIへの接続に失敗しました。" });
    }

    if (i < unique.length - 1) await sleep(700);
  }

  return NextResponse.json({ results });
}
