import { createClient } from '@supabase/supabase-js';
import { CATALOG, getConfigurationOrThrow } from './domain/catalog.js';
import { assessCompleteness } from './domain/metrics.js';
import { assertWeeklySlotAvailable, createCorrectionVersion } from './domain/reviews.js';
import type {
  MetricProvenance,
  ObservationEntry,
  ReviewIdentity,
  ReviewVersion,
  OrganismMetric,
  ReviewArea,
  StoredReviewArea,
} from './contracts.js';

export type StoredVersion = ReviewVersion & { metrics: readonly OrganismMetric[] };
export type ReviewRead = ReviewIdentity & {
  status: 'draft' | 'submitted';
  currentVersion: number;
  version: StoredVersion;
  completion: { complete: boolean; expected: number; actual: number; missing: readonly { plantId: string; organismId: string }[] };
  versions: readonly StoredVersion[];
};

export type ReviewDraftSummary = Omit<Pick<ReviewRead, 'reviewId' | 'area' | 'configurationId' | 'reviewWeek' | 'reviewDate' | 'slot' | 'status' | 'currentVersion' | 'completion'>, 'status'> & { status: 'draft' };

export class StoreError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'STALE_VERSION' | 'IMMUTABLE' | 'DUPLICATE_REVIEW_SLOT' | 'DATABASE_NOT_READY', message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'StoreError';
  }
}

export interface ReviewStore {
  getCatalog(): Promise<typeof CATALOG>;
  ready(): Promise<boolean>;
  createDraft(identity: ReviewIdentity): Promise<ReviewRead>;
  getReview(reviewId: string, userId: string): Promise<ReviewRead>;
  saveDraft(reviewId: string, userId: string, version: number, entries: readonly ObservationEntry[]): Promise<ReviewRead>;
  submitReview(reviewId: string, userId: string, version: number, metrics: readonly OrganismMetric[]): Promise<ReviewRead>;
  createCorrection(
    reviewId: string,
    userId: string,
    baseVersion: number,
    reason: string,
    entries: readonly ObservationEntry[],
    metrics: readonly OrganismMetric[],
  ): Promise<ReviewRead>;
  listDrafts(userId: string, area?: ReviewArea): Promise<readonly ReviewDraftSummary[]>;
  listSubmitted(userId: string): Promise<readonly ReviewRead[]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function withMetrics(version: ReviewVersion, metrics: readonly OrganismMetric[] = []): StoredVersion {
  return { ...clone(version), metrics: clone(metrics) };
}

function reviewRead(identity: ReviewIdentity, versions: readonly StoredVersion[], currentVersion: number): ReviewRead {
  const version = versions.find((item) => item.version === currentVersion);
  if (!version) throw new StoreError('NOT_FOUND', 'Review version not found.');
  const configuration = getConfigurationOrThrow(identity.configurationId);
  const completion = assessCompleteness(configuration, identity.area, version.entries);
  return { ...clone(identity), status: version.status, currentVersion, version: clone(version), versions: clone(versions), completion };
}

function draftSummary(review: ReviewRead): ReviewDraftSummary {
  return {
    reviewId: review.reviewId,
    area: review.area,
    configurationId: review.configurationId,
    reviewWeek: review.reviewWeek,
    reviewDate: review.reviewDate,
    slot: review.slot,
    status: 'draft',
    currentVersion: review.currentVersion,
    completion: review.completion,
  };
}

type MemoryRecord = { identity: ReviewIdentity; currentVersion: number; versions: StoredVersion[] };

export class MemoryStore implements ReviewStore {
  private readonly reviews = new Map<string, MemoryRecord>();

  async getCatalog(): Promise<typeof CATALOG> {
    return CATALOG;
  }

  async ready(): Promise<boolean> {
    return true;
  }

  async createDraft(identity: ReviewIdentity): Promise<ReviewRead> {
    const existing = [...this.reviews.values()].map(({ identity: item, versions }) => ({ ...item, status: versions[versions.length - 1]?.status }));
    assertWeeklySlotAvailable(existing, identity);
    const record: MemoryRecord = {
      identity: clone(identity),
      currentVersion: 1,
      versions: [withMetrics({ reviewId: identity.reviewId, version: 1, status: 'draft', entries: [] })],
    };
    this.reviews.set(identity.reviewId, record);
    return reviewRead(record.identity, record.versions, record.currentVersion);
  }

  private owned(reviewId: string, userId: string): MemoryRecord {
    const record = this.reviews.get(reviewId);
    if (!record) throw new StoreError('NOT_FOUND', 'Review not found.');
    if (record.identity.observerId !== userId) throw new StoreError('FORBIDDEN', 'Review is not available to this user.');
    return record;
  }

