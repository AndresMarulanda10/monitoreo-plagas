# Monitoring Entry Specification

## Purpose

Provide a catalog-driven, mobile-friendly field-review workflow for the bounded MVP.

## Requirements

### Requirement: Canonical seeded monitoring catalog

The system MUST seed exactly these configuration blocks and their stable plant counts: Hortisimulador/Tomato (6 beds × 4 plants), Lot G/Strawberry (15 × 5), Lot G/Blueberry (2 × 4), Lot F/Cucumber (2 × 15), and Lot F/Tomato (5 × 15). Each configuration MUST expose the eight organisms Cladosporium, Mildeo, Botrytis, Aphids, Thrips, Mites, Tuta, and Plutella. Catalog/rule ownership and final identifier policy remain TBD.

#### Scenario: Select a seeded configuration

- GIVEN an authenticated user requests the monitoring catalog
- WHEN the user selects Lot G/Strawberry
- THEN the system exposes 15 beds, five plants per bed, and all eight organisms

#### Scenario: Reject an unknown configuration

- GIVEN a draft references a configuration outside the seeded catalog
- WHEN the user creates or saves the draft
- THEN the API rejects it with a validation error and stores no observation

### Requirement: Independent weekly review identity

Each review MUST have an explicit review identity, review date, observer identity, configuration, and one of two independent weekly review slots. A configuration MUST NOT have duplicate submitted reviews for the same week and slot; the calendar/week interpretation is an operational assumption pending owner confirmation.

#### Scenario: Create the second weekly review

- GIVEN the first weekly review is identified for a configuration
- WHEN an authorized observer creates the other weekly slot with its date and identity
- THEN the system creates a distinct review without overwriting the first

#### Scenario: Reject a duplicate slot

- GIVEN a submitted review already occupies a configuration's weekly slot
- WHEN another review is submitted for that same week and slot
- THEN submission is rejected and the original review remains unchanged

### Requirement: Draft plant-observation matrix

The system MUST represent every configured plant × organism entry with an integer severity from 0 through 3; a score greater than 0 MUST mean affected. Drafts MAY be incomplete, MUST persist through the API, and MUST reload with status, version, completion, and entries.

#### Scenario: Save and reload a draft

- GIVEN a user has entered valid scores for part of a review
- WHEN the user saves and later reloads the draft
- THEN the same entries and incomplete status are returned without submission

#### Scenario: Reject an invalid score

- GIVEN an observation has severity -1, 4, fractional, or non-numeric
- WHEN the observation is saved
- THEN the API rejects that entry and does not silently coerce it

### Requirement: Complete submission and correction versions

Submission MUST require a complete matrix for every configured plant and all eight organisms, confirm the submitted identity/date and version, and freeze that version. A correction MUST require a reason and complete replacement entries, create a linked next submitted version, and MUST NOT edit prior rows; stale base versions MUST be rejected.

#### Scenario: Submit and correct a review

- GIVEN a complete current draft
- WHEN the user confirms submission and later submits a correction with its reason
- THEN the system returns confirmation, preserves the prior version, and exposes the linked corrected version

#### Scenario: Block incomplete or stale submission

- GIVEN a draft is incomplete or its version is stale
- WHEN the user submits it
- THEN the API returns a testable error, leaves it editable, and creates no submitted version

## Non-goals

Legacy import, catalog administration, offline sync, photos, alerts/treatments, maps, saved filters, multi-tenancy, and historical reconciliation are excluded.
