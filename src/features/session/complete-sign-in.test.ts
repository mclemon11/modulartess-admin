import { describe, expect, it, vi } from 'vitest';

import { completeSignIn } from './complete-sign-in';

const FAKE_TOKEN = 'a'.repeat(40);

const closed = async () => true;
const notClosed = async () => false;

describe('el cierre de la sesión de Firebase se intenta siempre', () => {
  it('después de un canje correcto, y después del canje, no antes', async () => {
    const order: string[] = [];
    const closeSession = vi.fn(async () => {
      order.push('close');

      return true;
    });

    const result = await completeSignIn({
      getIdToken: async () => FAKE_TOKEN,
      exchange: async () => {
        order.push('exchange');

        return { ok: true };
      },
      closeSession,
    });

    expect(result).toEqual({ ok: true, clientSessionClosed: true });
    expect(closeSession).toHaveBeenCalledTimes(1);
    // El ID token debía seguir sirviendo mientras se canjeaba.
    expect(order).toEqual(['exchange', 'close']);
  });

  it('cuando el canje devuelve un fallo', async () => {
    const closeSession = vi.fn(closed);

    const result = await completeSignIn({
      getIdToken: async () => FAKE_TOKEN,
      exchange: async () => ({ ok: false, code: 'admin_role_required' }),
      closeSession,
    });

    expect(result).toEqual({
      ok: false,
      code: 'admin_role_required',
      clientSessionClosed: true,
    });
    expect(closeSession).toHaveBeenCalledTimes(1);
  });

  it('cuando la obtención del ID token lanza', async () => {
    const closeSession = vi.fn(closed);
    const exchange = vi.fn();

    const result = await completeSignIn({
      getIdToken: async () => {
        throw new Error('fallo del proveedor');
      },
      exchange,
      closeSession,
    });

    expect(result).toEqual({ ok: false, code: 'internal_error', clientSessionClosed: true });
    expect(exchange).not.toHaveBeenCalled();
    expect(closeSession).toHaveBeenCalledTimes(1);
  });

  it('cuando el canje lanza', async () => {
    const closeSession = vi.fn(closed);

    const result = await completeSignIn({
      getIdToken: async () => FAKE_TOKEN,
      exchange: async () => {
        throw new Error('caída de red');
      },
      closeSession,
    });

    expect(result.ok).toBe(false);
    expect(closeSession).toHaveBeenCalledTimes(1);
  });
});

describe('el resultado informa si el cierre se confirmó', () => {
  it('marca el cierre confirmado tras un canje correcto', async () => {
    const result = await completeSignIn({
      getIdToken: async () => FAKE_TOKEN,
      exchange: async () => ({ ok: true }),
      closeSession: closed,
    });

    expect(result.clientSessionClosed).toBe(true);
  });

  it('marca el cierre NO confirmado cuando signOut devuelve false', async () => {
    const result = await completeSignIn({
      getIdToken: async () => FAKE_TOKEN,
      exchange: async () => ({ ok: true }),
      closeSession: notClosed,
    });

    expect(result).toEqual({ ok: true, clientSessionClosed: false });
  });

  it('marca el cierre NO confirmado cuando signOut lanza', async () => {
    const result = await completeSignIn({
      getIdToken: async () => FAKE_TOKEN,
      exchange: async () => ({ ok: true }),
      closeSession: async () => {
        throw new Error('fallo de signOut');
      },
    });

    expect(result).toEqual({ ok: true, clientSessionClosed: false });
  });

  it('un signOut fallido tras un canje rechazado también se informa', async () => {
    const result = await completeSignIn({
      getIdToken: async () => FAKE_TOKEN,
      exchange: async () => ({ ok: false, code: 'service_unavailable' }),
      closeSession: notClosed,
    });

    expect(result).toEqual({
      ok: false,
      code: 'service_unavailable',
      clientSessionClosed: false,
    });
  });

  it('un signOut fallido nunca se convierte en éxito silencioso', async () => {
    for (const close of [notClosed, async () => Promise.reject(new Error('x'))]) {
      const result = await completeSignIn({
        getIdToken: async () => FAKE_TOKEN,
        exchange: async () => ({ ok: true }),
        closeSession: close as () => Promise<boolean>,
      });

      expect(result.clientSessionClosed).toBe(false);
    }
  });
});

describe('no se propaga nada del proveedor', () => {
  it('el error original no aparece en el resultado', async () => {
    const result = await completeSignIn({
      getIdToken: async () => {
        throw new Error('auth/internal-error uid=abc123 correo@example.invalid');
      },
      exchange: async () => ({ ok: true }),
      closeSession: closed,
    });

    expect(JSON.stringify(result)).not.toContain('uid=');
    expect(JSON.stringify(result)).not.toContain('@');
    expect(JSON.stringify(result)).not.toContain('auth/');
  });

  it('el ID token no aparece nunca en el resultado', async () => {
    const result = await completeSignIn({
      getIdToken: async () => FAKE_TOKEN,
      exchange: async () => ({ ok: false, code: 'service_unavailable' }),
      closeSession: notClosed,
    });

    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
  });
});
