/**
 * Privacy-reviewed browser telemetry wiring for apps/web.
 *
 * Opt-in (off by default), emits only non-identifying events (route, perf,
 * error codes, capability hash). Never includes document content, titles,
 * guide ids, or user identifiers.
 */
import { Telemetry } from '@guideforge/telemetry';

const telemetry = new Telemetry({
  enabled: import.meta.env.VITE_TELEMETRY_ENABLED === 'true',
  // Consent-gated sink: wire to a server endpoint behind explicit consent.
  sink: () => {
    /* no-op until consent is granted and a privacy-reviewed endpoint exists */
  },
});

export function trackRoute(route: string): void {
  telemetry.route(route);
}

export function trackPerf(name: string, valueMs: number): void {
  telemetry.perf(name, valueMs);
}

export function trackError(code: string): void {
  telemetry.error(code);
}

export function isTelemetryEnabled(): boolean {
  return telemetry.enabled;
}
