import { beforeEach, describe, expect, it, mock } from "bun:test"
import type { BridgeRequest } from "../bridge"

const standardGitHandler = mock<(req: BridgeRequest) => Promise<unknown>>()
const specialGitHandler = mock<(req: BridgeRequest) => Promise<unknown>>()
const fsHandler = mock<(req: BridgeRequest) => Promise<unknown>>()
const configHandler = mock<(req: BridgeRequest) => Promise<unknown>>()
const systemHandler = mock<(req: BridgeRequest) => Promise<unknown>>()
const proxyHandler = mock<(req: BridgeRequest) => Promise<unknown>>()

standardGitHandler.mockImplementation(async () => null)
specialGitHandler.mockImplementation(async () => null)
fsHandler.mockImplementation(async () => null)
configHandler.mockImplementation(async () => null)
systemHandler.mockImplementation(async () => null)
proxyHandler.mockImplementation(async () => null)

mock.module("vscode", () => ({
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: () => undefined }),
  },
  Uri: { file: (value: string) => ({ fsPath: value }) },
}))

mock.module("../bridge-git-runtime", () => ({
  handleStandardGitBridgeMessage: standardGitHandler,
}))
mock.module("../bridge-git-special-runtime", () => ({
  handleSpecialGitBridgeMessage: specialGitHandler,
}))
mock.module("../bridge-fs-runtime", () => ({
  handleFsBridgeMessage: fsHandler,
}))
mock.module("../bridge-config-runtime", () => ({
  handleConfigBridgeMessage: configHandler,
}))
mock.module("../bridge-system-runtime", () => ({
  handleSystemBridgeMessage: systemHandler,
}))
mock.module("../bridge-proxy-runtime", () => ({
  handleProxyBridgeMessage: proxyHandler,
}))
mock.module("../bridge-settings-runtime", () => ({
  fetchOpenCodeSkillsFromApi: mock(async () => []),
  persistSettings: mock(async (changes: Record<string, unknown>) => changes),
  readSettings: mock(() => ({})),
  readMagicPromptOverrides: mock(() => ({ version: 1, overrides: {} })),
  saveMagicPromptOverride: mock(async () => ({ version: 1, overrides: {} })),
  resetMagicPromptOverride: mock(async () => ({ version: 1, overrides: {} })),
  resetAllMagicPromptOverrides: mock(async () => ({ version: 1, overrides: {} })),
}))
mock.module("../bridge-git-process-runtime", () => ({ execGit: mock(async () => ({ stdout: "", stderr: "", exitCode: 0 })) }))
mock.module("../bridge-fs-helpers-runtime", () => ({
  parseDroppedFileReference: mock(() => ({ skipped: { name: "", reason: "" } })),
  readUriAsAttachment: mock(async () => ({ skipped: { name: "", reason: "" } })),
  resolveUserPath: mock((value: string) => value),
  listDirectoryEntries: mock(async () => []),
  normalizeFsPath: mock((value: string) => value),
  searchDirectory: mock(async () => []),
  resolveFileReadPath: mock(async (value: string) => ({ ok: true, resolvedPath: value })),
  fetchModelsMetadata: mock(async () => ({})),
}))
mock.module("../bridge-localfs-proxy-runtime", () => ({
  tryHandleLocalFsProxy: mock(async () => null),
  buildUnavailableApiResponse: mock(() => ({ status: 503, headers: {}, bodyBase64: "" })),
  sanitizeForwardHeaders: mock((headers?: Record<string, string>) => headers ?? {}),
  collectHeaders: mock(() => ({})),
  base64EncodeUtf8: mock((value: string) => Buffer.from(value, "utf8").toString("base64")),
}))

const { handleBridgeMessage } = await import("../bridge")

beforeEach(() => {
  for (const handler of [standardGitHandler, specialGitHandler, fsHandler, configHandler, systemHandler, proxyHandler]) {
    handler.mockClear()
    handler.mockImplementation(async () => null)
  }
})

describe("handleBridgeMessage", () => {
  it("returns the first standard git runtime response", async () => {
    standardGitHandler.mockImplementationOnce(async ({ id, type }) => ({ id, type, success: true, data: "git" }))
    const response = await handleBridgeMessage({ id: "1", type: "api:git/check", payload: { directory: "/repo" } })
    expect(response).toEqual({ id: "1", type: "api:git/check", success: true, data: "git" })
    expect(specialGitHandler).not.toHaveBeenCalled()
  })

  it("falls through runtimes and returns the GitHub-disabled error", async () => {
    const response = await handleBridgeMessage({ id: "2", type: "api:github/pr:create" })
    expect(response.success).toBe(false)
    expect(response.error).toContain("GitHub integration is disabled")
    expect(proxyHandler).toHaveBeenCalled()
  })

  it("returns an unknown message error for unhandled types", async () => {
    const response = await handleBridgeMessage({ id: "3", type: "unknown:thing" })
    expect(response).toEqual({ id: "3", type: "unknown:thing", success: false, error: "Unknown message type: unknown:thing" })
  })

  it("captures runtime exceptions as bridge errors", async () => {
    fsHandler.mockImplementationOnce(async () => { throw new Error("fs exploded") })
    const response = await handleBridgeMessage({ id: "4", type: "files:list", payload: { path: "." } })
    expect(response).toEqual({ id: "4", type: "files:list", success: false, error: "fs exploded" })
  })
})
