const inflightSessionLoads = new Map<string, Promise<void>>()

/**
 * Shares a session load across every consumer mounted for the same directory.
 * Keeping this outside React prevents sidebar, chat, and controls from issuing
 * duplicate metadata/message requests through separate useSync hook instances.
 */
export function runDedupedSessionLoad(
  key: string,
  load: () => Promise<void>,
): Promise<void> {
  const existing = inflightSessionLoads.get(key)
  if (existing) return existing

  const request = load()
  inflightSessionLoads.set(key, request)
  const release = () => {
    if (inflightSessionLoads.get(key) === request) {
      inflightSessionLoads.delete(key)
    }
  }
  void request.then(release, release)
  return request
}
