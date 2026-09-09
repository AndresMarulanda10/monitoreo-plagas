import { describe, expect, it } from 'vitest';
import { DomainValidationError, WEEKLY_REVIEW_SLOTS, type ReviewIdentity } from '../../api/src/contracts';
import { assertWeeklySlotAvailable, createReviewIdentity, isSameWeeklySlot } from '../../api/src/domain/reviews';

const firstSlot: ReviewIdentity = {
  reviewId: 'review-1',
  area: 'microbiology',
  configurationId: 'lot-g-strawberry',
  reviewWeek: '2026-08-31',
  reviewDate: '2026-09-01',
  observerId: 'observer-1',
  slot: 1,
};

describe('weekly review identity domain', () => {
  it('exposes two independent weekly slots', () => {
    expect(WEEKLY_REVIEW_SLOTS).toEqual([1, 2]);
    const secondSlot = createReviewIdentity({ ...firstSlot, reviewId: 'review-2', slot: 2 });

    expect(isSameWeeklySlot(firstSlot, secondSlot)).toBe(false);
    expect(() => assertWeeklySlotAvailable([{ ...firstSlot, status: 'submitted' }], secondSlot)).not.toThrow();
  });

  it('rejects a duplicate submitted configuration/week/slot', () => {
    expect(() =>
      assertWeeklySlotAvailable([{ ...firstSlot, status: 'submitted' }], { ...firstSlot, reviewId: 'review-2' }),
    ).toThrow(DomainValidationError);
  });

  it('rejects a duplicate draft before it can coexist in the same slot', () => {
    expect(() =>
      assertWeeklySlotAvailable([{ ...firstSlot, status: 'draft' }], { ...firstSlot, reviewId: 'review-2' }),
    ).toThrow('Abre el borrador existente');
  });

  it('allows the same weekly slot in another area but rejects it within the same area', () => {
    const entomologySlot = { ...firstSlot, area: 'entomology' as const, reviewId: 'review-2' };
    expect(isSameWeeklySlot(firstSlot, entomologySlot)).toBe(false);
    expect(() => assertWeeklySlotAvailable([{ ...firstSlot, status: 'submitted' }], entomologySlot)).not.toThrow();
    expect(() => assertWeeklySlotAvailable([{ ...firstSlot, status: 'submitted' }], { ...firstSlot, reviewId: 'review-3' })).toThrow('Ya existe');
  });
});
