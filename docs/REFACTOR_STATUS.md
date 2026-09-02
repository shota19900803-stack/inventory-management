# Core system refactor status

Branch: `refactor/core-system-v1`

## Completed on the refactor branch

- Created an isolated refactor branch from `main`.
- Added a migration that hardens the targeted `SECURITY DEFINER` RPCs with `search_path = public, pg_catalog`. **The migration is not considered production-applied until it has been executed and verified in Supabase.**
- Removed the home-page DOM polling / MutationObserver hacks.
- Added a reusable `DashboardStats` component as the first step toward decomposing the large dashboard.
- Added read-only inventory ledger integrity diagnostics without changing stock values.
- Added a centralized real-profit calculator.
- Added configurable sales-channel cost rules with zero defaults so historical profit is not silently rewritten.
- Added CI build/typecheck plumbing.

## Current production safety boundary

Do not revoke existing anonymous RPC grants or change inventory mutation semantics until every browser caller has been migrated behind an authenticated/server boundary and verified. Do not treat a migration file as applied until its execution result has been confirmed in Supabase.

## Remaining implementation work

1. Split `components/Dashboard.tsx` by responsibility and remove remaining legacy build patches.
2. Move Supabase queries and business calculations into dedicated modules/hooks.
3. Replace build-time source patch scripts with normal source changes and delete obsolete patches.
4. Add the ledger integrity check to the management UI and reconciliation workflow.
5. Verify and centralize FIFO cost calculation and ensure sale registration uses the same source of truth.
6. Wire the real-profit calculator to configured channel rules and expose channel-level real profit in the management dashboard.
7. Run CI and application smoke tests; only then promote the PR toward `main`.
