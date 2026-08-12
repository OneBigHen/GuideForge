/**
 * @guideforge/spatial-compiler — deterministic procedure-to-scene planning.
 *
 * The compiler produces a reviewable scene and typed scene commands. It never
 * asks a model for final coordinates: requirements, asset selection, layout,
 * annotations, cameras, and step states are all bounded pure functions.
 * Frameworks, providers, and storage stay outside this package.
 */
import {
  decideLicense,
  generateProceduralGlb,
  PROCEDURAL_TEMPLATES,
  searchAssets,
  type AssetMetadata,
  type ProceduralTemplate,
} from '@guideforge/assets';
import type { GuideCommand } from '@guideforge/commands';
import { sha256Hex, type ContentHash, type EntityId } from '@guideforge/domain';
import type {
  GuideScene,
  GuideSnapshot,
  SceneAnnotation,
  SceneNode,
  SurfaceAttachment,
} from '@guideforge/guide-schema';
import { SCENE_COMMAND_TYPES } from '@guideforge/scene-core';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type EquipmentRole = 'tool' | 'part' | 'surface' | 'equipment';

export interface EquipmentRequirement {
  requirementId: string;
  name: string;
  query: string;
  role: EquipmentRole;
  count: number;
  dimensionsMeters: Vec3;
  clearanceMeters: number;
  anchorLabels: string[];
  stepIds: EntityId[];
}

export interface EquipmentRequirementHint {
  name: string;
  query?: string;
  role?: EquipmentRole;
  count?: number;
  dimensionsMeters?: Vec3;
  clearanceMeters?: number;
  anchorLabels?: string[];
  stepIds?: EntityId[];
}

export type SemanticNodeKind = 'workspace' | 'equipment' | 'step';

export interface SemanticSceneNode {
  semanticId: string;
  kind: SemanticNodeKind;
  label: string;
  requirementId: string | null;
  stepId: EntityId | null;
}

export type SemanticRelationKind =
  'supports' | 'near' | 'clear-zone' | 'uses' | 'points-to' | 'contains';

export interface SemanticSceneRelation {
  relationId: string;
  kind: SemanticRelationKind;
  fromId: string;
  toId: string;
  distanceMeters: number | null;
  clearanceMeters: number;
}

export interface SemanticSceneGraph {
  nodes: SemanticSceneNode[];
  relations: SemanticSceneRelation[];
}

export type SpatialConstraintKind = 'workspace' | 'non-overlap' | 'support' | 'clear-zone';

export interface SpatialConstraint {
  constraintId: string;
  kind: SpatialConstraintKind;
  firstId: string;
  secondId: string | null;
  boundsMeters: Vec3 | null;
  clearanceMeters: number;
  hard: boolean;
}

export type ResolvedAssetSource = 'local' | 'procedural-proxy' | 'missing';

export interface ResolvedAsset {
  requirementId: string;
  source: ResolvedAssetSource;
  assetId: string | null;
  contentHash: ContentHash | null;
  displayName: string;
  dimensionsMeters: Vec3;
  anchorLabels: string[];
  template: ProceduralTemplate | null;
  searchScore: number | null;
  licenseBlocks: string[];
}

export interface ProceduralAssetRequest {
  template: ProceduralTemplate;
  contentHash: ContentHash;
  name: string;
}

export interface SpatialPlacement {
  semanticId: string;
  nodeId: EntityId;
  requirementId: string;
  instanceIndex: number;
  role: EquipmentRole;
  position: Vec3;
  dimensionsMeters: Vec3;
  asset: ResolvedAsset;
}

export interface SpatialCameraCandidate {
  cameraId: EntityId;
  name: string;
  position: Vec3;
  target: Vec3;
  score: number;
  stepId: EntityId | null;
  visibleNodeIds: EntityId[];
  occludedNodeIds: EntityId[];
}

export interface SpatialValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  collisionPairs: [EntityId, EntityId][];
  outOfBoundsNodeIds: EntityId[];
}

export interface SpatialCriticInput {
  scene: GuideScene;
  placements: readonly SpatialPlacement[];
  graph: SemanticSceneGraph;
}

export interface SpatialCriticIssue {
  severity: 'warning' | 'error';
  code: string;
  message: string;
}

export type SpatialVisualCritic = (input: SpatialCriticInput) => readonly SpatialCriticIssue[];

export interface SpatialWorkspace {
  dimensionsMeters: Vec3;
  origin: Vec3;
}

export interface SpatialCompileInput {
  snapshot: GuideSnapshot;
  assets?: readonly AssetMetadata[];
  requirements?: readonly EquipmentRequirementHint[];
  seed?: string;
  workspace?: Partial<SpatialWorkspace>;
  allowProceduralProxies?: boolean;
  occurredAtIso?: string;
  visualCritic?: SpatialVisualCritic;
}

export interface SpatialCompilation {
  seed: string;
  workspace: SpatialWorkspace;
  requirements: EquipmentRequirement[];
  resolvedAssets: ResolvedAsset[];
  graph: SemanticSceneGraph;
  constraints: SpatialConstraint[];
  placements: SpatialPlacement[];
  cameras: SpatialCameraCandidate[];
  scene: GuideScene;
  commands: GuideCommand[];
  proceduralAssets: ProceduralAssetRequest[];
  validation: SpatialValidation;
  criticIssues: SpatialCriticIssue[];
}

const DEFAULT_WORKSPACE: SpatialWorkspace = {
  dimensionsMeters: { x: 1.2, y: 0.8, z: 0.6 },
  origin: { x: 0, y: 0, z: 0 },
};