  async getReview(reviewId: string, userId: string): Promise<ReviewRead> {
    const record = this.owned(reviewId, userId);
    return reviewRead(record.identity, record.versions, record.currentVersion);
  }

  async saveDraft(reviewId: string, userId: string, version: number, entries: readonly ObservationEntry[]): Promise<ReviewRead> {
    const record = this.owned(reviewId, userId);
    const current = record.versions.find((item) => item.version === version);
    if (!current) throw new StoreError('STALE_VERSION', 'Draft version is stale or does not exist.');
    if (current.status !== 'draft') throw new StoreError('IMMUTABLE', 'Submitted review versions cannot be edited.');
    current.entries = clone(entries);
    return reviewRead(record.identity, record.versions, record.currentVersion);
  }

  async submitReview(reviewId: string, userId: string, version: number, metrics: readonly OrganismMetric[]): Promise<ReviewRead> {
    const record = this.owned(reviewId, userId);
    if (record.currentVersion !== version) throw new StoreError('STALE_VERSION', 'Review version is stale. Reload before submitting.');
    const current = record.versions.find((item) => item.version === version)!;
    if (current.status !== 'draft') throw new StoreError('IMMUTABLE', 'Review is already submitted.');
    const existing = [...this.reviews.values()]
      .filter((item) => item.identity.reviewId !== reviewId)
      .map(({ identity: item, versions }) => ({ ...item, status: versions[versions.length - 1]?.status }));
    assertWeeklySlotAvailable(existing, record.identity);
    current.status = 'submitted';
    current.submittedAt = new Date().toISOString();
    current.metrics = clone(metrics);
    return reviewRead(record.identity, record.versions, record.currentVersion);
  }

  async createCorrection(
    reviewId: string,
    userId: string,
    baseVersion: number,
    reason: string,
    entries: readonly ObservationEntry[],
    metrics: readonly OrganismMetric[],
  ): Promise<ReviewRead> {
    const record = this.owned(reviewId, userId);
    if (record.currentVersion !== baseVersion) throw new StoreError('STALE_VERSION', 'Correction base version is stale. Reload before correcting.');
    const base = record.versions.find((item) => item.version === baseVersion)!;
    const next = createCorrectionVersion(base, reason, entries);
    record.currentVersion = next.version;
    record.versions.push(withMetrics(next, metrics));
    return reviewRead(record.identity, record.versions, record.currentVersion);
  }

  async listSubmitted(userId: string): Promise<readonly ReviewRead[]> {
    return [...this.reviews.values()]
      .filter((record) => record.identity.observerId === userId && record.versions.find((item) => item.version === record.currentVersion)?.status === 'submitted')
      .map((record) => reviewRead(record.identity, record.versions, record.currentVersion));
  }

  async listDrafts(userId: string, area?: ReviewArea): Promise<readonly ReviewDraftSummary[]> {
    return [...this.reviews.values()]
      .filter((record) => record.identity.observerId === userId && record.identity.area !== 'legacy' && (!area || record.identity.area === area) && record.versions.find((item) => item.version === record.currentVersion)?.status === 'draft')
      .map((record) => draftSummary(reviewRead(record.identity, record.versions, record.currentVersion)))
      .sort((left, right) => right.reviewDate.localeCompare(left.reviewDate) || right.reviewWeek.localeCompare(left.reviewWeek) || right.slot - left.slot);
  }
}

type SupabaseRow = Record<string, unknown>;

export class SupabaseStore implements ReviewStore {
  // Supabase's generated schema is intentionally kept in supabase/types.ts; the adapter
  // narrows rows at the boundary because RPCs are additive to those generated types.
  private readonly client: any;

  constructor(url = process.env.SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) {
    if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required for SupabaseStore.');
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  private async query<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await promise;
    if (error) throw new StoreError('DATABASE_NOT_READY', error.message);
    return data as T;
  }

  async ready(): Promise<boolean> {
    try {
      await this.query(this.client.from('monitoring_configurations').select('id').limit(1));
      return true;
    } catch {
      return false;
    }
  }

