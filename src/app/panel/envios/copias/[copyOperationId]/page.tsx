import Link from 'next/link';

import catalog from '@/features/panel/catalog.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { RefreshButton } from '@/features/panel/refresh-button';
import { resolvePanelSession } from '@/features/panel/session-context';
import { sessionErrorFromBackendFailure } from '@/features/session/api-errors';
import { can } from '@/features/session/permissions';
import { CopyOperationActions } from '@/features/shipping/copy-operation-actions';
import { CopyOperationView } from '@/features/shipping/copy-operation-view';
import { describeShippingFailure } from '@/features/shipping/shipping-errors';
import { isBackendFailure } from '@/lib/api/errors';
import { getCopyOperation, getZone } from '@/lib/api/shipping';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Copia de zona' };

type PageProps = { readonly params: Promise<{ readonly copyOperationId: string }> };

const TRAIL = [
  { href: '/panel', label: 'Panel' },
  { href: '/panel/envios', label: 'Envíos' },
  { href: '/panel/envios?vista=copias', label: 'Copias' },
  { label: 'Operación' },
];

/**
 * Una operación de copia, leída **siempre** del backend por su `copyOperationId`.
 *
 * No depende de nada guardado en el navegador: recargar, cerrar y volver a abrir muestra lo mismo,
 * y reanudar o descartar funciona sin la `Idempotency-Key` original, que ni se guarda ni se muestra.
 */
export default async function CopyOperationPage({ params }: PageProps) {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  const { role, sessionMaterial } = session.session;
  const { copyOperationId } = await params;

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

  let operation;

  try {
    operation = await getCopyOperation(sessionMaterial, copyOperationId);
  } catch (error) {
    return (
      <>
        <PanelHeader trail={TRAIL} />
        <div className={catalog.page}>
          <PanelPageHeader title="Copia de zona" />
          <ErrorState
            action={
              <Link className={catalog.buttonSecondary} href="/panel/envios?vista=copias">
                Ver copias
              </Link>
            }
            message={
              isBackendFailure(error)
                ? describeShippingFailure(sessionErrorFromBackendFailure(error.code))
                : 'No pudimos leer la operación de copia.'
            }
            title="No pudimos leer la operación de copia"
          />
        </div>
      </>
    );
  }

  const source = await getZone(sessionMaterial, operation.sourceZoneId).catch(() => null);

  return (
    <>
      <PanelHeader trail={TRAIL} />
      <div className={catalog.page}>
        <PanelPageHeader
          actions={<RefreshButton label="Consultar de nuevo" />}
          lead="El progreso se lee del backend. Puedes cerrar esta página: la operación sigue aquí y se reanuda o se descarta igual."
          title={`Copia de «${source?.name ?? 'zona'}»`}
        />
        <CopyOperationView operation={operation} sourceName={source?.name ?? null} />
        <CopyOperationActions
          canManage={can(role, 'shipping.manage')}
          copyOperationId={operation.copyOperationId}
          state={operation.state}
        />
      </div>
    </>
  );
}
