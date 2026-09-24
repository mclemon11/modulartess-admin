import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  DESCRIPTION_MAX_LENGTH,
  FEATURE_MAX_LENGTH,
  SHORT_DESCRIPTION_MAX_LENGTH,
} from '@/lib/api/variant-limits';

import { CountedTextarea } from './counted-field';
import { EMPTY_ENRICHMENT, enrichmentProblems } from './enrichment';
import { AdditionalDetailsFields } from './enrichment-fields';
import { FeaturesEditor } from './features-editor';
import { featureProblems } from './product-content';
import { PublicationChecklist } from './publication-checklist';

/**
 * Accesibilidad del formulario editorial, comprobada sobre el HTML que React produce de verdad.
 *
 * No hace falta un DOM: `renderToStaticMarkup` devuelve el marcado tal cual, que es donde viven las
 * relaciones que importan —`for`/`id`, `aria-describedby`, `role="alert"`— y los topes nativos. Un
 * contador suelto al lado del campo no sirve de nada si un lector de pantalla no lo asocia con él.
 */

/** Los `id` de `useId` llevan dos puntos; extraerlos así evita depender de su forma exacta. */
function describedBy(html: string, marker: string): readonly string[] {
  const field = html.slice(html.indexOf(marker));
  const match = /aria-describedby="([^"]+)"/.exec(field);

  return match?.[1]?.split(' ') ?? [];
}

function hasId(html: string, id: string): boolean {
  return html.includes(`id="${id}"`);
}

describe('campo con contador', () => {
  const html = renderToStaticMarkup(
    <CountedTextarea
      disabled={false}
      hint="Resumen visible junto al precio."
      label="Descripción corta"
      max={SHORT_DESCRIPTION_MAX_LENGTH}
      onChange={() => {}}
      requirement="necesaria"
      rows={2}
      value="Tocador de roble con espejo."
    />,
  );

  it('ata la etiqueta al campo', () => {
    const forId = /<label[^>]*for="([^"]+)"/.exec(html)?.[1];

    expect(forId).toBeDefined();
    expect(hasId(html, forId as string)).toBe(true);
  });

  it('lleva el tope del contrato como maxLength', () => {
    // `renderToStaticMarkup` conserva el nombre de la propiedad de React; el navegador recibe el
    // atributo `maxlength` equivalente.
    expect(html).toContain(`maxLength="${SHORT_DESCRIPTION_MAX_LENGTH}"`);
  });

  it('enseña el contador «N de 180»', () => {
    expect(html).toContain('28 de 180');
  });

  it('asocia la ayuda y el contador al campo, no los deja sueltos al lado', () => {
    const ids = describedBy(html, '<textarea');

    expect(ids).toHaveLength(2);

    for (const id of ids) {
      expect(hasId(html, id), id).toBe(true);
    }
  });

  it('dice que es necesaria para publicar', () => {
    expect(html).toContain('(necesaria para publicar)');
  });

  it('un campo opcional lo dice y no marca ningún error', () => {
    const optional = renderToStaticMarkup(
      <CountedTextarea
        disabled={false}
        hint="Se muestra dentro de Descripción en la ficha."
        label="Descripción detallada"
        max={DESCRIPTION_MAX_LENGTH}
        onChange={() => {}}
        requirement="opcional"
        rows={8}
        value=""
      />,
    );

    expect(optional).toContain('(Opcional)');
    expect(optional).toContain('0 de 3000');
    expect(optional).not.toContain('role="alert"');
    expect(optional).not.toContain('aria-invalid');
  });

  it('el error va con role="alert", marca el campo y entra en aria-describedby', () => {
    const invalid = renderToStaticMarkup(
      <CountedTextarea
        disabled={false}
        error="La descripción corta supera los 180 caracteres."
        hint="Resumen visible junto al precio."
        label="Descripción corta"
        max={SHORT_DESCRIPTION_MAX_LENGTH}
        onChange={() => {}}
        requirement="necesaria"
        rows={2}
        value="x"
      />,
    );

    expect(invalid).toContain('role="alert"');
    expect(invalid).toContain('aria-invalid="true"');
    expect(describedBy(invalid, '<textarea')).toHaveLength(3);
  });
});

