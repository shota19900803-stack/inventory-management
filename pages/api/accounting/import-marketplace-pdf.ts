import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

export const config = {
  api: { bodyParser: false, responseLimit: "8mb" },
};

type Entry = {
  platform: "楽天市場" | "Amazon";
  document_type: string;
  invoice_date: string | null;
  expense_month: string | null;
  billing_month: string | null;
  fee_type: string;
  description: string;
  amount: number;
  tax_amount: number | null;
  total_amount: number | null;
  category: string;
  status: "確定";
  source_filename: string;
  source_hash: string;
  source_line_key: string;
  raw_text: string;
};

function readMultipart(req: NextApiRequest): Promise<{ filename: string; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let filename = "uploaded.pdf";
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const header = body.subarray(0, Math.min(body.length, 8192)).toString("latin1");
      const match = header.match(/filename="([^"]+)"/i);
      if (match) filename = Buffer.from(match[1], "latin1").toString("utf8");
      const marker = Buffer.from("\r\n\r\n");
      const start = body.indexOf(marker);
      const endMarker = Buffer.from("\r\n--");
      const end = start >= 0 ? body.indexOf(endMarker, start + marker.length) : -1;
      if (start < 0 || end < 0) return reject(new Error("PDFファイルを読み取れませんでした。"));
      resolve({ filename, buffer: body.subarray(start + marker.length, end) });
    });
    req.on("error", reject);
  });
}

function money(value: string) {
  return Number(value.replace(/[\\¥￥,\s]/g, ""));
}

function isoDate(value: string | undefined) {
  if (!value) return null;
  const m = value.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

function month(value: string | null) {
  return value ? `${value.slice(0, 7)}-01` : null;
}

function rakutenFeeType(description: string) {
  if (description.includes("RPP")) return "RPP広告";
  if (description.includes("システム利用料_PC")) return "システム利用料_PC";
  if (description.includes("システム利用料_ﾓﾊﾞｲﾙ")) return "システム利用料_モバイル";
  if (description.includes("楽天ﾍﾟｲ利用料")) return "楽天ペイ利用料";
  if (description.includes("成果報酬原資")) return "アフィリエイト成果報酬";
  if (description.includes("ｱﾌｨﾘｴｲﾄｼｽﾃﾑ利用料")) return "アフィリエイトシステム利用料";
  if (description.includes("ﾎﾟｲﾝﾄ付与料")) return "ポイント付与料";
  if (description.includes("compass")) return "compass";
  if (description.includes("安全性･利便性")) return "システム利用料（安全性・利便性）";
  if (description.includes("ﾕｰｻﾞ返金")) return "ユーザー返金（店舗負担）";
  return "楽天その他販売関連費";
}

function parseRakuten(text: string, filename: string, hash: string): Entry[] {
  const invoice = isoDate(text.match(/発行日：?\s*(\d{4}\/\d{1,2}\/\d{1,2})/)?.[1]);
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const entries: Entry[] = [];
  let nonTaxable = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes("非/不課税・免税")) nonTaxable = true;
    if (line.includes("請求額") && line.includes("税率10")) nonTaxable = false;
    const m = line.match(/^(10|20|30|40|50|60|99)\s+(.+?)\s+(\d{4}\/\d{1,2}\/\d{1,2})\s+～\s+(\d{4}\/\d{1,2}\/\d{1,2})\s+\\?(-?[\d,]+)$/);
    if (!m) continue;
    const description = m[2].replace(/\s+/g, " ").trim();
    const amount = money(m[5]);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const start = isoDate(m[3]);
    const tax = nonTaxable ? null : Math.round(amount * 0.1);
    entries.push({
      platform: "楽天市場",
      document_type: "店舗別内訳書",
      invoice_date: invoice,
      expense_month: month(start),
      billing_month: month(invoice),
      fee_type: rakutenFeeType(description),
      description,
      amount,
      tax_amount: tax,
      total_amount: tax === null ? amount : amount + tax,
      category: "販売関連費",
      status: "確定",
      source_filename: filename,
      source_hash: hash,
      source_line_key: `${i}:${line}`,
      raw_text: line,
    });
  }
  return entries;
}

function amazonFeeType(description: string) {
  if (description === "Amazon手数料") return "販売手数料";
  if (description.includes("FBA 手数料")) return "FBA手数料";
  if (description.includes("納品時の輸送手数料")) return "納品時輸送費";
  if (description.includes("在庫保管手数料")) return "在庫保管手数料";
  if (description.includes("月間登録料")) return "月間登録料";
  if (description.includes("プロモーション割引額")) return "プロモーション割引";
  return "Amazonその他費用";
}

function parseAmazon(text: string, filename: string, hash: string): Entry[] {
  const period = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s*[–-]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const expenseMonth = period ? `${period[1]}-${period[2].padStart(2, "0")}-01` : null;
  const billingMonth = period ? `${period[4]}-${period[5].padStart(2, "0")}-01` : null;
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const entries: Entry[] = [];
  const skip = new Set(["支出", "返金", "売上", "商品代金", "税金", "配送料", "在庫の払い戻し", "返金済みの支出", "返金済みの売上", "純利益"]);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = line.match(/^(.+?)\s+(-?￥?[\d,]+)$/);
    if (!m) continue;
    const description = m[1].trim();
    if (skip.has(description) || description === "その他") continue;
    if (!["Amazon手数料", "FBA 手数料", "納品時の輸送手数料", "在庫保管手数料", "月間登録料", "プロモーション割引額"].some((x) => description === x)) continue;
    const amount = money(m[2]);
    if (!Number.isFinite(amount) || amount === 0) continue;
    entries.push({
      platform: "Amazon",
      document_type: "支払明細書",
      invoice_date: null,
      expense_month: expenseMonth,
      billing_month: billingMonth,
      fee_type: amazonFeeType(description),
      description,
      amount: Math.abs(amount),
      tax_amount: null,
      total_amount: Math.abs(amount),
      category: "販売関連費",
      status: "確定",
      source_filename: filename,
      source_hash: hash,
      source_line_key: `${i}:${line}`,
      raw_text: line,
    });
  }
  return entries;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POSTのみ対応しています。" });
  try {
    const { filename, buffer } = await readMultipart(req);
    if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") return res.status(400).json({ error: "PDFファイルを指定してください。" });
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    // pdf-parse v1 is CommonJS; require keeps the route compatible with Next.js server builds.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse") as (input: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    const text = parsed.text || "";
    const platform = /楽天市場|楽天ﾍﾟｲ|検索連動型広告\(RPP\)|スーパーアフィリエイト|ｼｽﾃﾑ利用料_PC/.test(text) ? "楽天市場" : /Amazon手数料|フルフィルメントby Amazon|支払明細書/.test(text) ? "Amazon" : null;
    if (!platform) return res.status(400).json({ error: "楽天市場またはAmazonの帳票として判定できませんでした。" });
    const entries = platform === "楽天市場" ? parseRakuten(text, filename, hash) : parseAmazon(text, filename, hash);
    return res.status(200).json({ platform, filename, hash, entries, textPreview: text.slice(0, 3000) });
  } catch (error) {
    console.error("marketplace PDF import error", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "PDFの解析に失敗しました。" });
  }
}
