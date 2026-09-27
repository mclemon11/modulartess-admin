'use client';

import { useId, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import styles from '@/features/panel/catalog.module.css';
import type { MutationResult } from '@/features/panel/catalog-client';
import {
  createKeyLedger,
  keyFor,
  releaseKey,
  type KeyLedger,
} from '@/features/panel/operation-key';
import type { AdminRole } from '@/features/session/permissions';
import type { AdminUser } from '@/lib/api/admin-users';

import {
  describeInvitation,
  describeUserStatus,
  formatAccountDate,
  ROLE_EXPLANATIONS,
} from './user-labels';
import { accountActions, assignableRoles } from './user-permissions';
import { changeUserRole, createUser, transitionUser } from './users-client';
import { describeUserFailure, keepsKey, offersReload } from './users-errors';
import users from './users.module.css';

/** Una fila del listado. `isSelf` lo decide el servidor; el UID de la sesión no llega aquí. */
export type UserRow = AdminUser & { readonly isSelf: boolean };

type PendingAction =
  | { readonly kind: 'disable' | 'reactivate' | 'resend-invitation'; readonly user: UserRow }
  | { readonly kind: 'change-role'; readonly user: UserRow };

const STATUS_CLASS: Readonly<Record<AdminUser['status'], string | undefined>> = {
  invited: users.statusInvited,
  active: users.statusActive,
  disabled: users.statusDisabled,
};

/**
 * Pantalla de cuentas: invitar, cambiar el rol, deshabilitar, reactivar y reenviar.
 *
 * Todo pasa por el BFF, que valida `Origin`, lee la cookie `__Host-` y llama al backend. Aquí no
 * hay ninguna contraseña: la persona invitada establece la suya con el enlace que le llega por
 * correo, y ese enlace nunca pasa por el panel.
 *
 * La exclusión es un candado **síncrono** (`useRef`) tomado antes del primer `await`: un doble
 * clic no lanza dos operaciones. `busy` solo pinta. La clave de idempotencia se conserva mientras
 * la operación no tenga desenlace, así que reintentar tras un corte de red —o tras
 * `account_sync_pending`— repite la misma operación en el backend.
 */
export function UsersManager({
  initial,
  viewerRole,
}: {
  readonly initial: readonly UserRow[];
  readonly viewerRole: string;
}) {
  const router = useRouter();
  const id = useId();
  const running = useRef(false);
  const ledger = useRef<KeyLedger>(createKeyLedger());
  const dialog = useRef<HTMLDialogElement | null>(null);

  const [items, setItems] = useState<readonly UserRow[]>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [reload, setReload] = useState(false);

  const roles = assignableRoles(viewerRole);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<AdminRole | null>(
    roles.length === 1 ? (roles[0] ?? null) : null,
  );

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [nextRole, setNextRole] = useState<AdminRole | null>(null);

  /**
   * Ejecuta una operación con el candado tomado. Devuelve `null` si ya había otra en curso.
   */
  async function exclusive<T>(work: () => Promise<T>): Promise<T | null> {
    if (running.current) return null;

    running.current = true;
    setBusy(true);
    setFailure(null);
    setNotice(null);
    setReload(false);

    try {
      return await work();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  /** Desenlace común: libera o conserva la clave, traduce el fallo y refresca si procede. */
  function settle(
    scope: string,
    result: MutationResult<AdminUser>,
  ): result is {
    readonly ok: true;
    readonly data: AdminUser;
  } {
    if (result.ok) {
      releaseKey(ledger.current, scope);
      return true;
    }

    // Un fallo transitorio conserva la clave: reintentar es la misma operación, no otra.
    if (!keepsKey(result.code)) releaseKey(ledger.current, scope);
    setFailure(describeUserFailure(result.code, result.reference));
    if (offersReload(result.code)) {
      setReload(true);
      router.refresh();
    }

    return false;
  }

  function replace(updated: AdminUser) {
    setItems((current) =>
      current.map((item) => (item.id === updated.id ? { ...updated, isSelf: item.isSelf } : item)),
    );
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (role === null) {
      setFailure('Elige el rol de la cuenta.');
      return;
    }

    const body = { email: email.trim(), displayName: displayName.trim(), role };
    const fingerprint = `create|${encodeURIComponent(body.email.toLowerCase())}|${encodeURIComponent(body.displayName)}|${role}`;

    const result = await exclusive(() =>
      createUser({
        ...body,
        idempotencyKey: keyFor(ledger.current, 'create', fingerprint, () => crypto.randomUUID()),
      }),
    );

    if (result === null || !settle('create', result)) return;

    setItems((current) => [{ ...result.data, isSelf: false }, ...current]);
    setEmail('');
    setDisplayName('');
    setRole(roles.length === 1 ? (roles[0] ?? null) : null);
    setNotice(createdNotice(result.data));
    router.refresh();
  }

  function open(action: PendingAction) {
    setPending(action);
    setNextRole(null);
    dialog.current?.showModal();
  }

  async function confirm() {
    if (pending === null) return;

    const { user } = pending;
    const scope = `${pending.kind}|${user.id}`;

    if (pending.kind === 'change-role' && nextRole === null) {
      setFailure('Elige el nuevo rol.');
      return;
    }

    const result = await exclusive(() => {
      if (pending.kind === 'change-role') {
        const target = nextRole as AdminRole;
        const fingerprint = `${scope}|v=${user.version}|${target}`;

        return changeUserRole(user.id, {
          idempotencyKey: keyFor(ledger.current, scope, fingerprint, () => crypto.randomUUID()),
          expectedVersion: user.version,
          role: target,
        });
      }

      const fingerprint = `${scope}|v=${user.version}`;

      return transitionUser(user.id, pending.kind, {
        idempotencyKey: keyFor(ledger.current, scope, fingerprint, () => crypto.randomUUID()),
        expectedVersion: user.version,
      });
    });

    if (result === null) return;

    dialog.current?.close();
    setPending(null);

    if (!settle(scope, result)) return;

    replace(result.data);
    setNotice(actionNotice(pending.kind, result.data));
    router.refresh();
  }

  return (
    <div className={styles.stack}>
      <div aria-live="polite">
        {notice === null ? null : <p className={styles.notice}>{notice}</p>}
      </div>
      <div aria-live="assertive">
        {failure === null ? null : (
          <p className={styles.error} role="alert">
            {failure}{' '}
            {reload ? (
              <button
                className={styles.buttonSecondary}
                onClick={() => router.refresh()}
                type="button"
              >
                Recargar datos
              </button>
            ) : null}
          </p>
        )}
      </div>

      {roles.length > 0 ? (
        <section aria-labelledby={`${id}-create-title`} className={styles.card}>
          <div className={styles.cardPad}>
            <h2 className={styles.sectionTitle} id={`${id}-create-title`}>
              Invitar usuario
            </h2>
            <p className={styles.hint}>
              La persona recibe un correo para establecer su propia contraseña. Nadie más la ve ni
              la conoce, y hasta que la establece la cuenta no puede entrar.
            </p>
            <form noValidate onSubmit={(event) => void handleCreate(event)}>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>Nombre</span>
                  <input
                    autoComplete="off"
                    className={styles.input}
                    disabled={busy}
                    maxLength={80}
                    onChange={(event) => setDisplayName(event.target.value)}
                    required
                    type="text"
                    value={displayName}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Correo</span>
                  <input
                    autoComplete="off"
                    className={styles.input}
                    disabled={busy}
                    maxLength={254}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                </label>
              </div>
              <fieldset className={users.roleOptions} disabled={busy}>
                <legend className={styles.label}>Rol</legend>
                {roles.map((option) => (
                  <label className={users.roleOption} key={option}>
                    <input
                      checked={role === option}
                      name={`${id}-role`}
                      onChange={() => setRole(option)}
                      type="radio"
                      value={option}
                    />
                    <span>
                      <strong>{ROLE_EXPLANATIONS[option].name}</strong>
                      <span className={users.detail}>{ROLE_EXPLANATIONS[option].summary}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button className={styles.buttonPrimary} disabled={busy} type="submit">
                {busy ? 'Enviando invitación…' : 'Crear usuario y enviar invitación'}
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <section aria-label="Cuentas administrativas" className={styles.card}>
        {items.length === 0 ? (
          <div className={styles.cardPad}>
            <p className={styles.hint}>Todavía no hay cuentas que puedas ver.</p>
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Creación</th>
                  <th scope="col">Último acceso</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((user) => (
                  <UserTableRow
                    busy={busy}
                    key={user.id}
                    onAction={open}
                    user={user}
                    viewerRole={viewerRole}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <dialog
        aria-describedby={`${id}-confirm-text`}
        aria-labelledby={`${id}-confirm-title`}
        className={styles.previewDialog}
        onClose={() => setPending(null)}
        ref={dialog}
      >
        {pending === null ? null : (
          <div className={styles.previewDialogBody}>
            <h2 className={styles.sectionTitle} id={`${id}-confirm-title`}>
              {confirmTitle(pending)}
            </h2>
            <p className={styles.pageLead} id={`${id}-confirm-text`}>
              {confirmText(pending)}
            </p>
            {pending.kind === 'change-role' ? (
              <fieldset className={users.roleOptions} disabled={busy}>
                <legend className={styles.label}>Nuevo rol</legend>
                {roles
                  .filter((option) => option !== pending.user.role)
                  .map((option) => (
                    <label className={users.roleOption} key={option}>
                      <input
                        checked={nextRole === option}
                        name={`${id}-next-role`}
                        onChange={() => setNextRole(option)}
                        type="radio"
                        value={option}
                      />
                      <span>
                        <strong>{ROLE_EXPLANATIONS[option].name}</strong>
                        <span className={users.detail}>{ROLE_EXPLANATIONS[option].summary}</span>
                      </span>
                    </label>
                  ))}
              </fieldset>
            ) : null}
            <div className={styles.actions}>
              <button
                className={pending.kind === 'disable' ? styles.buttonDanger : styles.buttonPrimary}
                disabled={busy || (pending.kind === 'change-role' && nextRole === null)}
                onClick={() => void confirm()}
                type="button"
              >
                {busy ? 'Aplicando…' : confirmLabel(pending)}
              </button>
              <button
                autoFocus
                className={styles.buttonSecondary}
                disabled={busy}
                onClick={() => dialog.current?.close()}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

function UserTableRow({
  busy,
  onAction,
  user,
  viewerRole,
}: {
  readonly busy: boolean;
  readonly onAction: (action: PendingAction) => void;
  readonly user: UserRow;
  readonly viewerRole: string;
}) {
  const actions = accountActions(viewerRole, user, user.isSelf);

  return (
    <tr>
      <td>
        {user.displayName || '—'}
        {user.isSelf ? <span className={users.detail}>Tu cuenta</span> : null}
      </td>
      <td className={users.email}>{user.email || '—'}</td>
      <td>{ROLE_EXPLANATIONS[user.role].name}</td>
      <td>
        <span className={STATUS_CLASS[user.status]}>{describeUserStatus(user.status)}</span>
        {user.status === 'invited' ? (
          <span className={users.detail}>{describeInvitation(user.invitation)}</span>
        ) : null}
        {user.identitySync === 'pending' ? (
          <span className={users.detail}>Cambio pendiente de aplicar: repite la acción.</span>
        ) : null}
      </td>
      <td>{formatAccountDate(user.createdAt)}</td>
      <td>{formatAccountDate(user.lastSessionAt)}</td>
      <td className={styles.actionCell}>
        <div className={users.rowActions}>
          {actions.resendInvitation ? (
            <button
              className={styles.rowAction}
              disabled={busy}
              onClick={() => onAction({ kind: 'resend-invitation', user })}
              type="button"
            >
              Reenviar invitación
            </button>
          ) : null}
          {actions.changeRole ? (
            <button
              className={styles.rowAction}
              disabled={busy}
              onClick={() => onAction({ kind: 'change-role', user })}
              type="button"
            >
              Cambiar rol
            </button>
          ) : null}
          {actions.disable ? (
            <button
              className={styles.rowAction}
              disabled={busy}
              onClick={() => onAction({ kind: 'disable', user })}
              type="button"
            >
              Deshabilitar
            </button>
          ) : null}
          {actions.reactivate ? (
            <button
              className={styles.rowAction}
              disabled={busy}
              onClick={() => onAction({ kind: 'reactivate', user })}
              type="button"
            >
              Reactivar
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function who(user: AdminUser): string {
  return user.displayName || user.email;
}

function confirmTitle(action: PendingAction): string {
  switch (action.kind) {
    case 'disable':
      return `¿Deshabilitar a ${who(action.user)}?`;
    case 'reactivate':
      return `¿Reactivar a ${who(action.user)}?`;
    case 'resend-invitation':
      return `¿Reenviar la invitación a ${who(action.user)}?`;
    case 'change-role':
      return `Cambiar el rol de ${who(action.user)}`;
  }
}

function confirmText(action: PendingAction): string {
  switch (action.kind) {
    case 'disable':
      return 'Perderá el acceso de inmediato y se cerrarán sus sesiones abiertas. No se borra nada: puedes reactivarla cuando quieras.';
    case 'reactivate':
      return 'Podrá volver a entrar con su contraseña. Si nunca completó la invitación, vuelve a quedar pendiente de hacerlo.';
    case 'resend-invitation':
      return `Se enviará un correo nuevo a ${action.user.email} para establecer la contraseña. El enlace anterior deja de ser el más reciente.`;
    case 'change-role':
      return `Rol actual: ${ROLE_EXPLANATIONS[action.user.role].name}. Al cambiarlo se cierran sus sesiones y tendrá que volver a iniciar sesión.`;
  }
}

function confirmLabel(action: PendingAction): string {
  switch (action.kind) {
    case 'disable':
      return 'Deshabilitar';
    case 'reactivate':
      return 'Reactivar';
    case 'resend-invitation':
      return 'Reenviar invitación';
    case 'change-role':
      return 'Cambiar rol';
  }
}

function createdNotice(user: AdminUser): string {
  switch (user.invitation.state) {
    case 'sent':
      return `Cuenta creada. Invitación enviada a ${user.email}.`;
    case 'failed':
      return `Cuenta creada, pero la invitación no se pudo enviar. Usa «Reenviar invitación».`;
    case 'suppressed':
      return 'Cuenta creada. Este despliegue no permite enviar el correo de invitación a esa dirección.';
    case 'pending':
      return 'Cuenta creada. La invitación todavía no se ha enviado: usa «Reenviar invitación».';
  }
}

function actionNotice(kind: PendingAction['kind'], user: AdminUser): string {
  switch (kind) {
    case 'disable':
      return `${who(user)} está deshabilitada y sus sesiones se cerraron.`;
    case 'reactivate':
      return `${who(user)} está reactivada.`;
    case 'resend-invitation':
      return user.invitation.state === 'sent'
        ? `Invitación reenviada a ${user.email}.`
        : describeInvitation(user.invitation);
    case 'change-role':
      return `${who(user)} ahora es ${ROLE_EXPLANATIONS[user.role].name}. Tendrá que volver a iniciar sesión.`;
  }
}
