# Performance optimization

This branch focuses on keeping registration fast as history grows.

- Sale and purchase registration no longer require a full client-side data reload after successful RPC registration.
- The returned RPC result is applied to the local React state immediately.
- Composite indexes support FIFO and product/date history queries.
- Existing registration RPCs remain the source of truth for atomic stock updates.

The next optimization stage should move dashboard aggregates from client-side `filter`/`reduce` scans to database-side aggregate RPCs, while keeping detail/history screens paginated.
