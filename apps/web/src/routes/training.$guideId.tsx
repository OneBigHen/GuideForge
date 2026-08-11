import { materializeSnapshot } from '@guideforge/collaboration';
import type {
  GuideSnapshot,
  TrainingAssessmentBlueprint,
  TrainingState,
} from '@guideforge/guide-schema';
import { generateTrainingFromProcedure, validateTrainingProgram } from '@guideforge/guide-schema';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import {
  closeGuide,
  openGuide,
  replaceTrainingProgram,
  reviewAssessmentItem,
  updateAssessmentItem,
  updateTrainingObjective,
  type OpenGuideSession,
} from '../services/guideStore';

export const Route = createFileRoute('/training/$guideId')({
  component: TrainingPage,
});

function citationLabel(citation: { sourceHash: string; regionId: string }): string {
  return `${citation.regionId} · ${citation.sourceHash.slice(0, 10)}…`;
}

function TrainingQuality({ snapshot }: { snapshot: GuideSnapshot }) {
  const report = validateTrainingProgram(snapshot.training, snapshot);
  return (
    <section
      className={`training-quality ${report.ok ? 'training-quality--pass' : ''}`}
      aria-label="Training quality report"
    >
      <div className="training-quality__header">
        <div>
          <h2>Grounding and coverage</h2>
          <p className="empty-hint">
            {report.ok
              ? 'Ready for owner review.'
              : 'Not ready: resolve the reported gaps before release.'}
          </p>
        </div>
        <strong>{report.ok ? 'PASS' : 'REVIEW'}</strong>
      </div>
      <div className="training-metrics">
        <span>{report.coverage.objectives} objectives</span>
        <span>{report.coverage.sourceGroundedObjectives} source-grounded</span>
        <span>{report.coverage.assessmentItems} items</span>
        <span>{report.coverage.reviewedItems} reviewed</span>
        <span>
          {report.coverage.linkedSteps}/{report.coverage.procedureSteps} steps linked
        </span>
      </div>
      {report.issues.length > 0 && (
        <ul className="training-issues">
          {report.issues.map((item, index) => (
            <li key={`${item.code}-${item.entityId ?? 'program'}-${index}`}>
              <strong>{item.severity}</strong> · {item.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BlueprintCard({ blueprint }: { blueprint: TrainingAssessmentBlueprint }) {
  return (
    <section className="training-panel" aria-labelledby="blueprint-title">
      <div className="training-panel__header">
        <div>
          <h2 id="blueprint-title">Assessment blueprint</h2>
          <p className="empty-hint">{blueprint.title}</p>
        </div>
        <span className="training-badge">
          {Math.round(blueprint.passThreshold * 100)}% · {blueprint.maxAttempts} attempts
        </span>
      </div>
      <p>
        {blueprint.itemIds.length} item{blueprint.itemIds.length === 1 ? '' : 's'} ·{' '}
        {blueprint.criticalItemIds.length} critical · {blueprint.objectiveIds.length} objectives
      </p>
      <p className="training-citations">
        {blueprint.citations.map(citationLabel).join(' · ') || 'No source citations yet'}
      </p>
    </section>
  );
}

function TrainingPage() {
  const { guideId } = Route.useParams();
  const [session, setSession] = useState<OpenGuideSession | null>(null);
  const [snapshot, setSnapshot] = useState<GuideSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback((nextSession: OpenGuideSession) => {
    setSnapshot(materializeSnapshot(nextSession.working));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sessionRef: OpenGuideSession | null = null;
    void (async () => {
      try {
        const nextSession = await openGuide(guideId);
        if (cancelled) {
          await closeGuide(nextSession);
          return;
        }
        sessionRef = nextSession;
        setSession(nextSession);
        refresh(nextSession);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      if (sessionRef) void closeGuide(sessionRef);
    };
  }, [guideId, refresh]);

  async function mutate(action: () => Promise<void>, success?: string): Promise<void> {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh(session);
      if (success) setNotice(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!session || !snapshot) return;
    const result = generateTrainingFromProcedure(snapshot);
    await mutate(
      () => replaceTrainingProgram(session, result.training),
      result.quality.ok
        ? 'Generated a source-grounded training draft.'
        : 'Generated a draft; review the quality report before accepting it.',
    );
  }

  const training: TrainingState | null = snapshot?.training ?? null;

  return (
    <section className="training-layout" aria-labelledby="training-title">
      <header className="training-header">
        <div>
          <Link
            to="/edit/$guideId"
            params={{ guideId }}
            className="button button--ghost button--small"
          >
            ← Editor
          </Link>
          <h1 id="training-title">Training studio</h1>
          <p className="empty-hint">{snapshot?.title ?? 'Loading guide…'}</p>
        </div>
        <div className="training-header__actions">
          <Link
            to="/sources/$guideId"
            params={{ guideId }}
            className="button button--ghost button--small"
          >
            Source Studio
          </Link>
          <Link
            to="/run/$guideId"
            params={{ guideId }}
            className="button button--ghost button--small"
          >
            Procedure player
          </Link>
          <button
            type="button"
            className="button"
            onClick={() => void generate()}
            disabled={busy || !snapshot}
          >
            {busy ? 'Saving…' : 'Generate from procedure'}
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="release-note">
          {notice}
        </p>
      )}

      {snapshot && training ? (
        <>
          <TrainingQuality snapshot={snapshot} />

          <section className="training-panel" aria-labelledby="competencies-title">
            <div className="training-panel__header">
              <div>
                <h2 id="competencies-title">Competencies and modules</h2>
                <p className="empty-hint">
                  Each competency is linked to measurable procedure objectives.
                </p>
              </div>
              <span className="training-badge">
                {(training.competencies ?? []).length} competencies
              </span>
            </div>
            <div className="training-card-grid">
              {(training.competencies ?? []).map((competency) => (
                <article className="training-card" key={competency.competencyId}>
                  <h3>{competency.title}</h3>
                  <p>{competency.description}</p>
                  <p className="training-card__meta">
                    {competency.objectiveIds.length} objectives · {competency.criticality}
                  </p>
                  <p className="training-citations">
                    {competency.citations.map(citationLabel).join(' · ') || 'No source citations'}
                  </p>
                </article>
              ))}
              {(training.competencies ?? []).length === 0 && (
                <p className="empty-hint">
                  Generate a draft from the procedure to create competencies.
                </p>
              )}
            </div>
          </section>

          <section className="training-panel" aria-labelledby="objectives-title">
            <div className="training-panel__header">
              <div>
                <h2 id="objectives-title">Measurable objectives</h2>
                <p className="empty-hint">
                  Edit fields directly; changes remain canonical and collaborative.
                </p>
              </div>
              <span className="training-badge">{training.objectives.length} objectives</span>
            </div>
            <div className="training-objectives">
              {training.objectives.map((objective) => (
                <article className="training-objective" key={objective.objectiveId}>
                  <div className="training-objective__meta">
                    <span>{objective.criticality}</span>
                    <span>
                      {objective.stepIds.length} linked step
                      {objective.stepIds.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <label className="field">
                    Verb
                    <input
                      defaultValue={objective.verb}
                      onBlur={(event) =>
                        void mutate(() =>
                          updateTrainingObjective(session!, objective.objectiveId, {
                            verb: event.currentTarget.value,
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    Target
                    <input
                      defaultValue={objective.target}
                      onBlur={(event) =>
                        void mutate(() =>
                          updateTrainingObjective(session!, objective.objectiveId, {
                            target: event.currentTarget.value,
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    Criterion
                    <textarea
                      defaultValue={objective.criterion}
                      onBlur={(event) =>
                        void mutate(() =>
                          updateTrainingObjective(session!, objective.objectiveId, {
                            criterion: event.currentTarget.value,
                          }),
                        )
                      }
                    />
                  </label>
                  <p className="training-citations">
                    {objective.citations.map(citationLabel).join(' · ') || 'No source citations'}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {training.assessmentBlueprint && (
            <BlueprintCard blueprint={training.assessmentBlueprint} />
          )}

          <section className="training-panel" aria-labelledby="items-title">
            <div className="training-panel__header">
              <div>
                <h2 id="items-title">Item bank and review</h2>
                <p className="empty-hint">
                  Answer keys, rationales, and feedback stay visible for owner review.
                </p>
              </div>
              <span className="training-badge">{training.assessmentItems.length} items</span>
            </div>
            <div className="training-items">
              {training.assessmentItems.map((item) => (
                <article className="training-item" key={item.itemId}>
                  <div className="training-item__header">
                    <div>
                      <h3>{item.prompt}</h3>
                      <span className={`training-review training-review--${item.reviewState}`}>
                        {item.reviewState}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="button button--small"
                      onClick={() =>
                        void mutate(() =>
                          reviewAssessmentItem(
                            session!,
                            item.itemId,
                            item.reviewState === 'reviewed' ? 'draft' : 'reviewed',
                          ),
                        )
                      }
                    >
                      {item.reviewState === 'reviewed' ? 'Return to draft' : 'Mark reviewed'}
                    </button>
                  </div>
                  <label className="field">
                    Prompt
                    <textarea
                      defaultValue={item.prompt}
                      onBlur={(event) =>
                        void mutate(() =>
                          updateAssessmentItem(session!, item.itemId, {
                            prompt: event.currentTarget.value,
                          }),
                        )
                      }
                    />
                  </label>
                  <p>
                    <strong>Answer key:</strong>{' '}
                    {item.options.find((option) =>
                      (item.scoringRule.correctOptionIds as string[] | undefined)?.includes(
                        option.optionId,
                      ),
                    )?.text ?? 'See scoring rule'}
                  </p>
                  <label className="field">
                    Rationale
                    <textarea
                      defaultValue={item.rationale}
                      onBlur={(event) =>
                        void mutate(() =>
                          updateAssessmentItem(session!, item.itemId, {
                            rationale: event.currentTarget.value,
                          }),
                        )
                      }
                    />
                  </label>
                  <p className="training-feedback">
                    <strong>Correct:</strong> {item.feedback?.correct ?? 'Not authored'}
                  </p>
                  <p className="training-feedback">
                    <strong>Incorrect:</strong> {item.feedback?.incorrect ?? 'Not authored'}
                  </p>
                  <p className="training-citations">
                    {item.citations.map(citationLabel).join(' · ') || 'No source citations'}
                  </p>
                </article>
              ))}
              {training.assessmentItems.length === 0 && (
                <p className="empty-hint">No assessment items yet.</p>
              )}
            </div>
          </section>

          <section className="training-panel" aria-labelledby="path-title">
            <div className="training-panel__header">
              <div>
                <h2 id="path-title">Lessons, practice, and remediation</h2>
                <p className="empty-hint">
                  The generated path links procedure steps to practice and retry activities.
                </p>
              </div>
              <span className="training-badge">
                {(training.activities ?? []).length} activities
              </span>
            </div>
            <div className="training-card-grid">
              {training.lessons.map((lesson) => (
                <article className="training-card" key={lesson.lessonId}>
                  <h3>{lesson.title}</h3>
                  <p>
                    {lesson.activityIds?.length ?? 0} activities · {lesson.stepIds.length} procedure
                    steps
                  </p>
                  <ul className="training-link-list">
                    {(training.activities ?? [])
                      .filter((activity) => activity.lessonId === lesson.lessonId)
                      .map((activity) => (
                        <li key={activity.activityId}>
                          {activity.type}: {activity.title}
                        </li>
                      ))}
                  </ul>
                </article>
              ))}
            </div>
            <div className="training-remediation">
              <h3>Remediation graph</h3>
              <ul className="training-link-list">
                {(training.remediationEdges ?? []).map((edge) => (
                  <li key={edge.edgeId}>
                    {edge.trigger}: item {edge.fromItemId} → activity {edge.toActivityId}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      ) : (
        <p className="empty-hint" role="status">
          Loading training studio…
        </p>
      )}
    </section>
  );
}
