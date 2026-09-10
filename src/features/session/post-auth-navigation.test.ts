import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  createNavigationTargets,
  FALLBACK_DESTINATION,
  planPostAuthNavigation,
  readSessionStateCode,
  runNavigationPlan,
  SESSION_STATE_CODES,
  SESSION_STATE_PARAM,
} from './post-auth-navigation';

const DESTINATIONS = ['/panel', '/verificar-correo', '/iniciar-sesion'] as const;

describe('signOut correcto: basta la navegación SPA', () => {
  it.each(DESTINATIONS)('navega por SPA a %s', (destination) => {
    expect(planPostAuthNavigation({ destination, clientSessionClosed: true })).toEqual({
      kind: 'spa',
      url: destination,
    });
  });

  it('no añade ningún código a la URL cuando todo fue bien', () => {
    const plan = planPostAuthNavigation({ destination: '/panel', clientSessionClosed: true });

    expect(plan.url).not.toContain('?');
  });
});

describe('signOut fallido: siempre navegación completa', () => {
  it('tras un canje correcto, entra al panel destruyendo el documento', () => {
    const plan = planPostAuthNavigation({ destination: '/panel', clientSessionClosed: false });

    expect(plan.kind).toBe('hard');
    expect(plan.url.startsWith('/panel?')).toBe(true);
  });

  it('tras un canje rechazado, recarga el formulario de acceso', () => {
    const plan = planPostAuthNavigation({
      destination: '/iniciar-sesion',
      clientSessionClosed: false,
    });

    expect(plan.kind).toBe('hard');
    expect(plan.url).toBe(
      `/iniciar-sesion?${SESSION_STATE_PARAM}=${SESSION_STATE_CODES.clientSessionNotClosed}`,
    );
  });

  it('tras enviar el correo de verificación, ofrece la misma garantía', () => {
    const plan = planPostAuthNavigation({
      destination: '/verificar-correo',
      clientSessionClosed: false,
    });

    expect(plan.kind).toBe('hard');
  });

  /**
   * La garantía central: `inMemoryPersistence` vive lo que vive el documento, así que una
   * navegación SPA no puede ser la única defensa si el SDK sigue autenticado.
   */
  it('una navegación SPA nunca es la única defensa cuando signOut falla', () => {
    const destinations = [...DESTINATIONS, '/', '/otra-ruta', '/panel/sub'];
    const codes = [undefined, SESSION_STATE_CODES.clientSessionNotClosed] as const;

    for (const destination of destinations) {
      for (const code of codes) {
        const plan = planPostAuthNavigation({
          destination,
          clientSessionClosed: false,
          ...(code === undefined ? {} : { code }),
        });

        expect(plan.kind, `${destination} con code=${String(code)}`).toBe('hard');
      }
    }
  });

  it('un destino no interno cae al acceso, sin convertirse en redirección abierta', () => {
    for (const destination of [
      '//atacante.example.invalid',
      'https://atacante.example.invalid',
      'panel',
      '/panel?x=1',
      '/panel#frag',
      '/panel\\x',
    ]) {
      const plan = planPostAuthNavigation({ destination, clientSessionClosed: false });

      expect(plan.url.startsWith(FALLBACK_DESTINATION)).toBe(true);
      expect(plan.url).not.toContain('atacante');
    }
  });
});

describe('la ejecución respeta el tipo de navegación', () => {
  it('usa el enrutador cuando el plan es SPA', () => {
    const spa = vi.fn();
    const hard = vi.fn();

    runNavigationPlan(
      planPostAuthNavigation({ destination: '/panel', clientSessionClosed: true }),
      {
        spa,
        hard,
      },
    );

    expect(spa).toHaveBeenCalledWith('/panel');
    expect(hard).not.toHaveBeenCalled();
  });

  it('usa la navegación completa cuando el plan es hard', () => {
    const spa = vi.fn();
    const hard = vi.fn();

    runNavigationPlan(
      planPostAuthNavigation({ destination: '/panel', clientSessionClosed: false }),
      { spa, hard },
    );

    expect(hard).toHaveBeenCalledTimes(1);
    expect(spa).not.toHaveBeenCalled();
  });
});

describe('la URL no transporta nada sensible', () => {
  const SECRETS = {
    correo: 'persona@example.invalid',
    uid: 'uid-abc123',
    token: 'eyJhbGciOiJSUzI1NiJ9.carga.firma',
    password: 'contrasena-secreta',
  };

  it('solo aparecen códigos fijos de la lista cerrada', () => {
    for (const clientSessionClosed of [true, false]) {
      for (const destination of DESTINATIONS) {
        const { url } = planPostAuthNavigation({ destination, clientSessionClosed });

        for (const secret of Object.values(SECRETS)) {
          expect(url).not.toContain(secret);
        }

        expect(url).not.toMatch(/eyJ|@|uid|token|password|contrase/i);
      }
    }
  });

  it('un código que no esté en la lista se descarta en lugar de reenviarse', () => {
    const plan = planPostAuthNavigation({
      destination: '/panel',
      clientSessionClosed: true,
      // Un valor fuera de la lista cerrada, forzado a través del tipo.
      code: SECRETS.correo as never,
    });

    expect(plan.url).toBe('/panel');
    expect(plan.url).not.toContain('@');
  });

  it('el único código admitido es el fijo de reinicio', () => {
    expect(Object.values(SESSION_STATE_CODES)).toEqual(['sesion-cliente-reiniciada']);
  });
});

