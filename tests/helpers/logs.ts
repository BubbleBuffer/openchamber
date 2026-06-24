export type ProcessLogBuffer = {
  pushStdout(chunk: unknown): void
  pushStderr(chunk: unknown): void
  dump(): string
}

const stringify = (chunk: unknown): string => {
  if (typeof chunk === "string") return chunk
  if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk)
  return String(chunk)
}

export function createProcessLogBuffer(label: string, maxBytes = 64 * 1024): ProcessLogBuffer {
  let stdout = ""
  let stderr = ""

  const append = (current: string, chunk: unknown) => {
    const next = current + stringify(chunk)
    return next.length > maxBytes ? next.slice(next.length - maxBytes) : next
  }

  return {
    pushStdout(chunk) {
      stdout = append(stdout, chunk)
    },
    pushStderr(chunk) {
      stderr = append(stderr, chunk)
    },
    dump() {
      return [`[${label}] stdout:`, stdout || "<empty>", `[${label}] stderr:`, stderr || "<empty>"].join("\n")
    },
  }
}
