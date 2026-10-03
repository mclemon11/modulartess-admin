import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { AdminProduct } from '@/lib/api/catalog';
import type { ShippingRule, ShippingZone } from '@/lib/api/shipping';

import {
  fixtureProducts,
  FIXTURE_DEPARTMENTS,
  seededBackend,
} from '../../../test/shipping/fake-backend';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const { ZoneListView } = await import('./zone-list-view');
const { CopyOperationActions } = await import('./copy-operation-actions');
const { CopyOperationView } = await import('./copy-operation-view');
const { CoverageEditor } = await import('./coverage-editor');
const { RulesEditor, RuleForm } = await import('./rules-editor');
const { TargetsEditor } = await import('./targets-editor');
const { PreviewTool } = await import('./preview-tool');
const { ActivateZone } = await import('./activate-zone');
const { FailureNotice } = await import('./failure-notice');
const { ProductShippingSection } = await import('./product-shipping-section');
const { BulkShippingProvider } = await import('./bulk-shipping');
const { ZoneInfoForm } = await import('./zone-info-form');
const { ProductsTable } = await import('@/features/panel/products-table');
const { ZonePager } = await import('./zone-list-view');
const { parseZoneFilters } = await import('./zone-list');
const { factsFromRules } = await import('./shipping-server');

const backend = seededBackend();
const zones = [...backend.zones.values()];
const byName = (name: string) => zones.find((zone) => zone.name === name) as ShippingZone;
const rulesOf = (zone: ShippingZone): ShippingRule[] =>
  [...backend.rules.values()].filter((rule) => rule.zoneId === zone.id);

function listing(items: ShippingZone[], canManage: boolean): string {
  return renderToStaticMarkup(
    <ZoneListView
      context={{
        facts: new Map(items.map((zone) => [zone.id, factsFromRules(rulesOf(zone))])),
        names: new Map([['adm_fake_master', 'Laura Gerencia']]),
        viewerId: 'adm_fake_super',
        now: new Date('2026-10-02T12:00:00Z'),
        canManage,
      }}
      zones={items}
    />,
  );
}

