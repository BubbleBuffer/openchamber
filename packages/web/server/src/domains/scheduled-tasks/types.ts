import type { NormalizedTask } from "../projects/types.js";

export interface ScheduledTaskDeps {
  projectConfigRuntime: {
    listScheduledTasks(projectID: string): Promise<NormalizedTask[]>;
    upsertScheduledTask(projectID: string, task: NormalizedTask): Promise<{ task?: NormalizedTask | null }>;
    updateScheduledTaskState(projectID: string, taskID: string, statePatch: Partial<NormalizedTask["state"]>): Promise<{ task?: NormalizedTask | null }>;
  };
  listProjects(): Promise<Array<{ id: string; path: string } | null | undefined>>;
  openCodeRuntime: {
    getUrl(path: string, query: string): string;
    getAuthHeaders(): Record<string, string>;
  };
  waitForOpenCodeReady?: (timeoutMs: number, pollMs: number) => Promise<void>;
  emitTaskRunEvent?: (event: TaskRunEvent) => void;
  logger?: {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
  maxGlobalConcurrency?: number;
  maxProjectConcurrency?: number;
  maxRunDurationMs?: number;
}

export interface ScheduledTasksRuntime {
  start(): Promise<void>;
  stop(): void;
  syncAllProjects(): Promise<void>;
  syncProject(projectID: string): Promise<NormalizedTask[]>;
  runNow(projectID: string, taskID: string): Promise<{ ok: boolean; running?: boolean; queued?: boolean; error?: string; status?: string; sessionID?: string; task?: NormalizedTask | null }>;
}

export interface TaskRunEvent {
  projectID: string;
  taskID: string;
  ranAt: number;
  status: string;
  sessionID?: string;
}

export interface QueueItem {
  projectID: string;
  taskID: string;
  reason: string;
}

export interface TimeParts {
  hour: number;
  minute: number;
}

export interface ParsedCommand {
  command: string;
  arguments: string;
}
