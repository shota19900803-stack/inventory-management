from pathlib import Path
import base64
import subprocess

repo = "shota19900803-stack/inventory-management"
path = Path("components/Dashboard.tsx")
s = path.read_text()

if "const normalizedJan = String(payload.jan_code)" in s:
    print("duplicate JAN handling already present")
    raise SystemExit(0)

marker = "    const result = editingProductId"
insert = '''    // 新規商品登録時、同じJANが既に登録されていれば重複登録せず、既存商品を選択した状態で仕入登録画面へ移動する。
    if (!editingProductId && payload.jan_code) {
      const normalizedJan = String(payload.jan_code).replace(/\\D/g, "");
      const existing = products.find(
        (product) =>
          String(product.jan_code ?? "").replace(/\\D/g, "") === normalizedJan
      );

      if (existing) {
        setSaving(false);
        setMessage(
          `このJANは既に登録済みです：「${existing.name}」\\n仕入登録画面を開きました。`
        );
        setPurchaseForm({
          ...initialPurchaseForm,
          product_id: existing.id,
          unit_cost:
            existing.cost_price == null ? "" : String(existing.cost_price),
        });
        setTab("purchases");
        setEditingProductId(null);
        setProductForm(initialProductForm);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

'''

if marker not in s:
    raise SystemExit("saveProduct marker not found")

updated = s.replace(marker, insert + marker, 1)
content = base64.b64encode(updated.encode()).decode()

sha = subprocess.check_output(
    ["gh", "api", f"repos/{repo}/contents/components/Dashboard.tsx", "--jq", ".sha"],
    text=True,
).strip()

subprocess.run(
    [
        "gh", "api", "--method", "PUT",
        f"repos/{repo}/contents/components/Dashboard.tsx",
        "-f", "message=Add duplicate JAN purchase flow",
        "-f", f"content={content}",
        "-f", f"sha={sha}",
    ],
    check=True,
)
print("duplicate JAN handling applied")
