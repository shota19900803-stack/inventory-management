import type { NextApiRequest, NextApiResponse } from "next";

type ProductResult = {
  name: string;
  model_number?: string | null;
  brand?: string | null;
  category?: string | null;
  image_url?: string | null;
  source: string;
};

function cleanJan(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

async function lookupYahoo(jan: string): Promise<ProductResult | null> {
  const appId = process.env.YAHOO_APP_ID;
  if (!appId) return null;

  const params = new URLSearchParams({
    appid: appId,
    jan_code: jan,
    results: "1",
    image_size: "300",
  });

  const response = await fetch(
    `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params.toString()}`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    throw new Error(`Yahoo API ${response.status}`);
  }

  const data = await response.json();
  const hit = Array.isArray(data?.hits) ? data.hits[0] : null;
  if (!hit?.name) return null;

  return {
    name: String(hit.name),
    model_number: null,
    brand: hit.brand?.name ? String(hit.brand.name) : null,
    category: hit.genreCategory?.name
      ? String(hit.genreCategory.name)
      : null,
    image_url:
      hit.image?.medium || hit.image?.small || null,
    source: "Yahoo!ショッピング",
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "GET only" });
  }

  const jan = cleanJan(req.query.jan);

  if (jan.length !== 13) {
    return res.status(400).json({
      found: false,
      message: "JANコードは13桁で指定してください。",
    });
  }

  try {
    const result = await lookupYahoo(jan);

    if (!result) {
      return res.status(404).json({
        found: false,
        message: "商品情報が見つかりませんでした。",
      });
    }

    return res.status(200).json({ found: true, product: result });
  } catch (error) {
    console.error("JAN product lookup error:", error);
    return res.status(502).json({
      found: false,
      message:
        "商品情報の検索に失敗しました。YAHOO_APP_IDの設定を確認してください。",
    });
  }
}

// Trigger dashboard patch workflow.
