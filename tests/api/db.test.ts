import { describe, expect, it, vi } from 'vitest';
import { mapSupabaseError, StoreError, SupabaseStore } from '../../server/src/db.js';

describe('Supabase store errors', () => {
  it('maps Supabase no-row errors to not found', () => {
    const error = mapSupabaseError({
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
    });

    expect(error).toBeInstanceOf(StoreError);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Review not found.');
  });

  it('keeps real Supabase errors as database-not-ready', () => {
    const error = mapSupabaseError({ code: '42501', message: 'permission denied for table reviews' });

    expect(error.code).toBe('DATABASE_NOT_READY');
    expect(error.message).toBe('permission denied for table reviews');
  });

  it('stabilizes known project configuration provider failures', () => {
    const error = mapSupabaseError({ message: 'Failed to get project config' });

    expect(error.code).toBe('DATABASE_NOT_READY');
    expect(error.message).toContain('No se pudo cargar la configuración del proyecto');
    expect(error.message).not.toContain('Failed to get project config');
  });
});

describe('Supabase draft persistence guards', () => {
  function storeForReview(result: { data: Record<string, unknown> | null; error: { code?: string; message: string } | null }) {
    const store = new SupabaseStore('https://example.supabase.co', 'service-role-key');
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(result),
    };
    const from = vi.fn().mockReturnValue(query);
    (store as unknown as { client: unknown }).client = { from };
    return { store, from };
  }

  it('rejects submitted reviews before touching observations', async () => {
    const { store, from } = storeForReview({ data: { current_version: 1, status: 'submitted' }, error: null });

    await expect(store.saveDraft('review-1', 'observer-1', 1, [])).rejects.toMatchObject({ code: 'IMMUTABLE' });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('preserves not-found and stale-version behavior', async () => {
    const missing = storeForReview({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    await expect(missing.store.saveDraft('missing', 'observer-1', 1, [])).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const stale = storeForReview({ data: { current_version: 2, status: 'draft' }, error: null });
    await expect(stale.store.saveDraft('review-1', 'observer-1', 1, [])).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });
});
