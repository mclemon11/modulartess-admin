import Link from 'next/link';
import { redirect } from 'next/navigation';

import styles from '@/features/panel/catalog.module.css';
import { describeBackendFailure } from '@/features/panel/catalog-errors';
import { CategoriesManager } from '@/features/panel/categories-manager';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';
import { listAllCategories } from '@/lib/api/categories';
import { isBackendFailure } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

const TRAIL = [
  { href: '/panel', label: 'Panel' },
  { href: '/panel/productos', label: 'Productos' },
  { label: 'Categorías' },
];

/**
 * Categorías del catálogo.
 *
 * Server Component: se lee el catálogo **entero**, en los dos estados, con la sesión de la persona.
 * El contrato no publica un buscador, así que buscar exige tenerlas todas; ver `category-list.ts`.
 */
export default async function CategoriesPage() {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') {
    return null;
  }

  const { role, sessionMaterial } = session.session;

  if (!can(role, 'products.read')) {
    redirect('/panel');
  }

  let catalog;

  try {
    catalog = await listAllCategories(sessionMaterial);
  } catch (error) {
    return (
      <>
        <PanelHeader trail={TRAIL} />
        <div className={styles.page}>
          <PanelPageHeader title="Categorías" />
          <ErrorState
            action={
              <Link className={styles.buttonSecondary} href="/panel/productos/categorias">
                Reintentar
              </Link>
            }
            message={
              isBackendFailure(error)
                ? describeBackendFailure(error.code)
                : 'No pudimos cargar las categorías.'
            }
            title="No pudimos cargar las categorías"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader trail={TRAIL} />
      <div className={styles.page}>
        <PanelPageHeader
          actions={
            <Link className={styles.buttonSecondary} href="/panel/productos">
              Volver a productos
            </Link>
          }
          lead="Las categorías que se asignan a los productos. Archivar una deja de ofrecerla para nuevas asignaciones sin tocar los productos que ya la tienen."
          title="Categorías"
        />
        <CategoriesManager
          initial={catalog.items}
          // Cada lectura del servidor —también tras un conflicto— parte de lo que respondió él.
          key={catalog.items.map((item) => `${item.id}:${item.version}`).join('|')}
          permissions={{
            canEdit: can(role, 'products.update'),
            canArchive: can(role, 'products.archive'),
          }}
          truncated={catalog.truncated}
        />
      </div>
    </>
  );
}
