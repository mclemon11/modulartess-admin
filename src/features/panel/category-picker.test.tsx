import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { categoryDraftProblems, proposeCategorySlug } from './category-input';
import { CategoryPicker, nextActiveIndex, pickerRows } from './category-picker';
import {
  categoryPatch,
  choiceFromProduct,
  currentCategoryStatus,
  selectableCategories,
  withCreatedCategory,
  type CategoryChoice,
  type CategoryOption,
} from './category-selection';

/**
 * El selector de categoría y lo que decide qué se envía.
 *
 * Tres reglas no pueden fallar: una archivada nunca se ofrece para una asignación nueva, la
 * categoría que ya tenía un producto histórico no se cambia sola, y lo que viaja sale de la
 * categoría elegida, no de un texto escrito.
 */

const CATALOG: readonly CategoryOption[] = [
  { id: 'cat_1', name: 'Clósets', slug: 'closets', status: 'active' },
  { id: 'cat_2', name: 'Escritorios antiguos', slug: 'escritorios-antiguos', status: 'archived' },
  { id: 'cat_3', name: 'Tocadores', slug: 'tocadores', status: 'active' },
];

function picker(
  choice: CategoryChoice,
  overrides: Partial<{ canCreate: boolean; error: string | null; problem: string | null }> = {},
) {
  return renderToStaticMarkup(
    <CategoryPicker
      canCreate={overrides.canCreate ?? true}
      catalog={CATALOG}
      catalogProblem={overrides.problem ?? null}
      choice={choice}
      disabled={false}
      error={overrides.error ?? null}
      onChange={() => undefined}
      onCreated={() => undefined}
    />,
  );
}

describe('qué se puede elegir', () => {
  it('solo las activas, nunca una archivada', () => {
    expect(selectableCategories(CATALOG, '').map((option) => option.id)).toEqual([
      'cat_1',
      'cat_3',
    ]);
    expect(selectableCategories(CATALOG, 'escritorios')).toEqual([]);
  });

  it('busca sin tildes ni mayúsculas, por nombre o por slug', () => {
    expect(selectableCategories(CATALOG, 'CLOSET').map((option) => option.id)).toEqual(['cat_1']);
    expect(selectableCategories(CATALOG, 'clós').map((option) => option.id)).toEqual(['cat_1']);
    expect(selectableCategories(CATALOG, 'tocad').map((option) => option.id)).toEqual(['cat_3']);
  });

  it('«Sin categoría» va siempre primero: el contrato admite null', () => {
    expect(pickerRows(CATALOG, '', true)[0]).toEqual({ kind: 'none' });
    expect(pickerRows(CATALOG, 'nada coincide', false)).toEqual([{ kind: 'none' }]);
  });

  it('«Crear categoría» aparece con algo escrito y solo con permiso', () => {
    expect(pickerRows(CATALOG, 'Espejos', true).at(-1)).toEqual({
      kind: 'create',
      name: 'Espejos',
    });
    expect(pickerRows(CATALOG, 'Espejos', false).some((row) => row.kind === 'create')).toBe(false);
    expect(pickerRows(CATALOG, '   ', true).some((row) => row.kind === 'create')).toBe(false);
  });
});

