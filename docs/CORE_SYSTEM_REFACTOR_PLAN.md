# Core System Refactor v1

This branch is the safe refactor track for the inventory system. Production behavior should not be changed until each migration is reviewed and tested.

## Scope

1. Security and data integrity
2. Dashboard/component decomposition
3. Build-time patch removal
4. Inventory ledger consistency
5. FIFO cost consistency
6. Real-profit calculation

## Current findings

- `components/Dashboard.tsx` is a large monolithic component (~88 KB).
- `pages/index.tsx` currently contains DOM mutation/MutationObserver workarounds for hiding or binding Dashboard UI. These should eventually be replaced by React props/state and component-level rendering.
- `package.json` currently runs a long chain of source-rewriting scripts during `prebuild`. The target state is normal source files plus a small, deterministic build step.
- `inventory_transactions` already exists and should become the authoritative audit trail for inventory movements rather than introducing a second ledger.
- FIFO processing is intended to be handled by the `register_sale` RPC; client-side FIFO patching should remain disabled.
- Dashboard month aggregation already has a SQL RPC and should be expanded rather than duplicating large client-side aggregations.

## Safety rules

- Do not revoke RPC permissions blindly; several RPCs are part of the live application flow.
- Do not change production inventory quantities as part of a refactor.
- Every inventory-affecting operation must remain auditable.
- Database migrations must be additive/reversible where practical.
- Move expensive aggregation into SQL/RPC only after verifying result parity with the current UI.

## Target architecture

```text
UI components
    |
    v
server/API or narrowly scoped RPCs
    |
    v
Supabase tables + authoritative inventory ledger
    |
    +--> FIFO cost layers
    |
    +--> channel fees / shipping / marketing costs
    |
    v
profit + purchasing decision metrics
```

## Implementation order

### Phase 1 - Security

- Audit function execution grants.
- Harden mutable `search_path` functions.
- Keep application compatibility while moving sensitive mutations behind authenticated/server-side boundaries.
- Add regression checks before revoking `anon` execution.

### Phase 2 - UI structure

Extract Dashboard sections into focused components. Remove DOM polling and MutationObserver workarounds only after equivalent component-level controls exist.

### Phase 3 - Inventory

Use `inventory_transactions` as the audit trail. Define and test invariants between transaction totals and `products.stock_quantity`.

### Phase 4 - Cost

Make FIFO the single source of truth for sale cost. Add regression cases for partial consumption, returns, cancellation, and insufficient stock.

### Phase 5 - Profit

Separate revenue, product cost, marketplace fees, affiliate/advertising, shipping, and other variable costs. Produce channel-aware net contribution/profit.

### Phase 6 - Purchasing

Build purchase recommendations only after inventory, cost, and profit metrics are reliable.
