# Exploration: complete-modernization

## Current State

### Confirmed current system and project constraints

- The repository contains an Astro static site with one React island, TypeScript, Tailwind CSS, and small local UI primitives. `src/components/MonitoringForm.tsx` is a browser-only demo: it hard-codes crop, lot, bed, three organisms, plant counts, and sample severities; its save action only updates local UI state.
- There is no backend, API, database, authentication, authorization, server-side persistence, dashboard route, charting implementation, export flow, or automated test runner.
- `npm run build` runs `astro check && astro build`. Strict TDD is disabled and unit, integration, E2E, coverage, lint, and formatter commands are currently unavailable.
- The current deployment is static output: a Vercel-compatible Astro build or an Nginx Docker image on a VPS. `docker-compose.yml` currently defines only the frontend container and its `/healthz` check.
- The browser/database boundary is a project constraint: future persistence MUST cross an API; the browser MUST NOT connect directly to a database.
- Legacy XLSX/XLSM/PDF/image files are preserved as reference and possible migration input. Existing analysis identifies inconsistent catalogs, missing joins, malformed values, formula errors, an unavailable external workbook, and unreliable denominators. They are not safe to use as an authoritative schema without validation.

### Confirmed stakeholder domain baseline

- Monitoring configurations are: Hortisimulador/Tomato with 6 beds × 4 plants; Lot G/Strawberry with 15 beds × 5 plants and Blueberry with 2 beds × 4 plants; Lot F/Cucumber with 2 beds × 15 plants and Tomato with 5 beds × 15 plants.
- The initial organism catalog contains exactly eight entries: Cladosporium, Mildeo, Botrytis, Aphids, Thrips, Mites, Tuta, and Plutella. The product should preserve the stakeholder labels while aliases and scientific names are clarified.
- Severity is restricted to 0–3. Score 0 means unaffected; scores 1, 2, and 3 mean affected. The visual references show a plant-by-organism grid and a mobile radio-style selector.
- Reviews occur twice weekly. Consolidated incidence and severity percentages are required by organism, bed, crop, and review.

### Baseline interpretation, not yet an approved product rule

The most defensible starting point is plant-level observation: incidence is affected inspected plants divided by inspected plants, with affected defined as severity > 0. This matches the explicit 0–3 semantics and the existing mobile example, but the denominator policy, severity-percentage formula, review identity, and handling of missing observations still require owner approval.

## Affected Areas

- `src/components/MonitoringForm.tsx` — replace hard-coded demo state with catalog-driven entry, review lifecycle, API calls, validation, draft recovery, and eight-organism support.
- `src/pages/index.astro` — become one route in a multi-view frontend (entry, review history, dashboard, tables, exports, and authentication state) while retaining a deployable static boundary where possible.
- `src/components/ui/*`, `src/styles/global.css` — extend the existing accessible visual language for dense plant matrices, responsive charts, tables, loading/error states, and authenticated navigation.
- `astro.config.mjs`, `package.json`, `package-lock.json` — decide whether the frontend remains static and add the first test/build/contract tooling without coupling it to persistence.
- `Dockerfile`, `docker-compose.yml`, `nginx.conf` — add or coordinate API, database, migration, health, reverse-proxy, and production configuration while keeping the current static deployment option.
- `docs/initial-analysis.md`, `docs/stack-proposal.md`, `docs/base/*` — remain source evidence; any migration mapping must be explicit, reviewable, and quarantinable rather than silently imported.
- New API/domain/database modules (location to be chosen) — own validation, authorization, calculations, provenance, migrations, and query pagination. The browser should consume only this boundary.
- CI/CD and operations configuration (location to be chosen) — provide reproducible checks, image promotion, secrets handling, backups, observability, and rollback.

## Approaches

