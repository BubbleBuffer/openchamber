import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { DateTime } from "luxon";
import { parseExpression } from "cron-parser";
import type {
  ScheduledTaskDeps,
  ScheduledTasksRuntime,
  TimeParts,
  ParsedCommand,
} from "./types.js";
import type { NormalizedTask } from "../projects/types.js";

const DEFAULT_GLOBAL_CONCURRENCY = 4;
const DEFAULT_PROJECT_CONCURRENCY = 2;
const DEFAULT_MAX_RUN_MS = 30 * 60 * 1000;
const JITTER_MAX_MS = 2_000;
const TASK_TITLE_MAX_LENGTH = 120;
const TASK_DUE_SLACK_MS = 5_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

const buildTaskKey = (projectID: string, taskID: string): string =>
  `${projectID}:${taskID}`;

function parseTimeParts(time: unknown): TimeParts | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
    typeof time === "string" ? time : "",
  );
  if (!match) {
    return null;
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function applyTimeToDate(baseDateTime: DateTime, time: string): DateTime | null {
  const parsed = parseTimeParts(time);
  if (!parsed) {
    return null;
  }
  return baseDateTime.set({
    hour: parsed.hour,
    minute: parsed.minute,
    second: 0,
    millisecond: 0,
  });
}

function resolveScheduleTimes(schedule: unknown): string[] {
  const times: string[] = [];
  const sched = schedule as Record<string, unknown> | null | undefined;
  if (Array.isArray(sched?.times)) {
    for (const candidate of sched.times as string[]) {
      if (
        typeof candidate === "string" &&
        /^([01]\d|2[0-3]):([0-5]\d)$/.test(candidate)
      ) {
        times.push(candidate);
      }
    }
  }
  if (
    times.length === 0 &&
    typeof sched?.time === "string" &&
    /^([01]\d|2[0-3]):([0-5]\d)$/.test(sched.time)
  ) {
    times.push(sched.time);
  }
  return Array.from(new Set(times)).sort((a, b) => a.localeCompare(b));
}

function weekdayAsZeroBased(dateTime: DateTime): number | null {
  if (typeof dateTime.weekday !== "number") {
    return null;
  }
  return dateTime.weekday % 7;
}

function safeErrorMessage(error: unknown, maxLength: number = 2_000): string {
  const raw =
    error instanceof Error
      ? error.message || String(error)
      : String(error ?? "Unknown error");
  const trimmed = raw.trim();
  if (!trimmed) {
    return "Unknown error";
  }
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function parseScheduledCommandPrompt(
  prompt: unknown,
): ParsedCommand | null {
  if (typeof prompt !== "string") {
    return null;
  }

  const trimmed = prompt.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0] || "";
  const [head, ...tail] = firstLine.split(/\s+/);
  const commandName = (head || "").slice(1).trim();
  if (!commandName) {
    return null;
  }

  return {
    command: commandName,
    arguments: tail.join(" ").trim(),
  };
}

export function computeNextRunAt(
  task: NormalizedTask | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!task?.enabled) {
    return null;
  }

  const schedule = task.schedule;
  if (!schedule || typeof schedule !== "object") {
    return null;
  }

  const sched = schedule as unknown as Record<string, unknown>;
  const zone =
    typeof sched.timezone === "string" && sched.timezone.trim().length > 0
      ? sched.timezone.trim()
      : DateTime.local().zoneName;

  const now = DateTime.fromMillis(nowMs, { zone: zone! });
  if (!now.isValid) {
    return null;
  }

  if (sched.kind === "daily") {
    const times = resolveScheduleTimes(schedule);
    if (times.length === 0) {
      return null;
    }
    const minAllowed = now.plus({ milliseconds: TASK_DUE_SLACK_MS });

    for (const time of times) {
      const candidateToday = applyTimeToDate(now, time);
      if (!candidateToday || !candidateToday.isValid) {
        continue;
      }
      if (candidateToday > minAllowed) {
        return candidateToday.toMillis();
      }
    }

    const tomorrow = now.plus({ days: 1 });
    const firstTomorrow = applyTimeToDate(tomorrow, times[0]);
    return firstTomorrow?.isValid ? firstTomorrow.toMillis() : null;
  }

  if (sched.kind === "weekly") {
    if (!Array.isArray(sched.weekdays) || sched.weekdays.length === 0) {
      return null;
    }
    const times = resolveScheduleTimes(schedule);
    if (times.length === 0) {
      return null;
    }
    const weekdaysSet = new Set(sched.weekdays as number[]);
    const minAllowed = now.plus({ milliseconds: TASK_DUE_SLACK_MS });

    for (let dayOffset = 0; dayOffset <= 14; dayOffset += 1) {
      const dayCandidate = now.plus({ days: dayOffset });
      const zeroBasedWeekday = weekdayAsZeroBased(dayCandidate);
      if (zeroBasedWeekday === null || !weekdaysSet.has(zeroBasedWeekday)) {
        continue;
      }
      for (const time of times) {
        const withTime = applyTimeToDate(dayCandidate, time);
        if (!withTime || !withTime.isValid) {
          continue;
        }
        if (withTime > minAllowed) {
          return withTime.toMillis();
        }
      }
    }
    return null;
  }

  if (sched.kind === "once") {
    if (
      typeof sched.date !== "string" ||
      typeof sched.time !== "string"
    ) {
      return null;
    }

    const parsed = DateTime.fromFormat(
      `${sched.date} ${sched.time}`,
      "yyyy-LL-dd HH:mm",
      { zone: zone! },
    );
    if (!parsed.isValid) {
      return null;
    }

    const minAllowed = now.plus({ milliseconds: TASK_DUE_SLACK_MS });
    if (parsed <= minAllowed) {
      return null;
    }

    return parsed.toMillis();
  }

  if (sched.kind === "cron") {
    try {
      const iterator = parseExpression(
        sched.cron as string,
        {
          tz: zone!,
          currentDate: new Date(nowMs),
        },
      );
      return iterator.next().getTime();
    } catch {
      return null;
    }
  }

  return null;
}

