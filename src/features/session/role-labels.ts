/**
 * Etiquetas en español de los roles administrativos.
 *
 * El contrato vigente (`openapi/backend-v1.json`, `AdminPrincipalDto.role`) publica los tres:
 * `super_admin`, `master_admin` y `moderator`. Las capacidades de cada uno viven en
 * `./permissions`, no aquí: esto es solo cómo se nombra el rol en pantalla.
 */

const ROLE_LABELS: Readonly<Record<string, string>> = {
  super_admin: 'Administración total',
  master_admin: 'Administración de operación',
  moderator: 'Moderación',
};

/** Devuelve la etiqueta del rol, o el propio identificador si el contrato añade uno nuevo. */
export function describeRole(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
