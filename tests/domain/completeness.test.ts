import { describe, expect, it } from 'vitest';
import { getConfigurationOrThrow, getRequiredCoordinates } from '../../server/src/domain/catalog';
import { assessCompleteness, calculateMetrics, validateObservationEntries } from '../../server/src/domain/metrics';
import { DomainValidationError, type ObservationEntry } from '../../server/src/contracts';

describe('matrix completeness domain', () => {
  const configuration = getConfigurationOrThrow('lot-g-blueberry');
  const complete = getRequiredCoordinates(configuration, 'microbiology').map(({ plantId, organismId }) => ({
    plantId,
    organismId,
    severity: 0 as const,
  }));

  it('reports a missing plant-organism coordinate without shrinking the denominator', () => {
    const partial = complete.slice(0, -1);
    const result = assessCompleteness(configuration, 'microbiology', partial);

    expect(result.complete).toBe(false);
    expect(result.expected).toBe(24);
    expect(result.actual).toBe(23);
    expect(result.missing).toHaveLength(1);
    expect(() => calculateMetrics({ configuration, area: 'microbiology', reviewId: 'review-incomplete', version: 1, entries: partial })).toThrow(
      DomainValidationError,
    );
  });

  it('rejects fractional, out-of-range, and non-numeric severities', () => {
    for (const severity of [1.5, 4, -1, '2']) {
      const entries = complete.map((entry, index) => (index === 0 ? { ...entry, severity } : entry)) as unknown as ObservationEntry[];
      expect(() => validateObservationEntries(configuration, 'microbiology', entries)).toThrow(/Severity must be an integer/);
    }
  });

  it('rejects duplicate coordinates and never silently overwrites them', () => {
    expect(() => validateObservationEntries(configuration, 'microbiology', [complete[0], complete[0]])).toThrow(/only once/);
  });

  it('requires only the organisms assigned to the selected area', () => {
    const entomology = getRequiredCoordinates(configuration, 'entomology');
    expect(entomology).toHaveLength(40);
    expect(assessCompleteness(configuration, 'entomology', entomology.map(({ plantId, organismId }) => ({ plantId, organismId, severity: 0 as const })))).toMatchObject({ complete: true, expected: 40 });
    expect(() => validateObservationEntries(configuration, 'microbiology', [{ plantId: configuration.beds[0].plantIds[0], organismId: 'aphids', severity: 1 }])).toThrow(/unknown organism/i);
  });
});
