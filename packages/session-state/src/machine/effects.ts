import type { SessionMachineContext } from './context.js'

export type SessionMachineEffect =
  | SessionMachineEffectSendPrompt
  | SessionMachineEffectAbort
  | SessionMachineEffectRetry
  | SessionMachineEffectLoadOlder
  | SessionMachineEffectScheduleRetryCooldown
  | SessionMachineEffectCancelRetryCooldown
  | SessionMachineEffectPublishSnapshot
  | SessionMachineEffectReportFatalInvariant

export interface SessionMachineEffectSendPrompt {
  type: 'sendPrompt'
  directory: string
  sessionId: string
  prompt: string
  provider: string | null
  model: string | null
  agent: string | null
}

export interface SessionMachineEffectAbort {
  type: 'abort'
  directory: string
  sessionId: string
}

export interface SessionMachineEffectRetry {
  type: 'retry'
  directory: string
  sessionId: string
  retryCount: number
  retryMessage: string | null
}

export interface SessionMachineEffectLoadOlder {
  type: 'loadOlder'
  directory: string
  sessionId: string
}

export interface SessionMachineEffectScheduleRetryCooldown {
  type: 'scheduleRetryCooldown'
  directory: string
  sessionId: string
  delayMs: number
}

export interface SessionMachineEffectCancelRetryCooldown {
  type: 'cancelRetryCooldown'
  directory: string
  sessionId: string
}

export interface SessionMachineEffectPublishSnapshot {
  type: 'publishSnapshot'
  snapshot: SessionMachineContext
}

export interface SessionMachineEffectReportFatalInvariant {
  type: 'reportFatalInvariant'
  directory: string
  sessionId: string
  invariantName: string
  actorKey: string
  revision: number
  eventType: string
}
