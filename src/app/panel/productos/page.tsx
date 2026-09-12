import Link from 'next/link';

import styles from '@/features/panel/catalog.module.css';
import { describeBackendFailure } from '@/features/panel/catalog-errors';
import { formatDateTime } from '@/features/panel/format';
import { formatCop } from '@/features/panel/money';
import { PanelHeader } from '@/features/panel/panel-header';
import { ProductThumb } from '@/features/panel/product-thumb';
import { describeReadiness } from '@/features/panel/publication-readiness';
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
 * Sigue las referencias de escritorio y móvil en lo que el contrato permite: tabla con miniatura en
 * escritorio, tarjetas apiladas en móvil, badges de estado, categoría, precio en pesos y, en los
 * borradores, la preparación para publicar que evalúa el backend.
 *
 * Lo que las referencias muestran y **no** está aquí, porque OpenAPI todavía no lo publica:
 * buscador, filtros por categoría/colección/stock/fecha/visibilidad, contadores por estado
 * (`Publicados 128`, `Borradores 16`…), columna de visibilidad, exportación, selección múltiple,
 * «Filtros rápidos», «Resumen del catálogo» y «Acciones sugeridas». `GET /v1/admin/products` solo
 * admite `pageToken` y `pageSize`: un buscador que filtrara la página ya cargada mentiría sobre el
 * catálogo entero, y los contadores globales no se pueden calcular.
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
      <PanelHeader trail={trail} />
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <div className={styles.pageHeadText}>
            <h1 className={styles.pageTitle}>Productos</h1>
            <p className={styles.pageLead}>
              Publicados, borradores y archivados, ordenados por última actualización. En los
              borradores se indica lo que el backend pide para poder publicarlos.
            </p>
          </div>
          {canCreate ? (
            <Link className={styles.buttonPrimary} href="/panel/productos/nuevo">
              <span aria-hidden="true">+</span> Nuevo producto
            </Link>
          ) : null}
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
                    <th scope="col">Categoría</th>
                    <th scope="col">Precio</th>
                    <th scope="col">Inventario</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Última actualización</th>
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((product) => (
                    <ProductRow canEdit={canEdit} key={product.id} product={product} />
                  ))}
                </tbody>
              </table>
            </div>

            <ul className={styles.cardList}>
              {page.items.map((product) => (
                <li key={product.id}>
                  <ProductCard canEdit={canEdit} product={product} />
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

/**
 * Preparación para publicar de un borrador.
 *
 * Solo se pinta en `draft`: en un producto publicado o archivado la evaluación no le dice nada a
 * nadie. El texto sale de `publicationReadiness`, que calcula el backend; aquí no se deriva ninguna
 * regla.
 */
function ReadinessPill({ product }: { readonly product: AdminProduct }) {
  if (product.status !== 'draft') {
    return null;
  }

  const { publicationReadiness: readiness } = product;

  return (
    <span className={readiness.ready ? styles.readyPill : styles.pendingPill}>
      {describeReadiness(readiness)}
    </span>
  );
}

function stockClass(product: AdminProduct): string | undefined {
  return product.stockQuantity <= product.lowStockThreshold ? styles.lowStock : undefined;
}

function ProductRow({
  product,
  canEdit,
}: {
  readonly product: AdminProduct;
  readonly canEdit: boolean;
}) {
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
      {/* La categoría solo se pinta si el backend la trae: los productos anteriores al catálogo
          enriquecido no la tienen, y «—» dice eso sin inventar una. */}
      <td>{product.category === null ? '—' : product.category.name}</td>
      <td className={styles.numeric}>{formatCop(product.priceCop)}</td>
      <td className={styles.numeric}>
        <span className={stockClass(product)}>{product.stockQuantity}</span>
      </td>
      <td>
        <span className={styles.statusCell}>
          <StatusBadge status={product.status} />
          <ReadinessPill product={product} />
        </span>
      </td>
      <td className={styles.timestamp}>{formatDateTime(product.updatedAt)}</td>
      <td className={styles.actionCell}>
        <Link className={styles.rowAction} href={`/panel/productos/${product.id}`}>
          {canEdit ? 'Editar' : 'Ver'}
        </Link>
      </td>
    </tr>
  );
}

/** Tarjeta de móvil: misma información que la tabla, con la jerarquía de la referencia. */
function ProductCard({
  product,
  canEdit,
}: {
  readonly product: AdminProduct;
  readonly canEdit: boolean;
}) {
  return (
    <article className={styles.productCard}>
      <ProductThumb product={product} variant="card" />
      <div className={styles.productCardBody}>
        <h2 className={styles.productCardTitle}>
          <Link href={`/panel/productos/${product.id}`}>{product.name}</Link>
        </h2>
        <p className={styles.productCardSku}>SKU: {product.sku}</p>
        {product.category === null ? null : (
          <p className={styles.productCardMeta}>{product.category.name}</p>
        )}
        <p className={styles.productCardPrice}>{formatCop(product.priceCop)}</p>
        <div className={styles.productCardStatus}>
          <StatusBadge status={product.status} />
          <ReadinessPill product={product} />
        </div>
        <p className={styles.productCardMeta}>
          <span className={stockClass(product)}>Inventario: {product.stockQuantity}</span>
          <span>Actualizado {formatDateTime(product.updatedAt)}</span>
        </p>
        <div className={styles.productCardFooter}>
          <Link className={styles.rowAction} href={`/panel/productos/${product.id}`}>
            {canEdit ? 'Editar' : 'Ver producto'} <span aria-hidden="true">→</span>
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
