/**
 * Validación de los cuerpos que el BFF de la bandeja acepta del navegador.
 *
 * Solo la forma que publica el contrato, con cuerpos cerrados: una clave de más se rechaza con
 * `400` sin gastar una llamada. Qué acción cabe en qué estado lo decide el backend.
 *
 * Módulo puro.
 */

import type { ConversationStatus, ReclassifyChannel } from '@/lib/api/communications';

import { STATUSES, WORK_CHANNELS } from './inbox-labels';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
export const REPLY_TEXT_MAX = 20_000;

function record(raw: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;

  return Object.keys(body).every((key) => keys.includes(key)) ? body : null;
}

function version(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : null;
}

export function isResourceId(value: string): boolean {
  return ID.test(value);
}

/** `read` no lleva datos: el cuerpo es `{}` y nada más. */
export function parseMarkRead(raw: unknown): Record<string, never> | null {
  const body = record(raw, []);

  return body === null ? null : {};
}

export type AssignInput = {
  readonly expectedVersion: number;
  /** El navegador no conoce ningún UID: pide «a mí» o «a nadie», y el BFF resuelve el suyo. */
  readonly assignee: 'me' | 'none';
};

export function parseAssign(raw: unknown): AssignInput | null {
  const body = record(raw, ['expectedVersion', 'assignee']);
  const expectedVersion = version(body?.expectedVersion);
  const assignee = body?.assignee;

  if (expectedVersion === null || (assignee !== 'me' && assignee !== 'none')) return null;

  return { expectedVersion, assignee };
}

export function parseStatus(
  raw: unknown,
): { readonly expectedVersion: number; readonly status: ConversationStatus } | null {
  const body = record(raw, ['expectedVersion', 'status']);
  const expectedVersion = version(body?.expectedVersion);
  const status = body?.status;

  if (
    expectedVersion === null ||
    typeof status !== 'string' ||
    !(STATUSES as readonly string[]).includes(status)
  ) {
    return null;
  }

  return { expectedVersion, status: status as ConversationStatus };
}

export function parseOrderLink(
  raw: unknown,
): { readonly expectedVersion: number; readonly orderId: string | null } | null {
  const body = record(raw, ['expectedVersion', 'orderId']);
  const expectedVersion = version(body?.expectedVersion);
  const orderId = body?.orderId;

  if (expectedVersion === null) return null;
  if (orderId === null) return { expectedVersion, orderId: null };
  if (typeof orderId !== 'string') return null;

  const trimmed = orderId.trim();

  return ID.test(trimmed) ? { expectedVersion, orderId: trimmed } : null;
}

export function parseReclassify(
  raw: unknown,
): { readonly expectedVersion: number; readonly channel: ReclassifyChannel } | null {
  const body = record(raw, ['expectedVersion', 'channel']);
  const expectedVersion = version(body?.expectedVersion);
  const channel = body?.channel;

  if (
    expectedVersion === null ||
    typeof channel !== 'string' ||
    !(WORK_CHANNELS as readonly string[]).includes(channel)
  ) {
    return null;
  }

  return { expectedVersion, channel: channel as ReclassifyChannel };
}

export type ReplyInput = {
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly text: string;
};

/** El remitente no viaja: sale del alias de la cola, y el backend no deja elegirlo. */
export function parseReply(raw: unknown): ReplyInput | null {
  const body = record(raw, ['idempotencyKey', 'expectedVersion', 'text']);
  const expectedVersion = version(body?.expectedVersion);
  const key = body?.idempotencyKey;
  const text = body?.text;

  if (
    expectedVersion === null ||
    typeof key !== 'string' ||
    !IDEMPOTENCY_KEY.test(key) ||
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > REPLY_TEXT_MAX
  ) {
    return null;
  }

  return { idempotencyKey: key, expectedVersion, text };
}