  async getCatalog(): Promise<typeof CATALOG> {
    const [configurations, beds, plants, organisms] = await Promise.all([
      this.query(this.client.from('monitoring_configurations').select('*').order('id')),
      this.query(this.client.from('beds').select('*').order('id')),
      this.query(this.client.from('plants').select('*').order('id')),
      this.query(this.client.from('organisms').select('*').order('id')),
    ]);
    return {
      configurations: (configurations as SupabaseRow[]).map((configuration) => ({
        id: String(configuration.id),
        lotName: String(configuration.lot_name),
        cropName: String(configuration.crop_name),
        bedCount: Number(configuration.bed_count),
        plantsPerBed: Number(configuration.plants_per_bed),
        beds: (beds as SupabaseRow[])
          .filter((bed) => bed.configuration_id === configuration.id)
          .map((bed) => ({
            id: String(bed.id),
            number: Number(bed.bed_number),
            plantIds: (plants as SupabaseRow[]).filter((plant) => plant.bed_id === bed.id).map((plant) => String(plant.id)),
          })),
      })),
      organisms: (organisms as SupabaseRow[]).map((organism) => ({ id: String(organism.id), name: String(organism.name) })),
    } as typeof CATALOG;
  }

  private async read(reviewId: string, userId: string): Promise<ReviewRead> {
    const review = await this.query<SupabaseRow>(this.client.from('reviews').select('*').eq('id', reviewId).eq('observer_id', userId).single());
    if (!review) throw new StoreError('NOT_FOUND', 'Review not found.');
    const area = (review.area === 'legacy' ? 'legacy' : String(review.area)) as StoredReviewArea;
    const versions = await this.query<SupabaseRow[]>(this.client.from('review_versions').select('*').eq('review_id', reviewId).order('version'));
    const stored = await Promise.all((versions as SupabaseRow[]).map(async (version) => {
      const versionNumber = Number(version.version);
      const [observations, metrics] = await Promise.all([
        this.query<SupabaseRow[]>(this.client.from('observations').select('*').eq('review_id', reviewId).eq('version', versionNumber)),
        this.query<SupabaseRow[]>(this.client.from('metrics').select('*').eq('review_id', reviewId).eq('version', versionNumber)),
      ]);
      return withMetrics({
        reviewId,
        version: versionNumber,
        status: version.status as 'draft' | 'submitted',
        submittedAt: version.submitted_at ? String(version.submitted_at) : undefined,
        correctionOfVersion: version.correction_of_version ? Number(version.correction_of_version) : undefined,
        correctionReason: version.correction_reason ? String(version.correction_reason) : undefined,
        entries: (observations as SupabaseRow[]).map((entry) => ({ plantId: String(entry.plant_id), organismId: String(entry.organism_id), severity: Number(entry.severity) as 0 | 1 | 2 | 3 })),
      }, (metrics as SupabaseRow[]).map((metric) => metricFromRow(metric, area)));
    }));
    return reviewRead({
      reviewId,
      area,
      configurationId: String(review.configuration_id),
      reviewWeek: String(review.review_week),
      reviewDate: String(review.review_date),
      observerId: String(review.observer_id),
      slot: Number(review.review_slot) as 1 | 2,
    }, stored, Number(review.current_version));
  }

  async createDraft(identity: ReviewIdentity): Promise<ReviewRead> {
    const existing = await this.query<SupabaseRow[]>(this.client.from('reviews').select('id, status').eq('area', identity.area).eq('configuration_id', identity.configurationId).eq('review_week', identity.reviewWeek).eq('review_slot', identity.slot).limit(1));
    if (existing.length > 0) {
      const existingStatus = String(existing[0].status) === 'draft' ? 'draft' : 'submitted';
      const message = existingStatus === 'draft'
        ? 'Ya existe un borrador para esta configuración, semana y ronda. Abre el borrador existente en lugar de crear otro.'
        : 'Ya existe una revisión enviada para esta configuración, semana y ronda. Selecciona otra ronda o semana.';
      throw new StoreError('DUPLICATE_REVIEW_SLOT', message, {
        existingReviewId: String(existing[0].id),
        existingStatus,
      });
    }
    try {
      await this.query(this.client.from('reviews').insert({
        id: identity.reviewId, area: identity.area, configuration_id: identity.configurationId, review_week: identity.reviewWeek,
        review_date: identity.reviewDate, observer_id: identity.observerId, review_slot: identity.slot,
      }));
      await this.query(this.client.from('review_versions').insert({ review_id: identity.reviewId, version: 1, status: 'draft' }));
    } catch (error) {
      if (error instanceof StoreError && /reviews_one_(submitted_)?slot|reviews_one_area_slot|duplicate key/i.test(error.message)) {
        throw new StoreError('DUPLICATE_REVIEW_SLOT', 'Ya existe una revisión para esta configuración, semana y ronda. Revisa la lista de borradores y abre el existente si aparece.');
      }
      throw error;
    }
    return this.read(identity.reviewId, identity.observerId);
  }

  async getReview(reviewId: string, userId: string): Promise<ReviewRead> { return this.read(reviewId, userId); }

