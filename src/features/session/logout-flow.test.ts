import { describe, expect, it, vi } from 'vitest';

import { LOGOUT_NETWORK_MESSAGE, LOGOUT_UNEXPECTED_MESSAGE, runLogout } from './logout-flow';

describe('solo se navega tras un 204 confirmado', () => {
  it('navega cuando el cierre es correcto', async () => {
    const navigate = vi.fn();

    const result = await runLogout({ end: async () => ({ ok: true }), navigate });

    expect(result).toEqual({ ok: true });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('NO navega cuando falla la red', async () => {
    const navigate = vi.fn();

    const result = await runLogout({
      end: async () => ({ ok: false, reason: 'network' }),
      navigate,
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: LOGOUT_NETWORK_MESSAGE });
  });

  it('NO navega ante un estado inesperado', async () => {
    const navigate = vi.fn();

    const result = await runLogout({
      end: async () => ({ ok: false, reason: 'unexpected_status' }),
      navigate,
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: LOGOUT_UNEXPECTED_MESSAGE });
  });

  it('NO navega si la petición lanza', async () => {
    const navigate = vi.fn();

    const result = await runLogout({
      end: async () => {
        throw new Error('fallo interno con detalles uid=abc');
      },
      navigate,
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});

describe('el fallo permite reintentar', () => {
  it('un segundo intento correcto sí navega', async () => {
    const navigate = vi.fn();
    const end = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'network' })
      .mockResolvedValueOnce({ ok: true });

    const first = await runLogout({ end, navigate });

    expect(first.ok).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    const second = await runLogout({ end, navigate });

    expect(second).toEqual({ ok: true });
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe('no se filtra nada interno', () => {
  it('el mensaje es estable y no incluye el error original', async () => {
    const result = await runLogout({
      end: async () => {
        throw new Error('uid=abc123 correo@example.invalid token=eyJhbGciOi');
      },
      navigate: () => {},
    });

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('uid=');
    expect(serialized).not.toContain('@example.invalid');
    expect(serialized).not.toContain('eyJ');
  });

  it('los dos mensajes están en español y no nombran componentes internos', () => {
    for (const message of [LOGOUT_NETWORK_MESSAGE, LOGOUT_UNEXPECTED_MESSAGE]) {
      expect(message).toMatch(/sesión/i);
      expect(message).not.toMatch(/backend|cookie|firebase|IAM|204/i);
    }
  });
});
