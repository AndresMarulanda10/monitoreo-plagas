# Monitoring Analytics Specification

## Purpose

Expose reproducible, filter-consistent metrics and review data for the bounded MVP.

## Requirements

### Requirement: Approved incidence and severity calculations

For each organism and requested review, bed, crop, or filtered aggregation grain, the system MUST calculate incidence as `affected plants / inspected plants × 100`, where affected is severity > 0. It MUST calculate severity percentage as `sum(severity scores) / (inspected plants × 3) × 100`. The stored metric MUST retain numerator, denominator, grain, formula version `metrics.v1`, source review/version, and calculation timestamp.

#### Scenario: Calculate a mixed result

- GIVEN 2 affected plants among 4 inspected plants with scores 1 and 3
- WHEN the server calculates the organism metric
- THEN incidence is 50% (2/4) and severity is 33.33% before presentation rounding (4/(4×3))

#### Scenario: Calculate an unaffected result

- GIVEN all 4 inspected plants have score 0
- WHEN the server calculates metrics
- THEN both percentages are 0%, with incidence numerator 0/4 and severity numerator 0/12

### Requirement: Explicit missing-data and presentation policy

An incomplete draft MUST have no submitted metrics. Submission MUST be blocked rather than shrinking denominators or treating missing entries as zero. Empty filtered result sets MUST return no data, not fabricated zero KPIs. Responses and CSV MUST present percentages rounded to the nearest whole percent and retain the unrounded inputs through provenance fields; the UI MUST label percentage values.

#### Scenario: Missing entry blocks calculation

- GIVEN one required plant-organism entry is missing
- WHEN the user attempts submission or metric calculation
- THEN the system reports incompleteness and emits no submitted metric

#### Scenario: Empty filter is explicit

- GIVEN filters match no submitted review
- WHEN dashboard or export data is requested
- THEN the response contains an empty result and a zero-count state without a percentage

### Requirement: Filtered dashboard, table, and CSV parity

The dashboard MUST provide filterable KPIs for selected reviews/dates, configurations, crops, beds, and organisms, plus review trends and comparisons. Every chart MUST have an equivalent accessible table. The paginated raw-observation table and CSV export MUST use the identical filter semantics and expose the same metric provenance, so displayed, tabular, and exported results agree.

#### Scenario: Compare filtered sources

- GIVEN a user filters by crop, bed, organism, and date range
- WHEN the user views KPIs, trend/table data, and CSV
- THEN all three use the same submitted review versions and filter boundaries

#### Scenario: Preserve pagination semantics

- GIVEN more raw observations exist than the requested page size
- WHEN the user requests the next cursor
- THEN the next page contains the next matching rows without duplicates or omissions

## Non-goals

Advanced charts, saved filters, maps, alerts/treatments, PDF/XLSX exports, and historical reconciliation are excluded.
