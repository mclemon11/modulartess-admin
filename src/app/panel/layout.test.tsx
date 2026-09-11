import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE_NAME } from '@/features/session/session-cookie';
import { SessionCleanup } from '@/features/session/session-cleanup';
import { BackendFailure } from '@/lib/api/errors';

/**
 * La frontera del panel vive ahora en el layout: es el único sitio que verifica la sesión por
 * navegación, y las páginas cuelgan de él. Esta prueba se movió aquí desde `page.test.tsx` cuando
 * apareció el shell.
 */

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
  usePathname: () => '/panel',
}));

vi.mock('@/lib/api/backend-client', () => ({
  verifyAdminSession: (...args: unknown[]) => verifyAdminSession(...args),
}));

const PanelLayout = (await import('./layout')).default;
const { PanelUnavailable } = await import('./panel-unavailable');

beforeEach(() => {
  cookieValue.mockReturnValue(undefined);
  redirect.mockClear();
  verifyAdminSession.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function render() {
  return PanelLayout({ children: null }).catch((error: unknown) => error);
}

describe('sin sesión', () => {
  it('redirige a /iniciar-sesion cuando falta la cookie', async () => {
    await render();

    expect(redirect).toHaveBeenCalledWith('/iniciar-sesion');
    expect(verifyAdminSession).not.toHaveBeenCalled();
  });
});

describe('con cookie presente', () => {
  beforeEach(() => {
    cookieValue.mockReturnValue('material-opaco');
  });

  it('verifica la sesión contra el backend en cada navegación', async () => {
    verifyAdminSession.mockResolvedValue({ uid: 'uid-de-prueba', role: 'super_admin' });

    await render();

    expect(verifyAdminSession).toHaveBeenCalledWith('material-opaco');
  });

  it.each(['backend_unauthorized', 'backend_forbidden'] as const)(
    'ante %s delega en la frontera cliente que limpia la cookie',
    async (failure) => {
      verifyAdminSession.mockRejectedValue(new BackendFailure(failure));

      const result = await render();

      expect(redirect).not.toHaveBeenCalled();
      expect(result).toHaveProperty('type', SessionCleanup);
    },
  );

  it.each(['backend_unavailable', 'backend_surface_disabled'] as const)(
    'ante %s muestra un estado controlado sin expulsar a nadie',
    async (failure) => {
      verifyAdminSession.mockRejectedValue(new BackendFailure(failure));

      const result = await render();

      expect(redirect).not.toHaveBeenCalled();
      expect(result).toHaveProperty('type', PanelUnavailable);
    },
  );

  it('no expone el UID ni el material de sesión al árbol renderizado', async () => {
    verifyAdminSession.mockResolvedValue({ uid: 'uid-de-prueba', role: 'moderator' });

    const serialized = JSON.stringify(await render());

    expect(serialized).toContain('moderator');
    expect(serialized).not.toContain('uid-de-prueba');
    expect(serialized).not.toContain('material-opaco');
  });
});
