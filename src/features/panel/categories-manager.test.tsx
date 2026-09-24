import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ProductCategory } from '@/lib/api/categories';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { CategoriesManager } = await import('./categories-manager');
const { describeProductCount, filterCategories, pageOf, replaceCategory } =
  await import('./category-list');

/**
 * La gestión del catálogo de categorías.
 *
 * Lo que no puede fallar: un contador `null` no se pinta como cero, archivar se confirma diciendo
 * qué pasa con los productos, cada mutación lleva la versión de la fila, y los permisos deciden
 * qué botones existen.
 */

function category(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return {
    id: 'cat_1',
    name: 'Tocadores',
    slug: 'tocadores',
    status: 'active',
    version: 3,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    assignedProducts: 12,
    activeProducts: 9,
    ...overrides,
  };
}

const ITEMS = [
  category(),
  category({
    id: 'cat_2',
    name: 'Clósets',
    slug: 'closets',
    assignedProducts: null,
    activeProducts: null,
  }),
  category({ id: 'cat_3', name: 'Escritorios', slug: 'escritorios', status: 'archived' }),
];

const ALL = { canEdit: true, canArchive: true } as const;

function render(
  permissions: { canEdit: boolean; canArchive: boolean } = ALL,
  items: readonly ProductCategory[] = ITEMS,
) {
  return renderToStaticMarkup(
    <CategoriesManager initial={items} permissions={permissions} truncated={false} />,
  );
}

const SOURCE = readFileSync('src/features/panel/categories-manager.tsx', 'utf8');

describe('listado', () => {
  it('filtra por estado, y «Activas» es el punto de partida', () => {
    expect(filterCategories(ITEMS, { query: '', status: 'active' }).map((item) => item.id)).toEqual(
      ['cat_1', 'cat_2'],
    );
    expect(
      filterCategories(ITEMS, { query: '', status: 'archived' }).map((item) => item.id),
    ).toEqual(['cat_3']);
    expect(filterCategories(ITEMS, { query: '', status: 'all' })).toHaveLength(3);
    expect(SOURCE).toContain("useState<CategoryStatusFilter>('active')");
  });

  it('busca por nombre o slug sin distinguir tildes', () => {
    expect(
      filterCategories(ITEMS, { query: 'closets', status: 'all' }).map((item) => item.id),
    ).toEqual(['cat_2']);
    expect(
      filterCategories(ITEMS, { query: 'CLÓSETS', status: 'all' }).map((item) => item.id),
    ).toEqual(['cat_2']);
  });

  it('pagina el conjunto completo y acota una página fuera de rango', () => {
    const many = Array.from({ length: 45 }, (_, index) => ({ id: String(index) }));

    expect(pageOf(many, 1)).toMatchObject({ page: 1, pageCount: 3, total: 45 });
    expect(pageOf(many, 3).items).toHaveLength(5);
    expect(pageOf(many, 9).page).toBe(3);
    expect(pageOf([], 1)).toMatchObject({ page: 1, pageCount: 1, total: 0 });
  });

  it('pinta nombre, slug, estado y contadores', () => {
    const html = render(ALL, [category()]);

    expect(html).toContain('Tocadores');
    expect(html).toContain('tocadores');
    expect(html).toContain('Activa');
    expect(html).toContain('<dd>12</dd>');
    expect(html).toContain('<dd>9</dd>');
  });

  /* `null` es «no se pudo calcular». Un cero inventado haría archivar creyendo que nadie la usa. */
  it('un contador null se dice «No disponible», nunca cero', () => {
    expect(describeProductCount(null)).toBe('No disponible');
    expect(describeProductCount(0)).toBe('0');

    const html = render(ALL, [ITEMS[1]!]);

    expect(html).toContain('<dd>No disponible</dd>');
    expect(html).not.toContain('<dd>0</dd>');
  });

  it('vacío se dice como vacío, no como error', () => {
    const html = render(ALL, []);

    expect(html).toContain('Todavía no hay categorías');
    expect(html).not.toContain('role="alert"');
  });

  it('sustituye la fila por la respuesta del backend, en su sitio', () => {
    const next = replaceCategory(ITEMS, category({ name: 'Tocadores y espejos', version: 4 }));

    expect(next.map((item) => item.id)).toEqual(['cat_1', 'cat_2', 'cat_3']);
    expect(next[0]).toMatchObject({ name: 'Tocadores y espejos', version: 4 });
  });
});

