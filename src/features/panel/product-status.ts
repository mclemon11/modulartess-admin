/**
 * Presentación del estado del producto.
 *
 * Los tres valores vienen del contrato (`AdminProductDto.status`). Un estado que no esté en el
 * mapa se muestra tal cual en lugar de romperse: si el backend añade uno, la tabla sigue siendo
 * legible mientras el panel se pone al día.
 */

import type { ProductStatus } from '@/lib/api/catalog';

const LABELS: Readonly<Record<string, string>> = {
  draft: 'Borrador',
  active: 'Publicado',
  archived: 'Archivado',
};

export function describeStatus(status: string): string {
  return LABELS[status] ?? status;
}

/** Clase del badge, resuelta contra el módulo CSS que la pantalla pasa. */
export function statusVariant(status: string): 'draft' | 'active' | 'archived' | 'unknown' {
  switch (status as ProductStatus) {
    case 'draft':
      return 'draft';
    case 'active':
      return 'active';
    case 'archived':
      return 'archived';
    default:
      return 'unknown';
  }
}
