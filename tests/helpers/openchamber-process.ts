export type StartedOpenChamber = {
  baseUrl: string
  port: number
  stop(): Promise<void>
}

export async function startOpenChamberAgainstOpenCode(options: { opencodeHost: string; port?: number; host?: string }): Promise<StartedOpenChamber> {
  const previous = {
    OPENCODE_SKIP_START: process.env.OPENCODE_SKIP_START,
    OPENCHAMBER_SKIP_OPENCODE_START: process.env.OPENCHAMBER_SKIP_OPENCODE_START,
    OPENCODE_HOST: process.env.OPENCODE_HOST,
  }
  process.env.OPENCODE_SKIP_START = "true"
  process.env.OPENCHAMBER_SKIP_OPENCODE_START = "true"
  // OPENCODE_HOST must include http:// and an explicit port, e.g. http://127.0.0.1:4096.
  // The web server env validation rejects host-only URLs.
  process.env.OPENCODE_HOST = options.opencodeHost
  try {
    const { startWebUiServer } = await import("@openchamber/web")
    const controller = await startWebUiServer({
      port: options.port ?? 0,
      host: options.host ?? "127.0.0.1",
      attachSignals: false,
      exitOnShutdown: false,
    })
    const port = controller.getPort()
    if (typeof port !== "number") throw new Error("OpenChamber started without a bound port")
    return {
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      async stop() {
        await controller.stop({ exitProcess: false })
      },
    }
  } finally {
    restoreEnv(previous)
  }
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