describe('listado de zonas', () => {
  it('muestra las columnas pedidas, estados, tarifas, conteos, versión y responsable sin UID', () => {
    const html = listing(zones, true);

    for (const heading of [
      'Zona',
      'Estado',
      'Prioridad',
      'Cobertura',
      'Tarifa',
      'Vigencia',
      'Alcance',
      'Versión y última actualización',
    ]) {
      expect(html, heading).toContain(`>${heading}<`);
    }
    for (const text of [
      'Activa',
      'Borrador',
      'Archivada',
      'Departamentos completos',
      'Respaldo nacional',
      'Programada',
      'Vencida',
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).toContain('Laura Gerencia');
    expect(html).toContain('>Tú<');
    expect(html).not.toContain('adm_fake_master');
    expect(html).toMatch(/Departamentos<\/dt><dd>1</);
  });

  it('con shipping.manage ofrece duplicar y archivar; una archivada se restaura o se duplica', () => {
    const html = listing(zones, true);

    expect(html).toContain('>Duplicar<');
    expect(html).toContain('>Archivar<');
    expect(html).toContain('Duplicar como borrador');
    expect(html).toContain('Restaurar como borrador');
    expect(html).not.toMatch(/definitiv|irreversible|no se reactiva/i);
  });

  it('restaurar enseña la versión nueva antes de refrescar el listado', () => {
    const source = readFileSync(join(DIR, 'zone-row-actions.tsx'), 'utf8');
    const restore = source.slice(source.indexOf('export function RestoreButton'));
    const confirm = restore.slice(
      restore.indexOf('async function confirm'),
      restore.indexOf('return (', restore.indexOf('async function confirm')),
    );

    expect(restore).toContain('Ahora va por la versión {restored.version}');
    expect(confirm).not.toContain('router.refresh()');
    expect(restore).toContain('if (restored !== null) router.refresh();');
  });

  it('restaurar explica que vuelve a borrador y no se activa sola', () => {
    const html = listing([byName('Promoción 2025')], true);

    expect(html).toContain('No se activa sola');
    expect(html).toContain('repite el análisis de solapamientos');
  });

  it('sin shipping.manage es de solo lectura', () => {
    const html = listing(zones, false);

    expect(html).toContain('>Ver<');
    for (const action of ['>Editar<', '>Duplicar<', '>Archivar<', 'Restaurar como borrador']) {
      expect(html).not.toContain(action);
    }
  });

  it('una copia sin terminar no se abre ni se edita: se sigue desde su operación', () => {
    const failed = backend.seedZone({
      name: 'Copia rota',
      copy: {
        state: 'failed',
        sourceZoneId: zones[0]?.id ?? null,
        error: 'x',
        operationId: 'op123',
      },
    });
    const html = listing([failed], true);

    expect(html).toContain('Copia fallida');
    expect(html).toContain('href="/panel/envios/copias/op123"');
    expect(html).not.toContain('>Editar<');
    expect(html).not.toContain('Restaurar como borrador');
  });

  it('el paginador solo avanza con el cursor del backend y ofrece volver a la primera página', () => {
    const filters = parseZoneFilters({ q: 'ruta', cursor: 'c2', pagina: '2' });
    const html = renderToStaticMarkup(<ZonePager count={20} filters={filters} nextCursor="c3" />);

    expect(html).toContain('Página 2');
    expect(html).toContain('href="/panel/envios?q=ruta&amp;cursor=c3&amp;pagina=3"');
    expect(html).toContain('href="/panel/envios?q=ruta"');
    expect(html).not.toMatch(/de \d+ zonas|Página \d+ de/);

    const last = renderToStaticMarkup(
      <ZonePager count={3} filters={parseZoneFilters({})} nextCursor={null} />,
    );

    expect(last).toContain('No hay más páginas');
    expect(last).not.toContain('Siguiente');
  });
});

describe('selector geográfico', () => {
  const valle = byName('Valle de Aburrá');
  const entries = backend.coverage.get(valle.id) ?? [];

  function editor(readOnly: boolean) {
    return renderToStaticMarkup(
      <CoverageEditor
        departments={FIXTURE_DEPARTMENTS}
        entries={entries}
        knownNames={{ '05615': 'Rionegro' }}
        readOnly={readOnly}
        zone={valle}
      />,
    );
  }

  it('anuncia la selección parcial como mixed y lo demás como true o false', () => {
    const html = editor(false);

    expect(html).toMatch(
      /role="checkbox"[^>]*aria-checked="mixed"|aria-checked="mixed"[^>]*role="checkbox"/,
    );
    expect(html).toContain('aria-label="Antioquia: selección parcial"');
    expect(html).toContain('aria-label="Boyacá: sin seleccionar"');
    expect(html).toContain('Departamento completo, 1 exclusión');
  });

  it('muestra la exclusión con su nombre oficial y su código, y no solo por color', () => {
    const html = editor(false);

    expect(html).toContain('Excluido: </span>Rionegro (05615)');
  });

  it('no carga municipios en el DOM hasta desplegar un departamento', () => {
    const html = editor(false);

    // Ningún municipio de Antioquia: ni Medellín (05001) ni Bello (05088) están en el DOM.
    expect(html).not.toContain('05001');
    expect(html).not.toContain('05088');
    expect(html.match(/aria-expanded="false"/g)?.length).toBe(FIXTURE_DEPARTMENTS.length);
  });

  it('declara que vereda, corregimiento o caserío no son un nivel tarifario', () => {
    expect(editor(false)).toContain('Vereda, corregimiento o caserío');
    expect(editor(false)).toContain('no es un nivel tarifario');
  });

  it('en solo lectura no se puede marcar ni guardar', () => {
    const html = editor(true);

    expect(html).not.toContain('Guardar y seguir');
    const boxes = html.match(/<button[^>]*role="checkbox"[^>]*>/g) ?? [];

    expect(boxes.length).toBe(FIXTURE_DEPARTMENTS.length);
    expect(boxes.every((box) => box.includes('disabled=""'))).toBe(true);
  });

  it('el código fuente nunca usa un nombre como identificador al guardar', () => {
    const source = readFileSync('src/features/shipping/coverage-editor.tsx', 'utf8');

    expect(source).toContain('changeCoverage(zone.id');
    expect(source).not.toMatch(/code:\s*\w+\.name/);
  });
});

describe('tarifas', () => {
  const valle = byName('Valle de Aburrá');

  it('el formulario nuevo ofrece los cinco tipos y no muestra montos hasta elegir', () => {
    const html = renderToStaticMarkup(
      <RuleForm hasAll={false} onDone={() => undefined} rule={null} zone={valle} />,
    );

    for (const label of [
      'Gratis',
      'Fija por pedido',
      'Por unidad',
      'Base más unidad adicional',
      'Cotización manual',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain('Monto por pedido (COP)');
  });

  it.each([
    ['flat_order', ['Monto por pedido (COP)'], ['Monto por unidad (COP)', 'Valor base']],
    ['per_unit', ['Monto por unidad (COP)'], ['Monto por pedido (COP)']],
    [
      'base_plus_additional',
      ['Valor base, primera unidad (COP)', 'Valor por unidad adicional (COP)'],
      ['Monto por pedido (COP)'],
    ],
    ['free', ['$ 0, declarado de forma explícita'], ['(COP)<']],
    ['manual_quote', ['Sin monto: el envío se cotiza a mano'], ['(COP)<']],
  ] as const)('%s muestra solo sus campos', (type, shown, hidden) => {
    const rule = {
      ...(rulesOf(valle)[0] as ShippingRule),
      rate: {
        type,
        amountCop: type === 'flat_order' ? 10000 : null,
        unitCop: type === 'per_unit' ? 1000 : null,
        baseCop: type === 'base_plus_additional' ? 2000 : null,
        additionalUnitCop: type === 'base_plus_additional' ? 500 : null,
      },
    };
    const html = renderToStaticMarkup(
      <RuleForm hasAll onDone={() => undefined} rule={rule} zone={valle} />,
    ).replaceAll(' ', ' ');

    for (const text of shown) expect(html, text).toContain(text);
    for (const text of hidden) expect(html, text).not.toContain(text);
  });

  it('explica cómo se combina con otras reglas', () => {
    const html = renderToStaticMarkup(<RulesEditor readOnly rules={rulesOf(valle)} zone={valle} />);

    expect(html).toContain('Cómo se combina esta tarifa con otras reglas');
    expect(html).toContain('nunca se convierte en costo cero');
  });

  it('en solo lectura no hay alta, edición ni archivado', () => {
    const html = renderToStaticMarkup(<RulesEditor readOnly rules={rulesOf(valle)} zone={valle} />);

    expect(html).not.toContain('Nueva regla');
    expect(html).not.toContain('>Editar<');
    expect(html).not.toContain('>Archivar<');
  });

  it('una sola regla «todos» por zona', () => {
    const html = renderToStaticMarkup(
      <RuleForm hasAll onDone={() => undefined} rule={null} zone={valle} />,
    );

    expect(html).toContain('Ya hay una regla activa para todos los productos');
  });
});

describe('productos de la zona', () => {
  const bogota = byName('Bogotá urbano');
  const rules = rulesOf(bogota);
  const productRule = rules.find((rule) => rule.scope === 'products') as ShippingRule;

  it('identifica los archivados y no los marca solos', () => {
    const html = renderToStaticMarkup(
      <TargetsEditor
        categories={[
          { id: 'c1', name: 'Sillas', slug: 'sillas', status: 'active' },
          { id: 'c2', name: 'Exterior', slug: 'exterior', status: 'archived' },
        ]}
        productLabels={{
          prd_silla_nordica: { name: 'Silla Nórdica', status: 'active' },
          prd_lampara_arco: { name: 'Lámpara de pie Arco', status: 'archived' },
        }}
        readOnly={false}
        rules={rules}
        targets={{
          [productRule.id]: {
            values: ['prd_silla_nordica', 'prd_lampara_arco'],
            nextPageToken: 'mas',
          },
        }}
        zone={bogota}
      />,
    );

    expect(html).toContain('Lámpara de pie Arco (archivado)');
    expect(html).toContain('Producto sin regla en esta zona');
    expect(html).toContain('Nunca es gratis');
  });
});

describe('información y conflicto', () => {
  it('el formulario nuevo pide nombre, descripción, prioridad, vigencia y comportamiento sin regla', () => {
    const html = renderToStaticMarkup(<ZoneInfoForm readOnly={false} zone={null} />);

    for (const label of [
      'Nombre',
      'Descripción (opcional)',
      'Prioridad',
      'Desde',
      'Hasta',
      'Producto sin regla en esta zona',
    ]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('Crear borrador y seguir');
  });

  it('un conflicto de versión no dice «guardado» y ofrece recargar', () => {
    const html = renderToStaticMarkup(<FailureNotice code="version_conflict" />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Otro administrador modificó esta zona');
    expect(html).toContain('Recargar la versión actual');
    expect(html).not.toMatch(/>Guardad[oa]/);
  });

  it('la página monta el formulario con la versión en la clave, para rehacerlo al recargar', () => {
    const page = readFileSync('src/app/panel/envios/[zoneId]/page.tsx', 'utf8');

    expect(page).toContain('const key = `${zone.id}:${zone.version}`;');
    expect((page.match(/key=\{key\}/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe('activación', () => {
  const draft = byName('Costa Caribe (borrador)');

  it('bloqueada: no muestra el botón', () => {
    const html = renderToStaticMarkup(<ActivateZone enabled={false} zone={draft} />);

    expect(html).not.toContain('Validar y activar');
    expect(html).toContain('Resuelve los bloqueos');
  });

  it('habilitada: valida con el backend y exige confirmación explícita', () => {
    const html = renderToStaticMarkup(<ActivateZone enabled zone={draft} />);
    const source = readFileSync('src/features/shipping/activate-zone.tsx', 'utf8');

    expect(html).toContain('Validar y activar');
    expect(html).toContain('Revisé la cobertura, las tarifas y las advertencias');
    expect(html).toMatch(/disabled=""[^>]*>Activar zona|Activar zona/);
    expect(source).toContain("query<ShippingAnalysis>('/api/admin/shipping/analysis')");
    expect(source).toContain('disabled={busy || !confirmed}');
  });
});

describe('pantalla de una operación de copia', () => {
  const base = {
    copyOperationId: 'op1',
    sourceZoneId: 'shz_src',
    sourceVersion: 4,
    targetZoneId: 'shz_target',
    zone: null,
    phase: 'rules' as const,
    copied: { coverage: 12, rules: 1, targets: 0 },
    failureCode: null,
    message: 'Informative text.',
    createdAt: '2026-10-01T15:00:00.000Z',
    updatedAt: '2026-10-01T15:05:00.000Z',
  };
  const view = (operation: Parameters<typeof CopyOperationView>[0]['operation']) =>
    renderToStaticMarkup(<CopyOperationView operation={operation} sourceName="Valle de Aburrá" />);

  it('copying: fase y contadores de progreso', () => {
    const html = view({ ...base, state: 'copying' });

    expect(html).toContain('Estado: Copiando');
    expect(html).toContain('12 entradas de cobertura, 1 regla y 0 asignaciones copiadas');
    expect(html).toContain('siguiente fase: reglas');
    expect(html).toContain('No utilizable hasta que la copia termine');
  });

  it('ready: muestra y enlaza la zona resultante', () => {
    const ready = zones.find((zone) => zone.copy.state === 'ready') as ShippingZone;
    const html = view({ ...base, state: 'ready', phase: 'finish', zone: ready });

    expect(html).toContain(`href="/panel/envios/${ready.id}"`);
    expect(html).toContain(`Abrir «${ready.name}»`);
    expect(html).toContain(`versión ${ready.version}`);
  });

  it('failed: motivo por failureCode, código estable y message solo como texto', () => {
    const html = view({
      ...base,
      state: 'failed',
      failureCode: 'copy_source_changed',
      message: 'ready discarded 201 copyOperationId=zzz',
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain('La zona original cambió durante la copia.');
    expect(html).toContain('copy_source_changed');
    // El texto aparece tal cual, pero no cambia el estado pintado.
    expect(html).toContain('Estado: Copia fallida');
    expect(html).not.toContain('Copia terminada');
  });

  it('discarded: estado final', () => {
    const html = view({ ...base, state: 'discarded', phase: 'rules' });

    expect(html).toContain('Copia descartada');
    expect(html).toContain('Es un estado final');
  });

  it('no pinta campos que el contrato no publica, aunque llegaran', () => {
    const html = view({
      ...base,
      state: 'failed',
      failureCode: 'copy_step_failed',
      ...({
        idempotencyKey: 'c8a2b1f0-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        fingerprint: 'huella-secreta',
        ruleMap: { a: 'b' },
        actor: 'adm_fake_super',
        stack: 'Error: at /srv/app.js:1',
      } as object),
    });

    for (const secret of [
      'c8a2b1f0',
      'huella-secreta',
      'ruleMap',
      'adm_fake_super',
      '/srv/app.js',
    ]) {
      expect(html, secret).not.toContain(secret);
    }
  });

  it('la pantalla se monta solo con el copyOperationId de la URL', () => {
    const page = readFileSync('src/app/panel/envios/copias/[copyOperationId]/page.tsx', 'utf8');

    expect(page).toContain('getCopyOperation(sessionMaterial, copyOperationId)');
    expect(page).toContain('<CopyOperationView operation={operation}');
  });
});

describe('operación de copia', () => {
  it('copying conserva reanudar y descartar, por si el backend no pudo marcar el fallo', () => {
    const html = renderToStaticMarkup(
      <CopyOperationActions canManage copyOperationId="op1" state="copying" />,
    );

    expect(html).toContain('Reanudar la copia');
    expect(html).toContain('Descartar la copia');
  });

  it('una copia fallida ofrece reanudar y descartar sin pedir ninguna clave', () => {
    const html = renderToStaticMarkup(
      <CopyOperationActions canManage copyOperationId="op1" state="failed" />,
    );

    expect(html).toContain('Reanudar la copia');
    expect(html).toContain('Descartar la copia');
    expect(html).not.toMatch(/idempotency|clave/i);
  });

  it('una terminada o descartada no ofrece acciones; sin permiso, solo lectura', () => {
    expect(
      renderToStaticMarkup(<CopyOperationActions canManage copyOperationId="op1" state="ready" />),
    ).not.toContain('Reanudar');
    expect(
      renderToStaticMarkup(
        <CopyOperationActions canManage copyOperationId="op1" state="discarded" />,
      ),
    ).not.toContain('Descartar la copia');
    expect(
      renderToStaticMarkup(
        <CopyOperationActions canManage={false} copyOperationId="op1" state="failed" />,
      ),
    ).not.toContain('Reanudar');
  });

  it('la página se reconstruye leyendo el backend, sin almacenamiento del navegador', () => {
    const page = readFileSync('src/app/panel/envios/copias/[copyOperationId]/page.tsx', 'utf8');

    expect(page).toContain('getCopyOperation(sessionMaterial, copyOperationId)');

    for (const { name, source } of SOURCES) {
      expect(source, name).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });
});

describe('vista previa', () => {
  it('declara que no crea pedidos ni modifica datos', () => {
    const html = renderToStaticMarkup(
      <PreviewTool
        departments={FIXTURE_DEPARTMENTS}
        drafts={[]}
        initialDraftIds={[]}
        moreDrafts={false}
      />,
    );

    expect(html).toContain('no crea pedidos');
    expect(html).toContain('Calcular vista previa');
    expect(html).toContain('Departamento');
    expect(html).toContain('Municipio');
  });
});

describe('productos: selección múltiple y ficha', () => {
  const products = fixtureProducts().filter(
    (product) => product.status !== 'archived',
  ) as AdminProduct[];

  it('la casilla por fila solo aparece con la selección de envíos', () => {
    const without = renderToStaticMarkup(<ProductsTable canEdit products={products} selectable />);

    expect(without).not.toContain('type="checkbox"');

    const withSelection = renderToStaticMarkup(
      <BulkShippingProvider
        products={products.map((product) => ({ id: product.id, name: product.name }))}
      >
        <ProductsTable canEdit products={products} selectable />
      </BulkShippingProvider>,
    );

    expect(withSelection).toContain('Seleccionar todos los productos de esta página');
    expect(withSelection).toContain('Seleccionar Silla Nórdica');
    expect(withSelection).toContain('Asignar a zonas de envío');
    expect(withSelection).toContain('Retirar de zonas de envío');
  });

  it('«Cobertura y envío» distingue directas de heredadas y solo deja retirar las directas', () => {
    const relation = (
      origin: 'product' | 'category' | 'all',
      scope: 'products' | 'categories' | 'all',
      name: string,
    ) => ({
      zone: {
        id: `z-${name}`,
        name,
        status: 'active' as const,
        copyState: 'ready' as const,
        version: 4,
      },
      rule: {
        id: `r-${name}`,
        name: `Regla ${name}`,
        rateType: 'flat_order' as const,
        scope,
        status: 'active' as const,
        version: 7,
      },
      origin,
      relation: origin === 'product' ? ('direct' as const) : ('inherited' as const),
      categorySlug: origin === 'category' ? 'sillas' : null,
      active: true,
    });
    const initial = {
      items: [
        relation('product', 'products', 'Bogotá'),
        relation('category', 'categories', 'Valle'),
        relation('all', 'all', 'Nacional'),
      ],
      nextPageToken: 'siguiente',
    };
    const product = { id: 'prd_silla_nordica', name: 'Silla Nórdica' };
    const manage = renderToStaticMarkup(
      <ProductShippingSection canManage initial={initial} problem={null} product={product} />,
    );
    const read = renderToStaticMarkup(
      <ProductShippingSection
        canManage={false}
        initial={initial}
        problem={null}
        product={product}
      />,
    );

    expect(manage).toContain('Regla Bogotá · versión 7 · Fija por pedido');
    expect(manage).toContain('Origen: Producto');
    expect(manage).toContain('Origen: Categoría «sillas»');
    expect(manage).toContain('Origen: Todos los productos');
    expect(manage).toContain('Relación: <strong>Directa</strong>');
    expect(manage).toContain('Relación: <strong>Heredada</strong>');
    // Una sola acción de retirar: la de la relación directa. Las heredadas lo dicen y enlazan a su zona.
    expect((manage.match(/>Retirar</g) ?? []).length).toBe(1);
    expect((manage.match(/Heredada: se cambia en la/g) ?? []).length).toBe(2);
    expect(manage).toContain('Asignar a una regla de productos');
    expect(manage).toContain('Cargar más relaciones');
    expect(manage).toContain('no dice qué regla gana');
    expect(read).not.toContain('Asignar a una regla');
    expect(read).not.toContain('>Retirar<');
  });

  it('sin relaciones lo dice sin prometer envío gratis', () => {
    const html = renderToStaticMarkup(
      <ProductShippingSection
        canManage
        initial={{ items: [], nextPageToken: null }}
        problem={null}
        product={{ id: 'p', name: 'P' }}
      />,
    );

    expect(html).toContain('Ninguna regla alcanza a este producto');
    expect(html).toContain('nunca gratis');
  });

  it('la sección vive aparte del formulario del producto', () => {
    const page = readFileSync('src/app/panel/productos/[productId]/page.tsx', 'utf8');
    const detail = readFileSync('src/features/panel/product-detail-client.tsx', 'utf8');

    expect(page).toContain('<ProductShippingSection');
    expect(detail).not.toContain('shipping');
  });
});

// ------------------------------------------------------------------------------------------------
// Comprobaciones estáticas: teclado, diálogos, responsive y frontera
// ------------------------------------------------------------------------------------------------

const DIR = 'src/features/shipping';
const SOURCES = readdirSync(DIR)
  .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
  .map((name) => ({ name, source: readFileSync(join(DIR, name), 'utf8') }));

describe('teclado y diálogos', () => {
  it('ningún elemento no interactivo recibe clics: todo lo pulsable es botón, enlace o campo', () => {
    for (const { name, source } of SOURCES) {
      expect(source, name).not.toMatch(/<(div|span|li|ul|section|p|td|tr)\b[^>]*\bonClick=/);
    }
  });

  it('cada diálogo es modal (foco atrapado y restaurado), con título, descripción y foco inicial', () => {
    const dialogs = SOURCES.filter(({ source }) => source.includes('<dialog'));

    expect(dialogs.length).toBeGreaterThanOrEqual(4);

    for (const { name, source } of dialogs) {
      expect(source, name).toContain('showModal()');
      expect(source, name).toContain('aria-labelledby=');
      expect(source, name).toContain('aria-describedby=');
      expect(source, name).toContain('autoFocus');
      expect(source, name).not.toContain('.show()');
    }
  });

  it('la casilla de tres estados es un botón con role checkbox y aria-checked', () => {
    const source = readFileSync(join(DIR, 'coverage-editor.tsx'), 'utf8');

    expect(source).toContain('role="checkbox"');
    expect(source).toContain('aria-checked={ariaChecked(state)}');
    expect(source).toContain('<button');
  });

  it('los despliegues anuncian su estado', () => {
    const source = readFileSync(join(DIR, 'coverage-editor.tsx'), 'utf8');

    expect(source).toContain('aria-expanded={expanded}');
    expect(source).toContain('aria-controls={childrenId}');
  });
});

describe('responsive', () => {
  const css = readFileSync(join(DIR, 'shipping.module.css'), 'utf8');

  it('la tabla de zonas se cambia por tarjetas por debajo de 60rem', () => {
    const block = css.slice(css.indexOf('@media (max-width: 60rem)'));

    expect(block).toMatch(/\.zoneTableWrap\s*\{\s*display:\s*none;/);
    expect(block).toMatch(/\.zoneCards\s*\{\s*display:\s*flex;/);
  });

  it('las tablas desbordan dentro de su contenedor, nunca la página', () => {
    for (const name of ['zone-list-view.tsx', 'preview-tool.tsx']) {
      const source = readFileSync(join(DIR, name), 'utf8');

      expect(source, name).toContain('catalog.tableScroll');
    }
  });

  it('ningún ancho fijo supera el de un móvil fuera de las tablas', () => {
    // `min-width` de las tablas y `max-width` de los media queries no cuentan: son cortes, no anchos.
    const widths = [...css.matchAll(/(?<![-a-z])width:\s*(\d+(?:\.\d+)?)rem/g)].map((match) =>
      Number(match[1]),
    );

    expect(widths.every((value) => value <= 22.5)).toBe(true);
  });

  it('los diálogos caben en el viewport', () => {
    expect(css).toMatch(/\.wideDialog\s*\{\s*width:\s*min\(44rem, calc\(100vw - 2rem\)\);/);
  });
});

describe('frontera y datos', () => {
  const CLIENT = SOURCES.filter(({ source }) => source.startsWith("'use client'"));

  it('los Client Components de envíos solo hablan con el BFF', () => {
    expect(CLIENT.length).toBeGreaterThan(5);

    for (const { name, source } of CLIENT) {
      expect(source, name).not.toMatch(/from '@\/lib\/api\/shipping'(?!;?\s*$)/m);
      expect(source, name).not.toMatch(/^import \{[^}]*\} from '@\/lib\/api\/shipping'/m);
      expect(source, name).not.toContain('shipping-server');
      expect(source, name).not.toMatch(/\/v1\/|run\.app|firebase/);
    }

    const client = readFileSync(join(DIR, 'shipping-client.ts'), 'utf8');

    expect(client).toContain("const BASE = '/api/admin/shipping'");
  });

  it('no queda ningún atajo del contrato anterior: listas completas, token de servicio ni claves guardadas', () => {
    const production = [
      ...SOURCES.map(({ source }) => source),
      readFileSync('src/lib/api/shipping.ts', 'utf8'),
      readFileSync(join(DIR, 'shipping-server.ts'), 'utf8'),
      readFileSync(join(DIR, 'zone-list.ts'), 'utf8'),
      readFileSync('src/app/panel/envios/page.tsx', 'utf8'),
    ].join('\n');

    for (const gone of [
      'ZONE_LIST_MAX',
      'searchZonesByLocation',
      'loadProductCoverage',
      'listAllTargets',
      'CopyOperationsProvider',
      'x-service-token',
      'serviceToken',
      'geography_unavailable',
      'paginate(',
      'filterZones',
    ]) {
      expect(production, gone).not.toContain(gone);
    }
  });

  it('el listado de zonas siempre pide una página acotada con cursor', () => {
    const list = readFileSync(join(DIR, 'zone-list.ts'), 'utf8');
    const api = readFileSync('src/lib/api/shipping.ts', 'utf8');

    expect(list).toContain('pageSize: ZONE_PAGE_SIZE');
    expect(list).toContain('pageToken: filters.cursor');
    expect(api).toMatch(
      /export async function listZones\(\s*sessionMaterial: string,\s*query: ZoneQuery/,
    );
  });

  it('nadie extrae identificadores ni decisiones del texto de los errores ni de message', () => {
    const files = [
      ...SOURCES.map(({ name, source }) => ({ name, source })),
      ...[
        'shipping-client.ts',
        'copy-operation-model.ts',
        'shipping-errors.ts',
        'shipping-server.ts',
        'zone-list.ts',
      ].map((name) => ({ name, source: readFileSync(join(DIR, name), 'utf8') })),
      ...[
        'src/lib/api/shipping.ts',
        'src/lib/api/errors.ts',
        'src/features/panel/catalog-client.ts',
        'src/features/session/mutation-route.ts',
        'src/features/session/query-route.ts',
        'src/features/session/api-errors.ts',
      ].map((name) => ({ name, source: readFileSync(name, 'utf8') })),
    ];

    for (const { name, source } of files) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

      expect(code, name).not.toMatch(
        /message\??\.(match|matchAll|split|replace|replaceAll|search|includes|startsWith|indexOf)\(/,
      );
      expect(code, name).not.toMatch(/\.(exec|test|match|matchAll)\(\s*[\w?.]*message/);
      expect(code, name).not.toMatch(/description\??\.(match|matchAll|split|replace|search)\(/);
    }

    // Ningún parser de errores conoce el id de una operación de copia.
    for (const name of [
      'src/lib/api/errors.ts',
      'src/features/panel/catalog-client.ts',
      'src/features/session/api-errors.ts',
    ]) {
      expect(readFileSync(name, 'utf8'), name).not.toContain('copyOperationId');
    }
  });

  it('el backend simulado y sus datos no entran en el build', () => {
    const production: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);

        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
          production.push(full);
      }
    }

    walk('src');

    for (const path of production) {
      const source = readFileSync(path, 'utf8');

      expect(source, path).not.toContain('fake-backend');
      expect(source, path).not.toContain('test/shipping');
    }
  });

  it('ninguna pantalla de envíos inventa datos: no hay nombres de zonas ni productos de ejemplo', () => {
    for (const { name, source } of SOURCES) {
      for (const sample of [
        'Valle de Aburrá',
        'Silla Nórdica',
        'Bogotá urbano',
        'Laura Gerencia',
      ]) {
        expect(source, `${name}: ${sample}`).not.toContain(sample);
      }
    }
  });
});
