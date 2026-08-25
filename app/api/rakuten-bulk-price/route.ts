import { NextRequest, NextResponse } from "next/server";

function cleanJan(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: URL, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, { cache: "no-store" });
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

/**
 * JANから楽天の商品価格ナビを直接検索する。
 *
 * 以前の実装では「楽天市場商品検索APIでJANをkeyword検索 →
 * 見つからなければ商品価格ナビ」という二段構えにしていたが、
 * JANコードをkeywordとして商品検索APIに投げると商品によっては
 * 正確に紐付かず、132件すべて取得失敗になるケースがあった。
 *
 * 商品価格ナビ製品検索APIはproductCode=JANを正式に受け付けるため、
 * こちらを第一経路にして、製品単位のsalesMinPriceを取得する。
 */
async function searchRakutenProduct(appId: string, accessKey: string, jan: string) {
  const url = new URL(
    "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801"
  );

  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("productCode", jan);
  url.searchParams.set("hits", "1");
  url.searchParams.set(
    "elements",
    "productCode,productName,productNo,salesMinPrice,usedExcludeSalesMinPrice,salesItemCount"
  );

  return fetchJson(url);
}

/**
 * Product Searchで取得できなかった場合だけ、楽天市場の商品検索APIを
 * JAN keywordでフォールバック検索する。
 */
async function searchRakutenItems(appId: string, accessKey: string, jan: string) {
  const url = new URL(
    "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701"
  );

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
  url.searchParams.set(
    "elements",
    "itemName,itemPrice,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode"
  );
  url.searchParams.set(
    "NGKeyword",
    "中古 中古品 ユーズド used ジャンク ジャンク品 開封済み 開封品 箱なし 箱欠品 欠品 訳あり アウトレット 展示品 リファービッシュ 再生品"
  );

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
    return NextResponse.json(
      { error: "JSONが不正です。", results: [] },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: "1回の取得は最大5商品です。", results: [] },
      { status: 400 }
    );
  }

  const results: any[] = [];

  for (let i = 0; i < jans.length; i += 1) {
    const jan = jans[i];

    try {
      // まずJANを正式なproductCodeとして商品価格ナビへ問い合わせる。
      const productResult = await searchRakutenProduct(appId, accessKey, jan);

      if (productResult.response.ok) {
        const item = Array.isArray(productResult.data?.items)
          ? productResult.data.items[0]
          : null;

        if (item) {
          const normalPrice = Number(item?.salesMinPrice ?? 0);
          const newOnlyPrice = Number(item?.usedExcludeSalesMinPrice ?? 0);

          // 新品除外版が返る場合はそれを優先。2026年3月以降nullになる場合が
          // あるため、その場合は通常のsalesMinPriceへフォールバックする。
          const price =
            Number.isFinite(newOnlyPrice) && newOnlyPrice > 0
              ? newOnlyPrice
              : Number.isFinite(normalPrice) && normalPrice > 0
              ? normalPrice
              : null;

          if (price != null) {
            results.push({
              jan,
              price,
              productName: item?.productName ?? null,
              productCode: item?.productCode ?? jan,
              salesItemCount: Number(item?.salesItemCount ?? 0),
              source: "rakuten-product-search",
              error: null,
            });

            if (i < jans.length - 1) await sleep(900);
            continue;
          }
        }
      }

      // 商品価格ナビで価格が取れない商品のみ、楽天市場の商品検索APIへフォールバック。
      const itemResult = await searchRakutenItems(appId, accessKey, jan);

      if (itemResult.response.ok) {
        const items = Array.isArray(itemResult.data?.items)
          ? itemResult.data.items
          : [];

        const candidate = items.find((item: any) => {
          const price = Number(item?.itemPrice ?? 0);
          return (
            Number(item?.availability ?? 0) === 1 &&
            Number.isFinite(price) &&
            price > 0
          );
        });

        if (candidate) {
          results.push({
            jan,
            price: Number(candidate.itemPrice),
            productName: candidate.itemName ?? null,
            itemUrl: candidate.itemUrl ?? null,
            shopName: candidate.shopName ?? null,
            source: "rakuten-ichiba-item-search-fallback",
            error: null,
          });
        } else {
          const productError = productResult.data?.error_description || productResult.data?.error;
          const itemError = itemResult.data?.error_description || itemResult.data?.error;
          results.push({
            jan,
            price: null,
            error:
              productError || itemError ||
              "楽天市場でこのJANに対応する価格が見つかりませんでした。",
          });
        }
      } else {
        results.push({
          jan,
          price: null,
          error:
            productResult.data?.error_description ||
            productResult.data?.error ||
            itemResult.data?.error_description ||
            itemResult.data?.error ||
            `楽天API HTTP ${itemResult.response.status}`,
        });
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
