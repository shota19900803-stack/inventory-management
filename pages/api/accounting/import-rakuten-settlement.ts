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
  const source = text.normalize("NFKC").replace(/[\u00a0\u3000]+/g, " ").replace(/\s+/g, " ");
  if (!/総合精算書|支\s*払\s*通知書|支\s*払\s*合\s*計\s*額|精算日/.test(source)) return null;

  const settlementDate = jpDate((source.match(/(\d{4}年\s*\d{1,2}月\s*\d{1,2}日)\s*(?:振込予定|精算日)/) || [])[1]);
  const period = source.match(/(\d{4}年\s*\d{1,2}月\s*\d{1,2}日)\s*[～~\-–]\s*(\d{4}年\s*\d{1,2}月\s*\d{1,2}日)\s*決済確定分/);
  const paymentPeriodStart = jpDate(period?.[1]); const paymentPeriodEnd = jpDate(period?.[2]);

  // 楽天の総合精算書では「支払」が楽天→店舗への金額を意味します。
  // PDF抽出ではラベルと金額が離れ、さらに「支 払」のように分割されることがあります。
  const labeledPayment = amountAfterLabel(source, /支\s*払\s*合\s*計\s*額/);
  const generalPayment = amountAfterLabel(source, /(?:^|[\s　])支\s*払(?:[\s　]|$)/, 700);
  const storePaymentMatch = source.match(/楽天市場店\s*[-－]\s*(?:[\\¥￥]\s*)?([\d,]+)|店舗別内訳書No[^\d]{0,120}(?:[\\¥￥]\s*)?([\d,]+)/);
  const storePayment = storePaymentMatch ? money(storePaymentMatch[1] || storePaymentMatch[2]) : null;
  const paymentAmount = labeledPayment ?? storePayment ?? generalPayment ?? 0;

  // 「請求合計額」は店舗側が楽天へ支払う請求額。15日など「-」だけなら0円。
  const labeledBilling = amountAfterLabel(source, /請\s*求\s*合\s*計\s*額/);
  const generalBilling = amountAfterLabel(source, /(?:^|[\s　])請\s*求(?:[\s　]|$)/, 700);
  const billingAmount = labeledBilling ?? generalBilling ?? 0;

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
