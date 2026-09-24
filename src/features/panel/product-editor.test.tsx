import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { AdminProduct } from '@/lib/api/catalog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { CreateProductForm, CREATE_FIELD_ORDER, firstProblemField, TAB_OF_FIELD } =
  await import('./create-product-form');
const { ProductDetailClient } = await import('./product-detail-client');
const { nextTabIndex, ProductDataTabs, tabForAnchor } = await import('./product-data-tabs');
const { SECTION_IDS } = await import('./publication-readiness');

/**
 * El editor de producto rediseñado: alta y edición.
 *
 * Se comprueba lo que un rediseño puede romper sin que nadie lo note: que no desaparezca ningún
 * campo ni capacidad, que las pestañas no desmonten lo escrito, que el foco llegue al campo con el
 * error aunque viva en otra pestaña, y que nada tenga un ancho fijo que desborde a 360 px.
 */

const CATEGORIES = [
  { id: 'cat_1', name: 'Tocadores', slug: 'tocadores', status: 'active' as const },
  { id: 'cat_2', name: 'Antiguos', slug: 'antiguos', status: 'archived' as const },
];

function createForm(canPublish = true) {
  return renderToStaticMarkup(
    <CreateProductForm
      canCreateCategory
      canPublish={canPublish}
      categories={CATEGORIES}
      categoryProblem={null}
    />,
  );
}

const CREATE = createForm();
const FORM_SOURCE = readFileSync('src/features/panel/create-product-form.tsx', 'utf8');
const CSS = readFileSync('src/features/panel/catalog.module.css', 'utf8');

function product(overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: 'prd_1',
    sku: 'TOC-AURA',
    slug: 'tocador-aura',
    name: 'Tocador Aura',
    shortDescription: 'Tocador con espejo.',
    description: '',
    priceCop: 1490000,
    status: 'draft',
    version: 7,
    category: { name: 'Antiguos', slug: 'antiguos' },
    productType: null,
    featured: false,
    features: [],
    specifications: { materials: '', measurements: '', warranty: '', care: '' },
    attributes: [],
    variants: [],
    images: [],
    inventory: {
      mode: 'tracked',
      quantity: 3,
      lowStockThreshold: 1,
      status: 'in_stock',
    },
    publicationReadiness: { ready: false, missing: ['category'] },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    archivedAt: null,
    publishedAt: null,
    ...overrides,
  } as unknown as AdminProduct;
}

const PERMISSIONS = {
  canCreate: true,
  canUpdate: true,
  canPublish: true,
  canArchive: true,
  canAdjustInventory: true,
};

function editForm(initial = product()) {
  return renderToStaticMarkup(
    <ProductDetailClient
      categories={CATEGORIES}
      categoryProblem={null}
      initial={initial}
      permissions={PERMISSIONS}
      role="super_admin"
    />,
  );
}

describe('el alta conserva todos los campos y capacidades', () => {
  it.each([
    'Nombre del producto',
    'SKU',
    'URL (slug)',
    'Descripción corta',
    'Descripción detallada',
    'Precio',
    'Tipo de producto',
    'Slug del tipo',
    'Destacado en la tienda',
    'Materiales',
    'Medidas',
    'Garantía',
    'Cuidados',
    'Portada',
    'Galería',
    'Variantes',
    'Categoría',
  ])('«%s» sigue en la pantalla', (label) => {
    expect(CREATE).toContain(label);
  });

  /*
   * La galería admite varias a la vez, pero solo aparece con la portada elegida: esa regla ya
   * existía y el rediseño no la cambia. Se comprueba que el editor sigue siendo el mismo.
   */
  it('sigue usando el editor de cola con subida múltiple, portada y orden', () => {
    const editor = readFileSync('src/features/panel/image-queue-editor.tsx', 'utf8');

    expect(editor).toContain('multiple');
    expect(FORM_SOURCE).toContain('<ImageQueueEditor');
    for (const handler of ['onMove=', 'onPrimary=', 'onReplace=', 'onRemove=', 'onAlt=']) {
      expect(FORM_SOURCE, handler).toContain(handler);
    }
  });

  it('sigue teniendo los contadores de los textos editoriales', () => {
    expect(CREATE).toContain('contador');
  });

  it('conserva guardar borrador y publicar, y publicar solo con permiso', () => {
    expect(CREATE).toContain('Guardar borrador');
    expect(CREATE).toContain('>Publicar<');
    expect(createForm(false)).not.toContain('>Publicar<');
    expect(createForm(false)).toContain('Tu rol puede guardar borradores, no publicar.');
  });

  it('no pinta la recuperación mientras no exista producto', () => {
    expect(CREATE).not.toContain('El producto fue creado como borrador');
    expect(CREATE).not.toContain('Abrir producto');
    expect(CREATE).not.toContain('Reintentar lo pendiente');
  });

  it('los campos libres de categoría desaparecieron: se elige del catálogo', () => {
    expect(CREATE).not.toContain('Slug de la categoría');
    expect(CREATE).toContain('role="combobox"');
  });
});