describe('permisos', () => {
  it('con todo, crea, renombra y archiva', () => {
    const html = render();

    expect(html).toContain('Nueva categoría');
    expect(html).toContain('Renombrar');
    expect(html).toContain('Archivar');
  });

  it('solo lectura: ni crear, ni renombrar, ni archivar', () => {
    const html = render({ canEdit: false, canArchive: false });

    expect(html).not.toContain('Nueva categoría');
    expect(html).not.toContain('>Renombrar<');
    expect(html).not.toContain('>Archivar<');
    expect(html).toContain('Tu rol puede consultar las categorías, pero no crearlas.');
  });

  it('products.update sin products.archive: renombra pero no archiva', () => {
    const html = render({ canEdit: true, canArchive: false });

    expect(html).toContain('>Renombrar<');
    expect(html).not.toContain('>Archivar<');
    expect(html).not.toContain('>Reactivar<');
  });

  it('la página los decide con la matriz de permisos, no con el rol', () => {
    const page = readFileSync('src/app/panel/productos/categorias/page.tsx', 'utf8');

    expect(page).toContain("canEdit: can(role, 'products.update')");
    expect(page).toContain("canArchive: can(role, 'products.archive')");
  });
});

describe('mutaciones con expectedVersion', () => {
  it('renombrar manda la versión de la fila', () => {
    expect(SOURCE).toContain(
      'renameCategory(target.id, { name, expectedVersion: target.version })',
    );
  });

  it('archivar y reactivar mandan la versión de la fila', () => {
    expect(SOURCE).toContain('transitionCategory(category.id, kind, category.version)');
  });

  it('un conflicto o una categoría que ya no existe releen la pantalla', () => {
    expect(SOURCE).toContain(
      "code === 'category_version_conflict' || code === 'category_not_found'",
    );
    expect(SOURCE).toContain('if (refreshes(result.code)) router.refresh()');
  });

  it('un candado síncrono excluye el doble clic', () => {
    const exclusive = SOURCE.slice(SOURCE.indexOf('async function exclusive'));

    expect(exclusive.indexOf('if (running.current) return null;')).toBeLessThan(
      exclusive.indexOf('await work()'),
    );
  });
});

describe('archivar se confirma', () => {
  it('explica que deja de ofrecerse y que no toca los productos históricos', () => {
    const html = render();

    expect(html).toContain('Dejará de aparecer para nuevas asignaciones');
    expect(html).toContain('<strong>No modifica</strong> los productos');
    expect(html).toContain('el slug no se libera');
  });

  it('el botón de la fila solo abre la confirmación; archivar sale del diálogo', () => {
    expect(SOURCE).toContain('onClick={() => openArchive(category)}');
    expect(SOURCE.match(/transition\(archiving, 'archive'\)/g)).toHaveLength(1);
  });

  it('el foco empieza en «Cancelar», la opción segura', () => {
    const dialog = SOURCE.slice(SOURCE.indexOf('ref={archiveDialog}'));

    expect(dialog.slice(0, dialog.indexOf('Cancelar'))).toContain('autoFocus');
  });
});

describe('slug inmutable', () => {
  it('se propone al crear y no se ofrece editarlo después', () => {
    expect(SOURCE).toContain('proposeCategorySlug(event.target.value)');
    // El renombrado solo tiene el campo del nombre.
    const rename = SOURCE.slice(SOURCE.indexOf('Renombrar categoría'));

    expect(rename.slice(0, rename.indexOf('</form>'))).not.toContain('setNewSlug');
    expect(rename).toContain('no cambia');
  });
});
