/**
 * Navegación del panel.
 *
 * Solo entran secciones que ya tienen pantalla. Un enlace a algo que no existe convierte la
 * navegación en una promesa, y el shell está pensado para crecer: añadir pedidos, inventario,
 * clientes o usuarios es añadir una entrada aquí y su carpeta bajo `src/app/panel/`.
 */

export type NavigationItem = {
  readonly href: string;
  readonly label: string;
};

export const NAVIGATION: readonly NavigationItem[] = [
  { href: '/panel', label: 'Panel' },
  { href: '/panel/productos', label: 'Productos' },
];

/**
 * ¿Esta entrada corresponde a la ruta actual?
 *
 * `/panel` solo coincide exacto; las demás también con sus subrutas, para que `/panel/productos/x`
 * mantenga «Productos» resaltado.
 */
export function isActive(href: string, pathname: string): boolean {
  return href === '/panel'
    ? pathname === '/panel'
    : pathname === href || pathname.startsWith(`${href}/`);
}
