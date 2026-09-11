import type { AdminProduct } from '@/lib/api/catalog';

import styles from './catalog.module.css';

/**
 * Miniatura del producto.
 *
 * Toma la imagen **principal activa**. Si no hay ninguna se dibuja un hueco explícito en lugar de
 * un marcador genérico: «sin imagen» es información real, y un placeholder decorativo lo
 * disimularía.
 *
 * `publicUrl` es una URL pública del bucket. Se usa `<img>` y no `next/image` porque optimizar
 * exigiría declarar el host remoto en la configuración, y el host depende del despliegue.
 */
export function primaryImage(product: AdminProduct) {
  return (
    product.images.find((image) => image.status === 'active' && image.isPrimary) ??
    product.images.find((image) => image.status === 'active')
  );
}

export function ProductThumb({
  product,
  variant = 'table',
}: {
  readonly product: AdminProduct;
  readonly variant?: 'table' | 'card';
}) {
  const image = primaryImage(product);
  const imageClass = variant === 'card' ? styles.productCardThumb : styles.thumb;
  const emptyClass = variant === 'card' ? styles.productCardThumbEmpty : styles.thumbEmpty;

  if (image === undefined) {
    return (
      <span aria-label="Sin imagen" className={emptyClass} role="img">
        Sin imagen
      </span>
    );
  }

  // Optimizar con `next/image` exigiría declarar el host remoto en `next.config`, y ese host
  // depende del despliegue. Se sirve la URL pública tal cual.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={image.altText} className={imageClass} loading="lazy" src={image.publicUrl} />
  );
}
