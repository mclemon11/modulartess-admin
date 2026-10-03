import Link from 'next/link';

import styles from './catalog.module.css';
import { formatDateTime } from './format';
import { listingInventory } from './inventory-summary';
import { formatCop } from './money';
import { ProductThumb } from './product-thumb';
import { describeReadiness } from './publication-readiness';
import { StatusBadge } from './status-badge';

import { SelectAllBox, SelectProductBox } from '@/features/shipping/bulk-shipping';
import type { AdminProduct } from '@/lib/api/catalog';
import { RemoveFromCatalogButton } from './remove-from-catalog';

/**
 * Tabla del catálogo en escritorio.
 *
 * Las nueve columnas son exactamente las que publica `AdminProductDto`. La referencia enseña
 * además «Visibilidad», que no está en el contrato. La casilla de selección por fila solo aparece
 * con `selectable`: existe una acción masiva real —asignar o retirar de zonas de envío— y solo
 * para quien tiene `shipping.manage`.
 *
 * La tabla desborda dentro de su tarjeta —nunca la página—, y por eso vive envuelta en
 * `.tableScroll`.
 */
export function ProductsTable({
  products,
  canEdit,
  canArchive = false,
  selectable = false,
}: {
  readonly products: readonly AdminProduct[];
  readonly canEdit: boolean;
  /** `products.archive`: muestra «Eliminar del catálogo» en las filas que no están archivadas. */
  readonly canArchive?: boolean;
  /** `shipping.manage`: casilla por fila para asignar a zonas de envío en bloque. */
  readonly selectable?: boolean;
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className="sr-only">Productos del catálogo administrativo</caption>
        <thead>
          <tr>
            {selectable ? (
              <th scope="col">
                <SelectAllBox
                  products={products.map((product) => ({ id: product.id, name: product.name }))}
                />
              </th>
            ) : null}
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
          {products.map((product) => (
            <ProductRow
              canArchive={canArchive}
              canEdit={canEdit}
              key={product.id}
              product={product}
              selectable={selectable}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Preparación para publicar de un borrador.
 *
 * Solo se pinta en `draft`: en un producto publicado o archivado la evaluación no le dice nada a
 * nadie. El texto sale de `publicationReadiness`, que calcula el backend; aquí no se deriva
 * ninguna regla.
 */
export function ReadinessPill({ product }: { readonly product: AdminProduct }) {
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

/**
 * Inventario de la fila.
 *
 * Lo que se dice aquí sale de `listingInventory`, que decide entre el inventario base y el resumen
 * de las variantes activas. La celda no calcula nada: la disponibilidad efectiva la deriva el
 * backend y aquí solo se traduce a palabras.
 *
 * El color nunca va solo. «Sin existencias» y «Stock bajo» están escritos, así que quien no
 * distingue el rojo del resto lee lo mismo.
 */
export function StockCell({ product }: { readonly product: AdminProduct }) {
  const { tone, label } = listingInventory(product);

  if (tone === 'outOfStock') {
    return <span className={styles.outOfStock}>{label}</span>;
  }

  return <span className={tone === 'lowStock' ? styles.lowStock : undefined}>{label}</span>;
}

function ProductRow({
  product,
  canEdit,
  canArchive,
  selectable,
}: {
  readonly product: AdminProduct;
  readonly canEdit: boolean;
  readonly canArchive: boolean;
  readonly selectable: boolean;
}) {
  return (
    <tr>
      {selectable ? (
        <td>
          <SelectProductBox product={{ id: product.id, name: product.name }} />
        </td>
      ) : null}
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
      {/* No es `.numeric`: desde que existen los dos modos, esta celda puede llevar una frase
          —«Inventario mixto · 2 con cantidad · 2 por disponibilidad»— y no un número. Alinearla a
          la derecha y prohibirle el salto de línea reventaba el ancho de la tabla. */}
      <td className={styles.inventoryCell}>
        <StockCell product={product} />
      </td>
      <td>
        <span className={styles.statusCell}>
          <StatusBadge status={product.status} />
          <ReadinessPill product={product} />
        </span>
      </td>
      <td className={styles.timestamp}>{formatDateTime(product.updatedAt)}</td>
      <td className={styles.actionCell}>
        <span className={styles.rowActions}>
          <Link className={styles.rowAction} href={`/panel/productos/${product.id}`}>
            {canEdit ? 'Editar' : 'Ver'}
          </Link>
          {canArchive ? <RemoveFromCatalogButton product={product} /> : null}
        </span>
      </td>
    </tr>
  );
}
