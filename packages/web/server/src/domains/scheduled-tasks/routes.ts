import type { Express, Request, Response } from "express";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const parseProjectID = (req: Request): string | null => asNonEmptyString(req?.params?.projectId);
const parseTaskID = (req: Request): string | null => asNonEmptyString(req?.params?.taskId);

type SseClient = Response;

export interface ScheduledTaskRoutesDeps {
  readSettingsFromDiskMigrated(): Promise<{ projects?: unknown }>;
  sanitizeProjects(projects: unknown): Array<{ id: string; [key: string]: unknown }>;
  projectConfigRuntime: {
    listScheduledTasks(projectId: string): Promise<Array<{ id: string; enabled?: boolean; state?: { lastStatus?: string }; [key: string]: unknown }>>;
    upsertScheduledTask(projectId: string, task: Record<string, unknown>): Promise<{ task: { id: string; [key: string]: unknown }; created: boolean }>;
    deleteScheduledTask(projectId: string, taskId: string): Promise<{ deleted: boolean }>;
  };
  scheduledTasksRuntime: {
    syncProject(projectId: string): Promise<void>;
    runNow(projectId: string, taskId: string): Promise<{ ok?: boolean; running?: boolean; queued?: boolean; skipped?: boolean; error?: string; task?: unknown; sessionID?: string }>;
  };
  getOpenChamberEventClients(): Set<SseClient>;
  writeSseEvent(res: SseClient, event: { type: string; properties: Record<string, unknown> }): void;
}

export function registerScheduledTaskRoutes(app: Express, dependencies: ScheduledTaskRoutesDeps): void {
  const {
    readSettingsFromDiskMigrated,
    sanitizeProjects,
    projectConfigRuntime,
    scheduledTasksRuntime,
    getOpenChamberEventClients,
    writeSseEvent,
  } = dependencies;

  const findProjectByID = async (projectID: string) => {
    const settings = await readSettingsFromDiskMigrated();
    const projects = sanitizeProjects((settings as Record<string, unknown>)?.projects || []);
    return projects.find((project) => project.id === projectID) || null;
  };

  app.get("/api/projects/:projectId/scheduled-tasks", async (req: Request, res: Response) => {
    const projectID = parseProjectID(req);
    if (!projectID) return res.status(400).json({ error: "projectId is required" });

    try {
      const project = await findProjectByID(projectID);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const tasks = await projectConfigRuntime.listScheduledTasks(projectID);
      return res.json({ tasks });
    } catch (error) {
      console.error("[ScheduledTasks] failed to load tasks:", error);
      return res.status(500).json({ error: "Failed to load scheduled tasks" });
    }
  });

  app.put("/api/projects/:projectId/scheduled-tasks", async (req: Request, res: Response) => {
    const projectID = parseProjectID(req);
    if (!projectID) return res.status(400).json({ error: "projectId is required" });

    const taskInput = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>).task : null;
    if (!taskInput || typeof taskInput !== "object") {
      return res.status(400).json({ error: "task payload is required" });
    }

    try {
      const project = await findProjectByID(projectID);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const upserted = await projectConfigRuntime.upsertScheduledTask(projectID, taskInput as Record<string, unknown>);
      await scheduledTasksRuntime.syncProject(projectID);
      const freshTasks = await projectConfigRuntime.listScheduledTasks(projectID);
      const freshTask = freshTasks.find((task) => task.id === upserted.task.id) || upserted.task;

      return res.json({ tasks: freshTasks, task: freshTask, created: upserted.created });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save scheduled task";
      const statusCode = message.toLowerCase().includes("required") || message.toLowerCase().includes("invalid") ? 400 : 500;
      if (statusCode === 500) console.error("[ScheduledTasks] failed to save task:", error);
      return res.status(statusCode).json({ error: message });
    }
  });

  app.delete("/api/projects/:projectId/scheduled-tasks/:taskId", async (req: Request, res: Response) => {
    const projectID = parseProjectID(req);
    const taskID = parseTaskID(req);
    if (!projectID) return res.status(400).json({ error: "projectId is required" });
    if (!taskID) return res.status(400).json({ error: "taskId is required" });

    try {
      const project = await findProjectByID(projectID);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const result = await projectConfigRuntime.deleteScheduledTask(projectID, taskID);
      if (!result.deleted) return res.status(404).json({ error: "Task not found" });
      await scheduledTasksRuntime.syncProject(projectID);
      const freshTasks = await projectConfigRuntime.listScheduledTasks(projectID);
      return res.json({ tasks: freshTasks });
    } catch (error) {
      console.error("[ScheduledTasks] failed to delete task:", error);
      return res.status(500).json({ error: "Failed to delete scheduled task" });
    }
  });

  app.post("/api/projects/:projectId/scheduled-tasks/:taskId/run", async (req: Request, res: Response) => {
    const projectID = parseProjectID(req);
    const taskID = parseTaskID(req);
    if (!projectID) return res.status(400).json({ error: "projectId is required" });
    if (!taskID) return res.status(400).json({ error: "taskId is required" });

    try {
      const project = await findProjectByID(projectID);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const result = await scheduledTasksRuntime.runNow(projectID, taskID);
      if (result.running || result.queued) {
        return res.status(409).json({ error: result.error || "Task already running" });
      }
      if (result.skipped) {
        return res.status(404).json({ error: "Task not found or disabled" });
      }
      if (!result.ok) {
        return res.status(500).json({ error: result.error || "Task run failed", task: result.task });
      }

      return res.json({ ok: true, task: result.task, sessionId: result.sessionID });
    } catch (error) {
      console.error("[ScheduledTasks] failed to run task:", error);
      return res.status(500).json({ error: "Failed to run scheduled task" });
    }
  });

  app.get("/api/openchamber/scheduled-tasks/status", async (_req: Request, res: Response) => {
    try {
      const settings = await readSettingsFromDiskMigrated();
      const projects = sanitizeProjects((settings as Record<string, unknown>)?.projects || []);

      let enabledCount = 0;
      let runningCount = 0;

      for (const project of projects) {
        try {
          const tasks = await projectConfigRuntime.listScheduledTasks(project.id);
          for (const task of tasks) {
            if (task?.enabled) enabledCount += 1;
            if (task?.state?.lastStatus === "running") runningCount += 1;
          }
        } catch { /* skip */ }
      }

      return res.json({
        hasEnabledScheduledTasks: enabledCount > 0,
        hasRunningScheduledTasks: runningCount > 0,
        enabledScheduledTasksCount: enabledCount,
        runningScheduledTasksCount: runningCount,
      });
    } catch (error) {
      console.error("[ScheduledTasks] failed to resolve scheduled task status:", error);
      return res.status(500).json({ error: "Failed to resolve scheduled task status" });
    }
  });

  app.get("/api/openchamber/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const clients = getOpenChamberEventClients();
    clients.add(res);

    try {
      writeSseEvent(res, {
        type: "openchamber:event-stream-ready",
        properties: { connectedAt: Date.now() },
      });
    } catch { /* skip */ }

    const heartbeat = setInterval(() => {
      try {
        writeSseEvent(res, {
          type: "openchamber:heartbeat",
          properties: { timestamp: Date.now() },
        });
      } catch {
        clearInterval(heartbeat);
        clients.delete(res);
      }
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
  });
}
