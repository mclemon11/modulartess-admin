'use client';

import { useEffect, useId, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';

import { FailureNotice } from './failure-notice';
import { listPickerProducts } from './shipping-client';
import type { PickerProduct } from './shipping-projections';
import styles from './shipping.module.css';

/** Espera tras la última tecla antes de buscar. */
const DEBOUNCE_MS = 300;

/**
 * Selector de productos con selección múltiple.
 *
 * Busca **en el servidor** por nombre, SKU o slug —el backend lo resuelve en su consulta, sin
 * recorrer páginas— y avanza con su cursor. Cambiar el texto es otra búsqueda: empieza sin cursor y
 * descarta lo anterior. Nunca se descarga el catálogo en bloque.
 *
 * Los productos archivados vienen marcados con su estado escrito y **nunca** se marcan solos:
 * «Marcar los visibles» los salta.
 */
export function ProductPicker({
  selected,
  onChange,
  disabledIds = new Set(),
  disabledReason,
  onLoaded,
}: {
  readonly selected: ReadonlySet<string>;
  readonly onChange: (next: ReadonlySet<string>) => void;
  /** Productos que no se pueden marcar aquí, con el motivo. */
  readonly disabledIds?: ReadonlySet<string>;
  readonly disabledReason?: string;
  readonly onLoaded?: (products: readonly PickerProduct[]) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [items, setItems] = useState<readonly PickerProduct[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<{ code: string; reference?: string | undefined } | null>(
    null,
  );
  const q = text.trim().length >= 2 ? text.trim() : '';

  // Primera página de cada búsqueda. Una respuesta tardía de una búsqueda anterior se ignora.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      () => {
        void listPickerProducts({ q, pageToken: null }).then((result) => {
          if (cancelled) return;

          setLoading(false);

          if (!result.ok) {
            setProblem({ code: result.code, reference: result.reference });
            setItems([]);
            setNext(null);

            return;
          }

          setProblem(null);
          setItems(result.data.items);
          setNext(result.data.nextPageToken);
          onLoaded?.(result.data.items);
        });
      },
      q === '' ? 0 : DEBOUNCE_MS,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `onLoaded` es un aviso: no debe relanzar la búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function loadMore() {
    if (next === null) return;

    setLoading(true);

    const result = await listPickerProducts({ q, pageToken: next });

    setLoading(false);

    if (!result.ok) {
      setProblem({ code: result.code, reference: result.reference });

      return;
    }

    setProblem(null);
    setItems((current) => [...current, ...result.data.items]);
    setNext(result.data.nextPageToken);
    onLoaded?.(result.data.items);
  }

  const selectable = items.filter(
    (item) => item.status !== 'archived' && !disabledIds.has(item.id),
  );

  function toggle(productId: string) {
    const nextSelection = new Set(selected);

    if (nextSelection.has(productId)) nextSelection.delete(productId);
    else nextSelection.add(productId);

    onChange(nextSelection);
  }

  return (
    <div className={catalog.field}>
      <label className={catalog.label} htmlFor={`${id}-q`}>
        Buscar productos
      </label>
      <input
        aria-controls={`${id}-list`}
        aria-describedby={`${id}-hint ${id}-status`}
        className={catalog.input}
        id={`${id}-q`}
        onChange={(event) => {
          setLoading(true);
          setText(event.target.value);
        }}
        placeholder="Nombre, SKU o slug"
        type="search"
        value={text}
      />
      <span className={catalog.hint} id={`${id}-hint`}>
        Se busca en todo el catálogo, desde 2 caracteres. Un producto guardado antes de que
        existiera la búsqueda puede no aparecer por texto hasta que el backend lo reindexe; sin
        texto, el listado lo muestra igual.
      </span>
      <span aria-live="polite" className={catalog.hint} id={`${id}-status`}>
        {loading
          ? 'Buscando…'
          : `${items.length} producto${items.length === 1 ? '' : 's'}${
              q === '' ? '' : ` para «${q}»`
            }${next === null ? '' : ' (hay más)'}. ${selected.size} seleccionado${
              selected.size === 1 ? '' : 's'
            }.`}
      </span>
      {problem === null ? null : (
        <FailureNotice code={problem.code} reference={problem.reference} />
      )}
      <div className={catalog.actions}>
        <button
          className={catalog.buttonSecondary}
          disabled={selectable.length === 0}
          onClick={() => onChange(new Set([...selected, ...selectable.map((item) => item.id)]))}
          type="button"
        >
          Marcar los visibles ({selectable.length})
        </button>
        <button
          className={catalog.buttonSecondary}
          disabled={selected.size === 0}
          onClick={() => onChange(new Set())}
          type="button"
        >
          Quitar selección
        </button>
      </div>
      <ul aria-label="Productos" className={styles.pickerList} id={`${id}-list`}>
        {items.map((item) => {
          const archived = item.status === 'archived';
          const blocked = disabledIds.has(item.id);

          return (
            <li className={archived ? styles.pickerRowArchived : styles.pickerRow} key={item.id}>
              <input
                aria-describedby={`${id}-${item.id}-meta`}
                checked={selected.has(item.id)}
                disabled={blocked}
                id={`${id}-${item.id}`}
                onChange={() => toggle(item.id)}
                type="checkbox"
              />
              <label className={styles.choiceText} htmlFor={`${id}-${item.id}`}>
                <span className={styles.choiceTitle}>
                  {item.name}
                  {archived ? ' — Archivado' : ''}
                </span>
                <span className={styles.choiceHint} id={`${id}-${item.id}-meta`}>
                  <span className={catalog.mono}>{item.sku}</span>
                  {item.categoryName === null ? '' : ` · ${item.categoryName}`}
                  {item.status === 'draft' ? ' · Borrador' : ''}
                  {archived ? ' · No se vende: no se marca por defecto' : ''}
                  {blocked && disabledReason !== undefined ? ` · ${disabledReason}` : ''}
                </span>
              </label>
            </li>
          );
        })}
        {items.length === 0 && !loading && problem === null ? (
          <li className={styles.pickerRow}>
            <span className={catalog.hint}>
              {q === ''
                ? 'El catálogo no tiene productos.'
                : `Ningún producto coincide con «${q}».`}
            </span>
          </li>
        ) : null}
      </ul>
      {next === null ? null : (
        <button
          className={catalog.buttonSecondary}
          disabled={loading}
          onClick={() => void loadMore()}
          type="button"
        >
          {loading ? 'Cargando…' : 'Cargar más resultados'}
        </button>
      )}
    </div>
  );
}
