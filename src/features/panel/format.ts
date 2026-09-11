/**
 * Formato de los datos del catálogo. Módulo puro.
 */

/**
 * Pesos colombianos.
 *
 * El contrato dice que `priceCop` son pesos enteros: «COP has no subdivision in use». Se fuerzan
 * cero decimales para no inventar una precisión que el dato no tiene.
 */
const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCop(value: number): string {
  return COP.format(value);
}

const DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

/** Fecha legible en la zona de la operación. Devuelve `—` si el backend manda algo ilegible. */
export function formatDateTime(value: string): string {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? '—' : DATE_TIME.format(parsed);
}
