import { describe, expect, it } from 'vitest';
import { createApp } from '../../api/src/app';
import { MemoryStore } from '../../api/src/db';
import { getConfigurationOrThrow, getRequiredCoordinates } from '../../api/src/domain/catalog';

function completeEntries(configurationId: string) {
  const configuration = getConfigurationOrThrow(configurationId);
  return getRequiredCoordinates(configuration).map(({ plantId, organismId }, index) => ({
    plantId,
    organismId,
    severity: (index % 4) as 0 | 1 | 2 | 3,
  }));
}

async function jsonRequest(app: ReturnType<typeof createApp>, path: string, init: RequestInit = {}) {
  const response = await app(new Request(`http://localhost${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } }));
  return { response, body: await response.json() as any };
}

describe('versioned monitoring API', () => {
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
    const draft = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify({ configurationId: 'lot-g-blueberry', reviewWeek: '2026-08-31', reviewDate: '2026-09-01', slot: 1 }) });
    expect(draft.response.status).toBe(201);
    const reviewId = draft.body.data.reviewId;
    expect(draft.body.data.completion.complete).toBe(false);

    const incomplete = await jsonRequest(app, `/api/v1/reviews/${reviewId}/submit`, { method: 'POST', headers, body: JSON.stringify({ version: 1 }) });
    expect(incomplete.response.status).toBe(422);
    expect(incomplete.body.code).toBe('INCOMPLETE_MATRIX');

    const entries = completeEntries('lot-g-blueberry');
    const saved = await jsonRequest(app, `/api/v1/reviews/${reviewId}/observations`, { method: 'PUT', headers, body: JSON.stringify({ version: 1, entries }) });
    expect(saved.body.data.completion).toMatchObject({ complete: true, expected: 64, actual: 64 });
    const submitted = await jsonRequest(app, `/api/v1/reviews/${reviewId}/submit`, { method: 'POST', headers, body: JSON.stringify({ version: 1 }) });
    expect(submitted.response.status).toBe(200);
    expect(submitted.body.data).toMatchObject({ status: 'submitted', version: 1 });
    expect(submitted.body.data.metrics).toHaveLength(8);

    const correction = await jsonRequest(app, `/api/v1/reviews/${reviewId}/corrections`, { method: 'POST', headers, body: JSON.stringify({ baseVersion: 1, reason: 'Corrección de campo', entries: entries.map((entry) => ({ ...entry, severity: 0 })) }) });
    expect(correction.response.status).toBe(201);
    expect(correction.body.data.currentVersion).toBe(2);
    expect(correction.body.data.versions).toHaveLength(2);
    expect(correction.body.confirmation).toContain('v2');

    const stale = await jsonRequest(app, `/api/v1/reviews/${reviewId}/corrections`, { method: 'POST', headers, body: JSON.stringify({ baseVersion: 1, reason: 'Versión vieja', entries }) });
    expect(stale.response.status).toBe(409);
    expect(stale.body.code).toBe('STALE_VERSION');
  });

  it('allows draft coexistence but rejects a duplicate slot at submission', async () => {
    const app = createApp({ store: new MemoryStore() });
    const session = await jsonRequest(app, '/api/v1/session', { method: 'POST', body: '{}' });
    const headers = { Cookie: session.response.headers.get('set-cookie')! };
    const input = { configurationId: 'lot-g-blueberry', reviewWeek: '2026-08-31', reviewDate: '2026-09-01', slot: 1 };
    const first = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify(input) });
    const second = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify(input) });
    const entries = completeEntries(input.configurationId);
    await jsonRequest(app, `/api/v1/reviews/${first.body.data.reviewId}/observations`, { method: 'PUT', headers, body: JSON.stringify({ version: 1, entries }) });
    await jsonRequest(app, `/api/v1/reviews/${first.body.data.reviewId}/submit`, { method: 'POST', headers, body: JSON.stringify({ version: 1 }) });
    await jsonRequest(app, `/api/v1/reviews/${second.body.data.reviewId}/observations`, { method: 'PUT', headers, body: JSON.stringify({ version: 1, entries }) });
    const duplicate = await jsonRequest(app, `/api/v1/reviews/${second.body.data.reviewId}/submit`, { method: 'POST', headers, body: JSON.stringify({ version: 1 }) });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body.code).toBe('DUPLICATE_REVIEW_SLOT');
  });

  it('keeps dashboard, pagination, and CSV behind identical filters', async () => {
    const app = createApp({ store: new MemoryStore() });
    const session = await jsonRequest(app, '/api/v1/session', { method: 'POST', body: '{}' });
    const headers = { Cookie: session.response.headers.get('set-cookie')! };
    const draft = await jsonRequest(app, '/api/v1/reviews/drafts', { method: 'POST', headers, body: JSON.stringify({ configurationId: 'hortisimulador-tomato', reviewWeek: '2026-08-31', reviewDate: '2026-09-02', slot: 1 }) });
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
  });
});
