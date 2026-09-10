/**
 * Validación de `Origin` para las peticiones mutantes del BFF.
 *
 * Módulo puro. La comparación es **exacta y carácter a carácter** contra el origen configurado en
 * `MODULARTESS_ADMIN_ORIGIN`: sin comodines, sin coincidencia por sufijo y sin subdominios
 * implícitos. Una comparación por sufijo aceptaría `https://panel.modulartess.com.atacante.tld`.
 *
 * Un `Origin` ausente también se rechaza. En una petición `fetch` desde el propio panel el
 * navegador siempre lo envía; su ausencia significa que la petición no viene de ese camino.
 */

export const ORIGIN_HEADER = 'origin';

export type OriginCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'missing' | 'malformed' | 'mismatch' };

/**
 * Compara el `Origin` recibido con el autorizado.
 *
 * `allowedOrigin` llega ya canonizado por `readBackendConfig`, así que la comparación se hace
 * contra la forma canónica del valor recibido: `https://host:443` y `https://host` son el mismo
 * origen, y tratarlos como distintos sería un falso rechazo.
 */
export function checkOrigin(received: string | null, allowedOrigin: string): OriginCheck {
  if (received === null || received.trim().length === 0) {
    return { ok: false, reason: 'missing' };
  }

  const raw = received.trim();

  // `null` literal es lo que envía un contexto opaco (un iframe sandbox, por ejemplo).
  if (raw === 'null') {
    return { ok: false, reason: 'malformed' };
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  // Un `Origin` es esquema + host + puerto, y nada más. Cada una de estas comprobaciones se hace
  // de forma explícita en lugar de confiar en `url.origin`: ese descarta en silencio la ruta, la
  // consulta y el fragmento, así que `https://autorizado/ruta` produciría el mismo `origin` que
  // el valor legítimo y pasaría la comparación.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'malformed' };
  }

  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'malformed' };
  }

  if (url.hostname === '') {
    return { ok: false, reason: 'malformed' };
  }

  if (url.pathname !== '/') {
    return { ok: false, reason: 'malformed' };
  }

  if (url.search !== '') {
    return { ok: false, reason: 'malformed' };
  }

  if (url.hash !== '') {
    return { ok: false, reason: 'malformed' };
  }

  // Solo llegando aquí tiene sentido comparar la forma canónica, que conserva la equivalencia de
  // los puertos por defecto: `https://host:443` y `https://host` son el mismo origen.
  return url.origin === allowedOrigin ? { ok: true } : { ok: false, reason: 'mismatch' };
}
