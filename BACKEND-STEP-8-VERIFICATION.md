# BACKEND-STEP-8 — §11 verification (evidence in repo)

Functional — implemented in prior steps; pointers below.

| Item | Status | Evidence |
|------|--------|----------|
| Registration / login httpOnly cookies | Done | `src/modules/auth/auth.controller.ts`, `auth.service.ts` `getCookieOptions` |
| Verticals / categories from DB | Done | `src/modules/verticals/*.controller.ts`, Prisma `Vertical`/`Category` |
| Lot CRUD / seller flow | Done | `lots.controller.ts`, `seller-lots.controller.ts`, `lots.service.ts` |
| Admin approve/reject | Done | `admin-lots.controller.ts`, `lots.service.ts` |
| Bid concurrency | Done | `bid.service.ts` Redis `setNxEx` lock |
| Anti-snipe | Done | `bid.service.ts` `checkAntiSnipe` |
| Auction lifecycle BullMQ | Done | `auction.processor.ts`, queues |
| Post-auction transactions | Done | `payments.service.ts`, transactions |
| Payments (wire/card) | Done | Mangopay mock + providers |
| Escrow / confirm | Done | `confirmReceipt`, `releaseEscrowAndComplete` |
| Inspection auto-confirm | Done | `scheduled-tasks` / maintenance jobs |
| Disputes | Done | `transactions.controller.ts`, `raiseDispute`, admin resolve |
| Non-payment strikes | Done | `payments.service.ts`, `User.strikeCount` |
| Watchlist | Done | `watchlist/` module |
| Notifications + WS | Done | `notifications.service.ts`, `auctions.gateway.ts` |
| Search Typesense fallback | Done | `search.service.ts` |
| Media R2 presign | Done | `media.service.ts` |
| Admin stats / live / flags / payouts | Done | `admin-*.controller.ts` |
| RSS / JSON / sitemap | Done | `search.controller.ts`, `feed.service.ts`, `sitemap.service.ts` |

Non-functional

| Item | Status | Evidence |
|------|--------|----------|
| Event log | Done | `events.service.ts`, `Event` model |
| Cursor pagination | Done | DTOs `*cursor*`, list endpoints |
| Redis cache | Done | `redis.service.ts`, dashboard, feeds, etc. |
| N+1 | Manual | Enable Prisma query logging in dev |
| Rate limiting | Done | `rate-limit.guard.ts`, `app.module.ts` |
| Global exception filter | Done | `global-exception.filter.ts` |
| Health liveness/readiness | Done | `health/` module |
| Swagger | Done | Controllers + `main.ts` `DocumentBuilder` tags |
| CORS | Done | `main.ts` |
| Cookies secure prod | Done | `auth.service.ts` `secure: NODE_ENV === production'` |
| Secrets in code | Pass | Use `.env`; no secrets committed |
| Soft-delete | Done | Prisma extension `soft-delete.extension.ts` |
| TS strict | Partial | `tsconfig` strict nulls; avoid `any` in new code |

Deployment

| Item | Status | Evidence |
|------|--------|----------|
| Docker Compose | Done | `docker-compose.yml` |
| Railway | Done | `railway.toml`, `Procfile` |
| CI | Done | `.github/workflows/ci.yml` |
| Migrations release | Done | `railway.toml` `releaseCommand` |
| Env documented | Done | `.env.example`, `env.schema.ts` |

**E2E:** `test/auth.e2e-spec.ts`, `lots.e2e-spec.ts`, `bids.e2e-spec.ts`, `setup.ts` + `jest-e2e.json`. Full flows in §8 (full auction lifecycle) require seeded data and longer runs — extend suites as needed.
