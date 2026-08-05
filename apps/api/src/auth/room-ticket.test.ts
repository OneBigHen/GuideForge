import { describe, expect, it } from 'vitest';
import { RoomTicketService } from './room-ticket.js';

const secret = 'test-secret';
const svc = new RoomTicketService(secret, 60);

function claims(over = {}) {
  return {
    ticketId: '11111111-1111-4111-8111-111111111111',
    guideId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
    role: 'author',
    permission: 'collaborate' as const,
    ...over,
  };
}

describe('room ticket service', () => {
  it('issues and verifies a valid ticket', () => {
    const token = svc.issue(claims());
    const res = svc.verify(token);
    expect(res.ok).toBe(true);
    expect(res.claims?.guideId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('rejects an expired ticket', () => {
    const token = svc.issue(claims());
    // Verify as if 120s have passed (ttl is 60s).
    const future = Math.floor(Date.now() / 1000) + 120;
    const res = svc.verify(token, future);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('expired');
  });

  it('rejects tampered payload (signature mismatch)', () => {
    const token = svc.issue(claims());
    const [body, sig] = token.split('.');
    const tampered = JSON.parse(body!) as Record<string, unknown>;
    tampered.guideId = '99999999-9999-4999-8999-999999999999';
    const bad = `${JSON.stringify(tampered)}.${sig}`;
    const res = svc.verify(bad);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('bad signature');
  });

  it('rejects a ticket signed with a different secret', () => {
    const other = new RoomTicketService('different-secret', 60);
    const token = other.issue(claims());
    const res = svc.verify(token);
    expect(res.ok).toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(svc.verify('garbage').ok).toBe(false);
    expect(svc.verify('').ok).toBe(false);
  });
});
