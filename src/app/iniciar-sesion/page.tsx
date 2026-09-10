import type { Metadata } from 'next';

import { AuthShell } from '@/features/auth/auth-shell';
import { SignInForm } from '@/features/auth/sign-in-form';
import {
  readSessionStateCode,
  SESSION_STATE_CODES,
  SESSION_STATE_PARAM,
} from '@/features/session/post-auth-navigation';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Acceso restringido al panel administrativo de Modulartess.',
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * El único dato que esta página lee de la URL es un **código fijo** de una lista cerrada. Nunca
 * llegan aquí el correo, el UID, un token ni la contraseña, ni se leen otros parámetros.
 */
type SignInPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const NOTICES: Readonly<Record<string, string>> = {
  [SESSION_STATE_CODES.clientSessionNotClosed]:
    'Se reinició la página para descartar por completo la sesión anterior en este navegador. Vuelve a iniciar sesión.',
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const raw = params[SESSION_STATE_PARAM];
  const code = readSessionStateCode(Array.isArray(raw) ? raw[0] : raw);
  const notice = code === null ? null : NOTICES[code];

  return (
    <AuthShell
      footnote="El acceso es cerrado: las cuentas se crean fuera del panel. Este repositorio no ofrece registro, recuperación de contraseña ni proveedores externos."
      subtitle={notice ?? 'Introduce las credenciales de tu cuenta administrativa.'}
      title="Acceso al panel"
    >
      <SignInForm />
    </AuthShell>
  );
}
