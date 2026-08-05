/**
 * Short-lived collaboration room tickets.
 *
 * The API issues a signed ticket after authorization; the collab (Hocuspocus)
 * service validates the signature + expiry WITHOUT a database round-trip.
 * Tickets are single-use by default and expire quickly.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface RoomTicketClaims {
  ticketId: string;
  guideId: string;
  workspaceId: string;
  userId: string;
  role: string;
  /** Permission granted by the ticket. */
  permission: 'collaborate';
  /** Unix seconds. */
  exp: number;
  /** Single-use nonce (random). */
  nonce: string;
}

export interface TicketVerification {
  ok: boolean;
  claims?: RoomTicketClaims;
  reason?: string;
}

export class RoomTicketService {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds = 300,
  ) {}

  issue(claims: Omit<RoomTicketClaims, 'exp' | 'nonce'>): string {
    const full: RoomTicketClaims = {
      ...claims,
      exp: Math.floor(Date.now() / 1000) + this.ttlSeconds,
      nonce: cryptoRandom(24),
    };
    const body = JSON.stringify(full);
    const sig = this.sign(body);
    return `${body}.${sig}`;
  }

  verify(token: string, nowSeconds = Math.floor(Date.now() / 1000)): TicketVerification {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return { ok: false, reason: 'malformed' };
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = this.sign(body);
    if (!safeEqual(sig, expected)) return { ok: false, reason: 'bad signature' };
    let claims: RoomTicketClaims;
    try {
      claims = JSON.parse(body) as RoomTicketClaims;
    } catch {
      return { ok: false, reason: 'unparseable' };
    }
    if (typeof claims.exp !== 'number' || claims.exp < nowSeconds) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, claims };
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function cryptoRandom(bytes: number): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url');
}
