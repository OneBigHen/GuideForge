import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  acceptProposal,
  addStep,
  addTask,
  closeGuide,
  createGuide,
  createProposal,
  generateProposals,
  listProposals,
} from './guideStore';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

describe('explicit-mode AI proposals', () => {
  it('generates pending proposals and accepts them via the command bus', async () => {
    const session = await createGuide('Proposal guide');
    const taskId = await addTask(session, 'Task one');
    await addStep(session, taskId, 'Do the careful thing.');

    const result = await generateProposals(session, { mode: 'offline' });
    const count = result.created;
    expect(count).toBeGreaterThan(0);
    const pending = (await listProposals(session.guideId)).filter((p) => p.status === 'pending');
    expect(pending.length).toBe(count);

    for (const p of pending) {
      await acceptProposal(session, p.proposalId);
    }
    const after = (await listProposals(session.guideId)).filter((p) => p.status === 'pending');
    expect(after.length).toBe(0);
    await closeGuide(session);
  });

  it('accepts an individually created proposal', async () => {
    const session = await createGuide('Single');
    const taskId = await addTask(session, 'T');
    const stepId = await addStep(session, taskId, 'Instruction');
    const proposalId = await createProposal({
      guideId: session.guideId,
      commandType: 'guide/add-tool',
      payload: { stepId, toolId: '11111111-1111-4111-8111-111111111111', name: 'Wrench' },
      summary: 'Add wrench',
      confidence: 0.5,
      sourceHash: null,
    });
    await acceptProposal(session, proposalId);
    const rows = await listProposals(session.guideId);
    expect(rows.find((r) => r.proposalId === proposalId)?.status).toBe('accepted');
    await closeGuide(session);
  });

  it('proposals retain citations and provider receipt (provenance not lost)', async () => {
    const session = await createGuide('Provenance');
    const taskId = await addTask(session, 'T');
    await addStep(session, taskId, 'Disconnect power before opening the housing.');

    const result = await generateProposals(session, { mode: 'offline' });
    const count = result.created;
    expect(count).toBeGreaterThan(0);
    const rows = await listProposals(session.guideId);
    // Every generated proposal must carry at least one citation and a receipt
    // with an explicit provider (the audit found citations/receipts were
    // dropped between generation and storage).
    for (const p of rows) {
      expect(p.citations.length).toBeGreaterThan(0);
      expect(p.receipt.provider.length).toBeGreaterThan(0);
      expect(p.sourceHash).toBeTruthy();
      expect(p.receipt.requestId.length).toBeGreaterThan(0);
    }
    await closeGuide(session);
  });
});
