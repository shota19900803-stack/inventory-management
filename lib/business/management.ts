import { calculateRealProfit } from "./profit";

export type ManagementSale = {
  sale_date: string;
  sales_channel?: string | null;
  quantity?: number | null;
  total_sales?: number | null;
  total_cost?: number | null;
  shipping_cost?: number | null;
  gross_profit?: number | null;
  is_cancelled?: boolean | null;
};

export type ManagementExpense = {
  entry_date: string;
  amount?: number | null;
};

export type ManagementPurchase = {
  purchase_date: string;
  total_cost?: number | null;
};

const n = (value: unknown) => {
  const valueAsNumber = Number(value ?? 0);
  return Number.isFinite(valueAsNumber) ? valueAsNumber : 0;
};

const monthOf = (date: string) => date.slice(0, 7);

/**
 * Management reporting uses one source of truth for monthly totals.
 * Cancelled sales are excluded consistently.
 */
export function summarizeMonth(
  month: string,
  sales: ManagementSale[],
  purchases: ManagementPurchase[],
  expenses: ManagementExpense[],
) {
  const activeSales = sales.filter((sale) => !sale.is_cancelled && monthOf(sale.sale_date) === month);
  const monthPurchases = purchases.filter((purchase) => monthOf(purchase.purchase_date) === month);
  const monthExpenses = expenses.filter((expense) => monthOf(expense.entry_date) === month);

  const salesTotal = activeSales.reduce((sum, sale) => sum + n(sale.total_sales), 0);
  const costTotal = activeSales.reduce((sum, sale) => sum + n(sale.total_cost), 0);
  const shippingTotal = activeSales.reduce((sum, sale) => sum + n(sale.shipping_cost), 0);
  const grossProfit = activeSales.reduce((sum, sale) => sum + n(sale.gross_profit), 0);
  const expenseTotal = monthExpenses.reduce((sum, expense) => sum + n(expense.amount), 0);
  const purchaseTotal = monthPurchases.reduce((sum, purchase) => sum + n(purchase.total_cost), 0);

  // Material is currently not stored in the legacy sales row, so explicitly use 0
  // until that cost is modeled. Keeping the argument explicit prevents accidental
  // omission when profit.ts evolves and makes this adapter type-safe.
  const normalized = calculateRealProfit({
    sales: salesTotal,
    cost: costTotal,
    shipping: shippingTotal,
    material: 0,
  });

  return {
    month,
    salesTotal,
    costTotal,
    shippingTotal,
    grossProfit,
    expenseTotal,
    purchaseTotal,
    operatingProfit: grossProfit - expenseTotal,
    normalizedGrossProfit: normalized.grossProfit,
    grossMarginRate: normalized.grossMarginRate,
  };
}

export function summarizeChannels(month: string, sales: ManagementSale[]) {
  const rows = new Map<string, { sales: number; cost: number; shipping: number; grossProfit: number; quantity: number }>();

  for (const sale of sales) {
    if (sale.is_cancelled || monthOf(sale.sale_date) !== month) continue;
    const channel = sale.sales_channel?.trim() || "その他";
    const current = rows.get(channel) ?? { sales: 0, cost: 0, shipping: 0, grossProfit: 0, quantity: 0 };
    current.sales += n(sale.total_sales);
    current.cost += n(sale.total_cost);
    current.shipping += n(sale.shipping_cost);
    current.grossProfit += n(sale.gross_profit);
    current.quantity += n(sale.quantity);
    rows.set(channel, current);
  }

  return [...rows.entries()]
    .map(([channel, value]) => ({
      channel,
      ...value,
      marginRate: value.sales ? (value.grossProfit / value.sales) * 100 : 0,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);
}
