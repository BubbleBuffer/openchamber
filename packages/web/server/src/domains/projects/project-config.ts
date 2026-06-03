import { DateTime, IANAZone } from "luxon";
import { parseExpression } from "cron-parser";
import type {
  Execution,
  NormalizedTask,
  ProjectConfig,
  ProjectConfigDeps,
  ProjectConfigRuntime,
  Schedule,
  TaskState,
  UpsertResult,
  DeleteResult,
  UpdateStateResult,
} from "./types.js";

const PROJECT_CONFIG_VERSION = 1;
const MAX_TASK_NAME_LENGTH = 80;
const MAX_TASK_PROMPT_LENGTH = 20_000;
const MAX_CRON_LENGTH = 200;
const MAX_LAST_ERROR_LENGTH = 2_000;

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const clampLength = (value: unknown, maxLength: number): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
};

const normalizeStatus = (value: unknown): TaskState["lastStatus"] => {
  if (value === "running" || value === "success" || value === "error" || value === "idle") {
    return value;
  }
  return "idle";
};

const normalizeTimeValue = (value: unknown): string | null => {
  const time = asNonEmptyString(value);
  if (!time) {
    return null;
  }
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
    return null;
  }
  return time;
};

const normalizeDateValue = (value: unknown): string | null => {
  const date = asNonEmptyString(value);
  if (!date) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  const parsed = DateTime.fromISO(date, { zone: "UTC" });
  if (!parsed.isValid || parsed.toFormat("yyyy-LL-dd") !== date) {
    return null;
  }
  return date;
};

const normalizeWeekdays = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const unique = new Set<number>();
  for (const entry of value) {
    if (!Number.isInteger(entry)) {
      return null;
    }
    if (entry < 0 || entry > 6) {
      return null;
    }
    unique.add(entry);
  }

  if (unique.size === 0) {
    return null;
  }

  return Array.from(unique).sort((a, b) => a - b);
};

const resolveScheduleTimes = (value: Record<string, unknown> | undefined, existingSchedule?: Schedule): string[] | null => {
  const times: string[] = [];

  if (Array.isArray(value?.times)) {
    for (const item of value.times) {
      const normalized = normalizeTimeValue(item);
      if (!normalized) {
        throw new Error("schedule.times must contain HH:mm values");
      }
      times.push(normalized);
    }
  }

  const legacySingleTime = normalizeTimeValue(value?.time);
  if (legacySingleTime) {
    times.push(legacySingleTime);
  }

  if (times.length === 0 && Array.isArray(existingSchedule?.times)) {
    for (const item of existingSchedule.times) {
      const normalized = normalizeTimeValue(item);
      if (normalized) {
        times.push(normalized);
      }
    }
  }

  const uniqueSorted = Array.from(new Set(times)).sort((a, b) => a.localeCompare(b));
  if (uniqueSorted.length === 0) {
    return null;
  }
  return uniqueSorted;
};

const resolveDefaultTimezone = (): string => {
  const resolved = DateTime.local().zoneName;
  if (resolved && IANAZone.isValidZone(resolved)) {
    return resolved;
  }
  return "UTC";
};

const normalizeTimezone = (value: unknown, fallback: string = resolveDefaultTimezone()): string | null => {
  const timezone = asNonEmptyString(value);
  if (!timezone) {
    return fallback;
  }
  return IANAZone.isValidZone(timezone) ? timezone : null;
};

const validateCronExpression = (expression: string, timezone: string): boolean => {
  try {
    const iterator = parseExpression(expression, {
      tz: timezone,
      currentDate: new Date(),
    });
    iterator.next();
    return true;
  } catch {
    return false;
  }
};

