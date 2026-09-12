/**
 * Formato de los datos del catálogo. Módulo puro.
 *
 * El dinero **no** está aquí: vive en `./money`, que es el único sitio donde se convierte entre
 * pesos enteros y texto, en las dos direcciones. Tener dos formateadores de precio acabaría con
 * dos formatos distintos en pantalla.
 */

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
