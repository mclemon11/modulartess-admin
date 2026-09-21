/**
 * Cómo se leen las cifras del dashboard.
 *
 * Aquí **no se calcula ninguna métrica**: el contrato dice que «every figure comes from real stored
 * data; nothing is estimated, sampled or generated», y derivar una sola en el panel abriría la
 * puerta a que la pantalla y el backend digan cosas distintas del mismo día. Lo único que se hace
 * es darles forma de texto.
 *
 * Lo delicado es `changePercent`, y por eso vive en una función pura con sus propias pruebas. El
 * contrato lo define así: número finito, `null` cuando el período anterior fue cero y el actual no
 * —«the change does not exist, and infinity is not a figure anyone can show»—, y `0` cuando los dos
 * fueron cero. Sustituir ese `null` por un cero sería inventar una comparación que nadie hizo, y
 * enseñar `Infinity`, `NaN` o un «100 %» de relleno sería peor.
 *
 * Módulo puro.
 */

/** Cómo se presenta un cambio porcentual, sin depender solo del color para decir la dirección. */
export type ChangeTone = 'up' | 'down' | 'flat' | 'unknown';

export type ChangeReading = {
  readonly tone: ChangeTone;
  /** El texto completo, con su flecha o su explicación. Nunca vacío. */
  readonly label: string;
  /** Lo mismo dicho en palabras, para quien no ve la flecha. */
  readonly description: string;
};

const PERCENT = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Lee un `changePercent` del contrato.
 *
 * `null` no es cero y no se convierte en cero: significa que no hay base anterior con la que
 * comparar. Un valor no finito no debería llegar —el contrato lo prohíbe—, pero si llegara se trata
 * como si no hubiera comparación en lugar de pintar `Infinity` en una tarjeta de ventas.
 */
export function readChange(changePercent: number | null): ChangeReading {
  if (changePercent === null || !Number.isFinite(changePercent)) {
    return {
      tone: 'unknown',
      label: 'Sin base anterior',
      description: 'No hay período anterior con el que comparar.',
    };
  }

  if (changePercent === 0) {
    return {
      tone: 'flat',
      label: 'Sin cambio',
      description: 'Igual que en el período anterior.',
    };
  }

  const magnitude = PERCENT.format(Math.abs(changePercent));

  return changePercent > 0
    ? {
        tone: 'up',
        label: `↑ ${magnitude} %`,
        description: `Sube ${magnitude} % frente al período anterior.`,
      }
    : {
        tone: 'down',
        label: `↓ ${magnitude} %`,
        description: `Baja ${magnitude} % frente al período anterior.`,
      };
}

/**
 * Cuenta simple con su plural.
 *
 * El contrato deja claro que `unitsSold` son unidades y no líneas —«one line with six chairs is six
 * units»—, así que el texto lo dice en las unidades que toca y no en «productos».
 */
export function countLabel(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}
