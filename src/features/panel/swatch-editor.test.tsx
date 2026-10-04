import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type {
  AdminProduct,
  AdminProductVariant,
  ProductAttributeDefinition,
} from '@/lib/api/catalog';

import { describeCatalogFailure } from './catalog-errors';
import { CombinationMatrixView } from './combination-matrix';
import { parseUpdateProduct } from './product-input';
import { variantPermissions } from './product-permissions';
import { ProductVariants } from './product-variants';
import { SwatchAxisEditor } from './swatch-axis-editor';
import {
  combinationMatrix,
  swatchFromProduct,
  validateSwatch,
  type SwatchAxisDraft,
} from './swatch-draft';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
}));

/**
 * «Colores y acabados», comprobado sobre el HTML que React produce. Datos ficticios.
 */

const AXES: ProductAttributeDefinition[] = [
  { key: 'size', label: 'Ancho', presentation: 'text', options: [] },
  {
    key: 'color',
    label: 'Color',
    presentation: 'swatch',
    options: [
      {
        value: 'roble',
        label: 'Roble',
        hex: '#A0703C',
        position: 0,
        imageIds: ['img_1'],
        activeVariantIds: ['var_1'],
      },
      {
        value: 'blanco',
        label: 'Blanco',
        hex: '#FFFFFF',
        position: 1,
        imageIds: [],
        activeVariantIds: [],
      },
    ],
  },
];

const VARIANTS = [
  {
    id: 'var_1',
    productId: 'prd_1',
    sku: 'AURA-ROBLE-80',
    status: 'active',
    combinationKey: 'color:roble|size:80',
    attributes: [
      { key: 'color', value: 'roble', label: 'Roble' },
      { key: 'size', value: '80', label: '80' },
    ],
    priceCop: 1490000,
    inventory: {
      mode: 'tracked',
      quantity: 3,
      lowStockThreshold: 0,
      availability: 'in_stock',
      manualAvailability: null,
    },
    version: 1,
    createdAt: '',
    updatedAt: '',
    archivedAt: null,
  },
] as unknown as AdminProductVariant[];

const IMAGES = [
  { id: 'img_1', url: 'https://storage.googleapis.com/b/p/img_1.png', altText: 'Frente en roble' },
  { id: 'img_2', url: 'https://storage.googleapis.com/b/p/img_2.png', altText: 'Detalle' },
];

let n = 0;
const newId = () => `o-${++n}`;
const saved = () => swatchFromProduct(AXES) as SwatchAxisDraft;

function editor(
  swatch: SwatchAxisDraft | null,
  options: { images?: typeof IMAGES | null; disabled?: boolean } = {},
) {
  return renderToStaticMarkup(
    <SwatchAxisEditor
      attributes={AXES}
      disabled={options.disabled ?? false}
      images={options.images === undefined ? IMAGES : options.images}
      newId={newId}
      onChange={() => undefined}
      swatch={swatch}
      validation={
        swatch === null ? { byOption: {}, general: [] } : validateSwatch(swatch, ['img_1', 'img_2'])
      }
      variants={VARIANTS}
    />,
  );
}

describe('estado vacío', () => {
  it('ofrece activar color o acabado con su clave estable', () => {
    const html = editor(null);
    expect(html).toContain('Activar «Color» (color)');
    expect(html).toContain('Activar «Acabado» (finish)');
  });
});

describe('opciones', () => {
  it('cada muestra tiene nombre textual y descripción accesible', () => {
    const html = editor(saved());
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Muestra de Roble, #A0703C"');
    expect(html).toContain('1. Roble');
    expect(html).toContain('2. Blanco');
  });

  it('el blanco lleva el borde reforzado', () => {
    const html = editor(saved());
    expect(html).toMatch(/aria-label="Muestra de Blanco, #FFFFFF" class="[^"]*swatchLight/);
    expect(html).not.toMatch(/aria-label="Muestra de Roble, #A0703C" class="[^"]*swatchLight/);
  });

  it('campo hexadecimal editable y selector de color con etiqueta', () => {
    const html = editor(saved());
    expect(html).toContain('Código hexadecimal');
    expect(html).toContain('value="#A0703C"');
    expect(html).toContain('type="color"');
    expect(html).toContain('value="#a0703c"');
    expect(html).toContain('aria-label="Selector de color de Roble"');
  });

  it('un color usado dice qué variantes lo usan y no se puede retirar', () => {
    const html = editor(saved());
    expect(html).toContain('La usan: AURA-ROBLE-80');
    expect(html).toContain('1 variante activa');
    expect(html).toContain('title="La usan variantes activas"');
  });

  it('botones de orden con nombre accesible', () => {
    const html = editor(saved());
    expect(html).toContain('aria-label="Subir Blanco"');
    expect(html).toContain('aria-label="Bajar Roble"');
  });
});

describe('imágenes', () => {
  it('asocia imágenes existentes con casillas y texto alternativo', () => {
    const html = editor(saved());
    expect(html).toContain('Imágenes y videos de Roble');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('Frente en roble');
  });

  it('producto sin imágenes activas', () => {
    expect(editor(saved(), { images: [] })).toContain('no tiene imágenes ni videos activos');
  });

  it('en el alta, antes de existir el producto, no se simulan asociaciones', () => {
    const html = editor(saved(), { images: null });
    expect(html).toContain('Podrás asociar imágenes cuando el producto exista');
    expect(html).not.toContain('type="checkbox"');
  });
});

