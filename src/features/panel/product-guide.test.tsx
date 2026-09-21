import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GuideBody, ProductGuide } from './product-guide';
import { IMAGE_ANCHORS } from './product-anchors';
import { SECTION_IDS } from './publication-readiness';

/**
 * La guía para administrar un producto.
 *
 * Lo que se comprueba no es que exista un diálogo bonito: es que lo que dice sea cierto —las
 * imágenes son opcionales, guardar no publica, «Solo disponibilidad» no lleva cantidad— y que los
 * enlaces lleven a anclas que **existen** en la pantalla desde la que se abre. Una guía que enlaza
 * a un `#` inventado es peor que no tener guía.
 */

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const CREATE = renderToStaticMarkup(<GuideBody mode="create" />);
const EDIT = renderToStaticMarkup(<GuideBody mode="edit" />);

describe('40. está disponible en alta y en edición', () => {
  it('las dos pantallas montan el botón', () => {
    for (const page of [
      'src/app/panel/productos/nuevo/page.tsx',
      'src/app/panel/productos/[productId]/page.tsx',
    ]) {
      const source = read(page);

      expect(source, page).toContain('<ProductGuide');
    }
  });

  it('el botón se llama como toca y no abre nada por su cuenta', () => {
    const html = renderToStaticMarkup(<ProductGuide mode="create" />);

    expect(html).toContain('Ver guía para crear un producto');
    // Sin `open`: el `<dialog>` nace cerrado y solo `showModal()` lo abre.
    expect(html).not.toContain('<dialog open');
  });

  it('el contenido se adapta a la pantalla sin cambiar lo que afirma', () => {
    expect(CREATE).toContain('se envía de una vez');
    expect(EDIT).toContain('se guarda por su cuenta');
  });
});

describe('41. explica los dos modos', () => {
  it('nombra los dos y dice qué se escribe en cada uno', () => {
    expect(CREATE).toContain('Controlar cantidad');
    expect(CREATE).toContain('Solo disponibilidad');
    expect(CREATE).toContain('Siempre el total, nunca');
  });

  it('dice que «Solo disponibilidad» no lleva cantidad', () => {
    expect(CREATE).toContain('No lleva cantidad');
  });

  it('explica el inventario por variantes', () => {
    expect(CREATE).toContain('Inventario gestionado por variantes');
    expect(CREATE).toContain('propio SKU, su precio y su');
  });

  it('dice que la portada es la primera imagen y la galería el resto', () => {
    expect(CREATE).toContain('primera imagen que aparece en la tienda');
    expect(CREATE).toContain('son todas las demás');
  });
});

describe('42. no afirma que las imágenes sean obligatorias', () => {
  it('dice lo contrario, y con esas palabras', () => {
    expect(CREATE).toContain('Las imágenes son opcionales para publicar');
  });

  /*
   * Sensibilidad: si alguien escribiera «las imágenes son obligatorias», o «hace falta al menos
   * una imagen», estaría contradiciendo al contrato, que dejó de exigirlas.
   */
  it('ninguna frase las presenta como requisito', () => {
    for (const forbidden of [
      'imágenes son obligatorias',
      'al menos una imagen',
      'hace falta una imagen',
      'sin imágenes no se puede publicar',
    ]) {
      expect(CREATE, forbidden).not.toContain(forbidden);
    }
  });

  it('dice que guardar no publica y de dónde sale el checklist', () => {
    expect(CREATE).toContain('Guardar no publica');
    expect(CREATE).toContain('la calcula el backend');
  });
});

describe('43. enlaza a anclas reales', () => {
  const targets = [...CREATE.matchAll(/href="#([^"]+)"/g)].map((match) => match[1] ?? '');

  it('hay enlaces y todos apuntan a un identificador conocido', () => {
    const known = new Set<string>([...Object.values(SECTION_IDS), ...Object.values(IMAGE_ANCHORS)]);

    expect(targets.length).toBeGreaterThan(0);

    for (const target of targets) {
      expect(known, target).toContain(target);
    }
  });

  /*
   * Y esos identificadores se pintan de verdad. Se comprueba contra el código fuente de las dos
   * pantallas: si alguien renombrara una sección, la guía quedaría enlazando al vacío.
   */
  it('cada destino existe en la pantalla que abre la guía', () => {
    const create = read('src/features/panel/create-product-form.tsx');
    const detail = read('src/features/panel/product-detail-client.tsx');
    const images = read('src/features/panel/product-images.tsx');
    const queue = read('src/features/panel/image-queue-editor.tsx');

    const nameOf = (id: string) =>
      Object.entries(SECTION_IDS).find(([, value]) => value === id)?.[0] ??
      Object.entries(IMAGE_ANCHORS).find(([, value]) => value === id)?.[0] ??
      '';

    for (const target of new Set(targets)) {
      const key = nameOf(target);
      const inSections = `SECTION_IDS.${key}`;
      const inAnchors = `IMAGE_ANCHORS.${key}`;

      expect(create.includes(inSections) || queue.includes(inAnchors), `alta: ${target}`).toBe(
        true,
      );
      expect(detail.includes(inSections) || images.includes(inAnchors), `detalle: ${target}`).toBe(
        true,
      );
    }
  });
});

describe('44. funciona con teclado', () => {
  it('el disparador y el cierre son botones de verdad', () => {
    const html = renderToStaticMarkup(<ProductGuide mode="edit" />);

    expect(html).toContain('<button');
    expect(html).toContain('Cerrar guía');
    // Nada de `div` con `onClick`: un `div` no se enfoca ni responde a Enter.
    expect(html).not.toContain('role="button"');
  });

  it('usa el diálogo nativo, que ya administra el foco y cierra con Escape', () => {
    const source = executable(read('src/features/panel/product-guide.tsx'));

    expect(source).toContain('showModal()');
    expect(source).toContain('<dialog');
    expect(source).toContain('aria-labelledby');
    // Sin trampa de foco a mano: la del navegador es la que funciona.
    expect(source).not.toContain('tabIndex={-1}');
  });

  it('la jerarquía empieza en h2: el único h1 es el del producto', () => {
    expect(CREATE).not.toContain('<h1');
    expect(renderToStaticMarkup(<ProductGuide mode="edit" />)).not.toContain('<h1');
    expect(CREATE).toContain('<h3');
  });
});

describe('45. no guarda nada', () => {
  it('no toca storage, ni cookies, ni ningún «ya la vi»', () => {
    const source = executable(read('src/features/panel/product-guide.tsx'));

    for (const forbidden of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('se puede volver a abrir siempre: nada condiciona el botón', () => {
    const source = executable(read('src/features/panel/product-guide.tsx'));

    expect(source).not.toContain('seen');
    expect(source).not.toContain('dismissed');
  });
});
