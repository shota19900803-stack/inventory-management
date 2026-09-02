export type InventoryPurchaseLot = {
  purchaseDate: string;
  createdAt?: string | null;
  id: string;
  unitCost: number;
  quantity: number;
};

export type InventorySale = {
  saleDate: string;
  createdAt?: string | null;
  id: string;
  quantity: number;
  isCancelled?: boolean | null;
};

function compareEvents(aDate: string, aCreatedAt: string | null | undefined, aId: string, bDate: string, bCreatedAt: string | null | undefined, bId: string) {
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  const aCreated = aCreatedAt ?? "";
  const bCreated = bCreatedAt ?? "";
  if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
  return aId.localeCompare(bId);
}

/**
 * Returns the FIFO cost of the units that are still on hand.
 * Sales are consumed chronologically from the oldest purchase lots.
 * If historical sales exceed purchase quantities, the excess is treated as
 * unmatched legacy stock and is intentionally excluded from the FIFO value.
 */
export function calculateFifoRemainingInventoryValue(
  purchases: InventoryPurchaseLot[],
  sales: InventorySale[],
) {
  const lots = [...purchases]
    .filter((lot) => Number(lot.quantity) > 0 && Number(lot.unitCost) >= 0)
    .sort((a, b) => compareEvents(a.purchaseDate, a.createdAt, a.id, b.purchaseDate, b.createdAt, b.id));

  let remainingSales = sales
    .filter((sale) => !sale.isCancelled && Number(sale.quantity) > 0)
    .sort((a, b) => compareEvents(a.saleDate, a.createdAt, a.id, b.saleDate, b.createdAt, b.id))
    .reduce((sum, sale) => sum + Number(sale.quantity), 0);

  let value = 0;

  for (const lot of lots) {
    const lotQuantity = Number(lot.quantity);
    const consumed = Math.min(lotQuantity, remainingSales);
    const remaining = lotQuantity - consumed;
    value += remaining * Number(lot.unitCost);
    remainingSales -= consumed;
    if (remainingSales <= 0) {
      // All later purchase lots remain intact.
      continue;
    }
  }

  return Math.round(value * 100) / 100;
}
