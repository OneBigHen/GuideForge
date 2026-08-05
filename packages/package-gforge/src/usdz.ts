/**
 * Apple USDZ derivative (Quick Look) packaging.
 *
 * A `.usdz` is a ZIP of USD/USDC files. Full GLB→USDZ conversion is a
 * worker-media job; this module provides:
 *  - `usdzContainerFromUsdc`: wraps pre-generated .usdc payloads into a
 *    valid USDZ container (deterministic),
 *  - `quickLookModelLink`: builds the `rel="ar"` link for Apple Quick Look
 *    with a scene-preview poster image.
 *
 * The derivative itself is generated outside the browser (worker-media) for
 * large assets; the container wrapper is deterministic and testable here.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';

export const USDZ_MIME = 'model/vnd.usdz+zip';
export const FIXED_MTIME = new Date('2026-01-01T00:00:00Z');

export interface UsdzInput {
  /** e.g. { 'model.usdc': bytes, 'textures/a.png': bytes } */
  files: Map<string, Uint8Array>;
  /** Optional Quick Look poster (PNG/JPEG bytes). */
  poster?: Uint8Array;
}

export function buildUsdzContainer(input: UsdzInput): Uint8Array {
  const zipData: Zippable = {};
  for (const [name, data] of input.files) {
    if (name.includes('..') || name.startsWith('/')) {
      throw new Error(`unsafe usdz entry: ${name}`);
    }
    zipData[name] = [data, { mtime: FIXED_MTIME, level: 0 }];
  }
  if (input.poster) {
    zipData['poster.png'] = [input.poster, { mtime: FIXED_MTIME, level: 0 }];
  }
  return zipSync(zipData, { level: 0 });
}

export interface QuickLookLink {
  href: string;
  rel: string;
  type: string;
  poster?: string;
}

/** Build an Apple Quick Look model link (rel="ar"). */
export function quickLookModelLink(opts: { usdzUrl: string; posterUrl?: string }): QuickLookLink {
  return {
    href: opts.usdzUrl,
    rel: 'ar',
    type: USDZ_MIME,
    ...(opts.posterUrl ? { poster: opts.posterUrl } : {}),
  };
}

export { strToU8 };
