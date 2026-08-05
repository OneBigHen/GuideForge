/**
 * @guideforge/telemetry — narrow, privacy-reviewed observability.
 *
 * Browser layer emits ONLY non-identifying, non-content events:
 *   - route navigation,
 *   - performance marks (time to interactive, scene frame rate buckets),
 *   - error codes (no stack traces, no document content),
 *   - capability profile hashes (no raw UA strings).
 *
 * Document content, guide titles, user identifiers, and IPs are NEVER part
 * of an event. Events are opt-in (enabled flag) and buffered for a consent
 * hook. Framework-independent.
 */

export type TelemetryEvent =
  | { type: 'route'; route: string; t: number }
  | { type: 'perf'; name: string; valueMs: number; t: number }
  | { type: 'error'; code: string; t: number }
  | { type: 'capability'; profileHash: string; t: number };

export interface TelemetryConfig {
  enabled: boolean;
  /** Called with a batch; default no-op (override to send to a consent-gated endpoint). */
  sink?: (events: TelemetryEvent[]) => void;
  maxBatchSize?: number;
}

const DEFAULT_MAX = 25;

export class Telemetry {
  private readonly config: TelemetryConfig;
  private buffer: TelemetryEvent[] = [];

  constructor(config: TelemetryConfig) {
    this.config = { maxBatchSize: DEFAULT_MAX, ...config };
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  route(route: string): void {
    this.push({ type: 'route', route: sanitizeRoute(route), t: Date.now() });
  }

  perf(name: string, valueMs: number): void {
    this.push({ type: 'perf', name: sanitizeName(name), valueMs, t: Date.now() });
  }

  error(code: string): void {
    this.push({ type: 'error', code: sanitizeCode(code), t: Date.now() });
  }

  capability(profileHash: string): void {
    this.push({ type: 'capability', profileHash, t: Date.now() });
  }

  flush(): void {
    if (!this.config.enabled || this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    this.config.sink?.(batch);
  }

  private push(event: TelemetryEvent): void {
    if (!this.config.enabled) return;
    this.buffer.push(event);
    if (this.buffer.length >= (this.config.maxBatchSize ?? DEFAULT_MAX)) this.flush();
  }
}

function sanitizeRoute(route: string): string {
  // Strip dynamic id segments so guide ids never leak.
  return route.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
}

function sanitizeName(name: string): string {
  // Allow only a fixed set of perf marks.
  const allowed = new Set(['ttfb', 'interactive', 'scene-frame', 'library-open', 'export-draft']);
  return allowed.has(name) ? name : 'other';
}

function sanitizeCode(code: string): string {
  // Allow only short uppercase codes.
  return /^[A-Z0-9_-]{1,24}$/.test(code) ? code : 'UNKNOWN';
}
