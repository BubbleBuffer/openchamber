export { createSessionActorKey, parseSessionActorKey } from './machine/actorKey.js'
export type { SessionActorKey, SessionActorIdentity } from './machine/actorKey.js'

export type {
  SessionMachineContext,
  SessionMessageRecord,
  SessionPartRecord,
  SessionPermissionRecord,
  SessionQuestionRecord,
  SessionFatalError,
  SessionHistoryState,
  SessionRetryState,
  SessionErrorState,
  CreateInitialSessionContextInput,
} from './machine/context.js'

export { createInitialSessionContext } from './machine/context.js'

export type { SessionDomainEvent } from './machine/events.js'

export type { SessionMachineEffect } from './machine/effects.js'

export type {
  SessionSnapshotV1,
  SessionRetrySnapshot,
  SessionErrorSnapshot,
  SessionHistorySnapshot,
} from './machine/snapshots.js'

export {
  SESSION_SNAPSHOT_VERSION,
  createSessionSnapshot,
  validateSessionSnapshotV1,
  assertSerializableSnapshot,
  createContextFromSnapshot,
  restoreSessionMachineSnapshot,
} from './machine/snapshots.js'

export {
  assertSessionEventIdentityMatchesContext,
  assertNormalizedReferences,
  createFatalInvariantFailure,
} from './machine/invariants.js'

export {
  selectIsStreaming,
  selectIsWorking,
  selectNeedsAttention,
  selectHasBlockingInterruption,
  selectCanLoadOlder,
  selectRetrySnapshot,
  selectHistorySnapshot,
  selectMessageOrder,
  selectMessageById,
  selectPartById,
  selectStreamingMessageId,
  selectSessionSnapshot,
} from './machine/selectors.js'

export { createSessionMachine } from './machine/sessionMachine.js'
export { createActor } from 'xstate'
