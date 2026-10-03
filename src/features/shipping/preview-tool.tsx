'use client';

import { useId, useState } from 'react';

import catalog from '@/features/panel/catalog.module.css';
import { formatCop } from '@/features/panel/money';
import type {
  GeographyDepartment,
  GeographyMunicipality,
  ShippingPreview,
  ShippingZone,
} from '@/lib/api/shipping';

import { FailureNotice } from './failure-notice';
import {
  buildPreviewRequest,
  describeTotal,
  previewWarnings,
  QUANTITY_MAX,
  zoneLabel,
  type PreviewLine,
  type PreviewProblems,
} from './preview-model';
import { ProductPicker } from './product-picker';
import { getZone, listMunicipalities, previewShipping } from './shipping-client';
import { describeRate, LEVEL_LABELS, OUTCOME_LABELS, REASON_LABELS } from './shipping-labels';
import type { PickerProduct } from './shipping-projections';
import styles from './shipping.module.css';
import { useExclusive } from './use-exclusive';

type Failure = { readonly code: string; readonly reference?: string | undefined } | null;

export type PreviewZone = Pick<ShippingZone, 'id' | 'name' | 'version' | 'status'>;

/**
 * Vista previa de envío. **No crea pedidos ni modifica datos.**
 *
 * Se elige un destino —departamento y municipio, por código DIVIPOLA—, productos con su variante y
 * cantidad, y opcionalmente borradores para tratarlos como activos **solo aquí**. El backend
 * devuelve la regla ganadora por línea, el nivel que ganó, la zona y su versión, el desglose por
 * regla y el total. Lo que no tiene envío se dice así; nunca se muestra como cero.
 */
