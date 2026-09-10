import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/src/app';
import { MemoryStore } from '../../server/src/db';
import { getConfigurationOrThrow, getRequiredCoordinates } from '../../server/src/domain/catalog';

function completeEntries(configurationId: string, area: 'microbiology' | 'entomology' = 'microbiology') {
  const configuration = getConfigurationOrThrow(configurationId);
  return getRequiredCoordinates(configuration, area).map(({ plantId, organismId }) => ({
    plantId,
    organismId,
    severity: 0 as const,
  }));
}

async function jsonRequest(app: ReturnType<typeof createApp>, path: string, init: RequestInit = {}) {
  const response = await app(new Request(`http://localhost${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } }));
  return { response, body: await response.json() as any };
}

describe('versioned monitoring API', () => {
  it('allows open mode requests without credentials and uses a stable guest observer', async () => {
    const app = createApp({ authMode: 'open', store: new MemoryStore() });
    const session = await jsonRequest(app, '/api/v1/session', { method: 'POST', body: '{}' });
    expect(session.response.status).toBe(200);
    expect(session.body.data.user).toEqual({ id: 'guest-observer', email: 'guest@local.test' });

    const catalog = await jsonRequest(app, '/api/v1/catalog');
    expect(catalog.response.status).toBe(200);

     const draft = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', body: JSON.stringify({ area: 'microbiology', configurationId: 'lot-g-blueberry', reviewWeek: '2026-08-31', reviewDate: '2026-09-01', slot: 1 }) });
    expect(draft.response.status).toBe(201);
    expect(draft.body.data.observerId).toBe('guest-observer');
  });

  it('keeps health public and rejects unauthenticated or invalid-version requests', async () => {
    const app = createApp({ store: new MemoryStore(), allowedOrigins: ['http://localhost:4321'] });
    const health = await app(new Request('http://localhost/healthz'));
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });

    const unauthenticated = await app(new Request('http://localhost/api/v1/catalog'));
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toMatchObject({ code: 'UNAUTHENTICATED' });

    const invalidVersion = await app(new Request('http://localhost/api/v2/catalog'));
    expect(invalidVersion.status).toBe(404);
    expect((await invalidVersion.text())).not.toContain('SUPABASE');

    const crossSite = await app(new Request('http://localhost/api/v1/catalog', { headers: { Origin: 'https://attacker.example' } }));
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toMatchObject({ code: 'CSRF_FAILED' });
  });

  it('creates, reloads, submits, and corrects immutable review versions', async () => {
    const app = createApp({ store: new MemoryStore(), allowedOrigins: ['http://localhost:4321'] });
    const session = await jsonRequest(app, '/api/v1/session', { method: 'POST', body: '{}' });
    const cookie = session.response.headers.get('set-cookie')!;
    const headers = { Cookie: cookie };
    const draft = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify({ area: 'microbiology', configurationId: 'lot-g-blueberry', reviewWeek: '2026-08-31', reviewDate: '2026-09-01', slot: 1 }) });
    expect(draft.response.status).toBe(201);
    const reviewId = draft.body.data.reviewId;
    expect(draft.body.data.completion.complete).toBe(false);

    const incomplete = await jsonRequest(app, `/api/v1/reviews/${reviewId}/submit`, { method: 'POST', headers, body: JSON.stringify({ version: 1 }) });
    expect(incomplete.response.status).toBe(422);
    expect(incomplete.body.code).toBe('INCOMPLETE_MATRIX');

    const entries = completeEntries('lot-g-blueberry');
    const saved = await jsonRequest(app, `/api/v1/reviews/${reviewId}/observations`, { method: 'PUT', headers, body: JSON.stringify({ version: 1, entries }) });
    expect(saved.body.data.completion).toMatchObject({ complete: true, expected: 24, actual: 24 });
    const submitted = await jsonRequest(app, `/api/v1/reviews/${reviewId}/submit`, { method: 'POST', headers, body: JSON.stringify({ version: 1 }) });
    expect(submitted.response.status).toBe(200);
    expect(submitted.body.data).toMatchObject({ status: 'submitted', version: 1 });
    expect(submitted.body.data.metrics).toHaveLength(3);

    const correction = await jsonRequest(app, `/api/v1/reviews/${reviewId}/corrections`, { method: 'POST', headers, body: JSON.stringify({ baseVersion: 1, reason: 'Corrección de campo', entries: entries.map((entry) => ({ ...entry, severity: 0 })) }) });
    expect(correction.response.status).toBe(201);
    expect(correction.body.data.currentVersion).toBe(2);
    expect(correction.body.data.versions).toHaveLength(2);
    expect(correction.body.confirmation).toContain('v2');

    const stale = await jsonRequest(app, `/api/v1/reviews/${reviewId}/corrections`, { method: 'POST', headers, body: JSON.stringify({ baseVersion: 1, reason: 'Versión vieja', entries }) });
    expect(stale.response.status).toBe(409);
    expect(stale.body.code).toBe('STALE_VERSION');
  });

  it('lists recoverable drafts and rejects a duplicate slot at creation', async () => {
    const app = createApp({ store: new MemoryStore() });
    const session = await jsonRequest(app, '/api/v1/session', { method: 'POST', body: '{}' });
    const headers = { Cookie: session.response.headers.get('set-cookie')! };
    const input = { area: 'microbiology', configurationId: 'lot-g-blueberry', reviewWeek: '2026-08-31', reviewDate: '2026-09-01', slot: 1 };
    const first = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify(input) });
    const second = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify(input) });
    expect(second.response.status).toBe(409);
    expect(second.body).toMatchObject({ code: 'DUPLICATE_REVIEW_SLOT', message: expect.stringContaining('Abre el borrador existente'), details: { existingReviewId: first.body.data.reviewId, existingStatus: 'draft' } });

    const drafts = await jsonRequest(app, '/api/v1/reviews/drafts', { headers });
    expect(drafts.response.status).toBe(200);
    expect(drafts.body.data).toEqual([expect.objectContaining({ reviewId: first.body.data.reviewId, area: 'microbiology', configurationId: input.configurationId, reviewWeek: input.reviewWeek, reviewDate: input.reviewDate, slot: 1, status: 'draft', currentVersion: 1, completion: expect.objectContaining({ complete: false, expected: 24, actual: 0 }) })]);
    expect(drafts.body.data[0]).not.toHaveProperty('observerId');
    const opened = await jsonRequest(app, `/api/v1/reviews/${first.body.data.reviewId}`, { headers });
    expect(opened.response.status).toBe(200);
    expect(opened.body.data).toMatchObject({ reviewId: first.body.data.reviewId, status: 'draft', currentVersion: 1 });

    const entries = completeEntries(input.configurationId);
    await jsonRequest(app, `/api/v1/reviews/${first.body.data.reviewId}/observations`, { method: 'PUT', headers, body: JSON.stringify({ version: 1, entries }) });
    const duplicate = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify(input) });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body.code).toBe('DUPLICATE_REVIEW_SLOT');
  });

  it('keeps area drafts and dashboards independent while combined reporting includes both', async () => {
    const app = createApp({ store: new MemoryStore() });
    const session = await jsonRequest(app, '/api/v1/session', { method: 'POST', body: '{}' });
    const headers = { Cookie: session.response.headers.get('set-cookie')! };
    const input = { configurationId: 'lot-g-blueberry', reviewWeek: '2026-08-31', reviewDate: '2026-09-01', slot: 1 };
    const micro = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify({ ...input, area: 'microbiology' }) });
    const ento = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify({ ...input, area: 'entomology' }) });
    expect(micro.response.status).toBe(201);
    expect(ento.response.status).toBe(201);

    const microDrafts = await jsonRequest(app, '/api/v1/reviews/drafts?area=microbiology', { headers });
    const entoDrafts = await jsonRequest(app, '/api/v1/reviews/drafts?area=entomology', { headers });
    expect(microDrafts.body.data).toEqual([expect.objectContaining({ reviewId: micro.body.data.reviewId, area: 'microbiology' })]);
    expect(entoDrafts.body.data).toEqual([expect.objectContaining({ reviewId: ento.body.data.reviewId, area: 'entomology' })]);

    for (const [reviewId, area] of [[micro.body.data.reviewId, 'microbiology'], [ento.body.data.reviewId, 'entomology']] as const) {
      const entries = completeEntries(input.configurationId, area);
      await jsonRequest(app, `/api/v1/reviews/${reviewId}/observations`, { method: 'PUT', headers, body: JSON.stringify({ version: 1, entries }) });
      await jsonRequest(app, `/api/v1/reviews/${reviewId}/submit`, { method: 'POST', headers, body: JSON.stringify({ version: 1 }) });
    }

    const areaDashboard = await jsonRequest(app, '/api/v1/dashboard?area=microbiology', { headers });
    const combinedDashboard = await jsonRequest(app, '/api/v1/dashboard?area=combined', { headers });
    expect(areaDashboard.body.data.consolidated.every((row: { area: string }) => row.area === 'microbiology')).toBe(true);
    expect(areaDashboard.body.data.kpis.every((row: { area: string }) => row.area === 'microbiology')).toBe(true);
    expect(combinedDashboard.body.data.consolidated.map((row: { area: string }) => row.area)).toEqual(expect.arrayContaining(['microbiology', 'entomology']));
  });

  it('keeps dashboard, pagination, and CSV behind identical filters', async () => {
    const app = createApp({ store: new MemoryStore() });
    const session = await jsonRequest(app, '/api/v1/session', { method: 'POST', body: '{}' });
    const headers = { Cookie: session.response.headers.get('set-cookie')! };
    const draft = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify({ area: 'microbiology', configurationId: 'hortisimulador-tomato', reviewWeek: '2026-08-31', reviewDate: '2026-09-02', slot: 1 }) });
    const id = draft.body.data.reviewId;
    const entries = completeEntries('hortisimulador-tomato').map((entry) => entry.organismId === 'cladosporium' && entry.plantId.endsWith('plant-1') ? { ...entry, severity: 1 as const } : entry.organismId === 'cladosporium' && entry.plantId.endsWith('plant-2') ? { ...entry, severity: 3 as const } : entry);
    await jsonRequest(app, `/api/v1/reviews/${id}/observations`, { method: 'PUT', headers, body: JSON.stringify({ version: 1, entries }) });
    await jsonRequest(app, `/api/v1/reviews/${id}/submit`, { method: 'POST', headers, body: JSON.stringify({ version: 1 }) });

    const dashboard = await jsonRequest(app, '/api/v1/dashboard?organismId=cladosporium', { headers });
    expect(dashboard.body.data.count).toBe(1);
    expect(dashboard.body.data.kpis[0]).toMatchObject({ organismId: 'cladosporium', incidencePercent: 50 });
    const firstPage = await jsonRequest(app, '/api/v1/observations?organismId=cladosporium&limit=2', { headers });
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.nextCursor).toBeTruthy();
    const secondPage = await jsonRequest(app, `/api/v1/observations?organismId=cladosporium&limit=2&cursor=${firstPage.body.nextCursor}`, { headers });
    expect(secondPage.body.data[0].plantId).not.toBe(firstPage.body.data[0].plantId);
    const csv = await app(new Request('http://localhost/api/v1/exports/reviews.csv?organismId=cladosporium', { headers }));
    const csvText = await csv.text();
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csvText).toContain('formula_version');
    expect(csvText).toContain('metrics.v1');
    expect(csvText).toContain('review_week');
    expect(csvText).toContain('slot');
  });

  it('exposes both weekly rounds with crop, lot, bed, and pathogen metrics', async () => {
    const app = createApp({ store: new MemoryStore() });
    const session = await jsonRequest(app, '/api/v1/session', { method: 'POST', body: '{}' });
    const headers = { Cookie: session.response.headers.get('set-cookie')! };
    const configurationId = 'lot-g-blueberry';

    async function submit(slot: 1 | 2, reviewDate: string, targetBed: number, targetSeverity: 1 | 3) {
      const draft = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify({ area: 'microbiology', configurationId, reviewWeek: '2026-08-31', reviewDate, slot }) });
      const entries = completeEntries(configurationId).map((entry) => entry.organismId === 'cladosporium' && entry.plantId.includes(`-bed-${targetBed}-`) ? { ...entry, severity: targetSeverity } : entry);
      await jsonRequest(app, `/api/v1/reviews/${draft.body.data.reviewId}/observations`, { method: 'PUT', headers, body: JSON.stringify({ version: 1, entries }) });
      await jsonRequest(app, `/api/v1/reviews/${draft.body.data.reviewId}/submit`, { method: 'POST', headers, body: JSON.stringify({ version: 1 }) });
    }

    await submit(1, '2026-09-01', 1, 1);
    await submit(2, '2026-09-03', 2, 3);

    const response = await jsonRequest(app, '/api/v1/dashboard?area=microbiology&configurationId=lot-g-blueberry&crop=Blueberry&organismId=cladosporium', { headers });
    expect(response.body.data.count).toBe(2);
    expect(response.body.data.trends.map((trend: { slot: number }) => trend.slot).sort()).toEqual([1, 2]);
    expect(response.body.data.consolidated).toHaveLength(4);
    expect(response.body.data.consolidated).toEqual(expect.arrayContaining([
      expect.objectContaining({ lotName: 'Lot G', cropName: 'Blueberry', slot: 1, bed: 1, metric: expect.objectContaining({ incidencePercent: 100, severityPercent: 33, incidenceDenominator: 4, severityDenominator: 12 }) }),
      expect.objectContaining({ lotName: 'Lot G', cropName: 'Blueberry', slot: 2, bed: 2, metric: expect.objectContaining({ incidencePercent: 100, severityPercent: 100, incidenceDenominator: 4, severityDenominator: 12 }) }),
    ]));

    const observations = await jsonRequest(app, '/api/v1/observations?configurationId=lot-g-blueberry&organismId=cladosporium&limit=1', { headers });
    expect([1, 2]).toContain(observations.body.data[0].slot);
  });
});
