export interface Schedule {
  kind: "daily" | "weekly" | "once" | "cron";
  times?: string[];
  weekdays?: number[];
  date?: string;
  time?: string;
  cron?: string;
  timezone: string;
}

export interface Execution {
  prompt: string;
  providerID: string;
  modelID: string;
  variant?: string;
  agent?: string;
}

export interface TaskState {
  createdAt: number;
  updatedAt: number;
  lastStatus: "running" | "success" | "error" | "idle";
  lastRunAt?: number;
  lastDurationMs?: number;
  nextRunAt?: number;
  lastSessionId?: string;
  lastError?: string;
}

export interface NormalizedTask {
  id: string;
  name: string;
  enabled: boolean;
  schedule: Schedule;
  execution: Execution;
  state: TaskState;
}

export interface ProjectConfig {
  version: number;
  scheduledTasks: NormalizedTask[];
}

export interface ProjectConfigDeps {
  fsPromises: typeof import("fs/promises");
  path: typeof import("path");
  projectsDirPath: string;
  createTaskID?: () => string;
}

export interface UpsertResult {
  task: NormalizedTask;
  tasks: NormalizedTask[];
  created: boolean;
}

export interface DeleteResult {
  deleted: boolean;
  tasks: NormalizedTask[];
}

export interface UpdateStateResult {
  task: NormalizedTask | null;
  tasks: NormalizedTask[];
}

export interface ProjectConfigRuntime {
  listScheduledTasks(projectID: string): Promise<NormalizedTask[]>;
  upsertScheduledTask(projectID: string, taskInput: Record<string, unknown>): Promise<UpsertResult>;
  deleteScheduledTask(projectID: string, taskID: string): Promise<DeleteResult>;
  updateScheduledTaskState(projectID: string, taskID: string, statePatch: Record<string, unknown>): Promise<UpdateStateResult>;
  resolveProjectConfigPath(projectID: string): string;
}
