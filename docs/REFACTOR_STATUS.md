# Core system refactor status

Branch: `refactor/core-system-v1`

## Completed

- Created an isolated refactor branch from `main`.
- Hardened all current `SECURITY DEFINER` business RPCs with an explicit `search_path = public, pg_catalog` in production. Existing RPC grants were intentionally left unchanged so the live app does not suddenly lose write access.
- Removed the home-page DOM polling / MutationObserver hacks.
- Added a reusable `DashboardStats` component as the first step toward decomposing the large dashboard.
- Added a read-only inventory ledger integrity function that detects broken stock transitions and chain breaks without changing stock data.
- Added a centralized real-profit calculator.
- Added configurable sales-channel cost rules (defaults are zero; historical profit is not silently rewritten).

## Current production safety boundary

Do not revoke existing anonymous RPC grants or change inventory mutation semantics until every browser caller has been migrated behind an authenticated/server boundary and verified. The next security pass should then remove unnecessary `anon` execution from write-capable functions.

## Remaining implementation work

1. Split `components/Dashboard.tsx` by responsibility and remove remaining legacy build patches.
2. Move Supabase queries and business calculations into dedicated modules/hooks.
3. Replace build-time source patch scripts with normal source changes and delete obsolete patches.
4. Add the ledger integrity check to the management UI and reconciliation workflow.
5. Verify and centralize FIFO cost calculation and ensure sale registration uses the same source of truth.
6. Wire the real-profit calculator to configured channel rules and expose channel-level real profit in the management dashboard.
7. Add automated build/type checks before the PR is promoted to `main`.