describe('teclado', () => {
  it('las flechas recorren dando la vuelta; Inicio y Fin van a los extremos', () => {
    expect(nextActiveIndex(-1, 'ArrowDown', 3)).toBe(0);
    expect(nextActiveIndex(2, 'ArrowDown', 3)).toBe(0);
    expect(nextActiveIndex(0, 'ArrowUp', 3)).toBe(2);
    expect(nextActiveIndex(-1, 'ArrowUp', 3)).toBe(2);
    expect(nextActiveIndex(1, 'Home', 3)).toBe(0);
    expect(nextActiveIndex(1, 'End', 3)).toBe(2);
    expect(nextActiveIndex(1, 'a', 3)).toBe(1);
    expect(nextActiveIndex(0, 'ArrowDown', 0)).toBe(-1);
  });

  it('es un combobox con su lista y sus atributos ARIA', () => {
    const html = picker({ kind: 'none' });

    expect(html).toMatch(/role="combobox"/);
    expect(html).toMatch(/aria-autocomplete="list"/);
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).toMatch(/aria-controls="[^"]+-list"/);
    expect(html).toMatch(/<label[^>]*for="[^"]+-search"/);
  });

  it('Intro elige y nunca envía el formulario del producto', () => {
    const source = readFileSync('src/features/panel/category-picker.tsx', 'utf8');
    const enter = source.slice(source.indexOf("if (event.key === 'Enter') {"));

    expect(enter.slice(0, 200)).toContain('event.preventDefault()');
    // El alta en línea tampoco: Intro crea la categoría, no el producto.
    expect(source).toContain('function onCreatorKeyDown');
    // Un formulario anidado dentro del del producto es HTML inválido. Los comentarios lo nombran.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    expect(code).not.toMatch(/<form[\s>]/);
  });
});

describe('la categoría de un producto histórico', () => {
  it('una archivada se enseña como «Archivada» y se conserva', () => {
    const choice = choiceFromProduct({
      name: 'Escritorios antiguos',
      slug: 'escritorios-antiguos',
    });

    expect(currentCategoryStatus({ name: 'x', slug: 'escritorios-antiguos' }, CATALOG)).toBe(
      'archived',
    );

    const html = picker(choice);

    expect(html).toContain('Escritorios antiguos');
    expect(html).toContain('Archivada');
    expect(html).toContain('se conserva mientras no elijas otra');
  });

  it('se reconoce por slug aunque el catálogo la haya renombrado', () => {
    expect(currentCategoryStatus({ name: 'Nombre viejo', slug: 'tocadores' }, CATALOG)).toBe(
      'active',
    );
  });

  it('una que el catálogo no conoce se dice como tal, sin inventarle estado', () => {
    const html = picker(choiceFromProduct({ name: 'Heredada', slug: 'heredada' }));

    expect(html).toContain('No está en el catálogo');
    expect(html).not.toContain('Archivada');
  });

  it('no se reenvía sola al guardar la edición', () => {
    const kept = choiceFromProduct({ name: 'Escritorios antiguos', slug: 'escritorios-antiguos' });

    expect(categoryPatch(kept, 'edit')).toBeUndefined();
  });
});

describe('lo que viaja', () => {
  const tocadores: CategoryChoice = { kind: 'catalog', category: CATALOG[2]! };

  it('una elegida del catálogo viaja con su nombre y su slug', () => {
    expect(categoryPatch(tocadores, 'create')).toEqual({ slug: 'tocadores', name: 'Tocadores' });
    expect(categoryPatch(tocadores, 'edit')).toEqual({ slug: 'tocadores', name: 'Tocadores' });
  });

  it('sin categoría: en el alta se omite, en la edición se borra con null', () => {
    expect(categoryPatch({ kind: 'none' }, 'create')).toBeUndefined();
    expect(categoryPatch({ kind: 'none' }, 'edit')).toBeNull();
  });

  it('el formulario ya no tiene campos libres de nombre o slug de categoría', () => {
    const source = readFileSync('src/features/panel/enrichment-fields.tsx', 'utf8');

    expect(source).not.toContain('categoryName');
    expect(source).not.toContain('categorySlug');
  });
});

