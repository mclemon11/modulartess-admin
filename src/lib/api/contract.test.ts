import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import contract from '../../../openapi/backend-v1.json';

/**
 * El contrato OpenAPI es la única fuente de verdad. Estas pruebas fijan lo que el panel da por
 * cierto: si el backend cambia el contrato, fallan aquí en lugar de fallar en producción.
 */

const TYPES_PATH = 'src/lib/api/generated/schema.d.ts';

describe('copia versionada del contrato', () => {
  it('es un documento OpenAPI con las rutas de sesión administrativa', () => {
    expect(contract.openapi).toMatch(/^3\./);
    expect(contract.paths).toHaveProperty(['/v1/admin/auth/session']);
    expect(contract.paths['/v1/admin/auth/session']).toHaveProperty('post');
    expect(contract.paths['/v1/admin/auth/session']).toHaveProperty('get');
  });

  it('no publica ningún DELETE de la sesión: el BFF no puede inventarlo', () => {
    expect(contract.paths['/v1/admin/auth/session']).not.toHaveProperty('delete');
  });

  it('declara la sesión administrativa como apiKey en su propio encabezado', () => {
    expect(contract.components.securitySchemes.adminSession).toEqual({
      in: 'header',
      name: 'x-modulartess-admin-session',
      type: 'apiKey',
    });
  });

  it('devuelve el material de sesión solo en el encabezado de respuesta, nunca en el cuerpo', () => {
    const created = contract.paths['/v1/admin/auth/session'].post.responses['201'];

    expect(created.headers).toHaveProperty('x-modulartess-admin-session');
    expect(Object.keys(contract.components.schemas.AdminSessionCreatedDto.properties)).toEqual([
      'expiresAt',
      'principal',
    ]);
  });

  it('publica exactamente los tres roles administrativos', () => {
    // El backend implementó la ADR 0007: el enum ya no es solo `super_admin`. El orden importa
    // porque es el que el panel refleja en su modelo de permisos.
    expect(contract.components.schemas.AdminPrincipalDto.properties.role.enum).toEqual([
      'super_admin',
      'master_admin',
      'moderator',
    ]);
  });

  it('publica las quince operaciones de catálogo administrativo', () => {
    const operations: string[] = [];

    for (const [path, node] of Object.entries(contract.paths)) {
      if (!path.startsWith('/v1/admin/products')) {
        continue;
      }

      for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
        if (method in node) {
          operations.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    expect(operations.sort()).toEqual([
      'GET /v1/admin/products',
      'GET /v1/admin/products/{productId}',
      'GET /v1/admin/products/{productId}/variants',
      'PATCH /v1/admin/products/{productId}',
      'PATCH /v1/admin/products/{productId}/images/{imageId}',
      'PATCH /v1/admin/products/{productId}/variants/{variantId}',
      'POST /v1/admin/products',
      'POST /v1/admin/products/{productId}/archive',
      'POST /v1/admin/products/{productId}/images',
      'POST /v1/admin/products/{productId}/images/{imageId}/archive',
      'POST /v1/admin/products/{productId}/inventory-adjustments',
      'POST /v1/admin/products/{productId}/publish',
      'POST /v1/admin/products/{productId}/variants',
      'POST /v1/admin/products/{productId}/variants/{variantId}/archive',
      'POST /v1/admin/products/{productId}/variants/{variantId}/inventory-adjustments',
    ]);
  });

  it('describe cada parámetro de ruta en las operaciones dinámicas', () => {
    const dynamic = Object.entries(contract.paths).filter(([path]) => path.includes('{productId}'));

    expect(dynamic.length).toBe(11);

    let declarations = 0;

    for (const [path, node] of dynamic) {
      for (const [method, operation] of Object.entries(node as Record<string, unknown>)) {
        if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) {
          continue;
        }

        const parameters = [
          ...((node as { parameters?: unknown[] }).parameters ?? []),
          ...(((operation as { parameters?: unknown[] }).parameters ?? []) as unknown[]),
        ] as { in?: string; name?: string; required?: boolean }[];

        // Cada segmento `{...}` de la ruta tiene que estar declarado como parámetro de ruta
        // obligatorio: sin eso, `openapi-fetch` no puede sustituirlo y la operación es
        // inalcanzable desde el panel.
        for (const segment of path.matchAll(/\{(\w+)\}/g)) {
          const name = segment[1];
          const declared = parameters.find((parameter) => parameter.name === name);

          expect(declared, `${method.toUpperCase()} ${path} → ${String(name)}`).toMatchObject({
            in: 'path',
            required: true,
          });
        }

        declarations += 1;
      }
    }

    expect(declarations).toBe(13);
  });

  it('el alta de producto no admite clasificación ni ejes: eso viaja en el PATCH', () => {
    // De aquí sale el orden del alta: crear con los campos base y enriquecer después, antes de
    // crear ninguna variante.
    const create = contract.components.schemas.CreateProductRequestDto.properties;

    expect(Object.keys(create).sort()).toEqual([
      'description',
      'lowStockThreshold',
      'name',
      'priceCop',
      'shortDescription',
      'sku',
      'slug',
      'stockQuantity',
    ]);

    const update = contract.components.schemas.UpdateProductRequestDto.properties;

    for (const field of [
      'attributes',
      'care',
      'category',
      'featured',
      'features',
      'materials',
      'measurements',
      'productType',
      'warranty',
    ]) {
      expect(update).toHaveProperty([field]);
    }
  });

  it('fija los límites de las variantes que replica el panel', () => {
    const product = contract.components.schemas.AdminProductDto.properties;

    // El máximo de variantes activas solo está en la descripción; de ahí sale VARIANT_MAX_ACTIVE.
    expect(product.variants.description).toContain('At most 72 active ones');
    expect(product.attributes.maxItems).toBe(6);
    expect(contract.components.schemas.ProductVariantAttributeDto.properties.value.maxLength).toBe(
      60,
    );
    expect(contract.components.schemas.ProductTaxonomyDto.properties.slug.maxLength).toBe(60);
    expect(contract.components.schemas.UpdateProductRequestDto.properties.features.maxItems).toBe(
      20,
    );
  });

  it('el alta de variante exige expectedVersion, SKU, atributos y precio', () => {
    expect(contract.components.schemas.CreateProductVariantRequestDto.required).toEqual([
      'expectedVersion',
      'sku',
      'attributes',
      'priceCop',
    ]);

    // Ni el SKU ni el stock se editan: el SKU es inmutable y el stock va por ajuste de inventario.
    expect(
      Object.keys(contract.components.schemas.UpdateProductVariantRequestDto.properties).sort(),
    ).toEqual(['attributes', 'expectedVersion', 'priceCop']);
  });

  it('solo los ajustes de inventario y la subida de imagen exigen Idempotency-Key', () => {
    const withKey: string[] = [];

    for (const [path, node] of Object.entries(contract.paths)) {
      for (const [method, operation] of Object.entries(node as Record<string, unknown>)) {
        const parameters = ((operation as { parameters?: { name?: string }[] }).parameters ??
          []) as { name?: string }[];

        if (parameters.some((parameter) => parameter.name === 'Idempotency-Key')) {
          withKey.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    // Crear una variante NO la lleva: lo que evita duplicados ahí es el SKU reservado y la
    // combinación única.
    expect(withKey.sort()).toEqual([
      'POST /v1/admin/products/{productId}/images',
      'POST /v1/admin/products/{productId}/inventory-adjustments',
      'POST /v1/admin/products/{productId}/variants/{variantId}/inventory-adjustments',
    ]);
  });

  it('el producto administrativo publica la preparación para publicar', () => {
    const product = contract.components.schemas.AdminProductDto;

    // El panel la muestra tal cual y NO recalcula ninguna regla: publish consume esta misma
    // evaluación, así que derivarla aquí acabaría contradiciendo al backend.
    expect(product.required).toContain('publicationReadiness');
    expect(product.properties.publicationReadiness.allOf[0]).toEqual({
      $ref: '#/components/schemas/PublicationReadinessDto',
    });

    const readiness = contract.components.schemas.PublicationReadinessDto;

    expect(readiness.required).toEqual(['ready', 'missing']);
    expect(readiness.properties.missing.items.enum).toHaveLength(17);
  });

  it('el precio viaja como entero, sin símbolo ni separadores', () => {
    const price = contract.components.schemas.AdminProductDto.properties.priceCop;

    expect(price.type).toBe('number');
    expect(price.format).toBe('int32');
    // El símbolo y los puntos de miles son de la pantalla, no del dato.
    expect(price.description).toContain('never stored as formatted text');
  });

  it('fija los límites del idToken que replica la validación del BFF', () => {
    const { idToken } = contract.components.schemas.AdminSessionRequestDto.properties;

    expect(idToken.minLength).toBe(32);
    expect(idToken.maxLength).toBe(4096);
    expect(contract.components.schemas.AdminSessionRequestDto.required).toEqual(['idToken']);
  });
});

describe('tipos generados', () => {
  it('existen y provienen del generador, no de una edición a mano', () => {
    const generated = readFileSync(TYPES_PATH, 'utf8');

    expect(generated).toContain('auto-generated by openapi-typescript');
    expect(generated).toContain('/v1/admin/auth/session');
  });

  it('están sincronizados con la copia del contrato (lo verifica pnpm api:check)', () => {
    const generated = readFileSync(TYPES_PATH, 'utf8');

    // Toda ruta del contrato debe aparecer en los tipos generados.
    for (const path of Object.keys(contract.paths)) {
      expect(generated).toContain(`"${path}"`);
    }
  });
});
