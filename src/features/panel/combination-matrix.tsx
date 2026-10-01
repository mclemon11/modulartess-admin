import { VARIANT_MAX_ACTIVE } from '@/lib/api/variant-limits';

import styles from './swatches.module.css';
import { isLightColor, pickerValue, type CombinationMatrix, type MatrixCell } from './swatch-draft';

const STATE_TEXT = {
  variant: 'Variante',
  draft: 'Preparada',
  missing: 'Falta',
} as const;

function describe(cell: MatrixCell): string {
  const name = cell.attributes.map((attribute) => attribute.label).join(' · ');
  return cell.state === 'missing' ? name : `${name}${cell.sku === null ? '' : ` (${cell.sku})`}`;
}

/**
 * Qué combinaciones de color y demás ejes existen, cuáles están preparadas y cuáles faltan.
 *
 * El estado va **escrito** en cada celda —«Variante», «Preparada», «Falta»—, no solo en el color
 * del fondo. Faltar no es un error: puede que una combinación no se venda. Pero se enseña antes de
 * publicar, y se ofrece preparar los borradores que faltan, **sin SKU, precio ni inventario**, que
 * cada uno exige escribir.
 */
export function CombinationMatrixView({
  matrix,
  hexOf,
  onPrepareMissing,
  disabled,
  room,
}: {
  readonly matrix: CombinationMatrix;
  /** Color de cada opción por su valor, para la muestra de la fila. */
  readonly hexOf: (value: string) => string;
  readonly onPrepareMissing: (() => void) | null;
  readonly disabled: boolean;
  /** Cuántas variantes caben todavía hasta el máximo del backend. */
  readonly room: number;
}) {
  if (matrix.rows.length === 0) {
    return null;
  }

  const hasColumns = matrix.columns.length > 0;
  const missing = matrix.missing.length;

  return (
    <div className={styles.editor}>
      <p className={styles.hint} aria-live="polite">
        {missing === 0
          ? `Las ${matrix.total} combinaciones tienen variante o están preparadas.`
          : `Faltan ${missing} de ${matrix.total} combinaciones. Revísalas antes de publicar.`}
      </p>

      <div className={styles.matrixScroll}>
        <table className={styles.matrix}>
          <caption className="sr-only">Combinaciones de colores y demás ejes</caption>
          <thead>
            <tr>
              <th scope="col">Color</th>
              {hasColumns ? (
                matrix.columns.map((column) => (
                  <th key={column.map((entry) => entry.value).join('|')} scope="col">
                    {column.map((entry) => entry.label).join(' · ')}
                  </th>
                ))
              ) : (
                <th scope="col">Estado</th>
              )}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.option.value}>
                <th scope="row">
                  <span className={styles.matrixRowHead}>
                    <SwatchDot hex={hexOf(row.option.value)} label={row.option.label} />
                    {row.option.label}
                  </span>
                </th>
                {row.cells.map((cell) => (
                  <td
                    className={
                      cell.state === 'missing'
                        ? styles.cellMissing
                        : cell.state === 'variant'
                          ? styles.cellVariant
                          : undefined
                    }
                    key={cell.key}
                  >
                    {STATE_TEXT[cell.state]}
                    {cell.sku === null ? null : <div>{cell.sku}</div>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={styles.matrixCards} aria-label="Combinaciones por color">
        {matrix.rows.map((row) => (
          <li className={styles.option} key={row.option.value}>
            <span className={styles.matrixRowHead}>
              <SwatchDot hex={hexOf(row.option.value)} label={row.option.label} />
              <strong>{row.option.label}</strong>
            </span>
            <ul className={styles.missingList}>
              {row.cells.map((cell) => (
                <li key={cell.key}>
                  {STATE_TEXT[cell.state]}: {describe(cell)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {missing === 0 || onPrepareMissing === null ? null : (
        <div className={styles.actions}>
          <button
            className={styles.button}
            disabled={disabled || room === 0}
            onClick={onPrepareMissing}
            type="button"
          >
            Preparar las {Math.min(missing, room)} combinaciones que faltan
          </button>
          <span className={styles.hint}>
            {room === 0
              ? `No caben más: el máximo es ${VARIANT_MAX_ACTIVE} variantes activas.`
              : 'Se preparan sin SKU, precio ni inventario: cada una los necesita antes de crearse.'}
          </span>
        </div>
      )}
    </div>
  );
}

function SwatchDot({ hex, label }: { readonly hex: string; readonly label: string }) {
  return (
    <span
      aria-label={`Muestra de ${label}`}
      className={`${styles.swatch} ${isLightColor(hex) ? styles.swatchLight : ''}`}
      role="img"
      style={{ backgroundColor: pickerValue(hex) }}
    />
  );
}
