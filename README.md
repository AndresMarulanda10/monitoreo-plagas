# Monitoreo de plagas y enfermedades

Frontend for recording and analyzing crop monitoring observations by lot, crop, bed, plant, and pest/disease.

## Current status

The first frontend slice is available as a local interactive monitoring-entry demo. It includes crop, lot, and bed context selectors, 0–3 severity controls for each plant, and an incidence summary per organism.

Read the initial analysis before development:

- [Initial analysis](docs/initial-analysis.md)
- [Stack and deployment proposal](docs/stack-proposal.md)

## Source material

The original workbooks remain outside this repository because they contain the source data and live in a temporary WhatsApp container path. Their exact paths and a data-quality summary are recorded in the initial analysis.

## Local development

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Astro, normally `http://localhost:4321`.

Run the production build and preview it locally:

```bash
npm run build
npm run preview
```

## Docker preview

Build and serve the static output through Nginx on `http://localhost:8080`:

```bash
docker compose up --build
```

Stop the container with:

```bash
docker compose down
```

The image exposes `GET /healthz` for a basic container health check.

## Data scope

This slice is intentionally local-only. Form state is held in the browser, the save action only confirms the demo interaction, and no data is persisted or sent to an API/database. Demo crop, lot, bed, and plant values are client-side placeholders pending validated master data and data rules.

## Next slices

1. Define the authoritative data rules with the product owner.
2. Connect the frontend to a validated API contract; the browser must not connect directly to the database.
3. Replace the demo catalogs with validated crop, lot, bed, and plant master data.
4. Add authenticated persistence and historical monitoring views behind the API boundary.
