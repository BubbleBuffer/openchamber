export type SessionActorKey = `${string}::${string}`

export interface SessionActorIdentity {
  directory: string
  sessionId: string
}

export function createSessionActorKey(directory: string, sessionId: string): SessionActorKey {
  if (!directory) throw new Error('directory is required')
  if (!sessionId) throw new Error('sessionId is required')
  return `${directory}::${sessionId}`
}

export function parseSessionActorKey(key: SessionActorKey): SessionActorIdentity {
  const separator = key.lastIndexOf('::')
  if (separator <= 0 || separator === key.length - 2) throw new Error('invalid session actor key')
  return { directory: key.slice(0, separator), sessionId: key.slice(separator + 2) }
}
