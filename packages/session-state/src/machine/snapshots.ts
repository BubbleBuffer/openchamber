import type {
  SessionMessageRecord,
  SessionPartRecord,
  SessionPermissionRecord,
  SessionQuestionRecord,
  SessionFatalError,
} from './context'

// ---------------------------------------------------------------------------
// Version constant
// ---------------------------------------------------------------------------

export const SESSION_SNAPSHOT_VERSION = 1

// ---------------------------------------------------------------------------
// Sub-domain snapshot interfaces
// ---------------------------------------------------------------------------

export interface SessionRetrySnapshot {
  retryMessage: string | null
  retryCount: number
  retryCooldownUntil: number | null
}

export interface SessionErrorSnapshot {
  errorType: string | null
  fatalError: SessionFatalError | null
}

export interface SessionHistorySnapshot {
  isLoadingOlder: boolean
  hasMoreAbove: boolean
  oldestLoadedMessageId: string | null
  newestLoadedMessageId: string | null
  historyLoadError: string | null
}

// ---------------------------------------------------------------------------
// Top-level snapshot interface
// ---------------------------------------------------------------------------

export interface SessionSnapshotV1 {
  version: 1
  key: { directory: string; sessionId: string }
  identity: { projectId: string | null; parentSessionId: string | null; exists: boolean; loaded: boolean }
  regions: { lifecycle: string; activity: string; interruptions: string; history: string; retry: string; error: string }
  domain: {
    messageOrder: string[]
    messagesById: Record<string, SessionMessageRecord>
    partsByMessageId: Record<string, string[]>
    partsById: Record<string, SessionPartRecord>
    streamingMessageId: string | null
    streamingPartId: string | null
    permissionsById: Record<string, SessionPermissionRecord>
    questionsById: Record<string, SessionQuestionRecord>
    retry: SessionRetrySnapshot
    error: SessionErrorSnapshot
    history: SessionHistorySnapshot
  }
  meta: { revision: number; updatedAt: number; sourceEventId: string | null; hydratedAt: number | null }
}

// ---------------------------------------------------------------------------
// Snapshot creation
// ---------------------------------------------------------------------------

export function createSessionSnapshot(
  context: import('./context').SessionMachineContext,
  regions: Record<string, string>,
  hydratedAt: number,
): SessionSnapshotV1 {
  return {
    version: SESSION_SNAPSHOT_VERSION,
    key: {
      directory: context.directory,
      sessionId: context.sessionId,
    },
    identity: {
      projectId: context.projectId,
      parentSessionId: context.parentSessionId,
      exists: context.exists,
      loaded: context.loaded,
    },
    regions: {
      lifecycle: regions['lifecycle'] ?? 'unknown',
      activity: regions['activity'] ?? 'unknown',
      interruptions: regions['interruptions'] ?? 'unknown',
      history: regions['history'] ?? 'unknown',
      retry: regions['retry'] ?? 'unknown',
      error: regions['error'] ?? 'unknown',
    },
    domain: {
      messageOrder: context.messageOrder,
      messagesById: context.messagesById,
      partsByMessageId: context.partsByMessageId,
      partsById: context.partsById,
      streamingMessageId: context.streamingMessageId,
      streamingPartId: context.streamingPartId,
      permissionsById: context.permissionsById,
      questionsById: context.questionsById,
      retry: {
        retryMessage: context.retryMessage,
        retryCount: context.retryCount,
        retryCooldownUntil: context.retryCooldownUntil,
      },
      error: {
        errorType: context.errorType,
        fatalError: context.fatalError,
      },
      history: {
        isLoadingOlder: context.isLoadingOlder,
        hasMoreAbove: context.hasMoreAbove,
        oldestLoadedMessageId: context.oldestLoadedMessageId,
        newestLoadedMessageId: context.newestLoadedMessageId,
        historyLoadError: context.historyLoadError,
      },
    },
    meta: {
      revision: context.revision,
      updatedAt: context.updatedAt,
      sourceEventId: context.sourceEventId,
      hydratedAt,
    },
  }
}

