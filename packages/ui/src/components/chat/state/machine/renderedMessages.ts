/**
 * Rendered Messages Derivation
 *
 * Converts normalized machine records (messageOrder, messagesById, partsByMessageId, partsById)
 * into render-ready ChatMessageEntry arrays while preserving identity for unchanged records.
 *
 * This derivation is memoized and cache-aware to minimize React re-renders during
 * high-frequency streaming updates (60Hz MESSAGE_PART_DELTA events).
 */

import type { ChatMessageEntry } from '../../lib/turns/types'
import type {
  SessionMachineContext,
  SessionMessageRecord,
  SessionPartRecord,
} from '@openchamber/session-state'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal Message shape required by chat render consumers.
 * This is a narrow subset of the SDK Message type covering only the fields
 * that chat rendering actually accesses.
 */
export interface RenderMessageInfo {
  id: string
  role: string
  sessionID: string
  createdAt: number
  parentID: string | null
  model: string | null
  agent: string | null
  provider: string | null
  cost: number | null
  tokens: number | null
  error: string | null
  // Extended fields that rendering may access via getMessageInfoProp
  [key: string]: unknown
}

/**
 * Minimal Part shape required by chat render consumers.
 * This is a narrow subset of the SDK Part type covering only the fields
 * that chat rendering actually accesses.
 */
export interface RenderPart {
  id: string
  type: 'text' | 'tool' | 'error' | 'metadata'
  text?: string
  toolName?: string
  toolCallId?: string
  toolState?: string | null
  error?: string
  metadata?: Record<string, unknown>
}

export type RenderPartText = RenderPart & { type: 'text'; text: string }
export type RenderPartTool = RenderPart & { type: 'tool'; toolName: string; toolCallId: string; toolState: string | null }
export type RenderPartError = RenderPart & { type: 'error'; error: string }
export type RenderPartMetadata = RenderPart & { type: 'metadata'; metadata: Record<string, unknown> }

function isTextPart(part: RenderPart): part is RenderPartText { return part.type === 'text' }
function isToolPart(part: RenderPart): part is RenderPartTool { return part.type === 'tool' }
function isErrorPart(part: RenderPart): part is RenderPartError { return part.type === 'error' }
function isMetadataPart(part: RenderPart): part is RenderPartMetadata { return part.type === 'metadata' }

/**
 * Cache entry for render-derived messages.
 * Preserves reference identity for unchanged entries.
 */
export interface RenderCache {
  /** Map of messageId -> ChatMessageEntry for quick lookup */
  entriesByMessageId: Map<string, ChatMessageEntry>
  /** Previous messageOrder to detect reordering */
  previousOrder: string[]
}

/**
 * Result of deriving render entries from machine context.
 */
export interface DeriveRenderEntriesResult {
  /** Render-ready message entries in messageOrder sequence */
  entries: ChatMessageEntry[]
  /** Updated cache for subsequent derivations */
  cache: RenderCache
}

// ---------------------------------------------------------------------------
// Conversion Helpers
// ---------------------------------------------------------------------------

/**
 * Narrow adapter that maps SessionMessageRecord fields to the shape
 * render consumers expect from a Message info object.
 *
 * The machine stores a subset of Message fields; remaining SDK fields
 * that rendering doesn't access are omitted (undefined).
 */
function sessionMessageToRenderInfo(record: SessionMessageRecord): RenderMessageInfo {
  return {
    id: record.id,
    role: record.role,
    sessionID: record.sessionId,
    createdAt: record.createdAt,
    parentID: record.parentId,
    model: record.model,
    agent: record.agent,
    provider: record.provider,
    cost: record.cost,
    tokens: record.tokens,
    error: record.error,
    // Extended fields that rendering may access via getMessageInfoProp
    time: { created: record.createdAt },
    parentId: record.parentId,
  }
}

/**
 * Type guard: validates that an unknown value has the shape of a RenderPart.
 * Used to safely narrow cached parts before comparing them as RenderParts.
 */
function isRenderPart(part: unknown): part is RenderPart {
  if (part === null || part === undefined) return false
  if (typeof part !== 'object') return false
  const rec = part as Record<string, unknown>
  if (typeof rec.id !== 'string') return false
  if (typeof rec.type !== 'string') return false
  if (!['text', 'tool', 'error', 'metadata'].includes(rec.type)) return false
  return true
}

/**
 * Compares two RenderParts for equality (value-based, not reference).
 * Used for identity preservation during part-only deltas.
 */
function renderPartsAreEqual(a: RenderPart, b: RenderPart): boolean {
  if (a.type !== b.type) return false
  if (a.id !== b.id) return false
  if (isTextPart(a) && isTextPart(b)) return a.text === b.text
  if (isToolPart(a) && isToolPart(b)) {
    return a.toolName === b.toolName && a.toolCallId === b.toolCallId
  }
  if (isErrorPart(a) && isErrorPart(b)) return a.error === b.error
  if (isMetadataPart(a) && isMetadataPart(b)) {
    return JSON.stringify(a.metadata) === JSON.stringify(b.metadata)
  }
  return false
}

/**
 * Converts a SessionPartRecord to a RenderPart.
 * Handles the union type by accessing the discriminator field directly.
 */