describe('lectura del código desde la URL', () => {
  it('acepta el código fijo', () => {
    expect(readSessionStateCode('sesion-cliente-reiniciada')).toBe('sesion-cliente-reiniciada');
  });

  it.each([
    null,
    undefined,
    '',
    'otro-codigo',
    'persona@example.invalid',
    'eyJhbGciOiJSUzI1NiJ9',
    '<script>alert(1)</script>',
  ])('descarta %o', (value) => {
    expect(readSessionStateCode(value)).toBeNull();
  });
});

describe('el adaptador real del navegador', () => {
  /** Doble de `window.location` con **ambos** métodos, para poder afirmar cuál NO se usa. */
  function fakeLocation() {
    return { assign: vi.fn(), replace: vi.fn() };
  }

  function fakeRouter() {
    return { push: vi.fn(), replace: vi.fn() };
  }

  it('el camino hard usa location.replace, no location.assign', () => {
    const router = fakeRouter();
    const location = fakeLocation();

    runNavigationPlan(
      planPostAuthNavigation({ destination: '/panel', clientSessionClosed: false }),
      createNavigationTargets(router, location),
    );

    expect(location.replace).toHaveBeenCalledTimes(1);
    // `assign` conservaría la entrada anterior en el historial, y la BFCache podría restaurar el
    // documento —con la sesión Firebase en memoria— al pulsar Atrás.
    expect(location.assign).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('el camino spa usa el enrutador y no toca location', () => {
    const router = fakeRouter();
    const location = fakeLocation();

    runNavigationPlan(
      planPostAuthNavigation({ destination: '/panel', clientSessionClosed: true }),
      createNavigationTargets(router, location),
    );

    expect(router.push).toHaveBeenCalledWith('/panel');
    expect(location.replace).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
  });

  it('router.push nunca es el fallback de un signOut fallido', () => {
    for (const destination of ['/panel', '/verificar-correo', '/iniciar-sesion']) {
      const router = fakeRouter();
      const location = fakeLocation();

      runNavigationPlan(
        planPostAuthNavigation({ destination, clientSessionClosed: false }),
        createNavigationTargets(router, location),
      );

      expect(router.push, destination).not.toHaveBeenCalled();
      expect(router.replace, destination).not.toHaveBeenCalled();
      expect(location.assign, destination).not.toHaveBeenCalled();
      expect(location.replace, destination).toHaveBeenCalledTimes(1);
    }
  });

  it('reemplaza con la URL exacta del plan, con su código fijo', () => {
    const location = fakeLocation();
    const plan = planPostAuthNavigation({
      destination: '/iniciar-sesion',
      clientSessionClosed: false,
    });

    runNavigationPlan(plan, createNavigationTargets(fakeRouter(), location));

    expect(location.replace).toHaveBeenCalledWith(plan.url);
    expect(location.replace).toHaveBeenCalledWith(
      `/iniciar-sesion?${SESSION_STATE_PARAM}=${SESSION_STATE_CODES.clientSessionNotClosed}`,
    );
  });

  it('el tipo del adaptador no expone assign, para no poder usarlo por descuido', () => {
    const targets = createNavigationTargets(fakeRouter(), { replace: vi.fn() });

    // Basta con `replace`: si el adaptador dependiera de `assign`, esto lanzaría.
    expect(() => targets.hard('/panel')).not.toThrow();
  });
});

describe('el código fuente no vuelve a usar location.assign', () => {
  /** Quita comentarios: los documentos sí explican por qué NO se usa `assign`. */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }

  it('ningún módulo de producción llama a location.assign', () => {
    const sources = [
      'src/features/session/post-auth-navigation.ts',
      'src/features/auth/sign-in-form.tsx',
      'src/features/session/sign-out-button.tsx',
      'src/features/session/session-cleanup.tsx',
    ];

    for (const path of sources) {
      const code = stripComments(readFileSync(path, 'utf8'));

      expect(code, path).not.toMatch(/location\s*\.\s*assign/);
    }
  });

  it('el único uso de location en el código es replace', () => {
    const code = stripComments(
      readFileSync('src/features/session/post-auth-navigation.ts', 'utf8'),
    );
    const uses = [...code.matchAll(/location\s*\.\s*(\w+)/g)].map((match) => match[1]);

    expect(uses).toEqual(['replace']);
  });

  it('el formulario de acceso cablea el adaptador con window.location', () => {
    const source = readFileSync('src/features/auth/sign-in-form.tsx', 'utf8');

    expect(source).toContain('createNavigationTargets(router, window.location)');
  });
});