describe('editor de características', () => {
  const features = ['Herrajes con cierre suave', 'Madera maciza'];
  const html = renderToStaticMarkup(
    <FeaturesEditor
      disabled={false}
      features={features}
      onChange={() => {}}
      problems={featureProblems(features)}
    />,
  );

  it('es opcional y lo dice', () => {
    expect(html).toContain('(Opcional)');
  });

  it('cuenta las escritas sobre el tope de cinco', () => {
    expect(html).toContain('2 de 5');
  });

  it('numera cada fila en su propia etiqueta', () => {
    expect(html).toContain('Característica 1');
    expect(html).toContain('Característica 2');
  });

  it('cada fila lleva su contador de 60 y su propio maxLength', () => {
    expect(html).toContain(`maxLength="${FEATURE_MAX_LENGTH}"`);
    expect(html).toContain('25 de 60');
    expect(html).toContain('13 de 60');
  });

  it('cada fila se puede subir, bajar y quitar', () => {
    expect(html).toContain('Subir');
    expect(html).toContain('Bajar');
    expect(html).toContain('Quitar');
    expect(html).toContain('Añadir característica');
  });

  it('la primera no se sube y la última no se baja', () => {
    // Dos filas: el «Subir» de la primera y el «Bajar» de la última están deshabilitados.
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it('explica dónde se van a leer', () => {
    expect(html).toContain('franja de beneficios de la ficha');
  });

  it('previsualiza las escritas en su orden', () => {
    const preview = html.slice(html.indexOf('Así se leerán'));

    expect(preview.indexOf('Herrajes con cierre suave')).toBeLessThan(
      preview.indexOf('Madera maciza'),
    );
  });

  it('sin ninguna dice que el producto se publica igual', () => {
    const empty = renderToStaticMarkup(
      <FeaturesEditor
        disabled={false}
        features={[]}
        onChange={() => {}}
        problems={featureProblems([])}
      />,
    );

    expect(empty).toContain('0 de 5');
    expect(empty).toContain('El producto se publica igual sin ninguna.');
    expect(empty).not.toContain('role="alert"');
  });

  it('la fila demasiado larga se marca junto a su campo, no en la lista entera', () => {
    const rows = ['bien', 'a'.repeat(FEATURE_MAX_LENGTH + 1)];
    const invalid = renderToStaticMarkup(
      <FeaturesEditor
        disabled={false}
        features={rows}
        onChange={() => {}}
        problems={featureProblems(rows)}
      />,
    );

    expect(invalid).toContain('Máximo 60 caracteres por característica.');
    expect(invalid).toContain('aria-invalid="true"');
    expect(invalid).toContain('61 de 60');
    // El error de fila no se convierte en un error de la lista: el contador general sigue en 2.
    expect(invalid).toContain('2 de 5');
    expect(invalid).not.toContain('Máximo 5 características.');
  });

  it('pasarse de cinco marca la lista entera', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f'];
    const invalid = renderToStaticMarkup(
      <FeaturesEditor
        disabled={false}
        features={rows}
        onChange={() => {}}
        problems={featureProblems(rows)}
      />,
    );

    expect(invalid).toContain('Máximo 5 características.');
    expect(invalid).toContain('6 de 5');
  });
});

describe('detalles adicionales', () => {
  const html = renderToStaticMarkup(
    <AdditionalDetailsFields
      disabled={false}
      fields={EMPTY_ENRICHMENT}
      mode="edit"
      onChange={() => {}}
      problems={enrichmentProblems(EMPTY_ENRICHMENT)}
    />,
  );

  it('están los cuatro, cada uno con su ayuda', () => {
    expect(html).toContain('Materiales');
    expect(html).toContain('Composición, herrajes y acabados comprobados.');
    expect(html).toContain('Medidas');
    expect(html).toContain('Ancho, alto y profundidad con unidad.');
    expect(html).toContain('Garantía');
    expect(html).toContain('Duración y alcance real.');
    expect(html).toContain('Cuidados');
    expect(html).toContain('Limpieza y mantenimiento.');
  });

  it('vacíos dicen «Opcional» y no presentan ningún error', () => {
    expect(html.match(/\(Opcional\)/g)).toHaveLength(4);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-invalid');
  });

  it('vacíos no llevan ningún texto de relleno como valor', () => {
    // El `placeholder` visual, si lo hubiera, no es un valor: los cuatro salen vacíos.
    expect(html.match(/<textarea[^>]*><\/textarea>/g)).toHaveLength(4);
  });
});

describe('checklist de publicación', () => {
  it('no pide nada opcional y lo dice en voz alta', () => {
    const html = renderToStaticMarkup(
      <PublicationChecklist readiness={{ ready: false, missing: ['short_description'] }} />,
    );

    expect(html).toContain('Falta la descripción corta');
    expect(html).toContain('href="#seccion-contenido">Descripción');
    expect(html).toContain('son opcionales');

    // Los seis títulos que el panel dejó de tener al retirarlos el contrato de `missing`.
    for (const retired of [
      'Falta la descripción detallada',
      'Faltan las características',
      'Faltan los materiales',
      'Faltan las medidas',
      'Falta la garantía',
      'Faltan los cuidados',
    ]) {
      expect(html, retired).not.toContain(retired);
    }
  });

  it('listo para publicar también recuerda qué era opcional', () => {
    const html = renderToStaticMarkup(
      <PublicationChecklist readiness={{ ready: true, missing: [] }} />,
    );

    expect(html).toContain('Listo para publicar');
    expect(html).toContain('son opcionales');
  });

  it('enlaza cada requisito con la sección donde se resuelve', () => {
    const html = renderToStaticMarkup(
      <PublicationChecklist
        readiness={{ ready: false, missing: ['category', 'positive_price'] }}
      />,
    );

    // La categoría se elige del catálogo en su propia sección, fuera de Clasificación.
    expect(html).toContain('href="#seccion-categoria"');
    expect(html).toContain('href="#seccion-precio"');
  });
});
