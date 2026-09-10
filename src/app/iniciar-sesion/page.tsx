import type { Metadata } from 'next';

import { AuthShell } from '@/features/auth/auth-shell';
import { SignInForm } from '@/features/auth/sign-in-form';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Acceso restringido al panel administrativo de Modulartess.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignInPage() {
  return (
    <AuthShell
      footnote="El acceso es cerrado: las cuentas se crean fuera del panel. Este repositorio no ofrece registro, recuperación de contraseña ni proveedores externos."
      subtitle="Introduce las credenciales de tu cuenta administrativa."
      title="Acceso al panel"
    >
      <SignInForm />
    </AuthShell>
  );
}
