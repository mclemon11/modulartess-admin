import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import contract from '@/../openapi/backend-v1.json';

import { parseSetInventoryControl, parseSetInventoryInput } from './product-input';

/**
 * El contrato, la frontera del BFF y la garantía de que la interfaz dejó de usar los deltas.
 *
 * Todo lo que se comprueba aquí se lee del OpenAPI comiteado o del código fuente, no de una copia
 * escrita a mano: cuando el backend mueva algo y se actualice la copia, lo que falla es el panel
 * desactualizado, no una expectativa que alguien tendría que acordarse de cambiar.
 */

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const BASE_ROUTE = 'src/app/api/admin/products/[productId]/inventory/route.ts';
const VARIANT_ROUTE =
  'src/app/api/admin/products/[productId]/variants/[variantId]/inventory/route.ts';

describe('1. los tipos salen del OpenAPI', () => {
  it('el contrato publica los tres esquemas de inventario', () => {
    for (const schema of [
      'InventoryControlDto',
      'SetInventoryControlDto',
      'SetInventoryRequestDto',
    ]) {
      expect(contract.components.schemas).toHaveProperty([schema]);
    }
  });

  it('los cuatro DTO llevan inventory y ninguno conserva los campos planos', () => {
    for (const name of [
      'AdminProductDto',
      'AdminProductVariantDto',
      'CreateProductRequestDto',
      'CreateProductVariantRequestDto',
    ]) {
      const properties = (
        contract.components.schemas as Record<string, { properties: Record<string, unknown> }>
      )[name]?.properties;

      expect(properties, name).toHaveProperty(['inventory']);
      expect(properties, name).not.toHaveProperty(['stockQuantity']);
      expect(properties, name).not.toHaveProperty(['lowStockThreshold']);
    }
  });

  /*
   * En modo disponibilidad el contrato manda `quantity` y `lowStockThreshold` en `null`, y ese
   * `null` significa «no aplica», nunca cero. Si dejaran de ser anulables, el panel estaría
   * aplanando un dato que el backend distingue.
   */
  it('la proyección de lectura distingue «no aplica» de cero', () => {
    const control = contract.components.schemas.InventoryControlDto;

    expect(control.properties.quantity.nullable).toBe(true);
    expect(control.properties.lowStockThreshold.nullable).toBe(true);
    expect(control.required).toContain('availability');
    expect(control.properties.manualAvailability.nullable).toBe(true);
  });

  it('el panel no escribe ningún DTO a mano: los tipos derivan del esquema generado', () => {
    const source = read('src/lib/api/catalog.ts');

    expect(source).toContain("components['schemas']['SetInventoryControlDto']");
    expect(source).toContain("components['schemas']['InventoryControlDto']");
  });
});

describe('2 y 3. las dos rutas exigen y reenvían la Idempotency-Key', () => {
  it.each([
    ['/v1/admin/products/{productId}/inventory', BASE_ROUTE],
    ['/v1/admin/products/{productId}/variants/{variantId}/inventory', VARIANT_ROUTE],
  ])('%s', (path, route) => {
    const operation = (
      contract.paths as Record<
        string,
        { put?: { parameters?: { name?: string; required?: boolean }[] } }
      >
    )[path]?.put;

    expect(operation, path).toBeDefined();

    const key = operation?.parameters?.find((parameter) => parameter.name === 'Idempotency-Key');

    expect(key, path).toMatchObject({ required: true });

    // El BFF la saca del cuerpo y la pasa al encabezado del cliente tipado.
    expect(read(route)).toContain('input.idempotencyKey');
  });

  it('un cuerpo sin clave no llega al backend', () => {
    expect(
      parseSetInventoryInput({
        expectedVersion: 3,
        inventory: { mode: 'availability', status: 'in_stock' },
      }),
    ).toBeNull();
  });

  /*
   * Sensibilidad: una clave demasiado corta tampoco pasa. Sin este límite, `idempotencyKey: 'x'`
   * viajaría como encabezado y el backend no podría reconocer un reintento.
   */
  it('una clave demasiado corta se rechaza', () => {
    expect(
      parseSetInventoryInput({
        expectedVersion: 3,
        idempotencyKey: 'corta',
        inventory: { mode: 'availability', status: 'in_stock' },
      }),
    ).toBeNull();
  });

  it('un cuerpo completo se acepta y conserva la clave', () => {
    expect(
      parseSetInventoryInput({
        expectedVersion: 3,
        idempotencyKey: '0e4d6b5a-2f11-4a3c-9f0f-1b2c3d4e5f60',
        inventory: { mode: 'tracked', quantity: 15, lowStockThreshold: 2 },
      }),
    ).toEqual({
      idempotencyKey: '0e4d6b5a-2f11-4a3c-9f0f-1b2c3d4e5f60',
      body: {
        expectedVersion: 3,
        inventory: { mode: 'tracked', quantity: 15, lowStockThreshold: 2 },
      },
    });
  });
});

