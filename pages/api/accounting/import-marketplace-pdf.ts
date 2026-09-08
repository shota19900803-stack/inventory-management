import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

export const config = { api: { bodyParser: false, responseLimit: "8mb" } };

type Entry = { platform: "楽天市場" | "Amazon"; document_type: string; invoice_date: string | null; expense_month: string | null; billing_month: string | null; fee_type: string; description: string; amount: number; tax_amount: number | null; total_amount: number | null; category: string; status: "確定"; source_filename: string; source_hash: string; source_line_key: string; raw_text: string };

function readMultipart(req: NextApiRequest): Promise<{ filename: string; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let filename = "uploaded.pdf";
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      const body = Buffer.concat(chunks); const header = body.subarray(0, Math.min(body.length, 8192)).toString("latin1");
      const match = header.match(/filename="([^"]+)"/i); if (match) filename = Buffer.from(match[1], "latin1").toString("utf8");
      const marker = Buffer.from("\r\n\r\n"); const start = body.indexOf(marker); const end = start >= 0 ? body.indexOf(Buffer.from("\r\n--"), start + marker.length) : -1;
      if (start < 0 || end < 0) return reject(new Error("PDFファイルを読み取れませんでした。")); resolve({ filename, buffer: body.subarray(start + marker.length, end) });
    }); req.on("error", reject);
  });
}
function money(value: string) { return Number(value.replace(/[\\¥￥,\s]/g, "")); }
function isoDate(value?: string) { const m = value?.match(/(\d{4})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null; }
function month(value: string | null) { return value ? `${value.slice(0, 7)}-01` : null; }

const RAKUTEN_FEES = [
  "ｼｽﾃﾑ利用料_PC", "ｼｽﾃﾑ利用料_ﾓﾊﾞｲﾙ", "ﾌﾟﾗﾝ共通_ﾓｰﾙにおける取引の安全性･利便性向上のためのｼｽﾃﾑ利用料", "ｽｰﾊﾟｰｱﾌｨﾘｴｲﾄ_成果報酬原資", "ｽｰﾊﾟｰｱﾌｨﾘｴｲﾄ_ｱﾌｨﾘｴｲﾄｼｽﾃﾑ利用料", "ｽｰﾊﾟｰｱﾌｨﾘｴｲﾄ_ｱﾄﾞﾊﾞﾝｽｻｰﾋﾞｽ料", "ｽｰﾊﾟｰｱﾌｨﾘｴｲﾄ_ｱﾄﾞﾊﾞﾝｽｻｰﾋﾞｽ料【割引】", "ﾌﾟﾗﾝ共通_楽天ﾍﾟｲ利用料", "検索連動型広告(RPP)_広告掲載料", "ｻｰﾋﾞｽｽｸｴｱ_compass for 楽天市場", "ﾌﾟﾗﾝ共通_ﾕｰｻﾞ返金_店舗様負担分", "ﾌﾟﾗﾝ共通_ﾎﾟｲﾝﾄ付与料_PC", "ﾌﾟﾗﾝ共通_ﾎﾟｲﾝﾄ付与料_ﾓﾊﾞｲﾙ",
];
function rakutenFeeType(d: string) {
  if (d.includes("RPP")) return "RPP広告"; if (d.includes("ｼｽﾃﾑ利用料_PC")) return "システム利用料_PC"; if (d.includes("ｼｽﾃﾑ利用料_ﾓﾊﾞｲﾙ")) return "システム利用料_モバイル"; if (d.includes("楽天ﾍﾟｲ利用料")) return "楽天ペイ利用料"; if (d.includes("成果報酬原資")) return "アフィリエイト成果報酬"; if (d.includes("ｱﾌｨﾘｴｲﾄｼｽﾃﾑ利用料")) return "アフィリエイトシステム利用料"; if (d.includes("ﾎﾟｲﾝﾄ付与料")) return "ポイント付与料"; if (d.includes("compass")) return "compass"; if (d.includes("安全性")) return "システム利用料（安全性・利便性）"; if (d.includes("ﾕｰｻﾞ返金")) return "ユーザー返金（店舗負担）"; return "楽天その他販売関連費";
}

function parseRakuten(text: string, filename: string, hash: string): Entry[] {
  const normalized = text.replace(/[\u00a0\u3000]+/g, " ").replace(/\s+/g, " ");
  const invoiceMatch = normalized.match(/発行日\s*[:：]?\s*(\d{4})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})/);
  const invoice = invoiceMatch ? `${invoiceMatch[1]}-${invoiceMatch[2].padStart(2, "0")}-${invoiceMatch[3].padStart(2, "0")}` : null;
  const billingMonth = month(invoice);
  const entries: Entry[] = [];
  RAKUTEN_FEES.forEach((fee) => {
    const escaped = fee.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${escaped}\\s*(\\d{4}\\/\\d{1,2}\\/\\d{1,2})\\s*(?:～|-)?\\s*(\\d{4}\\/\\d{1,2}\\/\\d{1,2})\\s*\\\\?\\s*(-?[\\d,]+?)\\s*(?:10|20|30|40|50|60|99)(?:\\s|～|$)`, "g");
    let match: RegExpExecArray | null; let index = 0;
    while ((match = re.exec(normalized))) {
      const start = isoDate(match[1]); const amount = money(match[3]); if (!start || !Number.isFinite(amount) || amount === 0) continue;
      const nonTaxable = fee.includes("ﾎﾟｲﾝﾄ付与料"); const tax = nonTaxable ? null : Math.round(amount * 0.1);
      entries.push({ platform: "楽天市場", document_type: "店舗別内訳書", invoice_date: invoice, expense_month: month(start), billing_month: billingMonth, fee_type: rakutenFeeType(fee), description: fee, amount, tax_amount: tax, total_amount: tax == null ? amount : amount + tax, category: "販売関連費", status: "確定", source_filename: filename, source_hash: hash, source_line_key: `${fee}:${match.index}:${index++}`, raw_text: match[0] });
    }
  });
  return entries;
}

function parseRakutenCalculation(text: string, filename: string, hash: string): Entry[] {
  const source = text.replace(/[\u00a0\u3000]+/g, " ");
  const invoiceMatch = source.match(/発行日\s*[:：]?\s*(\d{4})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})/);
  const invoice = invoiceMatch ? `${invoiceMatch[1]}-${invoiceMatch[2].padStart(2, "0")}-${invoiceMatch[3].padStart(2, "0")}` : null;
  const entries: Entry[] = [];
  const targets = [
    { label: "ｼｽﾃﾑ利用料_PC", type: "システム利用料_PC" },
    { label: "ｼｽﾃﾑ利用料_ﾓﾊﾞｲﾙ", type: "システム利用料_モバイル" },
    { label: "ﾌﾟﾗﾝ共通_楽天ﾍﾟｲ利用料", type: "楽天ペイ利用料" },
  ];
  targets.forEach(({ label, type }) => {
    let cursor = 0;
    while (cursor < source.length) {
      const labelIndex = source.indexOf(label, cursor); if (labelIndex < 0) break;
      const before = source.slice(Math.max(0, labelIndex - 2500), labelIndex);
      const pairs = [...before.matchAll(/[\\¥￥]\s*(\d{1,3}(?:,[\d]{3})+)\s+[\\¥￥]\s*(\d{1,3}(?:,[\d]{3})+)/g)];
      const pair = pairs[pairs.length - 1];
      const after = source.slice(labelIndex, labelIndex + 160);
      const periodMatch = after.match(/（\s*(\d{1,2})\s*月分\s*）/);
      if (pair && periodMatch) {
        const amount = money(pair[2]);
        const expense = invoice ? `${invoice.slice(0, 4)}-${periodMatch[1].padStart(2, "0")}-01` : null;
        if (Number.isFinite(amount) && amount !== 0) {
          const tax = Math.round(amount * 0.1);
          entries.push({ platform: "楽天市場", document_type: "品目別請求計算書", invoice_date: invoice, expense_month: expense, billing_month: month(invoice), fee_type: type, description: `${label}（${periodMatch[1]}月分）`, amount, tax_amount: tax, total_amount: amount + tax, category: "販売関連費", status: "確定", source_filename: filename, source_hash: hash, source_line_key: `calculation:${label}:${labelIndex}`, raw_text: source.slice(Math.max(0, labelIndex - 350), labelIndex + 180) });
        }
      }
      cursor = labelIndex + label.length;
    }
  });
  return entries;
}

// Amazon's 支払明細書 presents "Amazon手数料" as an aggregate amount.
// Its child lines (FBA, storage, shipping, promotion, etc.) are breakdowns of that aggregate,
// so they must NOT be added again or the same expense would be double-counted.
function parseAmazon(text: string, filename: string, hash: string): Entry[] {
  const normalized = text.normalize("NFKC").replace(/[\u00a0\u3000]+/g, " ").replace(/\s+/g, " ");
  const period = normalized.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s*[–-]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const expenseMonth = period ? `${period[1]}-${period[2].padStart(2, "0")}-01` : null;
  const transfer = normalized.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})に.*?振込みが予定/);
  const billingDate = transfer ? isoDate(transfer[0]) : null;
  const entries: Entry[] = [];

  const add = (feeType: string, label: string, pattern: RegExp) => {
    const match = normalized.match(pattern);
    if (!match) return;
    const amount = money(match[1]);
    if (!Number.isFinite(amount) || amount === 0) return;
    entries.push({
      platform: "Amazon",
      document_type: "支払明細書",
      invoice_date: billingDate,
      expense_month: expenseMonth,
      billing_month: month(billingDate),
      fee_type: feeType,
      description: label,
      amount: Math.abs(amount),
      tax_amount: null,
      total_amount: Math.abs(amount),
      category: "販売関連費",
      status: "確定",
      source_filename: filename,
      source_hash: hash,
      source_line_key: `amazon:${feeType}:${match.index ?? 0}`,
      raw_text: match[0],
    });
  };

  add("Amazon販売関連費", "Amazon手数料（FBA・配送・保管等を含む集約額）", /Amazon手数料\s*(-?[￥¥]?\s*[\d,]+)/);
  add("Amazon月間登録料", "月間登録料", /月間登録料\s*(-?[￥¥]?\s*[\d,]+)/);

  return entries;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POSTのみ対応しています。" });
  try {
    const { filename, buffer } = await readMultipart(req);
    if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") return res.status(400).json({ error: "PDFファイルを指定してください。" });
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    // pdf-parse v1 is CommonJS; require avoids ESM/CJS interop differences in Next.js server builds.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse") as (input: Buffer) => Promise<{ text: string }>;
    const text = (await pdfParse(buffer)).text || "";
    const normalized = text.normalize("NFKC");
    const filenameNormalized = filename.normalize("NFKC");
    const isRakutenCalculation = /品目別請求計算書/.test(text) && /ｼｽﾃﾑ利用料_PC|ｼｽﾃﾑ利用料_ﾓﾊﾞｲﾙ|楽天ﾍﾟｲ利用料/.test(text);
    const looksAmazon = /Amazon手数料|フルフィルメント\s*by\s*Amazon|支払明細書|決済期間/.test(normalized) || /amazon/i.test(filenameNormalized);
    const looksRakuten = /楽天市場|楽天ペイ|RPP|ｼｽﾃﾑ利用料_PC|品目別請求計算書/.test(text);
    // Prefer the explicit Amazon filename/content match so an Amazon PDF cannot inherit a stale Rakuten UI state.
    const platform = looksAmazon && !isRakutenCalculation ? "Amazon" : looksRakuten ? "楽天市場" : looksAmazon ? "Amazon" : null;
    if (!platform) return res.status(400).json({ error: "楽天市場またはAmazonの帳票として判定できませんでした。" });
    const entries = platform === "楽天市場" ? (isRakutenCalculation ? parseRakutenCalculation(text, filename, hash) : parseRakuten(text, filename, hash)) : parseAmazon(normalized, filename, hash);
    if (!entries.length) {
      return res.status(400).json({
        error: platform === "Amazon"
          ? "Amazonの支払明細書として判定できましたが、販売関連費を抽出できませんでした。Amazonの支払明細書形式を確認してください。"
          : isRakutenCalculation
            ? "楽天の品目別請求計算書は判定できましたが、費用額を抽出できませんでした。PDFの内容を確認してください。"
            : "費用明細を抽出できませんでした。PDFの種類を確認してください。",
      });
    }
    return res.status(200).json({ platform, filename, hash, entries, textPreview: text.slice(0, 3000) });
  } catch (error) {
    console.error("marketplace PDF import error", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "PDFの解析に失敗しました。" });
  }
}
