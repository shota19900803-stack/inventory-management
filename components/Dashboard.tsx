"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";

type Product = {
  id: string;
  jan_code?: string | null;
  sku?: string | null;
  name: string;
  model_number?: string | null;
  stock_quantity?: number | null;
  cost_price?: number | null;
  selling_price?: number | null;
  image_url?: string | null;
  created_at?: string;
};

const initialForm = {
  name: "",
  jan_code: "",
  sku: "",
  model_number: "",
  stock_quantity: "0",
  cost_price: "",
  selling_price: "",
};

export default function Dashboard() {
  const supabase = supabaseBrowser();

  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadProducts() {
    setLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      setMessage(`読み込みエラー: ${error.message}`);
    } else {
      setProducts((data ?? []) as Product[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    if (!s) return products;

    return products.filter((p) =>
      [p.name, p.jan_code, p.sku, p.model_number].some((v) =>
        (v ?? "").toLowerCase().includes(s)
      )
    );
  }, [products, q]);

  function edit(p: Product) {
    setEditingId(p.id);

    setForm({
      name: p.name ?? "",
      jan_code: p.jan_code ?? "",
      sku: p.sku ?? "",
      model_number: p.model_number ?? "",
      stock_quantity: String(p.stock_quantity ?? 0),
      cost_price: p.cost_price == null ? "" : String(p.cost_price),
      selling_price:
        p.selling_price == null ? "" : String(p.selling_price),
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function reset() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name.trim()) {
      setMessage("商品名を入力してください。");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      name: form.name.trim(),
      jan_code: form.jan_code.trim() || null,
      sku: form.sku.trim() || null,
      model_number: form.model_number.trim() || null,
      stock_quantity: Number(form.stock_quantity || 0),
      cost_price:
        form.cost_price === "" ? null : Number(form.cost_price),
      selling_price:
        form.selling_price === "" ? null : Number(form.selling_price),
    };

    const result = editingId
      ? await supabase
          .from("products")
          .update(payload)
          .eq("id", editingId)
      : await supabase
          .from("products")
          .insert(payload);

    if (result.error) {
      setMessage(`保存エラー: ${result.error.message}`);
    } else {
      setMessage(
        editingId
          ? "商品を更新しました。"
          : "商品を登録しました。"
      );

      reset();
      await loadProducts();
    }

    setSaving(false);
  }

  async function deleteProduct(id: string) {
    if (!confirm("この商品を削除しますか？")) return;

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (error) {
      setMessage(`削除エラー: ${error.message}`);
    } else {
      setMessage("削除しました。");
      await loadProducts();
    }
  }

  return (
    <main>
      <h1>INVENTORY MANAGEMENT</h1>
      <p>在庫管理</p>

      <div>
        <strong>商品数 {products.length}</strong>
        <span>　表示 {filtered.length}</span>
      </div>

      <section className="panel">
        <h2>{editingId ? "商品を編集" : "商品を登録"}</h2>

        <form onSubmit={saveProduct} className="formgrid">
          <label>
            商品名*
            <input
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
              placeholder="例：ポケモンカード BOX"
            />
          </label>

          <label>
            JANコード
            <input
              inputMode="numeric"
              value={form.jan_code}
              onChange={(e) =>
                setForm({
                  ...form,
                  jan_code: e.target.value,
                })
              }
            />
          </label>

          <label>
            SKU
            <input
              value={form.sku}
              onChange={(e) =>
                setForm({
                  ...form,
                  sku: e.target.value,
                })
              }
            />
          </label>

          <label>
            型番
            <input
              value={form.model_number}
              onChange={(e) =>
                setForm({
                  ...form,
                  model_number: e.target.value,
                })
              }
            />
          </label>

          <label>
            在庫数
            <input
              type="number"
              value={form.stock_quantity}
              onChange={(e) =>
                setForm({
                  ...form,
                  stock_quantity: e.target.value,
                })
              }
            />
          </label>

          <label>
            仕入価格
            <input
              type="number"
              value={form.cost_price}
              onChange={(e) =>
                setForm({
                  ...form,
                  cost_price: e.target.value,
                })
              }
            />
          </label>

          <label>
            販売価格
            <input
              type="number"
              value={form.selling_price}
              onChange={(e) =>
                setForm({
                  ...form,
                  selling_price: e.target.value,
                })
              }
            />
          </label>

          <div className="actions">
            <button
              type="submit"
              className="primary"
              disabled={saving}
            >
              {saving
                ? "保存中…"
                : editingId
                ? "更新する"
                : "登録する"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={reset}
              >
                キャンセル
              </button>
            )}
          </div>
        </form>

        {message && (
          <div className="message">
            {message}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="listhead">
          <h2>商品一覧</h2>

          <input
            className="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="商品名・JAN・SKU・型番で検索"
          />
        </div>

        {loading ? (
          <p>読み込み中…</p>
        ) : filtered.length === 0 ? (
          <p>商品がありません。</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>商品名</th>
                  <th>JAN</th>
                  <th>SKU</th>
                  <th>在庫</th>
                  <th>販売価格</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small>
                        {p.model_number || ""}
                      </small>
                    </td>

                    <td>{p.jan_code || "—"}</td>

                    <td>{p.sku || "—"}</td>

                    <td>
                      <span
                        className={
                          (p.stock_quantity ?? 0) <= 0
                            ? "stock zero"
                            : "stock"
                        }
                      >
                        {p.stock_quantity ?? 0}
                      </span>
                    </td>

                    <td>
                      {p.selling_price == null
                        ? "—"
                        : `¥${p.selling_price.toLocaleString()}`}
                    </td>

                    <td className="rowactions">
                      <button
                        type="button"
                        onClick={() => edit(p)}
                      >
                        編集
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteProduct(p.id)}
                        className="danger"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