describe('4. Origin y sesión son obligatorios', () => {
  /*
   * Las dos rutas usan `handleMutation`, que es quien valida `Origin` contra la variable
   * server-only, exige la cookie `__Host-`, limita el cuerpo y responde `no-store`. Comprobarlo
   * así —y no reimplementando la frontera en cada ruta— es lo que impide que una ruta nueva se
   * olvide de una de las cuatro cosas.
   */
  it.each([BASE_ROUTE, VARIANT_ROUTE])('%s pasa por handleMutation', (route) => {
    const source = read(route);

    expect(source.startsWith("import 'server-only';")).toBe(true);
    expect(source).toContain('handleMutation');
  });

  it('handleMutation valida origen, sesión, JSON y tamaño', () => {
    const source = read('src/features/session/mutation-route.ts');

    expect(source).toContain('checkOrigin');
    expect(source).toContain('SESSION_COOKIE_NAME');
    expect(source).toContain('hasJsonContentType');
    expect(source).toContain('MAX_REQUEST_BODY_BYTES');
    expect(source).toContain("'Cache-Control': 'no-store'");
  });

  it('el navegador no conoce la URL del backend', () => {
    for (const route of [BASE_ROUTE, VARIANT_ROUTE]) {
      expect(read(route)).not.toContain('NEXT_PUBLIC');
    }
  });
});

describe('5. el cuerpo se construye campo a campo', () => {
  it('lo que sobra del modo elegido no viaja', () => {
    expect(
      parseSetInventoryControl({
        mode: 'availability',
        status: 'in_stock',
        quantity: 9,
        lowStockThreshold: 3,
      }),
    ).toEqual({ mode: 'availability', status: 'in_stock' });

    expect(
      parseSetInventoryControl({
        mode: 'tracked',
        quantity: 9,
        lowStockThreshold: 3,
        status: 'out_of_stock',
      }),
    ).toEqual({ mode: 'tracked', quantity: 9, lowStockThreshold: 3 });
  });

  it('ningún campo ajeno se cuela', () => {
    const parsed = parseSetInventoryControl({
      mode: 'tracked',
      quantity: 9,
      delta: -3,
      reason: 'inventario físico',
    });

    expect(Object.keys(parsed ?? {}).sort()).toEqual(['lowStockThreshold', 'mode', 'quantity']);
  });

  it.each([
    ['sin modo', { quantity: 4 }],
    ['modo inventado', { mode: 'manual', quantity: 4 }],
    ['disponibilidad sin estado', { mode: 'availability' }],
    ['estado inventado', { mode: 'availability', status: 'maybe' }],
    ['cantidad negativa', { mode: 'tracked', quantity: -1 }],
    ['cantidad con decimales', { mode: 'tracked', quantity: 1.5 }],
    ['cantidad por encima del tope', { mode: 'tracked', quantity: 1_000_001 }],
    ['umbral negativo', { mode: 'tracked', quantity: 4, lowStockThreshold: -1 }],
    ['conteo sin cantidad', { mode: 'tracked' }],
  ])('rechaza %s', (_label, raw) => {
    expect(parseSetInventoryControl(raw)).toBeNull();
  });
});

describe('6. la interfaz dejó de usar los endpoints de delta', () => {
  /*
   * Se comprueba sobre el **cliente del navegador**: ahí es donde la interfaz podría volver a
   * llamarlos. Las rutas del BFF y el contrato conservan el ajuste por delta —no hacía falta
   * quitarlo— pero desde la pantalla ya no hay forma de llegar.
   */
  it('el cliente del navegador no expone ninguna llamada por delta', () => {
    const source = read('src/features/panel/catalog-client.ts');

    expect(source).not.toContain('inventory-adjustments');
    expect(source).toContain('setProductInventory');
    expect(source).toContain('setVariantInventory');
  });

  it('ninguna pantalla importa un ajuste por delta', () => {
    for (const file of [
      'src/features/panel/product-detail-client.tsx',
      'src/features/panel/product-variants.tsx',
      'src/features/panel/create-product-form.tsx',
    ]) {
      const source = read(file);

      expect(source, file).not.toContain('adjustInventory');
      expect(source, file).not.toContain('adjustVariantInventory');
      expect(source, file).not.toContain('inventory-adjustments');
    }
  });

  it('las dos rutas nuevas usan PUT, no POST', () => {
    for (const route of [BASE_ROUTE, VARIANT_ROUTE]) {
      const source = read(route);

      expect(source).toContain('export async function PUT(');
      expect(source).not.toContain('export async function POST(');
    }
  });
});
