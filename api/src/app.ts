import { randomUUID } from 'node:crypto';
import { createSupabaseAuthResolver, cookieHeader, readCookie, signInSupabase, type AuthResolver, type AuthUser } from './auth';
import { createStore, StoreError, type ReviewRead, type ReviewStore } from './db';
import { CATALOG, findConfiguration, getConfigurationOrThrow, getRequiredPlantIds } from './domain/catalog';
import { assertCompleteMatrix, calculateMetrics, validateObservationEntries, roundPercentage } from './domain/metrics';
import { createReviewIdentity } from './domain/reviews';
import { REVIEW_AREAS, type MetricGrain, type ObservationEntry, type OrganismMetric, type ReviewArea, type ReviewSlot, type StoredReviewArea } from './contracts';

type AppOptions = {
  store?: ReviewStore;
  auth?: AuthResolver;
  authMode?: 'open' | 'memory' | 'supabase';
  allowedOrigins?: readonly string[];
};

type ApiErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_REQUEST' | 'STALE_VERSION' | 'IMMUTABLE' | 'DATABASE_NOT_READY' | 'CSRF_FAILED';

class ApiError extends Error {
  constructor(readonly code: ApiErrorCode, message: string, readonly details: Record<string, unknown> = {}, readonly status = 400) {
    super(message);
    this.name = 'ApiError';
  }
}

type ReportArea = ReviewArea | 'combined';
type Filters = { area?: ReportArea; configurationId?: string; crop?: string; bed?: string; organismId?: string; reviewId?: string; from?: string; to?: string };
const OPEN_GUEST_USER: AuthUser = { id: 'guest-observer', email: 'guest@local.test' };

