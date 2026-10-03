import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { resolvePanelSession } from '@/features/panel/session-context';
import { sessionErrorFromBackendFailure } from '@/features/session/api-errors';
import { can } from '@/features/session/permissions';
import { PreviewTool, type PreviewZone } from '@/features/shipping/preview-tool';
import { describeShippingFailure } from '@/features/shipping/shipping-errors';
import { isBackendFailure } from '@/lib/api/errors';
import { getZone, listDepartments, listZones } from '@/lib/api/shipping';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Vista previa de envío' };

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Borradores que se ofrecen para incluir: los más recientes. */
const DRAFTS_PAGE = 50;

const TRAIL = [
  { href: '/panel', label: 'Panel' },
  { href: '/panel/envios', label: 'Envíos' },
  { label: 'Vista previa' },
];

/**
 * Herramienta de vista previa (`shipping.read`). No crea pedidos ni modifica datos: el contrato
 * dice «Creates nothing», y funciona incluso con las cotizaciones de la tienda apagadas, para probar
 * zonas antes de activarlas.
 */
export default async function PreviewPage({ searchParams }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const { role, sessionMaterial } = session.session;

  if (!can(role, 'shipping.read')) {
    return (
      <>
        <PanelHeader trail={TRAIL} />
        <div className={catalog.page}>
          <ErrorState message="Tu rol no consulta zonas de envío." title="Sin acceso a envíos" />
        </div>
      </>
    );
  }

  const borrador = (await searchParams).borrador;
  const requested = (Array.isArray(borrador) ? borrador : borrador === undefined ? [] : [borrador])
    .filter((value) => /^[A-Za-z0-9_-]{1,128}$/.test(value))
    .slice(0, 20);

  let departments;
  let draftPage;

  try {
    [departments, draftPage] = await Promise.all([
      listDepartments(),
      // Una página de borradores listos, los más recientes. No se recorren todas las zonas.
      listZones(sessionMaterial, {
        view: 'current',
        status: 'draft',
        copyState: 'ready',
        pageSize: DRAFTS_PAGE,
      }),
    ]);
  } catch (error) {
    return (
      <>
        <PanelHeader trail={TRAIL} />
        <div className={catalog.page}>
          <PanelPageHeader title="Vista previa de envío" />
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel/envios/vista-previa">
                Reintentar
              </Link>
            }
            message={
              isBackendFailure(error)
                ? describeShippingFailure(sessionErrorFromBackendFailure(error.code))
                : 'No pudimos preparar la vista previa.'
            }
            title="No pudimos preparar la vista previa"
          />
        </div>
      </>
    );
  }

  const drafts: PreviewZone[] = draftPage.items.map((zone) => ({
    id: zone.id,
    name: zone.name,
    version: zone.version,
    status: zone.status,
  }));
  // Un borrador pedido por la URL que no está en la primera página se lee por su id.
  for (const zoneId of requested) {
    if (drafts.some((draft) => draft.id === zoneId)) continue;

    const zone = await getZone(sessionMaterial, zoneId).catch(() => null);

    if (zone !== null && zone.status === 'draft' && zone.copy.state === 'ready') {
      drafts.unshift({ id: zone.id, name: zone.name, version: zone.version, status: zone.status });
    }
  }
  const draftIds = new Set(drafts.map((draft) => draft.id));

  return (
    <>
      <PanelHeader trail={TRAIL} />
      <div className={catalog.page}>
        <PanelPageHeader
          actions={
            <Link className={catalog.buttonSecondary} href="/panel/envios">
              Volver a envíos
            </Link>
          }
          lead="Comprueba qué regla gana, en qué nivel y con qué zona, para un destino y un carrito concretos."
          title="Vista previa de envío"
        />
        <PreviewTool
          departments={departments.items}
          drafts={drafts}
          initialDraftIds={requested.filter((value) => draftIds.has(value))}
          moreDrafts={draftPage.nextPageToken !== null}
        />
      </div>
    </>
  );
}
