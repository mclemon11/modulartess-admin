import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { describeBackendFailure } from '@/features/panel/catalog-errors';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { EmptyState, ErrorState } from '@/features/panel/panel-states';
import { ProductMobileCard } from '@/features/panel/product-mobile-card';
import { ProductsTable } from '@/features/panel/products-table';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';
import { listProducts } from '@/lib/api/catalog';
import { isBackendFailure } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Listado de productos con datos reales del backend.
 *
 * Sigue las referencias en lo que el contrato permite: tabla con miniatura en escritorio, tarjetas
 * apiladas en móvil, badges de estado, categoría, precio en pesos y, en los borradores, la
 * preparación para publicar que evalúa el backend.
 *
 * Lo que las referencias muestran y **no** está aquí, porque OpenAPI no lo publica: las cuatro
 * tarjetas de métricas con su variación mensual —`Publicados 128`, `Borradores 16`…—, el buscador,
 * los chips por estado con sus conteos, los seis selectores de filtro, la columna de visibilidad,
 * la exportación, la selección múltiple y la columna derecha con «Filtros rápidos», «Resumen del
 * catálogo» y «Acciones sugeridas». `GET /v1/admin/products` solo admite `pageToken` y `pageSize`:
 * un contador calculado con la página cargada mentiría sobre el catálogo entero, y un buscador que
 * filtrara esa misma página se presentaría como búsqueda global sin serlo.
 *
 * Sin métricas, el listado empieza donde empieza el contenido y ocupa todo el ancho, que es lo que
 * el catálogo necesita.
 *
 * La paginación tampoco puede ser numérica: el contrato devuelve un `pageToken` opaco, que permite
 * avanzar pero no saltar a una página concreta ni saber cuántas hay.
 */
export default async function ProductsPage({ searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') {
    return null;
  }

  const params = await searchParams;
  const pageToken = firstValue(params.pageToken);
  const canCreate = can(session.session.role, 'products.create');
  const canEdit = can(session.session.role, 'products.update');
  const trail = [{ href: '/panel', label: 'Panel' }, { label: 'Productos' }];

  let page;

  try {
    page = await listProducts(
      session.session.sessionMaterial,
      pageToken === undefined ? {} : { pageToken },
    );
  } catch (error) {
    const message = isBackendFailure(error)
      ? describeBackendFailure(error.code)
      : 'No pudimos cargar el catálogo.';

    return (
      <>
        <PanelHeader trail={trail} />
        <div className={styles.page}>
          <PanelPageHeader title="Productos" />
          <ErrorState
            action={
              <Link className={styles.buttonSecondary} href="/panel/productos">
                Reintentar
              </Link>
            }
            message={message}
            title="No pudimos cargar el catálogo"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader trail={trail} />
      <div className={styles.page}>
        <PanelPageHeader
          actions={
            <>
              <RefreshButton />
              {canCreate ? (
                <Link className={styles.buttonPrimary} href="/panel/productos/nuevo">
                  <span aria-hidden="true">+</span> Nuevo producto
                </Link>
              ) : null}
            </>
          }
          lead="Publicados, borradores y archivados de tu tienda, ordenados por última actualización. En los borradores se indica lo que el backend pide para poder publicarlos."
          title="Productos"
        />

        {page.items.length === 0 ? (
          <CatalogEmpty canCreate={canCreate} />
        ) : (
          <section className={styles.listSurface}>
            <ProductsTable canEdit={canEdit} products={page.items} />

            <ul className={styles.cardList}>
              {page.items.map((product) => (
                <li key={product.id}>
                  <ProductMobileCard canEdit={canEdit} product={product} />
                </li>
              ))}
            </ul>

            <div className={styles.pagination}>
              <p className={styles.paginationNote}>
                Mostrando {page.items.length} producto{page.items.length === 1 ? '' : 's'}.
              </p>
              {page.nextPageToken === null ? (
                <p className={styles.paginationNote}>No hay más páginas.</p>
              ) : (
                <Link
                  className={styles.buttonSecondary}
                  href={`/panel/productos?pageToken=${encodeURIComponent(page.nextPageToken)}`}
                >
                  Cargar más productos
                </Link>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function CatalogEmpty({ canCreate }: { readonly canCreate: boolean }) {
  return (
    <EmptyState
      action={
        canCreate ? (
          <Link className={styles.buttonPrimary} href="/panel/productos/nuevo">
            <span aria-hidden="true">+</span> Nuevo producto
          </Link>
        ) : (
          <p className={styles.hint}>Tu rol no permite crear productos.</p>
        )
      }
      icon="productos"
      title="Todavía no hay productos"
    >
      El catálogo está vacío. Un producto nuevo nace como borrador y no es visible en la tienda
      hasta que se publica.
    </EmptyState>
  );
}
