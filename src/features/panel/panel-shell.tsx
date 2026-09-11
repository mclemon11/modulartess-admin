import type { ReactNode } from 'react';

import { PanelChrome } from './panel-chrome';

/**
 * Estructura común de todas las pantallas del panel.
 *
 * Server Component: solo compone. Toda la interactividad —el cajón móvil— vive en `PanelChrome`.
 *
 * Preparado para crecer: añadir pedidos, inventario, clientes o usuarios es una entrada en
 * `navigation.ts` y una carpeta bajo `src/app/panel/`. Ni este archivo ni los estilos cambian.
 */
export function PanelShell({
  role,
  children,
}: {
  readonly role: string;
  readonly children: ReactNode;
}) {
  return <PanelChrome role={role}>{children}</PanelChrome>;
}
