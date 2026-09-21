import { describe, expect, it } from 'vitest';

import { countLabel, readChange } from './dashboard-metrics';

/**
 * El cambio porcentual.
 *
 * Es la cifra del dashboard que más fácil se presenta mal, y las tres formas de hacerlo tienen
 * consecuencias: convertir `null` en `0 %` inventa una comparación que nadie hizo, enseñar
 * `Infinity` o `NaN` parece un fallo del panel, y rellenar con un «100 %» es directamente una cifra
 * falsa. El contrato ya deja `changePercent` resuelto; aquí solo se le da forma de texto.
 */

describe('cambio positivo', () => {
  it('lleva flecha arriba y el porcentaje con un decimal', () => {
    expect(readChange(12.5)).toMatchObject({ tone: 'up', label: '↑ 12,5 %' });
  });

  it('redondea a un decimal sin perder el signo', () => {
    expect(readChange(0.04).label).toBe('↑ 0,0 %');
    expect(readChange(0.04).tone).toBe('up');
  });

  it('la descripción dice la dirección en palabras', () => {
    expect(readChange(12.5).description).toContain('Sube');
  });
});

describe('cambio negativo', () => {
  it('lleva flecha abajo y la magnitud sin el signo menos', () => {
    expect(readChange(-8.3)).toMatchObject({ tone: 'down', label: '↓ 8,3 %' });
  });

  it('la descripción dice la dirección en palabras', () => {
    expect(readChange(-8.3).description).toContain('Baja');
  });
});

describe('sin cambio', () => {
  /* Cero es una comparación válida: los dos períodos fueron iguales. */
  it('se dice con palabras, no con «0 %»', () => {
    expect(readChange(0)).toMatchObject({ tone: 'flat', label: 'Sin cambio' });
  });
});

describe('sin base anterior', () => {
  /*
   * `null` significa que el período anterior fue cero y el actual no: el cambio **no existe**.
   * Pintarlo como `0 %` diría que no hubo variación cuando la hubo entera.
   */
  it('null no se convierte en cero', () => {
    const reading = readChange(null);

    expect(reading.tone).toBe('unknown');
    expect(reading.label).toBe('Sin base anterior');
    expect(reading.label).not.toContain('0');
    expect(reading.label).not.toContain('%');
  });

  it('su color no sugiere una dirección', () => {
    expect(readChange(null).tone).not.toBe('up');
    expect(readChange(null).tone).not.toBe('down');
  });
});

describe('valores que el contrato prohíbe', () => {
  /*
   * No deberían llegar —«as a finite number»—, pero si llegaran, `Infinity` en una tarjeta de
   * ventas es peor que decir que no hay comparación.
   */
  it.each([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
    '%p se trata como ausencia de comparación',
    (value) => {
      const reading = readChange(value);

      expect(reading.tone).toBe('unknown');
      expect(reading.label).not.toContain('Infinity');
      expect(reading.label).not.toContain('NaN');
      expect(reading.label).not.toContain('∞');
    },
  );
});

describe('ninguna lectura queda muda', () => {
  it.each([12.5, -8.3, 0, null])('%p produce etiqueta y descripción', (value) => {
    const reading = readChange(value);

    expect(reading.label.length).toBeGreaterThan(0);
    expect(reading.description.length).toBeGreaterThan(0);
  });
});

describe('plurales', () => {
  it('distingue el singular del plural', () => {
    expect(countLabel(1, 'unidad', 'unidades')).toBe('1 unidad');
    expect(countLabel(0, 'unidad', 'unidades')).toBe('0 unidades');
    expect(countLabel(6, 'unidad', 'unidades')).toBe('6 unidades');
  });
});