1. **Authoritative domain model and legacy handling** — define a normalized model around site/lot, crop, bed, review, sample unit, observation, organism, derived metric, and data-quality issue; seed only the confirmed configuration and eight-organism catalog.
   - Pros: preserves raw observations and denominator provenance; supports multiple crops in a lot; prevents spreadsheet defects from becoming schema rules.
   - Cons: requires owner decisions about identifiers, aliases, catalog administration, and legacy reconciliation before import.
   - Effort: Medium.
   - Recommendation: treat the newer stakeholder baseline as the MVP catalog; keep legacy files immutable and import only through a staging/quarantine process with source location, raw value, mapping status, and reviewer resolution.
   - Unresolved: whether “Lote G” and “Lote F” are the exact canonical lot names, whether each stated crop belongs to that lot, whether plant identifiers are stable across reviews, and whether the eight-organism list is exhaustive per crop.

2. **Incidence, severity, denominator, and provenance** — calculate metrics from raw observation rows, not from stored spreadsheet percentages; persist numerator, denominator, aggregation grain, formula/version, source review, and calculation timestamp.
   - Pros: reproducible results, auditable corrections, and protection against the legacy fixed `/20` formula and omitted-week criteria.
   - Cons: requires complete matrix validation and an explicit policy for missing, skipped, damaged, or not-applicable units.
   - Effort: Medium.
   - Options for severity percentage:
     - **All inspected units:** `sum(severity) / (inspected units × 3) × 100`; aligns zero with unaffected and makes the denominator explicit.
     - **Affected units only:** `sum(severity) / (affected units × 3) × 100`; describes intensity among affected plants but is undefined when incidence is zero.
     - **Distribution-first:** show incidence plus counts/percentages by severity band and expose an average score, postponing a single severity percentage.
   - Recommendation: approve all-inspected versus affected-only before implementation; retain average ordinal severity and severity-band counts even if one percentage is selected.
   - Unresolved: whether all eight organisms use plant-level scores, whether any organism uses traps/counts, whether missing observations reduce denominators, rounding/precision, and whether a review may be edited after consolidation.

3. **Field entry and twice-weekly review workflow** — use a review record with scheduled/actual date, review number or cycle, location context, observer, status, and per-bed plant × organism observations.
   - Pros: reflects the visual workflow, supports resume/review, and allows the same review to consolidate consistently across beds and crops.
   - Cons: a full matrix can be dense on mobile; offline use, autosave, and synchronization add complexity.
   - Effort: High.
   - Recommended MVP flow: select review → select crop/lot/bed → enter all eight organism scores for each configured plant → validate completeness → save draft → submit → calculate metrics → show confirmation and corrections path.
   - Unresolved: fixed weekdays versus user-entered review dates, calendar week versus production-cycle review number, whether partial reviews can be submitted, whether offline capture is required, and whether notes/photos/actions are in scope.

4. **Consolidation, dashboard, charts, tables, filters, and exports** — offer role-appropriate views over review-scoped metrics at organism, bed, crop, and review grains.
   - Pros: server-side aggregation avoids transferring all raw observations and makes dashboards consistent with exports.
   - Cons: filter combinations, empty groups, rounding, and large tables need careful semantics; chart accessibility cannot rely on color alone.
   - Effort: High.
   - Recommended MVP views: KPI cards for selected filters; incidence/severity time series by review; organism comparison; bed heatmap or table; raw-observation detail table; CSV export of the filtered, provenance-bearing result.
   - Deferred candidates: PDF/XLSX export, alerts/thresholds, treatment recommendations, photo attachments, and advanced spatial maps.
   - Unresolved: default date/review range, whether percentages are rounded in storage or presentation, which chart types stakeholders actually need, export formats, and whether users can share saved filters.

