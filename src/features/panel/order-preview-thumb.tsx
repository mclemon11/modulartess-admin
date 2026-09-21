import styles from './orders.module.css';

import type { AdminOrderSummary } from '@/lib/api/orders';

/**
 * Miniatura del primer producto del pedido.
 *
 * Sale de la **instantánea** del pedido (`previewLine.primaryImageUrl`), no del catálogo: si el
 * producto cambió de foto después de la compra, el pedido sigue enseñando lo que se vendió.
 * Reconstruirla desde el catálogo reescribiría la historia, y además obligaría a pedir cada
 * producto para pintar una lista.
 *
 * Cuando la línea no tenía imagen, el hueco lo dice en vez de disimularlo con un marcador.
 */
export function OrderPreviewThumb({
  line,
  variant = 'row',
}: {
  readonly line: AdminOrderSummary['previewLine'];
  readonly variant?: 'row' | 'card';
}) {
  const imageClass = variant === 'card' ? styles.previewThumbCard : styles.previewThumb;
  const emptyClass = variant === 'card' ? styles.previewThumbCardEmpty : styles.previewThumbEmpty;

  if (line.primaryImageUrl === null) {
    return (
      <span aria-label="Sin imagen" className={emptyClass} role="img">
        Sin imagen
      </span>
    );
  }

  // Imagen pública del bucket: se sirve tal cual, como en el resto del panel. El host es el del
  // bucket y el panel no configura dominios remotos para `next/image`.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" className={imageClass} loading="lazy" src={line.primaryImageUrl} />;
}
