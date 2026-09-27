import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { ADMIN_ROLES, can } from '@/features/session/permissions';
import { ROLE_EXPLANATIONS } from '@/features/users/user-labels';
import { UsersManager } from '@/features/users/users-manager';
import users from '@/features/users/users.module.css';
import { describeUserFailure } from '@/features/users/users-errors';
import { listAdminUsers } from '@/lib/api/admin-users';
import { isBackendFailure } from '@/lib/api/errors';
import { sessionErrorFromBackendFailure } from '@/features/session/api-errors';

export const dynamic = 'force-dynamic';

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const TRAIL = [{ href: '/panel', label: 'Panel' }, { label: 'Usuarios' }];

/**
 * Cuentas administrativas del panel.
 *
 * Solo se ven las cuentas registradas como administrativas —nunca los compradores ni otras
 * identidades del proyecto— y, de ellas, las de los roles que quien mira puede administrar: el
 * backend filtra antes de paginar. El permiso se vuelve a comprobar aquí aunque la navegación ya
 * lo oculte: ocultar un enlace no impide escribir la URL.
 */
export default async function UsersPage({ searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') {
    return null;
  }

  const { role, sessionMaterial, uid } = session.session;

  if (!can(role, 'admin_users.read')) {
    return (
      <>
        <PanelHeader trail={TRAIL} />
        <div className={styles.page}>
          <PanelPageHeader title="Usuarios" />
          <ErrorState
            message="Tu rol no administra cuentas del panel."
            title="Sin acceso a usuarios"
          />
        </div>
      </>
    );
  }

  const params = await searchParams;
  const pageToken = firstValue(params.pageToken);

  let page;

  try {
    page = await listAdminUsers(sessionMaterial, pageToken === undefined ? {} : { pageToken });
  } catch (error) {
    const message = isBackendFailure(error)
      ? describeUserFailure(sessionErrorFromBackendFailure(error.code))
      : 'No pudimos cargar las cuentas.';

    return (
      <>
        <PanelHeader trail={TRAIL} />
        <div className={styles.page}>
          <PanelPageHeader title="Usuarios" />
          <ErrorState
            action={
              <Link className={styles.buttonSecondary} href="/panel/usuarios">
                Reintentar
              </Link>
            }
            message={message}
            title="No pudimos cargar las cuentas"
          />
        </div>
      </>
    );
  }

  // La fila propia se decide aquí, con el UID verificado de la sesión, que no sale del servidor.
  const rows = page.items.map((item) => ({ ...item, isSelf: item.id === uid }));

  return (
    <>
      <PanelHeader trail={TRAIL} />
      <div className={styles.page}>
        <PanelPageHeader
          actions={<RefreshButton />}
          lead={
            role === 'super_admin'
              ? 'Todas las cuentas del panel. Nadie puede deshabilitarse ni cambiarse el rol a sí mismo, y siempre queda al menos un super administrador activo.'
              : 'Las cuentas de moderador, que son las que tu rol administra.'
          }
          title="Usuarios"
        />

        <section aria-labelledby="usuarios-roles" className={styles.card}>
          <div className={styles.cardPad}>
            <h2 className={styles.sectionTitle} id="usuarios-roles">
              Qué puede hacer cada rol
            </h2>
            <ul className={users.roles}>
              {ADMIN_ROLES.map((option) => (
                <li className={users.roleCard} key={option}>
                  <p className={users.roleName}>{ROLE_EXPLANATIONS[option].name}</p>
                  <p className={users.roleSummary}>{ROLE_EXPLANATIONS[option].summary}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <UsersManager initial={rows} key={pageToken ?? 'first'} viewerRole={role} />

        <div className={styles.pagination}>
          <p className={styles.paginationNote}>
            Mostrando {rows.length} cuenta{rows.length === 1 ? '' : 's'}.
          </p>
          {page.nextPageToken === null ? (
            <p className={styles.paginationNote}>No hay más páginas.</p>
          ) : (
            <Link
              className={styles.buttonSecondary}
              href={`/panel/usuarios?pageToken=${encodeURIComponent(page.nextPageToken)}`}
            >
              Ver más cuentas
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
