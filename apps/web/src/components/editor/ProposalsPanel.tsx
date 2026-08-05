import type { AiProposalRecord } from '@guideforge/storage-web';
import { useEffect, useState } from 'react';
import {
  acceptProposal,
  listProposals,
  rejectProposal,
  type OpenGuideSession,
} from '../../services/guideStore';

export function ProposalsPanel({
  session,
  onChanged,
  onClose,
}: {
  session: OpenGuideSession;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [proposals, setProposals] = useState<AiProposalRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setProposals(await listProposals(session.guideId));
  }

  useEffect(() => {
    let cancelled = false;
    void listProposals(session.guideId).then((rows) => {
      if (!cancelled) setProposals(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [session.guideId]);

  async function handleAccept(id: string) {
    try {
      await acceptProposal(session, id);
      await refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleReject(id: string) {
    await rejectProposal(id);
    await refresh();
  }

  const pending = proposals.filter((p) => p.status === 'pending');

  return (
    <div className="proposals-panel">
      <div className="proposals-panel__header">
        <h2>AI proposals</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close proposals"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {pending.length === 0 ? (
        <p className="empty-hint">No pending proposals.</p>
      ) : (
        <ul className="proposal-list">
          {pending.map((p) => (
            <li key={p.proposalId} className="proposal-card">
              <p className="proposal-card__summary">{p.summary}</p>
              <p className="proposal-card__meta">
                confidence {Math.round(p.confidence * 100)}% · {p.commandType}
                {' · provider '}
                <span
                  className={
                    p.receipt?.provider === 'deepseek'
                      ? 'provider-badge provider-badge--live'
                      : 'provider-badge'
                  }
                >
                  {providerLabel(p.receipt?.provider)}
                </span>
              </p>
              {p.citations.length > 0 && (
                <p className="proposal-card__citations">
                  {p.citations.length} source citation{p.citations.length === 1 ? '' : 's'} ·{' '}
                  {p.citations.map((c) => c.regionId).join(', ')}
                </p>
              )}
              <div className="proposal-card__actions">
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => void handleAccept(p.proposalId)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={() => void handleReject(p.proposalId)}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Human label for the provider that produced a proposal (explicit, honest). */
function providerLabel(provider: string | undefined): string {
  switch (provider) {
    case 'deepseek':
      return 'DeepSeek (live)';
    case 'fake':
      return 'offline deterministic';
    case 'none':
      return 'none';
    default:
      return provider && provider.length > 0 ? provider : 'unknown';
  }
}
