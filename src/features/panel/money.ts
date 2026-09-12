/**
 * Pesos colombianos: único sitio donde se convierte entre lo que se escribe y lo que viaja.
 *
 * El contrato es explícito: «Whole Colombian pesos, as an integer. 1450000 means one million four
 * hundred and fifty thousand pesos. Never a decimal: COP has no subdivision in use… The currency
 * symbol and the thousand separators belong to the frontend, which renders this value as
 * "$ 1.450.000"».
 *
 * De ahí las dos direcciones:
 *
 *   - `parseCop` convierte texto a entero, o dice **por qué** no puede. Nunca devuelve `NaN` ni
 *     adivina: una entrada ambigua se rechaza en vez de interpretarse, porque interpretarla mal
 *     cambia el precio por un factor de mil.
 *   - `formatCop` produce `$ 1.450.000` y nada más. Sin «COP» al lado, sin decimales.
 *
 * Al backend solo va el entero. El texto formateado no sale de la pantalla.
 *
 * Módulo puro.
 */

/** Máximo que admite `priceCop`, declarado como `int32` en el contrato. */
export const MAX_COP = 2_147_483_647;

export type CopProblem =
  /** No hay nada escrito. */
  | 'empty'
  /** Céntimos: el peso colombiano no tiene subdivisión en uso. */
  | 'decimals'
  /** Negativo. */
  | 'negative'
  /** Letras u otros signos que no son dígitos ni separadores de miles. */
  | 'not_a_number'
  /** Separadores de miles mal agrupados: `1.45` puede ser 145 o 1,45 y no se adivina. */
  | 'ambiguous'
  /** Fuera del rango que admite el contrato. */
  | 'too_large';

export type CopParse =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly problem: CopProblem };

const MESSAGES: Readonly<Record<CopProblem, string>> = {
  empty: 'Escribe el precio en pesos.',
  decimals: 'Sin centavos: el peso colombiano no usa decimales.',
  negative: 'El precio no puede ser negativo.',
  not_a_number: 'Solo dígitos y puntos de miles. Ejemplo: 1.450.000',
  ambiguous: 'Agrupa los miles de tres en tres. Ejemplo: 1.450.000',
  too_large: 'Ese precio supera el máximo que admite el catálogo.',
};

export function describeCopProblem(problem: CopProblem): string {
  return MESSAGES[problem];
}

/** Separadores de miles admitidos al escribir: punto, espacio normal y espacio duro. */
const SEPARATORS = /[\s ']/g;

/**
 * Convierte lo escrito a pesos enteros.
 *
 * Admite `1450000`, `1.450.000` y `$ 1.450.000`. Rechaza la coma sin mirar qué hay detrás: en
 * español es el separador decimal, y un precio con decimales no existe en este catálogo.
 */
export function parseCop(raw: string): CopParse {
  const cleaned = raw.replace(/^\s*\$/, '').replace(SEPARATORS, '');

  if (cleaned.length === 0) {
    return { ok: false, problem: 'empty' };
  }

  if (cleaned.startsWith('-')) {
    return { ok: false, problem: 'negative' };
  }

  if (cleaned.includes(',')) {
    return { ok: false, problem: 'decimals' };
  }

  const groups = cleaned.split('.');

  if (!groups.every((group) => /^\d+$/.test(group))) {
    return { ok: false, problem: 'not_a_number' };
  }

  if (groups.length > 1) {
    const [first, ...rest] = groups;

    // `1.450.000` es válido; `1.45`, `12.3456` o `1.450.00` no dicen qué se quiso escribir.
    if (first === undefined || first.length === 0 || first.length > 3) {
      return { ok: false, problem: 'ambiguous' };
    }

    if (!rest.every((group) => group.length === 3)) {
      return { ok: false, problem: 'ambiguous' };
    }
  }

  const digits = groups.join('');
  const value = Number(digits);

  if (!Number.isInteger(value)) {
    return { ok: false, problem: 'not_a_number' };
  }

  if (value > MAX_COP) {
    return { ok: false, problem: 'too_large' };
  }

  return { ok: true, value };
}

/**
 * Agrupa los miles con punto, sin símbolo.
 *
 * Se construye con `Intl` sobre un número **normal**, no con `style: 'currency'`: el formato de
 * moneda depende de los datos ICU del entorno y en algunos devuelve `COP 1.450.000`, que es
 * justamente lo que no se quiere mostrar.
 */
const GROUPED = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

export function groupCop(value: number): string {
  return GROUPED.format(Math.trunc(value));
}

/** `$ 1.450.000`. El espacio es duro para que el símbolo no quede solo al final de una línea. */
export function formatCop(value: number): string {
  return `$ ${groupCop(value)}`;
}

/**
 * Normaliza lo escrito para volver a pintarlo en el campo al perder el foco.
 *
 * Si no se puede convertir se devuelve tal cual: corregirlo a la fuerza escondería el error, y el
 * campo ya muestra el motivo debajo.
 */
export function normaliseCopInput(raw: string): string {
  const parsed = parseCop(raw);

  return parsed.ok ? groupCop(parsed.value) : raw;
}
