import { describe, it, expect, beforeEach } from "bun:test";
import { useNotificationSettingsStore } from "./useNotificationSettingsStore";

// ---------------------------------------------------------------------------
// Defaults — mirror the shape declared in useNotificationSettingsStore
// ---------------------------------------------------------------------------
const DEFAULTS = {
  nativeNotificationsEnabled: false,
  notificationMode: "hidden-only" as const,
  notifyOnSubtasks: true,
  notifyOnCompletion: true,
  notifyOnError: true,
  notifyOnQuestion: true,
  notificationTemplates: {
    completion: { title: "", message: "" },
    error: { title: "", message: "" },
    question: { title: "", message: "" },
    subtask: { title: "", message: "" },
  },
  summarizeLastMessage: false,
  summaryThreshold: 200,
  summaryLength: 100,
  maxLastMessageLength: 250,
};

// ---------------------------------------------------------------------------
// Reset helper — replaces setState without notifying subscribers
// ---------------------------------------------------------------------------
function resetStore(): void {
  useNotificationSettingsStore.setState({ ...DEFAULTS }, false);
}

// ===========================================================================
// Store tests
// ===========================================================================
describe("useNotificationSettingsStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // 1. setNativeNotificationsEnabled
  // -------------------------------------------------------------------------
  describe("setNativeNotificationsEnabled", () => {
    it("updates nativeNotificationsEnabled when called with true", () => {
      useNotificationSettingsStore.getState().setNativeNotificationsEnabled(true);
      expect(useNotificationSettingsStore.getState().nativeNotificationsEnabled).toBe(true);
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState({ nativeNotificationsEnabled: true }, false);
      expect(useNotificationSettingsStore.getState().nativeNotificationsEnabled).toBe(true);
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setNativeNotificationsEnabled(true);
      const state = useNotificationSettingsStore.getState();
      expect(state.notificationMode).toBe(DEFAULTS.notificationMode);
      expect(state.notifyOnSubtasks).toBe(DEFAULTS.notifyOnSubtasks);
      expect(state.summarizeLastMessage).toBe(DEFAULTS.summarizeLastMessage);
      expect(state.summaryThreshold).toBe(DEFAULTS.summaryThreshold);
      expect(state.maxLastMessageLength).toBe(DEFAULTS.maxLastMessageLength);
    });
  });

  // -------------------------------------------------------------------------
  // 2. setNotificationMode
  // -------------------------------------------------------------------------
  describe("setNotificationMode", () => {
    it("updates notificationMode when called with 'always'", () => {
      useNotificationSettingsStore.getState().setNotificationMode("always");
      expect(useNotificationSettingsStore.getState().notificationMode).toBe("always");
    });

    it("updates notificationMode when called with 'hidden-only'", () => {
      useNotificationSettingsStore.getState().setNotificationMode("always");
      useNotificationSettingsStore.getState().setNotificationMode("hidden-only");
      expect(useNotificationSettingsStore.getState().notificationMode).toBe("hidden-only");
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState({ notificationMode: "always" }, false);
      expect(useNotificationSettingsStore.getState().notificationMode).toBe("always");
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setNotificationMode("always");
      const state = useNotificationSettingsStore.getState();
      expect(state.nativeNotificationsEnabled).toBe(DEFAULTS.nativeNotificationsEnabled);
      expect(state.notifyOnSubtasks).toBe(DEFAULTS.notifyOnSubtasks);
      expect(state.notifyOnCompletion).toBe(DEFAULTS.notifyOnCompletion);
      expect(state.summaryLength).toBe(DEFAULTS.summaryLength);
      expect(state.maxLastMessageLength).toBe(DEFAULTS.maxLastMessageLength);
    });
  });

  // -------------------------------------------------------------------------
  // 3. setNotifyOnSubtasks
  // -------------------------------------------------------------------------
  describe("setNotifyOnSubtasks", () => {
    it("updates notifyOnSubtasks when called with false", () => {
      useNotificationSettingsStore.getState().setNotifyOnSubtasks(false);
      expect(useNotificationSettingsStore.getState().notifyOnSubtasks).toBe(false);
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState({ notifyOnSubtasks: false }, false);
      expect(useNotificationSettingsStore.getState().notifyOnSubtasks).toBe(false);
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setNotifyOnSubtasks(false);
      const state = useNotificationSettingsStore.getState();
      expect(state.nativeNotificationsEnabled).toBe(DEFAULTS.nativeNotificationsEnabled);
      expect(state.notificationMode).toBe(DEFAULTS.notificationMode);
      expect(state.notifyOnError).toBe(DEFAULTS.notifyOnError);
      expect(state.notifyOnQuestion).toBe(DEFAULTS.notifyOnQuestion);
      expect(state.summaryThreshold).toBe(DEFAULTS.summaryThreshold);
    });
  });

  // -------------------------------------------------------------------------
  // 4. setNotifyOnCompletion
  // -------------------------------------------------------------------------
  describe("setNotifyOnCompletion", () => {
    it("updates notifyOnCompletion when called with false", () => {
      useNotificationSettingsStore.getState().setNotifyOnCompletion(false);
      expect(useNotificationSettingsStore.getState().notifyOnCompletion).toBe(false);
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState({ notifyOnCompletion: false }, false);
      expect(useNotificationSettingsStore.getState().notifyOnCompletion).toBe(false);
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setNotifyOnCompletion(false);
      const state = useNotificationSettingsStore.getState();
      expect(state.nativeNotificationsEnabled).toBe(DEFAULTS.nativeNotificationsEnabled);
      expect(state.notifyOnSubtasks).toBe(DEFAULTS.notifyOnSubtasks);
      expect(state.notifyOnError).toBe(DEFAULTS.notifyOnError);
      expect(state.notifyOnQuestion).toBe(DEFAULTS.notifyOnQuestion);
      expect(state.maxLastMessageLength).toBe(DEFAULTS.maxLastMessageLength);
    });
  });

  // -------------------------------------------------------------------------
  // 5. setNotifyOnError
  // -------------------------------------------------------------------------
  describe("setNotifyOnError", () => {
    it("updates notifyOnError when called with false", () => {
      useNotificationSettingsStore.getState().setNotifyOnError(false);
      expect(useNotificationSettingsStore.getState().notifyOnError).toBe(false);
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState({ notifyOnError: false }, false);
      expect(useNotificationSettingsStore.getState().notifyOnError).toBe(false);
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setNotifyOnError(false);
      const state = useNotificationSettingsStore.getState();
      expect(state.notifyOnSubtasks).toBe(DEFAULTS.notifyOnSubtasks);
      expect(state.notifyOnCompletion).toBe(DEFAULTS.notifyOnCompletion);
      expect(state.notifyOnQuestion).toBe(DEFAULTS.notifyOnQuestion);
      expect(state.summarizeLastMessage).toBe(DEFAULTS.summarizeLastMessage);
      expect(state.summaryLength).toBe(DEFAULTS.summaryLength);
    });
  });

  // -------------------------------------------------------------------------
  // 6. setNotifyOnQuestion
  // -------------------------------------------------------------------------
  describe("setNotifyOnQuestion", () => {
    it("updates notifyOnQuestion when called with false", () => {
      useNotificationSettingsStore.getState().setNotifyOnQuestion(false);
      expect(useNotificationSettingsStore.getState().notifyOnQuestion).toBe(false);
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState({ notifyOnQuestion: false }, false);
      expect(useNotificationSettingsStore.getState().notifyOnQuestion).toBe(false);
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setNotifyOnQuestion(false);
      const state = useNotificationSettingsStore.getState();
      expect(state.nativeNotificationsEnabled).toBe(DEFAULTS.nativeNotificationsEnabled);
      expect(state.notifyOnSubtasks).toBe(DEFAULTS.notifyOnSubtasks);
      expect(state.notifyOnCompletion).toBe(DEFAULTS.notifyOnCompletion);
      expect(state.notifyOnError).toBe(DEFAULTS.notifyOnError);
      expect(state.maxLastMessageLength).toBe(DEFAULTS.maxLastMessageLength);
    });
  });

  // -------------------------------------------------------------------------
  // 7. setNotificationTemplates — full replacement (no internal merge)
  // -------------------------------------------------------------------------
  describe("setNotificationTemplates", () => {
    const customTemplates = {
      completion: { title: "done", message: "completed!" },
      error: { title: "fail", message: "errored!" },
      question: { title: "ask", message: "question!" },
      subtask: { title: "sub", message: "subtask!" },
    };

    it("replaces notificationTemplates with a full new object", () => {
      useNotificationSettingsStore.getState().setNotificationTemplates(customTemplates);
      expect(useNotificationSettingsStore.getState().notificationTemplates).toEqual(
        customTemplates,
      );
    });

    it("does a full replacement (not a merge)", () => {
      const partial = {
        ...customTemplates,
        completion: { title: "partial", message: "partial-msg" },
      };
      useNotificationSettingsStore.getState().setNotificationTemplates(customTemplates);
      useNotificationSettingsStore.getState().setNotificationTemplates(partial);
      // Should NOT contain any leftover from customTemplates that isn't in partial
      expect(useNotificationSettingsStore.getState().notificationTemplates).toEqual(
        partial,
      );
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState(
        { notificationTemplates: customTemplates },
        false,
      );
      expect(useNotificationSettingsStore.getState().notificationTemplates).toEqual(
        customTemplates,
      );
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setNotificationTemplates(customTemplates);
      const state = useNotificationSettingsStore.getState();
      expect(state.nativeNotificationsEnabled).toBe(DEFAULTS.nativeNotificationsEnabled);
      expect(state.notificationMode).toBe(DEFAULTS.notificationMode);
      expect(state.notifyOnSubtasks).toBe(DEFAULTS.notifyOnSubtasks);
      expect(state.summaryThreshold).toBe(DEFAULTS.summaryThreshold);
      expect(state.maxLastMessageLength).toBe(DEFAULTS.maxLastMessageLength);
    });
  });

  // -------------------------------------------------------------------------
  // 8. setSummarizeLastMessage
  // -------------------------------------------------------------------------
  describe("setSummarizeLastMessage", () => {
    it("updates summarizeLastMessage when called with true", () => {
      useNotificationSettingsStore.getState().setSummarizeLastMessage(true);
      expect(useNotificationSettingsStore.getState().summarizeLastMessage).toBe(true);
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState({ summarizeLastMessage: true }, false);
      expect(useNotificationSettingsStore.getState().summarizeLastMessage).toBe(true);
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setSummarizeLastMessage(true);
      const state = useNotificationSettingsStore.getState();
      expect(state.nativeNotificationsEnabled).toBe(DEFAULTS.nativeNotificationsEnabled);
      expect(state.notificationMode).toBe(DEFAULTS.notificationMode);
      expect(state.notifyOnSubtasks).toBe(DEFAULTS.notifyOnSubtasks);
      expect(state.summaryThreshold).toBe(DEFAULTS.summaryThreshold);
      expect(state.maxLastMessageLength).toBe(DEFAULTS.maxLastMessageLength);
    });
  });

  // -------------------------------------------------------------------------
  // 9. setSummaryThreshold
  // -------------------------------------------------------------------------
  describe("setSummaryThreshold", () => {
    it("updates summaryThreshold when called with 500", () => {
      useNotificationSettingsStore.getState().setSummaryThreshold(500);
      expect(useNotificationSettingsStore.getState().summaryThreshold).toBe(500);
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState({ summaryThreshold: 500 }, false);
      expect(useNotificationSettingsStore.getState().summaryThreshold).toBe(500);
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setSummaryThreshold(500);
      const state = useNotificationSettingsStore.getState();
      expect(state.nativeNotificationsEnabled).toBe(DEFAULTS.nativeNotificationsEnabled);
      expect(state.notificationMode).toBe(DEFAULTS.notificationMode);
      expect(state.notifyOnSubtasks).toBe(DEFAULTS.notifyOnSubtasks);
      expect(state.summarizeLastMessage).toBe(DEFAULTS.summarizeLastMessage);
      expect(state.summaryLength).toBe(DEFAULTS.summaryLength);
    });
  });

  // -------------------------------------------------------------------------
  // 10. setSummaryLength
  // -------------------------------------------------------------------------
  describe("setSummaryLength", () => {
    it("updates summaryLength when called with 50", () => {
      useNotificationSettingsStore.getState().setSummaryLength(50);
      expect(useNotificationSettingsStore.getState().summaryLength).toBe(50);
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState({ summaryLength: 50 }, false);
      expect(useNotificationSettingsStore.getState().summaryLength).toBe(50);
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setSummaryLength(50);
      const state = useNotificationSettingsStore.getState();
      expect(state.nativeNotificationsEnabled).toBe(DEFAULTS.nativeNotificationsEnabled);
      expect(state.notificationMode).toBe(DEFAULTS.notificationMode);
      expect(state.notifyOnSubtasks).toBe(DEFAULTS.notifyOnSubtasks);
      expect(state.summaryThreshold).toBe(DEFAULTS.summaryThreshold);
      expect(state.maxLastMessageLength).toBe(DEFAULTS.maxLastMessageLength);
    });
  });

  // -------------------------------------------------------------------------
  // 11. setMaxLastMessageLength
  // -------------------------------------------------------------------------
  describe("setMaxLastMessageLength", () => {
    it("updates maxLastMessageLength when called with 500", () => {
      useNotificationSettingsStore.getState().setMaxLastMessageLength(500);
      expect(useNotificationSettingsStore.getState().maxLastMessageLength).toBe(500);
    });

    it("can be set via setState partial form", () => {
      useNotificationSettingsStore.setState({ maxLastMessageLength: 500 }, false);
      expect(useNotificationSettingsStore.getState().maxLastMessageLength).toBe(500);
    });

    it("preserves other fields when called", () => {
      useNotificationSettingsStore.getState().setMaxLastMessageLength(500);
      const state = useNotificationSettingsStore.getState();
      expect(state.nativeNotificationsEnabled).toBe(DEFAULTS.nativeNotificationsEnabled);
      expect(state.notificationMode).toBe(DEFAULTS.notificationMode);
      expect(state.notifyOnSubtasks).toBe(DEFAULTS.notifyOnSubtasks);
      expect(state.summaryThreshold).toBe(DEFAULTS.summaryThreshold);
      expect(state.summaryLength).toBe(DEFAULTS.summaryLength);
    });
  });
});
