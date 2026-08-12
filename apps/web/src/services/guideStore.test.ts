import type { ContentHash } from '@guideforge/domain';
import 'fake-indexeddb/auto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  addStep,
  addTask,
  closeGuide,
  completeRuntimeStepForGuide,
  createGuide,
  createRuntimeAttestation,
  exportDraft,
  exportFullBackup,
  exportRuntimeCompletionReport,
  getLastBackupAtIso,
  importDraft,
  listEvidence,
  listGuides,
  loadRuntimeSession,
  openGuide,
  recordRuntimeMeasurement,
  recordRuntimeNote,
  renameGuide,
} from './guideStore';

// Ensure crypto is available for storage-web (fake-indexeddb + node webcrypto).
Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('guide store local-first workflow', () => {
  it('creates, renames, and lists a guide', async () => {
    const session = await createGuide('Offline draft');
    await renameGuide(session, 'Renamed offline draft');
    await closeGuide(session);

    const guides = await listGuides();
    const entry = guides.find((g) => g.guideId === session.guideId);
    expect(entry?.title).toBe('Renamed offline draft');
  });

  it('reopens a draft after restart (reload offline)', async () => {
    const session = await createGuide('Survives restart');
    await addTask(session, 'Task one');
    await closeGuide(session);

    // Simulate browser restart: reopen from y-indexeddb.
    const reopened = await openGuide(session.guideId);
    expect(reopened.working.guide.get('title')).toBe('Survives restart');
    await closeGuide(reopened);
  });

  it('exports and imports a deterministic draft package', async () => {
    const session = await createGuide('Round trip');
    await addTask(session, 'Task A');
    await closeGuide(session);

    // Reopen so we export from a materialized session, then close it again.
    const exportSession = await openGuide(session.guideId);
    const { bytes } = await exportDraft(exportSession);
    await closeGuide(exportSession);
    expect(bytes.length).toBeGreaterThan(0);

    const imported = await importDraft(bytes);
    expect(imported.guideId).toBe(session.guideId);
    const reopened = await openGuide(imported.guideId);
    expect(reopened.working.guide.get('title')).toBe('Round trip');
    await closeGuide(reopened);
  });

  it('restores a full backup including evidence and reports', async () => {
    const session = await createGuide('Restorable project');
    const taskId = await addTask(session, 'Restore task');
    const stepId = await addStep(session, taskId, 'Restore evidence step');
    const runtimeBeforeBackup = await loadRuntimeSession(session);
    await recordRuntimeNote(session, runtimeBeforeBackup, stepId, 'Restored note');
    await session.db.runtimeBlobs.put({
      id: `${session.guideId}:capture-1`,
      guideId: session.guideId,
      path: 'capture-1',
      bytes: new Uint8Array([6, 5, 4]),
      mimeType: 'image/png',
      extension: 'png',
    });
    const { bytes, filename } = await exportFullBackup(session);
    expect(filename).toContain('-backup.gforge');
    expect(await getLastBackupAtIso(session.guideId)).toBeTruthy();

    await closeGuide(session);
    await session.db.evidence.clear();
    await session.db.assets.clear();
    await session.db.assetBlobs.clear();
    await session.db.runtimeBlobs.clear();

    const restored = await importDraft(bytes);
    expect(restored.warnings).toEqual([]);
    const evidence = await listEvidence(restored.guideId);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.value).toBe('Restored note');
    const restoredBlob = await session.db.runtimeBlobs.get(`${restored.guideId}:capture-1`);
    expect(Array.from(restoredBlob?.bytes as Uint8Array)).toEqual([6, 5, 4]);
    const reports = await session.db.reports.where('guideId').equals(restored.guideId).toArray();
    expect(reports.map((report) => report.path)).toEqual(
      expect.arrayContaining([
        'reports/cost.json',
        'reports/generation.json',
        'reports/restore.json',
        'reports/validation.json',
      ]),
    );
  });

  it('persists procedure runtime progress, typed evidence, attestation, and report export', async () => {
    const session = await createGuide('Procedure runtime');
    const taskId = await addTask(session, 'Run procedure');
    const stepId = await addStep(session, taskId, 'Verify the seal.');
    const runtime = await loadRuntimeSession(session);
    const withNote = await recordRuntimeNote(session, runtime, stepId, 'Seal is seated.');
    const withMeasurement = await recordRuntimeMeasurement(session, withNote.runtime, {
      stepId,
      label: 'Pressure',
      value: 1.25,
      unit: 'bar',
    });
    const withAttestation = await createRuntimeAttestation(
      session,
      withMeasurement.runtime,
      stepId,
    );
    const completed = await completeRuntimeStepForGuide(session, withAttestation.runtime, stepId);
    expect(completed.status).toBe('completed');
    expect(completed.completions[0]?.evidenceIds).toHaveLength(3);

    const report = await exportRuntimeCompletionReport(session, completed);
    expect(new TextDecoder().decode(report.bytes)).toContain('guideforge-procedure-completion');
    const stored = await session.db.runtimeSessions.get(completed.sessionId);
    expect(stored?.status).toBe('completed');
    const evidence = await listEvidence(session.guideId);
    expect(evidence.map((record) => record.kind)).toEqual(
      expect.arrayContaining(['note', 'measurement', 'signature']),
    );
    expect(
      evidence.find((record) => record.kind === 'signature')?.attestation?.signatureHex,
    ).toMatch(/^[0-9a-f]+$/);
    const backup = await exportFullBackup(session);
    await closeGuide(session);
    await session.db.runtimeSessions.clear();
    await session.db.runtimeBlobs.clear();
    const restored = await importDraft(backup.bytes);
    expect(await session.db.runtimeSessions.get(completed.sessionId)).toMatchObject({
      status: 'completed',
      guideId: session.guideId,
    });
    expect(
      await session.db.runtimeBlobs.get(`${session.guideId}:session-${completed.sessionId}`),
    ).toBeDefined();
    const restoredReport = await session.db.reports.get(
      `${session.guideId}:reports/runtime-completion-${completed.sessionId}.json`,
    );
    expect(restoredReport?.report).toMatchObject({
      reportType: 'guideforge-procedure-completion',
      status: 'completed',
      completedSteps: 1,
    });
    expect(restored.guideId).toBe(session.guideId);

    const restoredSession = await openGuide(restored.guideId);
    const restoredSignature = (await listEvidence(restored.guideId)).find(
      (record) => record.kind === 'signature',
    );
    const restoredArtifact = await restoredSession.assets.get(
      restoredSignature!.assetHash as ContentHash,
    );
    const artifact = JSON.parse(new TextDecoder().decode(restoredArtifact!)) as {
      payload: string;
      publicKeyJwk: JsonWebKey;
      signatureHex: string;
    };
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      artifact.publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const signatureBytes = Uint8Array.from(
      artifact.signatureHex.match(/../g)!.map((pair) => Number.parseInt(pair, 16)),
    );
    expect(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signatureBytes as unknown as BufferSource,
        new TextEncoder().encode(artifact.payload),
      ),
    ).toBe(true);
    await closeGuide(restoredSession);

    const tampered = unzipSync(backup.bytes);
    const evidencePath = 'runtime/evidence/index.json';
    const tamperedEvidence = JSON.parse(strFromU8(tampered[evidencePath]!)) as {
      attestation?: { signatureHex: string };
    }[];
    const tamperedSignature = tamperedEvidence.find((record) => record.attestation);
    tamperedSignature!.attestation!.signatureHex = `${tamperedSignature!.attestation!.signatureHex.slice(0, -2)}00`;
    const tamperedEvidenceBytes = strToU8(JSON.stringify(tamperedEvidence));
    tampered[evidencePath] = tamperedEvidenceBytes;
    const manifest = JSON.parse(strFromU8(tampered['manifest.json']!)) as {
      entries: { path: string; sha256: string; sizeBytes: number }[];
    };
    const evidenceEntry = manifest.entries.find((entry) => entry.path === evidencePath)!;
    const digest = await crypto.subtle.digest('SHA-256', tamperedEvidenceBytes);
    evidenceEntry.sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    evidenceEntry.sizeBytes = tamperedEvidenceBytes.length;
    tampered['manifest.json'] = strToU8(JSON.stringify(manifest));
    await expect(importDraft(zipSync(tampered, { level: 0 }))).rejects.toThrow(
      'invalid attestation evidence',
    );
  });
});
