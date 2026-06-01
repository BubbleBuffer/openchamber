/* eslint-disable @typescript-eslint/no-explicit-any, no-empty, @typescript-eslint/no-require-imports */
import type { EventBus } from "../core/event-bus.js";
import { EVENTS } from "../core/events.js";

declare const AbortSignal: { timeout(ms: number): AbortSignal };


const { createBoundedMap }: { createBoundedMap: (opts: { maxSize: number; ttlMs: number }) => Map<unknown, unknown> } =
  require("../../../lib/core/bounded-cache.js") as any;

const { summarizeText }: { summarizeText: any } = require("../../../lib/text/summarization.js") as any;

interface BoundedMap<V> {
  get(key: unknown): V | undefined;
  set(key: unknown, value: V): void;
  dispose(): void;
}

export interface NotificationTemplateRuntime {
  createTimeoutSignal: (timeoutMs: number) => { signal: AbortSignal; cleanup: () => void };
  formatProjectLabel: (label: string) => string;
  resolveNotificationTemplate: (template: string, variables: Record<string, string>) => string;
  shouldApplyResolvedTemplateMessage: (template: string, resolved: string, variables: any) => boolean;
  fetchFreeZenModels: () => Promise<Array<{ id: string; owned_by: string }>>;
  resolveZenModel: (override?: string) => Promise<string>;
  validateZenModelAtStartup: () => Promise<void>;
  summarizeText: (text: string, targetLength: number, zenModel?: string) => Promise<string>;
  extractTextFromParts: (parts: any[], maxLength?: number) => string;
  extractLastMessageText: (payload: any, maxLength?: number) => string;
  fetchLastAssistantMessageText: (sessionId: string, messageId: string, maxLength?: number) => Promise<string>;
  maybeCacheSessionInfoFromEvent: (payload: any) => void;
  buildTemplateVariables: (payload: any, sessionId?: string) => Promise<Record<string, string>>;
  getCachedZenModels: () => any;
  dispose?: () => void;
}

