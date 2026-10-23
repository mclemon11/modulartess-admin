import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OrdersToolbar } from './orders-toolbar';

import type { AdminOrderStatusOption } from '@/lib/api/orders';

/**
 * La barra del listado, sobre el HTML que React produce de verdad.
 *
 * Las opciones salen **solo** de las que publica el backend: las etiquetas de la prueba son
 * deliberadamente distintas de las reales, y si el panel tuviera su propia tabla aparecerían aquí.
 */

const OPTIONS: AdminOrderStatusOption[] = [
  { value: 'pending_payment', label: 'Etiqueta A del backend' },
  { value: 'paid', label: 'Etiqueta B del backend' },
  { value: 'cancelled', label: 'Etiqueta C del backend' },
];

function render(status: string | null): string {
  return renderToStaticMarkup(
    <OrdersToolbar onStatusChange={() => undefined} options={OPTIONS} status={status} />,
  );
}

describe('barra de filtro y exportación', () => {
  it('ofrece «Todos» primero y después las opciones del backend, con su etiqueta', () => {
    const html = render(null);
    const options = [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(
      ([, value, label]) => [value, label],
    );

    expect(options).toEqual([
      ['', 'Todos'],
      ['pending_payment', 'Etiqueta A del backend'],
      ['paid', 'Etiqueta B del backend'],
      ['cancelled', 'Etiqueta C del backend'],
    ]);
    expect(html).not.toMatch(/Pendiente de pago|Pedido confirmado|Cancelado/);
  });

  it('el selector tiene una etiqueta «Estado» asociada', () => {
    const html = render('paid');
    const id = /<label[^>]*for="([^"]+)"[^>]*>Estado<\/label>/.exec(html)?.[1];

    expect(id).toBeDefined();
    expect(html).toContain(`<select class="`);
    expect(html).toMatch(new RegExp(`<select[^>]*id="${id}"`));
  });

  it('marca el estado activo y ofrece volver a «Todos» solo con un filtro', () => {
    expect(render('paid')).toMatch(/<option value="paid" selected="">/);
    expect(render('paid')).toContain('>Ver todos</button>');
    expect(render(null)).not.toContain('Ver todos');
    expect(render(null)).toMatch(/<option value="" selected="">Todos<\/option>/);
  });

  it('«Exportar CSV» es un botón real, operable con teclado, y la región de avisos existe', () => {
    const html = render(null);

    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Exportar CSV<\/button>/);
    expect(html).toMatch(/aria-busy="false"/);
    expect(html).toMatch(/<p[^>]*role="status"/);
    expect(html).not.toMatch(/tabindex="-1"/);
  });

  it('los controles miden al menos 44 px y se apilan en móvil sin desbordar', () => {
    const css = readFileSync('src/features/panel/orders-toolbar.module.css', 'utf8');
    const globals = readFileSync('src/app/globals.css', 'utf8');

    expect(globals).toMatch(/--control-height:\s*2\.75rem;/);
    expect(css).toMatch(/\.select \{[^}]*min-height: var\(--control-height\);/);
    expect(css).toMatch(/\.toolbar \{[^}]*flex-wrap: wrap;/);
    expect(css).toMatch(
      /@media \(max-width: 40rem\) \{[\s\S]*\.select \{[^}]*width: 100%;[\s\S]*button \{[^}]*width: 100%;/,
    );
    // Los botones usan los de la superficie, que ya miden `--control-height`.
    expect(render(null)).toMatch(/class="[^"]*buttonSecondary/);
  });
});
