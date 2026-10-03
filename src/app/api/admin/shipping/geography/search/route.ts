import 'server-only';

/**
 * `GET /api/admin/shipping/geography/search?q=`: municipios cuyo nombre oficial contiene el texto.
 *
 * El contrato publica la geografía por departamento y sin buscador. La búsqueda se hace aquí, en el
 * servidor, sobre la instantánea oficial cacheada, y devuelve como mucho {@link MAX} coincidencias:
 * el navegador nunca recibe los 1.122 municipios. Los resultados llevan su código DIVIPOLA, que es
 * lo único que se usa como identificador.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { normaliseText } from '@/features/shipping/zone-list';
import { handleQuery, queryError } from '@/features/session/query-route';
import { listAllMunicipalities } from '@/lib/api/shipping';

const MAX = 25;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const needle = normaliseText(request.nextUrl.searchParams.get('q') ?? '');

  if (needle.length < 2 || needle.length > 60) return queryError('invalid_request');

  return handleQuery(request, async () => {
    const all = await listAllMunicipalities();
    const starts = all.filter((municipality) =>
      normaliseText(municipality.name).startsWith(needle),
    );
    const contains = all.filter(
      (municipality) =>
        !normaliseText(municipality.name).startsWith(needle) &&
        normaliseText(municipality.name).includes(needle),
    );

    return { items: [...starts, ...contains].slice(0, MAX) };
  });
}
