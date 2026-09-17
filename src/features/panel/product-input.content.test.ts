import { describe, expect, it } from 'vitest';

import {
  DESCRIPTION_MAX_LENGTH,
  FEATURE_MAX_LENGTH,
  FEATURES_MAX_ITEMS,
  SHORT_DESCRIPTION_MAX_LENGTH,
} from '@/lib/api/variant-limits';

import { parseCreateProduct, parseUpdateProduct } from './product-input';

/**
 * La frontera del BFF vuelve a comprobar los topes editoriales.
 *
 * El formulario ya avisa, pero el BFF es quien recibe el cuerpo: un cliente que no sea la pantalla
 * —o una pantalla con un fallo— no debe conseguir que se gaste un identity token en una llamada que
 * el backend va a rechazar. El backend sigue siendo la autoridad; esto solo evita el viaje.
 */

const at = (length: number) => 'a'.repeat(length);

const BASE = {
  sku: 'TOCADOR-AURA-80',
  slug: 'tocador-aura',
  name: 'Tocador Aura',
  priceCop: 1450000,
};

describe('alta: descripción corta', () => {
  it('acepta 180', () => {
    const body = parseCreateProduct({
      ...BASE,
      shortDescription: at(SHORT_DESCRIPTION_MAX_LENGTH),
    });

    expect(body?.shortDescription).toHaveLength(SHORT_DESCRIPTION_MAX_LENGTH);
  });

  it('rechaza 181', () => {
    expect(
      parseCreateProduct({ ...BASE, shortDescription: at(SHORT_DESCRIPTION_MAX_LENGTH + 1) }),
    ).toBeNull();
  });

  it('omitirla es válido: el contrato no la exige para crear', () => {
    const body = parseCreateProduct(BASE);

    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty('shortDescription');
  });
});

describe('alta: descripción detallada', () => {
  it('acepta 3000', () => {
    const body = parseCreateProduct({ ...BASE, description: at(DESCRIPTION_MAX_LENGTH) });

    expect(body?.description).toHaveLength(DESCRIPTION_MAX_LENGTH);
  });

  it('rechaza 3001', () => {
    expect(parseCreateProduct({ ...BASE, description: at(DESCRIPTION_MAX_LENGTH + 1) })).toBeNull();
  });
});

describe('edición: descripciones', () => {
  it('acepta las dos en su tope', () => {
    const body = parseUpdateProduct({
      expectedVersion: 3,
      shortDescription: at(SHORT_DESCRIPTION_MAX_LENGTH),
      description: at(DESCRIPTION_MAX_LENGTH),
    });

    expect(body?.shortDescription).toHaveLength(SHORT_DESCRIPTION_MAX_LENGTH);
    expect(body?.description).toHaveLength(DESCRIPTION_MAX_LENGTH);
  });

  it('rechaza pasarse en cualquiera de las dos', () => {
    expect(
      parseUpdateProduct({
        expectedVersion: 3,
        shortDescription: at(SHORT_DESCRIPTION_MAX_LENGTH + 1),
      }),
    ).toBeNull();
    expect(
      parseUpdateProduct({ expectedVersion: 3, description: at(DESCRIPTION_MAX_LENGTH + 1) }),
    ).toBeNull();
  });

  it('la cadena vacía pasa tal cual: es la forma de borrar el texto', () => {
    const body = parseUpdateProduct({ expectedVersion: 3, shortDescription: '', description: '' });

    expect(body?.shortDescription).toBe('');
    expect(body?.description).toBe('');
  });

  it('omitir un campo no es lo mismo que vaciarlo', () => {
    const body = parseUpdateProduct({ expectedVersion: 3, description: 'Algo' });

    expect(body).not.toHaveProperty('shortDescription');
    expect(body?.description).toBe('Algo');
  });
});

describe('edición: características', () => {
  it('acepta exactamente 5', () => {
    const features = ['una', 'dos', 'tres', 'cuatro', 'cinco'];
    const body = parseUpdateProduct({ expectedVersion: 3, features });

    expect(body?.features).toEqual(features);
  });

  it('rechaza 6', () => {
    expect(
      parseUpdateProduct({
        expectedVersion: 3,
        features: ['una', 'dos', 'tres', 'cuatro', 'cinco', 'seis'],
      }),
    ).toBeNull();
  });

  it('acepta 60 caracteres en una característica', () => {
    const body = parseUpdateProduct({ expectedVersion: 3, features: [at(FEATURE_MAX_LENGTH)] });

    expect(body?.features?.[0]).toHaveLength(FEATURE_MAX_LENGTH);
  });

  it('rechaza 61', () => {
    expect(
      parseUpdateProduct({ expectedVersion: 3, features: [at(FEATURE_MAX_LENGTH + 1)] }),
    ).toBeNull();
  });

  it('rechaza una característica en blanco: el contrato no admite huecos', () => {
    expect(parseUpdateProduct({ expectedVersion: 3, features: ['una', '   '] })).toBeNull();
  });

  it('conserva el orden recibido', () => {
    const body = parseUpdateProduct({
      expectedVersion: 3,
      features: ['tercera', 'primera', 'segunda'],
    });

    expect(body?.features).toEqual(['tercera', 'primera', 'segunda']);
  });

  it('la lista vacía pasa: es como se quitan todas', () => {
    expect(parseUpdateProduct({ expectedVersion: 3, features: [] })?.features).toEqual([]);
  });

  it(`el tope replicado es el del contrato (${FEATURES_MAX_ITEMS})`, () => {
    // Si el backend lo mueve, `src/lib/api/contract.test.ts` falla antes que esto.
    expect(FEATURES_MAX_ITEMS).toBe(5);
  });
});

describe('edición: detalles adicionales', () => {
  it('los cuatro vacíos son un cuerpo válido: todos son opcionales', () => {
    const body = parseUpdateProduct({
      expectedVersion: 3,
      materials: '',
      measurements: '',
      warranty: '',
      care: '',
    });

    expect(body).toEqual({
      expectedVersion: 3,
      materials: '',
      measurements: '',
      warranty: '',
      care: '',
    });
  });
});
