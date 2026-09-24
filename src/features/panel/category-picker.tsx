'use client';

import { useId, useRef, useState, type Ref } from 'react';

import styles from './catalog.module.css';
import { createCategory } from './catalog-client';
import { describeCatalogFailure } from './catalog-errors';
import {
  categoryDraftProblems,
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_SLUG_MAX_LENGTH,
  hasCategoryDraftProblems,
  proposeCategorySlug,
} from './category-input';
import {
  choiceTaxonomy,
  currentCategoryStatus,
  selectableCategories,
  type CategoryChoice,
  type CategoryOption,
} from './category-selection';

/** Una fila del desplegable. `create` solo aparece si hay algo escrito y permiso para crear. */
export type PickerRow =
  | { readonly kind: 'none' }
  | { readonly kind: 'category'; readonly category: CategoryOption }
  | { readonly kind: 'create'; readonly name: string };

/** Las filas del desplegable para lo que se ha escrito. Pura: la usa la prueba tal cual. */
export function pickerRows(
  catalog: readonly CategoryOption[],
  query: string,
  canCreate: boolean,
): readonly PickerRow[] {
  const rows: PickerRow[] = [{ kind: 'none' }];

  for (const category of selectableCategories(catalog, query)) {
    rows.push({ kind: 'category', category });
  }

  if (canCreate && query.trim() !== '') {
    rows.push({ kind: 'create', name: query.trim() });
  }

  return rows;
}

/**
 * La fila activa tras una tecla. Pura.
 *
 * Flechas dan la vuelta, como en un `listbox` nativo; Inicio y Fin van a los extremos. Con el
 * desplegable cerrado, la primera flecha lo abre en la primera fila.
 */
export function nextActiveIndex(current: number, key: string, count: number): number {
  if (count === 0) return -1;

  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return current;
  }
}

/**
 * Selector de categoría conectado al catálogo.
 *
 * Es un **combobox** con lista (patrón ARIA 1.2): se escribe para buscar, las flechas recorren, Intro
 * elige y Escape cierra. Con el dedo, cada fila es un botón de 44 px de alto. El foco no sale del
 * campo al recorrer: la fila activa se anuncia con `aria-activedescendant`.
 *
 * Reglas que no dependen de la maquetación:
 *
 * - Solo se ofrecen categorías **activas**. Una archivada no admite asignaciones nuevas.
 * - La categoría que el producto **ya tenía** se enseña con su estado —«Archivada», o «No está en
 *   el catálogo»— y no se cambia sola: solo cambia si alguien elige otra.
 * - «Sin categoría» es una opción: el contrato admite `null`.
 * - «Crear categoría» abre un alta en línea con el nombre escrito y una propuesta de slug que se
 *   puede revisar **antes** de crear, porque después el slug ya no cambia. Al crearla, se elige.
 *
 * El alta en línea no es un `<form>`: vive dentro del formulario del producto, y un formulario
 * anidado es HTML inválido. Intro en sus campos se intercepta para que no envíe el producto.
 */
