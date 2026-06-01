import type { SessionActorKey, SessionDomainEvent, SessionMachineEffect, SessionSnapshotV1 } from "@openchamber/session-state";

export type {
  SessionActorKey,
  SessionDomainEvent,
  SessionMachineEffect,
  SessionSnapshotV1,
};

export interface SessionMachineCreator {
  createSessionMachine(input: { directory: string; sessionId: string; timestamp: number }): unknown;
}

export interface NormalizedEventResult {
  event: SessionDomainEvent;
  sourceEventId: string;
}

export interface NormalizedEventError {
  error: Error;
}

export type NormalizedPayloadResult = NormalizedEventResult | NormalizedEventError;

export interface SessionActorRegistry {
  getOrCreate(directory: string, sessionId: string): unknown;
  send(key: SessionActorKey, event: SessionDomainEvent): void;
  getSnapshot(key: SessionActorKey): SessionSnapshotV1 | null;
  listKeys(): string[];
  entries(): Array<[string, SessionSnapshotV1]>;
  evict(key: SessionActorKey): void;
  dispose(): void;
}

export interface SessionEffectExecutor {
  execute(effect: SessionMachineEffect): void;
  dispose(): void;
}

export interface SnapshotTransport {
  writeSseEvent(snapshot: SessionSnapshotV1, options?: Record<string, unknown>): void;
}

export interface SessionSnapshotPublisher {
  publish(snapshot: SessionSnapshotV1): void;
  setTransport(transport: SnapshotTransport): void;
  writeSseEvent(snapshot: SessionSnapshotV1, options?: Record<string, unknown>): void;
}

export interface ServerSessionMachineBridge {
  start(): void;
  stop(): void;
}

export interface SessionRuntime {
  processOpenCodeSsePayload(payload: unknown): void;
  getSessionActivitySnapshot(): Array<{ directory: string; sessionId: string; activity: string }>;
  getSessionStateSnapshot(): Array<{ directory: string; sessionId: string; status: string }>;
  getSessionAttentionSnapshot(): Array<{ directory: string; sessionId: string; needsAttention: boolean }>;
  getSessionState(sessionId: string): SessionSnapshotV1 | null;
  getSessionAttentionState(sessionId: string): boolean;
  markSessionViewed(directory: string, sessionId: string): void;
  markSessionUnviewed(directory: string, sessionId: string): void;
  markUserMessageSent(directory: string, sessionId: string): void;
  resetAllSessionActivityToIdle(): void;
  dispose(): void;
}

export interface ActorRegistryDeps {
  createSessionMachine(input: { directory: string; sessionId: string; timestamp: number }): unknown;
}

export interface EffectExecutorDeps {
  callbacks?: {
    sendPrompt?: (directory: string, sessionId: string, prompt: unknown, provider: unknown, model: unknown, agent: unknown) => Promise<void>;
    abort?: (directory: string, sessionId: string, signal: AbortSignal) => Promise<void>;
    retry?: (directory: string, sessionId: string, retryCount: number, retryMessage: string) => Promise<void>;
    loadOlder?: (directory: string, sessionId: string) => Promise<void>;
    reportFatalInvariant?: (directory: string, sessionId: string, invariantName: string, actorKey: string, revision: number, eventType: string) => void;
  };
  publisher?: SessionSnapshotPublisher;
  registry?: SessionActorRegistry;
}

export interface SnapshotPublisherDeps {
  transport?: SnapshotTransport;
}

export interface MachineBridgeDeps {
  eventBus: unknown;
  registry: SessionActorRegistry;
  executor: SessionEffectExecutor;
  publisher: SessionSnapshotPublisher;
}

export interface SessionRuntimeDeps {
  eventBus?: unknown;
  bridge?: ServerSessionMachineBridge;
  actorRegistry?: SessionActorRegistry;
  writeSseEvent?: (res: unknown, payload: unknown) => void;
  getNotificationClients?: () => Set<unknown>;
  broadcastEvent?: (payload: unknown) => void;
}