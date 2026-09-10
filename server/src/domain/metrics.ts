import {
  DomainValidationError,
  METRICS_FORMULA_VERSION,
  type MonitoringConfiguration,
  type ObservationEntry,
  type OrganismMetric,
  type Severity,
  type MetricGrain,
  type StoredReviewArea,
} from '../contracts.js';
import { getOrganism, getOrganismsForArea, getRequiredCoordinates, getRequiredPlantIds } from './catalog.js';

export type CompletenessResult = {
  complete: boolean;
  expected: number;
  actual: number;
  missing: readonly { plantId: string; organismId: string }[];
};

function isSeverity(value: unknown): value is Severity {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}

function observationKey(plantId: string, organismId: string): string {
  return `${plantId}::${organismId}`;
}

export function validateObservationEntries(
  configuration: MonitoringConfiguration,
  area: StoredReviewArea,
  entries: readonly ObservationEntry[],
): readonly ObservationEntry[] {
  const plantIds = new Set(getRequiredPlantIds(configuration));
  const organisms = getOrganismsForArea(area);
  const organismIds = new Set(organisms.map((organism) => organism.id));
  const seen = new Set<string>();

  for (const entry of entries as readonly unknown[]) {
    if (!entry || typeof entry !== 'object') {
      throw new DomainValidationError('INVALID_SEVERITY', 'Observation entries must be objects.');
    }
    const candidate = entry as Partial<ObservationEntry>;
    if (!plantIds.has(candidate.plantId ?? '')) {
      throw new DomainValidationError('UNKNOWN_PLANT', 'Observation references an unknown plant.', { plantId: candidate.plantId });
    }
    if (!organismIds.has(candidate.organismId ?? '') || !getOrganism(candidate.organismId ?? '')) {
      throw new DomainValidationError('UNKNOWN_ORGANISM', 'Observation references an unknown organism.', { organismId: candidate.organismId });
    }
    if (!isSeverity(candidate.severity)) {
      throw new DomainValidationError('INVALID_SEVERITY', 'Severity must be an integer from 0 through 3.', { severity: candidate.severity });
    }
    const key = observationKey(candidate.plantId!, candidate.organismId!);
    if (seen.has(key)) {
      throw new DomainValidationError('DUPLICATE_OBSERVATION', 'An observation coordinate may appear only once.', {
        plantId: candidate.plantId,
        organismId: candidate.organismId,
      });
    }
    seen.add(key);
  }
  return entries;
}

export function assessCompleteness(
  configuration: MonitoringConfiguration,
  area: StoredReviewArea,
  entries: readonly ObservationEntry[],
): CompletenessResult {
  validateObservationEntries(configuration, area, entries);
  const present = new Set(entries.map((entry) => observationKey(entry.plantId, entry.organismId)));
  const required = getRequiredCoordinates(configuration, area);
  const missing = required.filter(
    ({ plantId, organismId }) => !present.has(observationKey(plantId, organismId)),
  );
  return {
    complete: missing.length === 0,
    expected: required.length,
    actual: present.size,
    missing,
  };
}

export const checkCompleteness = assessCompleteness;

export function assertCompleteMatrix(
  configuration: MonitoringConfiguration,
  area: StoredReviewArea,
  entries: readonly ObservationEntry[],
): void {
  const result = assessCompleteness(configuration, area, entries);
  if (!result.complete) {
    throw new DomainValidationError('INCOMPLETE_MATRIX', 'Every plant and organism entry is required.', {
      expected: result.expected,
      actual: result.actual,
      missing: result.missing,
    });
  }
}

export function isCompleteMatrix(configuration: MonitoringConfiguration, area: StoredReviewArea, entries: readonly ObservationEntry[]): boolean {
  return assessCompleteness(configuration, area, entries).complete;
}

export function roundPercentage(value: number): number {
  return Math.round(value);
}

export type CalculateMetricsInput = {
  configuration: MonitoringConfiguration;
  area: StoredReviewArea;
  reviewId: string;
  version: number;
  entries: readonly ObservationEntry[];
  plantIds?: readonly string[];
  grain?: MetricGrain;
  calculatedAt?: string;
};

export function calculateMetrics(input: CalculateMetricsInput): readonly OrganismMetric[] {
  assertCompleteMatrix(input.configuration, input.area, input.entries);
  const inspectedPlantIds = input.plantIds ?? getRequiredPlantIds(input.configuration);
  const configuredPlantIds = new Set(getRequiredPlantIds(input.configuration));
  if (inspectedPlantIds.some((plantId) => !configuredPlantIds.has(plantId))) {
    throw new DomainValidationError('UNKNOWN_PLANT', 'Metric scope references an unknown plant.');
  }
  if (new Set(inspectedPlantIds).size !== inspectedPlantIds.length) {
    throw new DomainValidationError('INVALID_CONFIGURATION', 'Metric scope cannot repeat a plant.');
  }
  const inspected = inspectedPlantIds.length;
  if (inspected === 0) {
    throw new DomainValidationError('INVALID_CONFIGURATION', 'Metric scope must include at least one plant.');
  }
  const scope = new Set(inspectedPlantIds);
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  return getOrganismsForArea(input.area).map((organism) => {
    const scores = input.entries
      .filter((entry) => entry.organismId === organism.id && scope.has(entry.plantId))
      .map((entry) => entry.severity);
    const severityNumerator = scores.reduce<number>((sum, score) => sum + score, 0);
    const incidenceNumerator = scores.filter((score) => score > 0).length;
    const severityDenominator = inspected * 3;
    return {
      organismId: organism.id,
      area: input.area,
      grain: input.grain ?? 'review',
      formulaVersion: METRICS_FORMULA_VERSION,
      sourceReviewId: input.reviewId,
      sourceVersion: input.version,
      calculatedAt,
      incidenceNumerator,
      incidenceDenominator: inspected,
      severityNumerator,
      severityDenominator,
      incidencePercent: (incidenceNumerator / inspected) * 100,
      severityPercent: (severityNumerator / severityDenominator) * 100,
    };
  });
}

export function calculateMetric(input: CalculateMetricsInput, organismId: string): OrganismMetric {
  if (!getOrganismsForArea(input.area).some((organism) => organism.id === organismId) || !getOrganism(organismId)) {
    throw new DomainValidationError('UNKNOWN_ORGANISM', 'Cannot calculate a metric for an unknown organism.', { organismId });
  }
  return calculateMetrics(input).find((metric) => metric.organismId === organismId)!;
}
