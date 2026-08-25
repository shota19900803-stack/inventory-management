import { NextRequest, NextResponse } from "next/server";

const YAHOO_ITEM_SEARCH_URL =
  "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch";

function cleanProductName(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .replace(/【\s*(中古|中古品|ユーズド|used)\s*】/gi, "")
    .replace(/\[\s*(中古|中古品|ユーズド|used)\s*\]/gi, "")
    .replace(/[（(]\s*(中古|中古品|ユーズド|used)\s*[）)]/gi, "")
    .replace(/\b中古品?\b/gi, "")
    .replace(/\bユーズド\b/gi, "")
    .replace(/\bused\b/gi, "")
    .replace(/【\s*(新品|未使用)\s*】/gi, "")
    .replace(/[（(]\s*(新品|未使用)\s*[）)]/gi, "")
    .replace(/送料無料|送料込み|送料込|即納|最安値/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s　]+|[\s　]+$/g, "")
    .replace(/[｜|]+$/g, "")
    .trim();
}

export async function GET(request: NextRequest) {
  const jan = (request.nextUrl.searchParams.get("jan") ?? "")
    .replace(/\D/g, "")
    .trim();

  if (!/^\d{13}$/.test(jan)) {
    return NextResponse.json(
      { found: false, error: "JANコードは13桁で指定してください。" },
      { status: 400 }
    );
  }

  const appId =
    process.env.YAHOO_CLIENT_ID ??
    process.env.YAHOO_APP_ID ??
    process.env.NEXT_PUBLIC_YAHOO_CLIENT_ID;

  if (!appId) {
    return NextResponse.json(
      {
        found: false,
        error:
          "Yahoo! Client IDが設定されていません。Vercelの環境変数 YAHOO_CLIENT_ID を確認してください。",
      },
      { status: 500 }
    );
  }

  const params = new URLSearchParams({
    appid: appId,
    jan_code: jan,
    results: "10",
    image_size: "300",
    sort: "-score",
  });

  try {
    const response = await fetch(
      `${YAHOO_ITEM_SEARCH_URL}?${params.toString()}`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Yahoo JAN search error:", response.status, data);
      return NextResponse.json(
        {
          found: false,
          error:
            response.status === 429
              ? "Yahoo! APIの利用制限に達しました。少し時間を置いて再試行してください。"
              : "Yahoo!の商品検索APIでエラーが発生しました。",
        },
        { status: response.status }
      );
    }

    const hits = Array.isArray(data?.hits) ? data.hits : [];
    const hit = hits.find(
      (item: { janCode?: string | number }) =>
        String(item?.janCode ?? "").replace(/\D/g, "") === jan
    );

    if (!hit) return NextResponse.json({ found: false });

    return NextResponse.json({
      found: true,
      product: {
        name: cleanProductName(hit.name),
        model_number: "",
        brand:
          typeof hit.brand?.name === "string" ? hit.brand.name : "",
        category:
          typeof hit.genreCategory?.name === "string"
            ? hit.genreCategory.name
            : "",
        jan_code: jan,
        image_url:
          typeof hit.exImage?.url === "string"
            ? hit.exImage.url
            : typeof hit.image?.medium === "string"
              ? hit.image.medium
              : "",
        price: typeof hit.price === "number" ? hit.price : null,
        url: typeof hit.url === "string" ? hit.url : "",
        source: "JAN商品情報",
      },
    });
  } catch (error) {
    console.error("JAN search request failed:", error);
    return NextResponse.json(
      { found: false, error: "JAN商品情報を取得できませんでした。" },
      { status: 502 }
    );
  }
}
