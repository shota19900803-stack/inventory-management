const fs = require('fs');
const path = 'components/Dashboard.tsx';
let s = fs.readFileSync(path, 'utf8');

const oldLoadRe = /async function loadAll\(\) \{[\s\S]*?\n\}\nuseEffect\(\(\) => \{\n  loadAll\(\);\n\}, \[\]\);/;
const newLoad = [
  'async function loadAll() {',
  '  setLoading(true);',
  '',
  '  const withTimeout = async (request, label) => {',
  '    try {',
  '      return await Promise.race([',
  '        request,',
  '        new Promise((_, reject) =>',
  '          setTimeout(() => reject(new Error(label + "の読み込みがタイムアウトしました。")), 10000)',
  '        ),',
  '      ]);',
  '    } catch (error) {',
  '      return {',
  '        data: null,',
  '        error: {',
  '          message: error instanceof Error ? error.message : label + "の読み込みに失敗しました。",',
  '        },',
  '      };',
  '    }',
  '  };',
  '',
  '  const [productsResult, purchasesResult, salesResult] = await Promise.all([',
  '    withTimeout(',
  '      supabase.from("products").select("*").order("created_at", { ascending: false }).limit(1000),',
  '      "商品"',
  '    ),',
  '    withTimeout(',
  '      supabase.from("purchase_history").select("*").order("purchase_date", { ascending: false }).limit(2000),',
  '      "仕入履歴"',
  '    ),',
  '    withTimeout(',
  '      supabase.from("sales_history").select("*").eq("is_cancelled", false).order("sale_date", { ascending: false }).limit(2000),',
  '      "売上履歴"',
  '    ),',
  '  ]);',
  '',
  '  let firstError = "";',
  '',
  '  if (productsResult.error) {',
  '    firstError ||= "商品読み込みエラー：" + productsResult.error.message;',
  '  } else {',
  '    setProducts((productsResult.data ?? []) as Product[]);',
  '  }',
  '',
  '  if (purchasesResult.error) {',
  '    firstError ||= "仕入履歴読み込みエラー：" + purchasesResult.error.message;',
  '  } else {',
  '    setPurchases((purchasesResult.data ?? []) as Purchase[]);',
  '  }',
  '',
  '  if (salesResult.error) {',
  '    firstError ||= "売上履歴読み込みエラー：" + salesResult.error.message;',
  '  } else {',
  '    setSales((salesResult.data ?? []) as Sale[]);',
  '  }',
  '',
  '  if (firstError) setMessage(firstError);',
  '  setLoading(false);',
  '}',
  'useEffect(() => {',
  '  loadAll();',
  '}, []);',
].join('\n');

if (!oldLoadRe.test(s)) throw new Error('loadAll block not found');
s = s.replace(oldLoadRe, newLoad);

const oldResultRe = /const result = editingProductId[\s\S]*?\.insert\(payload\);/;
const newResult = [
  'const result = editingProductId',
  '      ? await supabase',
  '          .from("products")',
  '          .update(payload)',
  '          .eq("id", editingProductId)',
  '          .select("*")',
  '          .single()',
  '      : await supabase',
  '          .from("products")',
  '          .insert(payload)',
  '          .select("*")',
  '          .single();',
].join('\n');
if (!oldResultRe.test(s)) throw new Error('saveProduct result block not found');
s = s.replace(oldResultRe, newResult);

const oldSuccess = '      resetProductForm();\n      await loadAll();';
const newSuccess = [
  '      const savedProduct = result.data as Product | null;',
  '      if (savedProduct) {',
  '        setProducts((prev) => {',
  '          if (editingProductId) {',
  '            return prev.map((product) =>',
  '              product.id === editingProductId ? savedProduct : product',
  '            );',
  '          }',
  '          return [savedProduct, ...prev];',
  '        });',
  '      }',
  '      resetProductForm();',
].join('\n');
if (!s.includes(oldSuccess)) throw new Error('saveProduct success block not found');
s = s.replace(oldSuccess, newSuccess);

fs.writeFileSync(path, s);
console.log('Applied loadAll timeout + incremental product refresh fix.');
