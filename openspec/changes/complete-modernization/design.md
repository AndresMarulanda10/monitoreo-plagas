# Design: Complete Modernization

## Technical Approach

Deliver the approved MVP automatically in one PR, capped at 800 changed lines; no silent exception. Astro/React stays static for Vercel/Nginx. Hono/Node TypeScript `/api/v1` is the sole browser boundary and owns auth, validation, metrics, pagination, CSV, and provenance. Supabase managed PostgreSQL/Auth is server-side only; SQL migrations/types remain PostgreSQL-portable. Scope is one complete review slice, analytics, and operations.

## Architecture Decisions

| Area | Choice and tradeoff | Rationale |
|---|---|---|
| API | Hono/Node, not FastAPI or a BaaS browser API | Same-language types, small portable container, explicit policy boundary. |
| Data/auth | API-mediated Supabase; no browser Supabase client | Managed services reduce VPS work; repository SQL and server credentials limit coupling. |
| Lifecycle | Mutable drafts; submitted records immutable; corrections create linked versions | Auditability and reproducibility justify version rows. |
| Hosting | Static frontend plus containerized API; split hosts or Nginx `/api` proxy | Supports both topologies without exposing PostgreSQL; split hosts require CORS/CSRF/TLS. |

## Data Flow and Sequences

Seed five configuration blocks (Hortisimulador/Tomato; G/Strawberry; G/Blueberry; F/Cucumber; F/Tomato) and eight organisms: Cladosporium, Mildeo, Botrytis, Aphids, Thrips, Mites, Tuta, Plutella. Two independent reviews occur weekly. The matrix accepts only severities 0–3; incomplete matrices block submission. Incidence is affected/inspected (score > 0); severity is `sum(score)/(inspected × 3) × 100`, normalized to max 3. Persist numerator, denominator, grain, `metrics.v1`, source version, and timestamp; round in response/CSV. Legacy files remain immutable quarantine/reference and are not imported.

```text
Browser → API: session + draft/reload → Supabase Auth/Postgres
API: validate → submit transaction → calculate/store immutable metrics → confirmation
Correction: submitted version + reason + complete matrix → new version → recalculated metrics
Dashboard/table/CSV use the same authenticated filter read model.
```

## Interfaces / Contracts

Under `/api/v1`, errors are `{ code, message, details }` and lists are `{ data, nextCursor }`.

- `POST /reviews/drafts` creates a draft; `GET /reviews/{id}` reloads the full context, status, version, completion, observations, and metrics/provenance read model.
- `PUT /reviews/{id}/observations` accepts `{ version, entries:[{plantId,organismId,severity}] }` only for drafts and returns the refreshed read model.
- `POST /reviews/{id}/submit` re-reads and validates atomically, rejects incomplete/stale matrices, freezes the version, and returns `{ data:{reviewId,status:"submitted",version,submittedAt,metrics,confirmation} }`.
- `POST /reviews/{id}/corrections` accepts `{ baseVersion, reason, entries }`; it never edits prior rows, creates the next submitted version linked to `baseVersion`, recalculates metrics, and returns that version/read model.
- `GET /dashboard`, `GET /observations?cursor&limit&filters`, and `GET /exports/reviews.csv?filters` share indexed filters (review/date, configuration, crop, bed, organism); charts have an equivalent table.

Use secure HttpOnly cookies, allowlisted split-host CORS, `SameSite=None; Secure` when required, Origin/CSRF checks, rate limits, and default-deny site authorization. Browsers never access PostgreSQL, Supabase, or Supabase secrets.

## File Changes

| Files | Action | Purpose |
|---|---|---|
| `src/components/MonitoringForm.tsx`, `src/pages/index.astro`, `src/components/ui/*`, `src/styles/global.css` | Modify | Catalog-driven entry, reload/errors, responsive matrix, dashboard/table. |
| `api/src/{app,routes/v1,middleware,domain,db}.ts`, `supabase/migrations/*.sql`, `supabase/types.ts` | Create | API, schema, seeds, validation, metrics, generated types. |
| `api/Dockerfile`, `docker-compose.yml`, `nginx.conf`, `.env.example`, `.github/workflows/ci.yml`, `docs/operations.md`, `tests/**`, `vitest.config.ts` | Create/modify | Health, CI, secrets, tests, deployment and recovery runbook. |

## Testing Strategy

`npm run build` remains mandatory. Vitest RED tests cover formulas, completeness, weekly independence, stale drafts, and immutable corrections; API tests cover auth, pagination, provenance, CSV parity, migrations, and DB non-exposure. React tests cover keyboard/mobile states; one Playwright path covers login → reload → confirmation → correction → dashboard/CSV. CI checks fixtures, secrets, dependencies, and container health.

## Threat Matrix

| Boundary | Applicability, safe/failure behavior | Planned RED test |
|---|---|---|
| Routing | Applicable: allowlisted `/api/v1`, public `/healthz`; unknown/version-invalid routes 404, unauthenticated data 401, proxy never exposes DB. | Unknown version, unauthenticated mutation, DB exposure. |
| Documentation-like paths | N/A — no executable-file classification. | None. |
| Git repository selection | N/A — no user-controlled repository selector. | None. |
| Commit state | N/A — CI/deploy does not mutate commits. | None. |
| Push state | N/A — protected branch/tag policy resolves publishing. | None. |
| PR commands | N/A — no composed PR automation. | None. |

## Migration / Rollout

Use additive, backward-compatible Supabase migrations and a one-shot migration/health gate; rollback redeploys the prior image and uses corrective migration or restore, never destructive rollback. Keep CI cached and secret-safe, exclude workbooks, and document encrypted backups, restore drills, logs, uptime checks, and portability to self-hosted PostgreSQL. No legacy migration is in the MVP.

## Out of Scope

Saved filters, advanced charts, treatment workflows, historical reconciliation, offline sync, photos, alerts, maps, PDF/XLSX, catalog administration, multi-tenancy, and legacy import.

## Open Questions — explicit owners

- [ ] Catalog/rule owner; infrastructure/domain/TLS owner; deployment trigger.
- [ ] Migration tool ownership; backup destination/retention; alert owner; RPO/RTO.
- [ ] Roles/site access, preview-data policy, and stable catalog/plant identifiers.
