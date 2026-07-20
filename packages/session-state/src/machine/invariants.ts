import type { SessionMachineContext } from './context.js'
import type { SessionDomainEvent } from './events.js'
import { createSessionActorKey } from './actorKey.js'
import type { SessionFatalError } from './context.js'

/**
 * Asserts event.directory === context.directory and event.sessionId === context.sessionId.
 * Throws on identity mismatch.
 */
export function assertSessionEventIdentityMatchesContext(
  event: SessionDomainEvent,
  context: SessionMachineContext,
): void {
  if (event.directory !== context.directory) {
    throw new Error(
      `SessionEvent identity mismatch: event directory "${event.directory}" does not match ` +
        `context directory "${context.directory}"`,
    )
  }

  if (event.sessionId !== context.sessionId) {
    throw new Error(
      `SessionEvent identity mismatch: event sessionId "${event.sessionId}" does not match ` +
        `context sessionId "${context.sessionId}"`,
    )
  }
}

/**
 * Checks that:
 * - every part in partsById references a messageId that exists in messagesById
 * - every partId in partsByMessageId arrays exists in partsById
 */
export function assertNormalizedReferences(context: SessionMachineContext): void {
  // Check each part's messageId exists in messagesById
  for (const [partId, part] of Object.entries(context.partsById)) {
    if (!context.messagesById[part.messageId]) {
      throw new Error(
        `Normalized reference violation: part "${partId}" references messageId ` +
          `"${part.messageId}" which does not exist in messagesById`,
      )
    }
  }

  // Check each partId in partsByMessageId arrays exists in partsById
  for (const [messageId, partIds] of Object.entries(context.partsByMessageId)) {
    if (!context.messagesById[messageId]) {
      throw new Error(
        `Normalized reference violation: partsByMessageId["${messageId}"] exists ` +
          `but "${messageId}" is not in messagesById`,
      )
    }
    for (const partId of partIds) {
      if (!context.partsById[partId]) {
        throw new Error(
          `Normalized reference violation: partsByMessageId["${messageId}"] contains ` +
            `partId "${partId}" which does not exist in partsById`,
        )
      }
    }
  }
}

/**
 * Returns a SessionFatalError describing which invariant failed.
 */
export function createFatalInvariantFailure(
  invariantName: string,
  context: SessionMachineContext,
  eventType: string,
): SessionFatalError {
  return {
    invariantName,
    actorKey: createSessionActorKey(context.directory, context.sessionId),
    revision: context.revision,
    eventType,
  }
}
