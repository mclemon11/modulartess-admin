/**
 * Categorías de producto entre la pantalla y el BFF. Módulo puro.
 *
 * Dos cosas: proponer el slug desde el nombre y estrechar el cuerpo del alta antes de gastar la
 * llamada. **No sustituye al backend**: él normaliza el slug, compara los nombres sin tildes ni
 * mayúsculas y decide si algo choca. Esto solo evita mandar lo que ya se sabe que no tiene forma.
 */

import { toSlug } from './slug';

/** Topes que publica el contrato para `CreateProductCategoryRequestDto`. */
export const CATEGORY_NAME_MAX_LENGTH = 80;
export const CATEGORY_SLUG_MAX_LENGTH = 60;

/** Minúsculas, dígitos y guiones sueltos, sin guion al principio ni al final: kebab-case. */
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slug propuesto desde el nombre, recortado al tope del contrato.
 *
 * Es una **propuesta**: se enseña para revisarla antes de crear, porque después ya no se puede
 * cambiar. Al recortar no se deja un guion colgando al final.
 */
export function proposeCategorySlug(name: string): string {
  return toSlug(name).slice(0, CATEGORY_SLUG_MAX_LENGTH).replace(/-+$/g, '');
}

export type CategoryDraftProblems = {
  readonly name?: string;
  readonly slug?: string;
};

export function categoryDraftProblems(name: string, slug: string): CategoryDraftProblems {
  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  const problems: { name?: string; slug?: string } = {};

  if (trimmedName.length === 0) {
    problems.name = 'Escribe el nombre de la categoría.';
  } else if (trimmedName.length > CATEGORY_NAME_MAX_LENGTH) {
    problems.name = `El nombre admite hasta ${CATEGORY_NAME_MAX_LENGTH} caracteres.`;
  }

  if (trimmedSlug.length === 0) {
    problems.slug = 'El slug es obligatorio.';
  } else if (trimmedSlug.length > CATEGORY_SLUG_MAX_LENGTH) {
    problems.slug = `El slug admite hasta ${CATEGORY_SLUG_MAX_LENGTH} caracteres.`;
  } else if (!CATEGORY_SLUG_PATTERN.test(trimmedSlug)) {
    problems.slug =
      'Solo minúsculas, números y guiones sueltos, sin guion al principio ni al final.';
  }

  return problems;
}

export function hasCategoryDraftProblems(problems: CategoryDraftProblems): boolean {
  return problems.name !== undefined || problems.slug !== undefined;
}

/**
 * Cuerpo del alta, campo a campo.
 *
 * Se construye con **solo** `name` y `slug`, recortados: una propiedad de más no viaja al backend.
 */
export function parseCreateCategory(raw: unknown): { name: string; slug: string } | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  const body = raw as Record<string, unknown>;

  if (typeof body.name !== 'string' || typeof body.slug !== 'string') return null;

  const name = body.name.trim();
  const slug = body.slug.trim();

  return hasCategoryDraftProblems(categoryDraftProblems(name, slug)) ? null : { name, slug };
}

/** `expectedVersion`: entero mayor o igual que uno, como declara el contrato. */
function expectedVersion(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : null;
}

/** Cuerpo del renombrado: el nombre nuevo y la versión leída. El slug no viaja: no cambia nunca. */
export function parseRenameCategory(
  raw: unknown,
): { name: string; expectedVersion: number } | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  const body = raw as Record<string, unknown>;
  const version = expectedVersion(body.expectedVersion);

  if (version === null || typeof body.name !== 'string') return null;

  const name = body.name.trim();

  return name.length === 0 || name.length > CATEGORY_NAME_MAX_LENGTH
    ? null
    : { name, expectedVersion: version };
}

/** Cuerpo de archivar y reactivar: solo la versión leída. */
export function parseCategoryTransition(raw: unknown): { expectedVersion: number } | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  const version = expectedVersion((raw as Record<string, unknown>).expectedVersion);

  return version === null ? null : { expectedVersion: version };
}
