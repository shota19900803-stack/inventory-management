import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

export const config = { api: { bodyParser: false, responseLimit: "8mb" } };

type Settlement = {
  platform: "楽天市場"; document_type: "楽天精算・振込明細"; source_hash: string; source_filename: string;
  settlement_date: string | null; payment_period_start: string | null; payment_period_end: string | null;
  payment_calculation_amount: number; billing_cutoff_date: string | null; billing_calculation_amount: number;
  net_transfer_amount: number; status: "予定" | "確定";
};

function readMultipart(req: NextApiRequest): Promise<{ filename: string; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let filename = "uploaded.pdf";
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      const body = Buffer.concat(chunks); const header = body.subarray(0, Math.min(body.length, 8192)).toString("latin1");
      const match = header.match(/filename="([^"]+)"/i); if (match) filename = Buffer.from(match[1], "latin1").toString("utf8");
      const marker = Buffer.from("\r\n\r\n"); const start = body.indexOf(marker); const end = start >= 0 ? body.indexOf(Buffer.from("\r\n--"), start + marker.length) : -1;
      if (start < 0 || end < 0) return reject(new Error("PDFファイルを読み取れませんでした。"));
      resolve({ filename, buffer: body.subarray(start + marker.length, end) });
    }); req.on("error", reject);
  });
}
const money = (value: string) => Number(value.replace(/[\\¥￥,\s]/g, ""));
const jpDate = (value?: string | null) => { const m = value?.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/); return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null; };

function amountAfterLabel(source: string, label: RegExp, maxChars = 500): number | null {
  const match = label.exec(source);
  if (!match) return null;
  const area = source.slice(match.index + match[0].length, match.index + match[0].length + maxChars);
  const amounts = [...area.matchAll(/(?:[\\¥￥]\s*)?([\d]{1,3}(?:,[\d]{3})+|\d+)\s*(?:円)?/g)]
    .map((m) => money(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  return amounts.length ? amounts[amounts.length - 1] : null;
}

function parseSettlement(text: string, filename: string, hash: string): Settlement | null {
  // 楽天のPDFは「請 求 支 払 繰 越」のように文字間へ空白が入り、
  // 金額も表の後方へまとめて抽出されることがあります。
  const source = text.normalize("NFKC").replace(/[\u00a0\u3000]+/g, " ").replace(/\s+/g, " ");
  if (!/総合精算書|支\s*払\s*通知書|支\s*払\s*合\s*計\s*額|精算日/.test(source)) return null;

  // PDFの抽出結果では「精算日:2026年9月15日」のようにラベルが先に来る場合と、
  // 「2026年9月15日 振込予定」のように日付が先に来る場合の両方があります。
  const settlementDateMatch = source.match(
    /(?:振\s*込\s*予\s*定|精\s*算\s*日)\s*[:：]?\s*(\d{4}年\s*\d{1,2}月\s*\d{1,2}日)|(\d{4}年\s*\d{1,2}月\s*\d{1,2}日)\s*(?:振\s*込\s*予\s*定|精\s*算\s*日)/
  );
  const settlementDate = jpDate(settlementDateMatch?.[1] || settlementDateMatch?.[2]);

  const period = source.match(/(\d{4}年\s*\d{1,2}月\s*\d{1,2}日)\s*[～~〜\-–]\s*(\d{4}年\s*\d{1,2}月\s*\d{1,2}日)\s*決\s*済\s*確\s*定\s*分/);
  const paymentPeriodStart = jpDate(period?.[1]); const paymentPeriodEnd = jpDate(period?.[2]);

  // 楽天の総合精算書は、上段の「支払」が実際の振込予定額、
  // 店舗別内訳の「支払合計額」が請求控除前の支払計算額です。
  // 例：上段 支払=4,631,894 / 請求合計額=454,068 / 支払合計額=5,085,962
  // → 5,085,962 - 454,068 = 4,631,894 が実際の振込額。
  // PDF抽出では円記号が「\」になる場合があるため、\ / ¥ / ￥をすべて通貨記号として扱います。
  const summaryMatch = source.match(/請\s*(?:-|－|—|―)\s*支\s*(?:[\\¥￥]\s*)?([\d]{1,3}(?:,[\d]{3})+|\d+)/);
  const summaryNetTransfer = summaryMatch ? money(summaryMatch[1]) : null;

  const storeArea = source.match(/店舗別内訳[\s\S]{0,1600}/)?.[0] || "";
  const storeHeader = storeArea.match(/請\s*求\s*合\s*計\s*額\s*支\s*払\s*合\s*計\s*額/);
  const storeTotalsArea = storeHeader
    ? storeArea.slice(storeHeader.index! + storeHeader[0].length)
    : "";
  const storeAmounts = storeTotalsArea
    ? [...storeTotalsArea.matchAll(/(?:[\\¥￥]\s*)([\d]{1,3}(?:,[\d]{3})+|\d+)/g)]
        .map((m) => money(m[1]))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

  // 複数店舗の場合も最後の2つが「合計」行の請求合計額・支払合計額になります。
  const storeBillingAmount = storeAmounts.length >= 2 ? storeAmounts[storeAmounts.length - 2] : null;
  const storePaymentAmount = storeAmounts.length >= 2 ? storeAmounts[storeAmounts.length - 1] : null;

  const labeledPayment = amountAfterLabel(source, /支\s*払\s*合\s*計\s*額/);
  const explicitBilling = source.match(/請\s*(?:[\\¥￥]\s*)?([\d]{1,3}(?:,[\d]{3})+|\d+)\s*(?:円)?\s*(?:支\s*払|繰\s*越)/);

  const paymentAmount = storePaymentAmount ?? labeledPayment ?? summaryNetTransfer ?? 0;
  const billingAmount = storeBillingAmount ?? (explicitBilling ? money(explicitBilling[1]) : 0);
  const netTransfer = summaryNetTransfer ?? Math.max(0, paymentAmount - billingAmount);

  const cutoffMatch = source.match(/(\d{4}年\s*\d{1,2}月\s*\d{1,2}日)\s*締分/);
  const netTransfer = paymentAmount - billingAmount;
  if (!settlementDate && paymentAmount === 0 && billingAmount === 0) return null;

  return {
    platform: "楽天市場", document_type: "楽天精算・振込明細", source_hash: hash, source_filename: filename,
    settlement_date: settlementDate, payment_period_start: paymentPeriodStart, payment_period_end: paymentPeriodEnd,
    payment_calculation_amount: paymentAmount, billing_cutoff_date: jpDate(cutoffMatch?.[1]),
    billing_calculation_amount: billingAmount, net_transfer_amount: netTransfer,
    status: settlementDate ? "予定" : "確定",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POSTのみ対応しています。" });
  try {
    const { filename, buffer } = await readMultipart(req);
    if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") return res.status(400).json({ error: "PDFファイルを指定してください。" });
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse") as (input: Buffer) => Promise<{ text: string }>;
    const text = (await pdfParse(buffer)).text || "";
    const settlement = parseSettlement(text, filename, hash);
    if (!settlement) return res.status(400).json({ error: "楽天の精算・振込明細として判定できませんでした。" });
    return res.status(200).json({ settlement, textPreview: text.slice(0, 3000) });
  } catch (error) {
    console.error("rakuten settlement import error", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "PDFの解析に失敗しました。" });
  }
}
