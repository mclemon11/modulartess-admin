/**
 * Exportación CSV del listado de pedidos, del lado del panel.
 *
 * El archivo lo compone el backend: todas las páginas del filtro activo, sus columnas, sus
 * etiquetas y la protección contra fórmulas. Aquí solo se pide al BFF, se interpreta el desenlace y
 * se entrega el archivo al navegador. El contenido **no se lee**, no se guarda en `localStorage` ni
 * en `sessionStorage` y no se escribe en la consola.
 *
 * El navegador recibe un único archivo, nunca páginas de pedidos: la cantidad por página de la
 * tabla no interviene en la exportación.
 */

/** Forma cerrada del nombre que publica el backend. Cualquier otra cosa se sustituye. */
const FILENAME_SHAPE = /filename="(pedidos-modulartess-[a-z0-9-]{1,80}\.csv)"/;

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Nombre del archivo: el del backend si tiene la forma esperada; si no, uno equivalente con el día
 * de Colombia. El estado del nombre de respaldo es el valor técnico, sin etiquetas propias.
 */
export function exportFilenameFromDisposition(
  disposition: string | null,
  status: string | null,
  now: Date = new Date(),
): string {
  const match = disposition === null ? null : FILENAME_SHAPE.exec(disposition);
  if (match?.[1] !== undefined) return match[1];
  const filter = status === null ? '' : `estado-${status.replaceAll('_', '-')}-`;
  return `pedidos-modulartess-${filter}${DAY_FORMAT.format(now)}.csv`;
}

export const EXPORT_FAILED_MESSAGE =
  'No pudimos exportar los pedidos. Vuelve a intentarlo en unos minutos.';

export type OrderExportOutcome =
  | {
      readonly kind: 'file';
      readonly blob: Blob;
      readonly filename: string;
      readonly count: number | null;
    }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error'; readonly message: string };

/** Mensaje del BFF si lo hay: es un texto fijo en español, nunca el del backend. */
async function failureMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as { message: unknown };
      if (typeof message === 'string' && message.length > 0) return message;
    }
  } catch {
    // Sin cuerpo legible: queda el mensaje genérico.
  }
  return EXPORT_FAILED_MESSAGE;
}

/** Pide al BFF la exportación de todos los pedidos con este filtro (`null`: todos). */
export async function requestOrderExport(
  status: string | null,
  fetcher: typeof fetch = fetch,
): Promise<OrderExportOutcome> {
  const query = status === null ? '' : `?${new URLSearchParams({ status }).toString()}`;
  let response: Response;

  try {
    response = await fetcher(`/api/admin/orders/export${query}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    return { kind: 'error', message: EXPORT_FAILED_MESSAGE };
  }

  if (response.status === 204) return { kind: 'empty' };
  if (!response.ok) return { kind: 'error', message: await failureMessage(response) };

  try {
    const blob = await response.blob();
    if (blob.size === 0) return { kind: 'empty' };
    const rawCount = response.headers.get('x-order-export-count');
    return {
      kind: 'file',
      blob,
      filename: exportFilenameFromDisposition(response.headers.get('content-disposition'), status),
      count: rawCount !== null && /^[0-9]{1,6}$/.test(rawCount) ? Number(rawCount) : null,
    };
  } catch {
    return { kind: 'error', message: EXPORT_FAILED_MESSAGE };
  }
}

/** Entrega el archivo al navegador como descarga, sin abrir otra pestaña ni dejar la URL viva. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Después del clic: revocarla en el mismo turno cancela la descarga en algunos navegadores.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const countFormat = new Intl.NumberFormat('es-CO');

/** «Se exportaron 126 pedidos.» */
export function exportDoneMessage(count: number | null): string {
  if (count === null) return 'Exportación lista.';
  return count === 1
    ? 'Se exportó 1 pedido.'
    : `Se exportaron ${countFormat.format(count)} pedidos.`;
}

export function exportEmptyMessage(filtered: boolean): string {
  return filtered
    ? 'No hay pedidos con este estado para exportar. No se descargó ningún archivo.'
    : 'No hay pedidos para exportar. No se descargó ningún archivo.';
}
