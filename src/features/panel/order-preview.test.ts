import { describe, expect, it } from 'vitest';

import { extraLabel, unitLabel } from './order-preview';

describe('resumen del primer producto', () => {
  it('cuenta las unidades de la línea que se muestra', () => {
    expect(unitLabel(1)).toBe('1 unidad');
    expect(unitLabel(3)).toBe('3 unidades');
  });

  it('resta la línea que ya se enseña para decir cuántas faltan', () => {
    // `itemCount` es el total de líneas y la primera ya está a la vista.
    expect(extraLabel(1)).toBeNull();
    expect(extraLabel(2)).toBe('y 1 producto más');
    expect(extraLabel(5)).toBe('y 4 productos más');
  });

  it('un recuento incoherente no produce un texto absurdo', () => {
    expect(extraLabel(0)).toBeNull();
  });
});
