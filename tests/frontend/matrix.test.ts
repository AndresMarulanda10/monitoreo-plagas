import { describe, expect, it } from 'vitest';
import { asEntries, calculateProgress } from '../../src/components/MonitoringForm';
import { getConfigurationOrThrow } from '../../api/src/domain/catalog';

describe('frontend matrix adapter', () => {
  it('keeps an explicit zero and excludes cells that are not yet reviewed', () => {
    expect(asEntries({ 'plant-1::mildeo': 0, 'plant-1::botrytis': undefined, 'plant-2::mildeo': 3 })).toEqual([
      { plantId: 'plant-1', organismId: 'mildeo', severity: 0 },
      { plantId: 'plant-2', organismId: 'mildeo', severity: 3 },
    ]);
  });

  it('reports overall and per-bed progress using complete plants', () => {
    const configuration = getConfigurationOrThrow('lot-g-blueberry');
    const values = Object.fromEntries(configuration.beds[0].plantIds.flatMap((plantId) => [
      [`${plantId}::cladosporium`, 0],
      [`${plantId}::mildeo`, 1],
      [`${plantId}::botrytis`, 2],
    ])) as Record<string, 0 | 1 | 2 | 3>;
    const progress = calculateProgress(configuration, ['cladosporium', 'mildeo', 'botrytis'].map((id) => ({ id, name: id })), values);

    expect(progress).toMatchObject({ expectedBeds: 2, expectedPlants: 8, inspectedPlants: 4, expectedOrganisms: 3, expectedCoordinates: 24, actualCoordinates: 12, complete: false });
    expect(progress.beds[0]).toMatchObject({ bedNumber: 1, inspectedPlants: 4, actualCoordinates: 12, complete: true });
    expect(progress.beds[1]).toMatchObject({ bedNumber: 2, inspectedPlants: 0, actualCoordinates: 0, complete: false });
  });
});
