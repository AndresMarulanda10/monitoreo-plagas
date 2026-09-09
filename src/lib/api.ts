export type Severity = 0 | 1 | 2 | 3;
export type EntryArea = 'microbiology' | 'entomology';
export type StoredReviewArea = EntryArea | 'legacy';
export type ReportArea = EntryArea | 'combined';
export type ObservationEntry = { plantId: string; organismId: string; severity: Severity };
export type Organism = { id: string; name: string };
export type Bed = { id: string; number: number; plantIds: string[] };
export type Configuration = { id: string; lotName: string; cropName: string; bedCount: number; plantsPerBed: number; beds: Bed[] };
export type Metric = { area: StoredReviewArea; organismId: string; grain?: 'review' | 'bed' | 'crop' | 'configuration'; incidencePercent: number; severityPercent: number; incidenceNumerator: number; incidenceDenominator: number; severityNumerator: number; severityDenominator: number; formulaVersion: string; sourceReviewId: string; sourceVersion: number; calculatedAt: string };
export type Review = { reviewId: string; area: StoredReviewArea; configurationId: string; reviewWeek: string; reviewDate: string; observerId: string; slot: 1 | 2; status: 'draft' | 'submitted'; currentVersion: number; version: { version: number; status: 'draft' | 'submitted'; submittedAt?: string; correctionOfVersion?: number; correctionReason?: string; entries: ObservationEntry[]; metrics: Metric[] }; completion: { complete: boolean; expected: number; actual: number; missing: { plantId: string; organismId: string }[] }; versions: unknown[] };
export type Catalog = { configurations: Configuration[]; organisms: Organism[] };
export type ReviewDraft = { reviewId: string; area: EntryArea; configurationId: string; reviewWeek: string; reviewDate: string; slot: 1 | 2; status: 'draft'; currentVersion: number; completion: { complete: boolean; expected: number; actual: number; missing: { plantId: string; organismId: string }[] } };

const CROP_LABELS: Record<string, string> = { Tomato: 'Tomate', Strawberry: 'Fresa', Blueberry: 'Arándano', Cucumber: 'Pepino' };
const ORGANISM_LABELS: Record<string, string> = { Aphids: 'Áfidos', Thrips: 'Trips', Mites: 'Ácaros' };
const AREA_ORGANISM_IDS: Record<EntryArea, readonly string[]> = { microbiology: ['cladosporium', 'mildeo', 'botrytis'], entomology: ['aphids', 'thrips', 'mites', 'tuta', 'plutella'] };
export function displayCropName(name: string): string { return CROP_LABELS[name] ?? name; }
export function displayOrganismName(name: string): string { return ORGANISM_LABELS[name] ?? name; }
export function displayAreaName(area: StoredReviewArea | ReportArea): string { return area === 'microbiology' ? 'Microbiología' : area === 'entomology' ? 'Entomología' : area === 'combined' ? 'Consolidado' : 'Legado'; }
export function organismsForArea(catalog: Catalog, area: EntryArea): Organism[] { const allowed = new Set(AREA_ORGANISM_IDS[area]); return catalog.organisms.filter((organism) => allowed.has(organism.id)); }

const API_BASE = (import.meta.env.PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
export const apiBase = API_BASE;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = payload as { code?: string; message?: string; details?: Record<string, unknown> };
    throw Object.assign(new Error(error.message ?? 'No fue posible completar la solicitud.'), { code: error.code, details: error.details });
  }
  return payload as T;
}

export const api = {
  startSession: (credentials?: { email: string; password: string }) => request<{ data: { user: { id: string; email?: string } } }>('/session', { method: 'POST', body: JSON.stringify(credentials ?? {}) }),
  catalog: () => request<{ data: Catalog }>('/catalog'),
  drafts: (area?: EntryArea) => request<{ data: ReviewDraft[] }>(`/reviews/drafts${area ? `?area=${area}` : ''}`),
  createDraft: (input: { area: EntryArea; configurationId: string; reviewWeek: string; reviewDate: string; slot: 1 | 2 }) => request<{ data: Review }>('/reviews/drafts', { method: 'POST', body: JSON.stringify(input) }),
  review: (id: string) => request<{ data: Review }>(`/reviews/${id}`),
  save: (id: string, version: number, entries: ObservationEntry[]) => request<{ data: Review }>(`/reviews/${id}/observations`, { method: 'PUT', body: JSON.stringify({ version, entries }) }),
  submit: (id: string, version: number) => request<{ data: { metrics: Metric[]; confirmation: string }; review: Review }>(`/reviews/${id}/submit`, { method: 'POST', body: JSON.stringify({ version }) }),
  correct: (id: string, baseVersion: number, reason: string, entries: ObservationEntry[]) => request<{ data: Review; confirmation: string }>(`/reviews/${id}/corrections`, { method: 'POST', body: JSON.stringify({ baseVersion, reason, entries }) }),
  dashboard: (query: string) => request<{ data: Dashboard }>(`/dashboard${query}`),
  observations: (query: string) => request<{ data: ObservationRow[]; nextCursor: string | null }>(`/observations${query}`),
};

export type ConsolidatedMetric = { reviewId: string; version: number; area: StoredReviewArea; reviewDate: string; reviewWeek: string; slot: 1 | 2; configurationId: string; lotName: string; cropName: string; bed: number; inspectedPlants: number; organismId: string; organismName: string; metric: Metric };
export type Dashboard = { count: number; empty: boolean; kpis: Array<{ area: StoredReviewArea; organismId: string; organismName: string; reviews: number; incidencePercent: number; severityPercent: number; incidenceNumerator: number; incidenceDenominator: number; severityNumerator: number; severityDenominator: number; provenance: Array<{ formulaVersion: string; sourceReviewId: string; sourceVersion: number; calculatedAt: string }> }>; trends: Array<{ reviewId: string; area: StoredReviewArea; date: string; reviewWeek: string; slot: 1 | 2; configurationId: string; lotName: string; cropName: string; metrics: Metric[] }>; consolidated: ConsolidatedMetric[]; comparisons: Array<{ area: StoredReviewArea; organismId: string; organismName: string; incidencePercent: number; severityPercent: number }>; filters: Record<string, string | undefined> };
export type ObservationRow = { reviewId: string; version: number; area: StoredReviewArea; reviewDate: string; reviewWeek: string; slot: 1 | 2; configurationId: string; lotName: string; cropName: string; bed: number; plantId: string; organismId: string; organismName: string; severity: Severity; metric: Metric };