describe('matriz color / tamaño', () => {
  it('dice el estado en texto y cuántas faltan', () => {
    const matrix = combinationMatrix(
      saved(),
      [
        {
          axisId: 's',
          key: 'size',
          label: 'Ancho',
          values: [
            { valueId: '1', value: '80', label: '80 cm' },
            { valueId: '2', value: '100', label: '100 cm' },
          ],
        },
      ],
      VARIANTS,
      [],
    );
    const html = renderToStaticMarkup(
      <CombinationMatrixView
        disabled={false}
        hexOf={() => '#FFFFFF'}
        matrix={matrix}
        onPrepareMissing={() => undefined}
        room={71}
      />,
    );
    expect(html).toContain('Faltan 3 de 4 combinaciones');
    expect(html).toContain('Variante');
    expect(html).toContain('Falta');
    expect(html).toContain('Preparar las 3 combinaciones que faltan');
    expect(html).toContain('sin SKU, precio ni inventario');
    // Versión móvil: lista por color, sin tabla.
    expect(html).toContain('aria-label="Combinaciones por color"');
  });

  it('sin hueco no deja preparar más', () => {
    const matrix = combinationMatrix(saved(), [], VARIANTS, []);
    const html = renderToStaticMarkup(
      <CombinationMatrixView
        disabled={false}
        hexOf={() => '#FFFFFF'}
        matrix={matrix}
        onPrepareMissing={() => undefined}
        room={0}
      />,
    );
    expect(html).toContain('el máximo es 72');
  });
});

describe('permisos', () => {
  const product = {
    id: 'prd_1',
    sku: 'AURA',
    version: 4,
    priceCop: 1000,
    attributes: AXES,
    variants: VARIANTS,
    images: [],
    videos: [],
    gallery: [],
  } as unknown as AdminProduct;

  it('un rol sin products.update ve los colores pero no puede cambiarlos', () => {
    const html = renderToStaticMarkup(
      <ProductVariants
        onProduct={() => undefined}
        permissions={variantPermissions('rol_sin_permisos')}
        product={product}
      />,
    );
    expect(html).toContain('Colores y acabados');
    expect(html).toContain('Tu rol puede ver los colores, pero no cambiarlos.');
    expect(html).not.toContain('Guardar colores y acabados');
  });

  it('super_admin puede guardar, y la ficha avisa de colores sin variantes', () => {
    const html = renderToStaticMarkup(
      <ProductVariants
        onProduct={() => undefined}
        permissions={variantPermissions('super_admin')}
        product={product}
      />,
    );
    expect(html).toContain('Guardar colores y acabados');
    expect(html).toContain('Hay colores sin ninguna variante');
    expect(html).toContain('Blanco');
  });
});

describe('conflictos y errores', () => {
  it('retirar un color en uso tiene mensaje propio', () => {
    expect(describeCatalogFailure('attribute_option_in_use')).toContain('Archívalas antes');
  });
});

describe('frontera BFF', () => {
  it('acepta un eje visual con la forma del contrato', () => {
    expect(
      parseUpdateProduct({
        expectedVersion: 3,
        attributes: [
          {
            key: 'color',
            label: 'Color',
            presentation: 'swatch',
            options: [{ label: 'Roble', hex: '#A0703C', position: 0, imageIds: ['img_1'] }],
          },
        ],
      })?.attributes,
    ).toEqual([
      {
        key: 'color',
        label: 'Color',
        presentation: 'swatch',
        options: [{ label: 'Roble', hex: '#A0703C', position: 0, imageIds: ['img_1'] }],
      },
    ]);
  });

  it.each([
    ['nombre CSS', { label: 'Blanco', hex: 'white', position: 0 }],
    ['hex corto', { label: 'Blanco', hex: '#FFF', position: 0 }],
    ['sin nombre', { label: ' ', hex: '#FFFFFF', position: 0 }],
    ['uso escrito a mano', { label: 'Blanco', hex: '#FFFFFF', position: 0, imageIds: ['../x'] }],
  ])('rechaza %s', (_label, option) => {
    expect(
      parseUpdateProduct({
        expectedVersion: 3,
        attributes: [{ key: 'color', label: 'Color', presentation: 'swatch', options: [option] }],
      }),
    ).toBeNull();
  });

  it('un eje de texto no admite opciones', () => {
    expect(
      parseUpdateProduct({
        expectedVersion: 3,
        attributes: [
          { key: 'size', label: 'Ancho', options: [{ label: '80', hex: '#000000', position: 0 }] },
        ],
      }),
    ).toBeNull();
  });
});

describe('responsive', () => {
  const css = readFileSync('src/features/panel/swatches.module.css', 'utf8');

  it('las opciones son tarjetas en rejilla que se apilan en móvil', () => {
    expect(css).toMatch(
      /\.options \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 22rem\), 1fr\)\)/,
    );
  });

  it('en móvil la matriz pasa a tarjetas', () => {
    expect(css).toMatch(
      /@media \(max-width: 40rem\) \{[\s\S]*\.matrixScroll \{\s*display: none;[\s\S]*\.matrixCards \{\s*display: grid;/,
    );
  });

  it('la muestra siempre tiene borde', () => {
    expect(css).toMatch(/\.swatch \{[^}]*border: 1px solid/);
    expect(css).toMatch(/\.swatchLight \{[^}]*border: 2px solid/);
  });

  it('no escribe nombres de color CSS libres', () => {
    expect(css).not.toMatch(/:\s*(white|black|red|blue|green|gray|grey)\b/);
  });
});
