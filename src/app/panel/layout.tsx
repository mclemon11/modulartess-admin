import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { inboxBadge } from '@/features/inbox/inbox-badge';
import { PanelShell } from '@/features/panel/panel-shell';
import { resolvePanelSession } from '@/features/panel/session-context';
import { SessionCleanup } from '@/features/session/session-cleanup';

import { PanelUnavailable } from './panel-unavailable';

export const metadata: Metadata = {
  title: 'Panel',
  robots: { index: false, follow: false },
};

/** Cada visita lee la cookie y verifica contra el backend: nunca puede prerrenderizarse. */
export const dynamic = 'force-dynamic';

/**
 * Frontera de todas las pantallas del panel.
 *
 * Verifica la sesión una vez por navegación y monta el shell alrededor de la página. Las páginas
 * no repiten la verificación: sus propias llamadas al backend viajan con la misma sesión y el
 * backend las rechaza si ya no vale, así que la autoridad sigue estando donde debe.
 */
export default async function PanelLayout({ children }: { readonly children: ReactNode }) {
  const result = await resolvePanelSession();

  if (result.kind === 'invalid') {
    return <SessionCleanup />;
  }

  if (result.kind === 'unavailable') {
    return <PanelUnavailable />;
  }

  const badges = await inboxBadge(result.session.role, result.session.sessionMaterial);

  return (
    <PanelShell badges={badges} role={result.session.role}>
      {children}
    </PanelShell>
  );
}
