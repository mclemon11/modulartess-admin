/**
 * Cuerpos que el navegador manda al BFF de cuentas, **cerrados**.
 *
 * Una clave de más —una contraseña, un UID, claims, `disabled`, `emailVerified`— invalida el
 * cuerpo entero en lugar de ignorarse: el backend rechazaría lo mismo, pero no hace falta que la
 * petición llegue hasta allí para saberlo. La validación de fondo sigue siendo del backend.
 */

import { ADMIN_ROLES, isAdminRole, type AdminRole } from '@/features/session/permissions';

/** Misma forma que exige el backend para `Idempotency-Key`. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const EMAIL_MAX = 254;
const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactly(raw: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(raw);
  return present.length === keys.length && present.every((key) => keys.includes(key));
}

function idempotencyKey(value: unknown): string | null {
  return typeof value === 'string' && IDEMPOTENCY_KEY.test(value) ? value : null;
}

function expectedVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
}

export type CreateUserInput = {
  readonly idempotencyKey: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: AdminRole;
};

export function parseCreateUser(raw: unknown): CreateUserInput | null {
  if (!isRecord(raw) || !hasExactly(raw, ['idempotencyKey', 'email', 'displayName', 'role'])) {
    return null;
  }

  const key = idempotencyKey(raw.idempotencyKey);
  const { email, displayName, role } = raw;

  if (key === null) return null;
  if (typeof email !== 'string') return null;

  const trimmedEmail = email.trim();

  // Una comprobación de forma, no una validación de buzón: la hace el backend.
  if (trimmedEmail.length === 0 || trimmedEmail.length > EMAIL_MAX) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return null;
  if (typeof displayName !== 'string') return null;

  const trimmedName = displayName.trim();

  if (trimmedName.length < DISPLAY_NAME_MIN || trimmedName.length > DISPLAY_NAME_MAX) return null;
  if (!isAdminRole(role)) return null;

  return { idempotencyKey: key, email: trimmedEmail, displayName: trimmedName, role };
}

export type ChangeRoleInput = {
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly role: AdminRole;
};

export function parseChangeRole(raw: unknown): ChangeRoleInput | null {
  if (!isRecord(raw) || !hasExactly(raw, ['idempotencyKey', 'expectedVersion', 'role'])) {
    return null;
  }

  const key = idempotencyKey(raw.idempotencyKey);
  const version = expectedVersion(raw.expectedVersion);

  if (key === null || version === null || !isAdminRole(raw.role)) return null;

  return { idempotencyKey: key, expectedVersion: version, role: raw.role };
}

export type UserTransitionInput = {
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
};

export function parseUserTransition(raw: unknown): UserTransitionInput | null {
  if (!isRecord(raw) || !hasExactly(raw, ['idempotencyKey', 'expectedVersion'])) return null;

  const key = idempotencyKey(raw.idempotencyKey);
  const version = expectedVersion(raw.expectedVersion);

  return key === null || version === null
    ? null
    : { idempotencyKey: key, expectedVersion: version };
}

/** El identificador de una cuenta tal como lo publica el backend: sin barras ni rarezas. */
export function isUserId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export { ADMIN_ROLES };