export function CategoryPicker({
  catalog,
  choice,
  onChange,
  onCreated,
  disabled,
  canCreate,
  catalogProblem,
  error,
  inputRef,
}: {
  readonly catalog: readonly CategoryOption[];
  readonly choice: CategoryChoice;
  readonly onChange: (choice: CategoryChoice) => void;
  /** Una categoría recién creada, para que el catálogo de la pantalla la incluya. */
  readonly onCreated: (category: CategoryOption) => void;
  readonly disabled: boolean;
  /** `products.update`: es el permiso que exige el alta de categorías. */
  readonly canCreate: boolean;
  /** Por qué el catálogo no está completo o no se pudo leer. `null` si está entero. */
  readonly catalogProblem: string | null;
  /** Rechazo del backend sobre la categoría elegida, ya traducido. */
  readonly error: string | null;
  readonly inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftSlug, setDraftSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createFailure, setCreateFailure] = useState<string | null>(null);
  const [createField, setCreateField] = useState<'name' | 'slug' | null>(null);
  const [announcement, setAnnouncement] = useState('');
  /* Candado síncrono: un doble clic en «Crear» no puede crear dos categorías. */
  const creatingLock = useRef(false);
  const nameInput = useRef<HTMLInputElement | null>(null);
  const slugInput = useRef<HTMLInputElement | null>(null);

  const rows = pickerRows(catalog, query, canCreate);
  const selected = choiceTaxonomy(choice);
  const status = choice.kind === 'current' ? currentCategoryStatus(choice.taxonomy, catalog) : null;
  const draftProblems = categoryDraftProblems(draftName, draftSlug);

  function choose(row: PickerRow) {
    if (row.kind === 'create') {
      openCreator(row.name);

      return;
    }

    onChange(row.kind === 'none' ? { kind: 'none' } : { kind: 'catalog', category: row.category });
    setAnnouncement(
      row.kind === 'none' ? 'Producto sin categoría.' : `Categoría «${row.category.name}» elegida.`,
    );
    setQuery('');
    setOpen(false);
    setActive(-1);
  }

  function openCreator(name: string) {
    setCreating(true);
    setOpen(false);
    setDraftName(name);
    setDraftSlug(proposeCategorySlug(name));
    setSlugTouched(false);
    setCreateFailure(null);
    setCreateField(null);
    // Tras pintarse el alta, el foco va al nombre.
    queueMicrotask(() => nameInput.current?.focus());
  }

  function closeCreator() {
    setCreating(false);
    setCreateFailure(null);
    setCreateField(null);
  }

  async function create() {
    if (creatingLock.current) return;

    if (hasCategoryDraftProblems(draftProblems)) {
      setCreateField(draftProblems.name === undefined ? 'slug' : 'name');
      (draftProblems.name === undefined ? slugInput : nameInput).current?.focus();

      return;
    }

    creatingLock.current = true;
    setCreateBusy(true);
    setCreateFailure(null);
    setCreateField(null);

    const result = await createCategory({ name: draftName.trim(), slug: draftSlug.trim() });

    creatingLock.current = false;
    setCreateBusy(false);

    if (!result.ok) {
      setCreateFailure(describeCatalogFailure(result.code, result.reference));

      const field =
        result.code === 'category_name_conflict'
          ? 'name'
          : result.code === 'category_slug_conflict'
            ? 'slug'
            : null;

      setCreateField(field);
      if (field === 'name') nameInput.current?.focus();
      if (field === 'slug') slugInput.current?.focus();

      return;
    }

    const created: CategoryOption = {
      id: result.data.id,
      name: result.data.name,
      slug: result.data.slug,
      status: result.data.status,
    };

    onCreated(created);
    onChange({ kind: 'catalog', category: created });
    setAnnouncement(`Categoría «${created.name}» creada y elegida.`);
    setQuery('');
    closeCreator();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => nextActiveIndex(open ? current : -1, event.key, rows.length));

      return;
    }

    if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      setActive((current) => nextActiveIndex(current, event.key, rows.length));

      return;
    }

    if (event.key === 'Enter') {
      // Nunca envía el formulario del producto: Intro aquí es elegir, no guardar.
      event.preventDefault();

      const row = rows[active];

      if (open && row !== undefined) choose(row);

      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  /** Intro en el alta en línea crea la categoría, no el producto. */
  function onCreatorKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void create();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeCreator();
    }
  }

  const describedBy = [`${id}-current`, error === null ? null : `${id}-error`]
    .filter((value): value is string => value !== null)
    .join(' ');

  return (
    <div className={styles.picker}>
      <div className={styles.pickerCurrent} id={`${id}-current`}>
        {selected === null ? (
          <span className={styles.pickerEmpty}>Sin categoría</span>
        ) : (
          <>
            <span className={styles.pickerName}>{selected.name}</span>
            <span className={styles.pickerSlug}>{selected.slug}</span>
            {status === 'archived' ? <span className={styles.badgeArchived}>Archivada</span> : null}
            {status === 'missing' ? (
              <span className={styles.badgeUnknown}>No está en el catálogo</span>
            ) : null}
          </>
        )}
      </div>

      {status === 'archived' ? (
        <p className={styles.hint}>
          Es la categoría que ya tenía este producto. Está archivada: se conserva mientras no elijas
          otra, pero no se puede asignar a productos nuevos.
        </p>
      ) : null}
      {status === 'missing' ? (
        <p className={styles.hint}>
          Es la categoría que ya tenía este producto y no aparece en el catálogo. Se conserva
          mientras no elijas otra.
        </p>
      ) : null}

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-search`}>
          {selected === null ? 'Elegir categoría' : 'Cambiar categoría'}
        </label>
        <div className={styles.pickerControl}>
          <input
            aria-activedescendant={open && active >= 0 ? `${id}-row-${active}` : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-describedby={describedBy}
            aria-expanded={open}
            {...(error === null ? {} : { 'aria-invalid': true })}
            autoComplete="off"
            className={error === null ? styles.input : styles.inputInvalid}
            disabled={disabled}
            id={`${id}-search`}
            onBlur={() => {
              setOpen(false);
              setActive(-1);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Busca por nombre"
            ref={inputRef}
            role="combobox"
            spellCheck={false}
            type="text"
            value={query}
          />
          {open ? (
            <ul aria-label="Categorías" className={styles.pickerList} id={listId} role="listbox">
              {rows.map((row, index) => (
                <li
                  aria-selected={index === active}
                  className={index === active ? styles.pickerOptionActive : styles.pickerOption}
                  id={`${id}-row-${index}`}
                  key={row.kind === 'category' ? row.category.id : row.kind}
                  // `mousedown` sin prevenir quitaría el foco del campo antes del clic y cerraría la
                  // lista: el clic no llegaría a elegir nada.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(row)}
                  role="option"
                >
                  {row.kind === 'none' ? (
                    <span>Sin categoría</span>
                  ) : row.kind === 'create' ? (
                    <span className={styles.pickerCreate}>Crear categoría «{row.name}»</span>
                  ) : (
                    <>
                      <span>{row.category.name}</span>
                      <span className={styles.pickerSlug}>{row.category.slug}</span>
                    </>
                  )}
                </li>
              ))}
              {rows.length === 1 && query.trim() !== '' ? (
                <li
                  aria-disabled="true"
                  className={styles.pickerNote}
                  role="option"
                  aria-selected={false}
                >
                  Ninguna categoría activa coincide.
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
        {error === null ? null : (
          <span className={styles.fieldError} id={`${id}-error`} role="alert">
            {error}
          </span>
        )}
      </div>

      {canCreate && !creating ? (
        <button
          className={styles.buttonSecondary}
          disabled={disabled}
          onClick={() => openCreator(query.trim())}
          type="button"
        >
          Crear categoría
        </button>
      ) : null}

      {creating ? (
        <div aria-labelledby={`${id}-create-title`} className={styles.pickerCreator} role="group">
          <p className={styles.pickerCreatorTitle} id={`${id}-create-title`}>
            Nueva categoría
          </p>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-new-name`}>
              Nombre
            </label>
            <input
              {...(createField === 'name' ? { 'aria-invalid': true } : {})}
              className={createField === 'name' ? styles.inputInvalid : styles.input}
              disabled={createBusy}
              id={`${id}-new-name`}
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              onChange={(event) => {
                const name = event.target.value;

                setDraftName(name);
                // La propuesta sigue al nombre mientras nadie haya corregido el slug.
                if (!slugTouched) setDraftSlug(proposeCategorySlug(name));
              }}
              onKeyDown={onCreatorKeyDown}
              ref={nameInput}
              type="text"
              value={draftName}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-new-slug`}>
              Slug
            </label>
            <input
              aria-describedby={`${id}-new-slug-hint`}
              {...(createField === 'slug' ? { 'aria-invalid': true } : {})}
              className={createField === 'slug' ? styles.inputInvalid : styles.input}
              disabled={createBusy}
              id={`${id}-new-slug`}
              maxLength={CATEGORY_SLUG_MAX_LENGTH}
              onChange={(event) => {
                setDraftSlug(event.target.value);
                setSlugTouched(true);
              }}
              onKeyDown={onCreatorKeyDown}
              ref={slugInput}
              spellCheck={false}
              type="text"
              value={draftSlug}
            />
            <span className={styles.hint} id={`${id}-new-slug-hint`}>
              Revísalo ahora: después de crear la categoría no se puede cambiar.
            </span>
            {draftProblems.slug !== undefined && draftSlug !== '' ? (
              <span className={styles.fieldError}>{draftProblems.slug}</span>
            ) : null}
          </div>
          {createFailure === null ? null : (
            <p className={styles.fieldError} role="alert">
              {createFailure}
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.button}
              disabled={createBusy}
              onClick={() => void create()}
              type="button"
            >
              {createBusy ? 'Creando…' : 'Crear y elegir'}
            </button>
            <button
              className={styles.buttonSecondary}
              disabled={createBusy}
              onClick={closeCreator}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {catalogProblem === null ? null : <p className={styles.hint}>{catalogProblem}</p>}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
