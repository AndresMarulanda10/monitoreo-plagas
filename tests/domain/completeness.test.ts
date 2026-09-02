import { describe, expect, it } from 'vitest';
import { getConfigurationOrThrow, getRequiredCoordinates } from '../../api/src/domain/catalog';
import { assessCompleteness, calculateMetrics, validateObservationEntries } from '../../api/src/domain/metrics';
import { DomainValidationError, type ObservationEntry } from '../../api/src/contracts';

describe('matrix completeness domain', () => {
  const configuration = getConfigurationOrThrow('lot-g-blueberry');
  const complete = getRequiredCoordinates(configuration).map(({ plantId, organismId }) => ({
    plantId,
    organismId,
    severity: 0 as const,
  }));

  it('reports a missing plant-organism coordinate without shrinking the denominator', () => {
    const partial = complete.slice(0, -1);
    const result = assessCompleteness(configuration, partial);

    expect(result.complete).toBe(false);
    expect(result.expected).toBe(64);
    expect(result.actual).toBe(63);
    expect(result.missing).toHaveLength(1);
    expect(() => calculateMetrics({ configuration, reviewId: 'review-incomplete', version: 1, entries: partial })).toThrow(
      DomainValidationError,
    );
  });

  it('rejects fractional, out-of-range, and non-numeric severities', () => {
    for (const severity of [1.5, 4, -1, '2']) {
      const entries = complete.map((entry, index) => (index === 0 ? { ...entry, severity } : entry)) as unknown as ObservationEntry[];
      expect(() => validateObservationEntries(configuration, entries)).toThrow(/Severity must be an integer/);
    }
  });

  it('rejects duplicate coordinates and never silently overwrites them', () => {
    expect(() => validateObservationEntries(configuration, [complete[0], complete[0]])).toThrow(/only once/);
  });
});
