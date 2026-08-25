import { NextRequest, NextResponse } from "next/server";

function cleanJan(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const USED_PATTERN = /(中古|ユーズド|used|ジャンク|開封済み|開封品|箱なし|箱欠品|欠品|訳あり|アウトレット|展示品|リファービッシュ|再生品)/i;

async function fetchJson(url: URL, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (response.ok) return { response, data };

    if (response.status === 429 && attempt < retries) {
      await sleep(1500 * (attempt + 1));
      continue;
    }

    return { response, data };
  }
  throw new Error("楽天APIへの接続に失敗しました。");
}

async function searchRakutenItems(appId: string, accessKey: string, jan: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("keyword", jan);
  url.searchParams.set("hits", "30");
  url.searchParams.set("sort", "+itemPrice");
  url.searchParams.set("availability", "1");
  url.searchParams.set("field", "1");
  url.searchParams.set("purchaseType", "0");
  url.searchParams.set("elements", "itemName,itemPrice,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode");
  url.searchParams.set(
    "NGKeyword",
    "中古 中古品 ユーズド used ジャンク ジャンク品 開封済み 開封品 箱なし 箱欠品 欠品 訳あり アウトレット 展示品 リファービッシュ 再生品"
  );

  return fetchJson(url);
}

async function searchProductByJan(appId: string, accessKey: string, jan: string) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);
  url.searchParams.set("hits", "1");
  url.searchParams.set("elements", "productCode,productName,productNo,salesMinPrice,salesItemCount");
  return fetchJson(url);
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

  const rawJans = Array.isArray(body?.jans) ? body.jans : [];
  const jans: string[] = Array.from(
    new Set(
      rawJans
        .map((v: unknown) => cleanJan(String(v)))
        .filter((v: string) => v.length === 13)
    )
  );

  if (jans.length > 5) {
    return NextResponse.json({ error: "1回の取得は最大5商品です。", results: [] }, { status: 400 });
  }

  const results: any[] = [];

  for (let i = 0; i < jans.length; i += 1) {
    const jan = jans[i];

    try {
      // まず楽天市場の商品検索APIでJANそのものを検索する。
      // 商品価格ナビの usedExcludeSalesMinPrice は2026年3月以降nullになるケースがあるため、
      // 新品最安値は実際の販売商品から判定する。
      let { response, data } = await searchRakutenItems(appId, accessKey, jan);

      if (!response.ok) {
        results.push({
          jan,
          price: null,
          error: `楽天商品検索API HTTP ${response.status}: ${data?.error_description || data?.error || "不明なエラー"}`,
        });
      } else {
        let items = Array.isArray(data?.items) ? data.items : [];
        let candidate = items.find((item: any) => {
          const price = Number(item?.itemPrice ?? 0);
          const name = String(item?.itemName || "");
          const caption = String(item?.itemCaption || "");
          return Number(item?.availability ?? 0) === 1 && Number.isFinite(price) && price > 0 && !USED_PATTERN.test(name) && !USED_PATTERN.test(caption);
        });

        // JAN検索でヒットしない場合は商品価格ナビでJAN→商品名を取得し、
        // その商品名を使って楽天市場側を再検索する。
        if (!candidate) {
          const productResponse = await searchProductByJan(appId, accessKey, jan);
          if (productResponse.response.ok) {
            const product = Array.isArray(productResponse.data?.items) ? productResponse.data.items[0] : null;
            const productName = String(product?.productName || "").trim();

            if (productName) {
              const fallbackUrl = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
              fallbackUrl.searchParams.set("format", "json");
              fallbackUrl.searchParams.set("formatVersion", "2");
              fallbackUrl.searchParams.set("applicationId", appId);
              fallbackUrl.searchParams.set("accessKey", accessKey);
              fallbackUrl.searchParams.set("keyword", productName.slice(0, 120));
              fallbackUrl.searchParams.set("hits", "30");
              fallbackUrl.searchParams.set("sort", "+itemPrice");
              fallbackUrl.searchParams.set("availability", "1");
              fallbackUrl.searchParams.set("field", "1");
              fallbackUrl.searchParams.set("purchaseType", "0");
              fallbackUrl.searchParams.set("elements", "itemName,itemPrice,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode");
              fallbackUrl.searchParams.set("NGKeyword", "中古 中古品 ユーズド used ジャンク ジャンク品 開封済み 開封品 箱なし 箱欠品 欠品 訳あり アウトレット 展示品 リファービッシュ 再生品");

              const fallback = await fetchJson(fallbackUrl);
              if (fallback.response.ok) {
                items = Array.isArray(fallback.data?.items) ? fallback.data.items : [];
                candidate = items.find((item: any) => {
                  const price = Number(item?.itemPrice ?? 0);
                  const name = String(item?.itemName || "");
                  const caption = String(item?.itemCaption || "");
                  return Number(item?.availability ?? 0) === 1 && Number.isFinite(price) && price > 0 && !USED_PATTERN.test(name) && !USED_PATTERN.test(caption);
                });
              }
            }
          }
        }

        if (!candidate) {
          results.push({
            jan,
            price: null,
            error: "楽天市場でJANに一致する新品販売商品が見つかりませんでした。",
          });
        } else {
          results.push({
            jan,
            price: Number(candidate.itemPrice),
            productName: candidate.itemName ?? null,
            itemUrl: candidate.itemUrl ?? null,
            shopName: candidate.shopName ?? null,
            source: "rakuten-ichiba-item-search",
            error: null,
          });
        }
      }
    } catch (error: any) {
      results.push({
        jan,
        price: null,
        error: error?.message || "楽天APIへの接続に失敗しました。",
      });
    }

    if (i < jans.length - 1) await sleep(900);
  }

  return NextResponse.json({ results });
}