describe('estructura del editor', () => {
  it('el nombre va arriba, antes del cuerpo en dos columnas', () => {
    expect(CREATE.indexOf('Nombre del producto')).toBeLessThan(CREATE.indexOf('Descripción corta'));
    expect(CREATE).toContain(`id="${SECTION_IDS.basica}"`);
  });

  it('la barra lateral lleva estado, preparación, categoría e imágenes, en ese orden', () => {
    const side = CREATE.slice(CREATE.indexOf('<aside'));

    const order = ['Estado', 'Preparación', 'Categoría', 'Portada'].map((text) =>
      side.indexOf(text),
    );

    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('«Datos del producto» tiene las cinco pestañas', () => {
    expect(CREATE).toContain('Datos del producto');

    for (const label of ['General', 'Inventario', 'Clasificación', 'Variantes', 'Detalles']) {
      expect(CREATE, label).toMatch(new RegExp(`role="tab"[^>]*>${label}`));
    }
  });

  it('la vista previa ya no es una columna: es un botón que abre un diálogo', () => {
    expect(CREATE).toContain('aria-haspopup="dialog"');
    expect(CREATE).toMatch(/<dialog[^>]*>/);
    expect(FORM_SOURCE).not.toContain('styles.preview}');
  });
});

describe('pestañas', () => {
  const TABS = [
    { key: 'a', label: 'A', anchor: 'seccion-a', content: <input aria-label="en A" /> },
    { key: 'b', label: 'B', anchor: 'seccion-b', content: <input aria-label="en B" /> },
    { key: 'c', label: 'C', anchor: 'seccion-c', content: <input aria-label="en C" /> },
  ];

  it('las flechas recorren dando la vuelta; Inicio y Fin a los extremos', () => {
    expect(nextTabIndex(0, 'ArrowRight', 3)).toBe(1);
    expect(nextTabIndex(2, 'ArrowRight', 3)).toBe(0);
    expect(nextTabIndex(0, 'ArrowLeft', 3)).toBe(2);
    expect(nextTabIndex(1, 'Home', 3)).toBe(0);
    expect(nextTabIndex(1, 'End', 3)).toBe(2);
    expect(nextTabIndex(1, 'Enter', 3)).toBe(1);
  });

  it('un ancla del checklist abre su pestaña', () => {
    expect(tabForAnchor(TABS, '#seccion-b')).toBe('b');
    expect(tabForAnchor(TABS, 'seccion-c')).toBe('c');
    expect(tabForAnchor(TABS, '#otra')).toBeNull();
  });

  it('tabindex itinerante y paneles ocultos, pero montados', () => {
    const html = renderToStaticMarkup(
      <ProductDataTabs active="b" onChange={() => undefined} tabs={TABS} />,
    );

    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/tabindex="0"[^>]*role="tab"|role="tab"[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-selected="true"[^>]*>B</);
    // Los tres paneles están en el DOM: lo escrito en una pestaña no se pierde al cambiar.
    expect(html).toContain('aria-label="en A"');
    expect(html).toContain('aria-label="en C"');
    expect(html.match(/hidden=""/g)).toHaveLength(2);
  });
});

describe('foco tras un error', () => {
  it('se va al primer campo con error, en el orden de la pantalla', () => {
    expect(firstProblemField({ images: 'x', sku: 'y', priceCop: 'z' })).toBe('sku');
    expect(firstProblemField({ category: 'x', variants: 'y' })).toBe('variants');
    expect(firstProblemField({})).toBeNull();
    expect(CREATE_FIELD_ORDER.indexOf('name')).toBe(0);
  });

  it('un campo dentro de una pestaña abre esa pestaña antes de enfocarlo', () => {
    expect(TAB_OF_FIELD.priceCop).toBe('general');
    expect(TAB_OF_FIELD.inventory).toBe('inventario');
    expect(TAB_OF_FIELD.variants).toBe('variantes');

    const goTo = FORM_SOURCE.slice(FORM_SOURCE.indexOf('function goTo'));

    expect(goTo.indexOf('setTab(owner)')).toBeLessThan(goTo.indexOf('requestAnimationFrame'));
    expect(goTo).toContain('element?.focus()');
  });

  it('un SKU o una URL reservados marcan y enfocan su campo', () => {
    const submit = FORM_SOURCE.slice(FORM_SOURCE.indexOf('const field = productFailureField('));

    expect(submit).toContain('setErrors({ [field]: describeCatalogFailure(result.failure.code) })');
    expect(submit).toContain('goTo(field)');
  });

  it('la lista de lo pendiente lleva a cada campo', () => {
    expect(FORM_SOURCE).toContain('onClick={() => goTo(problem)}');
  });

  it('los errores de campo se anuncian y marcan el campo como inválido', () => {
    const field = FORM_SOURCE.slice(FORM_SOURCE.indexOf('function Field('));

    expect(field).toContain("'aria-invalid': true");
    expect(field).toContain("'aria-describedby': described");
    expect(field).toContain('role="alert"');
  });
});

describe('recuperación del alta', () => {
  it('reintentar reanuda con el progreso guardado: nunca repite el POST', () => {
    expect(FORM_SOURCE).toContain('runCreateFlow(input, flowDeps, resume)');
    expect(FORM_SOURCE).toContain('void submit(progress,');
    expect(FORM_SOURCE).not.toContain('submit(EMPTY_PROGRESS');
  });

  it('ofrece «Abrir producto» y «Reintentar lo pendiente» solo con el producto creado', () => {
    const recovery = FORM_SOURCE.slice(FORM_SOURCE.indexOf('{created === null ? null : ('));

    expect(recovery).toContain('El producto fue creado como borrador.');
    expect(recovery).toContain('describeFailedStep(progress.failure');
    expect(recovery).toContain('Abrir producto');
    expect(recovery).toContain('Reintentar lo pendiente');
  });

  it('un conflicto de versión relee el producto y no reintenta solo', () => {
    const conflict = FORM_SOURCE.slice(
      FORM_SOURCE.indexOf("result.failure.code === 'version_conflict'"),
    );

    expect(conflict).toContain('readProduct(result.product.id)');
    expect(conflict).toContain('withRereadProduct(result, reread.data)');
    // Tras releer no hay otra llamada a runCreateFlow en el mismo envío.
    expect(conflict.slice(0, conflict.indexOf('setProgress(result)'))).not.toContain(
      'runCreateFlow',
    );
  });
});

describe('edición con el mismo editor', () => {
  const EDIT = editForm();

  it('la categoría archivada de un producto histórico se enseña y no se cambia sola', () => {
    expect(EDIT).toContain('Antiguos');
    expect(EDIT).toContain('Archivada');
  });

  it('«Actualizar» vive en la barra lateral y envía el formulario del nombre', () => {
    expect(EDIT).toMatch(/<button[^>]*form="[^"]+"[^>]*type="submit"[^>]*>Actualizar</);
  });

  it('conserva inventario, variantes, imágenes, publicar y archivar', () => {
    for (const text of [
      'Inventario',
      'Variantes',
      'Portada',
      'Galería',
      'Publicar',
      'Archivar producto',
    ]) {
      expect(EDIT, text).toContain(text);
    }
  });

  it('SKU y slug se enseñan inmutables', () => {
    expect(EDIT).toContain('TOC-AURA');
    expect(EDIT).toContain('tocador-aura');
    expect(EDIT).toContain('SKU y slug son inmutables');
  });

  it('un rechazo de categoría se marca en el selector y lleva el foco allí', () => {
    const source = readFileSync('src/features/panel/product-detail-client.tsx', 'utf8');

    expect(source).toContain("productFailureField(result.code) === 'category'");
    expect(source).toContain('categoryInput.current?.focus()');
  });

  it('no anida formularios: inventario, imágenes y variantes quedan fuera del <form>', () => {
    const form = EDIT.slice(EDIT.indexOf('<form'), EDIT.indexOf('</form>'));

    expect(EDIT.match(/<form/g)).toHaveLength(1);
    expect(form).not.toContain('Variantes');
    expect(form).not.toContain('Portada');
  });

  it('sin permiso de edición, los campos se ven pero no se editan ni se guardan', () => {
    const readOnly = renderToStaticMarkup(
      <ProductDetailClient
        categories={CATEGORIES}
        categoryProblem={null}
        initial={product()}
        permissions={{ ...PERMISSIONS, canUpdate: false }}
        role="moderator"
      />,
    );

    expect(readOnly).not.toContain('>Actualizar<');
    expect(readOnly).toContain('Tu rol no permite editar este producto.');
    expect(readOnly).not.toContain('>Crear categoría<');
  });
});

describe('diseño responsive sin desbordamiento', () => {
  it('el cuerpo cae a una columna por debajo de 64rem', () => {
    expect(CSS).toMatch(/\.editorBody\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 21rem/);
    expect(CSS).toMatch(
      /@media \(max-width: 64rem\) \{\s*\.editorBody \{\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
  });

  it('la barra lateral solo se fija con sitio, y desplaza por dentro si es más alta', () => {
    const sticky = CSS.slice(CSS.indexOf('@media (min-width: 64.01rem) and (min-height: 46rem)'));

    expect(sticky.slice(0, 400)).toContain('position: sticky');
    expect(sticky.slice(0, 400)).toContain('overflow-y: auto');
  });

  it('las pestañas desplazan dentro de la tarjeta, no la página', () => {
    expect(CSS).toMatch(/\.dataTabList\s*\{[^}]*overflow-x: auto/);
    expect(CSS).toMatch(/\.dataTabList\s*\{[^}]*min-width: 0/);
  });

  it('la lista del selector se posiciona dentro de su propio control', () => {
    expect(CSS).toMatch(/\.pickerControl\s*\{\s*position: relative;/);
    expect(CSS).toMatch(/\.pickerList\s*\{[^}]*left: 0;[^}]*/);
  });

  it('las columnas del editor pueden encogerse y los diálogos se acotan a la ventana', () => {
    expect(CSS).toMatch(/\.editorMain,\s*\.editorSide\s*\{[^}]*min-width: 0/);
    expect(CSS).toMatch(/\.previewDialog\s*\{[^}]*width: min\(28rem, calc\(100vw - 2rem\)\)/);
  });

  it('los objetivos táctiles nuevos miden al menos 44 px', () => {
    for (const rule of ['.pickerOption', '.dataTab', '.segmentedOption']) {
      const block = CSS.slice(CSS.indexOf(`${rule} {`));

      expect(block.slice(0, block.indexOf('}')), rule).toContain('min-height: 2.75rem');
    }
  });

  it('ninguna regla nueva fija un ancho en píxeles', () => {
    const added = CSS.slice(
      CSS.indexOf('/* ------------------------------------------------- selector de categoría */'),
    );

    expect(added).not.toMatch(/(?<!max-|min-)width:\s*\d+px/);
  });
});