export function formatScheduledSessionTitle(
  task: NormalizedTask | null | undefined,
  nowMs: number = Date.now(),
): string {
  const timezone =
    typeof task?.schedule?.timezone === "string" &&
    task.schedule.timezone.trim().length > 0
      ? task.schedule.timezone.trim()
      : DateTime.local().zoneName;
  const stamp = DateTime.fromMillis(nowMs, {
    zone: timezone,
  }).toFormat("yyyy-LL-dd HH:mm");
  const taskName =
    typeof task?.name === "string" && task.name.trim().length > 0
      ? task.name.trim()
      : "Scheduled task";
  const suffix = ` ${stamp}`;
  const maxTaskNameLength = Math.max(
    1,
    TASK_TITLE_MAX_LENGTH - suffix.length,
  );
  const trimmedName =
    taskName.length > maxTaskNameLength
      ? taskName.slice(0, maxTaskNameLength)
      : taskName;
  return `${trimmedName}${suffix}`;
}

export function createScheduledTasksRuntime(
  deps: ScheduledTaskDeps,
): ScheduledTasksRuntime {
  const {
    projectConfigRuntime,
    listProjects,
    getOpenCodeRuntime: _getOpenCodeRuntime,
    waitForOpenCodeReady,
    emitTaskRunEvent,
    logger = console,
    maxGlobalConcurrency = DEFAULT_GLOBAL_CONCURRENCY,
    maxProjectConcurrency = DEFAULT_PROJECT_CONCURRENCY,
    maxRunDurationMs = DEFAULT_MAX_RUN_MS,
  } = deps;

  let started = false;
  const tasksByProject = new Map<string, Map<string, NormalizedTask>>();
  const projectPathByID = new Map<string, string>();
  const timersByTaskKey = new Map<string, ReturnType<typeof setTimeout>>();
  const queuedTaskKeys = new Set<string>();
  const runningTaskKeys = new Set<string>();
  const runningCountByProject = new Map<string, number>();
  let runningGlobalCount = 0;
  const queue: Array<{ projectID: string; taskID: string; reason: string }> = [];

  const clearTimerForKey = (taskKey: string) => {
    const timer = timersByTaskKey.get(taskKey);
    if (timer) {
      clearTimeout(timer);
      timersByTaskKey.delete(taskKey);
    }
  };

  const clearProjectTimers = (projectID: string) => {
    const tasks = tasksByProject.get(projectID);
    if (!tasks) {
      return;
    }
    for (const task of tasks.values()) {
      clearTimerForKey(buildTaskKey(projectID, task.id));
      queuedTaskKeys.delete(buildTaskKey(projectID, task.id));
    }
  };

  const setProjectTasks = (
    projectID: string,
    tasks: NormalizedTask[],
  ) => {
    clearProjectTimers(projectID);
    const taskMap = new Map<string, NormalizedTask>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }
    tasksByProject.set(projectID, taskMap);
  };

  const scheduleTask = (
    projectID: string,
    taskID: string,
    nextRunAt: number,
  ) => {
    const taskKey = buildTaskKey(projectID, taskID);
    clearTimerForKey(taskKey);

    if (!Number.isFinite(nextRunAt) || nextRunAt <= 0) {
      return;
    }

    const delayBase = Math.max(0, Math.round(nextRunAt - Date.now()));
    const jitter = Math.floor(Math.random() * (JITTER_MAX_MS + 1));
    const delay = delayBase + jitter;
    const boundedDelay = Math.min(delay, MAX_TIMER_DELAY_MS);

    const timer = setTimeout(async () => {
      if (delay > MAX_TIMER_DELAY_MS) {
        scheduleTask(projectID, taskID, nextRunAt);
        return;
      }

      clearTimerForKey(taskKey);
      const taskMap = tasksByProject.get(projectID);
      const task = taskMap?.get(taskID);
      if (!task || !task.enabled) {
        return;
      }
      queueTaskRun(projectID, taskID, "scheduled");
      pumpQueue();
    }, boundedDelay);

    timersByTaskKey.set(taskKey, timer);
  };

  const updateInMemoryTask = (
    projectID: string,
    nextTask: NormalizedTask | null,
  ) => {
    if (!nextTask) {
      return;
    }
    const taskMap = tasksByProject.get(projectID);
    if (!taskMap) {
      return;
    }
    taskMap.set(nextTask.id, nextTask);
  };

  const syncTaskSchedule = async (
    projectID: string,
    task: NormalizedTask,
  ) => {
    const nextRunAt = computeNextRunAt(task, Date.now());
    const statePatch: Record<string, unknown> = {
      nextRunAt: Number.isFinite(nextRunAt) ? nextRunAt : undefined,
      updatedAt: Date.now(),
    };
    const result = await projectConfigRuntime.updateScheduledTaskState(
      projectID,
      task.id,
      statePatch as Partial<NormalizedTask["state"]>,
    );
    if (result.task) {
      updateInMemoryTask(projectID, result.task);
      if (
        result.task.enabled &&
        Number.isFinite(result.task.state?.nextRunAt)
      ) {
        scheduleTask(
          projectID,
          result.task.id,
          result.task.state!.nextRunAt!,
        );
      }
    }
  };

  const ensureProjectPath = async (
    projectID: string,
  ): Promise<string | null> => {
    if (projectPathByID.has(projectID)) {
      return projectPathByID.get(projectID) || null;
    }

    try {
      const projects = await listProjects();
      const project = projects.find(
        (item) => item?.id === projectID && item?.path,
      );
      if (project?.path) {
        projectPathByID.set(projectID, project.path);
        return project.path;
      }
    } catch {
      // ignore
    }

    return null;
  };

  const syncProject = async (projectID: string): Promise<NormalizedTask[]> => {
    await ensureProjectPath(projectID);

    const tasks = await projectConfigRuntime.listScheduledTasks(projectID);
    setProjectTasks(projectID, tasks);

    for (const task of tasks) {
      await syncTaskSchedule(projectID, task);
    }

    return tasks;
  };

  const syncAllProjects = async () => {
    const projects = await listProjects();
    const activeProjectIDs = new Set<string>();
    projectPathByID.clear();
    for (const project of projects) {
      if (!project?.id || !project?.path) {
        continue;
      }
      activeProjectIDs.add(project.id);
      projectPathByID.set(project.id, project.path);
    }

    for (const existingProjectID of Array.from(tasksByProject.keys())) {
      if (!activeProjectIDs.has(existingProjectID)) {
        clearProjectTimers(existingProjectID);
        tasksByProject.delete(existingProjectID);
      }
    }

    for (const projectID of activeProjectIDs) {
      await syncProject(projectID);
    }
  };

  const queueTaskRun = (
    projectID: string,
    taskID: string,
    reason: string,
  ) => {
    const taskKey = buildTaskKey(projectID, taskID);
    if (queuedTaskKeys.has(taskKey) || runningTaskKeys.has(taskKey)) {
      return;
    }
    queuedTaskKeys.add(taskKey);
    queue.push({ projectID, taskID, reason });
  };

  const canRunTask = (projectID: string): boolean => {
    if (runningGlobalCount >= maxGlobalConcurrency) {
      return false;
    }
    const projectRunning = runningCountByProject.get(projectID) || 0;
    return projectRunning < maxProjectConcurrency;
  };

  const buildPromptAsyncPayload = (task: NormalizedTask) => ({
    model: {
      providerID: task.execution.providerID,
      modelID: task.execution.modelID,
    },
    ...(task.execution.agent ? { agent: task.execution.agent } : {}),
    ...(task.execution.variant ? { variant: task.execution.variant } : {}),
    parts: [
      {
        type: "text",
        text: task.execution.prompt,
      },
    ],
  });

  const runPromptAsync = async ({
    baseUrl,
    authHeaders,
    sessionID,
    projectPath,
    task,
  }: {
    baseUrl: string;
    authHeaders: Record<string, string>;
    sessionID: string;
    projectPath: string;
    task: NormalizedTask;
  }) => {
    const promptUrl = new URL(
      `${baseUrl}/session/${encodeURIComponent(sessionID)}/prompt_async`,
    );
    promptUrl.searchParams.set("directory", projectPath);
    const response = await fetch(promptUrl.toString(), {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(buildPromptAsyncPayload(task)),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `prompt_async failed (${response.status})${body ? `: ${body}` : ""}`,
      );
    }
  };

  const runScheduledCommandIfApplicable = async ({
    client,
    projectPath,
    sessionID,
    task,
  }: {
    client: ReturnType<typeof createOpencodeClient>;
    projectPath: string;
    sessionID: string;
    task: NormalizedTask;
  }): Promise<boolean> => {
    const parsed = parseScheduledCommandPrompt(task?.execution?.prompt);
    if (!parsed) {
      return false;
    }

    let commands: Array<{ name?: string }> = [];
    try {
      const response = await client.command.list({
        directory: projectPath,
      });
      commands = Array.isArray(response?.data) ? response.data : [];
    } catch {
      return false;
    }

    const hasMatchingCommand = commands.some(
      (command) => command?.name === parsed.command,
    );
    if (!hasMatchingCommand) {
      return false;
    }

    await client.session.command({
      sessionID,
      directory: projectPath,
      command: parsed.command,
      arguments: parsed.arguments,
      ...(task.execution.agent ? { agent: task.execution.agent } : {}),
      model: `${task.execution.providerID}/${task.execution.modelID}`,
      ...(task.execution.variant
        ? { variant: task.execution.variant }
        : {}),
    });

    return true;
  };

  const runTaskWithWatchdog = async (
    projectID: string,
    task: NormalizedTask,
    reason: string,
  ) => {
    const startedAt = Date.now();
    const title = formatScheduledSessionTitle(task, startedAt);
    const projectPath = projectPathByID.get(projectID);
    if (!projectPath) {
      throw new Error("project path is unavailable");
    }

    if (typeof waitForOpenCodeReady === "function") {
      await waitForOpenCodeReady(10_000, 250);
    }

    const runtime = _getOpenCodeRuntime();
    if (!runtime) {
      throw new Error("OpenCode runtime is unavailable");
    }
    const baseUrl = runtime.getUrl("/", "").replace(/\/$/, "");
    const authHeaders = runtime.getAuthHeaders();
    const client = createOpencodeClient({
      baseUrl,
      headers: authHeaders,
    });

    const sessionResponse = await client.session.create({
      directory: projectPath,
      title,
    });
    const sessionID = sessionResponse?.data?.id;
    if (!sessionID) {
      throw new Error("failed to create session");
    }

    try {
      emitTaskRunEvent?.({
        projectID,
        taskID: task.id,
        ranAt: startedAt,
        status: "running",
        sessionID,
      });
    } catch {
      // ignore
    }

    const executedAsCommand = await runScheduledCommandIfApplicable({
      client,
      projectPath,
      sessionID,
      task,
    });
    if (!executedAsCommand) {
      await runPromptAsync({
        baseUrl,
        authHeaders,
        sessionID,
        projectPath,
        task,
      });
    }

    const finishedAt = Date.now();
    return {
      sessionID,
      durationMs: Math.max(0, finishedAt - startedAt),
      reason,
      startedAt,
      finishedAt,
    };
  };

  const runTask = async (
    projectID: string,
    taskID: string,
    reason: string,
  ): Promise<
    | { ok: false; skipped?: boolean; running?: boolean }
    | { ok: boolean; status: string; sessionID?: string; task: NormalizedTask | null; error?: string }
  > => {
    const taskMap = tasksByProject.get(projectID);
    const task = taskMap?.get(taskID);
    if (!task || !task.enabled) {
      return { ok: false, skipped: true };
    }

    const taskKey = buildTaskKey(projectID, taskID);
    if (runningTaskKeys.has(taskKey)) {
      return { ok: false, running: true };
    }

    runningTaskKeys.add(taskKey);
    runningGlobalCount += 1;
    runningCountByProject.set(
      projectID,
      (runningCountByProject.get(projectID) || 0) + 1,
    );

    const runStartedAt = Date.now();
    await projectConfigRuntime
      .updateScheduledTaskState(projectID, taskID, {
        lastRunAt: runStartedAt,
        lastStatus: "running",
        lastError: undefined,
        updatedAt: runStartedAt,
      } as Partial<NormalizedTask["state"]>)
      .then((result) => {
        if (result.task) {
          updateInMemoryTask(projectID, result.task);
        }
      });

    let status = "success";
    let sessionID: string | undefined;
    let durationMs = 0;
    let errorMessage: string | undefined;

    try {
      const runPromise = runTaskWithWatchdog(projectID, task, reason);
      let timeoutID: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutID = setTimeout(() => {
          reject(new Error("scheduled task run timed out"));
        }, maxRunDurationMs);
      });

      const result = await Promise.race([
        runPromise,
        timeoutPromise,
      ]).finally(() => {
        if (timeoutID) {
          clearTimeout(timeoutID);
        }
      });

      // result is from runTaskWithWatchdog if it won
      if (result && typeof result === "object") {
        sessionID = (result as Record<string, unknown>).sessionID as string;
        durationMs = (result as Record<string, unknown>)
          .durationMs as number;
      }
      status = "success";
      logger.info?.("[ScheduledTasks] run completed", {
        projectID,
        taskID,
        status,
        reason,
        sessionID,
        durationMs,
      });
    } catch (error) {
      status = "error";
      errorMessage = safeErrorMessage(error);
      logger.warn?.("[ScheduledTasks] run failed", {
        projectID,
        taskID,
        reason,
        status,
        error: errorMessage,
      });
    }

    const finishedAt = Date.now();
    if (!durationMs) {
      durationMs = Math.max(0, finishedAt - runStartedAt);
    }
    let latestTask =
      tasksByProject.get(projectID)?.get(taskID) || task;
    const shouldConsumeOneTimeTask =
      latestTask?.schedule?.kind === "once" && reason === "scheduled";
    if (shouldConsumeOneTimeTask && latestTask?.enabled) {
      try {
        const consumed = await projectConfigRuntime.upsertScheduledTask(
          projectID,
          {
            ...latestTask,
            enabled: false,
          },
        );
        latestTask = consumed.task || latestTask;
        updateInMemoryTask(projectID, latestTask);
      } catch (consumeError) {
        logger.warn?.(
          "[ScheduledTasks] failed to consume one-time task",
          {
            projectID,
            taskID,
            error: safeErrorMessage(consumeError),
          },
        );
      }
    }

    const nextRunAt = computeNextRunAt(latestTask, finishedAt);

    const statePatch = {
      lastStatus: status,
      lastDurationMs: durationMs,
      lastError: status === "error" ? errorMessage : undefined,
      lastSessionId: status === "success" ? sessionID : undefined,
      nextRunAt: Number.isFinite(nextRunAt) ? nextRunAt : undefined,
      updatedAt: finishedAt,
    };

    const stateResult =
      await projectConfigRuntime.updateScheduledTaskState(
        projectID,
        taskID,
        statePatch as Partial<NormalizedTask["state"]>,
      );
    if (stateResult.task) {
      updateInMemoryTask(projectID, stateResult.task);
      if (
        stateResult.task.enabled &&
        Number.isFinite(stateResult.task.state?.nextRunAt)
      ) {
        scheduleTask(
          projectID,
          taskID,
          stateResult.task.state!.nextRunAt!,
        );
      }
    }

    try {
      emitTaskRunEvent?.({
        projectID,
        taskID,
        ranAt: finishedAt,
        status,
        ...(sessionID ? { sessionID } : {}),
      });
    } catch {
      // ignore
    }

    runningTaskKeys.delete(taskKey);
    runningGlobalCount = Math.max(0, runningGlobalCount - 1);
    const nextProjectCount = Math.max(
      0,
      (runningCountByProject.get(projectID) || 1) - 1,
    );
    if (nextProjectCount === 0) {
      runningCountByProject.delete(projectID);
    } else {
      runningCountByProject.set(projectID, nextProjectCount);
    }

    return {
      ok: status === "success",
      status,
      sessionID,
      task: stateResult.task || null,
      error: errorMessage,
    };
  };

  const pumpQueue = () => {
    if (!started) {
      return;
    }

    let consumed = false;
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (!canRunTask(item.projectID)) {
        continue;
      }

      queue.splice(index, 1);
      index -= 1;

      const taskKey = buildTaskKey(item.projectID, item.taskID);
      queuedTaskKeys.delete(taskKey);
      consumed = true;

      void runTask(item.projectID, item.taskID, item.reason).finally(
        () => {
          pumpQueue();
        },
      );
    }

    if (!consumed && queue.length > 0) {
      return;
    }
  };

  const runNow = async (projectID: string, taskID: string) => {
    const taskKey = buildTaskKey(projectID, taskID);
    if (runningTaskKeys.has(taskKey)) {
      return {
        ok: false,
        running: true,
        error: "task is already running",
      };
    }
    if (queuedTaskKeys.has(taskKey)) {
      return {
        ok: false,
        queued: true,
        error: "task is already queued",
      };
    }

    return runTask(projectID, taskID, "manual");
  };

  const start = async () => {
    if (started) {
      return;
    }
    started = true;
    await syncAllProjects();
  };

  const stop = () => {
    if (!started) {
      return;
    }
    started = false;
    for (const timer of timersByTaskKey.values()) {
      clearTimeout(timer);
    }
    timersByTaskKey.clear();
    queuedTaskKeys.clear();
    queue.length = 0;
  };

  return {
    start,
    stop,
    syncAllProjects,
    syncProject,
    runNow,
  };
}