export function PreviewTool({
  departments,
  drafts,
  moreDrafts,
  initialDraftIds,
}: {
  readonly departments: readonly GeographyDepartment[];
  readonly drafts: readonly PreviewZone[];
  /** Hay más borradores que los de la primera página. */
  readonly moreDrafts: boolean;
  readonly initialDraftIds: readonly string[];
}) {
  const id = useId();
  const { busy, run } = useExclusive();
  const [departmentCode, setDepartmentCode] = useState('');
  const [municipalities, setMunicipalities] = useState<readonly GeographyMunicipality[]>([]);
  const [municipalityCode, setMunicipalityCode] = useState('');
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [lines, setLines] = useState<readonly PreviewLine[]>([]);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [loadedProducts, setLoadedProducts] = useState<Readonly<Record<string, PickerProduct>>>({});
  const [draftIds, setDraftIds] = useState<ReadonlySet<string>>(new Set(initialDraftIds));
  const [problems, setProblems] = useState<PreviewProblems>({ byLine: {} });
  const [failure, setFailure] = useState<Failure>(null);
  const [result, setResult] = useState<{
    preview: ShippingPreview;
    lines: readonly PreviewLine[];
    zones: readonly PreviewZone[];
  } | null>(null);

  async function chooseDepartment(code: string) {
    setDepartmentCode(code);
    setMunicipalityCode('');
    setMunicipalities([]);

    if (code === '') return;

    setLoadingPlaces(true);

    const list = await listMunicipalities(code);

    setLoadingPlaces(false);

    if (!list.ok) {
      setFailure({ code: list.code, reference: list.reference });

      return;
    }

    setMunicipalities(list.data.items);
  }

  function addPicked() {
    const existing = new Set(lines.map((line) => line.product.id));
    const added = [...picked]
      .filter((productId) => !existing.has(productId))
      .map((productId) => loadedProducts[productId])
      .filter((product): product is PickerProduct => product !== undefined)
      .map((product) => ({
        key: `${product.id}-${Math.random().toString(36).slice(2, 8)}`,
        product,
        variantId: product.variants.length === 1 ? (product.variants[0]?.id ?? '') : '',
        quantity: '1',
      }));

    setLines((current) => [...current, ...added]);
    setPicked(new Set());
    setPicking(false);
  }

  async function calculate() {
    const built = buildPreviewRequest({
      departmentCode,
      municipalityCode,
      lines,
      draftZoneIds: [...draftIds],
    });

    if (!built.ok) {
      setProblems(built.problems);

      return;
    }

    setProblems({ byLine: {} });
    setFailure(null);

    const response = await run(() => previewShipping(built.request));

    if (response === null) return;
    if (!response.ok) {
      setFailure({ code: response.code, reference: response.reference });
      setResult(null);

      return;
    }

    // Las zonas que resolvieron una línea sin cargo se nombran leyéndolas por su id: solo esas.
    const known = new Map<string, PreviewZone>(drafts.map((draft) => [draft.id, draft]));

    for (const charge of response.data.charges) {
      known.set(charge.zoneId, {
        id: charge.zoneId,
        name: charge.zoneName,
        version: charge.zoneVersion,
        status: 'active',
      });
    }

    const missing = [
      ...new Set(
        response.data.lines
          .map((line) => line.zoneId)
          .filter((zoneId): zoneId is string => zoneId !== null && !known.has(zoneId)),
      ),
    ];

    for (const zoneId of missing) {
      const zone = await getZone(zoneId);

      if (zone.ok) {
        known.set(zoneId, {
          id: zone.data.id,
          name: zone.data.name,
          version: zone.data.version,
          status: zone.data.status,
        });
      }
    }

    setResult({ preview: response.data, lines, zones: [...known.values()] });
  }

  return (
    <div className={styles.layout}>
      <p className={catalog.notice} role="note">
        <strong>Solo vista previa.</strong> Calcular no crea pedidos, no reserva inventario y no
        modifica ninguna zona ni regla.
      </p>

      <section aria-labelledby={`${id}-dest`} className={`${catalog.card} ${catalog.cardPad}`}>
        <h2 className={catalog.sectionTitle} id={`${id}-dest`}>
          Destino
        </h2>
        <div className={styles.formRow}>
          <div className={catalog.field}>
            <label className={catalog.label} htmlFor={`${id}-department`}>
              Departamento
            </label>
            <select
              className={styles.select}
              id={`${id}-department`}
              onChange={(event) => void chooseDepartment(event.target.value)}
              value={departmentCode}
            >
              <option value="">Elige un departamento</option>
              {departments.map((department) => (
                <option key={department.code} value={department.code}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <div className={catalog.field}>
            <label className={catalog.label} htmlFor={`${id}-municipality`}>
              Municipio
            </label>
            <select
              aria-describedby={`${id}-municipality-hint`}
              className={styles.select}
              disabled={departmentCode === '' || loadingPlaces}
              id={`${id}-municipality`}
              onChange={(event) => setMunicipalityCode(event.target.value)}
              value={municipalityCode}
            >
              <option value="">{loadingPlaces ? 'Cargando…' : 'Elige un municipio'}</option>
              {municipalities.map((municipality) => (
                <option key={municipality.code} value={municipality.code}>
                  {municipality.name} ({municipality.code})
                </option>
              ))}
            </select>
            <span className={catalog.hint} id={`${id}-municipality-hint`}>
              Solo los municipios del departamento elegido. Vereda o corregimiento no cambian la
              tarifa.
            </span>
          </div>
        </div>
        {problems.destination === undefined ? null : (
          <p className={catalog.fieldError} role="alert">
            {problems.destination}
          </p>
        )}
      </section>

      <section aria-labelledby={`${id}-cart`} className={`${catalog.card} ${catalog.cardPad}`}>
        <h2 className={catalog.sectionTitle} id={`${id}-cart`}>
          Productos y cantidades
        </h2>
        {lines.length === 0 ? <p className={catalog.hint}>Todavía no hay productos.</p> : null}
        <ul className={styles.cartLines}>
          {lines.map((line) => (
            <li className={styles.cartLine} key={line.key}>
              <span className={styles.ruleText}>
                <span className={styles.cellMain}>{line.product.name}</span>
                <span className={styles.cellSub}>
                  <span className={catalog.mono}>{line.product.sku}</span>
                  {line.product.status === 'archived' ? ' · Archivado' : ''}
                </span>
              </span>
              {line.product.variants.length === 0 ? (
                <span className={catalog.hint}>Sin variantes</span>
              ) : (
                <div className={catalog.field}>
                  <label className={catalog.label} htmlFor={`${id}-${line.key}-variant`}>
                    Variante
                  </label>
                  <select
                    className={styles.select}
                    id={`${id}-${line.key}-variant`}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((candidate) =>
                          candidate.key === line.key
                            ? { ...candidate, variantId: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                    value={line.variantId}
                  >
                    <option value="">Elige una variante</option>
                    {line.product.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={catalog.field}>
                <label className={catalog.label} htmlFor={`${id}-${line.key}-qty`}>
                  Cantidad
                </label>
                <input
                  aria-describedby={
                    problems.byLine[line.key] === undefined ? undefined : `${id}-${line.key}-error`
                  }
                  aria-invalid={problems.byLine[line.key] === undefined ? undefined : true}
                  className={catalog.input}
                  id={`${id}-${line.key}-qty`}
                  inputMode="numeric"
                  max={QUANTITY_MAX}
                  min={1}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((candidate) =>
                        candidate.key === line.key
                          ? { ...candidate, quantity: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                  type="number"
                  value={line.quantity}
                />
              </div>
              <button
                aria-label={`Quitar ${line.product.name}`}
                className={catalog.buttonSecondary}
                onClick={() =>
                  setLines((current) => current.filter((candidate) => candidate.key !== line.key))
                }
                type="button"
              >
                Quitar
              </button>
              {problems.byLine[line.key] === undefined ? null : (
                <span className={catalog.fieldError} id={`${id}-${line.key}-error`}>
                  {problems.byLine[line.key]}
                </span>
              )}
            </li>
          ))}
        </ul>
        {problems.lines === undefined ? null : (
          <p className={catalog.fieldError} role="alert">
            {problems.lines}
          </p>
        )}
        {picking ? (
          <>
            <ProductPicker
              onChange={setPicked}
              onLoaded={(products) =>
                setLoadedProducts((current) => {
                  const next = { ...current };

                  for (const product of products) next[product.id] = product;

                  return next;
                })
              }
              selected={picked}
            />
            <div className={catalog.actions}>
              <button
                className={catalog.buttonPrimary}
                disabled={picked.size === 0}
                onClick={addPicked}
                type="button"
              >
                Añadir {picked.size} producto{picked.size === 1 ? '' : 's'}
              </button>
              <button
                className={catalog.buttonSecondary}
                onClick={() => setPicking(false)}
                type="button"
              >
                Cerrar selector
              </button>
            </div>
          </>
        ) : (
          <button
            className={catalog.buttonSecondary}
            onClick={() => setPicking(true)}
            type="button"
          >
            <span aria-hidden="true">+</span> Añadir productos
          </button>
        )}
      </section>

      {drafts.length === 0 ? null : (
        <section aria-labelledby={`${id}-drafts`} className={`${catalog.card} ${catalog.cardPad}`}>
          <h2 className={catalog.sectionTitle} id={`${id}-drafts`}>
            Borradores a incluir
          </h2>
          <p className={catalog.hint}>
            Se tratan como activos solo en esta vista previa, para probarlos antes de activarlos.
            Como mucho 20.
            {moreDrafts
              ? ' Aquí están los más recientes; para otro, ábrelo desde su revisión con «Vista previa con este borrador».'
              : ''}
          </p>
          <fieldset className={styles.choices}>
            <legend className="sr-only">Borradores</legend>
            {drafts.map((draft) => (
              <label className={styles.choice} key={draft.id}>
                <input
                  checked={draftIds.has(draft.id)}
                  disabled={!draftIds.has(draft.id) && draftIds.size >= 20}
                  onChange={() =>
                    setDraftIds((current) => {
                      const next = new Set(current);

                      if (next.has(draft.id)) next.delete(draft.id);
                      else next.add(draft.id);

                      return next;
                    })
                  }
                  type="checkbox"
                />
                <span className={styles.choiceText}>
                  <span className={styles.choiceTitle}>{draft.name}</span>
                  <span className={styles.choiceHint}>Borrador · v{draft.version}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>
      )}

      <div className={catalog.actions}>
        <button
          className={catalog.buttonPrimary}
          disabled={busy}
          onClick={() => void calculate()}
          type="button"
        >
          {busy ? 'Calculando…' : 'Calcular vista previa'}
        </button>
      </div>

      {failure === null ? null : (
        <FailureNotice code={failure.code} reference={failure.reference} />
      )}

      <div aria-live="polite">
        {result === null ? null : (
          <PreviewResult
            draftIds={draftIds}
            lines={result.lines}
            preview={result.preview}
            zones={result.zones}
          />
        )}
      </div>
    </div>
  );
}

function PreviewResult({
  preview,
  lines,
  zones,
  draftIds,
}: {
  readonly preview: ShippingPreview;
  readonly lines: readonly PreviewLine[];
  readonly zones: readonly PreviewZone[];
  readonly draftIds: ReadonlySet<string>;
}) {
  const total = describeTotal(preview);
  const zoneMap = new Map(zones.map((zone) => [zone.id, zone]));
  const productName = (productId: string) =>
    lines.find((line) => line.product.id === productId)?.product.name ?? 'Producto';
  const warnings = previewWarnings(preview, { draftZoneIds: draftIds, productName });
  const ruleLabel = (ruleId: string | null) => {
    if (ruleId === null) return '—';

    const charge = preview.charges.find((candidate) => candidate.ruleId === ruleId);

    return charge === undefined ? 'Regla sin cargo' : `${charge.ruleName} · v${charge.ruleVersion}`;
  };

  return (
    <section aria-labelledby="preview-result" className={`${catalog.card} ${catalog.cardPad}`}>
      <h2 className={catalog.sectionTitle} id="preview-result">
        Resultado
      </h2>
      {preview.location === null ? null : (
        <p>
          Destino: {preview.location.municipalityName}, {preview.location.departmentName} (
          <span className={catalog.mono}>{preview.location.municipalityCode}</span>)
        </p>
      )}
      <div className={styles.total}>
        <span>
          {OUTCOME_LABELS[preview.outcome]}
          {preview.reason === null ? '' : ` · ${REASON_LABELS[preview.reason]}`}
        </span>
        <span>{total.amount === null ? total.label : `Total: ${total.amount}`}</span>
      </div>

      {warnings.length === 0 ? null : (
        <ul className={styles.warningList}>
          {warnings.map((warning) => (
            <li className={styles.warning} key={warning.text}>
              <strong>Advertencia: </strong>
              {warning.text}
            </li>
          ))}
        </ul>
      )}

      <h3 className={catalog.subTitle}>Por línea</h3>
      <div className={catalog.tableScroll}>
        <table className={`${catalog.table} ${styles.lineTable}`}>
          <caption className="sr-only">Resultado por línea</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Resultado</th>
              <th scope="col">Nivel que ganó</th>
              <th scope="col">Zona</th>
              <th scope="col">Regla</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((line) => {
              const source = lines[line.lineIndex];
              const variant = source?.product.variants.find(
                (candidate) => candidate.id === line.variantId,
              );

              return (
                <tr key={line.lineIndex}>
                  <td>
                    {source?.product.name ?? productName(line.productId)}
                    {variant === undefined ? '' : ` · ${variant.label}`}
                  </td>
                  <td className={catalog.numeric}>{source?.quantity ?? '—'}</td>
                  <td>
                    {OUTCOME_LABELS[line.outcome]}
                    {line.reason === null ? (
                      ''
                    ) : (
                      <span className={styles.cellSub}> · {REASON_LABELS[line.reason]}</span>
                    )}
                  </td>
                  <td>{line.level === null ? '—' : LEVEL_LABELS[line.level]}</td>
                  <td>
                    {zoneLabel(line.zoneId, zoneMap, preview.charges)}
                    {line.zoneId !== null && draftIds.has(line.zoneId) ? ' (borrador)' : ''}
                  </td>
                  <td>{ruleLabel(line.ruleId)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className={catalog.subTitle}>Desglose por regla</h3>
      {preview.charges.length === 0 ? (
        <p className={catalog.hint}>Ninguna regla cobra en este carrito.</p>
      ) : (
        <ul className={styles.ruleList}>
          {preview.charges.map((charge) => (
            <li
              className={styles.ruleItem}
              key={`${charge.ruleId}-${charge.lineIndexes.join('-')}`}
            >
              <span className={styles.ruleText}>
                <span className={styles.cellMain}>
                  {charge.ruleName} · v{charge.ruleVersion}
                </span>
                <span>{describeRate(charge.rate)}</span>
                <span className={styles.cellSub}>
                  {charge.zoneName} · v{charge.zoneVersion} · prioridad {charge.zonePriority} ·
                  nivel {LEVEL_LABELS[charge.level].toLowerCase()} · {charge.units} unidad
                  {charge.units === 1 ? '' : 'es'} · líneas{' '}
                  {charge.lineIndexes.map((index) => index + 1).join(', ')}
                </span>
              </span>
              <strong>{formatCop(charge.costCop)}</strong>
            </li>
          ))}
        </ul>
      )}
      <p className={catalog.hint}>
        Revisión de la configuración {preview.rulesetRevision} · geografía{' '}
        {preview.geographyVersion}. Nada de esto quedó guardado.
      </p>
    </section>
  );
}
