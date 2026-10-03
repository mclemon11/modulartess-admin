import catalog from '@/features/panel/catalog.module.css';
import { PanelHeader } from '@/features/panel/panel-header';
import { PanelPageHeader } from '@/features/panel/panel-page-header';
import { ErrorState } from '@/features/panel/panel-states';
import { resolvePanelSession } from '@/features/panel/session-context';
import { can } from '@/features/session/permissions';
import { ZoneInfoForm } from '@/features/shipping/zone-info-form';
import { ZoneSteps } from '@/features/shipping/zone-steps';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Nueva zona de envío' };

const TRAIL = [
  { href: '/panel', label: 'Panel' },
  { href: '/panel/envios', label: 'Envíos' },
  { label: 'Nueva zona' },
];

/**
 * Paso 1 de una zona nueva. Guardarlo crea la zona en **borrador**, sin cobertura ni reglas, y lleva
 * al paso de cobertura. Hasta entonces los demás pasos no existen.
 */
export default async function NewZonePage() {
  const session = await resolvePanelSession();

  if (session.kind !== 'active') return null;

  if (!can(session.session.role, 'shipping.manage')) {
    return (
      <>
        <PanelHeader trail={TRAIL} />
        <div className={catalog.page}>
          <PanelPageHeader title="Nueva zona" />
          <ErrorState
            message="Tu rol consulta envíos en modo de solo lectura: no puede crear zonas."
            title="Sin permiso para crear zonas"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader trail={TRAIL} />
      <div className={catalog.page}>
        <PanelPageHeader
          lead="La zona nace como borrador: no cotiza hasta que la actives, después de darle cobertura y tarifas."
          title="Nueva zona de envío"
        />
        <ZoneSteps current="informacion" zoneId={null} />
        <ZoneInfoForm readOnly={false} zone={null} />
      </div>
    </>
  );
}
