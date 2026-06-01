export const EVENTS = {
  OPENCODE_READY: "opencode:ready",
  OPENCODE_RESTARTING: "opencode:restarting",
  OPENCODE_RESTARTED: "opencode:restarted",
  OPENCODE_UNHEALTHY: "opencode:unhealthy",
  EVENT_RECEIVED: "event:received",
  SESSION_ACTIVITY_CHANGED: "session:activity-changed",
  SESSION_NEEDS_ATTENTION: "session:needs-attention",
  NOTIFICATION_SEND_UI: "notification:send-ui",
  NOTIFICATION_SEND_DESKTOP: "notification:send-desktop",
  NOTIFICATION_SEND_PUSH: "notification:send-push",
  TUNNEL_READY: "tunnel:ready",
  TUNNEL_CHANGED: "tunnel:changed",
  TUNNEL_ERROR: "tunnel:error",
  SERVER_PORT_BOUND: "server:port-bound",
} as const;

export type EventName = keyof typeof EVENTS;