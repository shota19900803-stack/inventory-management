# Core system refactor status

Branch: `refactor/core-system-v1`

## Completed in this pass

- Created an isolated refactor branch from `main`.
- Added a conservative Supabase security-hardening migration.
- Pinned `search_path` for the dashboard summary RPC.
- Removed the DOM polling / MutationObserver hacks from `pages/index.tsx`.
- Added a reusable `DashboardStats` component as the first step toward decomposing the large dashboard.

## Safety rule

Do not revoke live RPC grants or change inventory mutation semantics until every caller is identified and the authenticated/RLS boundary is verified.

## Next

1. Split `components/Dashboard.tsx` by responsibility.
2. Move Supabase queries and business calculations into dedicated modules/hooks.
3. Replace build-time source patch scripts with normal source changes and delete obsolete patches.
4. Add inventory-ledger invariants and reconciliation checks.
5. Verify and centralize FIFO cost calculation.
6. Centralize real-profit calculation by sales channel.
