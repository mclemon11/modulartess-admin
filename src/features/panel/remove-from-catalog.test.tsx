import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { AdminProduct } from '@/lib/api/catalog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const { RemoveFromCatalogButton, REMOVE_FROM_CATALOG_TEXT, REMOVED_NOTICE } =
  await import('./remove-from-catalog');
const { ProductsTable } = await import('./products-table');

/**
 * «Eliminar del catálogo» es el archivado del contrato con un nombre que se encuentra. No hay
 * borrado físico, y nunca se llama «eliminado permanentemente» a un producto archivado.
 */
const SOURCE = readFileSync('src/features/panel/remove-from-catalog.tsx', 'utf8');
const DETAIL = readFileSync('src/features/panel/product-detail-client.tsx', 'utf8');
const LIST_PAGE = readFileSync('src/app/panel/productos/page.tsx', 'utf8');

describe('Eliminar del catálogo', () => {
  it('lleva el texto de confirmación acordado, literal', () => {
    expect(REMOVE_FROM_CATALOG_TEXT).toBe(
      'Este producto dejará de aparecer y de poder comprarse inmediatamente. Los pedidos anteriores, la auditoría, el SKU y el enlace interno se conservarán.',
    );
    expect(REMOVED_NOTICE).toBe('Producto eliminado del catálogo');
  });

  it('usa el archivado existente con la versión que se ve, y nunca un DELETE', () => {
    expect(SOURCE).toContain("transitionProduct(product.id, 'archive', product.version)");
    expect(SOURCE + DETAIL + LIST_PAGE).not.toMatch(/method: 'DELETE'|'DELETE'/);
  });

  it('nunca lo llama borrado permanente', () => {
    for (const source of [SOURCE, DETAIL, LIST_PAGE]) {
      expect(source).not.toMatch(/eliminado permanentemente|borrado permanentemente/i);
    }
  });

  it('toma el candado síncrono antes del primer await y confirma con un diálogo', () => {
    const body = SOURCE.slice(SOURCE.indexOf('async function confirm'));

    expect(body.indexOf('acquire(lock.current)')).toBeGreaterThan(-1);
    expect(body.indexOf('acquire(lock.current)')).toBeLessThan(body.indexOf('await '));
    expect(SOURCE).toContain('dialog.current?.showModal()');
  });

  it('refresca listado y detalle al terminar', () => {
    expect(SOURCE).toContain('router.refresh()');
    expect(DETAIL).toContain('setNotice(REMOVED_NOTICE)');
  });

  it('no se ofrece para un producto ya archivado', () => {
    const html = renderToStaticMarkup(
      <RemoveFromCatalogButton product={{ id: 'p', name: 'X', status: 'archived', version: 3 }} />,
    );

    expect(html).toBe('');
  });

  it.each(['draft', 'active'] as const)('se ofrece para un producto %s', (status) => {
    const html = renderToStaticMarkup(
      <RemoveFromCatalogButton product={{ id: 'p', name: 'X', status, version: 3 }} />,
    );

    expect(html).toContain('Eliminar del catálogo');
  });
});

describe('listado de productos', () => {
  // Misma forma que el constructor de `product-editor.test.tsx`.
  const product = {
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
    inventory: { mode: 'tracked', quantity: 3, lowStockThreshold: 1, status: 'in_stock' },
    publicationReadiness: { ready: false, missing: ['category'] },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    archivedAt: null,
    publishedAt: null,
  } as unknown as AdminProduct;

  it('sin products.archive no aparece la acción', () => {
    const html = renderToStaticMarkup(
      <ProductsTable canArchive={false} canEdit products={[{ ...product, status: 'draft' }]} />,
    );

    expect(html).not.toContain('Eliminar del catálogo');
  });

  it('con products.archive aparece en cada fila no archivada', () => {
    const html = renderToStaticMarkup(
      <ProductsTable canArchive canEdit products={[{ ...product, status: 'active' }]} />,
    );

    expect(html).toContain('Eliminar del catálogo');
  });

  it('el permiso sale de products.archive y la vista la filtra el backend', () => {
    expect(LIST_PAGE).toContain("can(session.session.role, 'products.archive')");
    expect(LIST_PAGE).toContain("view: archivedView ? 'archived' : 'current'");
    expect(LIST_PAGE).toContain('Eliminados (archivados)');
    // No se filtra en el panel una página ya leída.
    expect(LIST_PAGE).not.toMatch(/items\.filter\(/);
  });
});
