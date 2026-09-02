import { describe, expect, it } from 'vitest';
import { CONFIGURATIONS, getConfigurationOrThrow, getRequiredCoordinates, ORGANISMS } from '../../api/src/domain/catalog';
import { calculateMetric, calculateMetrics } from '../../api/src/domain/metrics';
import type { ObservationEntry } from '../../api/src/contracts';

function completeEntries(configurationId: string, scoreFor: (index: number) => 0 | 1 | 2 | 3): ObservationEntry[] {
  const configuration = getConfigurationOrThrow(configurationId);
  return getRequiredCoordinates(configuration).map(({ plantId, organismId }, index) => ({
    plantId,
    organismId,
    severity: scoreFor(index),
  }));
}

describe('metrics domain', () => {
  it('keeps the approved five-configuration and eight-organism catalog baseline', () => {
    expect(CONFIGURATIONS.map(({ id, bedCount, plantsPerBed }) => [id, bedCount, plantsPerBed])).toEqual([
      ['hortisimulador-tomato', 6, 4],
      ['lot-g-strawberry', 15, 5],
      ['lot-g-blueberry', 2, 4],
      ['lot-f-cucumber', 2, 15],
      ['lot-f-tomato', 5, 15],
    ]);
    expect(ORGANISMS.map((organism) => organism.name)).toEqual([
      'Cladosporium',
      'Mildeo',
      'Botrytis',
      'Aphids',
      'Thrips',
      'Mites',
      'Tuta',
      'Plutella',
    ]);
  });

  it('calculates incidence from affected plants and severity over all inspected plants', () => {
    const configuration = getConfigurationOrThrow('lot-g-blueberry');
    const entries = completeEntries(configuration.id, () => 0).map((entry) =>
      entry.organismId === 'cladosporium' && entry.plantId.endsWith('-plant-1')
        ? { ...entry, severity: 1 as const }
        : entry.organismId === 'cladosporium' && entry.plantId.endsWith('-plant-2')
          ? { ...entry, severity: 3 as const }
          : entry,
    );
    const metric = calculateMetric(
      {
        configuration,
        reviewId: 'review-1',
        version: 1,
        entries,
        plantIds: configuration.beds[0].plantIds,
        grain: 'bed',
        calculatedAt: '2026-09-02T00:00:00Z',
      },
      'cladosporium',
    );

    expect(metric.incidenceNumerator).toBe(2);
    expect(metric.incidenceDenominator).toBe(4);
    expect(metric.incidencePercent).toBe(50);
    expect(metric.severityNumerator).toBe(4);
    expect(metric.severityDenominator).toBe(12);
    expect(metric.severityPercent).toBeCloseTo(33.333333);
    expect(metric.formulaVersion).toBe('metrics.v1');
  });

  it('returns zero incidence and severity for unaffected plants', () => {
    const configuration = getConfigurationOrThrow('lot-g-blueberry');
    const metric = calculateMetric(
      {
        configuration,
        reviewId: 'review-2',
        version: 1,
        entries: completeEntries(configuration.id, () => 0),
        plantIds: configuration.beds[0].plantIds,
        grain: 'bed',
      },
      'mildeo',
    );

    expect(metric.incidenceNumerator).toBe(0);
    expect(metric.incidenceDenominator).toBe(4);
    expect(metric.severityNumerator).toBe(0);
    expect(metric.severityDenominator).toBe(12);
    expect(metric.incidencePercent).toBe(0);
    expect(metric.severityPercent).toBe(0);
  });

  it('calculates all eight organism metrics from one complete matrix', () => {
    const configuration = getConfigurationOrThrow('hortisimulador-tomato');
    const metrics = calculateMetrics({
      configuration,
      reviewId: 'review-3',
      version: 2,
      entries: completeEntries(configuration.id, () => 0),
    });

    expect(metrics).toHaveLength(8);
    expect(metrics.every((metric) => metric.sourceVersion === 2 && metric.grain === 'review')).toBe(true);
  });
});
