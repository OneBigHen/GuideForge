/**
 * @guideforge/assets — asset domain: metadata, license policy, local search,
 * and deterministic procedural scientific equipment templates.
 *
 * Framework-independent: no React, Three.js, browser APIs, databases, or
 * provider SDKs (enforced by `boundary`). GLB bytes for procedural templates
 * are generated here deterministically (no Three.js runtime dependency).
 */
import type { ContentHash, EntityId } from '@guideforge/domain';

// ---------------------------------------------------------------------------
// Asset metadata
// ---------------------------------------------------------------------------

export type AssetReviewState =
  | 'proxy'
  | 'generated-draft'
  | 'visually-reviewed'
  | 'dimension-checked'
  | 'controls-mapped'
  | 'source-cad'
  | 'manufacturer-verified';

export interface AssetOrigin {
  /** 'import' | 'provider' | 'procedural' | 'photo-to-3d' | 'user' */
  kind: 'import' | 'provider' | 'procedural' | 'photo-to-3d' | 'user';
  provider?: string;
  /** Provider record id / original URL. */
  record?: string;
  creator?: string;
  attribution?: string;
  licenseId?: string;
  licenseText?: string;
  /** Territorial / model restrictions (e.g. Hunyuan). */
  restrictions?: string[];
}

export interface GeometryHealth {
  triangleCount: number;
  vertexCount: number;
  materialCount: number;
  textureCount: number;
  nonManifoldEdges: number;
  /** Estimated bounding box in meters. */
  boundsMeters: { x: number; y: number; z: number } | null;
  issues: string[];
}

export interface AssetMetadata {
  assetId: EntityId;
  /** SHA-256 of the canonical GLB bytes. */
  contentHash: ContentHash;
  /** Derivative hashes (LODs, previews, turntable). */
  derivativeHashes: { kind: 'lod1' | 'lod2' | 'preview' | 'turntable'; hash: ContentHash }[];
  name: string;
  aliases: string[];
  tags: string[];
  format: 'glb' | 'gltf' | 'obj' | 'stl' | 'step';
  /** Original + converted mime types. */
  mimeTypes: string[];
  sizeBytes: number;
  dimensionsMeters: { x: number; y: number; z: number } | null;
  origin: AssetOrigin;
  reviewState: AssetReviewState;
  geometryHealth: GeometryHealth | null;
  semanticAliases: string[];
  semanticAnchors: { anchorId: string; label: string }[];
  usedByProjectIds: string[];
  createdAtIso: string;
  updatedAtIso: string;
}

// ---------------------------------------------------------------------------
// License policy (deterministic; the model can summarize, never authorize)
// ---------------------------------------------------------------------------

export interface LicenseDecision {
  allowSearch: boolean;
  allowDownload: boolean;
  allowModification: boolean;
  allowPackageEmbedding: boolean;
  allowPublicRedistribution: boolean;
  requiresAttribution: boolean;
  shareAlike: boolean;
  /** Reasons for any block. */
  blocks: string[];
}

/**
 * Deterministic license policy for asset use. Handles common SPDX licenses;
 * unknown licenses default to NOT embedding (fail closed).
 */
export function decideLicense(
  origin: AssetOrigin,
  opts?: { publicRelease?: boolean },
): LicenseDecision {
  const license = (origin.licenseId ?? '').toUpperCase();
  const decision: LicenseDecision = {
    allowSearch: true,
    allowDownload: true,
    allowModification: true,
    allowPackageEmbedding: true,
    allowPublicRedistribution: true,
    requiresAttribution: false,
    shareAlike: false,
    blocks: [],
  };

  if (license === 'CC0' || license === 'CC0-1.0' || license === 'UNLICENSED' || license === '') {
    // CC0 = public domain dedication; no restrictions.
    decision.requiresAttribution = false;
    return decision;
  }
  if (
    license === 'MIT' ||
    license === 'BSD-2-CLAUSE' ||
    license === 'BSD-3-CLAUSE' ||
    license === 'APACHE-2.0'
  ) {
    decision.requiresAttribution = true;
    return decision;
  }
  if (license === 'CC-BY-4.0' || license === 'CC-BY-3.0') {
    decision.requiresAttribution = true;
    return decision;
  }
  if (license === 'CC-BY-SA-4.0' || license === 'CC-BY-SA-3.0') {
    decision.requiresAttribution = true;
    decision.shareAlike = true;
    if (opts?.publicRelease) {
      decision.allowPackageEmbedding = false;
      decision.blocks.push('share-alike license in a public release');
    }
    return decision;
  }
  if (license === 'GPL' || license === 'AGPL' || license === 'SSPL' || license === 'BUSL-1.1') {
    decision.allowSearch = false;
    decision.allowDownload = false;
    decision.allowModification = false;
    decision.allowPackageEmbedding = false;
    decision.allowPublicRedistribution = false;
    decision.blocks.push(`license not redistributable: ${license}`);
    return decision;
  }
  if (license === 'CC-BY-NC-4.0' || license === 'CC-BY-NC-SA-4.0') {
    decision.allowPackageEmbedding = false;
    decision.allowPublicRedistribution = false;
    decision.blocks.push('non-commercial license blocks embedding');
    return decision;
  }

  // Unknown / unparsed license: fail closed for embedding.
  decision.allowPackageEmbedding = false;
  decision.allowPublicRedistribution = false;
  decision.blocks.push(`unknown license: ${origin.licenseId ?? '(none)'}`);
  return decision;
}

