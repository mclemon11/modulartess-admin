import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionCleanup } from '@/features/session/session-cleanup';
import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { BackendFailure } from '@/lib/api/errors';

/** Dobles: ni cookies reales, ni navegación real, ni backend real. */
const cookieValue = vi.fn<() => string | undefined>();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const verifyAdminSession = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && cookieValue() !== undefined
        ? { name, value: cookieValue() }
        : undefined,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}));

vi.mock('@/lib/api/backend-client', () => ({
  verifyAdminSession: (...args: unknown[]) => verifyAdminSession(...args),
}));

const PanelPage = (await import('./page')).default;

beforeEach(() => {
  cookieValue.mockReturnValue(undefined);
  redirect.mockClear();
  verifyAdminSession.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function render() {
  return PanelPage().catch((error: unknown) => error);
}

describe('sin sesión', () => {
  it('redirige a /iniciar-sesion cuando falta la cookie', async () => {
    await render();

    expect(redirect).toHaveBeenCalledWith('/iniciar-sesion');
    expect(verifyAdminSession).not.toHaveBeenCalled();
  });

  it('redirige cuando la cookie está vacía', async () => {
    cookieValue.mockReturnValue('');

    await render();

    expect(redirect).toHaveBeenCalledWith('/iniciar-sesion');
    expect(verifyAdminSession).not.toHaveBeenCalled();
  });
});

describe('con cookie presente', () => {
  beforeEach(() => {
    cookieValue.mockReturnValue('material-opaco');
  });

  it('verifica la sesión contra el backend en cada visita', async () => {
    verifyAdminSession.mockResolvedValue({ uid: 'uid-de-prueba', role: 'super_admin' });

    await render();

    expect(verifyAdminSession).toHaveBeenCalledWith('material-opaco');
  });

  it.each(['backend_unauthorized', 'backend_forbidden'] as const)(
    'ante %s no redirige: delega en la frontera cliente que limpia la cookie',
    async (failure) => {
      verifyAdminSession.mockRejectedValue(new BackendFailure(failure));

      const result = await render();

      // Redirigir aquí dejaría la cookie muerta en el navegador. La limpieza es una mutación y
      // tiene que pasar por el `DELETE` del BFF.
      expect(redirect).not.toHaveBeenCalled();
      expect(result).toHaveProperty('type', SessionCleanup);
    },
  );

  it('el Server Component no muta: no escribe ni borra cookies', async () => {
    verifyAdminSession.mockRejectedValue(new BackendFailure('backend_unauthorized'));

    // El doble de `cookies()` solo expone `get`: si la página intentara `set` o `delete`,
    // fallaría con TypeError en lugar de devolver un elemento.
    await expect(render()).resolves.toHaveProperty('type', SessionCleanup);
  });

  it.each(['backend_unavailable', 'backend_surface_disabled'] as const)(
    'muestra un estado controlado ante %s, sin expulsar a la persona',
    async (failure) => {
      verifyAdminSession.mockRejectedValue(new BackendFailure(failure));

      const result = await render();

      expect(redirect).not.toHaveBeenCalled();
      // Devuelve un elemento renderizable en lugar de propagar el fallo.
      expect(result).toHaveProperty('type');
    },
  );

  it('renderiza el rol sin exponer el UID ni el material de sesión', async () => {
    verifyAdminSession.mockResolvedValue({ uid: 'uid-de-prueba', role: 'super_admin' });

    const serialized = JSON.stringify(await render());

    expect(serialized).toContain('Administración total');
    expect(serialized).not.toContain('uid-de-prueba');
    expect(serialized).not.toContain('material-opaco');
    expect(serialized).not.toContain('@');
  });
});