const CATALOG: {
  terms: string[];
  template: ProceduralTemplate;
  role?: EquipmentRole;
}[] = [
  { terms: ['micropipette', 'pipette'], template: 'simple-pipette', role: 'tool' },
  { terms: ['peristaltic pump', 'pump'], template: 'peristaltic-pump', role: 'equipment' },
  { terms: ['filter housing', 'filter'], template: 'filter-housing', role: 'equipment' },
  { terms: ['cartridge'], template: 'cartridge', role: 'part' },
  { terms: ['workbench', 'work surface', 'bench'], template: 'workbench', role: 'surface' },
  { terms: ['tray'], template: 'tray', role: 'surface' },
  { terms: ['beaker'], template: 'beaker', role: 'equipment' },
  { terms: ['erlenmeyer', 'flask'], template: 'erlenmeyer-flask', role: 'equipment' },
  { terms: ['graduated cylinder'], template: 'graduated-cylinder', role: 'equipment' },
  { terms: ['vial'], template: 'vial', role: 'part' },
  { terms: ['test tube'], template: 'test-tube', role: 'part' },
  { terms: ['tube rack'], template: 'tube-rack', role: 'equipment' },
  { terms: ['bottle'], template: 'bottle', role: 'equipment' },
  { terms: ['tubing'], template: 'tubing', role: 'part' },
  { terms: ['gauge'], template: 'gauge', role: 'equipment' },
  { terms: ['valve'], template: 'valve', role: 'equipment' },
  { terms: ['balance'], template: 'balance-proxy', role: 'equipment' },
  { terms: ['hot plate'], template: 'hot-plate', role: 'equipment' },
  { terms: ['magnetic stirrer', 'stirrer'], template: 'magnetic-stirrer', role: 'equipment' },
];

