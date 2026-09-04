import { describe, expect, it } from 'vitest';
import { asEntries } from '../../src/components/MonitoringForm';

describe('frontend matrix adapter', () => {
  it('keeps an explicit zero and excludes cells that are not yet reviewed', () => {
    expect(asEntries({ 'plant-1::mildeo': 0, 'plant-1::botrytis': undefined, 'plant-2::mildeo': 3 })).toEqual([
      { plantId: 'plant-1', organismId: 'mildeo', severity: 0 },
      { plantId: 'plant-2', organismId: 'mildeo', severity: 3 },
    ]);
  });
});
