import { createBrowserClient } from "@supabase/ssr";

// Vercelの環境変数が未設定でも本番ビルドが落ちないよう、
// 公開用Supabase接続情報をフォールバックとして用意する。
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://upyqaxqmjrpzewmpbfms.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_yZ6CgQpTJ4-WY2hbJ7rVEg_SMYDmqvS";

export function supabaseBrowser() {
  return createBrowserClient(supabaseUrl, supabaseKey);
}
