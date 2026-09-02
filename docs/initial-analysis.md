# Initial analysis

Date: 2026-09-01

## Sources reviewed

### Workbooks

1. `/Users/andresmarulanda/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/845B867B-A2B1-49A1-9538-45C9B4CAF94D/Monitoreo_Plagas_y_Enfermedades_9Cultivos.xlsx`
2. `/Users/andresmarulanda/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/4DBF5E6E-6C84-4B59-A164-26E254233F37/Monitoreo_Registro de datos.xlsm`

The user also supplied seven visual/PDF pages and screenshots of the current manual/mobile workflow. The images show crop sections, beds, plant rows, the organisms `Mildeo`, `Cladosporium`, and `Botrytis`, and a mobile severity selector from 0 to 3.

## Workbook inventory

| Workbook | Sheets | Relevant finding |
| --- | --- | --- |
| `.xlsx` | `Dashboard Resumen`, `Registro_Campo`, `Consolidado_Semanal`, `Escala_Severidad` | Mostly a summary/reporting workbook. `Consolidado_Semanal` contains formulas, but the formulas omit week from their criteria. |
| `.xlsm` | `Listas`, `Base de datos`, `Tto de datos`, `Menú` | Operational workbook with formulas, pivots, slicers, macros, and an unavailable external link. It contains malformed values and unresolved formula dependencies. |

### `.xlsx` structure

- Nine crops appear in the weekly consolidation: Tomate, Pimentón, Rosa, Fresas, Uva, Cebolla, Repollo, Aguacate, and Café.
- Nine lots appear: Norte, Invernadero A, Flores, Sur, Viñedo, Sector B, Sector C, Frutales, and Ladera.
- `Registro_Campo` contains only ten records from week 1 and only Tomate and Rosa.
- Sample rows are numbered 1–5.
- Raw incidence is binary (`0` or `1`); raw severity is observed as `0–3`, although the workbook labels/scale are inconsistent with `0–4`.
- The workbook includes Cladosporium, Botrytis, Mildeo polvoso, Ácaros, Trips, Mosca blanca, Áfidos, Tuta absoluta, and Plutella.

### `.xlsm` structure

- `Base de datos` contains 13,140 data rows covering weeks 3–35, beds 1–12, and segments 1–6.
- It has no crop, lot, date, or plant identifier, so it cannot be joined reliably to the `.xlsx` without additional mapping.
- It includes Ácaros, Trips, Escamas, Áfidos, Cladosporium, Mildeo polvoso, Mildeo velloso, Roya parda, Diplocarpo, and Botrytis.
- `% Incidencia` is calculated as `Incidencia / 20`, but source incidence values exceed 20 and include malformed text.
- Severity values mix fractions, ordinal values, and percent-like values (`0.1`, `1–3`, `10–40`), so they are not a safe canonical specification.
- The `Key` dependency points outside the declared data range; cached menu results include `#N/A`.
- Macros were detected but not executed. An external reference to `D:\Monitoreo v0.xlsx` is unavailable.

## Domain interpretation from the supplied explanation and images

The current field workflow appears to be:

1. Select a crop and bed.
2. Inspect each plant/sample row.
3. Record a severity score for each organism.
4. Treat any score greater than zero as an affected plant for incidence.
5. Aggregate the result by bed, crop, and lot, then display percentages.

For the first version, the most defensible working definition is:

```text
incidence percentage = affected plants / inspected plants × 100
affected plant = severity score in {1, 2, 3}
```

Severity should remain an ordinal score (`0 = no symptoms`, `1 = low`, `2 = medium`, `3 = high`) until the owner confirms whether an additional normalized percentage is required. An average severity percentage must not be silently inferred from the inconsistent workbooks.

## Important data-quality findings

- The two workbooks do not describe the same normalized dataset.
- Crop and lot relationships are missing from the `.xlsm`.
- Pest/disease catalogs differ between the workbooks and the visual material.
- The `.xlsx` weekly formulas omit week criteria, so historical summaries can be repeated across weeks.
- The `.xlsx` dashboard does not reconcile with the small raw field register.
- The `.xlsm` contains malformed values, formula errors, missing key inputs, and an unavailable external workbook.
- Some cells in the `.xlsm` are unreadable or corrupted; they must be quarantined or corrected rather than guessed.
- The visual material supports a 0–3 severity selector; labels such as 1–4 in the PDF pages appear to be plant/sample row numbers, not necessarily severity values.

## Proposed normalized model

The application should separate captured values from derived values:

- `Crop`: canonical crop name.
- `Lot`: physical production lot; a lot may contain more than one crop.
- `Bed`: bed belonging to a lot and optionally associated with a crop for a monitoring round.
- `MonitoringRound`: date, week label/type, observer, and source.
- `SampleUnit`: plant or sample identifier and inspected denominator.
- `Organism`: canonical pest/disease name, category, and aliases.
- `Observation`: raw severity, presence/incidence value, notes, and provenance.
- `Metric`: derived incidence rate, severity aggregate, numerator, denominator, and calculation version.
- `DataQualityIssue`: source, location, raw value, issue type, and resolution status.

The model must preserve the denominator used for every percentage. This prevents the application from repeating the `.xlsm` assumption that every percentage is divided by 20.

## Questions that block implementation

1. Which source is authoritative when the workbooks, PDF, and mobile screen disagree?
2. Is incidence always based on affected plants, or are some organisms measured by counts/traps?
3. What is the denominator: all plants inspected in a bed, a fixed sample size, segments, or traps?
4. Is severity strictly 0–3 for the first release, and should it be averaged across all plants or only affected plants?
5. How should a lot containing multiple crops be represented and summarized?
6. Are week numbers calendar/ISO weeks, production-cycle weeks, or labels entered by the user?
7. Which crop, lot, bed, and plant catalog should be the initial master data?
8. Should historical workbook records be imported, quarantined for review, or used only as visual reference?
9. What thresholds or alerts should be derived from incidence and severity?
10. Is there an existing API/database to connect to, or should the first slice define a new backend contract?

## Recommendation before coding

Approve the metric definitions, master-data mapping, and treatment of legacy data first. The current files are useful as reference material and migration input, but they are not reliable enough to become the database schema or calculation engine without a validation step.
