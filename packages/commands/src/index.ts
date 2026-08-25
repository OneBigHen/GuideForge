/**
 * @guideforge/commands — typed command bus for guide mutations.
 *
 * Every guide mutation is a command with stable identity, actor, origin,
 * timestamp, and typed payload. Commands are pure: they validate preconditions
 * and return a deterministic change description. Applying commands to a
 * document is handled by the collaboration/storage layer.
 *
 * Framework-independent: no React/Three/Yjs/Dexie/Node/db imports.
 */
import type { CommandOrigin, EntityId } from '@guideforge/domain';

export interface GuideCommand<T = unknown> {
  commandId: string;
  commandType: string;
  actorId: string;
  guideId: EntityId;
  origin: CommandOrigin;
  occurredAt: string;
  payload: T;
}

/** A command that fails its precondition is rejected before any mutation. */
export class CommandPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandPreconditionError';
  }
}

export interface CommandHandler<TState, TPayload> {
  commandType: string;
  /** Pure check; must not mutate state. */
  precondition: (state: TState, command: GuideCommand<TPayload>) => string | null;
  /** Pure projection of the change for audit/undo metadata. */
  describe: (command: GuideCommand<TPayload>) => string;
}

export interface CommandRegistry<TState> {
  handlers: Map<string, CommandHandler<TState, unknown>>;
}

export function createRegistry<TState>(): CommandRegistry<TState> {
  return { handlers: new Map() };
}

export function registerHandler<TState, TPayload>(
  registry: CommandRegistry<TState>,
  handler: CommandHandler<TState, TPayload>,
): void {
  if (registry.handlers.has(handler.commandType)) {
    throw new Error(`duplicate command handler: ${handler.commandType}`);
  }
  registry.handlers.set(handler.commandType, handler as CommandHandler<TState, unknown>);
}

/**
 * Validate a command against the registry. Returns the command's semantic
 * description on success; throws CommandPreconditionError on precondition
 * failure or unknown type.
 */
export function validateCommand<TState>(
  registry: CommandRegistry<TState>,
  state: TState,
  command: GuideCommand,
): string {
  const handler = registry.handlers.get(command.commandType);
  if (!handler) {
    throw new CommandPreconditionError(`unknown command type: ${command.commandType}`);
  }
  const failure = handler.precondition(state, command);
  if (failure !== null) {
    throw new CommandPreconditionError(failure);
  }
  return handler.describe(command);
}

export function isGuideCommand(value: unknown): value is GuideCommand {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.commandId === 'string' &&
    typeof v.commandType === 'string' &&
    typeof v.actorId === 'string' &&
    typeof v.guideId === 'string' &&
    typeof v.occurredAt === 'string' &&
    typeof v.payload === 'object' &&
    v.payload !== null
  );
}

export { findTask, GUIDE_COMMAND_TYPES } from './guide-commands.js';
export type {
  AddAssessmentItemPayload,
  AddConditionPayload,
  AddObjectivePayload,
  AddStepMediaPayload,
  AddStepPayload,
  AddTaskPayload,
  AddValuePayload,
  AddVerificationPayload,
  GuideCommandPayloads,
  RemoveConditionPayload,
  RemoveStepPayload,
  RemoveTaskPayload,
  RemoveValuePayload,
  RemoveVerificationPayload,
  RenameTaskPayload,
  ReorderTasksPayload,
  ReplaceTrainingPayload,
  ReviewAssessmentItemPayload,
  UpdateAssessmentItemPayload,
  UpdateTrainingObjectivePayload,
} from './guide-commands.js';
export { applyCommands, applyGuideCommand, freshGuideState } from './guide-reducer.js';
