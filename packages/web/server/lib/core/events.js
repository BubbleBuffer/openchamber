// packages/web/server/lib/core/events.js
// @ts-check

/**
 * @typedef {{
 *   'opencode:ready': void
 *   'opencode:restarting': void
 *   'opencode:restarted': void
 *   'opencode:unhealthy': void
 *   'event:received': { payload: Record<string, unknown>; directory?: string }
 *   'session:activity-changed': { sessionId: string; phase: 'busy' | 'idle' | 'cooldown' }
 *   'session:needs-attention': { sessionId: string; needsAttention: boolean }
 *   'notification:send-ui': { payload: Record<string, unknown> }
 *   'notification:send-desktop': { payload: Record<string, unknown> }
 *   'notification:send-push': { payload: Record<string, unknown>; options?: Record<string, unknown> }
 *   'tunnel:ready': { url: string; provider: string }
 *   'tunnel:changed': { url: string; provider: string }
 *   'tunnel:error': { error: string }
 *   'server:port-bound': { port: number }
 * }} ServerEvents
 */

export const EVENTS = {
  OPENCODE_READY: 'opencode:ready',
  OPENCODE_RESTARTING: 'opencode:restarting',
  OPENCODE_RESTARTED: 'opencode:restarted',
  OPENCODE_UNHEALTHY: 'opencode:unhealthy',
  EVENT_RECEIVED: 'event:received',
  SESSION_ACTIVITY_CHANGED: 'session:activity-changed',
  SESSION_NEEDS_ATTENTION: 'session:needs-attention',
  NOTIFICATION_SEND_UI: 'notification:send-ui',
  NOTIFICATION_SEND_DESKTOP: 'notification:send-desktop',
  NOTIFICATION_SEND_PUSH: 'notification:send-push',
  TUNNEL_READY: 'tunnel:ready',
  TUNNEL_CHANGED: 'tunnel:changed',
  TUNNEL_ERROR: 'tunnel:error',
  SERVER_PORT_BOUND: 'server:port-bound',
};
