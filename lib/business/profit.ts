export type ProfitInput = {
  sales: number;
  cost: number;
  shipping: number;
  material?: number;
  channelFeeRate?: number;
  affiliateRate?: number;
  advertisingRate?: number;
  fixedFee?: number;
  otherVariableCost?: number;
};

export type ProfitResult = {
  sales: number;
  cost: number;
  shipping: number;
  material: number;
  channelFees: number;
  affiliateFees: number;
  advertisingCost: number;
  fixedFee: number;
  otherVariableCost: number;
  grossProfit: number;
  realProfit: number;
  grossMarginRate: number;
  realMarginRate: number;
};

const money = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const rate = (n: number | undefined) => Math.max(0, Number(n || 0)) / 100;

/**
 * Centralized profit calculation used by management screens and future server/RPC logic.
 * Rates are percentages (e.g. 10 means 10%). Material cost is optional while legacy
 * sales rows do not store it separately; omitted material is treated as zero.
 */
export function calculateRealProfit(input: ProfitInput): ProfitResult {
  const sales = money(input.sales);
  const cost = money(input.cost);
  const shipping = money(input.shipping);
  const material = money(input.material ?? 0);
  const channelFees = money(sales * rate(input.channelFeeRate));
  const affiliateFees = money(sales * rate(input.affiliateRate));
  const advertisingCost = money(sales * rate(input.advertisingRate));
  const fixedFee = money(input.fixedFee || 0);
  const otherVariableCost = money(input.otherVariableCost || 0);
  const grossProfit = money(sales - cost);
  const realProfit = money(
    grossProfit - shipping - material - channelFees - affiliateFees - advertisingCost - fixedFee - otherVariableCost,
  );

  return {
    sales,
    cost,
    shipping,
    material,
    channelFees,
    affiliateFees,
    advertisingCost,
    fixedFee,
    otherVariableCost,
    grossProfit,
    realProfit,
    grossMarginRate: sales ? money((grossProfit / sales) * 100) : 0,
    realMarginRate: sales ? money((realProfit / sales) * 100) : 0,
  };
}
