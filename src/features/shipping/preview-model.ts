/**
 * Vista previa de envío: de las líneas que se arman a la petición, y de la respuesta a lo que se
 * pinta.
 *
 * La respuesta la calcula el backend —regla ganadora por línea, nivel, zona, desglose y total—. Aquí
 * solo se ordena para leerla. El total se pinta tal cual llega: `null` no se convierte nunca en
 * cero, y «gratis» solo aparece cuando el desenlace es `free`.
 *
 * Módulo puro.
 */

import { formatCop } from '@/features/panel/money';
import type { ShippingPreview, ShippingPreviewRequest, ShippingZone } from '@/lib/api/shipping';

import { OUTCOME_LABELS, REASON_LABELS } from './shipping-labels';
import type { PickerProduct } from './shipping-projections';

export const QUANTITY_MAX = 100;

export type PreviewLine = {
  readonly key: string;
  readonly product: PickerProduct;
  readonly variantId: string;
  readonly quantity: string;
};

export type PreviewInput = {
  readonly departmentCode: string;
  readonly municipalityCode: string;
  readonly lines: readonly PreviewLine[];
  readonly draftZoneIds: readonly string[];
};

export type PreviewProblems = {
  readonly destination?: string;
  readonly lines?: string;
  readonly byLine: Readonly<Record<string, string>>;
};

export type BuildResult =
  | { readonly ok: true; readonly request: ShippingPreviewRequest }
  | { readonly ok: false; readonly problems: PreviewProblems };

/** Valida lo armado y produce el cuerpo del contrato: productos, variantes y cantidades, nada más. */
export function buildPreviewRequest(input: PreviewInput): BuildResult {
  const byLine: Record<string, string> = {};
  let destination: string | undefined;
  let lines: string | undefined;

  if (!/^\d{2}$/.test(input.departmentCode) || !/^\d{5}$/.test(input.municipalityCode)) {
    destination = 'Elige el departamento y el municipio de destino.';
  } else if (!input.municipalityCode.startsWith(input.departmentCode)) {
    destination = 'El municipio no pertenece al departamento elegido.';
  }

  if (input.lines.length === 0) lines = 'Añade al menos un producto.';

  for (const line of input.lines) {
    const quantity = Number(line.quantity);

    if (!/^\d{1,3}$/.test(line.quantity.trim()) || quantity < 1 || quantity > QUANTITY_MAX) {
      byLine[line.key] = `La cantidad es un entero de 1 a ${QUANTITY_MAX}.`;
    } else if (line.product.variants.length > 0 && line.variantId === '') {
      byLine[line.key] = 'Este producto tiene variantes: elige cuál.';
    }
  }

  if (destination !== undefined || lines !== undefined || Object.keys(byLine).length > 0) {
    return {
      ok: false,
      problems: {
        ...(destination === undefined ? {} : { destination }),
        ...(lines === undefined ? {} : { lines }),
        byLine,
      },
    };
  }

  return {
    ok: true,
    request: {
      destination: {
        country: 'CO',
        departmentCode: input.departmentCode,
        municipalityCode: input.municipalityCode,
      },
      items: input.lines.map((line) => ({
        productId: line.product.id,
        quantity: Number(line.quantity),
        ...(line.product.variants.length > 0 ? { variantId: line.variantId } : {}),
      })),
      ...(input.draftZoneIds.length === 0 ? {} : { includeDraftZoneIds: [...input.draftZoneIds] }),
    },
  };
}

export type PreviewTotal = { readonly label: string; readonly amount: string | null };

/** El total del carrito en palabras. */
export function describeTotal(
  preview: Pick<ShippingPreview, 'outcome' | 'totalCop'>,
): PreviewTotal {
  switch (preview.outcome) {
    case 'free':
      return { label: 'Envío gratis', amount: formatCop(preview.totalCop ?? 0) };
    case 'charged':
      return {
        label: 'Tarifa calculada',
        amount: preview.totalCop === null ? null : formatCop(preview.totalCop),
      };
    case 'manual_quote':
      return { label: 'Cotización manual: sin monto', amount: null };
    case 'unavailable':
      return { label: 'No disponible: sin envío para este carrito', amount: null };
  }
}

export type PreviewWarning = { readonly text: string };

/**
 * Advertencias que se leen de la respuesta: empate, producto sin cobertura, destino sin cobertura,
 * productos que bloquean el carrito y líneas resueltas por una zona en borrador.
 */
export function previewWarnings(
  preview: ShippingPreview,
  context: {
    readonly draftZoneIds: ReadonlySet<string>;
    readonly productName: (productId: string) => string;
  },
): PreviewWarning[] {
  const warnings: PreviewWarning[] = [];
  const reasons = new Set(
    [preview.reason, ...preview.lines.map((line) => line.reason)].filter(
      (reason): reason is NonNullable<typeof reason> => reason !== null,
    ),
  );

  if (reasons.has('ambiguous_configuration')) {
    warnings.push({ text: `Empate. ${REASON_LABELS.ambiguous_configuration}` });
  }
  if (reasons.has('destination_not_covered')) {
    warnings.push({ text: `Sin cobertura. ${REASON_LABELS.destination_not_covered}` });
  }
  if (reasons.has('product_not_covered')) {
    const names = preview.lines
      .filter((line) => line.reason === 'product_not_covered')
      .map((line) => context.productName(line.productId));

    warnings.push({ text: `Producto sin cobertura: ${[...new Set(names)].join(', ')}.` });
  }
  if (reasons.has('destination_invalid')) {
    warnings.push({ text: REASON_LABELS.destination_invalid });
  }
  if (preview.blockingProductIds.length > 0) {
    warnings.push({
      text: `Bloquean el carrito: ${[...new Set(preview.blockingProductIds.map(context.productName))].join(', ')}.`,
    });
  }

  const draftLines = preview.lines.filter(
    (line) => line.zoneId !== null && context.draftZoneIds.has(line.zoneId),
  );

  if (draftLines.length > 0) {
    warnings.push({
      text: 'Zona inactiva: algunas líneas se resolvieron con un borrador incluido solo en esta vista previa. En la tienda no cotizará hasta activarlo.',
    });
  }

  return warnings;
}

export function lineOutcomeLabel(outcome: ShippingPreview['outcome']): string {
  return OUTCOME_LABELS[outcome];
}

/** Nombre y versión de una zona para pintar una línea sin cargo: la sacamos de lo que ya se cargó. */
export function zoneLabel(
  zoneId: string | null,
  zones: ReadonlyMap<string, Pick<ShippingZone, 'name' | 'version' | 'status'>>,
  charges: ShippingPreview['charges'],
): string {
  if (zoneId === null) return '—';

  const charge = charges.find((candidate) => candidate.zoneId === zoneId);

  if (charge !== undefined) return `${charge.zoneName} · v${charge.zoneVersion}`;

  const zone = zones.get(zoneId);

  return zone === undefined ? 'Zona no listada' : `${zone.name} · v${zone.version}`;
}
