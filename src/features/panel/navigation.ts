import { can, type Permission } from '@/features/session/permissions';

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
  /** Icono de `section-icon`, para que la barra lateral tenga la misma iconografía que las tarjetas. */
  readonly icon:
    | 'panel'
    | 'productos'
    | 'pedidos'
    | 'bandeja'
    | 'envios'
    | 'wallet'
    | 'usuarios'
    | 'configuracion';
  /**
   * Permiso sin el que la entrada no se pinta. Ausente = la ve cualquier rol.
   *
   * Es usabilidad: la pantalla vuelve a comprobarlo, y el backend rechaza igual una petición
   * fabricada.
   */
  readonly permission?: Permission;
};

/**
 * Las ocho entradas del panel, en este orden.
 *
 * Envíos y Wallet todavía no tienen contrato: sus pantallas existen, lo dicen y no fingen datos.
 * Están en la navegación porque el enlace lleva a un sitio real que explica en qué punto está, no a
 * un 404.
 *
 * **Configuración va la última y se llama así.** Es donde vive Integraciones, y el nombre es el que
 * entiende quien administra la tienda: una entrada llamada «dev_apis» o «integraciones técnicas»
 * describiría la implementación en vez de la tarea, que es «configurar con qué pasarela cobro».
 */
export const NAVIGATION: readonly NavigationItem[] = [
  { href: '/panel', label: 'Dashboard', icon: 'panel' },
  { href: '/panel/pedidos', label: 'Pedidos', icon: 'pedidos' },
  // La bandeja trae correos de personas: `moderator` no la ve.
  {
    href: '/panel/bandeja',
    label: 'Bandeja',
    icon: 'bandeja',
    permission: 'communications.read',
  },
  { href: '/panel/productos', label: 'Productos', icon: 'productos' },
  { href: '/panel/envios', label: 'Envíos', icon: 'envios' },
  { href: '/panel/wallet', label: 'Wallet', icon: 'wallet' },
  // Solo quien puede ver cuentas: `super_admin` y `master_admin`. `moderator` no la ve.
  {
    href: '/panel/usuarios',
    label: 'Usuarios',
    icon: 'usuarios',
    permission: 'admin_users.read',
  },
  { href: '/panel/configuracion', label: 'Configuración', icon: 'configuracion' },
];

/** Las entradas que este rol puede ver. Un rol desconocido solo ve las que no piden permiso. */
export function navigationFor(role: string): readonly NavigationItem[] {
  return NAVIGATION.filter((item) => item.permission === undefined || can(role, item.permission));
}

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
