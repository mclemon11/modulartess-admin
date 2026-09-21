import Link from 'next/link';

import styles from './catalog.module.css';
import { formatDateTime } from './format';
import { formatCop } from './money';
import { ProductThumb } from './product-thumb';
import { ReadinessPill, StockCell } from './products-table';
import { StatusBadge } from './status-badge';

import type { AdminProduct } from '@/lib/api/catalog';

/**
 * El producto como tarjeta, para cuando la tabla deja de caber.
 *
 * Lleva **los mismos datos** que la fila —imagen, nombre, SKU, categoría, precio, inventario,
 * estado y acción—, no un resumen. Comprimir la tabla hasta que las columnas se solapen es la
 * alternativa que la referencia móvil descarta, y con razón: en un panel administrativo lo que se
 * pierde al encoger es justo lo que hace falta para decidir.
 */
export function ProductMobileCard({
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
          <span>
            Inventario: <StockCell product={product} />
          </span>
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
