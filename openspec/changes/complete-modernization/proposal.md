# Proposal: Complete Modernization

## Intent

Replace the browser demo with mobile entry, reproducible analytics, and low-cost deployment. Spreadsheets remain evidence, not truth.

## Proposal question round

Answer or skip the checklist; request another round.

## Baseline and Decisions

**Confirmed:** Astro/React/TypeScript/Tailwind frontend; no API, persistence, auth, dashboard, or tests; Docker is static; reviews are twice-weekly, severity 0–3, eight organisms, and lot/crop/bed/plant counts.

**Accepted assumptions:** observations are immutable; metrics retain numerator, denominator, grain, formula version, and provenance; browsers never connect to PostgreSQL; legacy files remain quarantined.

**Approval checklist (blocked rules require approval):**
- [ ] Metrics: incidence denominator; severity formula; rounding; missing-data policy.
- [ ] Catalogs/IDs: canonical relationships; stable plants; aliases; eight-organism completeness.
- [ ] Reviews: schedule/identity; calendar or cycle; partial submission and editing.
- [ ] Legacy: reference-only, quarantined, or reviewed import; mapping owner.
- [ ] Auth/roles: identity/access, roles/isolation, session model, preview data.
- [ ] Exports: CSV-only MVP or approved PDF/XLSX formats.
- [ ] Hosting: frontend/API/domain/TLS, repo/deployment owners.
- [ ] Operations: registry/trigger, backups/alerts, RPO/RTO, restore versus migration.
- [ ] MVP: approve the slice or an 800-line exception.

## Scope

### In Scope (bounded MVP)
- Seed representative configuration and eight-organism catalog; provide versioned API and PostgreSQL persistence.
- Slice: choose review/location → enter scores → draft/validate/submit → server metrics → confirmation/correction.
- Filtered KPIs, accessible trend/comparison view, paginated raw table, provenance-bearing CSV.
- Auth boundary; Compose service/migration health checks; sanitized fixtures; secret-safe cached CI.

### Out of Scope

Legacy import, catalog administration, offline sync, photos, alerts/treatments, maps, saved filters, PDF/XLSX, advanced charts, multi-tenancy, and historical reconciliation.

## Capabilities

### New Capabilities
- `monitoring-entry`: reviews and plant observations.
- `monitoring-analytics`: metrics, dashboard, table, CSV.
- `monitoring-platform`: API, persistence, deployment, operations.

### Modified Capabilities
- None; source specs do not exist.

## Approach

Recommended direction, not final design: Astro/React → TypeScript API → PostgreSQL; containers support VPS deployment; frontend supports Vercel or Nginx. Design chooses framework, auth, migrations, and topology. CI builds tagged images, scans secrets/dependencies, and excludes workbooks and credentials.

## Affected Areas

`src/components/MonitoringForm.tsx`, `src/pages/index.astro`, API/domain/database modules, package/build files, Docker/Nginx, CI/ops, and sanitized fixtures.

## Risks and Rollback

Risks: formulas, legacy data, cross-origin auth, mobile density, and VPS failure. Gate specs on approvals; use additive migrations, backups, health gates, prior-image redeploy, corrective migrations, and restore drills—never destructive rollback.

## Dependencies

Owner approvals; hosting/domain/operations owners; secret/backup/alert destinations; sanitized fixtures.

## Success Criteria

- [ ] Approved review persists/reloads through the API with valid 0–3 data and reproducible metrics.
- [ ] Dashboard, table, and CSV agree on filters and provenance.
- [ ] Build, domain/API checks, container health, and CI safety checks pass.
- [ ] Deployment, backup/restore, and image rollback procedures are documented.
