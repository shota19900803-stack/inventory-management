import { NextRequest, NextResponse } from "next/server";

function cleanJan(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const jans = Array.from(new Set(rawJans.map((v: unknown) => cleanJan(String(v))).filter((v: string) => v.length === 13)));

  // API負荷と429対策のため、一度に処理するJANは最大5件。
  if (jans.length > 5) {
    return NextResponse.json({ error: "1回の取得は最大5商品です。", results: [] }, { status: 400 });
  }

  const results: any[] = [];

  for (let i = 0; i < jans.length; i += 1) {
    const jan = jans[i];
    try {
      const url = new URL("https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801");
      url.searchParams.set("format", "json");
      url.searchParams.set("formatVersion", "2");
      url.searchParams.set("applicationId", appId);
      url.searchParams.set("accessKey", accessKey);
      url.searchParams.set("productCode", jan);
      url.searchParams.set("hits", "1");
      url.searchParams.set(
        "elements",
        "productCode,productName,usedExcludeSalesMinPrice,salesMinPrice,usedExcludeSalesItemCount,salesItemCount"
      );

      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        results.push({ jan, price: null, error: data?.error_description || data?.error || `HTTP ${response.status}` });
      } else {
        const item = Array.isArray(data?.items) ? data.items[0] : null;
        const price = Number(item?.usedExcludeSalesMinPrice ?? item?.salesMinPrice ?? 0);
        results.push({
          jan,
          price: Number.isFinite(price) && price > 0 ? price : null,
          productName: item?.productName ?? null,
          usedExcludeSalesItemCount: item?.usedExcludeSalesItemCount ?? null,
          salesItemCount: item?.salesItemCount ?? null,
          error: null,
        });
      }
    } catch (error: any) {
      results.push({ jan, price: null, error: error?.message || "楽天APIへの接続に失敗しました。" });
    }

    if (i < jans.length - 1) await sleep(500);
  }

  return NextResponse.json({ results });
}
