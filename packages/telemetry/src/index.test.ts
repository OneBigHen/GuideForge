import { describe, expect, it } from 'vitest';
import { Telemetry } from './index.js';

describe('telemetry privacy', () => {
  it('does not emit when disabled', () => {
    const events: unknown[] = [];
    const t = new Telemetry({ enabled: false, sink: (b) => events.push(...b) });
    t.route('/edit/123e4567-e89b-42d3-a456-426614174000');
    t.flush();
    expect(events).toHaveLength(0);
  });

  it('sanitizes guide ids out of routes', () => {
    const events: unknown[] = [];
    const t = new Telemetry({ enabled: true, sink: (b) => events.push(...b) });
    t.route('/edit/123e4567-e89b-42d3-a456-426614174000');
    t.flush();
    expect(events[0]).toMatchObject({ type: 'route', route: '/edit/:id' });
  });

  it('rejects unknown perf names and non-code errors', () => {
    const events: unknown[] = [];
    const t = new Telemetry({ enabled: true, sink: (b) => events.push(...b) });
    t.perf('secret-guide-title', 5);
    t.error('stack: at File (secret.ts:1:1)');
    t.flush();
    expect(events[0]).toMatchObject({ type: 'perf', name: 'other' });
    expect(events[1]).toMatchObject({ type: 'error', code: 'UNKNOWN' });
  });

  it('batches and flushes at max size', () => {
    const batches: number[] = [];
    const t = new Telemetry({
      enabled: true,
      maxBatchSize: 2,
      sink: (b) => batches.push(b.length),
    });
    t.route('/a');
    t.route('/b');
    expect(batches).toEqual([2]);
  });
});
