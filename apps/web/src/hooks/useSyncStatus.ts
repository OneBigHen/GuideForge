import { useEffect, useState } from 'react';

export type SyncState = 'local-only' | 'syncing' | 'synced' | 'offline';

export interface SyncStatus {
  localSaved: boolean;
  network: SyncState;
}

/**
 * Separate local-save from network-sync indicators.
 *
 * Phase 02/03: the app is local-first. Local saves are synchronous with the
 * command bus; network sync is absent until the Phase 05 control plane, so it
 * reports 'local-only' (never a fake "synced").
 */
export function useSyncStatus(activeEdit: boolean): SyncStatus {
  const [localSaved, setLocalSaved] = useState(true);
  const [network] = useState<SyncState>('local-only');

  useEffect(() => {
    if (!activeEdit) return;
    const t = window.setTimeout(() => setLocalSaved(true), 350);
    return () => window.clearTimeout(t);
  }, [activeEdit]);

  return { localSaved, network };
}
