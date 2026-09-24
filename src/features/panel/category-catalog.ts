import 'server-only';

/**
 * El catálogo de categorías tal como lo necesitan las pantallas de producto. **Solo servidor.**
 *
 * Se lee **entero** —los dos estados— porque el selector necesita las activas para ofrecerlas y las
 * archivadas para reconocer la que ya tiene un producto histórico. Si la lectura falla, la pantalla
 * no se cae: se dice que el catálogo no está disponible y la categoría actual se conserva.
 */

import {
  CATEGORY_MAX_PAGES,
  CATEGORY_PAGE_SIZE_MAX,
  listAllCategories,
} from '@/lib/api/categories';

import type { CategoryOption } from './category-selection';

export type CategoryCatalogView = {
  readonly options: readonly CategoryOption[];
  /** Por qué el catálogo no está completo. `null` si está entero. */
  readonly problem: string | null;
};

export async function loadCategoryCatalog(sessionMaterial: string): Promise<CategoryCatalogView> {
  try {
    const catalog = await listAllCategories(sessionMaterial);

    return {
      options: catalog.items.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        status: item.status,
      })),
      problem: catalog.truncated
        ? `El catálogo tiene más de ${CATEGORY_MAX_PAGES * CATEGORY_PAGE_SIZE_MAX} categorías y solo se leyeron las primeras: si no encuentras una, búscala en Categorías.`
        : null,
    };
  } catch {
    return {
      options: [],
      problem:
        'No pudimos leer el catálogo de categorías. Puedes guardar sin cambiar la categoría y elegirla más tarde.',
    };
  }
}