const normalizeSchedule = (value: Record<string, unknown>, existingSchedule?: Schedule): Schedule => {
  if (!value || typeof value !== "object") {
    throw new Error("schedule is required");
  }

  const kind = asNonEmptyString(value.kind);
  if (kind !== "daily" && kind !== "weekly" && kind !== "once" && kind !== "cron") {
    throw new Error("schedule.kind must be daily, weekly, once, or cron");
  }

  const fallbackTimezone = existingSchedule?.timezone || resolveDefaultTimezone();
  const timezone = normalizeTimezone(value.timezone, fallbackTimezone);
  if (!timezone) {
    throw new Error("schedule.timezone must be a valid IANA timezone");
  }

  if (kind === "daily") {
    const times = resolveScheduleTimes(value, existingSchedule);
    if (!times) {
      throw new Error("schedule.times must include at least one HH:mm value for daily schedule");
    }
    return { kind, times, timezone };
  }

  if (kind === "weekly") {
    const times = resolveScheduleTimes(value, existingSchedule);
    if (!times) {
      throw new Error("schedule.times must include at least one HH:mm value for weekly schedule");
    }
    const weekdays = normalizeWeekdays(value.weekdays);
    if (!weekdays) {
      throw new Error("schedule.weekdays must include values from 0 to 6 for weekly schedule");
    }
    return { kind, times, weekdays, timezone };
  }

  if (kind === "once") {
    const date = normalizeDateValue(value.date);
    if (!date) {
      throw new Error("schedule.date must be YYYY-MM-DD for once schedule");
    }

    const time = normalizeTimeValue(value.time);
    if (!time) {
      throw new Error("schedule.time must be HH:mm for once schedule");
    }

    return { kind, date, time, timezone };
  }

  const cron = clampLength(asNonEmptyString(value.cron) || "", MAX_CRON_LENGTH);
  if (!cron) {
    throw new Error("schedule.cron is required for cron schedule");
  }

  if (!validateCronExpression(cron, timezone)) {
    throw new Error("schedule.cron is invalid");
  }

  return { kind, cron, timezone };
};

const normalizeExecution = (value: Record<string, unknown>): Execution => {
  if (!value || typeof value !== "object") {
    throw new Error("execution is required");
  }

  const prompt = clampLength(asNonEmptyString(value.prompt) || "", MAX_TASK_PROMPT_LENGTH);
  const providerID = asNonEmptyString(value.providerID);
  const modelID = asNonEmptyString(value.modelID);
  const variant = asNonEmptyString(value.variant);
  const agent = asNonEmptyString(value.agent);

  if (!prompt) {
    throw new Error("execution.prompt is required");
  }
  if (!providerID) {
    throw new Error("execution.providerID is required");
  }
  if (!modelID) {
    throw new Error("execution.modelID is required");
  }

  return {
    prompt,
    providerID,
    modelID,
    ...(variant ? { variant } : {}),
    ...(agent ? { agent } : {}),
  };
};

const normalizeState = (value: Record<string, unknown> | undefined, fallback?: TaskState): TaskState => {
  const source = value && typeof value === "object" ? value : fallback || {} as Record<string, unknown>;
  const lastRunAt = typeof source.lastRunAt === "number" && Number.isFinite(source.lastRunAt)
    ? Math.max(0, Math.round(source.lastRunAt))
    : undefined;
  const lastDurationMs = typeof source.lastDurationMs === "number" && Number.isFinite(source.lastDurationMs)
    ? Math.max(0, Math.round(source.lastDurationMs))
    : undefined;
  const nextRunAt = typeof source.nextRunAt === "number" && Number.isFinite(source.nextRunAt)
    ? Math.max(0, Math.round(source.nextRunAt))
    : undefined;
  const lastSessionId = asNonEmptyString(source.lastSessionId);
  const lastErrorRaw = asNonEmptyString(source.lastError);
  const lastError = lastErrorRaw ? clampLength(lastErrorRaw, MAX_LAST_ERROR_LENGTH) : undefined;

  return {
    createdAt: typeof source.createdAt === "number" && Number.isFinite(source.createdAt)
      ? Math.max(0, Math.round(source.createdAt))
      : Date.now(),
    updatedAt: typeof source.updatedAt === "number" && Number.isFinite(source.updatedAt)
      ? Math.max(0, Math.round(source.updatedAt))
      : Date.now(),
    lastStatus: normalizeStatus(source.lastStatus),
    ...(typeof lastRunAt === "number" ? { lastRunAt } : {}),
    ...(typeof lastDurationMs === "number" ? { lastDurationMs } : {}),
    ...(typeof nextRunAt === "number" ? { nextRunAt } : {}),
    ...(lastSessionId ? { lastSessionId } : {}),
    ...(lastError ? { lastError } : {}),
  };
};

