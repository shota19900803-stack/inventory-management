import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../lib/supabase";

const initialForm = {
  name: "",
  jan_code: "",
  sku: "",
  model_number: "",
  brand: "",
  category: "",
  stock_quantity: "0",
  cost_price: "",
  selling_price: "",
};

export default function ProductsPage() {
  const supabase = supabaseBrowser;
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const update = (key: keyof typeof initialForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function saveProduct(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!form.name.trim()) {
      setError("商品名を入力してください。");
      return;
    }

    const jan = form.jan_code.replace(/\D/g, "");
    if (jan && jan.length !== 13) {
      setError("JANコードは13桁で入力してください。");
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      jan_code: jan || null,
      sku: form.sku.trim() || null,
      model_number: form.model_number.trim() || null,
      brand: form.brand.trim() || null,
      category: form.category.trim() || null,
      stock_quantity: Number(form.stock_quantity || 0),
      cost_price: form.cost_price === "" ? null : Number(form.cost_price),
      selling_price: form.selling_price === "" ? null : Number(form.selling_price),
    };

    const { error } = await supabase.from("products").insert(payload);

    setSaving(false);
    if (error) {
      setError(`保存エラー：${error.message}`);
      return;
    }

    setMessage("商品を登録しました！");
    setForm(initialForm);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 15px",
    marginTop: 7,
    border: "1px solid #d1d5db",
    borderRadius: 11,
    fontSize: 16,
    background: "#fff",
  };

  const fieldStyle: React.CSSProperties = { marginBottom: 15 };

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", padding: "24px 16px 90px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: "#111827" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 700 }}>📦 在庫管理</div>
            <h1 style={{ margin: "3px 0 0", fontSize: 30 }}>商品登録</h1>
          </div>
          <Link href="/" style={{ textDecoration: "none", color: "#111827", background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 13px", fontWeight: 700 }}>
            ← 戻る
          </Link>
        </div>

        <section style={{ background: "#fff", borderRadius: 18, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,.05)" }}>
          <p style={{ marginTop: 0, color: "#6b7280" }}>商品名・JAN・在庫・仕入価格・販売価格を登録できます。</p>

          <form onSubmit={saveProduct}>
            <label style={fieldStyle}>商品名 *<input style={inputStyle} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="例：ポケモンカード BOX" /></label>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 0 }}>
              <label style={fieldStyle}>JANコード<input style={inputStyle} inputMode="numeric" value={form.jan_code} onChange={(e) => update("jan_code", e.target.value)} placeholder="13桁のJANコード" /></label>
              <label style={fieldStyle}>SKU<input style={inputStyle} value={form.sku} onChange={(e) => update("sku", e.target.value)} placeholder="任意" /></label>
              <label style={fieldStyle}>型番<input style={inputStyle} value={form.model_number} onChange={(e) => update("model_number", e.target.value)} placeholder="任意" /></label>
              <label style={fieldStyle}>ブランド<input style={inputStyle} value={form.brand} onChange={(e) => update("brand", e.target.value)} placeholder="例：BANDAI" /></label>
              <label style={fieldStyle}>カテゴリ<input style={inputStyle} value={form.category} onChange={(e) => update("category", e.target.value)} placeholder="例：玩具" /></label>
              <label style={fieldStyle}>初期在庫<input style={inputStyle} type="number" min="0" value={form.stock_quantity} onChange={(e) => update("stock_quantity", e.target.value)} /></label>
              <label style={fieldStyle}>仕入価格<input style={inputStyle} type="number" min="0" value={form.cost_price} onChange={(e) => update("cost_price", e.target.value)} placeholder="円" /></label>
              <label style={fieldStyle}>販売価格<input style={inputStyle} type="number" min="0" value={form.selling_price} onChange={(e) => update("selling_price", e.target.value)} placeholder="円" /></label>
            </div>

            {error && <div style={{ margin: "4px 0 12px", padding: 12, borderRadius: 10, background: "#fff1f2", color: "#b42318", fontWeight: 700 }}>{error}</div>}
            {message && <div style={{ margin: "4px 0 12px", padding: 12, borderRadius: 10, background: "#f0fdf4", color: "#166534", fontWeight: 700 }}>{message}</div>}

            <button type="submit" disabled={saving} style={{ width: "100%", border: 0, borderRadius: 12, padding: "15px 18px", background: saving ? "#9ca3af" : "#111827", color: "#fff", fontSize: 16, fontWeight: 800 }}>
              {saving ? "登録中…" : "＋ 商品を登録する"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
