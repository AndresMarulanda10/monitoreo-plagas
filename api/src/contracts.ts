export const SEVERITIES = [0, 1, 2, 3] as const;
export type Severity = (typeof SEVERITIES)[number];

export const WEEKLY_REVIEW_SLOTS = [1, 2] as const;
export type ReviewSlot = (typeof WEEKLY_REVIEW_SLOTS)[number];

export const REVIEW_AREAS = ['microbiology', 'entomology'] as const;
export type ReviewArea = (typeof REVIEW_AREAS)[number];
export type StoredReviewArea = ReviewArea | 'legacy';

export const METRICS_FORMULA_VERSION = 'metrics.v1' as const;
export type MetricGrain = 'review' | 'bed' | 'crop' | 'configuration';

export type Bed = {
  id: string;
  number: number;
  plantIds: readonly string[];
};

export type MonitoringConfiguration = {
  id: string;
  lotName: string;
  cropName: string;
  bedCount: number;
  plantsPerBed: number;
  beds: readonly Bed[];
};

export type Organism = {
  id: string;
  name: string;
};

export type ObservationEntry = {
  plantId: string;
  organismId: string;
  severity: Severity;
};

export type ReviewIdentity = {
  reviewId: string;
  area: StoredReviewArea;
  configurationId: string;
  reviewWeek: string;
  reviewDate: string;
  observerId: string;
  slot: ReviewSlot;
};

export type ReviewStatus = 'draft' | 'submitted';

export type ReviewVersion = {
  reviewId: string;
  version: number;
  status: ReviewStatus;
  submittedAt?: string;
  correctionOfVersion?: number;
  correctionReason?: string;
  entries: readonly ObservationEntry[];
};

export type MetricProvenance = {
  grain: MetricGrain;
  formulaVersion: typeof METRICS_FORMULA_VERSION;
  sourceReviewId: string;
  sourceVersion: number;
  calculatedAt: string;
};

export type OrganismMetric = MetricProvenance & {
  area: StoredReviewArea;
  organismId: string;
  incidenceNumerator: number;
  incidenceDenominator: number;
  severityNumerator: number;
  severityDenominator: number;
  incidencePercent: number;
  severityPercent: number;
};

export type DomainErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_REVIEW_IDENTITY'
  | 'INVALID_SEVERITY'
  | 'UNKNOWN_PLANT'
  | 'UNKNOWN_ORGANISM'
  | 'DUPLICATE_OBSERVATION'
  | 'INCOMPLETE_MATRIX'
  | 'DUPLICATE_REVIEW_SLOT'
  | 'INVALID_CORRECTION';

export class DomainValidationError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: DomainErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'DomainValidationError';
    this.code = code;
    this.details = details;
  }
}
