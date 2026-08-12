import { createPhotoTo3DJob, type ProceduralTemplate } from '@guideforge/assets';
import { materializeSnapshot, materializeTraining } from '@guideforge/collaboration';
import {
  generateTrainingFromProcedure,
  snapshotsSemanticallyEqual,
} from '@guideforge/guide-schema';
import { applySceneCommands, createSceneState } from '@guideforge/scene-core';
import { compileSpatialGuide } from '@guideforge/spatial-compiler';
import 'fake-indexeddb/auto';
import { strFromU8, unzipSync } from 'fflate';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AssetLibrary } from './assetLibrary';
import {
  addPart,
  addStep,
  addTask,
  addTool,
  closeGuide,
  completeRuntimeStepForGuide,
  createGuide,
  createRuntimeAttestation,
  exportFullBackup,
  exportRuntimeCompletionReport,
  importDraft,
  listEvidence,
  loadRuntimeSession,
  loadTrainingSession,
  openGuide,
  recordRuntimeMeasurement,
  recordRuntimeNote,
  recordTrainingAnswer,
  replaceTrainingProgram,
  submitOfflineTrainingAttempt,
} from './guideStore';
import { saveSceneToWorkingDoc } from './sceneStore';
import { addSource, sha256Hex } from './sourceStudio';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

interface GoldenProject {
  slug: string;
  title: string;
  sourceFilename: string;
  sourceText: string;
  taskTitle: string;
  steps: string[];
  tools: string[];
  parts: { name: string; quantity: number }[];
  templates: ProceduralTemplate[];
  photoTo3dProbe: boolean;
}

const GOLDEN_PROJECTS: GoldenProject[] = [
  {
    slug: 'micropipette-calibration',
    title: 'Micropipette calibration',
    sourceFilename: 'micropipette-calibration.md',
    sourceText:
      '# Micropipette calibration\n- Tare the analytical balance before calibration.\n- Transfer the calibration volume with the micropipette and record the measured mass.',
    taskTitle: 'Calibrate the micropipette',
    steps: [
      'Tare the analytical balance before calibration.',
      'Transfer the calibration volume with the micropipette and record the measured mass.',
    ],
    tools: ['Micropipette', 'Analytical balance'],
    parts: [{ name: 'Beaker', quantity: 1 }],
    templates: ['simple-pipette', 'balance-proxy', 'beaker', 'workbench'],
    photoTo3dProbe: false,
  },
  {
    slug: 'peristaltic-pump-tubing',
    title: 'Peristaltic pump tubing replacement',
    sourceFilename: 'peristaltic-pump-tubing.md',
    sourceText:
      '# Peristaltic pump tubing replacement\n- Isolate the peristaltic pump before opening the roller head.\n- Seat the replacement tubing in the tube slot and run a leak check.',
    taskTitle: 'Replace peristaltic pump tubing',
    steps: [
      'Isolate the peristaltic pump before opening the roller head.',
      'Seat the replacement tubing in the tube slot and run a leak check.',
    ],
    tools: ['Peristaltic pump'],
    parts: [{ name: 'Tubing', quantity: 1 }],
    templates: ['peristaltic-pump', 'tubing', 'workbench'],
    photoTo3dProbe: true,
  },
  {
    slug: 'whole-house-filter-cartridge',
    title: 'Whole-house filter cartridge replacement',
    sourceFilename: 'whole-house-filter-cartridge.md',
    sourceText:
      '# Whole-house filter cartridge replacement\n- Close the isolation valve and release pressure from the filter housing.\n- Replace the cartridge, inspect the seal, and restore flow.',
    taskTitle: 'Replace the filter cartridge',
    steps: [
      'Close the isolation valve and release pressure from the filter housing.',
      'Replace the cartridge, inspect the seal, and restore flow.',
    ],
    tools: ['Filter housing', 'Valve'],
    parts: [{ name: 'Cartridge', quantity: 1 }],
    templates: ['filter-housing', 'cartridge', 'valve', 'workbench'],
    photoTo3dProbe: false,
  },
];

