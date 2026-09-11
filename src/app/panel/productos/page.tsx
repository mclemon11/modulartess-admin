import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { describeBackendFailure } from '@/features/panel/catalog-errors';
import { formatCop, formatDateTime } from '@/features/panel/format';
import { PanelHeader } from '@/features/panel/panel-header';
import { ProductThumb } from '@/features/panel/product-thumb';
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
 * Listado de productos con datos reales del backend.
 *
 * Sigue las referencias de escritorio y móvil en lo que el contrato permite: tabla con miniatura
 * en escritorio, tarjetas apiladas en móvil, badges de estado y precio en COP.
 *
 * Lo que las referencias muestran y **no** está aquí, porque OpenAPI todavía no lo publica:
 * buscador, filtros por categoría/colección/stock/fecha/visibilidad, contadores por estado
 * (`Publicados 128`, `Borradores 16`…), columna de categoría, columna de visibilidad, exportación,
 * selección múltiple, «Filtros rápidos», «Resumen del catálogo» y «Acciones sugeridas». Ninguna de
 * esas cifras se puede calcular con `GET /v1/admin/products`, y fabricarlas sería aparentar
 * funcionalidad.
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

  const createLink = canCreate ? (
    <Link className={styles.button} href="/panel/productos/nuevo">
      Nuevo producto
    </Link>
  ) : undefined;

  return (
    <>
      <PanelHeader actions={createLink} trail={trail} />
      <div className={styles.cardPad}>
        <div className={styles.pageHead}>
          <div>
            <h1 className={styles.pageTitle}>Productos</h1>
            <p className={styles.pageLead}>
              Gestiona los productos publicados, borradores y archivados de tu tienda.
            </p>
          </div>
        </div>

        {page.items.length === 0 ? (
          <EmptyState canCreate={canCreate} />
        ) : (
          <section className={styles.card}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className="sr-only">Productos del catálogo administrativo</caption>
                <thead>
                  <tr>
                    <th className={styles.thumbCell} scope="col">
                      Imagen
                    </th>
                    <th scope="col">Producto</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Precio</th>
                    <th scope="col">Stock</th>
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

            <ul className={styles.cardList}>
              {page.items.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} />
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

function stockClass(product: AdminProduct): string | undefined {
  return product.stockQuantity <= product.lowStockThreshold ? styles.lowStock : undefined;
}

function ProductRow({ product }: { readonly product: AdminProduct }) {
  return (
    <tr>
      <td className={styles.thumbCell}>
        <ProductThumb product={product} />
      </td>
      <td>
        <span className={styles.productCell}>
          <Link className={styles.productName} href={`/panel/productos/${product.id}`}>
            {product.name}
          </Link>
          <span className={styles.productSlug}>{product.shortDescription || product.slug}</span>
        </span>
      </td>
      <td className={styles.mono}>{product.sku}</td>
      <td className={styles.numeric}>{formatCop(product.priceCop)}</td>
      <td className={styles.numeric}>
        <span className={stockClass(product)}>{product.stockQuantity}</span>
      </td>
      <td>
        <StatusBadge status={product.status} />
      </td>
      <td className={styles.mono}>{formatDateTime(product.updatedAt)}</td>
    </tr>
  );
}

/** Tarjeta de móvil: misma información, jerarquía distinta, como en la referencia. */
function ProductCard({ product }: { readonly product: AdminProduct }) {
  return (
    <article className={styles.productCard}>
      <ProductThumb product={product} variant="card" />
      <div className={styles.productCardBody}>
        <h2 className={styles.productCardTitle}>
          <Link href={`/panel/productos/${product.id}`}>{product.name}</Link>
        </h2>
        <p className={styles.productCardMeta}>
          <span className={styles.mono}>SKU: {product.sku}</span>
          <span className={stockClass(product)}>Stock: {product.stockQuantity}</span>
        </p>
        <p className={styles.productCardPrice}>{formatCop(product.priceCop)}</p>
        <p className={styles.productCardMeta}>Actualizado {formatDateTime(product.updatedAt)}</p>
        <div className={styles.productCardFooter}>
          <StatusBadge status={product.status} />
          <Link className={styles.buttonSecondary} href={`/panel/productos/${product.id}`}>
            Ver producto
          </Link>
        </div>
      </div>
    </article>
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
            Nuevo producto
          </Link>
        ) : (
          <p className={styles.emptyText}>Tu rol no permite crear productos.</p>
        )}
      </div>
    </section>
  );
}
