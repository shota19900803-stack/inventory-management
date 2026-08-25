import { NextRequest, NextResponse } from "next/server";

function cleanJan(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rakuten Product Search API の usedExcludeSalesMinPrice は、現在のAPI仕様では
 * 値を取得できないケースがあるため、新品最安値は Ichiba Item Search API から
 * 実際に購入可能な商品を価格順で取得して判定する。
 *
 * 中古・ジャンク等の表記を除外し、通常購入かつ在庫ありの最安商品を採用する。
 * 楽天APIには「新品のみ」という直接の絞り込みパラメータがないため、
 * これは楽天市場の掲載情報から新品候補を判定する実用的なフォールバック。
 */
const NEW_ITEM_NG_KEYWORDS = [
  "中古",
  "中古品",
  "ユーズド",
  "used",
  "ジャンク",
  "ジャンク品",
  "開封済み",
  "開封品",
  "箱なし",
  "箱欠品",
  "欠品",
  "訳あり",
  "アウトレット",
  "展示品",
  "リファービッシュ",
  "再生品",
].join(" ");

async function fetchJson(url: URL, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (response.ok) return { response, data };

    if (response.status === 429 && attempt < retries) {
      await sleep(1200 * (attempt + 1));
      continue;
    }

    return { response, data };
  }

  throw new Error("楽天APIへの接続に失敗しました。");
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

  // API負荷と429対策のため、一度に処理するJANは最大5件。
  if (jans.length > 5) {
    return NextResponse.json({ error: "1回の取得は最大5商品です。", results: [] }, { status: 400 });
  }

  const results: any[] = [];

  for (let i = 0; i < jans.length; i += 1) {
    const jan: string = jans[i];

    try {
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
      url.searchParams.set("NGKeyword", NEW_ITEM_NG_KEYWORDS);
      url.searchParams.set(
        "elements",
        "itemName,itemPrice,itemCaption,itemUrl,availability,shopName,shopUrl,itemCode"
      );

      const { response, data } = await fetchJson(url);

      if (!response.ok) {
        results.push({
          jan,
          price: null,
          error: data?.error_description || data?.error || `HTTP ${response.status}`,
        });
      } else {
        const items = Array.isArray(data?.items) ? data.items : [];

        // 念のためAPIのNGKeywordだけに依存せず、商品名・説明文にも中古系語句が
        // 残っていないか再確認する。価格の安い順なので最初に残った商品が新品候補。
        const usedPattern = /(中古|ユーズド|used|ジャンク|開封済み|開封品|箱なし|箱欠品|欠品|訳あり|アウトレット|展示品|リファービッシュ|再生品)/i;
        const newCandidate = items.find((item: any) => {
          if (Number(item?.availability ?? 0) !== 1) return false;
          const name = String(item?.itemName || "");
          const caption = String(item?.itemCaption || "");
          const price = Number(item?.itemPrice ?? 0);
          return Number.isFinite(price) && price > 0 && !usedPattern.test(name) && !usedPattern.test(caption);
        });

        if (!newCandidate) {
          results.push({
            jan,
            price: null,
            productName: null,
            error: "楽天市場で新品と判定できる販売商品が見つかりませんでした。",
          });
        } else {
          results.push({
            jan,
            price: Number(newCandidate.itemPrice),
            productName: newCandidate.itemName ?? null,
            itemUrl: newCandidate.itemUrl ?? null,
            shopName: newCandidate.shopName ?? null,
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

    if (i < jans.length - 1) await sleep(500);
  }

  return NextResponse.json({ results });
}
