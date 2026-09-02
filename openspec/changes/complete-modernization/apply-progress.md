# Apply Progress: Complete Modernization

## Work Unit

- Change: `complete-modernization`
- Work unit: `foundation-schema-domain`
- Delivery: single PR with explicitly approved `size:exception`
- Mode: Standard (strict TDD remains disabled by project configuration)
- Scope: tasks 1.1–1.4 only

## Completed Tasks

- [x] 1.1 Added Vitest scaffolding, shared API/domain contracts, severity `0 | 1 | 2 | 3`, review slots, metric provenance, and Supabase database types.
- [x] 1.2 Added domain tests for incidence/severity formulas, complete matrices, invalid values, duplicate coordinates, and independent weekly slots.
- [x] 1.3 Implemented the canonical catalog, completeness validation, scoped metrics, duplicate-slot checks, and immutable correction-version helper.
- [x] 1.4 Added additive schema and catalog-seed migrations with five configurations, stable plant identities, eight organisms, submitted-version immutability, and metric provenance storage.

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest tests/domain` — passed; 3 test files and 10 tests passed. |
| Runtime harness command/scenario and exact result | N/A — this unit contains pure domain functions and SQL migrations only; the API and database runtime harness belong to Work Unit 2. |
| Rollback boundary | Remove `api/src/contracts.ts`, `api/src/domain/catalog.ts`, `api/src/domain/metrics.ts`, `api/src/domain/reviews.ts`, `tests/domain/metrics.test.ts`, `tests/domain/completeness.test.ts`, `tests/domain/weekly-review.test.ts`, `supabase/types.ts`, `supabase/migrations/001_schema.sql`, `supabase/migrations/002_catalog_seed.sql`, `vitest.config.ts`, and the Vitest package/scripts without reverting frontend or later API work. |

## Additional Verification

- `npm run build` — passed; `astro check` reported 0 errors and `astro build` generated the static site successfully.
- No legacy workbook values were imported.
- No browser database access, Supabase secrets, API routes, auth middleware, frontend, dashboard, Docker, or CI changes were made.

## Notes and Deviations

- The task path references were made explicit and repository-relative so native SDD edit-root validation recognizes the authorized project root; no product scope changed.
- Metrics support an optional plant scope and grain so a bed metric uses its four configured plants while a review metric uses every configured plant. Stored percentages remain unrounded; presentation rounding is deferred to the API work unit.
