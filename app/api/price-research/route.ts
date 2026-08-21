import { NextRequest, NextResponse } from "next/server";

function cleanJan(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

export async function GET(request: NextRequest) {
  const jan = cleanJan(request.nextUrl.searchParams.get("jan") || "");

  if (jan.length !== 13) {
    return NextResponse.json(
      { error: "13桁のJANコードを指定してください。" },
      { status: 400 }
    );
  }

  const result: any = {
    jan,
    rakuten: { available: false, lowestPrice: null, items: [], error: null },
    amazon: { available: false, lowestPrice: null, items: [], error: null },
    price2alert: `https://price2alert.com/search?i=All&kwd=${jan}`,
  };

  // Rakuten Product Search API (2025-08-01)
  const rakutenAppId = process.env.RAKUTEN_APPLICATION_ID;
  const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (rakutenAppId && rakutenAccessKey) {
    try {
      const url = new URL(
        "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801"
      );
      url.searchParams.set("format", "json");
      url.searchParams.set("formatVersion", "2");
      url.searchParams.set("applicationId", rakutenAppId);
      url.searchParams.set("accessKey", rakutenAccessKey);
      url.searchParams.set("productCode", jan);
      url.searchParams.set("hits", "30");

      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        result.rakuten.error = data?.error_description || data?.error || `HTTP ${response.status}`;
      } else {
        const items = Array.isArray(data?.items) ? data.items : [];
        const mapped = items
          .map((item: any) => ({
            name: item.itemName ?? item.productName ?? null,
            price: Number(item.itemPrice ?? item.salesMinPrice ?? item.minPrice ?? 0),
            shopName: item.shopName ?? item.shop?.shopName ?? null,
            itemUrl: item.itemUrl ?? item.itemUrlPC ?? null,
            shopUrl: item.shopUrl ?? null,
          }))
          .filter((item: any) => Number.isFinite(item.price) && item.price > 0)
          .sort((a: any, b: any) => a.price - b.price);

        result.rakuten.available = true;
        result.rakuten.items = mapped.slice(0, 10);
        result.rakuten.lowestPrice = mapped[0]?.price ?? null;
      }
    } catch (error: any) {
      result.rakuten.error = error?.message || "楽天APIへの接続に失敗しました。";
    }
  } else {
    result.rakuten.error = "楽天APIの環境変数が未設定です。";
  }

  // Amazon Creators API credentials are intentionally server-side only.
  // We do not scrape Amazon pages. The official API currently exposes featured offer listings.
  // Add the Amazon adapter when the user's Creators API credentials are configured.
  const amazonConfigured = Boolean(
    process.env.AMAZON_CREDENTIAL_ID &&
      process.env.AMAZON_CREDENTIAL_SECRET &&
      process.env.AMAZON_REFRESH_TOKEN
  );

  if (!amazonConfigured) {
    result.amazon.error =
      "Amazon Creators APIの認証情報が未設定です。現在はAmazonの商品ページへのリンクを表示できます。";
  } else {
    result.amazon.error =
      "Amazon Creators API接続準備済み。認証情報を設定後、公式APIのOffer情報を取得します。";
  }

  result.amazon.productUrl = `https://www.amazon.co.jp/s?k=${jan}`;

  return NextResponse.json(result);
}
