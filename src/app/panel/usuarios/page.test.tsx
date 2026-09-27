import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La página de cuentas vuelve a comprobar el permiso aunque la navegación ya oculte la entrada, y
 * decide en el servidor qué fila es la propia sin mandar el UID de la sesión al cliente.
 */

const session = { role: 'super_admin', uid: 'adm_self' };
const listAdminUsers = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {}, push() {} }),
  usePathname: () => '/panel/usuarios',
}));
vi.mock('@/features/panel/session-context', () => ({
  resolvePanelSession: async () => ({
    kind: 'active',
    session: { sessionMaterial: 'material-opaco', role: session.role, uid: session.uid },
  }),
}));
vi.mock('@/lib/api/admin-users', () => ({
  listAdminUsers: (...args: unknown[]) => listAdminUsers(...args),
}));

const { default: UsersPage } = await import('./page');

const account = (id: string, role: string) => ({
  id,
  email: `${id}@example.invalid`,
  displayName: id,
  role,
  status: 'active',
  version: 1,
  createdAt: '2026-09-27T12:00:00.000Z',
  activatedAt: '2026-09-27T12:00:00.000Z',
  lastSessionAt: null,
  invitation: { state: 'sent', sendCount: 1, lastAttemptAt: null },
  identitySync: 'synced',
});

async function render(): Promise<string> {
  const element = await UsersPage({ searchParams: Promise.resolve({}) });

  return renderToStaticMarkup(element);
}

beforeEach(() => {
  listAdminUsers.mockReset();
  listAdminUsers.mockResolvedValue({
    items: [account('adm_self', 'super_admin'), account('adm_mod', 'moderator')],
    nextPageToken: null,
  });
});

describe('/panel/usuarios', () => {
  it('moderator no ve la administración de cuentas y no se consulta el backend', async () => {
    session.role = 'moderator';

    const html = await render();

    expect(html).toContain('Tu rol no administra cuentas del panel.');
    expect(html).not.toContain('Invitar usuario');
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it('super_admin ve las cuentas, la explicación de roles y su propia fila marcada', async () => {
    session.role = 'super_admin';

    const html = await render();

    expect(listAdminUsers).toHaveBeenCalledWith('material-opaco', {});
    expect(html).toContain('Qué puede hacer cada rol');
    expect(html).toContain('Tu cuenta');
    // El UID de la sesión solo sale como identificador de su propia fila, que el contrato publica.
    expect(html).not.toContain('material-opaco');
  });

  it('master_admin ve la pantalla con la explicación de su alcance', async () => {
    session.role = 'master_admin';

    const html = await render();

    expect(html).toContain('Las cuentas de moderador, que son las que tu rol administra.');
  });
});
