/**
 * @file server-session-event-normalizer.js
 *
 * Pure functions that convert OpenCode SSE payloads into SessionDomainEvent
 * values or validation errors. Each normalized event preserves source metadata:
 * directory, sessionId, timestamp, and sourceEventId.
 */

import { createSessionActorKey } from '@openchamber/session-state';

// ---------------------------------------------------------------------------
// Canonical payload type → SessionDomainEvent mapping
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEvent, sourceEventId: string | null } | { error: Error }>}
 */
export function normalizeOpenCodePayload(payload, directory) {
  if (!payload || typeof payload !== 'object') {
    return [{ error: new Error('payload must be a non-null object') }];
  }

  // @ts-ignore
  const type = payload.type;
  // @ts-ignore
  const id = payload.id;
  // @ts-ignore
  const properties = payload.properties && typeof payload.properties === 'object' ? payload.properties : {};

  const sourceEventId = typeof id === 'string' ? id : null;
  const timestamp = Date.now();

  if (type === 'session.status') {
    return normalizeSessionStatus(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'message.updated') {
    return normalizeMessageUpdated(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'message.part.updated') {
    return normalizeMessagePartUpdated(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'message.part.delta') {
    return normalizeMessagePartDelta(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'permission.asked') {
    return normalizePermissionAsked(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'permission.replied') {
    return normalizePermissionReplied(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'question.asked') {
    return normalizeQuestionAsked(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'question.answered') {
    return normalizeQuestionAnswered(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'question.rejected') {
    return normalizeQuestionRejected(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'stream.failed') {
    return normalizeStreamFailure(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'load.failed') {
    return normalizeLoadFailure(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'message.added') {
    return normalizeMessageAdded(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'message.part.started') {
    return normalizeMessagePartStarted(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'message.part.finished') {
    return normalizeMessagePartFinished(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'message.part.removed') {
    return normalizeMessagePartRemoved(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'abort.requested') {
    return normalizeAbortRequested(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'abort.confirmed') {
    return normalizeAbortConfirmed(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'abort.failed') {
    return normalizeAbortFailed(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'retry.requested') {
    return normalizeRetryRequested(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'retry.started') {
    return normalizeRetryStarted(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'retry.failed') {
    return normalizeRetryFailed(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'load.older.requested') {
    return normalizeLoadOlderRequested(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'load.older.completed') {
    return normalizeLoadOlderCompleted(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'load.older.failed') {
    return normalizeLoadOlderFailed(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'error.dismissed') {
    return normalizeErrorDismissed(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'session.opened') {
    return normalizeSessionOpened(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'session.loaded') {
    return normalizeSessionLoaded(payload, directory, timestamp, sourceEventId);
  }

  if (type === 'session.not_found') {
    return normalizeSessionNotFound(payload, directory, timestamp, sourceEventId);
  }

  return [{ error: new Error(`Unknown payload type: ${type}`) }];
}

// ---------------------------------------------------------------------------
// session.status — drives STREAM_STARTED / STREAM_COMPLETED / activity phase
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEvent, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeSessionStatus(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const info = properties.info || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';

  if (!sessionId) {
    return [{ error: new Error('session.status missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';
  const status = typeof info.type === 'string' ? info.type.trim() : '';

  if (status === 'busy' || status === 'retry') {
    return [{
      event: {
        type: 'STREAM_STARTED',
        directory: dir,
        sessionId,
        timestamp,
        sourceEventId,
        streamingMessageId: `stream-msg-${sessionId}-${timestamp}`,
        streamingPartId: `stream-part-${sessionId}-${timestamp}`,
      },
      sourceEventId,
    }];
  }

  if (status === 'idle') {
    return [{
      event: {
        type: 'STREAM_COMPLETED',
        directory: dir,
        sessionId,
        timestamp,
        sourceEventId,
      },
      sourceEventId,
    }];
  }

  return [{ error: new Error(`Unknown session.status type: ${status}`) }];
}

// ---------------------------------------------------------------------------
// message.updated
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventMessageUpdated, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeMessageUpdated(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const messageId = typeof properties.messageID === 'string' ? properties.messageID.trim() : '';
  const updates = properties.updates || {};

  if (!sessionId || !messageId) {
    return [{ error: new Error('message.updated missing sessionID or messageID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'MESSAGE_UPDATED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      messageId,
      updates,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// message.part.updated
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventMessagePartUpdated, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeMessagePartUpdated(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const partId = typeof properties.partID === 'string' ? properties.partID.trim() : '';
  const updates = properties.updates || {};

  if (!sessionId || !partId) {
    return [{ error: new Error('message.part.updated missing sessionID or partID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'MESSAGE_PART_UPDATED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      partId,
      updates,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// message.part.delta
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventMessagePartDelta, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeMessagePartDelta(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const partId = typeof properties.partID === 'string' ? properties.partID.trim() : '';
  const messageId = typeof properties.messageID === 'string' ? properties.messageID.trim() : '';
  const delta = typeof properties.delta === 'string' ? properties.delta : '';

  if (!sessionId || !partId || !messageId) {
    return [{ error: new Error('message.part.delta missing sessionID, partID, or messageID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'MESSAGE_PART_DELTA',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      messageId,
      partId,
      field: 'text',
      delta,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// permission.asked
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventPermissionRequested, sourceEventId: string | null } | { error: Error }>}
 */
function normalizePermissionAsked(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const permission = properties.permission || {};

  if (!sessionId || !permission.id) {
    return [{ error: new Error('permission.asked missing sessionID or permission.id') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'PERMISSION_REQUESTED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      permission: {
        id: permission.id,
        sessionId,
        permission: permission.permission || '',
        patterns: Array.isArray(permission.patterns) ? permission.patterns : [],
        metadata: permission.metadata || {},
      },
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// permission.replied
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventPermissionResolved, sourceEventId: string | null } | { error: Error }>}
 */
function normalizePermissionReplied(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const permissionId = typeof properties.permissionId === 'string' ? properties.permissionId.trim() : '';
  const approved = typeof properties.approved === 'boolean' ? properties.approved : false;

  if (!sessionId || !permissionId) {
    return [{ error: new Error('permission.replied missing sessionID or permissionId') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'PERMISSION_RESOLVED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      permissionId,
      approved,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// question.asked
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventQuestionRequested, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeQuestionAsked(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const question = properties.question || {};

  if (!sessionId || !question.id) {
    return [{ error: new Error('question.asked missing sessionID or question.id') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'QUESTION_REQUESTED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      question: {
        id: question.id,
        sessionId,
        questions: Array.isArray(question.questions) ? question.questions : [],
        tool: question.tool || null,
      },
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// question.answered
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventQuestionAnswered, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeQuestionAnswered(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const questionId = typeof properties.questionId === 'string' ? properties.questionId.trim() : '';
  const answer = typeof properties.answer === 'string' ? properties.answer : '';

  if (!sessionId || !questionId) {
    return [{ error: new Error('question.answered missing sessionID or questionId') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'QUESTION_ANSWERED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      questionId,
      answer,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// question.rejected
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventQuestionRejected, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeQuestionRejected(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const questionId = typeof properties.questionId === 'string' ? properties.questionId.trim() : '';

  if (!sessionId || !questionId) {
    return [{ error: new Error('question.rejected missing sessionID or questionId') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'QUESTION_REJECTED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      questionId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// stream.failed
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventStreamFailed, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeStreamFailure(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const error = typeof properties.error === 'string' ? properties.error : 'Unknown stream error';

  if (!sessionId) {
    return [{ error: new Error('stream.failed missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'STREAM_FAILED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      error,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// load.failed
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventSessionLoadFailed, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeLoadFailure(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const error = typeof properties.error === 'string' ? properties.error : 'Unknown load error';

  if (!sessionId) {
    return [{ error: new Error('load.failed missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'SESSION_LOAD_FAILED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      error,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// message.added
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventMessageAdded, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeMessageAdded(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const message = properties.message || {};
  const initialParts = Array.isArray(properties.initialParts) ? properties.initialParts : [];

  if (!sessionId || !message.id) {
    return [{ error: new Error('message.added missing sessionID or message.id') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'MESSAGE_ADDED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      message: {
        id: message.id,
        role: message.role || 'user',
        sessionId,
        createdAt: typeof message.createdAt === 'number' ? message.createdAt : timestamp,
        parentId: message.parentId || null,
        model: message.model || null,
        agent: message.agent || null,
        provider: message.provider || null,
        cost: message.cost || null,
        tokens: message.tokens || null,
        error: message.error || null,
      },
      initialParts,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// message.part.started
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventMessagePartStarted, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeMessagePartStarted(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const part = properties.part || {};

  if (!sessionId || !part.id) {
    return [{ error: new Error('message.part.started missing sessionID or part.id') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'MESSAGE_PART_STARTED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      part: {
        id: part.id,
        messageId: part.messageId || '',
        type: part.type || 'text',
        text: part.text || '',
        toolName: part.toolName || '',
        toolCallId: part.toolCallId || '',
        toolState: part.toolState || null,
        error: part.error || '',
        metadata: part.metadata || {},
      },
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// message.part.finished
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventMessagePartFinished, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeMessagePartFinished(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const partId = typeof properties.partID === 'string' ? properties.partID.trim() : '';

  if (!sessionId || !partId) {
    return [{ error: new Error('message.part.finished missing sessionID or partID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'MESSAGE_PART_FINISHED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      partId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// message.part.removed
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventMessagePartRemoved, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeMessagePartRemoved(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const partId = typeof properties.partID === 'string' ? properties.partID.trim() : '';
  const messageId = typeof properties.messageID === 'string' ? properties.messageID.trim() : '';

  if (!sessionId || !partId || !messageId) {
    return [{ error: new Error('message.part.removed missing sessionID, partID, or messageID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'MESSAGE_PART_REMOVED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      messageId,
      partId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// abort.requested
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventAbortRequested, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeAbortRequested(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';

  if (!sessionId) {
    return [{ error: new Error('abort.requested missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'ABORT_REQUESTED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// abort.confirmed
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventAbortConfirmed, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeAbortConfirmed(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';

  if (!sessionId) {
    return [{ error: new Error('abort.confirmed missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'ABORT_CONFIRMED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// abort.failed
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventAbortFailed, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeAbortFailed(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const error = typeof properties.error === 'string' ? properties.error : 'Unknown abort error';

  if (!sessionId) {
    return [{ error: new Error('abort.failed missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'ABORT_FAILED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      error,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// retry.requested
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventRetryRequested, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeRetryRequested(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';

  if (!sessionId) {
    return [{ error: new Error('retry.requested missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'RETRY_REQUESTED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// retry.started
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventRetryStarted, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeRetryStarted(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const retryCount = typeof properties.retryCount === 'number' ? properties.retryCount : 0;
  const retryMessage = properties.retryMessage || null;
  const retryCooldownUntil = typeof properties.retryCooldownUntil === 'number' ? properties.retryCooldownUntil : null;

  if (!sessionId) {
    return [{ error: new Error('retry.started missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'RETRY_STARTED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      retryCount,
      retryMessage,
      retryCooldownUntil,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// retry.failed
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventRetryFailed, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeRetryFailed(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const error = typeof properties.error === 'string' ? properties.error : 'Unknown retry error';

  if (!sessionId) {
    return [{ error: new Error('retry.failed missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'RETRY_FAILED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      error,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// load.older.requested
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventLoadOlderRequested, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeLoadOlderRequested(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';

  if (!sessionId) {
    return [{ error: new Error('load.older.requested missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'LOAD_OLDER_REQUESTED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// load.older.completed
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventLoadOlderCompleted, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeLoadOlderCompleted(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const olderMessages = Array.isArray(properties.olderMessages) ? properties.olderMessages : [];
  const olderPartsByMessageId = properties.olderPartsByMessageId || {};

  if (!sessionId) {
    return [{ error: new Error('load.older.completed missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'LOAD_OLDER_COMPLETED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      olderMessages,
      olderPartsByMessageId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// load.older.failed
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventLoadOlderFailed, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeLoadOlderFailed(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const error = typeof properties.error === 'string' ? properties.error : 'Unknown load error';

  if (!sessionId) {
    return [{ error: new Error('load.older.failed missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'LOAD_OLDER_FAILED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      error,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// error.dismissed
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventErrorDismissed, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeErrorDismissed(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';

  if (!sessionId) {
    return [{ error: new Error('error.dismissed missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'ERROR_DISMISSED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// session.opened
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventSessionOpened, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeSessionOpened(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const projectId = properties.projectId || null;
  const parentSessionId = properties.parentSessionId || null;

  if (!sessionId) {
    return [{ error: new Error('session.opened missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'SESSION_OPENED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      projectId,
      parentSessionId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// session.loaded
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventSessionLoaded, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeSessionLoaded(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';

  if (!sessionId) {
    return [{ error: new Error('session.loaded missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'SESSION_LOADED',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// session.not_found
// ---------------------------------------------------------------------------

/**
 * @param {unknown} payload
 * @param {string} [directory]
 * @param {number} timestamp
 * @param {string | null} sourceEventId
 * @returns {Array<{ event: import('@openchamber/session-state').SessionDomainEventSessionNotFound, sourceEventId: string | null } | { error: Error }>}
 */
function normalizeSessionNotFound(payload, directory, timestamp, sourceEventId) {
  // @ts-ignore
  const properties = payload.properties || {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';

  if (!sessionId) {
    return [{ error: new Error('session.not_found missing sessionID') }];
  }

  const dir = typeof directory === 'string' && directory ? directory : '';

  return [{
    event: {
      type: 'SESSION_NOT_FOUND',
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
    },
    sourceEventId,
  }];
}
