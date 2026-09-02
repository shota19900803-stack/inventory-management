export type InventoryMovement = {
  quantity: number;
  stockBefore?: number | null;
  stockAfter?: number | null;
};

export type InventoryIntegrityResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Pure, side-effect-free inventory invariant checker.
 * A movement's stock_after must equal stock_before + quantity when both
 * snapshots are present. This is intentionally independent of Supabase so
 * it can be reused by UI tests and server-side reconciliation code.
 */
export function validateInventoryMovement(movement: InventoryMovement): InventoryIntegrityResult {
  const errors: string[] = [];
  const quantity = Number(movement.quantity);

  if (!Number.isFinite(quantity)) {
    errors.push("quantity is not a finite number");
    return { valid: false, errors };
  }

  if (movement.stockBefore != null && movement.stockAfter != null) {
    const before = Number(movement.stockBefore);
    const after = Number(movement.stockAfter);
    if (!Number.isFinite(before) || !Number.isFinite(after)) {
      errors.push("stock snapshot is not a finite number");
    } else if (Math.abs(after - (before + quantity)) > 0.000001) {
      errors.push(`stock transition mismatch: ${before} + ${quantity} != ${after}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function reconcileStockSnapshot(expectedStock: number, actualStock: number, tolerance = 0): boolean {
  return Number.isFinite(expectedStock) && Number.isFinite(actualStock)
    && Math.abs(expectedStock - actualStock) <= Math.max(0, tolerance);
}
