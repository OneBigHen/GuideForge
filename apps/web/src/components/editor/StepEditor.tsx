import type { GuideStep } from '@guideforge/guide-schema';
import { useState } from 'react';
import {
  addPart,
  addTool,
  addWarning,
  removePart,
  removeTool,
  removeWarning,
  setStepText,
  type OpenGuideSession,
} from '../../services/guideStore';

export function StepEditor({
  session,
  step,
  onChanged,
}: {
  session: OpenGuideSession;
  step: GuideStep;
  onChanged: () => void;
}) {
  const [text, setText] = useState(step.instructionText);
  const [warning, setWarning] = useState('');
  const [tool, setTool] = useState('');
  const [partName, setPartName] = useState('');
  const [partQty, setPartQty] = useState(1);

  async function run(fn: () => Promise<unknown>) {
    await fn();
    onChanged();
  }

  return (
    <div className="step-editor">
      <h2>Step</h2>
      <label className="field">
        <span>Instruction</span>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text !== step.instructionText)
              void run(() => setStepText(session, step.stepId, text));
          }}
        />
      </label>

      {/* Warnings */}
      <section className="step-section" aria-labelledby="warnings-title">
        <h3 id="warnings-title">Warnings</h3>
        <ul className="warn-list">
          {step.warnings.map((w) => (
            <li key={w.warningId} className={`warn warn--${w.severity}`}>
              <span>{w.message}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Remove warning"
                onClick={() => void run(() => removeWarning(session, step.stepId, w.warningId))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="field-row">
          <input
            type="text"
            value={warning}
            onChange={(e) => setWarning(e.target.value)}
            placeholder="Add a warning"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && warning.trim()) {
                void run(() => addWarning(session, step.stepId, 'warning', warning.trim())).then(
                  () => setWarning(''),
                );
              }
            }}
          />
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              if (!warning.trim()) return;
              void run(() => addWarning(session, step.stepId, 'warning', warning.trim())).then(() =>
                setWarning(''),
              );
            }}
          >
            Add
          </button>
        </div>
      </section>

      {/* Tools */}
      <section className="step-section" aria-labelledby="tools-title">
        <h3 id="tools-title">Tools</h3>
        <ul className="chip-list">
          {step.tools.map((t) => (
            <li key={t.toolId} className="chip">
              {t.name}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove tool ${t.name}`}
                onClick={() => void run(() => removeTool(session, step.stepId, t.toolId))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="field-row">
          <input
            type="text"
            value={tool}
            onChange={(e) => setTool(e.target.value)}
            placeholder="Add a tool"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tool.trim()) {
                void run(() => addTool(session, step.stepId, tool.trim())).then(() => setTool(''));
              }
            }}
          />
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              if (!tool.trim()) return;
              void run(() => addTool(session, step.stepId, tool.trim())).then(() => setTool(''));
            }}
          >
            Add
          </button>
        </div>
      </section>

      {/* Parts */}
      <section className="step-section" aria-labelledby="parts-title">
        <h3 id="parts-title">Parts</h3>
        <ul className="chip-list">
          {step.parts.map((p) => (
            <li key={p.partId} className="chip">
              {p.name} × {p.quantity}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove part ${p.name}`}
                onClick={() => void run(() => removePart(session, step.stepId, p.partId))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="field-row">
          <input
            type="text"
            value={partName}
            onChange={(e) => setPartName(e.target.value)}
            placeholder="Part name"
          />
          <input
            type="number"
            min={1}
            value={partQty}
            onChange={(e) => setPartQty(Number(e.target.value) || 1)}
            aria-label="Quantity"
            className="input-number"
          />
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              if (!partName.trim()) return;
              void run(() => addPart(session, step.stepId, partName.trim(), partQty)).then(() => {
                setPartName('');
                setPartQty(1);
              });
            }}
          >
            Add
          </button>
        </div>
      </section>
    </div>
  );
}