export const createNotificationTemplateRuntime = (deps: {
  eventBus: EventBus;
  readSettingsFromDisk: () => Promise<any>;
  persistSettings: (settings: any) => Promise<void>;
  openCodeRuntime: any;
  resolveGitBinaryForSpawn: () => string;
}): NotificationTemplateRuntime => {
  const {
    eventBus,
    readSettingsFromDisk,
    persistSettings,
    openCodeRuntime,
    resolveGitBinaryForSpawn,
  } = deps;

  const NOTIFICATION_BODY_MAX_CHARS = 1000;
  const ZEN_DEFAULT_MODEL = "gpt-5-nano";
  const ZEN_MODELS_CACHE_TTL = 5 * 60 * 1000;

  let validatedZenFallback: string | null = null;
  let cachedZenModels: { models: Array<{ id: string; owned_by: string }> } | null = null;
  let cachedZenModelsTimestamp = 0;

  const sessionTitleCache = createBoundedMap({ maxSize: 500, ttlMs: 3600_000 }) as unknown as BoundedMap<string>;
  const sessionInfoCache = createBoundedMap({ maxSize: 500, ttlMs: 60_000 }) as unknown as BoundedMap<{ data: any }>;

  const createTimeoutSignal = (timeoutMs: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
      signal: controller.signal,
      cleanup: () => clearTimeout(timer),
    };
  };

  const formatProjectLabel = (label: string): string => {
    if (!label || typeof label !== "string") return "";
    return label
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const resolveNotificationTemplate = (template: string, variables: Record<string, string>): string => {
    if (!template || typeof template !== "string") return "";
    return template.replace(/\{(\w+)\}/g, (_match: string, key: string) => {
      const value = variables[key];
      if (value === undefined || value === null) return "";
      return String(value);
    });
  };

  const shouldApplyResolvedTemplateMessage = (template: string, resolved: string, variables: any): boolean => {
    if (!resolved) {
      return false;
    }

    if (typeof template !== "string") {
      return true;
    }

    if (template.includes("{last_message}")) {
      return typeof variables?.last_message === "string" && variables.last_message.trim().length > 0;
    }

    return true;
  };

  const fetchFreeZenModels = async (): Promise<Array<{ id: string; owned_by: string }>> => {
    const now = Date.now();
    if (cachedZenModels && now - cachedZenModelsTimestamp < ZEN_MODELS_CACHE_TTL) {
      return cachedZenModels.models;
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      const response = await fetch("https://opencode.ai/zen/v1/models", {
        signal: controller?.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`zen/v1/models responded with status ${response.status}`);
      }
      const data = await response.json() as any;
      const allModels = Array.isArray(data?.data) ? data.data : [];
      const freeModels = allModels
        .filter((model: any) => typeof model?.id === "string" && model.id.endsWith("-free"))
        .map((model: any) => ({ id: model.id, owned_by: model.owned_by }));

      cachedZenModels = { models: freeModels };
      cachedZenModelsTimestamp = Date.now();
      return freeModels;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  const resolveZenModel = async (override?: string): Promise<string> => {
    if (typeof override === "string" && override.trim().length > 0) {
      return override.trim();
    }
    try {
      const settings = await readSettingsFromDisk();
      if (typeof settings?.zenModel === "string" && settings.zenModel.trim().length > 0) {
        return settings.zenModel.trim();
      }
    } catch {
    }
    return validatedZenFallback || ZEN_DEFAULT_MODEL;
  };

  const validateZenModelAtStartup = async (): Promise<void> => {
    try {
      const freeModels = await fetchFreeZenModels();
      const freeModelIds = freeModels.map((model) => model.id);

      if (freeModelIds.length > 0) {
        validatedZenFallback = freeModelIds[0];

        const settings = await readSettingsFromDisk();
        const storedModel = typeof settings?.zenModel === "string" ? settings.zenModel.trim() : "";

        if (!storedModel || !freeModelIds.includes(storedModel)) {
          const fallback = freeModelIds[0];
          console.log(
            storedModel
              ? `[zen] Stored model "${storedModel}" not found in free models, falling back to "${fallback}"`
              : `[zen] No model configured, setting default to "${fallback}"`
          );
          await persistSettings({ zenModel: fallback });
        } else {
          console.log(`[zen] Stored model "${storedModel}" verified as available`);
          eventBus.emit(EVENTS.NOTIFICATION_SEND_UI, { payload: { type: "zen-model-ready" } });
        }
      } else {
        console.warn("[zen] No free models returned from API, skipping validation");
      }
    } catch (error) {
      console.warn("[zen] Startup model validation failed (non-blocking):", (error as any)?.message || error);
    }
  };

  const summarizeTextFn = async (text: string, targetLength: number, zenModel?: string): Promise<string> => {
    if (!text || typeof text !== "string" || text.trim().length === 0) return text;
    const result = await summarizeText({
      text,
      threshold: 0,
      maxLength: targetLength,
      zenModel: zenModel || ZEN_DEFAULT_MODEL,
      mode: "notification",
    });
    return typeof result?.summary === "string" && result.summary.trim().length > 0
      ? result.summary
      : text;
  };

  const extractTextFromParts = (parts: any[], maxLength = NOTIFICATION_BODY_MAX_CHARS): string => {
    if (!Array.isArray(parts) || parts.length === 0) return "";

    const textParts = parts
      .filter((part) => part && (part.type === "text" || typeof part.text === "string" || typeof part.content === "string"))
      .map((part) => part.text || part.content || "")
      .filter(Boolean);

    let text = textParts.length > 0 ? textParts.join("\n").trim() : "";

    if (maxLength > 0 && text.length > maxLength) {
      text = text.slice(0, maxLength);
    }

    return text;
  };

  const extractLastMessageText = (payload: any, maxLength = NOTIFICATION_BODY_MAX_CHARS): string => {
    const info = payload?.properties?.info;
    if (!info) return "";

    const parts = info.parts || payload?.properties?.parts;
    const text = extractTextFromParts(parts, maxLength);
    if (text) return text;

    const content = info.content;
    if (Array.isArray(content)) {
      const textContent = content
        .filter((entry: any) => entry && (entry.type === "text" || typeof entry.text === "string"))
        .map((entry: any) => entry.text || "")
        .filter(Boolean);
      if (textContent.length > 0) {
        let result = textContent.join("\n").trim();
        if (maxLength > 0 && result.length > maxLength) {
          result = result.slice(0, maxLength);
        }
        return result;
      }
    }

    return "";
  };

  const fetchLastAssistantMessageText = async (sessionId: string, messageId: string, maxLength = NOTIFICATION_BODY_MAX_CHARS): Promise<string> => {
    if (!sessionId) return "";

    try {
      const url = openCodeRuntime.getUrl(`/session/${encodeURIComponent(sessionId)}/message`, "");
      const response = await fetch(`${url}?limit=5`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...openCodeRuntime.getAuthHeaders(),
        },
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) return "";

      const messages = await response.json().catch(() => null) as any[];
      if (!Array.isArray(messages)) return "";

      let target: any = null;
      if (messageId) {
        target = messages.find((message) => message?.info?.id === messageId && message?.info?.role === "assistant");
      }
      if (!target) {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const message = messages[i];
          if (message?.info?.role === "assistant" && message?.info?.finish === "stop") {
            target = message;
            break;
          }
        }
      }

      if (!target || !Array.isArray(target.parts)) return "";

      return extractTextFromParts(target.parts, maxLength);
    } catch {
      return "";
    }
  };

  const cacheSessionTitle = (sessionId: string, title: string): void => {
    if (typeof sessionId === "string" && sessionId.length > 0 && typeof title === "string" && title.length > 0) {
      sessionTitleCache.set(sessionId, title);
    }
  };

  const getCachedSessionTitle = (sessionId: string): string | null => {
    return sessionTitleCache.get(sessionId) ?? null;
  };

  const maybeCacheSessionInfoFromEvent = (payload: any): void => {
    if (!payload || typeof payload !== "object") return;
    const type = payload.type;
    if (type !== "session.updated" && type !== "session.created") return;
    const info = payload.properties?.info;
    if (!info || typeof info !== "object") return;
    cacheSessionTitle(info.id, info.title);
  };

  const fetchSessionInfo = async (sessionId: string): Promise<any> => {
    if (!sessionId) return null;

    const cached = sessionInfoCache.get(sessionId);
    if (cached) return cached.data;

    try {
      const url = openCodeRuntime.getUrl(`/session/${encodeURIComponent(sessionId)}`, "");
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) {
        console.warn(`[Notification] fetchSessionInfo: ${response.status} for session ${sessionId}`);
        return null;
      }
      const data = await response.json().catch(() => null);
      if (data && typeof data === "object") {
        sessionInfoCache.set(sessionId, { data });
        return data;
      }
      return null;
    } catch (error) {
      console.warn(`[Notification] fetchSessionInfo failed for ${sessionId}:`, (error as any)?.message || error);
      return null;
    }
  };

  const buildTemplateVariables = async (payload: any, sessionId?: string): Promise<Record<string, string>> => {
    const info = payload?.properties?.info || {};

    let sessionTitle = payload?.properties?.sessionTitle || payload?.properties?.session?.title || (typeof info.sessionTitle === "string" ? info.sessionTitle : "") || "";

    if (!sessionTitle && sessionId) {
      const cached = getCachedSessionTitle(sessionId);
      if (cached) {
        sessionTitle = cached;
      }
    }

    let sessionInfo: any = null;
    if (!sessionTitle && sessionId) {
      sessionInfo = await fetchSessionInfo(sessionId);
      if (sessionInfo && typeof sessionInfo.title === "string") {
        sessionTitle = sessionInfo.title;
        cacheSessionTitle(sessionId, sessionTitle);
      }
    }

    const agentName = ((): string => {
      const mode = typeof info.agent === "string" && info.agent.trim().length > 0
        ? info.agent.trim()
        : (typeof info.mode === "string" ? info.mode.trim() : "");
      if (!mode) return "Agent";
      return mode.split(/[-_\s]+/).filter(Boolean)
        .map((token: string) => token.charAt(0).toUpperCase() + token.slice(1)).join(" ");
    })();

    const modelName = ((): string => {
      const raw = typeof info.modelID === "string" ? info.modelID.trim()
        : (typeof info.model?.modelID === "string" ? info.model.modelID.trim() : "");
      if (!raw) return "Assistant";
      return raw.split(/[-_]+/).filter(Boolean)
        .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
    })();

    let projectName = "";
    let branch = "";
    let worktreeDir = "";

    const infoPath = info.path as any;
    if (typeof infoPath?.root === "string" && infoPath.root.length > 0) {
      worktreeDir = infoPath.root;
    } else if (typeof infoPath?.cwd === "string" && infoPath.cwd.length > 0) {
      worktreeDir = infoPath.cwd;
    }

    try {
      const settings = await readSettingsFromDisk();
      const projects = Array.isArray(settings.projects) ? settings.projects : [];

      if (worktreeDir) {
        const normalizedDir = worktreeDir.replace(/\/+$/, "");
        const matchedProject = projects.find((project: any) => {
          if (!project || typeof project.path !== "string") return false;
          return project.path.replace(/\/+$/, "") === normalizedDir;
        });
        if (matchedProject && typeof matchedProject.label === "string" && matchedProject.label.trim().length > 0) {
          projectName = matchedProject.label.trim();
        } else {
          projectName = normalizedDir.split("/").filter(Boolean).pop() || "";
        }
      } else {
        const activeId = typeof settings.activeProjectId === "string" ? settings.activeProjectId : "";
        const activeProject = activeId ? projects.find((project: any) => project && project.id === activeId) : projects[0];
        if (activeProject) {
          projectName = typeof activeProject.label === "string" && activeProject.label.trim().length > 0
            ? activeProject.label.trim()
            : typeof activeProject.path === "string"
              ? activeProject.path.split("/").pop() || ""
              : "";
          worktreeDir = typeof activeProject.path === "string" ? activeProject.path : "";
        }
      }
    } catch {
      if (worktreeDir && !projectName) {
        projectName = worktreeDir.split("/").filter(Boolean).pop() || "";
      }
    }

    if (worktreeDir) {
      try {
        const { simpleGit } = await import("simple-git");
        const git = simpleGit(worktreeDir, {
          binary: resolveGitBinaryForSpawn(),
        });
        branch = (await Promise.race([
          git.revparse(["--abbrev-ref", "HEAD"]),
          new Promise((_, reject) => setTimeout(() => reject(new Error("git timeout")), 3000)),
        ]).catch(() => "")) as string;
      } catch {
      }
    }

    return {
      project_name: formatProjectLabel(projectName),
      worktree: worktreeDir,
      branch: typeof branch === "string" ? branch.trim() : "",
      session_name: sessionTitle,
      agent_name: agentName,
      model_name: modelName,
      last_message: "",
      session_id: sessionId || "",
    };
  };

  const getCachedZenModels = (): any => cachedZenModels;

  return {
    createTimeoutSignal,
    formatProjectLabel,
    resolveNotificationTemplate,
    shouldApplyResolvedTemplateMessage,
    fetchFreeZenModels,
    resolveZenModel,
    validateZenModelAtStartup,
    summarizeText: summarizeTextFn,
    extractTextFromParts,
    extractLastMessageText,
    fetchLastAssistantMessageText,
    maybeCacheSessionInfoFromEvent,
    buildTemplateVariables,
    getCachedZenModels,
    dispose: () => {
      sessionTitleCache.dispose();
      sessionInfoCache.dispose();
    },
  };
};