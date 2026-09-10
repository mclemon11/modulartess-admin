/**
 * Etiquetas en español de los roles administrativos.
 *
 * El contrato vigente (`openapi/backend-v1.json`, `AdminPrincipalDto.role`) publica **solo**
 * `super_admin`. `master_admin` y `moderator` están decididos en la ADR 0007 del backend, pero
 * todavía no están implementados ni aparecen en el contrato, así que aquí no se declaran: hacerlo
 * sugeriría que el panel ya los admite.
 */

const ROLE_LABELS: Readonly<Record<string, string>> = {
  super_admin: 'Administración total',
};

/** Devuelve la etiqueta del rol, o el propio identificador si el contrato añade uno nuevo. */
export function describeRole(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