// ---------------------------------------------------------------------------
// Snapshot validation
// ---------------------------------------------------------------------------

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function isString(val: unknown): val is string {
  return typeof val === 'string'
}

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val)
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((v) => typeof v === 'string')
}

export function validateSessionSnapshotV1(snapshot: unknown): SessionSnapshotV1 {
  if (!isPlainObject(snapshot)) {
    throw new Error('snapshot must be a plain object')
  }

  // version
  if (snapshot.version !== SESSION_SNAPSHOT_VERSION) {
    throw new Error(`snapshot version must be ${SESSION_SNAPSHOT_VERSION}, got ${snapshot.version}`)
  }

  // key
  const key = snapshot.key
  if (!isPlainObject(key)) throw new Error('snapshot.key must be a plain object')
  if (!isString(key.directory)) throw new Error('snapshot.key.directory must be a string')
  if (!key.directory) throw new Error('snapshot.key.directory must be non-empty')
  if (!isString(key.sessionId)) throw new Error('snapshot.key.sessionId must be a string')
  if (!key.sessionId) throw new Error('snapshot.key.sessionId must be non-empty')

  // identity
  const identity = snapshot.identity
  if (!isPlainObject(identity)) throw new Error('snapshot.identity must be a plain object')
  if (identity.projectId !== null && (typeof identity.projectId !== 'string' || !identity.projectId)) {
    throw new Error('snapshot.identity.projectId must be string | null or non-empty string')
  }
  if (identity.parentSessionId !== null && (typeof identity.parentSessionId !== 'string' || !identity.parentSessionId)) {
    throw new Error('snapshot.identity.parentSessionId must be string | null or non-empty string')
  }
  if (typeof identity.exists !== 'boolean') throw new Error('snapshot.identity.exists must be a boolean')
  if (typeof identity.loaded !== 'boolean') throw new Error('snapshot.identity.loaded must be a boolean')

  // regions
  const regions = snapshot.regions
  if (!isPlainObject(regions)) throw new Error('snapshot.regions must be a plain object')
  const regionKeys = ['lifecycle', 'activity', 'interruptions', 'history', 'retry', 'error'] as const
  for (const k of regionKeys) {
    if (!isString(regions[k])) throw new Error(`snapshot.regions.${k} must be a string`)
  }

  // domain
  const domain = snapshot.domain
  if (!isPlainObject(domain)) throw new Error('snapshot.domain must be a plain object')

  if (!isStringArray(domain.messageOrder)) {
    throw new Error('snapshot.domain.messageOrder must be a string array')
  }

  if (!isPlainObject(domain.messagesById)) {
    throw new Error('snapshot.domain.messagesById must be a plain object')
  }
  for (const [msgId, msg] of Object.entries(domain.messagesById)) {
    if (!isPlainObject(msg)) throw new Error(`messagesById['${msgId}'] must be a plain object`)
    if (!isString(msg.id)) throw new Error(`messagesById['${msgId}'].id must be a string`)
    if (!isString(msg.role)) throw new Error(`messagesById['${msgId}'].role must be a string`)
    if (!isString(msg.sessionId)) throw new Error(`messagesById['${msgId}'].sessionId must be a string`)
    if (!isFiniteNumber(msg.createdAt)) throw new Error(`messagesById['${msgId}'].createdAt must be a finite number`)
    if (msg.parentId !== null && !isString(msg.parentId)) throw new Error(`messagesById['${msgId}'].parentId must be string | null`)
    if (msg.model !== null && !isString(msg.model)) throw new Error(`messagesById['${msgId}'].model must be string | null`)
    if (msg.agent !== null && !isString(msg.agent)) throw new Error(`messagesById['${msgId}'].agent must be string | null`)
    if (msg.provider !== null && !isString(msg.provider)) throw new Error(`messagesById['${msgId}'].provider must be string | null`)
    if (msg.cost !== null && !isFiniteNumber(msg.cost)) throw new Error(`messagesById['${msgId}'].cost must be number | null`)
    if (msg.tokens !== null && !isFiniteNumber(msg.tokens)) throw new Error(`messagesById['${msgId}'].tokens must be number | null`)
    if (msg.error !== null && !isString(msg.error)) throw new Error(`messagesById['${msgId}'].error must be string | null`)
  }

  if (!isPlainObject(domain.partsByMessageId)) {
    throw new Error('snapshot.domain.partsByMessageId must be a plain object')
  }
  for (const [msgId, partIds] of Object.entries(domain.partsByMessageId)) {
    if (!Array.isArray(partIds)) throw new Error(`partsByMessageId['${msgId}'] must be an array`)
    for (const pid of partIds) {
      if (!isString(pid)) throw new Error(`partsByMessageId['${msgId}'] must contain only strings`)
    }
  }

  if (!isPlainObject(domain.partsById)) {
    throw new Error('snapshot.domain.partsById must be a plain object')
  }
  const msgIds = new Set(Object.keys(domain.messagesById))
  for (const [partId, part] of Object.entries(domain.partsById)) {
    if (!isPlainObject(part)) throw new Error(`partsById['${partId}'] must be a plain object`)
    if (!isString(part.id)) throw new Error(`partsById['${partId}'].id must be a string`)
    if (!isString(part.messageId)) throw new Error(`partsById['${partId}'].messageId must be a string`)
    if (!msgIds.has(part.messageId)) {
      throw new Error(`partsById['${partId}'].messageId '${part.messageId}' does not exist in messagesById`)
    }
    if (!isString(part.type)) throw new Error(`partsById['${partId}'].type must be a string`)
    if (part.type === 'text') {
      if (!isString(part.text)) throw new Error(`partsById['${partId}'].text must be a string`)
    } else if (part.type === 'tool') {
      if (!isString(part.toolName)) throw new Error(`partsById['${partId}'].toolName must be a string`)
      if (!isString(part.toolCallId)) throw new Error(`partsById['${partId}'].toolCallId must be a string`)
      if (part.toolState !== null && !isString(part.toolState)) throw new Error(`partsById['${partId}'].toolState must be string | null`)
    } else if (part.type === 'error') {
      if (!isString(part.error)) throw new Error(`partsById['${partId}'].error must be a string`)
    } else if (part.type === 'metadata') {
      if (!isPlainObject(part.metadata)) throw new Error(`partsById['${partId}'].metadata must be a plain object`)
    } else {
      throw new Error(`partsById['${partId}'].type '${part.type}' is unknown`)
    }
  }

  // Validate partId references in partsByMessageId
  const partIds = new Set(Object.keys(domain.partsById))
  for (const [msgId, pids] of Object.entries(domain.partsByMessageId)) {
    for (const pid of pids as unknown as string[]) {
      if (!partIds.has(pid)) {
        throw new Error(`partsByMessageId['${msgId}'] contains partId '${pid}' which is not in partsById`)
      }
    }
  }

  if (!isPlainObject(domain.permissionsById)) {
    throw new Error('snapshot.domain.permissionsById must be a plain object')
  }
  for (const [permId, perm] of Object.entries(domain.permissionsById)) {
    if (!isPlainObject(perm)) throw new Error(`permissionsById['${permId}'] must be a plain object`)
    if (!isString(perm.id)) throw new Error(`permissionsById['${permId}'].id must be a string`)
    if (!isString(perm.sessionId)) throw new Error(`permissionsById['${permId}'].sessionId must be a string`)
    if (!isString(perm.permission)) throw new Error(`permissionsById['${permId}'].permission must be a string`)
    if (!isStringArray(perm.patterns)) throw new Error(`permissionsById['${permId}'].patterns must be a string array`)
    if (!isPlainObject(perm.metadata)) throw new Error(`permissionsById['${permId}'].metadata must be a plain object`)
  }

  if (!isPlainObject(domain.questionsById)) {
    throw new Error('snapshot.domain.questionsById must be a plain object')
  }
  for (const [qId, q] of Object.entries(domain.questionsById)) {
    if (!isPlainObject(q)) throw new Error(`questionsById['${qId}'] must be a plain object`)
    if (!isString(q.id)) throw new Error(`questionsById['${qId}'].id must be a string`)
    if (!isString(q.sessionId)) throw new Error(`questionsById['${qId}'].sessionId must be a string`)
    if (!isStringArray(q.questions)) throw new Error(`questionsById['${qId}'].questions must be a string array`)
    if (q.tool !== null && !isString(q.tool)) throw new Error(`questionsById['${qId}'].tool must be string | null`)
  }

  // retry
  if (!isPlainObject(domain.retry)) throw new Error('snapshot.domain.retry must be a plain object')
  if (domain.retry.retryMessage !== null && !isString(domain.retry.retryMessage)) {
    throw new Error('snapshot.domain.retry.retryMessage must be string | null')
  }
  if (!isFiniteNumber(domain.retry.retryCount)) throw new Error('snapshot.domain.retry.retryCount must be a finite number')
  if (domain.retry.retryCooldownUntil !== null && !isFiniteNumber(domain.retry.retryCooldownUntil)) {
    throw new Error('snapshot.domain.retry.retryCooldownUntil must be number | null')
  }

  // error
  if (!isPlainObject(domain.error)) throw new Error('snapshot.domain.error must be a plain object')
  if (domain.error.errorType !== null && !isString(domain.error.errorType)) {
    throw new Error('snapshot.domain.error.errorType must be string | null')
  }
  if (domain.error.fatalError !== null) {
    const fe = domain.error.fatalError
    if (!isPlainObject(fe)) throw new Error('snapshot.domain.error.fatalError must be a plain object')
    if (!isString(fe.invariantName)) throw new Error('snapshot.domain.error.fatalError.invariantName must be a string')
    if (!isString(fe.actorKey)) throw new Error('snapshot.domain.error.fatalError.actorKey must be a string')
    if (!isFiniteNumber(fe.revision)) throw new Error('snapshot.domain.error.fatalError.revision must be a finite number')
    if (!isString(fe.eventType)) throw new Error('snapshot.domain.error.fatalError.eventType must be a string')
  }

  // history
  if (!isPlainObject(domain.history)) throw new Error('snapshot.domain.history must be a plain object')
  if (typeof domain.history.isLoadingOlder !== 'boolean') throw new Error('snapshot.domain.history.isLoadingOlder must be a boolean')
  if (typeof domain.history.hasMoreAbove !== 'boolean') throw new Error('snapshot.domain.history.hasMoreAbove must be a boolean')
  if (domain.history.oldestLoadedMessageId !== null && !isString(domain.history.oldestLoadedMessageId)) {
    throw new Error('snapshot.domain.history.oldestLoadedMessageId must be string | null')
  }
  if (domain.history.newestLoadedMessageId !== null && !isString(domain.history.newestLoadedMessageId)) {
    throw new Error('snapshot.domain.history.newestLoadedMessageId must be string | null')
  }
  if (domain.history.historyLoadError !== null && !isString(domain.history.historyLoadError)) {
    throw new Error('snapshot.domain.history.historyLoadError must be string | null')
  }

  // meta
  const meta = snapshot.meta
  if (!isPlainObject(meta)) throw new Error('snapshot.meta must be a plain object')
  if (!isFiniteNumber(meta.revision)) throw new Error('snapshot.meta.revision must be a finite number')
  if (!isFiniteNumber(meta.updatedAt)) throw new Error('snapshot.meta.updatedAt must be a finite number')
  if (meta.sourceEventId !== null && !isString(meta.sourceEventId)) {
    throw new Error('snapshot.meta.sourceEventId must be string | null')
  }
  if (meta.hydratedAt !== null && !isFiniteNumber(meta.hydratedAt)) {
    throw new Error('snapshot.meta.hydratedAt must be number | null')
  }

  return snapshot as unknown as SessionSnapshotV1
}