5. **Frontend/backend/API architecture and authorization** — keep Astro static and use React islands or a client-side application shell for authenticated data views; place a separately deployable typed API between the browser and PostgreSQL.
   - **TypeScript API (Hono/Fastify-style):** reuses types and validation with the Astro frontend and is a natural fit for the existing repository; requires careful service/domain separation and API runtime decisions.
   - **Python FastAPI:** strong data and reporting ecosystem and clear OpenAPI support; introduces a second language/runtime and duplicated types unless contracts are generated.
   - **Managed BaaS API (for example Supabase):** fastest initial delivery with hosted auth/database; increases vendor coupling and can blur the required server-owned API boundary unless all access is mediated by application services.
   - Pros of a standalone API: explicit security boundary, deployability on the VPS, testable calculations, and no database credentials in the browser.
   - Cons: authentication, CORS/CSRF, rate limits, migrations, and API versioning become project responsibilities.
   - Effort: High.
   - Recommendation: a small TypeScript API with schema validation, OpenAPI documentation, server-side authorization, pagination, and versioned endpoints; keep the framework choice as a design-phase decision.
   - Unresolved: identity provider, invitation/public-access policy, roles (observer, analyst, administrator), tenant/site isolation, session-cookie versus token auth, and whether Vercel previews may access non-production data.

6. **Persistence suitable for a low-cost public project** — compare relational choices before implementation.
   - **Self-hosted PostgreSQL on the VPS:** strongest fit for relational master data, constraints, aggregates, migrations, and reporting; lowest recurring cost when a VPS already exists; adds backup and upgrade responsibility.
   - **SQLite on the VPS:** simple and inexpensive for a single writer; weaker concurrency, operational tooling, and future multi-instance portability; less suitable once authenticated concurrent entry and reporting grow.
   - **Managed PostgreSQL (Neon/Supabase/other):** reduces operations and improves hosted durability; introduces recurring cost, vendor limits, and possible egress/availability concerns.
   - Effort: Medium for schema; High for production hardening.
   - Recommendation: PostgreSQL behind the API, preferably self-hosted initially if the VPS is reliable, with encrypted off-host backups and a documented migration path to managed PostgreSQL. Do not use a frontend/Vercel database connection.
   - Unresolved: expected volume, concurrent observers, VPS provider/resources, data residency/retention, recovery objectives, and budget ceiling.

7. **Deployment topology and portability** — use `https://app.example` on Vercel or Nginx static hosting, `https://api.example` on the VPS, and a private PostgreSQL service reachable only by the API.
   - **Split Vercel frontend + VPS API/database:** best preview/CDN experience and preserves the static frontend; requires TLS, strict CORS, environment-specific API URLs, and cross-origin auth design.
   - **All services on the VPS:** simpler networking and same-origin proxying; less frontend CDN/preview convenience and more responsibility for static hosting.
   - **Serverless API/database platform:** easier scaling for bursty traffic but less aligned with a low-cost VPS-first deployment and can complicate long-lived database connections.
   - Effort: Medium.
   - Recommendation: support both split and all-on-VPS modes using the same containerized API and database contract; Nginx should proxy `/api` or a dedicated API hostname and never expose PostgreSQL publicly.
   - Unresolved: production domain/TLS owner, Vercel project ownership, whether the public repository is also the deployment source, and whether authentication cookies can be shared across the chosen hostnames.

8. **Docker, CI/CD, secrets, migrations, backups, observability, and rollback** — make operations explicit rather than relying on the current frontend-only compose file.
   - Pros of one Compose stack: low operational cost, reproducible local/VPS setup, simple health checks, and easy image rollback.
   - Cons: single-host failure domain, manual scaling, and care required around database volumes and migrations.
   - Effort: High.
   - Recommendation: multi-stage locked builds; separate frontend/API/database services; non-root runtime where practical; health/readiness checks; a one-shot migration job; tagged immutable images; GitHub CI for checks and image build; secrets only through deployment environment/secret storage; encrypted scheduled `pg_dump` plus restore drills; structured logs and uptime/error monitoring; rollback by redeploying a prior image and using backward-compatible, forward-only migrations.
   - Unresolved: registry, deploy trigger, backup destination/retention, alert owner, migration tool, RPO/RTO, and whether database rollback means restore or corrective migration.

