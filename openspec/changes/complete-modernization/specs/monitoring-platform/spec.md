# Monitoring Platform Specification

## Purpose

Provide a low-cost, secure, versioned API and operational baseline for monitoring entry and analytics.

## Requirements

### Requirement: Versioned API contract and server validation

The browser MUST use only authenticated `/api/v1` contracts. Errors MUST be `{ code, message, details }`; list responses MUST be `{ data, nextCursor }`. The API MUST validate catalog references, ownership, versions, completeness, filters, limits, and authorization server-side. It MUST support draft creation/reload, observation save, submit, correction, dashboard, paginated observations, and CSV routes defined by the design.

#### Scenario: Authorize a valid request

- GIVEN an authenticated authorized user sends a valid versioned request
- WHEN the API processes it
- THEN it returns the documented envelope and only permitted data

#### Scenario: Fail safely at the boundary

- GIVEN a request has no session, an invalid version, or invalid input
- WHEN it reaches the API
- THEN it returns 401, 404, or a structured 4xx error and performs no mutation

### Requirement: Server-owned Supabase persistence and authentication

The API MUST access managed Supabase PostgreSQL/Auth only server-side; browsers MUST NOT connect to PostgreSQL, Supabase client APIs, or receive Supabase/service credentials. Sessions MUST use secure HttpOnly cookies, with allowlisted CORS and Origin/CSRF checks when hosts are split. Persistence MUST preserve immutable submitted versions, correction links, raw observations, and metric provenance.

#### Scenario: Protect secrets and database access

- GIVEN a browser loads the frontend or calls a public health endpoint
- WHEN it inspects client responses and network-accessible bindings
- THEN no database URL, Supabase key, or service secret is exposed and no database endpoint is reachable

#### Scenario: Persist an immutable correction

- GIVEN a submitted version and valid correction reason
- WHEN the server writes the correction
- THEN the transaction creates a linked version and leaves the original observations and metrics unchanged

### Requirement: Health, migration, rollback, and low-cost delivery safety

The container deployment MUST expose public `/healthz`, health-check the API and migration readiness, and use additive backward-compatible migrations. Rollback MUST redeploy a prior image and use corrective migration or restore, never destructive schema rollback. CI MUST run `npm run build`, newly introduced domain/API tests, secret and dependency checks, sanitized-fixture checks, and container health checks; dependency caching MAY be used, while workbooks and credentials MUST be excluded. The MVP SHOULD use short-lived caching for catalogs and stable dashboard reads and SHOULD avoid materialized or operationally heavy services without approval. Backup destination/retention, alerting, RPO/RTO, migration-tool ownership, deployment trigger, infrastructure/domain/TLS ownership, roles/site access, preview-data policy, and stable identifiers remain TBD.

#### Scenario: Gate an unsafe release

- GIVEN a migration, build, test, secret scan, or health check fails
- WHEN CI or deployment evaluates the release
- THEN the release is blocked without publishing credentials or an unhealthy image

#### Scenario: Recover without destructive rollback

- GIVEN the current image or migration is unhealthy
- WHEN operators follow the documented recovery path
- THEN the prior image, corrective migration, or approved restore is used and the event is observable

## Non-goals

Multi-tenancy, legacy import, offline sync, photos, alerts/treatments, maps, catalog administration, advanced charts, saved filters, PDF/XLSX, and historical reconciliation are excluded.