// ---------------------------------------------------------------------------
// Serializability check
// ---------------------------------------------------------------------------

function isSerializableValue(val: unknown, seen = new WeakSet<object>()): { ok: true } | { ok: false; reason: string } {
  if (val === null) return { ok: true }
  if (typeof val === 'string') return { ok: true }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { ok: false, reason: `non-finite number (${val}) is not serializable` }
    return { ok: true }
  }
  if (typeof val === 'boolean') return { ok: true }
  if (typeof val === 'bigint') return { ok: false, reason: 'bigint is not serializable' }
  if (typeof val === 'symbol') return { ok: false, reason: 'symbol is not serializable' }
  if (typeof val === 'function') return { ok: false, reason: 'function is not serializable' }
  if (typeof val === 'undefined') return { ok: false, reason: 'undefined is not serializable' }
  if (val instanceof Date) return { ok: false, reason: 'Date is not serializable' }
  if (val instanceof Map) return { ok: false, reason: 'Map is not serializable' }
  if (val instanceof Set) return { ok: false, reason: 'Set is not serializable' }
  if (typeof val === 'object') {
    if (seen.has(val)) return { ok: true }
    seen.add(val)
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        const result = isSerializableValue(val[i], seen)
        if (!result.ok) return result
      }
      return { ok: true }
    }
    for (const kv of Object.entries(val as Record<string, unknown>)) {
      const result = isSerializableValue(kv[1], seen)
      if (!result.ok) return result
    }
    return { ok: true }
  }
  return { ok: true }
}