export const normalizeTaskForStorage = (
  value: Record<string, unknown>,
  options: {
    now: number;
    createId: () => string;
    existingTask: NormalizedTask | null;
    allowCreate: boolean;
  }
): NormalizedTask => {
  const { now, createId, existingTask, allowCreate } = options;

  if (!value || typeof value !== "object") {
    throw new Error("task is required");
  }

  const incomingId = asNonEmptyString(value.id);
  const existingId = asNonEmptyString(existingTask?.id);

  if (existingTask) {
    if (incomingId && incomingId !== existingId) {
      throw new Error("task.id is immutable");
    }
  }

  if (!existingTask && incomingId && !allowCreate) {
    throw new Error("task.id does not exist");
  }

  const id = existingId || incomingId || createId();
  const name = clampLength(asNonEmptyString(value.name) || "", MAX_TASK_NAME_LENGTH);
  if (!name) {
    throw new Error("task.name is required");
  }

  const enabled = typeof value.enabled === "boolean"
    ? value.enabled
    : (existingTask?.enabled ?? true);

  const schedule = normalizeSchedule(value.schedule as Record<string, unknown>, existingTask?.schedule);
  const execution = normalizeExecution(value.execution as Record<string, unknown>);

  const nowMs = Math.max(0, Math.round(now));
  const baseState = normalizeState(value.state as Record<string, unknown> | undefined, existingTask?.state);
  const state: TaskState = {
    ...baseState,
    createdAt: existingTask?.state?.createdAt ?? baseState.createdAt ?? nowMs,
    updatedAt: nowMs,
  };

  return {
    id,
    name,
    enabled,
    schedule,
    execution,
    state,
  };
};

const createEmptyProjectConfig = (): ProjectConfig => ({
  version: PROJECT_CONFIG_VERSION,
  scheduledTasks: [],
});

