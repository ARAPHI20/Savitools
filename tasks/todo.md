# Soroban Event Stream Inspector (issue #78)

Branch: `feat/issue-78-soroban-event-inspector`

## API — apps/api/src/modules/contracts/
- [x] `scval-decoder.ts` — exhaustive `decodeScVal` over all 22 `xdr.ScValType` variants
- [x] `scval-decoder.spec.ts` — per-variant tests + JSON-serializability
- [x] `event-filters.ts` — `applyEventFilters` (topic_contains, value_type_is, value_equals, ledger_range)
- [x] `event-filters.spec.ts` — table-driven filter tests
- [x] `dto/query-events.dto.ts`, `dto/filter-events.dto.ts`, `dto/replay-events.dto.ts`
- [x] `events.service.ts` — getEvents + decode + replay sender
- [x] `events.service.spec.ts` — stubbed rpc.Server, mocked fetch/dns, recomputed HMAC
- [x] `events.controller.ts` — 3 routes (2 public, replay guarded)
- [x] `events.controller.spec.ts` — Fastify inject; public GET, 401 on replay
- [x] `contracts.module.ts` — register controller + service

## Web — apps/web/src/
- [x] `lib/contract-events.ts` — mirrored filter predicates
- [x] `lib/api.ts` — typed wrappers under `/* ─── Contract Events ─── */`
- [x] `app/contracts/events/page.tsx` — server component shell
- [x] `components/tools/contract-events-tool.tsx` — client tool
- [x] `components/tools/state-display.tsx` — skeleton + empty state
- [x] `lib/tools.ts` — register route
- [x] `app/contracts/page.tsx` — cross-link

## Verification
- [x] `cd apps/api && npx jest contracts`
- [x] `npm run build` (both apps compile)

## Review

**API** — new `EventsService`/`EventsController` inside the contracts module, with the
ScVal decoder and filter engine as pure, dependency-free modules (the
`operation-decoder.ts` house pattern). 77 new tests; full contracts suite 130 green.

**Web** — `/contracts/events` tool: query form, instant client-side filter bar, expandable
event cards with a decoded ScVal tree and raw XDR, and a replay dialog. Both apps build.

**Verified beyond unit tests** — decoded 200 real events off live Soroban testnet in
**451 ms** (criterion: 3 s), JSON-serializable, 0 decode failures, every `raw` field
byte-populated. Live types exercised: symbol, address, i128, string, map.

**Two real bugs caught during implementation**
- `scValToBigInt` rejects timepoint/duration — they'd have silently decoded to `null`.
  They now use `.timepoint()`/`.duration()` accessors and are tested.
- `ContractsModule` used `JwtAuthGuard` without importing `AuthModule`. Now imported,
  matching `MonitorModule`.

**Pre-existing failures, untouched by this work** — `composer.service.spec.ts`,
`federation.service.spec.ts`, `orderbook.service.spec.ts` (5 tests). Confirmed failing
identically on a clean tree via `git stash`.

**Not merged** — the repo has no staging branch (only `main`, which is off-limits per
CLAUDE.md), so the work stays on `feat/issue-78-soroban-event-inspector`.
