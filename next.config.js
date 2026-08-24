/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Supabase browser key is a publishable/anon key and is intended to be
  // exposed to the browser. Supplying these values at build time prevents
  // Vercel's page-data collection from failing when its project env vars are
  // temporarily missing.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://upyqaxqmjrpzewmpbfms.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_yZ6CgQpTJ4-WY2hbJ7rVEg_SMYDmqvS',
  },
};

module.exports = nextConfig;
