import type { EntityId } from '@guideforge/domain';
import { createEmptyTraining, type AssessmentItem, type TrainingState } from './index.js';

const QTI_NAMESPACE = 'http://www.imsglobal.org/xsd/imsqtiasi_v3p0';
const QTI_TEMPLATE = 'https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct.xml';
const MAX_QTI_XML_BYTES = 2 * 1024 * 1024;

export interface QtiCompatibilityReport {
  standard: 'QTI 3.0';
  supportedItemIds: string[];
  unsupportedItemIds: string[];
  warnings: string[];
  errors: string[];
}

export interface QtiExportResult {
  files: Record<string, string>;
  compatibility: QtiCompatibilityReport;
}

export interface QtiImportResult {
  training: TrainingState;
  compatibility: QtiCompatibilityReport;
}

export interface Cmi5LaunchSeam {
  supported: false;
  courseId: string;
  auId: string;
  launchUrl: string;
  requiredLaunchParameters: ['endpoint', 'fetch', 'actor', 'registration'];
  warning: string;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function textEscape(value: string): string {
  return xmlEscape(value).replaceAll('\n', '&#10;');
}

function safeIdentifier(value: string): string {
  const id = value.replace(/[^A-Za-z0-9_.-]/g, '-');
  return /^[A-Za-z_]/.test(id) ? id : `item-${id}`;
}

function correctOptionId(item: AssessmentItem): string | null {
  const rule = item.scoringRule;
  if (Array.isArray(rule.correctOptionIds) && rule.correctOptionIds.length === 1) {
    return typeof rule.correctOptionIds[0] === 'string' ? rule.correctOptionIds[0] : null;
  }
  if (Array.isArray(rule.correct) && rule.correct.length === 1) {
    return typeof rule.correct[0] === 'string' ? rule.correct[0] : null;
  }
  return typeof rule.correctOptionId === 'string' ? rule.correctOptionId : null;
}

function supported(item: AssessmentItem): boolean {
  return (
    item.interaction === 'single-choice' &&
    correctOptionId(item) !== null &&
    item.options.length > 0
  );
}

function itemXml(item: AssessmentItem): string {
  const id = safeIdentifier(item.itemId);
  const correct = correctOptionId(item)!;
  const options = item.options
    .map(
      (option) =>
        `      <qti-simple-choice identifier="${xmlEscape(option.optionId)}">${textEscape(option.text)}</qti-simple-choice>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="${QTI_NAMESPACE}" identifier="${xmlEscape(id)}" title="${xmlEscape(item.prompt)}" adaptive="false" time-dependent="false">
  <qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="identifier">
    <qti-correct-response><qti-value>${xmlEscape(correct)}</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float" />
  <qti-item-body>
    <qti-choice-interaction response-identifier="RESPONSE" shuffle="false" max-choices="1">
      <qti-prompt>${textEscape(item.prompt)}</qti-prompt>
${options}
    </qti-choice-interaction>
  </qti-item-body>
  <qti-response-processing template="${QTI_TEMPLATE}" />
</qti-assessment-item>
`;
}

function assessmentTestXml(items: AssessmentItem[]): string {
  const refs = items
    .filter(supported)
    .map((item) => {
      const id = safeIdentifier(item.itemId);
      return `      <qti-assessment-item-ref identifier="ref-${id}" href="items/${id}.xml" />`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-test xmlns="${QTI_NAMESPACE}" identifier="guideforge-assessment" title="GuideForge assessment">
  <qti-test-part identifier="part-1" navigation-mode="linear" submission-mode="individual">
    <qti-assessment-section identifier="section-1" title="GuideForge training">
${refs}
    </qti-assessment-section>
  </qti-test-part>
</qti-assessment-test>
`;
}

function manifestXml(items: AssessmentItem[]): string {
  const supportedItems = items.filter(supported);
  const itemResources = supportedItems
    .map((item) => {
      const id = safeIdentifier(item.itemId);
      return `    <resource identifier="res-${id}" type="imsqti_item_xmlv3p0" href="items/${id}.xml"><file href="items/${id}.xml" /></resource>`;
    })
    .join('\n');
  const testFiles = supportedItems
    .map((item) => `      <file href="items/${safeIdentifier(item.itemId)}.xml" />`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" identifier="guideforge-qti">
  <metadata><schema>IMS Content</schema><schemaversion>1.1.3</schemaversion></metadata>
  <organizations><organization identifier="org-guideforge"><item identifier="test-ref" identifierref="res-test">GuideForge assessment</item></organization></organizations>
  <resources>
    <resource identifier="res-test" type="imsqti_test_xmlv3p0" href="assessment-test.xml">
      <file href="assessment-test.xml" />
${testFiles}
    </resource>
${itemResources}
  </resources>
</manifest>
`;
}

function newCompatibility(): QtiCompatibilityReport {
  return {
    standard: 'QTI 3.0',
    supportedItemIds: [],
    unsupportedItemIds: [],
    warnings: [],
    errors: [],
  };
}

export function exportQti3(training: TrainingState): QtiExportResult {
  const compatibility = newCompatibility();
  const files: Record<string, string> = {};
  const supportedItems: AssessmentItem[] = [];
  for (const item of training.assessmentItems) {
    if (supported(item)) {
      supportedItems.push(item);
      compatibility.supportedItemIds.push(item.itemId);
      files[`items/${safeIdentifier(item.itemId)}.xml`] = itemXml(item);
    } else {
      compatibility.unsupportedItemIds.push(item.itemId);
      compatibility.warnings.push(
        `Item ${item.itemId} was not exported: this adapter currently supports single-choice items with one correct option.`,
      );
    }
  }
  if (supportedItems.length === 0)
    compatibility.errors.push('No QTI-compatible assessment items were found.');
  files['assessment-test.xml'] = assessmentTestXml(training.assessmentItems);
  files['imsmanifest.xml'] = manifestXml(training.assessmentItems);
  return { files, compatibility };
}

function rejectUnsafeXml(xml: string): void {
  if (xml.length > MAX_QTI_XML_BYTES) throw new Error('QTI XML exceeds the import size limit');
  if (/<!(?:DOCTYPE|ENTITY)|<\?xml-stylesheet|javascript:/i.test(xml)) {
    throw new Error('QTI XML contains a forbidden external or active-content construct');
  }
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag);
  return match?.[2] ?? null;
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#10;', '\n')
    .replaceAll('&amp;', '&');
}

function textContent(value: string): string {
  return decodeXml(value.replace(/<[^>]*>/g, '')).trim();
}

function xmlFiles(input: string | Record<string, string>): string[] {
  if (typeof input === 'string') return [input];
  return Object.entries(input)
    .filter(([path]) => path.toLowerCase().endsWith('.xml'))
    .map(([, value]) => value);
}

/** Import the conservative QTI subset emitted by this adapter and report the ceiling. */
export function importQti3(input: string | Record<string, string>): QtiImportResult {
  const compatibility = newCompatibility();
  const items: AssessmentItem[] = [];
  for (const xml of xmlFiles(input)) {
    rejectUnsafeXml(xml);
    const itemMatches = xml.match(/<qti-assessment-item\b[\s\S]*?<\/qti-assessment-item>/gi) ?? [];
    for (const itemXmlText of itemMatches) {
      const openTag = /^<qti-assessment-item\b[^>]*>/i.exec(itemXmlText)?.[0];
      const identifier = openTag ? attribute(openTag, 'identifier') : null;
      if (!identifier) {
        compatibility.errors.push('QTI assessment item is missing an identifier.');
        continue;
      }
      const promptMatch = /<qti-prompt\b[^>]*>([\s\S]*?)<\/qti-prompt>/i.exec(itemXmlText);
      const choices = [
        ...itemXmlText.matchAll(/<qti-simple-choice\b([^>]*)>([\s\S]*?)<\/qti-simple-choice>/gi),
      ]
        .map((match) => ({
          optionId: attribute(match[1] ?? '', 'identifier'),
          text: textContent(match[2] ?? ''),
        }))
        .filter((choice): choice is { optionId: string; text: string } => Boolean(choice.optionId));
      const correctMatch =
        /<qti-correct-response\b[\s\S]*?<qti-value\b[^>]*>([\s\S]*?)<\/qti-value>[\s\S]*?<\/qti-correct-response>/i.exec(
          itemXmlText,
        );
      const correct = correctMatch ? textContent(correctMatch[1] ?? '') : '';
      if (!promptMatch || choices.length === 0 || !correct) {
        compatibility.unsupportedItemIds.push(identifier);
        compatibility.warnings.push(
          `Item ${identifier} could not be imported as a single-choice item.`,
        );
        continue;
      }
      const itemId = safeIdentifier(identifier) as EntityId;
      const objectiveId = `${itemId}-objective` as EntityId;
      items.push({
        itemId,
        objectiveId,
        prompt: textContent(promptMatch[1] ?? ''),
        interaction: 'single-choice',
        options: choices,
        scoringRule: { correctOptionIds: [decodeXml(correct)] },
        rationale: 'Imported from QTI; source grounding requires owner review.',
        feedback: {
          correct: 'Correct.',
          incorrect: 'Review the imported item and its source before retesting.',
        },
        citations: [],
        criticality: 'supporting',
        reviewState: 'draft',
      });
      compatibility.supportedItemIds.push(identifier);
    }
  }
  if (items.length === 0)
    compatibility.errors.push('No supported QTI 3 assessment items were found.');
  compatibility.warnings.push(
    'Imported QTI items have no GuideForge source citations until an owner maps them to canonical regions.',
  );
  const empty = createEmptyTraining();
  const objectiveIds = items.map((item) => item.objectiveId);
  const training: TrainingState = {
    ...empty,
    objectives: items.map((item) => ({
      objectiveId: item.objectiveId,
      verb: 'answer',
      target: item.prompt,
      conditions: 'Imported QTI delivery context.',
      criterion: 'Select the correct response.',
      stepIds: [],
      citations: [],
      criticality: item.criticality,
    })),
    assessmentItems: items,
    assessmentBlueprint: {
      blueprintId: 'qti-import-blueprint' as EntityId,
      title: 'Imported QTI assessment',
      objectiveIds,
      itemIds: items.map((item) => item.itemId),
      criticalItemIds: [],
      passThreshold: empty.mastery.passThreshold,
      maxAttempts: empty.mastery.maxAttempts,
      citations: [],
    },
    mastery: {
      ...empty.mastery,
      requiredObjectiveIds: objectiveIds,
    },
  };
  return { training, compatibility };
}

export function createCmi5LaunchSeam(
  guideId: string,
  baseUrl = 'https://guideforge.dev/cmi5',
): Cmi5LaunchSeam {
  return {
    supported: false,
    courseId: `guideforge-course-${guideId}`,
    auId: `guideforge-au-${guideId}`,
    launchUrl: `${baseUrl.replace(/\/$/, '')}/launch/${encodeURIComponent(guideId)}`,
    requiredLaunchParameters: ['endpoint', 'fetch', 'actor', 'registration'],
    warning: 'cmi5 launch metadata is a seam only; GuideForge does not act as an LMS or LRS.',
  };
}
