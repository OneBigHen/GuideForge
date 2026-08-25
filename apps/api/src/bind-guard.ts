const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Without a configured owner, `/api/session` treats whichever identity asks
 * first as the single owner (see index.ts) — a reasonable zero-config
 * convenience ONLY when the only thing that can reach the port is another
 * process on the same machine. Binding to any non-loopback host without an
 * explicit `ownerId` would let an arbitrary network caller mint themselves
 * the organization-owner role, so refuse to boot in that combination instead
 * of silently exposing it.
 */
export function assertSafeBindConfig(host: string, ownerId: string | undefined): void {
  if (!LOOPBACK_HOSTS.has(host) && !ownerId) {
    throw new Error(
      `refusing to bind ${host} without GUIDEFORGE_OWNER_ID set: binding beyond loopback ` +
        'requires an explicit owner identity, or any network caller could mint themselves ' +
        'the organization-owner role. Set the GUIDEFORGE_OWNER_ID environment variable.',
    );
  }
}
