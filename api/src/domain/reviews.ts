import {
  DomainValidationError,
  WEEKLY_REVIEW_SLOTS,
  type ObservationEntry,
  type ReviewIdentity,
  type ReviewSlot,
  type ReviewStatus,
  type ReviewVersion,
} from '../contracts';

export type ReviewWithIdentity = ReviewIdentity & { status?: ReviewStatus };

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function createReviewIdentity(input: ReviewIdentity): ReviewIdentity {
  if (!input.reviewId || !input.configurationId || !input.observerId || !validDate(input.reviewDate)) {
    throw new DomainValidationError('INVALID_REVIEW_IDENTITY', 'Review identity fields are required and dates must be ISO dates.');
  }
  if (!validDate(input.reviewWeek)) {
    throw new DomainValidationError('INVALID_REVIEW_IDENTITY', 'reviewWeek must be an ISO week-start date.');
  }
  if (!WEEKLY_REVIEW_SLOTS.includes(input.slot as ReviewSlot)) {
    throw new DomainValidationError('INVALID_REVIEW_IDENTITY', 'Review slot must be 1 or 2.', { slot: input.slot });
  }
  return { ...input };
}

export function isSameWeeklySlot(left: ReviewIdentity, right: ReviewIdentity): boolean {
  return left.configurationId === right.configurationId && left.reviewWeek === right.reviewWeek && left.slot === right.slot;
}

export function assertWeeklySlotAvailable(existingReviews: readonly ReviewWithIdentity[], candidate: ReviewIdentity): void {
  createReviewIdentity(candidate);
  const duplicate = existingReviews.some(
    (review) => (review.status === undefined || review.status === 'submitted') && isSameWeeklySlot(review, candidate),
  );
  if (duplicate) {
    throw new DomainValidationError('DUPLICATE_REVIEW_SLOT', 'A submitted review already occupies this configuration weekly slot.', {
      configurationId: candidate.configurationId,
      reviewWeek: candidate.reviewWeek,
      slot: candidate.slot,
    });
  }
}

export function canUseWeeklySlot(existingReviews: readonly ReviewWithIdentity[], candidate: ReviewIdentity): boolean {
  try {
    assertWeeklySlotAvailable(existingReviews, candidate);
    return true;
  } catch (error) {
    if (error instanceof DomainValidationError && error.code === 'DUPLICATE_REVIEW_SLOT') return false;
    throw error;
  }
}

export function createCorrectionVersion(
  base: ReviewVersion,
  reason: string,
  entries: readonly ObservationEntry[],
  submittedAt = new Date().toISOString(),
): ReviewVersion {
  if (base.status !== 'submitted' || !reason.trim()) {
    throw new DomainValidationError('INVALID_CORRECTION', 'Corrections require a submitted base and a reason.');
  }
  return {
    reviewId: base.reviewId,
    version: base.version + 1,
    status: 'submitted',
    submittedAt,
    correctionOfVersion: base.version,
    correctionReason: reason.trim(),
    entries: entries.map((entry) => ({ ...entry })),
  };
}
