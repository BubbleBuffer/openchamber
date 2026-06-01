import type { SessionDomainEvent, SessionMessageRecord, SessionPartRecord } from "@openchamber/session-state";
import type { NormalizedPayloadResult } from "./types.js";

// ---------------------------------------------------------------------------
// Payload type → SessionDomainEvent mapping
// ---------------------------------------------------------------------------

interface PayloadProperties {
  sessionID?: string;
  messageID?: string;
  partID?: string;
  message?: Record<string, unknown>;
  permission?: Record<string, unknown>;
  permissionId?: string;
  approved?: boolean;
  question?: Record<string, unknown>;
  questionId?: string;
  answer?: string;
  info?: Record<string, unknown>;
  updates?: Record<string, unknown>;
  delta?: string;
  error?: string;
  initialParts?: unknown[];
  part?: Record<string, unknown>;
  olderMessages?: unknown[];
  olderPartsByMessageId?: Record<string, unknown>;
  projectId?: string | null;
  parentSessionId?: string | null;
  retryCount?: number;
  retryMessage?: string | null;
  retryCooldownUntil?: number | null;
  [key: string]: unknown;
}

interface OpenCodePayload {
  type?: string;
  id?: string;
  properties?: PayloadProperties;
  event_id?: string;
  directory?: string;
  status?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// normalizeOpenCodePayload
// ---------------------------------------------------------------------------

/**
 * Converts an OpenCode SSE payload into SessionDomainEvent values or validation errors.
 * Each normalized event preserves source metadata: directory, sessionId, timestamp, and sourceEventId.
 */
export function normalizeOpenCodePayload(
  payload: unknown,
  directory?: string,
): Array<NormalizedPayloadResult> {
  if (payload === null || payload === undefined) {
    return [];
  }

  if (typeof payload !== "object") {
    return [{ error: new Error("payload must be a non-null object") }];
  }

  const p = payload as OpenCodePayload;
  const type = p.type ?? "";
  const properties = (p.properties && typeof p.properties === "object") ? p.properties as PayloadProperties : {} as PayloadProperties;
  const timestamp = Date.now();
  const sourceEventId = typeof p.id === "string" ? p.id : "";

  try {
    if (type === "session.status") {
      return normalizeSessionStatus(p, properties, directory, timestamp, sourceEventId);
    }

    if (type === "message.updated") {
      return normalizeMessageUpdated(properties, directory, timestamp, sourceEventId);
    }

    if (type === "message.part.updated") {
      return normalizeMessagePartUpdated(properties, directory, timestamp, sourceEventId);
    }

    if (type === "message.part.delta") {
      return normalizeMessagePartDelta(properties, directory, timestamp, sourceEventId);
    }

    if (type === "message.added") {
      return normalizeMessageAdded(properties, directory, timestamp, sourceEventId);
    }

    if (type === "message.part.started") {
      return normalizeMessagePartStarted(properties, directory, timestamp, sourceEventId);
    }

    if (type === "message.part.finished") {
      return normalizeMessagePartFinished(properties, directory, timestamp, sourceEventId);
    }

    if (type === "message.part.removed") {
      return normalizeMessagePartRemoved(properties, directory, timestamp, sourceEventId);
    }

    if (type === "permission.asked") {
      return normalizePermissionAsked(properties, directory, timestamp, sourceEventId);
    }

    if (type === "permission.replied") {
      return normalizePermissionReplied(properties, directory, timestamp, sourceEventId);
    }

    if (type === "question.asked") {
      return normalizeQuestionAsked(properties, directory, timestamp, sourceEventId);
    }

    if (type === "question.answered") {
      return normalizeQuestionAnswered(properties, directory, timestamp, sourceEventId);
    }

    if (type === "question.rejected") {
      return normalizeQuestionRejected(properties, directory, timestamp, sourceEventId);
    }

    if (type === "stream.failed") {
      return normalizeStreamFailure(properties, directory, timestamp, sourceEventId);
    }

    if (type === "load.failed") {
      return normalizeLoadFailure(properties, directory, timestamp, sourceEventId);
    }

    if (type === "abort.requested") {
      return normalizeAbortRequested(properties, directory, timestamp, sourceEventId);
    }

    if (type === "abort.confirmed") {
      return normalizeAbortConfirmed(properties, directory, timestamp, sourceEventId);
    }

    if (type === "abort.failed") {
      return normalizeAbortFailed(properties, directory, timestamp, sourceEventId);
    }

    if (type === "retry.requested") {
      return normalizeRetryRequested(properties, directory, timestamp, sourceEventId);
    }

    if (type === "retry.started") {
      return normalizeRetryStarted(properties, directory, timestamp, sourceEventId);
    }

    if (type === "retry.failed") {
      return normalizeRetryFailed(properties, directory, timestamp, sourceEventId);
    }

    if (type === "load.older.requested") {
      return normalizeLoadOlderRequested(properties, directory, timestamp, sourceEventId);
    }

    if (type === "load.older.completed") {
      return normalizeLoadOlderCompleted(properties, directory, timestamp, sourceEventId);
    }

    if (type === "load.older.failed") {
      return normalizeLoadOlderFailed(properties, directory, timestamp, sourceEventId);
    }

    if (type === "error.dismissed") {
      return normalizeErrorDismissed(properties, directory, timestamp, sourceEventId);
    }

    if (type === "session.opened") {
      return normalizeSessionOpened(properties, directory, timestamp, sourceEventId);
    }

    if (type === "session.loaded") {
      return normalizeSessionLoaded(properties, directory, timestamp, sourceEventId);
    }

    if (type === "session.not_found") {
      return normalizeSessionNotFound(properties, directory, timestamp, sourceEventId);
    }

    return [{ error: new Error(`Unknown payload type: ${type}`) }];
  } catch (err) {
    return [{ error: err instanceof Error ? err : new Error(String(err)) }];
  }
}

// ---------------------------------------------------------------------------
// session.status — drives STREAM_STARTED / STREAM_COMPLETED
// ---------------------------------------------------------------------------

function normalizeSessionStatus(
  _payload: OpenCodePayload,
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const info = properties.info || {};
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";

  if (!sessionId) {
    return [{ error: new Error("session.status missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";
  const status = typeof info.type === "string" ? info.type.trim() : "";

  if (status === "busy" || status === "retry") {
    return [{
      event: {
        type: "STREAM_STARTED" as const,
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

  if (status === "idle") {
    return [{
      event: {
        type: "STREAM_COMPLETED" as const,
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

function normalizeMessageUpdated(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const messageId = typeof properties.messageID === "string" ? properties.messageID.trim() : "";
  const updates = properties.updates || {};

  if (!sessionId || !messageId) {
    return [{ error: new Error("message.updated missing sessionID or messageID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "MESSAGE_UPDATED" as const,
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

function normalizeMessagePartUpdated(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const partId = typeof properties.partID === "string" ? properties.partID.trim() : "";
  const updates = properties.updates || {};

  if (!sessionId || !partId) {
    return [{ error: new Error("message.part.updated missing sessionID or partID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "MESSAGE_PART_UPDATED" as const,
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

function normalizeMessagePartDelta(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const partId = typeof properties.partID === "string" ? properties.partID.trim() : "";
  const messageId = typeof properties.messageID === "string" ? properties.messageID.trim() : "";
  const delta = typeof properties.delta === "string" ? properties.delta : "";

  if (!sessionId || !partId || !messageId) {
    return [{ error: new Error("message.part.delta missing sessionID, partID, or messageID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "MESSAGE_PART_DELTA" as const,
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      messageId,
      partId,
      field: "text",
      delta,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// message.added
// ---------------------------------------------------------------------------

function normalizeMessageAdded(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const message = properties.message || {} as Record<string, unknown>;
  const initialParts = Array.isArray(properties.initialParts) ? properties.initialParts : [];

  if (!sessionId || !message.id) {
    return [{ error: new Error("message.added missing sessionID or message.id") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "MESSAGE_ADDED" as const,
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      message: {
        id: String(message.id),
        role: String(message.role || "user"),
        sessionId,
        createdAt: typeof message.createdAt === "number" ? message.createdAt : timestamp,
        parentId: message.parentId ? String(message.parentId) : null,
        model: message.model ? String(message.model) : null,
        agent: message.agent ? String(message.agent) : null,
        provider: message.provider ? String(message.provider) : null,
        cost: message.cost ? Number(message.cost) : null,
        tokens: message.tokens ? Number(message.tokens) : null,
        error: message.error ? String(message.error) : null,
      },
      initialParts: initialParts as SessionPartRecord[],
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// message.part.started
// ---------------------------------------------------------------------------

function normalizeMessagePartStarted(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const part = properties.part || {} as Record<string, unknown>;

  if (!sessionId || !part.id) {
    return [{ error: new Error("message.part.started missing sessionID or part.id") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "MESSAGE_PART_STARTED" as const,
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      part: ((): SessionPartRecord => {
        const partType = String(part.type || "text");
        const base = {
          id: String(part.id),
          messageId: String(part.messageId || ""),
        };
        if (partType === "tool") {
          return { ...base, type: "tool" as const, toolName: String(part.toolName || ""), toolCallId: String(part.toolCallId || ""), toolState: part.toolState ? String(part.toolState) : null };
        }
        if (partType === "error") {
          return { ...base, type: "error" as const, error: String(part.error || "") };
        }
        if (partType === "metadata") {
          return { ...base, type: "metadata" as const, metadata: (part.metadata && typeof part.metadata === "object") ? part.metadata as Record<string, unknown> : {} };
        }
        return { ...base, type: "text" as const, text: String(part.text || "") };
      })(),
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// message.part.finished
// ---------------------------------------------------------------------------

function normalizeMessagePartFinished(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const partId = typeof properties.partID === "string" ? properties.partID.trim() : "";

  if (!sessionId || !partId) {
    return [{ error: new Error("message.part.finished missing sessionID or partID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "MESSAGE_PART_FINISHED" as const,
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

function normalizeMessagePartRemoved(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const partId = typeof properties.partID === "string" ? properties.partID.trim() : "";
  const messageId = typeof properties.messageID === "string" ? properties.messageID.trim() : "";

  if (!sessionId || !partId || !messageId) {
    return [{ error: new Error("message.part.removed missing sessionID, partID, or messageID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "MESSAGE_PART_REMOVED" as const,
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
// permission.asked
// ---------------------------------------------------------------------------

function normalizePermissionAsked(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const permission = properties.permission || {} as Record<string, unknown>;

  if (!sessionId || !permission.id) {
    return [{ error: new Error("permission.asked missing sessionID or permission.id") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "PERMISSION_REQUESTED" as const,
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      permission: {
        id: String(permission.id),
        sessionId,
        permission: String(permission.permission || ""),
        patterns: Array.isArray(permission.patterns) ? permission.patterns.map(String) : [],
        metadata: (permission.metadata && typeof permission.metadata === "object") ? permission.metadata as Record<string, unknown> : {},
      },
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// permission.replied
// ---------------------------------------------------------------------------

function normalizePermissionReplied(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const permissionId = typeof properties.permissionId === "string" ? properties.permissionId.trim() : "";
  const approved = typeof properties.approved === "boolean" ? properties.approved : false;

  if (!sessionId || !permissionId) {
    return [{ error: new Error("permission.replied missing sessionID or permissionId") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "PERMISSION_RESOLVED" as const,
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

function normalizeQuestionAsked(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const question = properties.question || {} as Record<string, unknown>;

  if (!sessionId || !question.id) {
    return [{ error: new Error("question.asked missing sessionID or question.id") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "QUESTION_REQUESTED" as const,
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      question: {
        id: String(question.id),
        sessionId,
        questions: Array.isArray(question.questions) ? question.questions.map(String) : [],
        tool: question.tool ? String(question.tool) : null,
      },
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// question.answered
// ---------------------------------------------------------------------------

function normalizeQuestionAnswered(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const questionId = typeof properties.questionId === "string" ? properties.questionId.trim() : "";
  const answer = typeof properties.answer === "string" ? properties.answer : "";

  if (!sessionId || !questionId) {
    return [{ error: new Error("question.answered missing sessionID or questionId") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "QUESTION_ANSWERED" as const,
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

function normalizeQuestionRejected(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const questionId = typeof properties.questionId === "string" ? properties.questionId.trim() : "";

  if (!sessionId || !questionId) {
    return [{ error: new Error("question.rejected missing sessionID or questionId") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "QUESTION_REJECTED" as const,
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

function normalizeStreamFailure(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const error = typeof properties.error === "string" ? properties.error : "Unknown stream error";

  if (!sessionId) {
    return [{ error: new Error("stream.failed missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "STREAM_FAILED" as const,
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

function normalizeLoadFailure(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const error = typeof properties.error === "string" ? properties.error : "Unknown load error";

  if (!sessionId) {
    return [{ error: new Error("load.failed missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "SESSION_LOAD_FAILED" as const,
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
// abort.requested
// ---------------------------------------------------------------------------

function normalizeAbortRequested(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";

  if (!sessionId) {
    return [{ error: new Error("abort.requested missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "ABORT_REQUESTED" as const,
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

function normalizeAbortConfirmed(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";

  if (!sessionId) {
    return [{ error: new Error("abort.confirmed missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "ABORT_CONFIRMED" as const,
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

function normalizeAbortFailed(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const error = typeof properties.error === "string" ? properties.error : "Unknown abort error";

  if (!sessionId) {
    return [{ error: new Error("abort.failed missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "ABORT_FAILED" as const,
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

function normalizeRetryRequested(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";

  if (!sessionId) {
    return [{ error: new Error("retry.requested missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "RETRY_REQUESTED" as const,
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

function normalizeRetryStarted(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const retryCount = typeof properties.retryCount === "number" ? properties.retryCount : 0;
  const retryMessage = properties.retryMessage || null;
  const retryCooldownUntil = typeof properties.retryCooldownUntil === "number" ? properties.retryCooldownUntil : null;

  if (!sessionId) {
    return [{ error: new Error("retry.started missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "RETRY_STARTED" as const,
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

function normalizeRetryFailed(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const error = typeof properties.error === "string" ? properties.error : "Unknown retry error";

  if (!sessionId) {
    return [{ error: new Error("retry.failed missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "RETRY_FAILED" as const,
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

function normalizeLoadOlderRequested(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";

  if (!sessionId) {
    return [{ error: new Error("load.older.requested missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "LOAD_OLDER_REQUESTED" as const,
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

function normalizeLoadOlderCompleted(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const olderMessages = Array.isArray(properties.olderMessages) ? properties.olderMessages : [];
  const olderPartsByMessageId = properties.olderPartsByMessageId || {};

  if (!sessionId) {
    return [{ error: new Error("load.older.completed missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "LOAD_OLDER_COMPLETED" as const,
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
      olderMessages: olderMessages as SessionMessageRecord[],
      olderPartsByMessageId: olderPartsByMessageId as Record<string, SessionPartRecord[]>,
    },
    sourceEventId,
  }];
}

// ---------------------------------------------------------------------------
// load.older.failed
// ---------------------------------------------------------------------------

function normalizeLoadOlderFailed(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const error = typeof properties.error === "string" ? properties.error : "Unknown load error";

  if (!sessionId) {
    return [{ error: new Error("load.older.failed missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "LOAD_OLDER_FAILED" as const,
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

function normalizeErrorDismissed(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";

  if (!sessionId) {
    return [{ error: new Error("error.dismissed missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "ERROR_DISMISSED" as const,
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

function normalizeSessionOpened(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";
  const projectId = properties.projectId ?? null;
  const parentSessionId = properties.parentSessionId ?? null;

  if (!sessionId) {
    return [{ error: new Error("session.opened missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "SESSION_OPENED" as const,
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

function normalizeSessionLoaded(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";

  if (!sessionId) {
    return [{ error: new Error("session.loaded missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "SESSION_LOADED" as const,
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

function normalizeSessionNotFound(
  properties: PayloadProperties,
  directory: string | undefined,
  timestamp: number,
  sourceEventId: string,
): Array<NormalizedPayloadResult> {
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID.trim() : "";

  if (!sessionId) {
    return [{ error: new Error("session.not_found missing sessionID") }];
  }

  const dir = typeof directory === "string" && directory ? directory : "";

  return [{
    event: {
      type: "SESSION_NOT_FOUND" as const,
      directory: dir,
      sessionId,
      timestamp,
      sourceEventId,
    },
    sourceEventId,
  }];
}