export function createApp(options: AppOptions = {}): (request: Request) => Promise<Response> {
  const store = options.store ?? createStore();
  const mode = options.authMode ?? (process.env.AUTH_MODE === 'open' ? 'open' : process.env.AUTH_MODE === 'supabase' || (process.env.NODE_ENV === 'production' && !process.env.AUTH_MODE) ? 'supabase' : 'memory');
  const allowedOrigins = options.allowedOrigins ?? (process.env.ALLOWED_ORIGINS ?? 'http://localhost:4321,http://localhost:8080').split(',').map((origin) => origin.trim()).filter(Boolean);
  const auth = options.auth ?? (mode === 'open'
    ? async (): Promise<AuthUser> => ({ ...OPEN_GUEST_USER })
    : mode === 'supabase'
    ? createSupabaseAuthResolver(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'))
    : async (request: Request): Promise<AuthUser | null> => {
      const cookie = readCookie(request, 'mp_session');
      if (cookie === 'demo-observer') return { id: 'demo-observer', email: 'demo@local.test' };
      const testUser = request.headers.get('x-test-user');
      return testUser && process.env.NODE_ENV !== 'production' ? { id: testUser, email: `${testUser}@test.local` } : null;
    });

  return async (request) => {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins.includes('*') ? '*' : undefined;
    const commonHeaders = new Headers({ 'Cache-Control': 'no-store' });
    if (corsOrigin) {
      commonHeaders.set('Access-Control-Allow-Origin', corsOrigin);
      commonHeaders.set('Access-Control-Allow-Credentials', 'true');
      commonHeaders.set('Vary', 'Origin');
    }

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/v1/')) {
      if (origin && !corsOrigin) return json({ code: 'CSRF_FAILED', message: 'Origin is not allowed.', details: {} }, 403, commonHeaders);
      commonHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
      commonHeaders.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
      return new Response(null, { status: 204, headers: commonHeaders });
    }

    if (url.pathname === '/healthz' && request.method === 'GET') return json({ status: 'ok' }, 200, commonHeaders);
    if (url.pathname === '/readyz' && request.method === 'GET') {
      const ready = await store.ready();
      return json({ status: ready ? 'ready' : 'not_ready' }, ready ? 200 : 503, commonHeaders);
    }
    if (!url.pathname.startsWith('/api/v1/')) return json({ code: 'NOT_FOUND', message: 'Route not found.', details: {} }, 404, commonHeaders);
    if (origin && !corsOrigin) return json({ code: 'CSRF_FAILED', message: 'Origin is not allowed.', details: {} }, 403, commonHeaders);
    if (isMutation(request.method) && request.headers.get('sec-fetch-site') === 'cross-site') {
      return json({ code: 'CSRF_FAILED', message: 'Cross-site mutation rejected.', details: {} }, 403, commonHeaders);
    }

    if (url.pathname === '/api/v1/session' && request.method === 'POST') {
      if (mode === 'open') return json({ data: { user: { ...OPEN_GUEST_USER } } }, 200, commonHeaders);
      if (mode === 'memory') {
        commonHeaders.append('Set-Cookie', cookieHeader('mp_session', 'demo-observer', false));
        return json({ data: { user: { id: 'demo-observer', email: 'demo@local.test' } } }, 200, commonHeaders);
      }
      try {
        const credentials = await bodyOf(request);
        const email = stringValue(credentials.email);
        const password = stringValue(credentials.password);
        if (!email || !password) return json({ code: 'INVALID_REQUEST', message: 'Email y contraseña son obligatorios.', details: {} }, 422, commonHeaders);
        const session = await signInSupabase(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), email, password);
        if (!session) return json({ code: 'UNAUTHENTICATED', message: 'Las credenciales no son válidas.', details: {} }, 401, commonHeaders);
        commonHeaders.append('Set-Cookie', cookieHeader('mp_session', session.token, true));
        return json({ data: { user: session.user } }, 200, commonHeaders);
      } catch (error) {
        return handleError(error, commonHeaders);
      }
    }

    let user: AuthUser | null;
    try {
      user = await auth(request);
    } catch {
      user = null;
    }
    if (!user) return json({ code: 'UNAUTHENTICATED', message: 'A valid session is required.', details: {} }, 401, commonHeaders);

    try {
      const result = await route(request, url, user, store);
      return json(result.body, result.status, commonHeaders, result.contentType);
    } catch (error) {
      return handleError(error, commonHeaders);
    }
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when AUTH_MODE=supabase.`);
  return value;
}

function isMutation(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

async function route(request: Request, url: URL, user: AuthUser, store: ReviewStore): Promise<{ body: unknown; status: number; contentType?: string }> {
  const path = url.pathname.slice('/api/v1'.length);
  if (path === '/catalog' && request.method === 'GET') return { body: { data: await store.getCatalog() }, status: 200 };
  if (path === '/reviews/drafts' && request.method === 'GET') {
    return { body: { data: await store.listDrafts(user.id, entryAreaValue(url.searchParams.get('area'))) }, status: 200 };
  }
  if (path === '/reviews/drafts' && request.method === 'POST') {
    const input = await bodyOf(request);
    const area = entryAreaValue(input.area);
    const configurationId = stringValue(input.configurationId);
    const reviewWeek = stringValue(input.reviewWeek);
    const reviewDate = stringValue(input.reviewDate);
    const slot = input.slot;
    if (!area || !configurationId || !reviewWeek || !reviewDate || !Number.isInteger(slot) || ![1, 2].includes(slot as number)) {
      throw new ApiError('INVALID_REQUEST', 'area, configurationId, reviewWeek, reviewDate, and slot 1 or 2 are required.', {}, 422);
    }
    getConfigurationOrThrow(configurationId);
    const identity = createReviewIdentity({ reviewId: randomUUID(), area, configurationId, reviewWeek, reviewDate, observerId: user.id, slot: slot as ReviewSlot });
    return { body: { data: await store.createDraft(identity) }, status: 201 };
  }
  const reviewMatch = path.match(/^\/reviews\/([^/]+)$/);
  if (reviewMatch && request.method === 'GET') return { body: { data: await store.getReview(reviewMatch[1], user.id) }, status: 200 };
  const observationMatch = path.match(/^\/reviews\/([^/]+)\/observations$/);
  if (observationMatch && request.method === 'PUT') {
    const input = await bodyOf(request);
    const review = await store.getReview(observationMatch[1], user.id);
    const version = integerValue(input.version);
    const entries = entriesValue(input.entries);
    if (version === undefined || !entries) throw new ApiError('INVALID_REQUEST', 'version and entries are required.', {}, 422);
    if (review.currentVersion !== version) throw new ApiError('STALE_VERSION', 'Reload the review before saving.', { currentVersion: review.currentVersion }, 409);
    validateObservationEntries(getConfigurationOrThrow(review.configurationId), review.area, entries);
    return { body: { data: await store.saveDraft(review.reviewId, user.id, version, entries) }, status: 200 };
  }
  const submitMatch = path.match(/^\/reviews\/([^/]+)\/submit$/);
  if (submitMatch && request.method === 'POST') {
    const input = await bodyOf(request);
    const review = await store.getReview(submitMatch[1], user.id);
    const version = integerValue(input.version);
    if (version === undefined) throw new ApiError('INVALID_REQUEST', 'version is required.', {}, 422);
    if (version !== review.currentVersion) throw new ApiError('STALE_VERSION', 'Reload the review before submitting.', { currentVersion: review.currentVersion }, 409);
    const configuration = getConfigurationOrThrow(review.configurationId);
    assertCompleteMatrix(configuration, review.area, review.version.entries);
    const metrics = calculateMetrics({ configuration, area: review.area, reviewId: review.reviewId, version, entries: review.version.entries });
    const saved = await store.submitReview(review.reviewId, user.id, version, metrics);
    return { body: { data: { reviewId: saved.reviewId, status: saved.status, version: saved.currentVersion, submittedAt: saved.version.submittedAt, metrics: presentMetrics(saved.version.metrics), confirmation: `Revisión ${saved.reviewDate} enviada correctamente.` }, review: saved }, status: 200 };
  }
  const correctionMatch = path.match(/^\/reviews\/([^/]+)\/corrections$/);
  if (correctionMatch && request.method === 'POST') {
    const input = await bodyOf(request);
    const review = await store.getReview(correctionMatch[1], user.id);
    const baseVersion = integerValue(input.baseVersion);
    const reason = stringValue(input.reason);
    const entries = entriesValue(input.entries);
    if (baseVersion === undefined || !reason?.trim() || !entries) throw new ApiError('INVALID_REQUEST', 'baseVersion, reason, and entries are required.', {}, 422);
    if (baseVersion !== review.currentVersion) throw new ApiError('STALE_VERSION', 'Reload before creating a correction.', { currentVersion: review.currentVersion }, 409);
    const configuration = getConfigurationOrThrow(review.configurationId);
    validateObservationEntries(configuration, review.area, entries);
    assertCompleteMatrix(configuration, review.area, entries);
    const metrics = calculateMetrics({ configuration, area: review.area, reviewId: review.reviewId, version: baseVersion + 1, entries });
    const saved = await store.createCorrection(review.reviewId, user.id, baseVersion, reason, entries, metrics);
    return { body: { data: saved, confirmation: `Corrección v${saved.currentVersion} guardada correctamente.` }, status: 201 };
  }
  if (path === '/dashboard' && request.method === 'GET') return { body: { data: dashboard(await store.listSubmitted(user.id), filtersOf(url)) }, status: 200 };
  if (path === '/observations' && request.method === 'GET') return observationsResponse(await store.listSubmitted(user.id), filtersOf(url), url.searchParams);
  if (path === '/exports/reviews.csv' && request.method === 'GET') {
    const rows = observationRows(await store.listSubmitted(user.id), filtersOf(url));
    return { body: csv(rows), status: 200, contentType: 'text/csv; charset=utf-8' };
  }
  throw new ApiError('NOT_FOUND', 'Route not found.', {}, 404);
}

function filtersOf(url: URL): Filters {
  const value = (key: keyof Filters) => url.searchParams.get(key) || undefined;
  return { area: reportAreaValue(value('area')), configurationId: value('configurationId'), crop: value('crop'), bed: value('bed'), organismId: value('organismId'), reviewId: value('reviewId'), from: value('from'), to: value('to') };
}

function filterReviews(reviews: readonly ReviewRead[], filters: Filters): ReviewRead[] {
  return reviews.filter((review) => {
    const configuration = findConfiguration(review.configurationId);
    return configuration && (!filters.area || filters.area === 'combined' || review.area === filters.area)
      && (!filters.configurationId || review.configurationId === filters.configurationId)
      && (!filters.crop || configuration.cropName.toLowerCase() === filters.crop.toLowerCase())
      && (!filters.reviewId || review.reviewId === filters.reviewId)
      && (!filters.from || review.reviewDate >= filters.from)
      && (!filters.to || review.reviewDate <= filters.to);
  });
}

function scopedPlantIds(configurationId: string, bed?: string): readonly string[] {
  const configuration = getConfigurationOrThrow(configurationId);
  if (!bed) return getRequiredPlantIds(configuration);
  const selected = configuration.beds.find((item) => item.id === bed || String(item.number) === bed);
  if (!selected) return [];
  return selected.plantIds;
}

function reviewMetrics(review: ReviewRead, filters: Filters): readonly OrganismMetric[] {
  const configuration = getConfigurationOrThrow(review.configurationId);
  const plantIds = scopedPlantIds(review.configurationId, filters.bed);
  if (plantIds.length === 0) return [];
  const grain: MetricGrain = filters.bed ? 'bed' : 'review';
  return calculateMetrics({ configuration, area: review.area, reviewId: review.reviewId, version: review.currentVersion, entries: review.version.entries, plantIds, grain, calculatedAt: review.version.metrics[0]?.calculatedAt }).filter((metric) => !filters.organismId || metric.organismId === filters.organismId);
}

type ObservationRow = { reviewId: string; version: number; area: StoredReviewArea; reviewDate: string; reviewWeek: string; slot: ReviewSlot; configurationId: string; lotName: string; cropName: string; bed: number; plantId: string; organismId: string; organismName: string; severity: number; metric: ReturnType<typeof presentMetric> };

function observationRows(reviews: readonly ReviewRead[], filters: Filters): ObservationRow[] {
  const result: ObservationRow[] = [];
  for (const review of filterReviews(reviews, filters)) {
    const configuration = getConfigurationOrThrow(review.configurationId);
    const plantIds = new Set(scopedPlantIds(review.configurationId, filters.bed));
    const metrics = new Map(reviewMetrics(review, filters).map((metric) => [metric.organismId, presentMetric(metric)]));
    for (const entry of review.version.entries) {
      const bed = configuration.beds.find((item) => item.plantIds.includes(entry.plantId));
      if (plantIds.has(entry.plantId) && (!filters.organismId || filters.organismId === entry.organismId) && bed && metrics.has(entry.organismId)) {
        result.push({ reviewId: review.reviewId, version: review.currentVersion, area: review.area, reviewDate: review.reviewDate, reviewWeek: review.reviewWeek, slot: review.slot, configurationId: configuration.id, lotName: configuration.lotName, cropName: configuration.cropName, bed: bed.number, plantId: entry.plantId, organismId: entry.organismId, organismName: CATALOG.organisms.find((item) => item.id === entry.organismId)?.name ?? entry.organismId, severity: entry.severity, metric: metrics.get(entry.organismId)! });
      }
    }
  }
  return result.sort((left, right) => `${right.reviewDate}-${right.plantId}-${right.organismId}`.localeCompare(`${left.reviewDate}-${left.plantId}-${left.organismId}`));
}

function consolidatedRows(reviews: readonly ReviewRead[], filters: Filters) {
  const result: Array<{
    reviewId: string;
    version: number;
    area: StoredReviewArea;
    reviewDate: string;
    reviewWeek: string;
    slot: ReviewSlot;
    configurationId: string;
    lotName: string;
    cropName: string;
    bed: number;
    inspectedPlants: number;
    organismId: string;
    organismName: string;
    metric: ReturnType<typeof presentMetric>;
  }> = [];

  for (const review of filterReviews(reviews, filters)) {
    const configuration = getConfigurationOrThrow(review.configurationId);
    const beds = filters.bed
      ? configuration.beds.filter((item) => item.id === filters.bed || String(item.number) === filters.bed)
      : configuration.beds;
    for (const bed of beds) {
      const metrics = calculateMetrics({
        configuration,
        area: review.area,
        reviewId: review.reviewId,
        version: review.currentVersion,
        entries: review.version.entries,
        plantIds: bed.plantIds,
        grain: 'bed',
        calculatedAt: review.version.metrics[0]?.calculatedAt,
      }).filter((metric) => !filters.organismId || metric.organismId === filters.organismId);
      for (const metric of metrics) {
        result.push({
          reviewId: review.reviewId,
          version: review.currentVersion,
          area: review.area,
          reviewDate: review.reviewDate,
          reviewWeek: review.reviewWeek,
          slot: review.slot,
          configurationId: configuration.id,
          lotName: configuration.lotName,
          cropName: configuration.cropName,
          bed: bed.number,
          inspectedPlants: bed.plantIds.length,
          organismId: metric.organismId,
          organismName: CATALOG.organisms.find((item) => item.id === metric.organismId)?.name ?? metric.organismId,
          metric: presentMetric(metric),
        });
      }
    }
  }

  return result.sort((left, right) => `${right.reviewDate}-${right.slot}-${right.configurationId}-${right.bed}-${right.organismId}`.localeCompare(`${left.reviewDate}-${left.slot}-${left.configurationId}-${left.bed}-${left.organismId}`));
}

function dashboard(reviews: readonly ReviewRead[], filters: Filters) {
  const selected = filterReviews(reviews, filters);
  const metrics = selected.flatMap((review) => reviewMetrics(review, filters));
  const byAreaAndOrganism = new Map<string, OrganismMetric[]>();
  metrics.forEach((metric) => { const key = `${metric.area}::${metric.organismId}`; byAreaAndOrganism.set(key, [...(byAreaAndOrganism.get(key) ?? []), metric]); });
  const kpis = [...byAreaAndOrganism.entries()].map(([key, values]) => { const [area, organismId] = key.split('::') as [StoredReviewArea, string]; return { area, organismId, organismName: CATALOG.organisms.find((item) => item.id === organismId)?.name ?? organismId, reviews: values.length, incidenceNumerator: values.reduce((sum, item) => sum + item.incidenceNumerator, 0), incidenceDenominator: values.reduce((sum, item) => sum + item.incidenceDenominator, 0), severityNumerator: values.reduce((sum, item) => sum + item.severityNumerator, 0), severityDenominator: values.reduce((sum, item) => sum + item.severityDenominator, 0), incidencePercent: roundPercentage(values.reduce((sum, item) => sum + item.incidenceNumerator, 0) / values.reduce((sum, item) => sum + item.incidenceDenominator, 0) * 100), severityPercent: roundPercentage(values.reduce((sum, item) => sum + item.severityNumerator, 0) / values.reduce((sum, item) => sum + item.severityDenominator, 0) * 100), provenance: values.map((item) => ({ formulaVersion: item.formulaVersion, sourceReviewId: item.sourceReviewId, sourceVersion: item.sourceVersion, calculatedAt: item.calculatedAt })) }; });
  const consolidated = consolidatedRows(selected, filters);
  return { count: metrics.length ? selected.length : 0, empty: metrics.length === 0, kpis, trends: selected.map((review) => { const configuration = getConfigurationOrThrow(review.configurationId); return { reviewId: review.reviewId, area: review.area, date: review.reviewDate, reviewWeek: review.reviewWeek, slot: review.slot, configurationId: review.configurationId, lotName: configuration.lotName, cropName: configuration.cropName, metrics: reviewMetrics(review, filters).map(presentMetric) }; }), consolidated, comparisons: kpis.map(({ area, organismId, organismName, incidencePercent, severityPercent }) => ({ area, organismId, organismName, incidencePercent, severityPercent })), filters };
}

function presentMetric(metric: OrganismMetric) {
  return { ...metric, incidencePercent: roundPercentage(metric.incidencePercent), severityPercent: roundPercentage(metric.severityPercent), incidencePercentRaw: metric.incidencePercent, severityPercentRaw: metric.severityPercent };
}

function presentMetrics(metrics: readonly OrganismMetric[]) { return metrics.map(presentMetric); }

function observationsResponse(reviews: readonly ReviewRead[], filters: Filters, params: URLSearchParams) {
  const rows = observationRows(reviews, filters);
  const limit = Math.min(200, Math.max(1, Number(params.get('limit') ?? 50) || 50));
  const offset = decodeCursor(params.get('cursor'));
  const page = rows.slice(offset, offset + limit);
  return { body: { data: page, nextCursor: offset + limit < rows.length ? encodeCursor(offset + limit) : null }, status: 200 };
}

function encodeCursor(offset: number): string { return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url'); }
function decodeCursor(cursor: string | null): number { if (!cursor) return 0; try { const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); return Number.isInteger(value.offset) && value.offset >= 0 ? value.offset : 0; } catch { return 0; } }

function csv(rows: readonly ObservationRow[]): string {
  const columns = ['review_id', 'version', 'area', 'review_date', 'review_week', 'slot', 'configuration_id', 'lot', 'crop', 'bed', 'plant_id', 'organism_id', 'organism', 'severity', 'incidence_percent', 'severity_percent', 'incidence_numerator', 'incidence_denominator', 'severity_numerator', 'severity_denominator', 'formula_version', 'calculated_at', 'source_review_id', 'source_version'];
  const values = rows.map((row) => [row.reviewId, row.version, row.area, row.reviewDate, row.reviewWeek, row.slot, row.configurationId, row.lotName, row.cropName, row.bed, row.plantId, row.organismId, row.organismName, row.severity, row.metric.incidencePercent, row.metric.severityPercent, row.metric.incidenceNumerator, row.metric.incidenceDenominator, row.metric.severityNumerator, row.metric.severityDenominator, row.metric.formulaVersion, row.metric.calculatedAt, row.metric.sourceReviewId, row.metric.sourceVersion]);
  return [columns, ...values].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n';
}

async function bodyOf(request: Request): Promise<Record<string, any>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError('INVALID_REQUEST', 'Content-Type must be application/json.', {}, 415);
  const text = await request.text();
  if (text.length > 1_000_000) throw new ApiError('INVALID_REQUEST', 'Request body is too large.', {}, 413);
  try { const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; } catch { throw new ApiError('INVALID_REQUEST', 'Request body must be valid JSON.', {}, 400); }
}

function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.length > 0 ? value : undefined; }
function integerValue(value: unknown): number | undefined { return typeof value === 'number' && Number.isInteger(value) ? value : undefined; }
function entriesValue(value: unknown): ObservationEntry[] | undefined { return Array.isArray(value) ? value as ObservationEntry[] : undefined; }
function entryAreaValue(value: unknown): ReviewArea | undefined { return typeof value === 'string' && REVIEW_AREAS.includes(value as ReviewArea) ? value as ReviewArea : undefined; }
function reportAreaValue(value: unknown): ReportArea | undefined { return value === 'combined' || entryAreaValue(value) ? value as ReportArea : undefined; }

function handleError(error: unknown, headers: Headers): Response {
  if (error instanceof ApiError) return json({ code: error.code, message: error.message, details: error.details }, error.status, headers);
  if (error instanceof StoreError) {
    const map = { NOT_FOUND: ['NOT_FOUND', 404], FORBIDDEN: ['FORBIDDEN', 403], STALE_VERSION: ['STALE_VERSION', 409], IMMUTABLE: ['IMMUTABLE', 409], DUPLICATE_REVIEW_SLOT: ['DUPLICATE_REVIEW_SLOT', 409], DATABASE_NOT_READY: ['DATABASE_NOT_READY', 503] } as const;
    const [code, status] = map[error.code];
    return json({ code, message: error.message, details: error.details }, status, headers);
  }
  if (error instanceof Error && error.name === 'DomainValidationError') {
    const domain = error as Error & { code: string; details: Record<string, unknown> };
    return json({ code: domain.code, message: domain.message, details: domain.details }, domain.code === 'DUPLICATE_REVIEW_SLOT' ? 409 : 422, headers);
  }
  return json({ code: 'INVALID_REQUEST', message: 'The request could not be processed.', details: {} }, 500, headers);
}

function json(value: unknown, status: number, headers: Headers, contentType = 'application/json; charset=utf-8'): Response {
  const result = new Headers(headers);
  result.set('Content-Type', contentType);
  return new Response(contentType.startsWith('application/json') ? JSON.stringify(value) : String(value), { status, headers: result });
}
