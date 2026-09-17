/**
 * Contenido editorial del producto: descripción corta, descripción detallada y características.
 *
 * Módulo puro, sin React. Replica **solo** lo que publica el contrato —los topes de
 * `shortDescription`, `description` y `features`— para avisar antes de gastar una llamada y un
 * identity token en un cuerpo que ya se sabe que el backend rechaza. El backend sigue siendo la
 * autoridad: aquí no se inventa ninguna regla que OpenAPI no diga.
 *
 * Las características son `string[]` en el contrato y también aquí: el editor enseña filas para que
 * se puedan añadir, quitar y ordenar, pero lo que viaja es la misma lista de textos. Un modelo
 * paralelo con identificadores propios tendría que aplanarse antes de enviarlo y acabaría siendo
 * una segunda fuente de verdad.
 *
 * Los registros escritos antes de estos topes pueden ser más largos —el contrato lo dice—, así que
 * al abrir un producto antiguo el contador puede nacer en rojo. Es correcto: el tope se aplica a
 * las mutaciones nuevas, y guardar sin acortar sería rechazado.
 */

import {
  DESCRIPTION_MAX_LENGTH,
  FEATURE_MAX_LENGTH,
  FEATURES_MAX_ITEMS,
  SHORT_DESCRIPTION_MAX_LENGTH,
} from '@/lib/api/variant-limits';

/** Texto del contador que acompaña a cada campo con tope: «N de 180». */
export function counterLabel(used: number, max: number): string {
  return `${used} de ${max}`;
}

/**
 * Problema de la descripción corta, o `null` si no lo hay.
 *
 * Comprueba **solo** el tope. Que sea necesaria para publicar no se evalúa aquí: eso lo decide el
 * backend y llega como el código `short_description` de `publicationReadiness`. Repetir esa regla
 * en el panel acabaría contradiciéndola, que es justo lo que el checklist existe para evitar. La
 * etiqueta del campo sí lo dice, porque describir el contrato no es volver a aplicarlo.
 */
export function shortDescriptionProblem(value: string): string | null {
  return value.trim().length > SHORT_DESCRIPTION_MAX_LENGTH
    ? `La descripción corta supera los ${SHORT_DESCRIPTION_MAX_LENGTH} caracteres.`
    : null;
}

/** Problema de la descripción detallada, o `null`. Vacía es válida: el contrato la deja opcional. */
export function descriptionProblem(value: string): string | null {
  return value.trim().length > DESCRIPTION_MAX_LENGTH
    ? `La descripción detallada supera los ${DESCRIPTION_MAX_LENGTH} caracteres.`
    : null;
}

/**
 * Forma comparable de una característica: sin acentos, en minúsculas y sin espacios de sobra.
 *
 * El contrato pide que no haya duplicados «once accent- and case-folded»; esto es esa misma
 * normalización, y solo se usa para comparar. Lo que se envía es el texto tal y como se escribió.
 */
function fold(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Lo que viaja en `features`: sin espacios de sobra, sin líneas vacías y **en el mismo orden**. */
export function submittedFeatures(rows: readonly string[]): readonly string[] {
  return rows.map((row) => row.trim()).filter((row) => row.length > 0);
}

export type FeatureProblems = {
  /** Problema de la lista entera: hoy solo el exceso de filas. */
  readonly general: string | null;
  /** Problema de cada fila, en su posición. `null` donde no lo hay. */
  readonly byRow: readonly (string | null)[];
};

/** Problemas de las características, separados por fila para poder pintarlos junto a su campo. */
export function featureProblems(rows: readonly string[]): FeatureProblems {
  const seen = new Set<string>();
  const byRow = rows.map((row) => {
    const trimmed = row.trim();

    if (trimmed.length === 0) {
      // Una fila vacía no se envía: no es un error, es una fila que sobra.
      return null;
    }

    if (trimmed.length > FEATURE_MAX_LENGTH) {
      return `Máximo ${FEATURE_MAX_LENGTH} caracteres por característica.`;
    }

    const key = fold(trimmed);

    // La primera aparición es la buena; la repetida es la que se marca.
    if (seen.has(key)) {
      return 'Esta característica está repetida.';
    }

    seen.add(key);

    return null;
  });

  return {
    general:
      submittedFeatures(rows).length > FEATURES_MAX_ITEMS
        ? `Máximo ${FEATURES_MAX_ITEMS} características.`
        : null,
    byRow,
  };
}

/** `true` cuando alguna característica impide guardar. */
export function hasFeatureProblems(problems: FeatureProblems): boolean {
  return problems.general !== null || problems.byRow.some((problem) => problem !== null);
}

/** Añade una fila vacía al final. No añade nada una vez alcanzado el tope del contrato. */
export function addFeatureRow(rows: readonly string[]): readonly string[] {
  return rows.length >= FEATURES_MAX_ITEMS ? rows : [...rows, ''];
}

/** Quita una fila por su posición. El resto conserva su orden. */
export function removeFeatureRow(rows: readonly string[], index: number): readonly string[] {
  return rows.filter((_, position) => position !== index);
}

/** Escribe una fila por su posición, sin tocar las demás. */
export function setFeatureRow(
  rows: readonly string[],
  index: number,
  value: string,
): readonly string[] {
  return rows.map((row, position) => (position === index ? value : row));
}

/**
 * Mueve una fila una posición arriba o abajo.
 *
 * El orden es dato: la franja de beneficios de la ficha pinta las características en el orden en el
 * que llegan. Un movimiento fuera de rango devuelve la lista tal cual.
 */
export function moveFeatureRow(
  rows: readonly string[],
  index: number,
  direction: -1 | 1,
): readonly string[] {
  const target = index + direction;

  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) {
    return rows;
  }

  const next = [...rows];
  const moved = next[index] as string;

  next[index] = next[target] as string;
  next[target] = moved;

  return next;
}