describe('crear desde el selector', () => {
  it('propone el slug desde el nombre, dentro del tope del contrato', () => {
    expect(proposeCategorySlug('Clósets y Vestidores')).toBe('closets-y-vestidores');
    expect(proposeCategorySlug('a'.repeat(59) + ' b').length).toBeLessThanOrEqual(60);
    expect(proposeCategorySlug('a'.repeat(59) + ' b').endsWith('-')).toBe(false);
  });

  it('valida la forma del slug antes de enviar', () => {
    expect(categoryDraftProblems('Tocadores', 'tocadores')).toEqual({});
    expect(categoryDraftProblems('', 'tocadores').name).toBeDefined();
    expect(categoryDraftProblems('Tocadores', 'Toca dores').slug).toBeDefined();
    expect(categoryDraftProblems('Tocadores', '-tocadores').slug).toBeDefined();
  });

  it('la creada entra al catálogo en su orden y sin duplicarse', () => {
    const created: CategoryOption = {
      id: 'cat_4',
      name: 'Espejos',
      slug: 'espejos',
      status: 'active',
    };
    const next = withCreatedCategory(CATALOG, created);

    // Por nombre: Clósets, Escritorios, Espejos, Tocadores.
    expect(next.map((option) => option.id)).toEqual(['cat_1', 'cat_2', 'cat_4', 'cat_3']);
    expect(withCreatedCategory(next, created)).toHaveLength(4);
  });

  it('al crearla, la elige: onCreated y onChange con la respuesta del backend', () => {
    const source = readFileSync('src/features/panel/category-picker.tsx', 'utf8');
    const success = source.slice(source.indexOf('const created: CategoryOption'));

    expect(success).toContain('onCreated(created)');
    expect(success).toContain("onChange({ kind: 'catalog', category: created })");
    // Se crea con lo revisado en pantalla, no con el texto de búsqueda.
    expect(source).toContain('createCategory({ name: draftName.trim(), slug: draftSlug.trim() })');
  });

  it('los conflictos de nombre y slug marcan su propio campo', () => {
    const source = readFileSync('src/features/panel/category-picker.tsx', 'utf8');

    expect(source).toContain("result.code === 'category_name_conflict'");
    expect(source).toContain("result.code === 'category_slug_conflict'");
  });

  it('sin permiso no hay botón de crear', () => {
    expect(picker({ kind: 'none' }, { canCreate: true })).toContain('Crear categoría');
    expect(picker({ kind: 'none' }, { canCreate: false })).not.toContain('Crear categoría');
  });
});

describe('errores del backend sobre la categoría', () => {
  it('se pintan en el propio selector y lo marcan como inválido', () => {
    const html = picker(
      { kind: 'catalog', category: CATALOG[0]! },
      { error: 'La categoría elegida está archivada.' },
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('La categoría elegida está archivada.');
  });

  /*
   * Sin catálogo, «no la encuentro» no es «no existe». Afirmarlo fue lo que se vio en staging
   * cuando el listado respondía 503: una categoría normal aparecía como ajena al catálogo.
   */
  it('con el catálogo incompleto no afirma que la categoría no esté', () => {
    expect(currentCategoryStatus({ name: 'x', slug: 'heredada' }, [], false)).toBeNull();
    expect(currentCategoryStatus({ name: 'x', slug: 'heredada' }, [], true)).toBe('missing');
    // Lo que sí se encontró se sigue reconociendo.
    expect(currentCategoryStatus({ name: 'x', slug: 'escritorios-antiguos' }, CATALOG, false)).toBe(
      'archived',
    );

    const html = renderToStaticMarkup(
      <CategoryPicker
        canCreate
        catalog={[]}
        catalogComplete={false}
        catalogProblem="No pudimos leer el catálogo de categorías."
        choice={choiceFromProduct({ name: 'Tocadores', slug: 'tocadores' })}
        disabled={false}
        error={null}
        onChange={() => undefined}
        onCreated={() => undefined}
      />,
    );

    expect(html).toContain('Tocadores');
    expect(html).not.toContain('No está en el catálogo');
  });

  it('un catálogo ilegible se dice, y la categoría actual se sigue viendo', () => {
    const html = picker(choiceFromProduct({ name: 'Tocadores', slug: 'tocadores' }), {
      problem: 'No pudimos leer el catálogo de categorías.',
    });

    expect(html).toContain('No pudimos leer el catálogo de categorías.');
    expect(html).toContain('Tocadores');
  });
});