function sessionPartToRenderPart(record: SessionPartRecord): RenderPart {
  // SessionPartRecord is a discriminated union with 'type' as discriminator
  // Access the specific fields based on the type tag
  const rec = record as SessionPartRecord & { type: string }
  switch (rec.type) {
    case 'text':
      return { id: rec.id, type: 'text', text: (record as { text: string }).text }
    case 'tool':
      return {
        id: rec.id,
        type: 'tool',
        toolName: (record as { toolName: string }).toolName,
        toolCallId: (record as { toolCallId: string }).toolCallId,
        toolState: (record as { toolState: string | null }).toolState,
      }
    case 'error':
      return { id: rec.id, type: 'error', error: (record as { error: string }).error }
    case 'metadata':
      return { id: rec.id, type: 'metadata', metadata: (record as { metadata: Record<string, unknown> }).metadata }
    default: {
      // If we reach here with an unknown type, return a safe fallback.
      // This should never happen with a properly-typed SessionPartRecord.
      const unknownRec = record as { id: string }
      return { id: unknownRec.id, type: 'metadata' as const, metadata: { _unknown: true } }
    }
  }
}

// ---------------------------------------------------------------------------
// Main Derivation Function
// ---------------------------------------------------------------------------

/**
 * Derives render-ready ChatMessageEntry array from machine context.
 *
 * Identity preservation: Only entries whose content actually changed will have
 * new references. Unchanged entries reuse their previous references from cache.
 *
 * @param messageOrder - Ordered array of message IDs (oldest to newest)
 * @param messagesById - Map of message ID to message record
 * @param partsByMessageId - Map of message ID to ordered array of part IDs
 * @param partsById - Map of part ID to part record
 * @param previousCache - Previous cache for identity preservation, or undefined for first derivation
 * @returns Render entries and updated cache
 */
export function deriveRenderEntries(
  messageOrder: string[],
  messagesById: Record<string, SessionMessageRecord>,
  partsByMessageId: Record<string, string[]>,
  partsById: Record<string, SessionPartRecord>,
  previousCache: RenderCache | undefined,
): DeriveRenderEntriesResult {
  const entriesByMessageId = new Map<string, ChatMessageEntry>()
  const newOrder = messageOrder

  // Check if order changed - if so, we need to rebuild all entries
  const orderChanged = !previousCache ||
    previousCache.previousOrder.length !== newOrder.length ||
    newOrder.some((id, index) => previousCache.previousOrder[index] !== id)

  // Build new entries array, reusing cached entries when possible
  const entries: ChatMessageEntry[] = []

  for (let i = 0; i < newOrder.length; i++) {
    const messageId = newOrder[i]
    const messageRecord = messagesById[messageId]

    if (!messageRecord) {
      // Message not found - skip
      continue
    }

    // Get part IDs for this message
    const partIds = partsByMessageId[messageId] ?? []

    // Check if we can reuse the cached entry for this message
    const cachedEntry = previousCache?.entriesByMessageId.get(messageId)

    // Rebuild parts array - compare by value, not by reference
    const parts: RenderPart[] = []
    let partsChanged = false

    for (let j = 0; j < partIds.length; j++) {
      const partId = partIds[j]
      const partRecord = partsById[partId]

      if (!partRecord) {
        // Part not found - skip
        continue
      }

      const part = sessionPartToRenderPart(partRecord)
      parts.push(part)

      // Check if part content changed - use value comparison since objects are recreated
      if (cachedEntry && j < cachedEntry.parts.length) {
        const cachedPartRaw = cachedEntry.parts[j]
        // Only compare as RenderPart when the cached part actually has RenderPart shape.
        // If shape validation fails the entry must be rebuilt (partsChanged = true).
        if (isRenderPart(cachedPartRaw)) {
          const cachedPart = cachedPartRaw
          if (cachedPart.type !== part.type || !renderPartsAreEqual(cachedPart, part)) {
            partsChanged = true
          }
        } else {
          partsChanged = true
        }
      } else {
        partsChanged = true
      }
    }

    // Determine if this entry can be reused from cache
    // Reuse if: message reference unchanged, parts unchanged, and order unchanged
    let entry: ChatMessageEntry

    if (
      cachedEntry &&
      !orderChanged &&
      !partsChanged
    ) {
      // Entry unchanged - reuse cached reference
      entry = cachedEntry
    } else {
      // Entry changed - create new reference
      // RenderMessageInfo covers all fields that chat rendering accesses from message.info.
      // The cast through unknown is safe because:
      // 1. Direct property access (id, role, sessionID, parentID, createdAt, model, agent,
      //    provider, cost, tokens, error) are all present in RenderMessageInfo
      // 2. getMessageInfoProp accesses via string keys which RenderMessageInfo supports
      //    via its index signature
      entry = {
        info: sessionMessageToRenderInfo(messageRecord) as unknown as ChatMessageEntry['info'],
        parts: parts as ChatMessageEntry['parts'],
      }
    }

    entriesByMessageId.set(messageId, entry)
    entries.push(entry)
  }

  // Build new cache
  const cache: RenderCache = {
    entriesByMessageId,
    previousOrder: newOrder,
  }

  return { entries, cache }
}

/**
 * Creates an empty cache for initial derivation.
 */
export function createEmptyRenderCache(): RenderCache {
  return {
    entriesByMessageId: new Map(),
    previousOrder: [],
  }
}

/**
 * Memoized hook-friendly derivation.
 * Use this inside React components with useMemo.
 */
export function deriveRenderEntriesMemoized(
  context: SessionMachineContext,
  previousCache: RenderCache | undefined,
): {
  entries: ChatMessageEntry[]
  cache: RenderCache
} {
  const { messageOrder, messagesById, partsByMessageId, partsById } = context

  return deriveRenderEntries(
    messageOrder,
    messagesById,
    partsByMessageId,
    partsById,
    previousCache,
  )
}