export const createProjectConfigRuntime = (deps: ProjectConfigDeps): ProjectConfigRuntime => {
  const { fsPromises, path, projectsDirPath, createTaskID } = deps;

  const taskIDFactory = typeof createTaskID === "function"
    ? createTaskID
    : (() => {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
          return crypto.randomUUID();
        }
        return `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      });

  const writeLocks = new Map<string, Promise<void>>();

  const sanitizeProjectID = (projectID: string): string => {
    const value = asNonEmptyString(projectID);
    if (!value) {
      throw new Error("projectId is required");
    }
    if (!/^[a-zA-Z0-9._:-]+$/.test(value)) {
      throw new Error("projectId contains unsupported characters");
    }
    return value;
  };

  const resolveProjectConfigPath = (projectID: string): string => {
    const safeProjectID = sanitizeProjectID(projectID);
    return path.join(projectsDirPath, `${safeProjectID}.json`);
  };

  const readRawProjectConfigFromDisk = async (projectID: string): Promise<Record<string, unknown>> => {
    const filePath = resolveProjectConfigPath(projectID);
    try {
      const raw = await fsPromises.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error: unknown) {
      if (error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
  };

  const readProjectConfigFromDisk = async (projectID: string): Promise<ProjectConfig> => {
    const parsed = await readRawProjectConfigFromDisk(projectID);
    const tasksRaw = Array.isArray(parsed.scheduledTasks) ? parsed.scheduledTasks : [];
    const now = Date.now();
    const scheduledTasks: NormalizedTask[] = [];
    for (const task of tasksRaw) {
      try {
        const normalized = normalizeTaskForStorage(task as Record<string, unknown>, {
          now,
          createId: taskIDFactory,
          existingTask: null,
          allowCreate: true,
        });
        scheduledTasks.push(normalized);
      } catch {
        // skip invalid tasks on read
      }
    }
    return {
      version: PROJECT_CONFIG_VERSION,
      scheduledTasks,
    };
  };

  const writeProjectConfigToDisk = async (projectID: string, config: Partial<ProjectConfig>): Promise<void> => {
    const filePath = resolveProjectConfigPath(projectID);
    const parentDirectory = path.dirname(filePath);
    const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const existing = await readRawProjectConfigFromDisk(projectID);
    const merged = {
      ...existing,
      version: PROJECT_CONFIG_VERSION,
      scheduledTasks: Array.isArray(config?.scheduledTasks) ? config.scheduledTasks : [],
    };

    await fsPromises.mkdir(parentDirectory, { recursive: true });
    await fsPromises.writeFile(temporaryPath, JSON.stringify(merged, null, 2), "utf8");
    await fsPromises.rename(temporaryPath, filePath);
  };

  const withProjectWriteLock = async <T>(projectID: string, mutate: () => Promise<T>): Promise<T> => {
    const key = sanitizeProjectID(projectID);
    const previous = writeLocks.get(key) || Promise.resolve();
    let release: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.finally(() => next);
    writeLocks.set(key, chained);

    await previous;
    try {
      return await mutate();
    } finally {
      release!();
      const current = writeLocks.get(key);
      if (current === chained) {
        writeLocks.delete(key);
      }
    }
  };

  const listScheduledTasks = async (projectID: string): Promise<NormalizedTask[]> => {
    const config = await readProjectConfigFromDisk(projectID);
    return config.scheduledTasks;
  };

  const upsertScheduledTask = async (projectID: string, taskInput: Record<string, unknown>): Promise<UpsertResult> => {
    return withProjectWriteLock(projectID, async () => {
      const now = Date.now();
      const current = await readProjectConfigFromDisk(projectID);
      const incomingID = asNonEmptyString(taskInput?.id);
      const existingIndex = incomingID
        ? current.scheduledTasks.findIndex((task) => task.id === incomingID)
        : -1;
      const existingTask = existingIndex >= 0 ? current.scheduledTasks[existingIndex] : null;

      const normalizedTask = normalizeTaskForStorage(taskInput, {
        now,
        createId: taskIDFactory,
        existingTask,
        allowCreate: true,
      });

      const nextTasks = current.scheduledTasks.slice();
      const created = !existingTask;
      if (existingIndex >= 0) {
        nextTasks[existingIndex] = normalizedTask;
      } else {
        nextTasks.push(normalizedTask);
      }

      const nextConfig = {
        version: PROJECT_CONFIG_VERSION,
        scheduledTasks: nextTasks,
      };
      await writeProjectConfigToDisk(projectID, nextConfig);

      return {
        task: normalizedTask,
        tasks: nextTasks,
        created,
      };
    });
  };

  const deleteScheduledTask = async (projectID: string, taskID: string): Promise<DeleteResult> => {
    return withProjectWriteLock(projectID, async () => {
      const normalizedTaskID = asNonEmptyString(taskID);
      if (!normalizedTaskID) {
        throw new Error("taskId is required");
      }

      const current = await readProjectConfigFromDisk(projectID);
      const nextTasks = current.scheduledTasks.filter((task) => task.id !== normalizedTaskID);
      const deleted = nextTasks.length !== current.scheduledTasks.length;

      if (deleted) {
        await writeProjectConfigToDisk(projectID, {
          version: PROJECT_CONFIG_VERSION,
          scheduledTasks: nextTasks,
        });
      }

      return {
        deleted,
        tasks: nextTasks,
      };
    });
  };

  const updateScheduledTaskState = async (
    projectID: string,
    taskID: string,
    statePatch: Record<string, unknown>
  ): Promise<UpdateStateResult> => {
    return withProjectWriteLock(projectID, async () => {
      const normalizedTaskID = asNonEmptyString(taskID);
      if (!normalizedTaskID) {
        throw new Error("taskId is required");
      }

      const current = await readProjectConfigFromDisk(projectID);
      const taskIndex = current.scheduledTasks.findIndex((task) => task.id === normalizedTaskID);
      if (taskIndex === -1) {
        return { task: null, tasks: current.scheduledTasks };
      }

      const currentTask = current.scheduledTasks[taskIndex];
      const patchObject = statePatch && typeof statePatch === "object" ? statePatch : {};
      const nextTask: NormalizedTask = {
        ...currentTask,
        state: normalizeState(
          {
            ...currentTask.state,
            ...patchObject,
            updatedAt: Date.now(),
          },
          currentTask.state
        ),
      };

      const nextTasks = current.scheduledTasks.slice();
      nextTasks[taskIndex] = nextTask;

      await writeProjectConfigToDisk(projectID, {
        version: PROJECT_CONFIG_VERSION,
        scheduledTasks: nextTasks,
      });

      return {
        task: nextTask,
        tasks: nextTasks,
      };
    });
  };

  return {
    listScheduledTasks,
    upsertScheduledTask,
    deleteScheduledTask,
    updateScheduledTaskState,
    resolveProjectConfigPath,
  };
};