9. **Cost control and pipeline optimization** — keep the frontend static, use a small API and one relational database, aggregate on the server, paginate raw tables, cache immutable catalogs, and avoid unnecessary client bundles.
   - Pros: fits a modest VPS and Vercel static tier; reduces bandwidth, database load, and CI time.
   - Cons: caching invalidation, aggregation indexes, and observability still require design; a single VPS remains a reliability risk.
   - Effort: Medium.
   - Recommendation: cache catalogs and stable dashboard queries briefly, index review/location/organism dimensions, avoid materialized metrics until profiling demonstrates need, run fast type/build/unit checks on every change, cache npm dependencies, and build/push production containers only on protected branches/tags.
   - Unresolved: free-tier/service limits, acceptable dashboard freshness, retention/archival policy, and whether public anonymous dashboard access is required.

10. **Testing strategy** — establish a test runner before implementing calculation and persistence behavior.
   - **Vitest + schema/domain unit tests:** low setup cost and good fit for TypeScript calculations and validation; does not prove browser workflows.
   - **React Testing Library:** covers interactive form and accessible states; can become coupled to presentation if overused.
   - **Playwright E2E:** proves mobile entry, authentication, filtering, export, and deployment smoke paths; slower and needs a running API/database fixture.
   - **API/contract tests:** verify authorization, pagination, OpenAPI payloads, migrations, and metric provenance; require an isolated database strategy.
   - Effort: Medium initially, High for complete coverage.
   - Recommendation: first add calculation/property tests with fixture cases for zero, all affected, partial/missing observations, multiple reviews, and each denominator option; then API integration tests, accessible form tests, one Playwright happy path, migration checks, and container health smoke tests. Keep build/type checks as mandatory baseline until the runner is installed.
   - Unresolved: target coverage, browser/device matrix, whether CI can run containers, and the test data policy for public-repository fixtures.

## Recommendation

Proceed to proposal/design only after recording the following as explicit decisions or accepted assumptions: the canonical site/lot/crop/bed/plant catalog; aliases for legacy organism names; review identity and twice-weekly scheduling; the incidence denominator and missing-data behavior; the severity-percentage formula; authentication roles and access boundary; initial export formats; and the production owner for the VPS, domain, secrets, backups, and alerts.

The recommended technical direction is a staged vertical slice: static Astro frontend → small versioned TypeScript API → PostgreSQL, with the same API/database containers usable on a VPS and the frontend deployable to Vercel or Nginx. Start with validated master data, one complete review-entry flow, immutable raw observations, server-derived metrics with numerator/denominator/formula provenance, a filtered dashboard/table, CSV export, and a minimal operational/test baseline. Defer legacy import, advanced charts, alerts, offline synchronization, treatment workflows, and PDF/XLSX generation until their product rules are approved.

The requested “complete modernization” is materially larger than the cached single-PR review budget of 800 changed lines. The SDD task phase should forecast this explicitly and either define a tightly bounded MVP that fits the budget or obtain an explicit exception; the current delivery strategy does not permit silently assuming chained PRs.

## Risks

- Treating spreadsheet formulas, labels, or cached values as canonical could reproduce incorrect historical metrics, especially the fixed `/20` denominator and week-insensitive formulas.
- A severity percentage cannot be implemented safely until the denominator and whether unaffected/missing units participate are approved.
- The stated lot/crop/bed counts may be sufficient for a seed catalog but do not yet define stable IDs, plant identity, lifecycle changes, or master-data administration.
- A dense eight-organism plant matrix may be difficult on mobile; usability and offline requirements can expand scope substantially.
- Cross-origin authentication between Vercel and a VPS API can introduce cookie, CSRF, CORS, preview-data, and hostname constraints.
- A single VPS database is inexpensive but creates a failure domain; backups without restore drills do not establish recoverability.
- Public repository exposure requires a strict secret policy, sanitized fixtures, dependency scanning, and no source workbook data committed accidentally.
- A single PR cannot safely deliver every requested frontend, backend, migration, dashboard, deployment, and test capability within 800 changed lines without an approved scope exception.

## Ready for Proposal

No — exploration is complete, but proposal/design should first present the unresolved product decisions above as an approval checklist. Once the owner selects the metric rules, catalog/legacy policy, auth model, and MVP boundary, the change is ready for a proposal followed by domain/API design.