const DEFAULT_CLEARANCE = 0.02;
const MAX_LAYOUT_CELLS = 400;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stableId(scope: string, ...parts: string[]): EntityId {
  const hex = sha256Hex(new TextEncoder().encode([scope, ...parts].join('\u001f'))).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}` as EntityId;
}

function stableNumber(seed: string, value: string): number {
  return Number.parseInt(
    sha256Hex(new TextEncoder().encode(`${seed}\u001f${value}`)).slice(0, 8),
    16,
  );
}

function templateFor(value: string): (typeof CATALOG)[number] | null {
  const text = normalize(value);
  return (
    CATALOG.find((entry) => entry.terms.some((term) => text.includes(normalize(term)))) ?? null
  );
}

function spatialTemplateDimensions(template: ProceduralTemplate): Vec3 {
  const dimensions = PROCEDURAL_TEMPLATES[template].defaultDimensionsMeters;
  // The procedural catalog describes work surfaces as width/depth/height;
  // the scene solver uses x/y/z with y as up.
  if (template === 'workbench' || template === 'tray') {
    return { x: dimensions.x, y: dimensions.z, z: dimensions.y };
  }
  return { ...dimensions };
}

function dimensionsFor(value: string): Vec3 {
  const entry = templateFor(value);
  return entry ? spatialTemplateDimensions(entry.template) : { x: 0.1, y: 0.1, z: 0.1 };
}

function anchorsFor(value: string): string[] {
  const entry = templateFor(value);
  return entry
    ? PROCEDURAL_TEMPLATES[entry.template].semanticAnchors.map((anchor) => anchor.label)
    : ['Center'];
}

function roleFor(value: string): EquipmentRole {
  return templateFor(value)?.role ?? 'equipment';
}

function mergeRequirement(
  existing: EquipmentRequirement | undefined,
  hint: EquipmentRequirementHint,
  stepIds: readonly EntityId[],
): EquipmentRequirement {
  const name = hint.name.trim();
  const dimensions = hint.dimensionsMeters ?? existing?.dimensionsMeters ?? dimensionsFor(name);
  const anchorLabels = hint.anchorLabels ?? existing?.anchorLabels ?? anchorsFor(name);
  const nextStepIds = [
    ...new Set([...(existing?.stepIds ?? []), ...stepIds, ...(hint.stepIds ?? [])]),
  ];
  return {
    requirementId: existing?.requirementId ?? stableId('requirement', normalize(name)),
    name,
    query: hint.query?.trim() ?? existing?.query ?? name,
    role: hint.role ?? existing?.role ?? roleFor(name),
    count: Math.max(1, hint.count ?? existing?.count ?? 1),
    dimensionsMeters: { ...dimensions },
    clearanceMeters: Math.max(
      0,
      hint.clearanceMeters ?? existing?.clearanceMeters ?? DEFAULT_CLEARANCE,
    ),
    anchorLabels: [...new Set(anchorLabels.filter((label) => label.trim().length > 0))],
    stepIds: nextStepIds,
  };
}

function stepHints(snapshot: GuideSnapshot): EquipmentRequirementHint[] {
  const hints: EquipmentRequirementHint[] = [];
  for (const step of snapshot.steps) {
    for (const tool of step.tools) {
      hints.push({ name: tool.name, role: 'tool', stepIds: [step.stepId] });
    }
    for (const part of step.parts) {
      hints.push({ name: part.name, role: 'part', count: part.quantity, stepIds: [step.stepId] });
    }
  }

  // Procedure prose is not an equipment manifest. Only structured tools,
  // parts, and explicit compiler hints become scene requirements.
  return hints;
}

/** Extract bounded equipment requirements from structured steps and known vocabulary. */
export function extractEquipmentRequirements(
  snapshot: GuideSnapshot,
  hints: readonly EquipmentRequirementHint[] = [],
): EquipmentRequirement[] {
  const byName = new Map<string, EquipmentRequirement>();
  for (const hint of [...stepHints(snapshot), ...hints]) {
    if (!hint.name.trim()) continue;
    const key = normalize(hint.name);
    byName.set(key, mergeRequirement(byName.get(key), hint, hint.stepIds ?? []));
  }

  const surfaceKey = 'work surface';
  byName.set(
    surfaceKey,
    mergeRequirement(
      byName.get(surfaceKey),
      {
        name: 'Work surface',
        role: 'surface',
        dimensionsMeters: { x: 1.1, y: 0.05, z: 0.5 },
        clearanceMeters: 0,
        anchorLabels: ['Surface'],
        stepIds: snapshot.steps.map((step) => step.stepId),
      },
      [],
    ),
  );

  return [...byName.values()].sort((a, b) => a.requirementId.localeCompare(b.requirementId));
}

function dimensionForAsset(asset: AssetMetadata, fallback: Vec3): Vec3 {
  return { ...(asset.dimensionsMeters ?? asset.geometryHealth?.boundsMeters ?? fallback) };
}

function resolveAssets(
  requirements: readonly EquipmentRequirement[],
  assets: readonly AssetMetadata[],
  allowProceduralProxies: boolean,
): ResolvedAsset[] {
  const orderedAssets = [...assets].sort(
    (a, b) => a.contentHash.localeCompare(b.contentHash) || a.assetId.localeCompare(b.assetId),
  );
  return requirements.map((requirement) => {
    const localResults = searchAssets(
      orderedAssets.filter((asset) => asset.format === 'glb' || asset.format === 'gltf'),
      {
        text: requirement.query,
        format: ['glb', 'gltf'],
      },
    );
    const blocked: string[] = [];
    for (const result of localResults) {
      const asset = orderedAssets.find((candidate) => candidate.assetId === result.assetId);
      if (!asset) continue;
      const decision = decideLicense(asset.origin);
      if (!decision.allowPackageEmbedding) {
        blocked.push(...decision.blocks);
        continue;
      }
      return {
        requirementId: requirement.requirementId,
        source: 'local' as const,
        assetId: asset.assetId,
        contentHash: asset.contentHash,
        displayName: asset.name,
        dimensionsMeters: dimensionForAsset(asset, requirement.dimensionsMeters),
        anchorLabels:
          asset.semanticAnchors.length > 0
            ? asset.semanticAnchors.map((anchor) => anchor.label)
            : requirement.anchorLabels,
        template: null,
        searchScore: result.score,
        licenseBlocks: [],
      };
    }

    const entry = templateFor(requirement.query) ?? templateFor(requirement.name);
    if (allowProceduralProxies && entry) {
      const bytes = generateProceduralGlb(entry.template);
      return {
        requirementId: requirement.requirementId,
        source: 'procedural-proxy' as const,
        assetId: null,
        contentHash: sha256Hex(bytes) as ContentHash,
        displayName: PROCEDURAL_TEMPLATES[entry.template].displayName,
        dimensionsMeters: spatialTemplateDimensions(entry.template),
        anchorLabels: PROCEDURAL_TEMPLATES[entry.template].semanticAnchors.map(
          (anchor) => anchor.label,
        ),
        template: entry.template,
        searchScore: null,
        licenseBlocks: blocked,
      };
    }

    return {
      requirementId: requirement.requirementId,
      source: 'missing' as const,
      assetId: null,
      contentHash: null,
      displayName: requirement.name,
      dimensionsMeters: { ...requirement.dimensionsMeters },
      anchorLabels: requirement.anchorLabels,
      template: null,
      searchScore: null,
      licenseBlocks: blocked,
    };
  });
}

function addRelation(
  relations: SemanticSceneRelation[],
  seed: string,
  kind: SemanticRelationKind,
  fromId: string,
  toId: string,
  clearanceMeters = 0,
  distanceMeters: number | null = null,
): void {
  relations.push({
    relationId: stableId('relation', seed, kind, fromId, toId),
    kind,
    fromId,
    toId,
    distanceMeters,
    clearanceMeters,
  });
}

function buildGraph(
  snapshot: GuideSnapshot,
  requirements: readonly EquipmentRequirement[],
  seed: string,
): SemanticSceneGraph {
  const workspaceId = stableId('semantic', seed, 'workspace');
  const nodes: SemanticSceneNode[] = [
    {
      semanticId: workspaceId,
      kind: 'workspace',
      label: 'Work surface',
      requirementId: null,
      stepId: null,
    },
  ];
  const requirementIds = new Map<string, string>();
  for (const requirement of requirements) {
    const semanticId = stableId('semantic', seed, requirement.requirementId);
    requirementIds.set(requirement.requirementId, semanticId);
    nodes.push({
      semanticId,
      kind: 'equipment',
      label: requirement.name,
      requirementId: requirement.requirementId,
      stepId: null,
    });
  }
  const stepIds = new Map<EntityId, string>();
  for (const step of snapshot.steps) {
    const semanticId = stableId('semantic-step', seed, step.stepId);
    stepIds.set(step.stepId, semanticId);
    nodes.push({
      semanticId,
      kind: 'step',
      label: step.instructionText,
      requirementId: null,
      stepId: step.stepId,
    });
  }

  const surface = requirements.find((requirement) => requirement.role === 'surface');
  const relations: SemanticSceneRelation[] = [];
  for (const requirement of requirements) {
    const semanticId = requirementIds.get(requirement.requirementId)!;
    if (surface && requirement.requirementId !== surface.requirementId) {
      addRelation(
        relations,
        seed,
        'supports',
        requirementIds.get(surface.requirementId)!,
        semanticId,
      );
      addRelation(
        relations,
        seed,
        'contains',
        requirementIds.get(surface.requirementId)!,
        semanticId,
      );
    }
    for (const stepId of requirement.stepIds) {
      const stepSemanticId = stepIds.get(stepId);
      if (!stepSemanticId) continue;
      addRelation(relations, seed, 'uses', stepSemanticId, semanticId);
      if (requirement.anchorLabels.length > 0) {
        addRelation(relations, seed, 'points-to', stepSemanticId, semanticId);
      }
    }
  }

  const equipment = requirements.filter((requirement) => requirement.role !== 'surface');
  for (let i = 0; i < equipment.length; i += 1) {
    for (let j = i + 1; j < equipment.length; j += 1) {
      const first = equipment[i]!;
      const second = equipment[j]!;
      const sharedStep = first.stepIds.some((stepId) => second.stepIds.includes(stepId));
      if (sharedStep) {
        addRelation(
          relations,
          seed,
          'near',
          requirementIds.get(first.requirementId)!,
          requirementIds.get(second.requirementId)!,
          Math.max(first.clearanceMeters, second.clearanceMeters),
        );
      }
      addRelation(
        relations,
        seed,
        'clear-zone',
        requirementIds.get(first.requirementId)!,
        requirementIds.get(second.requirementId)!,
        Math.max(first.clearanceMeters, second.clearanceMeters),
      );
    }
  }

  return { nodes, relations };
}

function compileConstraints(
  requirements: readonly EquipmentRequirement[],
  graph: SemanticSceneGraph,
  workspace: SpatialWorkspace,
  seed: string,
): SpatialConstraint[] {
  const nodesByRequirement = new Map(
    graph.nodes
      .filter((node) => node.kind === 'equipment' && node.requirementId)
      .map((node) => [node.requirementId!, node.semanticId]),
  );
  const constraints: SpatialConstraint[] = [];
  for (const requirement of requirements) {
    const semanticId = nodesByRequirement.get(requirement.requirementId);
    if (!semanticId) continue;
    constraints.push({
      constraintId: stableId('constraint', seed, 'workspace', semanticId),
      kind: 'workspace',
      firstId: semanticId,
      secondId: null,
      boundsMeters: { ...workspace.dimensionsMeters },
      clearanceMeters: requirement.clearanceMeters,
      hard: true,
    });
    if (requirement.role !== 'surface') {
      const surface = requirements.find((candidate) => candidate.role === 'surface');
      const surfaceId = surface ? nodesByRequirement.get(surface.requirementId) : null;
      constraints.push({
        constraintId: stableId('constraint', seed, 'support', semanticId),
        kind: 'support',
        firstId: semanticId,
        secondId: surfaceId ?? null,
        boundsMeters: null,
        clearanceMeters: 0,
        hard: true,
      });
    }
  }

  const equipment = requirements.filter((requirement) => requirement.role !== 'surface');
  for (let i = 0; i < equipment.length; i += 1) {
    for (let j = i + 1; j < equipment.length; j += 1) {
      const first = equipment[i]!;
      const second = equipment[j]!;
      const firstId = nodesByRequirement.get(first.requirementId)!;
      const secondId = nodesByRequirement.get(second.requirementId)!;
      const clearanceMeters = Math.max(first.clearanceMeters, second.clearanceMeters);
      constraints.push({
        constraintId: stableId('constraint', seed, 'non-overlap', firstId, secondId),
        kind: 'non-overlap',
        firstId,
        secondId,
        boundsMeters: null,
        clearanceMeters,
        hard: true,
      });
      constraints.push({
        constraintId: stableId('constraint', seed, 'clear-zone', firstId, secondId),
        kind: 'clear-zone',
        firstId,
        secondId,
        boundsMeters: null,
        clearanceMeters,
        hard: true,
      });
    }
  }
  return constraints;
}

function overlaps(a: SpatialPlacement, b: SpatialPlacement, clearance: number): boolean {
  return (
    Math.abs(a.position.x - b.position.x) <
      (a.dimensionsMeters.x + b.dimensionsMeters.x) / 2 + clearance &&
    Math.abs(a.position.y - b.position.y) <
      (a.dimensionsMeters.y + b.dimensionsMeters.y) / 2 + clearance &&
    Math.abs(a.position.z - b.position.z) <
      (a.dimensionsMeters.z + b.dimensionsMeters.z) / 2 + clearance
  );
}

function withinWorkspace(placement: SpatialPlacement, workspace: SpatialWorkspace): boolean {
  const min = workspace.origin;
  const max = {
    x: min.x + workspace.dimensionsMeters.x,
    y: min.y + workspace.dimensionsMeters.y,
    z: min.z + workspace.dimensionsMeters.z,
  };
  return (
    placement.position.x - placement.dimensionsMeters.x / 2 >= min.x &&
    placement.position.x + placement.dimensionsMeters.x / 2 <= max.x &&
    placement.position.y - placement.dimensionsMeters.y / 2 >= min.y &&
    placement.position.y + placement.dimensionsMeters.y / 2 <= max.y &&
    placement.position.z - placement.dimensionsMeters.z / 2 >= min.z &&
    placement.position.z + placement.dimensionsMeters.z / 2 <= max.z
  );
}

function solveLayout(
  requirements: readonly EquipmentRequirement[],
  resolvedAssets: readonly ResolvedAsset[],
  graph: SemanticSceneGraph,
  constraints: readonly SpatialConstraint[],
  workspace: SpatialWorkspace,
  seed: string,
): SpatialPlacement[] {
  const assetsByRequirement = new Map(resolvedAssets.map((asset) => [asset.requirementId, asset]));
  const semanticByRequirement = new Map(
    graph.nodes
      .filter((node) => node.kind === 'equipment' && node.requirementId)
      .map((node) => [node.requirementId!, node.semanticId]),
  );
  const ordered = [...requirements].sort((a, b) => {
    if (a.role === 'surface' && b.role !== 'surface') return -1;
    if (a.role !== 'surface' && b.role === 'surface') return 1;
    return a.requirementId.localeCompare(b.requirementId);
  });
  const placements: SpatialPlacement[] = [];
  const surface = ordered.find((requirement) => requirement.role === 'surface');
  if (surface) {
    const asset = assetsByRequirement.get(surface.requirementId)!;
    placements.push({
      semanticId: semanticByRequirement.get(surface.requirementId)!,
      nodeId: stableId('node', seed, surface.requirementId, '0'),
      requirementId: surface.requirementId,
      instanceIndex: 0,
      role: surface.role,
      position: {
        x: workspace.origin.x + workspace.dimensionsMeters.x / 2,
        y: workspace.origin.y + surface.dimensionsMeters.y / 2,
        z: workspace.origin.z + workspace.dimensionsMeters.z / 2,
      },
      dimensionsMeters: { ...asset.dimensionsMeters },
      asset,
    });
  }

  const placeable = ordered.filter((requirement) => requirement.role !== 'surface');
  const candidateCount = Math.max(1, Math.ceil(Math.sqrt(MAX_LAYOUT_CELLS)));
  const seedOffset = stableNumber(seed, 'layout') % MAX_LAYOUT_CELLS;
  for (const requirement of placeable) {
    const asset = assetsByRequirement.get(requirement.requirementId)!;
    const dimensionsMeters = { ...asset.dimensionsMeters };
    for (let instanceIndex = 0; instanceIndex < requirement.count; instanceIndex += 1) {
      const surfaceTop = surface
        ? (placements[0]?.position.y ?? workspace.origin.y) +
          (placements[0]?.dimensionsMeters.y ?? 0) / 2
        : workspace.origin.y;
      const baseSemanticId = semanticByRequirement.get(requirement.requirementId)!;
      const semanticId =
        instanceIndex === 0
          ? baseSemanticId
          : stableId('semantic-instance', baseSemanticId, String(instanceIndex));
      const nodeId = stableId('node', seed, requirement.requirementId, String(instanceIndex));
      let chosen: SpatialPlacement | null = null;
      for (let cell = 0; cell < MAX_LAYOUT_CELLS && !chosen; cell += 1) {
        const index = (cell + seedOffset + instanceIndex * 17) % MAX_LAYOUT_CELLS;
        const row = Math.floor(index / candidateCount);
        const column = index % candidateCount;
        const x =
          workspace.origin.x +
          0.04 +
          column * (dimensionsMeters.x + requirement.clearanceMeters + 0.04);
        const z =
          workspace.origin.z +
          0.04 +
          row * (dimensionsMeters.z + requirement.clearanceMeters + 0.04);
        const candidate: SpatialPlacement = {
          semanticId,
          nodeId,
          requirementId: requirement.requirementId,
          instanceIndex,
          role: requirement.role,
          position: { x, y: surfaceTop + dimensionsMeters.y / 2, z },
          dimensionsMeters,
          asset,
        };
        if (!withinWorkspace(candidate, workspace)) continue;
        if (
          placements.some((existing) => {
            if (existing.role === 'surface') return false;
            const constraint = constraints.find(
              (item) =>
                (item.kind === 'non-overlap' || item.kind === 'clear-zone') &&
                ((item.firstId === candidate.semanticId && item.secondId === existing.semanticId) ||
                  (item.firstId === existing.semanticId && item.secondId === candidate.semanticId)),
            );
            return overlaps(candidate, existing, constraint?.clearanceMeters ?? 0);
          })
        )
          continue;
        chosen = candidate;
      }
      placements.push(
        chosen ?? {
          semanticId,
          nodeId,
          requirementId: requirement.requirementId,
          instanceIndex,
          role: requirement.role,
          position: {
            x: workspace.origin.x + workspace.dimensionsMeters.x / 2,
            y: surfaceTop + dimensionsMeters.y / 2,
            z: workspace.origin.z + workspace.dimensionsMeters.z / 2,
          },
          dimensionsMeters,
          asset,
        },
      );
    }
  }
  return placements;
}

function anchorPoint(label: string, dimensions: Vec3): Vec3 {
  const text = normalize(label);
  return {
    x: text.includes('left') ? -dimensions.x / 2 : text.includes('right') ? dimensions.x / 2 : 0,
    y:
      text.includes('bottom') || text.includes('base') || text.includes('tip')
        ? -dimensions.y / 2
        : text.includes('top') ||
            text.includes('rim') ||
            text.includes('cap') ||
            text.includes('plunger')
          ? dimensions.y / 2
          : 0,
    z:
      text.includes('front') || text.includes('face') || text.includes('display')
        ? dimensions.z / 2
        : text.includes('back')
          ? -dimensions.z / 2
          : 0,
  };
}

function cameraFor(
  seed: string,
  name: string,
  stepId: EntityId | null,
  placements: readonly SpatialPlacement[],
  workspace: SpatialWorkspace,
  visibleIds: readonly EntityId[],
  direction: Vec3,
): SpatialCameraCandidate {
  const visible = placements.filter((placement) => visibleIds.includes(placement.nodeId));
  const group = visible.length > 0 ? visible : placements;
  const center = group.reduce<Vec3>(
    (sum, placement) => ({
      x: sum.x + placement.position.x / group.length,
      y: sum.y + placement.position.y / group.length,
      z: sum.z + placement.position.z / group.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
  const distance = Math.max(workspace.dimensionsMeters.x, workspace.dimensionsMeters.z, 0.4) * 1.4;
  const position = {
    x: center.x + direction.x * distance,
    y: center.y + direction.y * distance,
    z: center.z + direction.z * distance,
  };
  const visibleNodeIds = cameraVisibleNodeIds(position, center, group);
  const occludedNodeIds = group
    .map((placement) => placement.nodeId)
    .filter((nodeId) => !visibleNodeIds.includes(nodeId));
  return {
    cameraId: stableId('camera', seed, stepId ?? 'overview'),
    name,
    position,
    target: center,
    score: visibleNodeIds.length / Math.max(1, group.length) - occludedNodeIds.length * 0.01,
    stepId,
    visibleNodeIds,
    occludedNodeIds,
  };
}

function segmentIntersectsAabb(from: Vec3, to: Vec3, placement: SpatialPlacement): boolean {
  const min = {
    x: placement.position.x - placement.dimensionsMeters.x / 2,
    y: placement.position.y - placement.dimensionsMeters.y / 2,
    z: placement.position.z - placement.dimensionsMeters.z / 2,
  };
  const max = {
    x: placement.position.x + placement.dimensionsMeters.x / 2,
    y: placement.position.y + placement.dimensionsMeters.y / 2,
    z: placement.position.z + placement.dimensionsMeters.z / 2,
  };
  let near = 0;
  let far = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-9) {
      if (from[axis] < min[axis] || from[axis] > max[axis]) return false;
      continue;
    }
    const t1 = (min[axis] - from[axis]) / delta;
    const t2 = (max[axis] - from[axis]) / delta;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return false;
  }
  return far >= 0 && near <= 1;
}

function cameraVisibleNodeIds(
  position: Vec3,
  target: Vec3,
  placements: readonly SpatialPlacement[],
): EntityId[] {
  const ordered = [...placements].sort(
    (a, b) => distanceSquared(position, a.position) - distanceSquared(position, b.position),
  );
  const visible: EntityId[] = [];
  for (const placement of ordered) {
    const blocked = ordered.some(
      (other) =>
        other.nodeId !== placement.nodeId &&
        distanceSquared(position, other.position) < distanceSquared(position, placement.position) &&
        segmentIntersectsAabb(position, placement.position, other),
    );
    if (!blocked) visible.push(placement.nodeId);
  }
  // The target keeps the director stable when all candidates are sparse.
  if (visible.length === 0 && placements.some((placement) => placement.position === target)) {
    return [placements[0]!.nodeId];
  }
  return visible;
}

function distanceSquared(a: Vec3, b: Vec3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

function sceneNode(placement: SpatialPlacement): SceneNode {
  const dimensions = placement.dimensionsMeters;
  return {
    nodeId: placement.nodeId,
    name:
      placement.instanceIndex > 0
        ? `${placement.asset.displayName} ${placement.instanceIndex + 1}`
        : placement.asset.displayName,
    parentId: null,
    assetHash: placement.asset.contentHash,
    transform: {
      position: { ...placement.position },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
    layerId: 'default',
    visible: true,
    locked: false,
    metadata: {
      semanticId: placement.semanticId,
      requirementId: placement.requirementId,
      instanceIndex: String(placement.instanceIndex),
      assetSource: placement.asset.source,
      dimensionsMeters: JSON.stringify(dimensions),
      ...(placement.asset.template ? { proceduralTemplate: placement.asset.template } : {}),
    },
  };
}

function buildAttachmentsAndAnnotations(
  seed: string,
  placements: readonly SpatialPlacement[],
): { attachments: SurfaceAttachment[]; annotations: SceneAnnotation[] } {
  const attachments: SurfaceAttachment[] = [];
  const annotations: SceneAnnotation[] = [];
  for (const placement of placements.filter((item) => item.asset.source !== 'missing')) {
    const labels =
      placement.asset.anchorLabels.length > 0
        ? placement.asset.anchorLabels.slice(0, 4)
        : ['Center'];
    labels.forEach((label, index) => {
      const attachmentId = stableId('attachment', seed, placement.nodeId, normalize(label));
      const localPoint = anchorPoint(label, placement.dimensionsMeters);
      attachments.push({
        attachmentId,
        nodeId: placement.nodeId,
        assetHash: placement.asset.contentHash,
        meshName: null,
        primitiveIndex: null,
        triangleIndex: null,
        barycentric: null,
        localPoint,
        normal: null,
        source: 'procedural',
        confidence: placement.asset.source === 'local' ? 0.65 : 0.45,
        reviewState: 'draft',
      });
      annotations.push({
        annotationId: stableId('annotation', seed, placement.nodeId, normalize(label)),
        kind: 'arrow',
        text: `${placement.asset.displayName}: ${label}`,
        attachmentId,
        targetNodeId: placement.nodeId,
        targetPoint: { ...localPoint },
        offset: { x: 32 + index * 12, y: 32 + index * 10 },
        pathPoints: [],
        color: '#2dd4bf',
      });
    });
  }
  return { attachments, annotations };
}

function buildStepRequirementMap(
  requirements: readonly EquipmentRequirement[],
): Map<string, Set<EntityId>> {
  return new Map(
    requirements.map((requirement) => [requirement.requirementId, new Set(requirement.stepIds)]),
  );
}

function buildSceneWithSteps(
  snapshot: GuideSnapshot,
  placements: readonly SpatialPlacement[],
  cameras: readonly SpatialCameraCandidate[],
  attachments: readonly SurfaceAttachment[],
  annotations: readonly SceneAnnotation[],
  requirements: readonly EquipmentRequirement[],
): GuideScene {
  const stepRequirements = buildStepRequirementMap(requirements);
  const stepStates: GuideScene['stepStates'] = {};
  for (const step of snapshot.steps) {
    const visibleNodeIds = placements
      .filter((placement) => stepRequirements.get(placement.requirementId)?.has(step.stepId))
      .map((placement) => placement.nodeId);
    const surface = placements.find(
      (placement) =>
        stepRequirements.get(placement.requirementId)?.has(step.stepId) &&
        placement.role === 'surface',
    );
    if (surface && !visibleNodeIds.includes(surface.nodeId)) visibleNodeIds.unshift(surface.nodeId);
    const camera = cameras.find((candidate) => candidate.stepId === step.stepId);
    stepStates[step.stepId] = {
      visibleNodeIds:
        visibleNodeIds.length > 0
          ? visibleNodeIds
          : placements.map((placement) => placement.nodeId),
      cameraId: camera?.cameraId ?? null,
    };
  }
  return {
    nodes: placements.map(sceneNode),
    rootOrder: placements.map((placement) => placement.nodeId),
    layers: [
      { layerId: 'default', name: 'Default', visible: true, locked: false, color: '#2dd4bf' },
    ],
    cameras: cameras.map((camera) => ({
      cameraId: camera.cameraId,
      name: camera.name,
      position: { ...camera.position },
      target: { ...camera.target },
      orthographic: false,
      zoom: 1,
    })),
    measurements: [],
    annotations: [...annotations],
    anchors: [],
    surfaceAttachments: [...attachments],
    stepStates,
  };
}

function makeCameras(
  snapshot: GuideSnapshot,
  seed: string,
  placements: readonly SpatialPlacement[],
  workspace: SpatialWorkspace,
  requirements: readonly EquipmentRequirement[],
): SpatialCameraCandidate[] {
  const allIds = placements.map((placement) => placement.nodeId);
  const directions: Vec3[] = [
    { x: 1, y: 0.8, z: 1 },
    { x: 0.1, y: 0.7, z: 1 },
    { x: 1, y: 0.7, z: 0.1 },
  ];
  const rank = (stepId: EntityId | null, name: string, visibleIds: readonly EntityId[]) =>
    directions
      .map((direction, index) =>
        cameraFor(
          seed,
          `${name} candidate ${index + 1}`,
          stepId,
          placements,
          workspace,
          visibleIds,
          direction,
        ),
      )
      .sort((a, b) => b.score - a.score || a.cameraId.localeCompare(b.cameraId))[0]!;
  const cameras = [rank(null, 'Overview', allIds)];
  const stepRequirements = buildStepRequirementMap(requirements);
  for (const step of snapshot.steps) {
    const stepNodeIds = placements
      .filter((placement) => stepRequirements.get(placement.requirementId)?.has(step.stepId))
      .map((placement) => placement.nodeId);
    cameras.push(
      rank(step.stepId, `Step: ${step.stepId}`, stepNodeIds.length > 0 ? stepNodeIds : allIds),
    );
  }
  return cameras;
}

function sceneCommand(
  guideId: EntityId,
  seed: string,
  occurredAtIso: string,
  index: number,
  commandType: string,
  payload: unknown,
): GuideCommand {
  return {
    commandId: stableId('command', seed, String(index), commandType),
    commandType,
    actorId: 'spatial-compiler',
    guideId,
    origin: 'ai-proposal-accept',
    occurredAt: occurredAtIso,
    payload,
  };
}

/** Compile canonical scene commands without applying them to storage. */
export function compileSceneCommands(
  snapshot: GuideSnapshot,
  scene: GuideScene,
  seed: string,
  occurredAtIso: string,
): GuideCommand[] {
  const commands: GuideCommand[] = [];
  let index = 0;
  for (const node of scene.nodes) {
    commands.push(
      sceneCommand(snapshot.guideId, seed, occurredAtIso, index++, SCENE_COMMAND_TYPES.addNode, {
        node,
      }),
    );
  }
  for (const camera of scene.cameras) {
    commands.push(
      sceneCommand(snapshot.guideId, seed, occurredAtIso, index++, SCENE_COMMAND_TYPES.addCamera, {
        bookmarkId: camera.cameraId,
        name: camera.name,
        position: camera.position,
        target: camera.target,
        orthographic: camera.orthographic,
        zoom: camera.zoom,
      }),
    );
  }
  for (const attachment of scene.surfaceAttachments) {
    commands.push(
      sceneCommand(
        snapshot.guideId,
        seed,
        occurredAtIso,
        index++,
        SCENE_COMMAND_TYPES.addSurfaceAttachment,
        { attachment },
      ),
    );
  }
  for (const annotation of scene.annotations) {
    commands.push(
      sceneCommand(
        snapshot.guideId,
        seed,
        occurredAtIso,
        index++,
        SCENE_COMMAND_TYPES.addAnnotation,
        { annotation },
      ),
    );
  }
  for (const [stepId, step] of Object.entries(scene.stepStates)) {
    commands.push(
      sceneCommand(
        snapshot.guideId,
        seed,
        occurredAtIso,
        index++,
        SCENE_COMMAND_TYPES.setStepState,
        { stepId, step },
      ),
    );
  }
  return commands;
}

/** Validate placements, bounds, attachments, annotations, and generated step states. */
export function validateSpatialScene(
  scene: GuideScene,
  placements: readonly SpatialPlacement[],
  constraints: readonly SpatialConstraint[],
  workspace: SpatialWorkspace,
): SpatialValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const collisionPairs: [EntityId, EntityId][] = [];
  const outOfBoundsNodeIds: EntityId[] = [];
  const nodeIds = new Set(scene.nodes.map((node) => node.nodeId));
  for (const placement of placements) {
    if (!withinWorkspace(placement, workspace)) outOfBoundsNodeIds.push(placement.nodeId);
    if (placement.asset.source === 'missing')
      errors.push(`missing renderable asset for ${placement.requirementId}`);
    if (placement.asset.source === 'procedural-proxy')
      warnings.push(`procedural proxy used for ${placement.asset.displayName}`);
  }
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const first = placements[i]!;
      const second = placements[j]!;
      const constraint = constraints.find(
        (item) =>
          (item.kind === 'non-overlap' || item.kind === 'clear-zone') &&
          ((item.firstId === first.semanticId && item.secondId === second.semanticId) ||
            (item.firstId === second.semanticId && item.secondId === first.semanticId)),
      );
      if (
        first.role !== 'surface' &&
        second.role !== 'surface' &&
        constraint &&
        overlaps(first, second, constraint.clearanceMeters)
      ) {
        collisionPairs.push([first.nodeId, second.nodeId]);
      }
    }
  }
  if (outOfBoundsNodeIds.length > 0)
    errors.push(`${outOfBoundsNodeIds.length} node(s) exceed the workspace`);
  if (collisionPairs.length > 0) errors.push(`${collisionPairs.length} node pair(s) collide`);
  const placementBySemanticId = new Map(
    placements.map((placement) => [placement.semanticId, placement]),
  );
  for (const constraint of constraints) {
    if (constraint.kind !== 'support') continue;
    const placement = placementBySemanticId.get(constraint.firstId);
    const surface = constraint.secondId
      ? placementBySemanticId.get(constraint.secondId)
      : undefined;
    if (!placement || !surface) {
      errors.push(`support constraint ${constraint.constraintId} has no surface`);
      continue;
    }
    const placementBottom = placement.position.y - placement.dimensionsMeters.y / 2;
    const surfaceTop = surface.position.y + surface.dimensionsMeters.y / 2;
    if (Math.abs(placementBottom - surfaceTop) > 1e-6) {
      errors.push(`node ${placement.nodeId} is not supported by ${surface.nodeId}`);
    }
  }
  for (const attachment of scene.surfaceAttachments) {
    if (!nodeIds.has(attachment.nodeId))
      errors.push(`attachment ${attachment.attachmentId} targets a missing node`);
  }
  for (const annotation of scene.annotations) {
    if (
      annotation.attachmentId &&
      !scene.surfaceAttachments.some(
        (attachment) => attachment.attachmentId === annotation.attachmentId,
      )
    ) {
      errors.push(`annotation ${annotation.annotationId} targets a missing attachment`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, collisionPairs, outOfBoundsNodeIds };
}

/** Compile a procedure into a coherent editable scene and an acceptance command list. */
export function compileSpatialGuide(input: SpatialCompileInput): SpatialCompilation {
  const seed = input.seed ?? input.snapshot.guideId;
  const workspace: SpatialWorkspace = {
    dimensionsMeters: {
      ...DEFAULT_WORKSPACE.dimensionsMeters,
      ...(input.workspace?.dimensionsMeters ?? {}),
    },
    origin: { ...DEFAULT_WORKSPACE.origin, ...(input.workspace?.origin ?? {}) },
  };
  const requirements = extractEquipmentRequirements(input.snapshot, input.requirements ?? []);
  const resolvedAssets = resolveAssets(
    requirements,
    input.assets ?? [],
    input.allowProceduralProxies ?? true,
  );
  const graph = buildGraph(input.snapshot, requirements, seed);
  const constraints = compileConstraints(requirements, graph, workspace, seed);
  const placements = solveLayout(requirements, resolvedAssets, graph, constraints, workspace, seed);
  const { attachments, annotations } = buildAttachmentsAndAnnotations(seed, placements);
  const cameras = makeCameras(input.snapshot, seed, placements, workspace, requirements);
  const scene = buildSceneWithSteps(
    input.snapshot,
    placements,
    cameras,
    attachments,
    annotations,
    requirements,
  );
  const validation = validateSpatialScene(scene, placements, constraints, workspace);
  const criticIssues = input.visualCritic
    ? [...input.visualCritic({ scene, placements, graph })].slice(0, 32)
    : [];
  const occurredAtIso = input.occurredAtIso ?? '1970-01-01T00:00:00.000Z';
  const commands = compileSceneCommands(input.snapshot, scene, seed, occurredAtIso);
  const proceduralAssets = resolvedAssets
    .filter(
      (
        asset,
      ): asset is ResolvedAsset & { template: ProceduralTemplate; contentHash: ContentHash } =>
        asset.source === 'procedural-proxy' &&
        asset.template !== null &&
        asset.contentHash !== null,
    )
    .map((asset) => ({
      template: asset.template,
      contentHash: asset.contentHash,
      name: asset.displayName,
    }));
  return {
    seed,
    workspace,
    requirements,
    resolvedAssets,
    graph,
    constraints,
    placements,
    cameras,
    scene,
    commands,
    proceduralAssets,
    validation,
    criticIssues,
  };
}

export { stableId };