function projectSource(project: GoldenProject): Uint8Array {
  return new TextEncoder().encode(project.sourceText);
}

describe('Phase 16 golden certification', () => {
  it.each(GOLDEN_PROJECTS)(
    '$title completes the generic local-first golden path',
    async (project) => {
      const sourceBytes = projectSource(project);
      const sourceHash = await sha256Hex(sourceBytes);
      const session = await createGuide(project.title);
      const source = await addSource(
        { db: session.db, assets: session.assets },
        {
          guideId: session.guideId,
          originalFilename: project.sourceFilename,
          bytes: sourceBytes,
        },
      );
      expect(source.verdict.accepted).toBe(true);
      expect(source.source.status).toBe('complete');
      expect(source.source.sha256).toBe(sourceHash);
      expect(source.source.regions.length).toBeGreaterThan(0);

      const taskId = await addTask(session, project.taskTitle);
      const stepIds: string[] = [];
      for (const instruction of project.steps) {
        const stepId = await addStep(session, taskId, instruction);
        stepIds.push(stepId);
        for (const tool of project.tools) await addTool(session, stepId, tool);
        for (const part of project.parts) await addPart(session, stepId, part.name, part.quantity);
      }

      // Reopen through the offline migration seam so the source becomes canonical
      // GuideSnapshot data before training and spatial compilation run.
      await closeGuide(session);
      let working = await openGuide(session.guideId);
      const snapshot = materializeSnapshot(working.working);
      expect(snapshot.sources).toHaveLength(1);
      const canonicalSource = snapshot.sources[0]!;
      const citationRegion = canonicalSource.regions[0]!;
      expect(canonicalSource.sha256).toBe(sourceHash);
      expect(citationRegion.sourceHash).toBe(sourceHash);
      expect(citationRegion.contentHash).toMatch(/^[0-9a-f]{64}$/);

      const generatedTraining = generateTrainingFromProcedure(snapshot);
      expect(generatedTraining.quality.ok).toBe(true);
      expect(generatedTraining.quality.coverage.sourceGroundedItems).toBe(
        generatedTraining.training.assessmentItems.length,
      );
      await replaceTrainingProgram(working, generatedTraining.training);

      const library = new AssetLibrary(working.db, working.assets);
      const localEntries = [];
      for (const template of project.templates) {
        localEntries.push(await library.addProcedural(template));
      }
      const compilation = compileSpatialGuide({
        snapshot: materializeSnapshot(working.working),
        assets: [],
        seed: `phase16-${project.slug}`,
        workspace: { dimensionsMeters: { x: 2.4, y: 1.6, z: 1 } },
        occurredAtIso: '2026-08-12T00:00:00.000Z',
      });
      expect(localEntries).toHaveLength(project.templates.length);
      for (const request of compilation.proceduralAssets) {
        await library.addProcedural(request.template);
      }
      expect(compilation.validation.ok).toBe(true);
      expect(compilation.cameras.length).toBeGreaterThan(0);
      expect(compilation.scene.surfaceAttachments.length).toBeGreaterThan(0);
      expect(compilation.scene.annotations.length).toBeGreaterThan(0);
      for (const resolved of compilation.resolvedAssets) {
        expect(resolved.source).not.toBe('missing');
        if (resolved.contentHash) expect(await working.assets.has(resolved.contentHash)).toBe(true);
      }
      saveSceneToWorkingDoc(working, applySceneCommands(createSceneState(), compilation.commands));

      if (project.photoTo3dProbe) {
        const probeHashes = [
          sourceHash,
          await sha256Hex(new TextEncoder().encode(`${project.slug}:front`)),
          await sha256Hex(new TextEncoder().encode(`${project.slug}:side`)),
        ];
        const photoJob = createPhotoTo3DJob({
          jobId: `${project.slug}-photo`,
          sourceHashes: probeHashes,
          providerId: 'tripo-sr',
          gpuProfileId: 'cpu',
          licenseAccepted: true,
          nowIso: '2026-08-12T00:00:00.000Z',
        });
        expect(photoJob.status).toBe('blocked');
        expect(photoJob.provenance.sourceHashes).toEqual(probeHashes);
      }

      const trainingSession = await loadTrainingSession(working);
      let answeredTraining = trainingSession;
      for (const item of generatedTraining.training.assessmentItems) {
        const correct = item.scoringRule.correctOptionIds as string[];
        answeredTraining = await recordTrainingAnswer(
          working,
          answeredTraining,
          item.itemId,
          correct[0]!,
        );
      }
      const trainingAttempt = await submitOfflineTrainingAttempt(working, answeredTraining);
      expect(trainingAttempt.attempt.passed).toBe(true);
      expect(trainingAttempt.session.status).toBe('mastered');

      let runtime = await loadRuntimeSession(working);
      for (const [index, stepId] of stepIds.entries()) {
        const withNote = await recordRuntimeNote(
          working,
          runtime,
          stepId,
          `Completed ${project.steps[index]}`,
        );
        const withMeasurement = await recordRuntimeMeasurement(working, withNote.runtime, {
          stepId,
          label: 'verification reading',
          value: index + 1,
          unit: 'check',
        });
        const withAttestation = await createRuntimeAttestation(
          working,
          withMeasurement.runtime,
          stepId,
        );
        runtime = await completeRuntimeStepForGuide(working, withAttestation.runtime, stepId);
      }
      expect(runtime.status).toBe('completed');
      expect(runtime.completions).toHaveLength(stepIds.length);
      const completionReport = await exportRuntimeCompletionReport(working, runtime);
      expect(strFromU8(completionReport.bytes)).toContain('guideforge-procedure-completion');
      expect((await listEvidence(working.guideId)).length).toBeGreaterThanOrEqual(
        stepIds.length * 3,
      );

      const beforeExport = materializeSnapshot(working.working);
      const backup = await exportFullBackup(working);
      const entries = unzipSync(backup.bytes);
      const paths = Object.keys(entries);
      expect(paths).toEqual(
        expect.arrayContaining([
          'manifest.json',
          'guide.json',
          'reports/asset-licenses.json',
          'reports/cost.json',
          'reports/generation.json',
          'reports/validation.json',
        ]),
      );
      expect(paths.some((path) => path.startsWith('sources/'))).toBe(true);
      expect(paths.some((path) => path.startsWith('assets/'))).toBe(true);
      expect(paths.some((path) => path.startsWith('runtime/evidence/'))).toBe(true);
      const costReport = JSON.parse(strFromU8(entries['reports/cost.json']!)) as {
        sourceBytes: number;
      };
      const licenseReport = JSON.parse(strFromU8(entries['reports/asset-licenses.json']!)) as {
        assets: unknown[];
      };
      expect(costReport.sourceBytes).toBeGreaterThan(0);
      expect(licenseReport.assets.length).toBeGreaterThan(0);

      await closeGuide(working);
      const cleanProfile = await openGuide(beforeExport.guideId);
      await cleanProfile.persistence.provider.clearData();
      await cleanProfile.persistence.provider.destroy();
      cleanProfile.working.doc.destroy();
      await Promise.all([
        working.db.guides.clear(),
        working.db.assets.clear(),
        working.db.assetBlobs.clear(),
        working.db.sources.clear(),
        working.db.sourceBlobs.clear(),
        working.db.evidence.clear(),
        working.db.reports.clear(),
        working.db.runtimeBlobs.clear(),
        working.db.runtimeSessions.clear(),
        working.db.trainingSessions.clear(),
      ]);
      const restored = await importDraft(backup.bytes);
      expect(restored.guideId).toBe(beforeExport.guideId);
      working = await openGuide(restored.guideId);
      const afterImport = materializeSnapshot(working.working);
      expect(snapshotsSemanticallyEqual(beforeExport, afterImport)).toBe(true);
      expect(materializeTraining(working.working).assessmentItems.length).toBe(
        generatedTraining.training.assessmentItems.length,
      );
      expect((await listEvidence(working.guideId)).length).toBeGreaterThanOrEqual(
        stepIds.length * 3,
      );
      await closeGuide(working);
    },
    60_000,
  );
});
