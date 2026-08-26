const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * `/api/session` grants the organization-owner role only to the configured
 * owner identity PROVEN via `GUIDEFORGE_OWNER_PASSWORD` (see index.ts).
 *
 * Binding beyond loopback therefore requires BOTH:
 *  - an explicit `ownerId` (identifier), and
 *  - an explicit `ownerPassword` (credential).
 *
 * Without a credential, anyone who learns or guesses the owner UUID — it is
 * an identifier, not a secret — could mint themselves owner on a public
 * deployment, so refuse to boot in that combination instead of silently
 * exposing it.
 */
export function assertSafeBindConfig(
  host: string,
  ownerId: string | undefined,
  ownerPassword: string | undefined,
): void {
  if (!LOOPBACK_HOSTS.has(host) && (!ownerId || !ownerPassword)) {
    const missing = [
      ...(!ownerId ? ['GUIDEFORGE_OWNER_ID'] : []),
      ...(!ownerPassword ? ['GUIDEFORGE_OWNER_PASSWORD'] : []),
    ].join(' and ');
    throw new Error(
      `refusing to bind ${host} without ${missing} set: binding beyond loopback requires ` +
        'an explicit owner identity AND its credential, or any network caller who knows the ' +
        'owner id could mint themselves the organization-owner role.',
    );
  }
}
