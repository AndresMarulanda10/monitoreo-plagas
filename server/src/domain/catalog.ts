import { DomainValidationError, type Bed, type MonitoringConfiguration, type Organism, type StoredReviewArea } from '../contracts.js';

const ORGANISM_DEFINITIONS = [
  ['cladosporium', 'Cladosporium'],
  ['mildeo', 'Mildeo'],
  ['botrytis', 'Botrytis'],
  ['aphids', 'Aphids'],
  ['thrips', 'Thrips'],
  ['mites', 'Mites'],
  ['tuta', 'Tuta'],
  ['plutella', 'Plutella'],
] as const;

export const ORGANISMS: readonly Organism[] = Object.freeze(
  ORGANISM_DEFINITIONS.map(([id, name]) => Object.freeze({ id, name })),
);

const AREA_ORGANISM_IDS: Record<StoredReviewArea, readonly string[]> = Object.freeze({
  microbiology: ['cladosporium', 'mildeo', 'botrytis'],
  entomology: ['aphids', 'thrips', 'mites', 'tuta', 'plutella'],
  legacy: ORGANISMS.map((organism) => organism.id),
});

const CONFIGURATION_DEFINITIONS = [
  ['hortisimulador-tomato', 'Hortisimulador', 'Tomato', 6, 4],
  ['lot-g-strawberry', 'Lot G', 'Strawberry', 15, 5],
  ['lot-g-blueberry', 'Lot G', 'Blueberry', 2, 4],
  ['lot-f-cucumber', 'Lot F', 'Cucumber', 2, 15],
  ['lot-f-tomato', 'Lot F', 'Tomato', 5, 15],
] as const;

function buildBeds(configurationId: string, bedCount: number, plantsPerBed: number): readonly Bed[] {
  return Object.freeze(
    Array.from({ length: bedCount }, (_, bedIndex) => {
      const number = bedIndex + 1;
      const id = `${configurationId}-bed-${number}`;
      const plantIds = Object.freeze(
        Array.from({ length: plantsPerBed }, (_, plantIndex) => `${id}-plant-${plantIndex + 1}`),
      );
      return Object.freeze({ id, number, plantIds });
    }),
  );
}

export const CONFIGURATIONS: readonly MonitoringConfiguration[] = Object.freeze(
  CONFIGURATION_DEFINITIONS.map(([id, lotName, cropName, bedCount, plantsPerBed]) =>
    Object.freeze({
      id,
      lotName,
      cropName,
      bedCount,
      plantsPerBed,
      beds: buildBeds(id, bedCount, plantsPerBed),
    }),
  ),
);

export const CATALOG = Object.freeze({ configurations: CONFIGURATIONS, organisms: ORGANISMS });

export function findConfiguration(configurationId: string): MonitoringConfiguration | undefined {
  return CONFIGURATIONS.find((configuration) => configuration.id === configurationId);
}

export function getConfigurationOrThrow(configurationId: string): MonitoringConfiguration {
  const configuration = findConfiguration(configurationId);
  if (!configuration) {
    throw new DomainValidationError('INVALID_CONFIGURATION', 'Unknown monitoring configuration.', { configurationId });
  }
  return configuration;
}

export function getOrganism(organismId: string): Organism | undefined {
  return ORGANISMS.find((organism) => organism.id === organismId);
}

export function getOrganismsForArea(area: StoredReviewArea): readonly Organism[] {
  const allowed = new Set(AREA_ORGANISM_IDS[area]);
  return ORGANISMS.filter((organism) => allowed.has(organism.id));
}

export function getRequiredPlantIds(configuration: MonitoringConfiguration): readonly string[] {
  return configuration.beds.flatMap((bed) => bed.plantIds);
}

export function getRequiredCoordinates(
  configuration: MonitoringConfiguration,
  area: StoredReviewArea,
): readonly { plantId: string; organismId: string }[] {
  return getRequiredPlantIds(configuration).flatMap((plantId) =>
    getOrganismsForArea(area).map((organism) => ({ plantId, organismId: organism.id })),
  );
}
