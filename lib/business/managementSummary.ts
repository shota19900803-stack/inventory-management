import { calculateRealProfit, type ProfitResult } from "./profit";

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
  /** Expenses already included in sale-level costs must not be counted again. */
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
 * Sale-level costs are calculated per sale before aggregation. This is
 * important when channels have different fee rates; averaging rates first
 * can produce an incorrect yen amount.
 */
export function calculateManagementSummary(
  sales: ManagementSale[],
  expenses: ManagementExpense[] = [],
): ManagementSummary {
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
