import { createClient } from "@supabase/supabase-js";

// Vercel側の環境変数が一時的に未設定でも、本番ビルドでSupabase初期化が
// 例外を投げないように公開用の接続情報をフォールバックとして使用する。
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://upyqaxqmjrpzewmpbfms.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_yZ6CgQpTJ4-WY2hbJ7rVEg_SMYDmqvS";

export function supabaseBrowser() {
  return createClient(supabaseUrl, supabaseAnonKey);
}
