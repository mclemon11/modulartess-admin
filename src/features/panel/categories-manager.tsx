'use client';

import { useId, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import type { ProductCategory } from '@/lib/api/categories';

import styles from './catalog.module.css';
import { createCategory, renameCategory, transitionCategory } from './catalog-client';
import { describeCatalogFailure } from './catalog-errors';
import {
  categoryDraftProblems,
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_SLUG_MAX_LENGTH,
  hasCategoryDraftProblems,
  proposeCategorySlug,
} from './category-input';
import {
  CATEGORY_STATUS_FILTERS,
  describeProductCount,
  filterCategories,
  pageOf,
  replaceCategory,
  type CategoryStatusFilter,
} from './category-list';
import { EmptyState } from './panel-states';
import { SectionHeading } from './section-icon';

export type CategoryPermissions = {
  /** `products.update`: crear y renombrar. */
  readonly canEdit: boolean;
  /** `products.archive`: archivar y reactivar. */
  readonly canArchive: boolean;
};

/** Fallos que se arreglan releyendo: la categoría cambió o ya no existe. */
function refreshes(code: string): boolean {
  return code === 'category_version_conflict' || code === 'category_not_found';
}

/**
 * Gestión del catálogo de categorías.
 *
 * Todas las mutaciones sobre una categoría existente llevan la `expectedVersion` de la fila que se
 * está viendo, y la respuesta del backend **sustituye** la fila: no se adelanta nada en React. Un
 * conflicto relee la pantalla entera, porque la versión local ya no vale.
 *
 * El slug es **inmutable** después de crear: al crear se propone desde el nombre y se revisa antes
 * de enviar; después solo se enseña.
 *
 * Los permisos ocultan botones por usabilidad. La autoridad es el backend, que rechaza cualquier
 * petición fabricada.
 */
export function CategoriesManager({
  initial,
  permissions,
  truncated,
}: {
  readonly initial: readonly ProductCategory[];
  readonly permissions: CategoryPermissions;
  /** El catálogo no se leyó entero: la búsqueda solo abarca lo leído. */
  readonly truncated: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [items, setItems] = useState<readonly ProductCategory[]>(initial);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CategoryStatusFilter>('active');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* Candado síncrono: el estado de React no llega a tiempo de excluir un doble clic. */
  const running = useRef(false);

  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [createField, setCreateField] = useState<'name' | 'slug' | null>(null);
  const [createFailure, setCreateFailure] = useState<string | null>(null);
  const newNameInput = useRef<HTMLInputElement | null>(null);
  const newSlugInput = useRef<HTMLInputElement | null>(null);

  const [renaming, setRenaming] = useState<ProductCategory | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameFailure, setRenameFailure] = useState<string | null>(null);
  const renameDialog = useRef<HTMLDialogElement | null>(null);

  const [archiving, setArchiving] = useState<ProductCategory | null>(null);
  const archiveDialog = useRef<HTMLDialogElement | null>(null);

  const filtered = filterCategories(items, { query, status });
  const visible = pageOf(filtered, page);
  const createProblems = categoryDraftProblems(newName, newSlug);

  async function exclusive<T>(work: () => Promise<T>): Promise<T | null> {
    if (running.current) return null;

    running.current = true;
    setBusy(true);
    setFailure(null);
    setNotice(null);

    try {
      return await work();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function create() {
    if (hasCategoryDraftProblems(createProblems)) {
      const field = createProblems.name === undefined ? 'slug' : 'name';

      setCreateField(field);
      setCreateFailure(createProblems[field] ?? null);
      (field === 'name' ? newNameInput : newSlugInput).current?.focus();

      return;
    }

    const result = await exclusive(() =>
      createCategory({ name: newName.trim(), slug: newSlug.trim() }),
    );

    if (result === null) return;

    if (!result.ok) {
      const field =
        result.code === 'category_name_conflict'
          ? 'name'
          : result.code === 'category_slug_conflict'
            ? 'slug'
            : null;

      setCreateField(field);
      setCreateFailure(describeCatalogFailure(result.code, result.reference));
      if (field === 'name') newNameInput.current?.focus();
      if (field === 'slug') newSlugInput.current?.focus();

      return;
    }

    setItems((current) =>
      [...current, result.data].sort(
        (a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id),
      ),
    );
    setNewName('');
    setNewSlug('');
    setSlugTouched(false);
    setCreateField(null);
    setCreateFailure(null);
    setStatus('active');
    setNotice(`Categoría «${result.data.name}» creada.`);
  }

  function openRename(category: ProductCategory) {
    setRenaming(category);
    setRenameValue(category.name);
    setRenameFailure(null);
    renameDialog.current?.showModal();
  }

  async function rename() {
    if (renaming === null) return;

    const name = renameValue.trim();

    if (name.length === 0 || name.length > CATEGORY_NAME_MAX_LENGTH) {
      setRenameFailure(
        `El nombre es obligatorio y admite hasta ${CATEGORY_NAME_MAX_LENGTH} caracteres.`,
      );

      return;
    }

    const target = renaming;
    const result = await exclusive(() =>
      renameCategory(target.id, { name, expectedVersion: target.version }),
    );

    if (result === null) return;

    if (!result.ok) {
      setRenameFailure(describeCatalogFailure(result.code, result.reference));
      if (refreshes(result.code)) router.refresh();

      return;
    }

    setItems((current) => replaceCategory(current, result.data));
    renameDialog.current?.close();
    setRenaming(null);
    setNotice(`Categoría renombrada a «${result.data.name}». Su slug no cambia.`);
  }

  function openArchive(category: ProductCategory) {
    setArchiving(category);
    archiveDialog.current?.showModal();
  }

  async function transition(category: ProductCategory, kind: 'archive' | 'reactivate') {
    const result = await exclusive(() => transitionCategory(category.id, kind, category.version));

    if (result === null) return;

    archiveDialog.current?.close();
    setArchiving(null);

    if (!result.ok) {
      setFailure(describeCatalogFailure(result.code, result.reference));
      if (refreshes(result.code)) router.refresh();

      return;
    }

    setItems((current) => replaceCategory(current, result.data));
    setNotice(
      kind === 'archive'
        ? `«${result.data.name}» está archivada. Los productos que ya la tenían la conservan.`
        : `«${result.data.name}» vuelve a admitir asignaciones.`,
    );
  }

  return (
    <div className={styles.stack}>
      {permissions.canEdit ? (
        <section className={styles.card}>
          <div className={styles.cardPad}>
            <SectionHeading
              hint="Escribe el nombre: el slug se propone solo y puedes revisarlo antes de crear."
              icon="clasificacion"
              title="Nueva categoría"
            />
            <form
              className={styles.categoryCreate}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${id}-name`}>
                  Nombre *
                </label>
                <input
                  {...(createField === 'name' ? { 'aria-invalid': true } : {})}
                  className={createField === 'name' ? styles.inputInvalid : styles.input}
                  disabled={busy}
                  id={`${id}-name`}
                  maxLength={CATEGORY_NAME_MAX_LENGTH}
                  onChange={(event) => {
                    setNewName(event.target.value);
                    if (!slugTouched) setNewSlug(proposeCategorySlug(event.target.value));
                    setCreateField(null);
                  }}
                  ref={newNameInput}
                  type="text"
                  value={newName}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${id}-slug`}>
                  Slug *
                </label>
                <input
                  aria-describedby={`${id}-slug-hint`}
                  {...(createField === 'slug' ? { 'aria-invalid': true } : {})}
                  className={createField === 'slug' ? styles.inputInvalid : styles.input}
                  disabled={busy}
                  id={`${id}-slug`}
                  maxLength={CATEGORY_SLUG_MAX_LENGTH}
                  onChange={(event) => {
                    setNewSlug(event.target.value);
                    setSlugTouched(true);
                    setCreateField(null);
                  }}
                  ref={newSlugInput}
                  spellCheck={false}
                  type="text"
                  value={newSlug}
                />
                <span className={styles.hint} id={`${id}-slug-hint`}>
                  Va en la URL de la tienda y no se puede cambiar después de crear.
                </span>
              </div>
              <div className={styles.categoryCreateAction}>
                <button className={styles.button} disabled={busy} type="submit">
                  {busy ? 'Creando…' : 'Crear categoría'}
                </button>
              </div>
            </form>
            {createFailure === null ? null : (
              <p className={styles.fieldError} role="alert">
                {createFailure}
              </p>
            )}
          </div>
        </section>
      ) : (
        <p className={styles.hint}>Tu rol puede consultar las categorías, pero no crearlas.</p>
      )}

      <div aria-live="assertive">
        {failure === null ? null : (
          <p className={styles.error} role="alert">
            {failure}
          </p>
        )}
      </div>
      <div aria-live="polite">
        {notice === null ? null : <p className={styles.notice}>{notice}</p>}
      </div>

      <section aria-labelledby={`${id}-list-title`} className={styles.card}>
        <div className={styles.cardPad}>
          <h2 className={styles.sectionTitle} id={`${id}-list-title`}>
            Catálogo de categorías
          </h2>
          <div className={styles.categoryFilters}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${id}-search`}>
                Buscar
              </label>
              <input
                className={styles.input}
                id={`${id}-search`}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Nombre o slug"
                type="search"
                value={query}
              />
            </div>
            <fieldset className={styles.segmented}>
              <legend className={styles.label}>Estado</legend>
              {CATEGORY_STATUS_FILTERS.map((filter) => (
                <label
                  className={
                    status === filter.value ? styles.segmentedOptionActive : styles.segmentedOption
                  }
                  key={filter.value}
                >
                  <input
                    checked={status === filter.value}
                    className="sr-only"
                    name={`${id}-status`}
                    onChange={() => {
                      setStatus(filter.value);
                      setPage(1);
                    }}
                    type="radio"
                    value={filter.value}
                  />
                  {filter.label}
                </label>
              ))}
            </fieldset>
          </div>

          {truncated ? (
            <p className={styles.notice}>
              El catálogo es más grande de lo que se lee de una vez: la búsqueda solo abarca las
              primeras categorías.
            </p>
          ) : null}

          <p aria-live="polite" className={styles.hint}>
            {filtered.length === 1 ? '1 categoría' : `${filtered.length} categorías`}
          </p>

          {items.length === 0 ? (
            <EmptyState icon="clasificacion" title="Todavía no hay categorías">
              {permissions.canEdit
                ? 'Crea la primera con el formulario de arriba.'
                : 'Cuando alguien cree una, aparecerá aquí.'}
            </EmptyState>
          ) : filtered.length === 0 ? (
            <p className={styles.empty}>Ninguna categoría coincide con la búsqueda y el estado.</p>
          ) : (
            <ul className={styles.categoryList}>
              {visible.items.map((category) => (
                <li className={styles.categoryRow} key={category.id}>
                  <div className={styles.categoryMain}>
                    <span className={styles.pickerName}>{category.name}</span>
                    <span className={styles.pickerSlug}>{category.slug}</span>
                  </div>
                  <span
                    className={
                      category.status === 'active' ? styles.badgeActive : styles.badgeArchived
                    }
                  >
                    {category.status === 'active' ? 'Activa' : 'Archivada'}
                  </span>
                  <dl className={styles.categoryCounts}>
                    <dt>Productos</dt>
                    <dd>{describeProductCount(category.assignedProducts)}</dd>
                    <dt>Publicados</dt>
                    <dd>{describeProductCount(category.activeProducts)}</dd>
                  </dl>
                  <div className={styles.categoryActions}>
                    {permissions.canEdit ? (
                      <button
                        aria-label={`Renombrar ${category.name}`}
                        className={styles.buttonSecondary}
                        disabled={busy}
                        onClick={() => openRename(category)}
                        type="button"
                      >
                        Renombrar
                      </button>
                    ) : null}
                    {permissions.canArchive && category.status === 'active' ? (
                      <button
                        aria-label={`Archivar ${category.name}`}
                        className={styles.buttonDanger}
                        disabled={busy}
                        onClick={() => openArchive(category)}
                        type="button"
                      >
                        Archivar
                      </button>
                    ) : null}
                    {permissions.canArchive && category.status === 'archived' ? (
                      <button
                        aria-label={`Reactivar ${category.name}`}
                        className={styles.buttonSecondary}
                        disabled={busy}
                        onClick={() => void transition(category, 'reactivate')}
                        type="button"
                      >
                        Reactivar
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {visible.pageCount > 1 ? (
            <nav aria-label="Páginas de categorías" className={styles.pagination}>
              <button
                className={styles.buttonSecondary}
                disabled={visible.page <= 1}
                onClick={() => setPage(visible.page - 1)}
                type="button"
              >
                Anterior
              </button>
              <span className={styles.hint}>
                Página {visible.page} de {visible.pageCount}
              </span>
              <button
                className={styles.buttonSecondary}
                disabled={visible.page >= visible.pageCount}
                onClick={() => setPage(visible.page + 1)}
                type="button"
              >
                Siguiente
              </button>
            </nav>
          ) : null}
        </div>
      </section>

      {/* Sin permiso, los diálogos no existen: ni ocultos en el DOM. */}
      {permissions.canEdit ? (
        <>
          <dialog
            aria-labelledby={`${id}-rename-title`}
            className={styles.previewDialog}
            onClose={() => setRenaming(null)}
            ref={renameDialog}
          >
            <form
              className={styles.previewDialogBody}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void rename();
              }}
            >
              <h2 className={styles.sectionTitle} id={`${id}-rename-title`}>
                Renombrar categoría
              </h2>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${id}-rename`}>
                  Nombre nuevo
                </label>
                <input
                  aria-describedby={`${id}-rename-hint`}
                  className={styles.input}
                  disabled={busy}
                  id={`${id}-rename`}
                  maxLength={CATEGORY_NAME_MAX_LENGTH}
                  onChange={(event) => setRenameValue(event.target.value)}
                  type="text"
                  value={renameValue}
                />
                <span className={styles.hint} id={`${id}-rename-hint`}>
                  Solo cambia el nombre. El slug «{renaming?.slug}» no cambia, y los productos que
                  ya la usan conservan su copia hasta que se editen.
                </span>
              </div>
              {renameFailure === null ? null : (
                <p className={styles.fieldError} role="alert">
                  {renameFailure}
                </p>
              )}
              <div className={styles.actions}>
                <button className={styles.button} disabled={busy} type="submit">
                  {busy ? 'Guardando…' : 'Guardar nombre'}
                </button>
                <button
                  className={styles.buttonSecondary}
                  disabled={busy}
                  onClick={() => renameDialog.current?.close()}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </dialog>
        </>
      ) : null}

      {permissions.canArchive ? (
        <>
          <dialog
            aria-describedby={`${id}-archive-text`}
            aria-labelledby={`${id}-archive-title`}
            className={styles.previewDialog}
            onClose={() => setArchiving(null)}
            ref={archiveDialog}
          >
            <div className={styles.previewDialogBody}>
              <h2 className={styles.sectionTitle} id={`${id}-archive-title`}>
                ¿Archivar «{archiving?.name}»?
              </h2>
              <p className={styles.pageLead} id={`${id}-archive-text`}>
                Dejará de aparecer para nuevas asignaciones. <strong>No modifica</strong> los
                productos que ya la tienen: la conservan y la tienda los sigue mostrando. No se
                borra nada y el slug no se libera; puedes reactivarla cuando quieras.
              </p>
              {archiving === null ? null : (
                <p className={styles.hint}>
                  Productos con esta categoría: {describeProductCount(archiving.assignedProducts)}.
                </p>
              )}
              <div className={styles.actions}>
                <button
                  className={styles.buttonDanger}
                  disabled={busy || archiving === null}
                  onClick={() => {
                    if (archiving !== null) void transition(archiving, 'archive');
                  }}
                  type="button"
                >
                  {busy ? 'Archivando…' : 'Archivar'}
                </button>
                <button
                  autoFocus
                  className={styles.buttonSecondary}
                  disabled={busy}
                  onClick={() => archiveDialog.current?.close()}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </dialog>
        </>
      ) : null}
    </div>
  );
}
