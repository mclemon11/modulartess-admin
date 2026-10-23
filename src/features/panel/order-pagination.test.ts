import { describe, expect, it } from 'vitest';

import {
  orderListSearch,
  orderPageCount,
  orderPageWindow,
  orderRangeLabel,
  orderStatusSearch,
  readOrderListPosition,
  readOrderStatusFilter,
} from './order-pagination';

const pages = (current: number, count: number) =>
  orderPageWindow(current, count).map((entry) => (entry.kind === 'page' ? entry.page : '…'));

describe('posición del listado en la URL', () => {
  it('sin parámetros es la página 1 con 20 por página', () => {
    expect(readOrderListPosition({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('lee página y tamaño válidos', () => {
    for (const size of ['10', '20', '50', '100']) {
      expect(readOrderListPosition({ page: '3', pageSize: size })).toEqual({
        page: 3,
        pageSize: Number(size),
      });
    }
  });

  it('vuelve a los valores por omisión con lo que no reconoce', () => {
    for (const page of ['0', '-1', '1.5', 'abc', '', ' 2', '999999']) {
      expect(readOrderListPosition({ page }).page).toBe(1);
    }
    for (const pageSize of ['5', '30', '1000', 'x', '20.0']) {
      expect(readOrderListPosition({ pageSize }).pageSize).toBe(20);
    }
  });

  it('toma el primer valor si el parámetro se repite', () => {
    expect(readOrderListPosition({ page: ['2', '9'], pageSize: ['50', '10'] })).toEqual({
      page: 2,
      pageSize: 50,
    });
  });

  it('escribe la posición conservando otros parámetros y descartando el cursor antiguo', () => {
    expect(orderListSearch('pageToken=abc&estado=pagado', { page: 2, pageSize: 20 })).toBe(
      '?estado=pagado&page=2&pageSize=20',
    );
  });
});

describe('números de página', () => {
  it('cuenta las páginas y deja una cuando no hay pedidos', () => {
    expect(orderPageCount(0, 20)).toBe(1);
    expect(orderPageCount(126, 20)).toBe(7);
    expect(orderPageCount(120, 20)).toBe(6);
    expect(orderPageCount(126, 100)).toBe(2);
  });

  it('muestra todas cuando son pocas', () => {
    expect(pages(1, 1)).toEqual([1]);
    expect(pages(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('salta con huecos al principio, en medio y al final', () => {
    expect(pages(1, 20)).toEqual([1, 2, 3, 4, '…', 20]);
    expect(pages(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20]);
    expect(pages(20, 20)).toEqual([1, '…', 17, 18, 19, 20]);
  });

  it('no esconde una sola página detrás de un hueco', () => {
    expect(pages(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('siempre incluye la actual una sola vez', () => {
    for (let count = 1; count <= 30; count += 1) {
      for (let current = 1; current <= count; current += 1) {
        const numbers = pages(current, count).filter((entry) => entry !== '…');
        expect(numbers.filter((page) => page === current)).toHaveLength(1);
        expect(new Set(numbers).size).toBe(numbers.length);
        expect(numbers[0]).toBe(1);
        expect(numbers.at(-1)).toBe(count);
      }
    }
  });
});

describe('texto del rango', () => {
  it('describe la página intermedia y la última', () => {
    expect(orderRangeLabel(2, 20, 20, 126)).toBe('Mostrando 21–40 de 126 pedidos');
    expect(orderRangeLabel(7, 20, 6, 126)).toBe('Mostrando 121–126 de 126 pedidos');
  });

  it('usa el singular y formatea miles', () => {
    expect(orderRangeLabel(1, 20, 1, 1)).toBe('Mostrando 1–1 de 1 pedido');
    expect(orderRangeLabel(1, 100, 100, 1500)).toBe('Mostrando 1–100 de 1.500 pedidos');
  });

  it('dice que no hay pedidos con la lista vacía', () => {
    expect(orderRangeLabel(1, 20, 0, 0)).toBe('No hay pedidos');
  });
});

describe('filtro por estado en la URL', () => {
  it('lee el valor técnico del estado y «Todos» cuando falta o no tiene forma de estado', () => {
    expect(readOrderStatusFilter('paid')).toBe('paid');
    expect(readOrderStatusFilter(['ready_to_ship', 'paid'])).toBe('ready_to_ship');
    for (const value of [undefined, null, '', 'PAID', 'paid ', 'pa-id', '1paid', 'x'.repeat(41)]) {
      expect(readOrderStatusFilter(value)).toBeNull();
    }
  });

  it('cambiar de estado vuelve a la página 1 y conserva el tamaño', () => {
    expect(orderStatusSearch('?page=4&pageSize=50', 'shipped', 50)).toBe(
      '?page=1&pageSize=50&status=shipped',
    );
    expect(orderStatusSearch('?page=4&pageSize=50&status=paid', 'cancelled', 50)).toBe(
      '?page=1&pageSize=50&status=cancelled',
    );
  });

  it('«Todos» quita el filtro de la URL', () => {
    expect(orderStatusSearch('?page=3&pageSize=10&status=paid', null, 10)).toBe(
      '?page=1&pageSize=10',
    );
  });

  it('anterior, siguiente, páginas numeradas y tamaño conservan el filtro', () => {
    const current = '?page=2&pageSize=20&status=preparing';
    for (const position of [
      { page: 1, pageSize: 20 as const },
      { page: 3, pageSize: 20 as const },
      { page: 7, pageSize: 20 as const },
      { page: 1, pageSize: 100 as const },
    ]) {
      const params = new URLSearchParams(orderListSearch(current, position));
      expect(params.get('status')).toBe('preparing');
      expect(params.get('page')).toBe(String(position.page));
      expect(params.get('pageSize')).toBe(String(position.pageSize));
    }
  });
});
