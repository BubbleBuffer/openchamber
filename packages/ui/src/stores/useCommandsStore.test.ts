import { describe, it, expect, beforeEach, mock } from "bun:test";

mock.module("@/lib/opencode/client", () => ({
  opencodeClient: {
    experimental: {
      command: {
        list: mock(async () => [
          { name: "init", scope: "user", isBuiltIn: true },
          { name: "review", scope: "user", isBuiltIn: true },
        ]),
        create: mock(async () => true),
        update: mock(async () => true),
        delete: mock(async () => true),
      },
    },
  },
}));

mock.module("@/stores/projects/useProjectsStore", () => ({
  useProjectsStore: {
    getState: () => ({ activeProject: null }),
    subscribe: () => () => {},
  },
}));

mock.module("@/lib/config/configUpdate", () => ({
  startConfigUpdate: () => {},
  finishConfigUpdate: () => {},
  updateConfigUpdateMessage: () => {},
}));

mock.module("@/lib/config/configSync", () => ({
  emitConfigChange: () => {},
  scopeMatches: () => true,
  subscribeToConfigChanges: () => () => {},
}));

const { useCommandsStore, isCommandBuiltIn } = await import("./useCommandsStore");

describe("useCommandsStore", () => {
  beforeEach(() => {
    useCommandsStore.setState(
      {
        selectedCommandName: null,
        commands: [],
        isLoading: false,
        commandDraft: null,
      },
      false,
    );
  });

  it("setSelectedCommand updates the selection", () => {
    useCommandsStore.getState().setSelectedCommand("init");
    expect(useCommandsStore.getState().selectedCommandName).toBe("init");
  });

  it("setCommandDraft sets and clears the draft", () => {
    useCommandsStore.getState().setCommandDraft({ name: "x", scope: "user" });
    expect(useCommandsStore.getState().commandDraft?.name).toBe("x");
    useCommandsStore.getState().setCommandDraft(null);
    expect(useCommandsStore.getState().commandDraft).toBe(null);
  });

  it("getCommandByName finds a registered command", () => {
    useCommandsStore.setState({
      commands: [
        { name: "init", scope: "user", isBuiltIn: true },
        { name: "review", scope: "user", isBuiltIn: true },
      ],
    });
    expect(useCommandsStore.getState().getCommandByName("init")?.name).toBe("init");
    expect(useCommandsStore.getState().getCommandByName("nope")).toBeUndefined();
  });
});

describe("isCommandBuiltIn", () => {
  it("returns true for built-in commands", () => {
    expect(isCommandBuiltIn({ name: "init" })).toBe(true);
    expect(isCommandBuiltIn({ name: "review" })).toBe(true);
  });
  it("returns false for non built-in commands", () => {
    expect(isCommandBuiltIn({ name: "custom" })).toBe(false);
  });
});