  async saveDraft(reviewId: string, userId: string, version: number, entries: readonly ObservationEntry[]): Promise<ReviewRead> {
    const current = await this.query<SupabaseRow>(this.client.from('reviews').select('current_version').eq('id', reviewId).eq('observer_id', userId).single());
    if (Number(current.current_version) !== version) throw new StoreError('STALE_VERSION', 'Draft version is stale.');
    await this.query(this.client.from('observations').delete().eq('review_id', reviewId).eq('version', version));
    if (entries.length) await this.query(this.client.from('observations').insert(entries.map((entry) => ({ review_id: reviewId, version, plant_id: entry.plantId, organism_id: entry.organismId, severity: entry.severity }))));
    return this.read(reviewId, userId);
  }

  async submitReview(reviewId: string, userId: string, version: number, metrics: readonly OrganismMetric[]): Promise<ReviewRead> {
    const result = await this.client.rpc('submit_review_version' as never, {
      p_review_id: reviewId, p_user_id: userId, p_version: version,
      p_metrics: metrics.map(metricToRow),
    } as never);
    if (result.error) throw new StoreError(result.error.message.includes('stale') ? 'STALE_VERSION' : result.error.message.includes('reviews_one_submitted_slot') || result.error.message.includes('reviews_one_slot') || result.error.message.includes('reviews_one_area_slot') ? 'DUPLICATE_REVIEW_SLOT' : 'DATABASE_NOT_READY', result.error.message);
    return this.read(reviewId, userId);
  }

  async createCorrection(reviewId: string, userId: string, baseVersion: number, reason: string, entries: readonly ObservationEntry[], metrics: readonly OrganismMetric[]): Promise<ReviewRead> {
    const result = await this.client.rpc('create_review_correction' as never, {
      p_review_id: reviewId, p_user_id: userId, p_base_version: baseVersion, p_reason: reason,
      p_entries: entries, p_metrics: metrics.map(metricToRow),
    } as never);
    if (result.error) throw new StoreError(result.error.message.includes('stale') ? 'STALE_VERSION' : result.error.message.includes('reviews_one_submitted_slot') || result.error.message.includes('reviews_one_slot') || result.error.message.includes('reviews_one_area_slot') ? 'DUPLICATE_REVIEW_SLOT' : 'DATABASE_NOT_READY', result.error.message);
    return this.read(reviewId, userId);
  }

  async listSubmitted(userId: string): Promise<readonly ReviewRead[]> {
    const rows = await this.query(this.client.from('reviews').select('id').eq('observer_id', userId).eq('status', 'submitted').order('review_date', { ascending: false }));
    return Promise.all((rows as SupabaseRow[]).map((row) => this.read(String(row.id), userId)));
  }

  async listDrafts(userId: string, area?: ReviewArea): Promise<readonly ReviewDraftSummary[]> {
    let query = this.client.from('reviews').select('id').eq('observer_id', userId).neq('area', 'legacy').eq('status', 'draft').order('review_date', { ascending: false }).order('review_week', { ascending: false }).order('review_slot', { ascending: false });
    if (area) query = query.eq('area', area);
    const rows = await this.query<SupabaseRow[]>(query);
    const reviews = await Promise.all((rows as SupabaseRow[]).map((row) => this.read(String(row.id), userId)));
    return reviews.map(draftSummary);
  }
}

function metricToRow(metric: OrganismMetric): Record<string, unknown> {
  return {
    organism_id: metric.organismId, grain: metric.grain, incidence_numerator: metric.incidenceNumerator,
    incidence_denominator: metric.incidenceDenominator, severity_numerator: metric.severityNumerator,
    severity_denominator: metric.severityDenominator, formula_version: metric.formulaVersion,
    incidence_percent: metric.incidencePercent, severity_percent: metric.severityPercent,
    calculated_at: metric.calculatedAt,
  };
}

function metricFromRow(row: SupabaseRow, area: StoredReviewArea): OrganismMetric {
  const provenance: MetricProvenance = {
    grain: row.grain as MetricProvenance['grain'], formulaVersion: row.formula_version as 'metrics.v1',
    sourceReviewId: String(row.review_id), sourceVersion: Number(row.version), calculatedAt: String(row.calculated_at),
  };
  return {
    ...provenance, organismId: String(row.organism_id), incidenceNumerator: Number(row.incidence_numerator),
    area,
    incidenceDenominator: Number(row.incidence_denominator), severityNumerator: Number(row.severity_numerator),
    severityDenominator: Number(row.severity_denominator), incidencePercent: Number(row.incidence_percent),
    severityPercent: Number(row.severity_percent),
  };
}

export function createStore(): ReviewStore {
  return process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)
    ? new SupabaseStore()
    : new MemoryStore();
}
