import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { describeBackendFailure } from '@/features/panel/catalog-errors';
import { formatCop, formatDateTime } from '@/features/panel/format';
import { PanelHeader } from '@/features/panel/panel-header';
import { resolvePanelSession } from '@/features/panel/session-context';
import { StatusBadge } from '@/features/panel/status-badge';
import { can } from '@/features/session/permissions';
import { listProducts, type AdminProduct } from '@/lib/api/catalog';
import { isBackendFailure } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Listado de productos, renderizado en el servidor con datos reales del backend.
 *
 * Sin búsqueda, filtros, categorías ni imágenes: el contrato no ofrece ninguna de esas cosas
 * todavía, y un control que no filtra nada es peor que su ausencia. La paginación usa el
 * `pageToken` opaco que devuelve el backend.
 */
export default async function ProductsPage({ searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') {
    // El layout ya resolvió estos casos; aquí solo se evita seguir sin sesión.
    return null;
  }

  const params = await searchParams;
  const pageToken = firstValue(params.pageToken);
  const canCreate = can(session.session.role, 'products.create');

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
        <PanelHeader trail={[{ href: '/panel', label: 'Panel' }, { label: 'Productos' }]} />
        <div className={styles.cardPad}>
          <h1 className={styles.pageTitle}>Productos</h1>
          <p className={styles.error} role="alert">
            {message}
          </p>
          <Link className={styles.buttonSecondary} href="/panel/productos">
            Reintentar
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader
        actions={
          canCreate ? (
            <Link className={styles.button} href="/panel/productos/nuevo">
              Crear producto
            </Link>
          ) : undefined
        }
        trail={[{ href: '/panel', label: 'Panel' }, { label: 'Productos' }]}
      />
      <div className={styles.cardPad}>
        <h1 className={styles.pageTitle}>Productos</h1>
        <p className={styles.pageLead}>
          Catálogo administrativo, ordenado por última actualización. Los precios están en pesos
          colombianos enteros, como los publica el backend.
        </p>

        {page.items.length === 0 ? (
          <EmptyState canCreate={canCreate} />
        ) : (
          <section className={styles.card}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className="sr-only">Productos del catálogo administrativo</caption>
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Precio</th>
                    <th scope="col">Inventario</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Última actualización</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((product) => (
                    <ProductRow key={product.id} product={product} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <p className={styles.paginationNote}>
                {page.items.length} producto{page.items.length === 1 ? '' : 's'} en esta página.
              </p>
              {page.nextPageToken === null ? (
                <p className={styles.paginationNote}>No hay más páginas.</p>
              ) : (
                <Link
                  className={styles.buttonSecondary}
                  href={`/panel/productos?pageToken=${encodeURIComponent(page.nextPageToken)}`}
                >
                  Página siguiente
                </Link>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function ProductRow({ product }: { readonly product: AdminProduct }) {
  const low = product.stockQuantity <= product.lowStockThreshold;

  return (
    <tr>
      <td>
        <span className={styles.productCell}>
          <Link className={styles.productName} href={`/panel/productos/${product.id}`}>
            {product.name}
          </Link>
          <span className={styles.productSlug}>{product.slug}</span>
        </span>
      </td>
      <td className={styles.mono}>{product.sku}</td>
      <td className={styles.numeric}>{formatCop(product.priceCop)}</td>
      <td className={styles.numeric}>
        <span className={low ? styles.lowStock : undefined}>{product.stockQuantity}</span>
      </td>
      <td>
        <StatusBadge status={product.status} />
      </td>
      <td className={styles.mono}>{formatDateTime(product.updatedAt)}</td>
    </tr>
  );
}

function EmptyState({ canCreate }: { readonly canCreate: boolean }) {
  return (
    <section className={styles.card}>
      <div className={styles.empty}>
        <h2 className={styles.emptyTitle}>Todavía no hay productos</h2>
        <p className={styles.emptyText}>
          El catálogo está vacío. Un producto nuevo nace como borrador y no es visible en la tienda
          hasta que se publica.
        </p>
        {canCreate ? (
          <Link className={styles.button} href="/panel/productos/nuevo">
            Crear producto
          </Link>
        ) : (
          <p className={styles.emptyText}>Tu rol no permite crear productos.</p>
        )}
      </div>
    </section>
  );
}
