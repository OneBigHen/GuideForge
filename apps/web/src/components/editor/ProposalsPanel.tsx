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
                confidence {Math.round(p.confidence * 100)}% · {commandLabel(p.commandType)}
                {' · provider '}
                <span
                  className={
                    p.receipt.provider === 'deepseek' || p.receipt.provider === 'openrouter'
                      ? 'provider-badge provider-badge--live'
                      : 'provider-badge'
                  }
                >
                  {providerLabel(p.receipt.provider)}
                </span>
              </p>
              {receiptLine(p.receipt) && (
                <p className="proposal-card__detail">{receiptLine(p.receipt)}</p>
              )}
              {proposalDetail(p).length > 0 && (
                <p className="proposal-card__detail">{proposalDetail(p)}</p>
              )}
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
    case 'openrouter':
      return 'OpenRouter (live)';
    case 'fake':
      return 'offline deterministic';
    case 'synthesis-local':
      return 'source-grounded local';
    case 'none':
      return 'none';
    default:
      return provider && provider.length > 0 ? provider : 'unknown';
  }
}

/**
 * Visible generation receipt: what ran, what it cost, and which request it
 * was. Provider billing metadata is shown only when the server reported it;
 * it is never invented client-side.
 */
function receiptLine(receipt: AiProposalRecord['receipt']): string {
  const parts = [
    `AI: ${providerLabel(receipt.provider)}`,
    receipt.model ? `· ${receipt.model}` : null,
    `· in ${receipt.inputTokens} tok · out ${receipt.outputTokens} tok`,
    typeof receipt.providerCostUsd === 'number'
      ? `· cost $${receipt.providerCostUsd.toFixed(4)}`
      : null,
    receipt.requestId ? `· req ${receipt.requestId.slice(0, 8)}` : null,
  ];
  return parts.filter((part): part is string => part !== null).join(' ');
}

const COMMAND_LABELS: Record<string, string> = {
  'guide/add-task': 'Create task',
  'guide/add-step': 'Create step',
  'guide/add-warning': 'Add safety warning',
  'guide/add-tool': 'Add tool',
  'guide/add-part': 'Add part',
  'guide/add-value': 'Set value',
  'guide/add-condition': 'Add condition',
  'guide/add-verification': 'Add verification',
  'guide/remove-value': 'Remove value',
  'guide/remove-condition': 'Remove condition',
  'guide/remove-verification': 'Remove verification',
};

function commandLabel(commandType: string): string {
  return COMMAND_LABELS[commandType] ?? commandType;
}

/** Compact, human-readable detail for the proposal payload. */
function proposalDetail(p: AiProposalRecord): string {
  const payload = p.payload;
  switch (p.commandType) {
    case 'guide/add-value': {
      const label = stringField(payload, 'label');
      const unit = stringField(payload, 'unit');
      return unit ? `${label} (${unit})` : label;
    }
    case 'guide/add-warning': {
      const severity = stringField(payload, 'severity');
      return severity && severity !== 'warning' ? `severity: ${severity}` : '';
    }
    case 'guide/add-tool':
    case 'guide/add-part':
    case 'guide/add-condition':
    case 'guide/add-verification':
    case 'guide/add-task':
    case 'guide/add-step': {
      const detail =
        stringField(payload, 'name') ??
        stringField(payload, 'title') ??
        stringField(payload, 'text') ??
        stringField(payload, 'message') ??
        stringField(payload, 'action');
      return detail;
    }
    default:
      return '';
  }
}

/** Read a string field from an unknown payload without base-to-string. */
function stringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}