export function assertSerializableSnapshot(snapshot: SessionSnapshotV1): void {
  const result = isSerializableValue(snapshot)
  if (!result.ok) {
    throw new Error(`snapshot contains non-serializable value: ${result.reason}`)
  }
  // Verify round-trip produces a structurally intact object
  const str = JSON.stringify(snapshot)
  if (str === undefined) {
    throw new Error('snapshot contains non-serializable values (JSON.stringify returned undefined)')
  }
  const parsed = JSON.parse(str)
  if (!isPlainObject(parsed)) throw new Error('snapshot is not a plain object after serialization')
  if (parsed.version !== SESSION_SNAPSHOT_VERSION) throw new Error('version lost during serialization')
  if (parsed.key === undefined || parsed.identity === undefined || parsed.domain === undefined || parsed.meta === undefined) {
    throw new Error('snapshot structure lost during JSON serialization')
  }
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

export function createContextFromSnapshot(snapshot: SessionSnapshotV1): import('./context').SessionMachineContext {
  validateSessionSnapshotV1(snapshot)
  assertSerializableSnapshot(snapshot)

  const { domain, identity, key, meta } = snapshot

  return {
    directory: key.directory,
    sessionId: key.sessionId,
    projectId: identity.projectId,
    parentSessionId: identity.parentSessionId,
    exists: identity.exists,
    loaded: identity.loaded,
    messageOrder: domain.messageOrder,
    messagesById: domain.messagesById,
    partsByMessageId: domain.partsByMessageId,
    partsById: domain.partsById,
    streamingMessageId: domain.streamingMessageId,
    streamingPartId: domain.streamingPartId,
    permissionsById: domain.permissionsById,
    questionsById: domain.questionsById,
    retryMessage: domain.retry.retryMessage,
    retryCount: domain.retry.retryCount,
    retryCooldownUntil: domain.retry.retryCooldownUntil,
    errorType: domain.error.errorType,
    fatalError: domain.error.fatalError,
    isLoadingOlder: domain.history.isLoadingOlder,
    hasMoreAbove: domain.history.hasMoreAbove,
    oldestLoadedMessageId: domain.history.oldestLoadedMessageId,
    newestLoadedMessageId: domain.history.newestLoadedMessageId,
    historyLoadError: domain.history.historyLoadError,
    revision: meta.revision,
    updatedAt: meta.updatedAt,
    sourceEventId: meta.sourceEventId,
  }
}

// ---------------------------------------------------------------------------
// Hydration restoration helper
// ---------------------------------------------------------------------------

import type { SessionMachineContext } from './context'

/**
 * Converts a `SessionSnapshotV1` into an XState resolved machine snapshot that
 * can be passed to `createActor(machine, { snapshot })` to restore the actor
 * to its exact persisted regions and context.
 *
 * @param machine - The session machine (from `createSessionMachine(...)`)
 * @param snapshot - A `SessionSnapshotV1` previously produced by `createSessionSnapshot`
 */
export function restoreSessionMachineSnapshot(
  machine: { resolveState: (config: { value: Record<string, string>; context: SessionMachineContext }) => unknown },
  snapshot: SessionSnapshotV1,
): unknown {
  const context = createContextFromSnapshot(snapshot)
  return machine.resolveState({ value: snapshot.regions, context })
}