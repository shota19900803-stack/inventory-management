import { calculateRealProfit, type ProfitInput, type ProfitResult } from "./profit";

export type ManagementSale = {
  sales?: number | null;
  cost?: number | null;
  shipping?: number | null;
  material?: number | null;
  channelFeeRate?: number | null;
  affiliateRate?: number | null;
  advertisingRate?: number | null;
  fixedFee?: number | null;
  otherVariableCost?: number | null;
  cancelled?: boolean | null;
};

export type ManagementExpense = {
  amount?: number | null;
  /** Expenses that are already included in sale-level costs must not be counted again. */
  includedInSaleProfit?: boolean | null;
};

export type ManagementSummary = ProfitResult & {
  expenses: number;
  operatingProfit: number;
};

const money = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

/**
 * Single source of truth for management-screen KPIs.
 *
 * Important accounting rule: sale-level costs (shipping, marketplace fees,
 * affiliate, advertising, etc.) are deducted once by calculateRealProfit.
 * General expenses are deducted afterwards only when they are not already
 * included in the sale-level profit calculation.
 */
export function calculateManagementSummary(
  sales: ManagementSale[],
  expenses: ManagementExpense[] = [],
): ManagementSummary {
  const total: ProfitInput = {
    sales: 0,
    cost: 0,
    shipping: 0,
    material: 0,
    channelFeeRate: 0,
    affiliateRate: 0,
    advertisingRate: 0,
    fixedFee: 0,
    otherVariableCost: 0,
  };

  // Rates are intentionally not aggregated here. Channel-specific rates must
  // be converted to actual yen at the sale row before being passed in. This
  // prevents a weighted-average-rate bug when channels have different fees.
  for (const row of sales) {
    if (row.cancelled) continue;
    total.sales += Number(row.sales || 0);
    total.cost += Number(row.cost || 0);
    total.shipping += Number(row.shipping || 0);
    total.material += Number(row.material || 0);
    total.fixedFee += Number(row.fixedFee || 0);
    total.otherVariableCost += Number(row.otherVariableCost || 0);
    total.channelFeeRate = 0;
    total.affiliateRate = 0;
    total.advertisingRate = 0;

    // calculateRealProfit is also used row-by-row below when rates exist.
  }

  const rowResults = sales
    .filter((row) => !row.cancelled)
    .map((row) => calculateRealProfit({
      sales: Number(row.sales || 0),
      cost: Number(row.cost || 0),
      shipping: Number(row.shipping || 0),
      material: Number(row.material || 0),
      channelFeeRate: Number(row.channelFeeRate || 0),
      affiliateRate: Number(row.affiliateRate || 0),
      advertisingRate: Number(row.advertisingRate || 0),
      fixedFee: Number(row.fixedFee || 0),
      otherVariableCost: Number(row.otherVariableCost || 0),
    }));

  const combined = rowResults.reduce<ProfitResult>((acc, row) => ({
    sales: money(acc.sales + row.sales),
    cost: money(acc.cost + row.cost),
    shipping: money(acc.shipping + row.shipping),
    material: money(acc.material + row.material),
    channelFees: money(acc.channelFees + row.channelFees),
    affiliateFees: money(acc.affiliateFees + row.affiliateFees),
    advertisingCost: money(acc.advertisingCost + row.advertisingCost),
    fixedFee: money(acc.fixedFee + row.fixedFee),
    otherVariableCost: money(acc.otherVariableCost + row.otherVariableCost),
    grossProfit: money(acc.grossProfit + row.grossProfit),
    realProfit: money(acc.realProfit + row.realProfit),
    grossMarginRate: 0,
    realMarginRate: 0,
  }), calculateRealProfit({ sales: 0, cost: 0, shipping: 0 }));

  const expenseTotal = money(expenses
    .filter((expense) => !expense.includedInSaleProfit)
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0));

  combined.grossMarginRate = combined.sales ? money((combined.grossProfit / combined.sales) * 100) : 0;
  combined.realMarginRate = combined.sales ? money((combined.realProfit / combined.sales) * 100) : 0;

  return {
    ...combined,
    expenses: expenseTotal,
    operatingProfit: money(combined.realProfit - expenseTotal),
  };
}
