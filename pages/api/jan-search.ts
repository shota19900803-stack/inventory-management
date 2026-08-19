import type { NextApiRequest, NextApiResponse } from "next";

type ProductResult = {
  name: string;
  model_number?: string | null;
  brand?: string | null;
  category?: string | null;
  image_url?: string | null;
  source: string;
};

function cleanJan(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

async function lookupRakuten(jan: string): Promise<ProductResult | null> {
  const applicationId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (!applicationId || !accessKey) return null;

  const params = new URLSearchParams({
    format: "json",
