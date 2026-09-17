import { describe, expect, it } from 'vitest';
import { userFacingErrorMessage } from '../../src/lib/api';

describe('user-facing API feedback', () => {
  it('maps provider configuration failures without changing their API code', () => {
    expect(userFacingErrorMessage('DATABASE_NOT_READY', 'Failed to get project config')).toBe('No se pudo cargar la configuración del proyecto. Intenta nuevamente más tarde o contacta al administrador.');
    expect(userFacingErrorMessage(undefined, 'Failed to get project config')).toContain('configuración del proyecto');
  });

  it('keeps the submitted duplicate warning understandable and stable', () => {
    expect(userFacingErrorMessage('DUPLICATE_REVIEW_SLOT', 'provider detail: revisión enviada')).toBe('Ya existe una revisión enviada para esta configuración, semana y ronda. Selecciona otra ronda o semana');
  });
});
