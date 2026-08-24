"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type Sale = {
  id: string;
  product_id: string;
  sale_date: string;
  sales_channel?: string | null;
  order_number?: string | null;
  total_sales?: number | null;
  total_cost?: number | null;
  gross_profit?: number | null;
  shipping_cost?: number | null;
};

type Purchase = {
  id: string;
  product_id: string;
  purchase_date: string;
  supplier?: string | null;
  total_cost?: number | null;
};

type Product = {
  id: string;
  name: string;
};

type Expense = {
  id: string;
  entry_date: string;
  category: string;
  description: string;
  amount: number;
  payment_method?: string | null;
  vendor?: string | null;
  notes?: string | null;
  created_at?: string;
};

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);

const categories = [
  "広告宣伝費",
  "アフィリエイト費",
  "送料・配送費",
  "消耗品費",
  "通信費",
  "交通費",
  "水道光熱費",
  "外注費",
  "支払手数料",
  "地代家賃",
  "車両費",
  "租税公課",
  "保険料",
  "会議費・接待交際費",
  "その他経費",
];

const paymentMethods = [
  "現金",
  "銀行振込",
  "クレジットカード",
  "デビットカード",
  "口座振替",
  "PayPay等",
  "その他",
];

function yen(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString()}`;
}

function monthOf(date: string) {
  return date.slice(0, 7);
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function Accounting() {
  const supabase = supabaseBrowser;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [expenseForm, setExpenseForm] = useState({
    entry_date: today,
    category: "広告宣伝費",
    description: "",
    amount: "",
    payment_method: "クレジットカード",
    vendor: "",
    notes: "",
  });

  async function loadAccounting() {
    setLoading(true);
    const [salesResult, purchasesResult, productsResult, expensesResult] =
      await Promise.all([
        supabase
          .from("sales_history")
          .select("id,product_id,sale_date,sales_channel,order_number,total_sales,total_cost,gross_profit,shipping_cost")
          .eq("is_cancelled", false)
          .order("sale_date", { ascending: false })
          .limit(5000),
        supabase
          .from("purchase_history")
          .select("id,product_id,purchase_date,supplier,total_cost")
          .order("purchase_date", { ascending: false })
          .limit(5000),
        supabase.from("products").select("id,name").limit(5000),
        supabase
          .from("expense_entries")
          .select("*")
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);

    const errors = [
      salesResult.error,
      purchasesResult.error,
      productsResult.error,
      expensesResult.error,
    ].filter(Boolean);

    if (errors.length) {
      setMessage(`経理データ読み込みエラー：${errors[0]?.message}`);
    }

    setSales((salesResult.data ?? []) as Sale[]);
    setPurchases((purchasesResult.data ?? []) as Purchase[]);
    setProducts((productsResult.data ?? []) as Product[]);
    setExpenses((expensesResult.data ?? []) as Expense[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAccounting();
  }, []);

  const productMap = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product.name])),
    [products]
  );

  const monthSales = useMemo(
    () => sales.filter((sale) => monthOf(sale.sale_date) === selectedMonth),
    [sales, selectedMonth]
  );
  const monthPurchases = useMemo(
    () => purchases.filter((purchase) => monthOf(purchase.purchase_date) === selectedMonth),
    [purchases, selectedMonth]
  );
  const monthExpenses = useMemo(
    () => expenses.filter((expense) => monthOf(expense.entry_date) === selectedMonth),
    [expenses, selectedMonth]
  );

  const salesTotal = monthSales.reduce((sum, sale) => sum + Number(sale.total_sales || 0), 0);
  const productCostTotal = monthSales.reduce((sum, sale) => sum + Number(sale.total_cost || 0), 0);
  const shippingTotal = monthSales.reduce((sum, sale) => sum + Number(sale.shipping_cost || 0), 0);
  const grossProfit = monthSales.reduce((sum, sale) => sum + Number(sale.gross_profit || 0), 0);
  const expensesTotal = monthExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const operatingProfit = grossProfit - expensesTotal;
  const purchasesTotal = monthPurchases.reduce((sum, purchase) => sum + Number(purchase.total_cost || 0), 0);

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    monthExpenses.forEach((expense) => {
      map[expense.category] = (map[expense.category] || 0) + Number(expense.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  const months = useMemo(() => {
    const values = new Set<string>([currentMonth]);
    sales.forEach((sale) => values.add(monthOf(sale.sale_date)));
    purchases.forEach((purchase) => values.add(monthOf(purchase.purchase_date)));
    expenses.forEach((expense) => values.add(monthOf(expense.entry_date)));
    return Array.from(values).sort().reverse();
  }, [sales, purchases, expenses]);

  async function saveExpense(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(expenseForm.amount);

    if (!expenseForm.description.trim()) {
      setMessage("経費の内容を入力してください。");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("金額を正しく入力してください。");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("expense_entries").insert({
      entry_date: expenseForm.entry_date,
      category: expenseForm.category,
      description: expenseForm.description.trim(),
      amount,
      payment_method: expenseForm.payment_method,
      vendor: expenseForm.vendor.trim() || null,
      notes: expenseForm.notes.trim() || null,
    });

    if (error) {
      setMessage(`経費登録エラー：${error.message}`);
    } else {
      setMessage("経費を登録しました。");
      setSelectedMonth(expenseForm.entry_date.slice(0, 7));
      setExpenseForm({
        ...expenseForm,
        description: "",
        amount: "",
        vendor: "",
        notes: "",
      });
      await loadAccounting();
    }

    setSaving(false);
  }

  async function deleteExpense(id: string) {
    if (!window.confirm("この経費を削除しますか？")) return;
    const { error } = await supabase.from("expense_entries").delete().eq("id", id);
    if (error) {
      setMessage(`経費削除エラー：${error.message}`);
      return;
    }
    setMessage("経費を削除しました。");
    await loadAccounting();
  }

  function exportCsv() {
    const rows = [
      ["日付", "区分", "内容", "販売先/支払先", "売上", "仕入・原価", "送料", "経費", "利益"],
      ...monthSales.map((sale) => [
        sale.sale_date,
        "売上",
        productMap[sale.product_id] || "商品不明",
        sale.sales_channel || "",
        sale.total_sales || 0,
        sale.total_cost || 0,
        sale.shipping_cost || 0,
        0,
        Number(sale.gross_profit || 0),
      ]),
      ...monthPurchases.map((purchase) => [
        purchase.purchase_date,
        "仕入",
        productMap[purchase.product_id] || "商品不明",
        purchase.supplier || "",
        0,
        purchase.total_cost || 0,
        0,
        0,
        0,
      ]),
      ...monthExpenses.map((expense) => [
        expense.entry_date,
        expense.category,
        expense.description,
        expense.vendor || expense.payment_method || "",
        0,
        0,
        0,
        expense.amount,
        -Number(expense.amount || 0),
      ]),
    ];

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `経理帳簿_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const card = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 22,
    marginBottom: 20,
  } as React.CSSProperties;
  const input = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    border: "1px solid #d1d5db",
    borderRadius: 10,
    fontSize: 15,
    background: "#fff",
  } as React.CSSProperties;

  if (loading) {
    return <main style={{ minHeight: "100vh", background: "#f6f7f9", padding: 40, fontFamily: "system-ui, sans-serif" }}><h1>経理・帳簿</h1><p>データを読み込んでいます…</p></main>;
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", padding: "28px 20px 60px", color: "#111827", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, letterSpacing: 3, fontWeight: 700, color: "#6b7280" }}>INVENTORY MANAGEMENT</div>
            <h1 style={{ margin: "4px 0 0", fontSize: 36 }}>経理・帳簿</h1>
            <p style={{ margin: "8px 0 0", color: "#6b7280" }}>売上・仕入・送料・経費をまとめて管理します。</p>
          </div>
          <a href="/" style={{ textDecoration: "none", background: "#111827", color: "#fff", padding: "12px 18px", borderRadius: 10, fontWeight: 700 }}>← 在庫管理へ戻る</a>
        </header>

        {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", color: "#166534", padding: "12px 16px", borderRadius: 10, marginBottom: 20 }}>{message}</div>}

        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>📊 月次損益</h2>
              <p style={{ color: "#6b7280", marginBottom: 0 }}>既存の売上・仕入データと登録した経費を自動集計します。</p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ ...input, width: 180 }}>
                {months.map((month) => <option value={month} key={month}>{month}</option>)}
              </select>
              <button type="button" onClick={exportCsv} style={{ border: "none", background: "#2563eb", color: "#fff", padding: "12px 16px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>CSV出力</button>
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 15 }}>
          {[
            ["売上", salesTotal, "#111827"],
            ["商品原価", productCostTotal, "#374151"],
            ["送料", shippingTotal, "#374151"],
            ["粗利", grossProfit, grossProfit >= 0 ? "#15803d" : "#dc2626"],
            ["経費", expensesTotal, "#b45309"],
            ["営業利益（簡易）", operatingProfit, operatingProfit >= 0 ? "#15803d" : "#dc2626"],
          ].map(([label, value, color]) => (
            <div key={String(label)} style={{ ...card, marginBottom: 0 }}>
              <div style={{ color: "#6b7280", fontSize: 14 }}>{label}</div>
              <strong style={{ display: "block", marginTop: 8, fontSize: 26, color: String(color) }}>{yen(Number(value))}</strong>
            </div>
          ))}
        </section>

        <section style={{ ...card, marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>🧾 経費を登録</h2>
          <form onSubmit={saveExpense}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 15 }}>
              <label>日付<input type="date" style={input} value={expenseForm.entry_date} onChange={(e) => setExpenseForm({ ...expenseForm, entry_date: e.target.value })} /></label>
              <label>勘定科目<select style={input} value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>内容*<input style={input} value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="例：楽天広告費" /></label>
              <label>金額*<input style={input} type="number" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} placeholder="0" /></label>
              <label>支払方法<select style={input} value={expenseForm.payment_method} onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
              <label>支払先<input style={input} value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} placeholder="例：楽天市場" /></label>
              <label style={{ gridColumn: "1 / -1" }}>メモ<input style={input} value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} /></label>
            </div>
            <button type="submit" disabled={saving} style={{ marginTop: 16, border: "none", background: "#111827", color: "#fff", padding: "12px 22px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>{saving ? "登録中…" : "経費を登録する"}</button>
          </form>
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>📒 勘定科目別</h2>
          {expenseByCategory.length === 0 ? <p style={{ color: "#6b7280" }}>この月の経費はありません。</p> : expenseByCategory.map(([category, amount]) => (
            <div key={category} style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}><span>{category}</span><strong>{yen(amount)}</strong></div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 15, fontWeight: 800 }}><span>経費合計</span><span>{yen(expensesTotal)}</span></div>
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>📚 帳簿・取引一覧</h2>
          <p style={{ color: "#6b7280" }}>売上・仕入・経費を日付順にまとめています。</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead><tr>{["日付", "区分", "内容", "相手先", "売上", "支出", "利益"].map((h) => <th key={h} style={{ padding: 10, textAlign: h === "売上" || h === "支出" || h === "利益" ? "right" : "left", borderBottom: "1px solid #e5e7eb" }}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ...monthSales.map((sale) => ({ date: sale.sale_date, type: "売上", description: productMap[sale.product_id] || "商品不明", counterparty: sale.sales_channel || "", income: Number(sale.total_sales || 0), expense: Number(sale.total_cost || 0) + Number(sale.shipping_cost || 0), profit: Number(sale.gross_profit || 0) - Number(sale.shipping_cost || 0), id: `s-${sale.id}` })),
                  ...monthPurchases.map((purchase) => ({ date: purchase.purchase_date, type: "仕入", description: productMap[purchase.product_id] || "商品不明", counterparty: purchase.supplier || "", income: 0, expense: Number(purchase.total_cost || 0), profit: 0, id: `p-${purchase.id}` })),
                  ...monthExpenses.map((expense) => ({ date: expense.entry_date, type: expense.category, description: expense.description, counterparty: expense.vendor || expense.payment_method || "", income: 0, expense: Number(expense.amount || 0), profit: -Number(expense.amount || 0), id: `e-${expense.id}` })),
                ].sort((a, b) => b.date.localeCompare(a.date)).map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{row.date}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontWeight: 700 }}>{row.type}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{row.description}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{row.counterparty || "—"}</td>
                    <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>{row.income ? yen(row.income) : "—"}</td>
                    <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9" }}>{row.expense ? yen(row.expense) : "—"}</td>
                    <td style={{ padding: 10, textAlign: "right", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: row.profit >= 0 ? "#15803d" : "#dc2626" }}>{row.profit ? yen(row.profit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>🧾 登録済み経費</h2>
          {monthExpenses.length === 0 ? <p style={{ color: "#6b7280" }}>この月の経費はありません。</p> : (
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}><thead><tr>{["日付", "科目", "内容", "支払先", "支払方法", "金額", "操作"].map((h) => <th key={h} style={{ padding: 10, textAlign: h === "金額" ? "right" : "left", borderBottom: "1px solid #e5e7eb" }}>{h}</th>)}</tr></thead><tbody>{monthExpenses.map((expense) => <tr key={expense.id}><td style={{ padding: 10 }}>{expense.entry_date}</td><td style={{ padding: 10 }}>{expense.category}</td><td style={{ padding: 10 }}>{expense.description}</td><td style={{ padding: 10 }}>{expense.vendor || "—"}</td><td style={{ padding: 10 }}>{expense.payment_method || "—"}</td><td style={{ padding: 10, textAlign: "right", fontWeight: 700 }}>{yen(expense.amount)}</td><td style={{ padding: 10 }}><button type="button" onClick={() => deleteExpense(expense.id)} style={{ border: "1px solid #fecaca", background: "#fff5f5", color: "#b42318", padding: "6px 10px", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>削除</button></td></tr>)}</tbody></table></div>
          )}
        </section>

        <p style={{ color: "#6b7280", fontSize: 12, lineHeight: 1.7 }}>※この画面は日々の経営管理・帳簿整理を目的としたものです。税務申告用の正式な仕訳・消費税処理・固定資産・減価償却等は、必要に応じて会計ソフトや税理士の確認と併用してください。</p>
      </div>
    </main>
  );
}
