import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { Session } from "@/lib/opencode/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeSession = (id: string, overrides: Record<string, any> = {}): Session => ({
  id,
  title: `Session ${id}`,
  time: { created: 1000, updated: 2000, archived: 0 },
  ...overrides,
} as Session);

// --- Mock SDK client ---
const mockList = mock(async () => ({ data: [] }));
const getSdkClient = mock(() => ({
  experimental: {
    session: {
      list: mockList,
    },
  },
}));

// --- Mock globalSessions with our controlled listGlobalSessionPages ---
const listGlobalSessionPages = mock(
  async (
    client: unknown,
    opts: { archived: boolean; pageSize: number },
  ): Promise<Session[]> => {
    void client;
    void opts;
    return [];
  },
);

mock.module("@/stores/globalSessions", () => ({
  listGlobalSessionPages,
}));

// --- Mock SDK client ---
mock.module("@/lib/opencode/client", () => ({
  opencodeClient: { getSdkClient },
}));

const {
  useGlobalSessionsStore,
  ensureGlobalSessionsLoaded,
  refreshGlobalSessions,
} = await import("./useGlobalSessionsStore");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const resetStore = () => {
  useGlobalSessionsStore.setState(
    {
      activeSessions: [],
      archivedSessions: [],
      sessionsByDirectory: new Map(),
      hasLoaded: false,
      status: "idle",
    },
    false,
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("useGlobalSessionsStore", () => {
  beforeEach(() => {
    listGlobalSessionPages.mockClear();
    getSdkClient.mockClear();
    mockList.mockClear();
    resetStore();
  });

  // ── applySnapshot ──────────────────────────────────────────────────────────

  describe("applySnapshot", () => {
    it("sets active, archived, hasLoaded, status, and sessionsByDirectory", () => {
      const active = [
        makeSession("a1", { directory: "/repo" }),
        makeSession("a2", { project: { id: "p1", worktree: "/other" } }),
      ];
      const archived = [makeSession("ar1", { time: { created: 1, updated: 2, archived: 3 } })];

      useGlobalSessionsStore.getState().applySnapshot(active, archived, "ready");

      const state = useGlobalSessionsStore.getState();
      expect(state.activeSessions).toBe(active);
      expect(state.archivedSessions).toBe(archived);
      expect(state.hasLoaded).toBe(true);
      expect(state.status).toBe("ready");
      expect(state.sessionsByDirectory.size).toBe(2);
    });

    it("preserves list references when same session signatures are passed", () => {
      const session = makeSession("s1", { directory: "/repo" });
      const initialActive = [session];
      const initialArchived: Session[] = [];

      useGlobalSessionsStore.setState({ activeSessions: initialActive, archivedSessions: initialArchived });

      // Pass identical session (same reference) — same signature
      useGlobalSessionsStore.getState().applySnapshot(initialActive, initialArchived, "ready");

      const state = useGlobalSessionsStore.getState();
      // The state object returned should be identical to the current state
      // (applySnapshot returns `state` early when nothing changed)
      expect(state.activeSessions).toBe(initialActive);
    });
  });

  // ── upsertSession ──────────────────────────────────────────────────────────

  describe("upsertSession", () => {
    it("inserts a new active session at the head of activeSessions", () => {
      const existing = makeSession("existing", { directory: "/repo" });
      useGlobalSessionsStore.setState({ activeSessions: [existing] });

      const incoming = makeSession("new", { directory: "/repo" });
      useGlobalSessionsStore.getState().upsertSession(incoming);

      const { activeSessions } = useGlobalSessionsStore.getState();
      expect(activeSessions[0].id).toBe("new");
      expect(activeSessions).toHaveLength(2);
    });

    it("replaces an existing active session in place", () => {
      const original = makeSession("s1", { title: "Old", directory: "/repo", time: { created: 100, updated: 100, archived: 0 } });
      const updated = makeSession("s1", { title: "New", directory: "/repo", time: { created: 100, updated: 200, archived: 0 } });
      useGlobalSessionsStore.setState({ activeSessions: [original] });

      useGlobalSessionsStore.getState().upsertSession(updated);

      const { activeSessions } = useGlobalSessionsStore.getState();
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].title).toBe("New");
    });

    it("moves an archived session to archivedSessions list when it was active", () => {
      // Session in active list without archived time
      const activeSession = makeSession("s1", { directory: "/repo" });
      useGlobalSessionsStore.setState({ activeSessions: [activeSession] });

      // Same session but with archived time set
      const archivedVersion: Session = {
        ...activeSession,
        time: { ...activeSession.time, archived: Date.now() },
      };
      useGlobalSessionsStore.getState().upsertSession(archivedVersion);

      const { activeSessions, archivedSessions } = useGlobalSessionsStore.getState();
      expect(activeSessions.some((s) => s.id === "s1")).toBe(false);
      expect(archivedSessions.find((s) => s.id === "s1")).toBeTruthy();
    });

    it("removes from archivedSessions when a non-archived session with same id is upserted", () => {
      const archived = makeSession("s1", { time: { created: 1, updated: 2, archived: 100 } });
      useGlobalSessionsStore.setState({ archivedSessions: [archived] });

      const active: Session = { ...archived, time: { ...archived.time, archived: 0 } };
      useGlobalSessionsStore.getState().upsertSession(active);

      const { archivedSessions, activeSessions } = useGlobalSessionsStore.getState();
      expect(archivedSessions.some((s) => s.id === "s1")).toBe(false);
      expect(activeSessions.find((s) => s.id === "s1")).toBeTruthy();
    });
  });

  // ── removeSessions ─────────────────────────────────────────────────────────

  describe("removeSessions", () => {
    it("removes ids from activeSessions", () => {
      useGlobalSessionsStore.setState({
        activeSessions: [makeSession("a1"), makeSession("a2")],
      });

      useGlobalSessionsStore.getState().removeSessions(["a1"]);

      const { activeSessions } = useGlobalSessionsStore.getState();
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].id).toBe("a2");
    });

    it("removes ids from archivedSessions", () => {
      useGlobalSessionsStore.setState({
        archivedSessions: [
          makeSession("ar1", { time: { created: 1, updated: 2, archived: 3 } }),
          makeSession("ar2", { time: { created: 1, updated: 2, archived: 3 } }),
        ],
      });

      useGlobalSessionsStore.getState().removeSessions(["ar1"]);

      const { archivedSessions } = useGlobalSessionsStore.getState();
      expect(archivedSessions).toHaveLength(1);
      expect(archivedSessions[0].id).toBe("ar2");
    });

    it("removes ids from both lists", () => {
      useGlobalSessionsStore.setState({
        activeSessions: [makeSession("s1")],
        archivedSessions: [makeSession("s1", { time: { created: 1, updated: 2, archived: 3 } })],
      });

      useGlobalSessionsStore.getState().removeSessions(["s1"]);

      const { activeSessions, archivedSessions } = useGlobalSessionsStore.getState();
      expect(activeSessions).toHaveLength(0);
      expect(archivedSessions).toHaveLength(0);
    });

    it("is a no-op when ids set is empty", () => {
      const existing = [makeSession("s1")];
      useGlobalSessionsStore.setState({ activeSessions: existing });

      useGlobalSessionsStore.getState().removeSessions([]);

      expect(useGlobalSessionsStore.getState().activeSessions).toBe(existing);
    });
  });

  // ── archiveSessions ───────────────────────────────────────────────────────

  describe("archiveSessions", () => {
    it("moves active sessions to archived with archived timestamp", () => {
      const s1 = makeSession("s1", { directory: "/repo" });
      const s2 = makeSession("s2", { directory: "/repo" });
      useGlobalSessionsStore.setState({ activeSessions: [s1, s2] });

      const archivedAt = 9999999999;
      useGlobalSessionsStore.getState().archiveSessions(["s1"], archivedAt);

      const { activeSessions, archivedSessions } = useGlobalSessionsStore.getState();
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].id).toBe("s2");
      expect(archivedSessions).toHaveLength(1);
      expect(archivedSessions[0].id).toBe("s1");
      expect(archivedSessions[0].time.archived).toBe(archivedAt);
    });

    it("is a no-op when no ids match", () => {
      useGlobalSessionsStore.setState({ activeSessions: [makeSession("s1")] });

      useGlobalSessionsStore.getState().archiveSessions(["nonexistent"]);

      expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(1);
    });

    it("updates sessionsByDirectory when active sessions are archived", () => {
      const s1 = makeSession("s1", { directory: "/repo" });
      useGlobalSessionsStore.setState({ activeSessions: [s1] });

      useGlobalSessionsStore.getState().archiveSessions(["s1"]);

      const { sessionsByDirectory } = useGlobalSessionsStore.getState();
      expect(sessionsByDirectory.has("/repo")).toBe(false);
    });
  });

  // ── loadSessions ───────────────────────────────────────────────────────────

  describe("loadSessions", () => {
    it("returns cached state when already loaded and ready", async () => {
      const cachedActive = [makeSession("cached")];
      const cachedArchived: Session[] = [];
      useGlobalSessionsStore.setState({
        activeSessions: cachedActive,
        archivedSessions: cachedArchived,
        hasLoaded: true,
        status: "ready",
      });

      const result = await ensureGlobalSessionsLoaded();

      expect(result.activeSessions).toBe(cachedActive);
      expect(listGlobalSessionPages).not.toHaveBeenCalled();
    });

    it("fetches active and archived pages on cache miss", async () => {
      const fetchedActive = [makeSession("fa1")];
      const fetchedArchived = [makeSession("fa2", { time: { created: 1, updated: 2, archived: 3 } })];

      listGlobalSessionPages.mockImplementation(
        async (
          _client: unknown,
          opts: { archived: boolean; pageSize: number },
        ): Promise<Session[]> => {
          return opts.archived ? fetchedArchived : fetchedActive;
        },
      );

      await useGlobalSessionsStore.getState().loadSessions();

      expect(listGlobalSessionPages).toHaveBeenCalledTimes(2);
      const { activeSessions, archivedSessions, hasLoaded, status } = useGlobalSessionsStore.getState();
      expect(activeSessions).toEqual(fetchedActive);
      expect(archivedSessions).toEqual(fetchedArchived);
      expect(hasLoaded).toBe(true);
      expect(status).toBe("ready");
    });

    it("sets error status and returns error result on SDK/list failure", async () => {
      listGlobalSessionPages.mockRejectedValue(new Error("SDK failure"));

      const result = await useGlobalSessionsStore.getState().loadSessions();

      expect(useGlobalSessionsStore.getState().status).toBe("error");
      expect(result.activeSessions).toEqual([]);
      expect(result.archivedSessions).toEqual([]);
    });
  });

  // ── refreshGlobalSessions ─────────────────────────────────────────────────

  describe("refreshGlobalSessions", () => {
    it("fetches even when already loaded", async () => {
      const fetchedActive = [makeSession("rf1")];
      useGlobalSessionsStore.setState({ hasLoaded: true, status: "ready" });

      listGlobalSessionPages.mockImplementation(
        async (
          _client: unknown,
          opts: { archived: boolean; pageSize: number },
        ): Promise<Session[]> => {
          return opts.archived ? [] : fetchedActive;
        },
      );

      await refreshGlobalSessions();

      // Should have refetched both pages
      expect(listGlobalSessionPages).toHaveBeenCalledTimes(2);
    });
  });
});