// ---------------------------------------------------------------------------
// Local search (full-text over metadata; deterministic scoring)
// ---------------------------------------------------------------------------

export interface SearchQuery {
  text: string;
  format?: string[];
  minReviewState?: AssetReviewState;
}

export interface SearchResult {
  assetId: EntityId;
  name: string;
  score: number;
}

/** Tokenize a string into lowercase alphanumeric terms. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/**
 * Deterministic local search: exact-name > alias > tag > name-substring.
 * Runs entirely on metadata; no external service. Local search ALWAYS runs
 * before any external provider search (Phase 04 gate).
 */
export function searchAssets(
  assets: AssetMetadata[],
  query: SearchQuery,
  limit = 20,
): SearchResult[] {
  const terms = tokenize(query.text);
  if (terms.length === 0) return [];
  const results: SearchResult[] = [];

  for (const asset of assets) {
    if (query.format && !query.format.includes(asset.format)) continue;
    const nameTerms = tokenize(asset.name);
    const aliasTerms = asset.aliases.flatMap(tokenize);
    const tagTerms = asset.tags.flatMap(tokenize);
    const semanticTerms = asset.semanticAliases.flatMap(tokenize);

    let score = 0;
    const normalizedName = asset.name.toLowerCase();
    const normalizedQuery = query.text.toLowerCase();

    if (normalizedName === normalizedQuery) score += 100;
    else if (normalizedName.startsWith(normalizedQuery)) score += 60;
    else if (normalizedName.includes(normalizedQuery)) score += 40;

    for (const term of terms) {
      if (nameTerms.includes(term)) score += 30;
      if (aliasTerms.includes(term)) score += 20;
      if (tagTerms.includes(term)) score += 15;
      if (semanticTerms.includes(term)) score += 10;
    }
    if (score > 0) results.push({ assetId: asset.assetId, name: asset.name, score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Procedural scientific equipment templates (deterministic GLB bytes)
// ---------------------------------------------------------------------------

export type ProceduralTemplate =
  | 'beaker'
  | 'erlenmeyer-flask'
  | 'graduated-cylinder'
  | 'vial'
  | 'test-tube'
  | 'tube-rack'
  | 'bottle'
  | 'tray'
  | 'tubing'
  | 'gauge'
  | 'valve'
  | 'filter-housing'
  | 'cartridge'
  | 'simple-pipette'
  | 'peristaltic-pump'
  | 'workbench'
  | 'balance-proxy'
  | 'hot-plate'
  | 'magnetic-stirrer';

export interface ProceduralTemplateInfo {
  template: ProceduralTemplate;
  displayName: string;
  /** Typed dimensions in meters. */
  defaultDimensionsMeters: { x: number; y: number; z: number };
  semanticAnchors: { anchorId: string; label: string }[];
  description: string;
}

export const PROCEDURAL_TEMPLATES: Record<ProceduralTemplate, ProceduralTemplateInfo> = {
  'simple-pipette': {
    template: 'simple-pipette',
    displayName: 'Pipette (simple)',
    defaultDimensionsMeters: { x: 0.03, y: 0.03, z: 0.2 },
    semanticAnchors: [
      { anchorId: 'tip', label: 'Tip' },
      { anchorId: 'body', label: 'Body' },
      { anchorId: 'plunger', label: 'Plunger' },
    ],
    description: 'Single-channel pipette approximation.',
  },
  beaker: {
    template: 'beaker',
    displayName: 'Beaker',
    defaultDimensionsMeters: { x: 0.07, y: 0.07, z: 0.1 },
    semanticAnchors: [
      { anchorId: 'rim', label: 'Rim' },
      { anchorId: 'base', label: 'Base' },
      { anchorId: 'spout', label: 'Spout' },
    ],
    description: 'Glass beaker with spout.',
  },
  'erlenmeyer-flask': {
    template: 'erlenmeyer-flask',
    displayName: 'Erlenmeyer flask',
    defaultDimensionsMeters: { x: 0.08, y: 0.08, z: 0.14 },
    semanticAnchors: [
      { anchorId: 'neck', label: 'Neck' },
      { anchorId: 'base', label: 'Base' },
    ],
    description: 'Conical flask.',
  },
  'graduated-cylinder': {
    template: 'graduated-cylinder',
    displayName: 'Graduated cylinder',
    defaultDimensionsMeters: { x: 0.05, y: 0.05, z: 0.25 },
    semanticAnchors: [
      { anchorId: 'rim', label: 'Rim' },
      { anchorId: 'base', label: 'Base' },
      { anchorId: 'scale', label: 'Scale' },
    ],
    description: 'Graduated cylinder with volume scale.',
  },
  vial: {
    template: 'vial',
    displayName: 'Vial',
    defaultDimensionsMeters: { x: 0.015, y: 0.015, z: 0.045 },
    semanticAnchors: [
      { anchorId: 'cap', label: 'Cap' },
      { anchorId: 'body', label: 'Body' },
    ],
    description: 'Sample vial with cap.',
  },
  'test-tube': {
    template: 'test-tube',
    displayName: 'Test tube',
    defaultDimensionsMeters: { x: 0.012, y: 0.012, z: 0.12 },
    semanticAnchors: [
      { anchorId: 'rim', label: 'Rim' },
      { anchorId: 'round-bottom', label: 'Round bottom' },
    ],
    description: 'Borosilicate test tube.',
  },
  'tube-rack': {
    template: 'tube-rack',
    displayName: 'Tube rack',
    defaultDimensionsMeters: { x: 0.2, y: 0.06, z: 0.08 },
    semanticAnchors: [
      { anchorId: 'row-a', label: 'Row A' },
      { anchorId: 'row-b', label: 'Row B' },
    ],
    description: 'Two-row test tube rack.',
  },
  bottle: {
    template: 'bottle',
    displayName: 'Reagent bottle',
    defaultDimensionsMeters: { x: 0.06, y: 0.06, z: 0.15 },
    semanticAnchors: [
      { anchorId: 'cap', label: 'Cap' },
      { anchorId: 'label', label: 'Label face' },
    ],
    description: 'Reagent bottle.',
  },
  tray: {
    template: 'tray',
    displayName: 'Tray',
    defaultDimensionsMeters: { x: 0.3, y: 0.2, z: 0.02 },
    semanticAnchors: [
      { anchorId: 'center', label: 'Center' },
      { anchorId: 'edge', label: 'Edge' },
    ],
    description: 'Flat instrument tray.',
  },
  tubing: {
    template: 'tubing',
    displayName: 'Tubing',
    defaultDimensionsMeters: { x: 0.01, y: 0.01, z: 0.5 },
    semanticAnchors: [
      { anchorId: 'inlet', label: 'Inlet' },
      { anchorId: 'outlet', label: 'Outlet' },
    ],
    description: 'Flexible tubing segment.',
  },
  gauge: {
    template: 'gauge',
    displayName: 'Gauge',
    defaultDimensionsMeters: { x: 0.05, y: 0.05, z: 0.03 },
    semanticAnchors: [
      { anchorId: 'face', label: 'Face' },
      { anchorId: 'fitting', label: 'Fitting' },
    ],
    description: 'Analog pressure gauge.',
  },
  valve: {
    template: 'valve',
    displayName: 'Valve',
    defaultDimensionsMeters: { x: 0.04, y: 0.04, z: 0.08 },
    semanticAnchors: [
      { anchorId: 'handle', label: 'Handle' },
      { anchorId: 'inlet', label: 'Inlet' },
      { anchorId: 'outlet', label: 'Outlet' },
    ],
    description: 'Ball valve with handle.',
  },
  'filter-housing': {
    template: 'filter-housing',
    displayName: 'Filter housing',
    defaultDimensionsMeters: { x: 0.1, y: 0.1, z: 0.2 },
    semanticAnchors: [
      { anchorId: 'cap', label: 'Cap' },
      { anchorId: 'inlet', label: 'Inlet' },
    ],
    description: 'Cartridge filter housing.',
  },
  cartridge: {
    template: 'cartridge',
    displayName: 'Cartridge',
    defaultDimensionsMeters: { x: 0.05, y: 0.05, z: 0.12 },
    semanticAnchors: [
      { anchorId: 'top', label: 'Top seal' },
      { anchorId: 'bottom', label: 'Bottom seal' },
    ],
    description: 'Replaceable filter cartridge.',
  },
  'peristaltic-pump': {
    template: 'peristaltic-pump',
    displayName: 'Peristaltic pump',
    defaultDimensionsMeters: { x: 0.15, y: 0.12, z: 0.18 },
    semanticAnchors: [
      { anchorId: 'roller', label: 'Roller head' },
      { anchorId: 'tube-slot', label: 'Tube slot' },
      { anchorId: 'display', label: 'Display' },
    ],
    description: 'Peristaltic pump approximation.',
  },
  workbench: {
    template: 'workbench',
    displayName: 'Workbench',
    defaultDimensionsMeters: { x: 1.2, y: 0.6, z: 0.05 },
    semanticAnchors: [
      { anchorId: 'surface', label: 'Surface' },
      { anchorId: 'front', label: 'Front edge' },
    ],
    description: 'Lab work surface.',
  },
  'balance-proxy': {
    template: 'balance-proxy',
    displayName: 'Balance (proxy)',
    defaultDimensionsMeters: { x: 0.2, y: 0.2, z: 0.08 },
    semanticAnchors: [
      { anchorId: 'pan', label: 'Pan' },
      { anchorId: 'display', label: 'Display' },
    ],
    description: 'Analytical balance approximation (not dimensionally verified).',
  },
  'hot-plate': {
    template: 'hot-plate',
    displayName: 'Hot plate',
    defaultDimensionsMeters: { x: 0.18, y: 0.18, z: 0.06 },
    semanticAnchors: [
      { anchorId: 'plate', label: 'Plate' },
      { anchorId: 'dial', label: 'Dial' },
    ],
    description: 'Stirring hot plate.',
  },
  'magnetic-stirrer': {
    template: 'magnetic-stirrer',
    displayName: 'Magnetic stirrer',
    defaultDimensionsMeters: { x: 0.15, y: 0.15, z: 0.05 },
    semanticAnchors: [
      { anchorId: 'plate', label: 'Plate' },
      { anchorId: 'control', label: 'Control knob' },
    ],
    description: 'Magnetic stirrer.',
  },
};

/**
 * Deterministic minimal GLB for a template: a unit box with the template name
 * as the node. This is a placeholder mesh that the renderer can load; the
 * real procedural geometry (Phase 11) will refine shapes. The bytes are
 * produced by a tiny embedded GLB writer (no Three.js dependency).
 *
 * Returns a minimal valid GLB (JSON chunk + BIN chunk with a single unit cube).
 */
export function generateProceduralGlb(template: ProceduralTemplate): Uint8Array {
  const info = PROCEDURAL_TEMPLATES[template];
  const name = info.displayName;

  // Minimal GLB: BIN chunk = 24 vertices of a unit cube + 36 indices (uint16).
  // Positions only (no normals/uv) keep it deterministic and dependency-free.
  const positions = [
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5,
    0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 3, 7, 0, 7, 4, 1, 2,
    6, 1, 6, 5,
  ];
  const bin = new Uint8Array(positions.length * 4 + indices.length * 2);
  const dv = new DataView(bin.buffer);
  positions.forEach((v, i) => dv.setFloat32(i * 4, v, true));
  indices.forEach((v, i) => dv.setUint16(positions.length * 4 + i * 2, v, true));

  const json = {
    asset: { version: '2.0', generator: `guideforge-procedural-${template}` },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.18, 0.55, 0.87, 1],
          metallicFactor: 0.1,
          roughnessFactor: 0.6,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length * 4, target: 34962 },
      {
        buffer: 0,
        byteOffset: positions.length * 4,
        byteLength: indices.length * 2,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonChunk = pad4(jsonBytes);
  const binChunk = pad4(bin);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = new Uint8Array(total);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, 0x46546c67, true); // 'glTF'
  odv.setUint32(4, 2, true);
  odv.setUint32(8, total, true);
  odv.setUint32(12, jsonChunk.length, true);
  odv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonChunk, 20);
  odv.setUint32(20 + jsonChunk.length, binChunk.length, true);
  odv.setUint32(24 + jsonChunk.length, 0x004e4942, true); // 'BIN\0'
  out.set(binChunk, 28 + jsonChunk.length);
  return out;
}

function pad4(bytes: Uint8Array): Uint8Array {
  const rem = bytes.length % 4;
  if (rem === 0) return bytes;
  const padded = new Uint8Array(bytes.length + (4 - rem));
  padded.set(bytes);
  return padded;
}
