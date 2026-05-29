export { createSessionActorKey, parseSessionActorKey } from './machine/actorKey'
export type { SessionActorKey, SessionActorIdentity } from './machine/actorKey'

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
} from './machine/context'

export { createInitialSessionContext } from './machine/context'

export type { SessionDomainEvent } from './machine/events'

export type { SessionMachineEffect } from './machine/effects'

export type {
  SessionSnapshotV1,
  SessionRetrySnapshot,
  SessionErrorSnapshot,
  SessionHistorySnapshot,
} from './machine/snapshots'

export {
  SESSION_SNAPSHOT_VERSION,
  createSessionSnapshot,
  validateSessionSnapshotV1,
  assertSerializableSnapshot,
  createContextFromSnapshot,
  restoreSessionMachineSnapshot,
} from './machine/snapshots'

export {
  assertSessionEventIdentityMatchesContext,
  assertNormalizedReferences,
  createFatalInvariantFailure,
} from './machine/invariants'

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
} from './machine/selectors'

export { createSessionMachine } from './machine/sessionMachine'
