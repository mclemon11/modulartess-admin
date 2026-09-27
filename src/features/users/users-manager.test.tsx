import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const { UsersManager } = await import('./users-manager');

/**
 * Pantalla de cuentas, renderizada en el servidor de pruebas y leída como fuente.
 */
const base = {
  email: 'persona@example.invalid',
  displayName: 'Persona',
  version: 3,
  createdAt: '2026-09-27T12:00:00.000Z',
  activatedAt: null,
  lastSessionAt: null,
  invitation: { state: 'sent', sendCount: 1, lastAttemptAt: '2026-09-27T12:00:00.000Z' },
  identitySync: 'synced',
} as const;

const rows = [
  { ...base, id: 'adm_self', role: 'super_admin', status: 'active', isSelf: true },
  { ...base, id: 'adm_mod', role: 'moderator', status: 'invited', isSelf: false },
  { ...base, id: 'adm_master', role: 'master_admin', status: 'disabled', isSelf: false },
] as const;

const SOURCE = readFileSync('src/features/users/users-manager.tsx', 'utf8');

describe('pantalla de cuentas', () => {
  it('muestra nombre, correo, rol, estado, creación y último acceso', () => {
    const html = renderToStaticMarkup(<UsersManager initial={rows} viewerRole="super_admin" />);

    for (const heading of ['Nombre', 'Correo', 'Rol', 'Estado', 'Creación', 'Último acceso']) {
      expect(html, heading).toContain(`>${heading}<`);
    }
    for (const status of ['Invitación pendiente', 'Activo', 'Deshabilitado']) {
      expect(html, status).toContain(status);
    }
  });

  it('super_admin puede invitar a los tres roles, con su explicación', () => {
    const html = renderToStaticMarkup(<UsersManager initial={rows} viewerRole="super_admin" />);

    expect(html).toContain('Invitar usuario');
    for (const role of ['Super administrador', 'Administrador general', 'Moderador']) {
      expect(html).toContain(role);
    }
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
  });

  it('master_admin solo puede invitar moderator', () => {
    const html = renderToStaticMarkup(<UsersManager initial={rows} viewerRole="master_admin" />);

    expect((html.match(/type="radio"/g) ?? []).length).toBe(1);
    expect(html).toContain('value="moderator"');
    expect(html).not.toContain('value="master_admin"');
  });

  it('moderator no ve el formulario de invitación ni acciones', () => {
    const html = renderToStaticMarkup(<UsersManager initial={rows} viewerRole="moderator" />);

    expect(html).not.toContain('Invitar usuario');
    for (const action of ['Deshabilitar<', 'Reactivar<', 'Reenviar invitación<', 'Cambiar rol<']) {
      expect(html).not.toContain(action);
    }
  });

  it('nunca pide ni muestra una contraseña', () => {
    const html = renderToStaticMarkup(<UsersManager initial={rows} viewerRole="super_admin" />);

    expect(html).not.toContain('type="password"');
    expect(SOURCE).not.toMatch(/contraseña temporal|type="password"/);
  });

  it('la fila propia no ofrece acciones', () => {
    const html = renderToStaticMarkup(
      <UsersManager initial={[rows[0]]} viewerRole="super_admin" />,
    );

    expect(html).toContain('Tu cuenta');
    expect(html).not.toContain('Deshabilitar<');
    expect(html).not.toContain('Cambiar rol<');
  });

  it('ofrece reenviar la invitación pendiente y reactivar la deshabilitada', () => {
    const html = renderToStaticMarkup(<UsersManager initial={rows} viewerRole="super_admin" />);

    expect(html).toContain('Reenviar invitación<');
    expect(html).toContain('Reactivar<');
  });

  it('el candado es síncrono y se toma antes del primer await', () => {
    const body = SOURCE.slice(SOURCE.indexOf('async function exclusive'));
    const check = body.indexOf('if (running.current) return null;');
    const take = body.indexOf('running.current = true;');
    const firstAwait = body.indexOf('await ');

    expect(check).toBeGreaterThan(-1);
    expect(take).toBeGreaterThan(check);
    expect(firstAwait).toBeGreaterThan(take);
  });

  it('cada mutación manda expectedVersion y una clave de idempotencia', () => {
    expect(SOURCE).toContain('expectedVersion: user.version');
    expect((SOURCE.match(/idempotencyKey: keyFor\(/g) ?? []).length).toBe(3);
  });

  it('confirma antes de deshabilitar, reactivar, reenviar o cambiar el rol', () => {
    expect(SOURCE).toContain('dialog.current?.showModal()');
    expect(SOURCE).toContain('¿Deshabilitar a');
    expect(SOURCE).toContain('¿Reactivar a');
    expect(SOURCE).toContain('¿Reenviar la invitación a');
  });

  it('refresca los datos tras cada cambio', () => {
    expect((SOURCE.match(/router\.refresh\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('no llama al backend ni a Firebase: solo al BFF', () => {
    const client = readFileSync('src/features/users/users-client.ts', 'utf8');

    expect(client).toContain("'/api/admin/users'");
    expect(client + SOURCE).not.toMatch(/firebase|run\.app|\/v1\/admin/);
  });
});
