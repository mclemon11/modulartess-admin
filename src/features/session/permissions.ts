/**
 * Permisos administrativos por rol.
 *
 * Modelo **explícito y tipado**: cada rol declara el conjunto exacto de permisos que tiene. No hay
 * jerarquía numérica ni herencia. Una escala tipo «master_admin ≥ moderator» parece cómoda hasta
 * que aparece el primer permiso que el rol superior no debe tener —aquí, las eliminaciones
 * permanentes—, y entonces la escala miente.
 *
 * Esto decide **qué se muestra**. La autoridad es el backend: rechaza cualquier petición que no
 * corresponda al rol, venga de donde venga. Ocultar un botón es usabilidad, no seguridad.
 */

export const ADMIN_ROLES = ['super_admin', 'master_admin', 'moderator'] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Permisos de las superficies que ya existen o están a punto de existir. */
export const PERMISSIONS = [
  'dashboard.read',
  'orders.read',
  'orders.update_status',
  'orders.cancel',
  'products.read',
  'products.create',
  'products.update',
  'products.publish',
  'products.archive',
  'inventory.read',
  'inventory.adjust',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MODERATOR: readonly Permission[] = [
  'dashboard.read',
  // Mueve el trabajo del día —prepara, despacha, entrega— pero no cancela: cancelar es
  // irreversible, y `moderator` no hace nada irreversible.
  'orders.read',
  'orders.update_status',
  'products.read',
  'products.create',
  'products.update',
  'inventory.read',
  'inventory.adjust',
];

/**
 * `master_admin` añade sobre `moderator` las transiciones de estado del catálogo. Se enumeran, no
 * se derivan: si mañana `moderator` pierde un permiso, `master_admin` no debe perderlo con él.
 */
const MASTER_ADMIN: readonly Permission[] = [
  'dashboard.read',
  'orders.read',
  'orders.update_status',
  'orders.cancel',
  'products.read',
  'products.create',
  'products.update',
  'products.publish',
  'products.archive',
  'inventory.read',
  'inventory.adjust',
];

/** `super_admin` tiene acceso completo a lo que esta fase publica. */
const SUPER_ADMIN: readonly Permission[] = [...PERMISSIONS];

const BY_ROLE: Readonly<Record<AdminRole, readonly Permission[]>> = {
  super_admin: SUPER_ADMIN,
  master_admin: MASTER_ADMIN,
  moderator: MODERATOR,
};

/** Comprueba que un valor recibido es exactamente uno de los tres roles del contrato. */
export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

/**
 * ¿Este rol tiene este permiso?
 *
 * Un rol desconocido no tiene ninguno. Es la respuesta cerrada correcta: si el backend empezara a
 * emitir un rol que el panel no conoce, la interfaz se queda sin acciones en lugar de mostrarlas
 * todas.
 */
export function can(role: string, permission: Permission): boolean {
  return isAdminRole(role) ? BY_ROLE[role].includes(permission) : false;
}

/** Conjunto completo de permisos de un rol. Útil para pasar al cliente sin exponer la matriz. */
export function permissionsFor(role: string): readonly Permission[] {
  return isAdminRole(role) ? BY_ROLE[role] : [];
}
