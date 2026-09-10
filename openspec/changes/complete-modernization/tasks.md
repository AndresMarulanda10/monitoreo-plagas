# Tasks: Complete Modernization MVP

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 950–1,200 |
| 800-line budget risk | High |
| Chained PRs recommended | Yes if exception is declined |
| Suggested split | Four work units in PR |
| Delivery strategy | single-pr |
| Size exception required | Yes |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

Next: Work Unit 1; retain single-PR.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Schema/catalog/domain | Single PR slice 1 | `npx vitest tests/domain` | N/A: pure domain/migrations | `./supabase/migrations/001_schema.sql`, `./supabase/migrations/002_catalog_seed.sql`, `./server/src/domain/catalog.ts`, `./server/src/domain/metrics.ts`, `./server/src/domain/reviews.ts` |
| 2 | Secure API lifecycle | Single PR slice 2 | `npx vitest tests/api` | Compose API + smoke requests | `./server/src/app.ts`, `./server/src/routes/v1/reviews.ts`, `./server/src/middleware/auth.ts`, `./server/src/middleware/cors.ts`, `./server/src/middleware/csrf.ts`, `./server/src/db.ts` |
| 3 | Analytics and workflow | Single PR slice 3 | `npx vitest tests/frontend` | Playwright login → correction | `./src/components/MonitoringForm.tsx`, `./src/pages/index.astro`, `./src/components/ui/Button.tsx`, `./src/components/ui/Card.tsx`, `./src/styles/global.css`, `./tests/frontend/MonitoringForm.test.tsx` |
| 4 | Delivery and runbook | Single PR slice 4 | `npm run build` | Compose API health endpoint | `./api/Dockerfile`, `./docker-compose.yml`, `./nginx.conf`, `./.env.example`, `./.github/workflows/ci.yml`, `./docs/operations.md`, `./README.md` |

Evidence: domain/API tests, Playwright parity, build, scans, and health logs.

## Phase 1: Foundation

- [x] 1.1 Add API/Vitest scaffolding in `./server/src/contracts.ts`, `./package.json`, `./vitest.config.ts`, `./supabase/types.ts`; define contracts and severity 0–3 types.
- [x] 1.2 Write RED tests in `./tests/domain/metrics.test.ts`, `./tests/domain/completeness.test.ts`, and `./tests/domain/weekly-review.test.ts` for formulas, missing entries, and two independent weekly slots.
- [x] 1.3 Implement `./server/src/domain/catalog.ts`, `./server/src/domain/metrics.ts`, and `./server/src/domain/reviews.ts`; enforce affected/inspected, max-3 severity over all inspected plants, `metrics.v1`, completeness, and duplicate slots.
- [x] 1.4 Create additive `./supabase/migrations/001_schema.sql` and `./supabase/migrations/002_catalog_seed.sql`; seed five blocks, plant counts, eight organisms, and immutable versions.

## Phase 2: Secure API and Lifecycle

- [ ] 2.1 Write RED tests in `./tests/api/security.test.ts` for invalid-version 404, unauthenticated 401, and DB/secret non-exposure.
- [ ] 2.2 Implement `./server/src/middleware/auth.ts`, `./server/src/middleware/cors.ts`, `./server/src/middleware/csrf.ts`, `./server/src/db.ts`, and `./server/src/app.ts`; enforce server-only Supabase, cookies, ownership, allowlists, and errors.
- [ ] 2.3 Implement `./server/src/routes/v1/reviews.ts` for catalog, draft/reload/save, atomic complete submit, stale rejection, and immutable corrections.
- [ ] 2.4 Implement `./server/src/routes/v1/analytics.ts` and `./server/src/routes/v1/exports.ts`; share filtered dashboard/table/CSV-first data, provenance, pagination, empty states, and rounding.

## Phase 3: Frontend Workflow

- [ ] 3.1 Add `./tests/frontend/MonitoringForm.test.tsx` for keyboard/mobile entry, reload, incomplete state, confirmation, and correction errors.
- [ ] 3.2 Replace demo behavior in `./src/components/MonitoringForm.tsx` and `./src/pages/index.astro` with the API-only catalog/draft/submit/correction workflow and 0–3 labels.
- [ ] 3.3 Add dashboard/table/CSV modules under `./src/components/`; update `./src/components/ui/Button.tsx`, `./src/components/ui/Card.tsx`, and `./src/styles/global.css` for accessible tables and filter parity.

## Phase 4: Verification, Delivery, Documentation

Also exclude treatment workflows.

- [ ] 4.1 Add Playwright `./tests/e2e/monitoring.spec.ts` for login → reload → confirmation → correction → dashboard/CSV; cover migration, pagination, provenance, and parity.
- [ ] 4.2 Add `./api/Dockerfile`, update `./docker-compose.yml`, `./nginx.conf`, `./.env.example`; gate migrations, the health endpoint, readiness, and safe recovery.
- [ ] 4.3 Update `./.github/workflows/ci.yml`, `./.gitignore`, `./.dockerignore`, fixtures, `./README.md`, and `./docs/operations.md`; block secrets/workbooks and document backups, legacy quarantine, portability, and health.
- [ ] 4.4 Run build, Vitest, Playwright, scans, and health checks; record evidence and preserve non-goals: legacy import, catalog administration, offline sync, photos, alerts/treatments, maps, saved filters, PDF/XLSX, advanced charts, multi-tenancy, historical reconciliation.
