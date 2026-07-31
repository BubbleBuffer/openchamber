import { describe, it, expect, beforeEach, mock } from "bun:test";

mock.module("@/stores/projects/useProjectsStore", () => ({
  useProjectsStore: {
    getState: () => ({
      activeProject: { id: "p1", worktree: "/repo" },
    }),
    subscribe: () => () => {},
  },
}));

mock.module("@/lib/git/gitApi", () => ({
  checkIsGitRepository: mock(async () => true),
}));

mock.module("@/lib/worktrees/worktreeManager", () => ({
  ProjectRef: class {},
}));

mock.module("@/lib/worktrees/worktreeCreate", () => ({
  createWorktreeWithDefaults: mock(async () => ({})),
  resolveRootTrackingRemote: mock(async () => "origin"),
}));

mock.module("@/lib/worktrees/worktreeStatus", () => ({
  getRootBranch: mock(async () => "main"),
}));

mock.module("@/lib/config/openchamberConfig", () => ({
  saveWorktreeSetupCommands: mock(async () => {}),
}));

mock.module("@/lib/opencode/client", () => ({
  opencodeClient: {
    session: {
      create: mock(async () => ({ data: { id: "sess-1" } })),
    },
    experimental: {
      session: {
        create: mock(async () => ({ data: { id: "sess-1" } })),
      },
    },
  },
}));

mock.module("@/sync/session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({}),
    setState: () => {},
  },
}));

mock.module("@/stores/files/useDirectoryStore", () => ({
  useDirectoryStore: {
    getState: () => ({ activeDirectory: "/repo" }),
    setState: () => {},
  },
}));

const { useMultiRunStore } = await import("./useMultiRunStore");

describe("useMultiRunStore", () => {
  beforeEach(() => {
    useMultiRunStore.setState({ isLoading: false, error: null }, false);
  });

  it("createMultiRun returns null + sets error when group name is empty", async () => {
    const result = await useMultiRunStore.getState().createMultiRun({
      name: "",
      prompt: "do thing",
      models: [{ providerID: "anthropic", modelID: "claude-sonnet-4" }],
    });
    expect(result).toBe(null);
    expect(useMultiRunStore.getState().error).toBe("Group name is required");
  });

  it("createMultiRun returns null + sets error when prompt is empty", async () => {
    const result = await useMultiRunStore.getState().createMultiRun({
      name: "grp",
      prompt: "",
      models: [{ providerID: "anthropic", modelID: "claude-sonnet-4" }],
    });
    expect(result).toBe(null);
    expect(useMultiRunStore.getState().error).toBe("Prompt is required");
  });

  it("createMultiRun returns null when models.length is 0", async () => {
    const result = await useMultiRunStore.getState().createMultiRun({
      name: "grp",
      prompt: "do thing",
      models: [],
    });
    expect(result).toBe(null);
    expect(useMultiRunStore.getState().error).toBe("Select at least 1 model");
  });

  it("clearError resets error to null", () => {
    useMultiRunStore.setState({ error: "boom" });
    useMultiRunStore.getState().clearError();
    expect(useMultiRunStore.getState().error).toBe(null);
  });
});
