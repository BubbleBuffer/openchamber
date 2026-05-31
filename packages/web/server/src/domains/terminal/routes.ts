import type { Express, Request, Response } from "express";
import type { IncomingMessage } from "node:http";
import type { TerminalDomainDependencies, PtyProcess } from "./types.js";
import { MAX_TERMINAL_SESSIONS } from "./types.js";
import { getPtyProvider, getTerminalShellCandidates, spawnTerminalPtyWithFallback, sanitizeTerminalEnv } from "./pty.js";
import { getTerminalSessions, createSession, getSessionCount, getTerminalCapabilities } from "./sessions.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WsServerHandle = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isBunRuntime = typeof (globalThis as any).Bun === "undefined" ? false : true;
const terminalRuntimeName = isBunRuntime ? "bun" : "node";

export const registerTerminalRoutes = (
  app: Express,
  express: typeof import("express"),
  deps: TerminalDomainDependencies,
  wsServer: WsServerHandle,
): void => {
  const { fs, buildAugmentedPath, searchPathFor, isExecutable } = deps;
  const terminalSessions = getTerminalSessions();

  const getSessionIdParam = (params: Record<string, string | string[]>): string => {
    const val = params.sessionId;
    return Array.isArray(val) ? val[0] : val;
  };

  app.post("/api/terminal/create", async (req: Request, res: Response) => {
    try {
      if (getSessionCount() >= MAX_TERMINAL_SESSIONS) {
        res.status(429).json({ error: "Maximum terminal sessions reached" });
        return;
      }

      const { cwd, cols, rows } = req.body as {
        cwd?: string;
        cols?: number;
        rows?: number;
      };
      if (!cwd) {
        res.status(400).json({ error: "cwd is required" });
        return;
      }

      try {
        await fs.promises.access(cwd);
      } catch {
        res.status(400).json({ error: "Invalid working directory" });
        return;
      }

      const envPath = buildAugmentedPath();
      const resolvedEnv = sanitizeTerminalEnv({
        ...process.env,
        PATH: envPath,
      });

      const shellCandidates = getTerminalShellCandidates(
        process.platform,
        process.env,
        searchPathFor,
        isExecutable,
      );

      const pty = await getPtyProvider(isBunRuntime);
      const { ptyProcess, shell } = spawnTerminalPtyWithFallback(
        pty,
        {
          cols: cols ?? 80,
          rows: rows ?? 24,
          cwd,
          env: resolvedEnv,
        },
        shellCandidates,
      );

      const { sessionId, session: createdSession } = createSession(
        ptyProcess as unknown as PtyProcess,
        pty.backend,
        cwd,
      );

      ptyProcess.onData((data: string) => {
        wsServer.broadcastOutput(sessionId, createdSession, data);
      });

      ptyProcess.onExit(
        ({ exitCode, signal }: { exitCode: number; signal: number }) => {
          console.log(
            `Terminal session ${sessionId} exited with code ${exitCode}, signal ${signal}`,
          );
          wsServer.broadcastExit(sessionId, exitCode, signal);
        },
      );

      console.log(
        `Created terminal session: ${sessionId} in ${cwd} using shell ${shell}`,
      );
      res.json({
        sessionId,
        cols: cols || 80,
        rows: rows || 24,
        capabilities: getTerminalCapabilities(),
      });
    } catch (error) {
      console.error("Failed to create terminal session:", error);
      const message = error instanceof Error ? error.message : "Failed to create terminal session";
      res.status(500).json({ error: message });
    }
  });

  app.get(
    "/api/terminal/:sessionId/stream",
    (req: Request, res: Response) => {
      const sessionId = getSessionIdParam(req.params);
      const session = terminalSessions.get(sessionId);

      if (!session) {
        res.status(404).json({ error: "Terminal session not found" });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const clientId = Math.random().toString(36).substring(7);
      session.clients.add(clientId);
      session.lastActivity = Date.now();

      const ptyBackend = session.ptyBackend || "unknown";
      res.write(
        `data: ${JSON.stringify({ type: "connected", runtime: terminalRuntimeName, ptyBackend })}\n\n`,
      );

      const heartbeatInterval = setInterval(() => {
        try {
          res.write(": heartbeat\n\n");
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 15000);

      const dataHandler = (data: string) => {
        try {
          session.lastActivity = Date.now();
          const ok = res.write(
            `data: ${JSON.stringify({ type: "data", data })}\n\n`,
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!ok && (session.ptyProcess as any).pause) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (session.ptyProcess as any).pause();
            res.once("drain", () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if ((session.ptyProcess as any).resume) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (session.ptyProcess as any).resume();
              }
            });
          }
        } catch {
          cleanup();
        }
      };

      const exitHandler = ({
        exitCode,
        signal,
      }: {
        exitCode: number;
        signal: number;
      }) => {
        try {
          res.write(
            `data: ${JSON.stringify({ type: "exit", exitCode, signal })}\n\n`,
          );
          res.end();
        } catch {
          // ignore
        }
        cleanup();
      };

      const dataDisposable = session.ptyProcess.onData(dataHandler);
      const exitDisposable = session.ptyProcess.onExit(exitHandler);

      const cleanup = () => {
        clearInterval(heartbeatInterval);
        session.clients.delete(clientId);

        if (dataDisposable && typeof dataDisposable.dispose === "function") {
          dataDisposable.dispose();
        }
        if (exitDisposable && typeof exitDisposable.dispose === "function") {
          exitDisposable.dispose();
        }

        try {
          res.end();
        } catch {
          // ignore
        }

        console.log(
          `Client ${clientId} disconnected from terminal session ${sessionId}`,
        );
      };

      (req as IncomingMessage).on("close", cleanup);
      (req as IncomingMessage).on("error", cleanup);

      console.log(
        `Terminal connected: session=${sessionId} client=${clientId} runtime=${terminalRuntimeName} pty=${ptyBackend}`,
      );
    },
  );

  app.post(
    "/api/terminal/:sessionId/input",
    express.text({ type: "*/*" }),
    (req: Request, res: Response) => {
      const sessionId = getSessionIdParam(req.params);
      const session = terminalSessions.get(sessionId);

      if (!session) {
        res.status(404).json({ error: "Terminal session not found" });
        return;
      }

      const data = typeof req.body === "string" ? req.body : "";

      try {
        session.ptyProcess.write(data);
        session.lastActivity = Date.now();
        res.json({ success: true });
      } catch (error) {
        console.error("Failed to write to terminal:", error);
        const message = error instanceof Error ? error.message : "Failed to write to terminal";
        res.status(500).json({ error: message });
      }
    },
  );

  app.post(
    "/api/terminal/:sessionId/resize",
    (req: Request, res: Response) => {
      const sessionId = getSessionIdParam(req.params);
      const session = terminalSessions.get(sessionId);

      if (!session) {
        res.status(404).json({ error: "Terminal session not found" });
        return;
      }

      const { cols, rows } = req.body as { cols?: number; rows?: number };
      if (!cols || !rows) {
        res.status(400).json({ error: "cols and rows are required" });
        return;
      }

      try {
        session.ptyProcess.resize(cols, rows);
        session.lastActivity = Date.now();
        res.json({ success: true, cols, rows });
      } catch (error) {
        console.error("Failed to resize terminal:", error);
        const message = error instanceof Error ? error.message : "Failed to resize terminal";
        res.status(500).json({ error: message });
      }
    },
  );

  app.delete(
    "/api/terminal/:sessionId",
    (req: Request, res: Response) => {
      const sessionId = getSessionIdParam(req.params);
      const session = terminalSessions.get(sessionId);

      if (!session) {
        res.status(404).json({ error: "Terminal session not found" });
        return;
      }

      try {
        session.ptyProcess.kill();
        terminalSessions.delete(sessionId);
        console.log(`Closed terminal session: ${sessionId}`);
        res.json({ success: true });
      } catch (error) {
        console.error("Failed to close terminal:", error);
        const message = error instanceof Error ? error.message : "Failed to close terminal";
        res.status(500).json({ error: message });
      }
    },
  );

  app.post(
    "/api/terminal/:sessionId/restart",
    async (req: Request, res: Response) => {
      const sessionId = getSessionIdParam(req.params);
      const { cwd, cols, rows } = req.body as {
        cwd?: string;
        cols?: number;
        rows?: number;
      };

      if (!cwd) {
        res.status(400).json({ error: "cwd is required" });
        return;
      }

      const existingSession = terminalSessions.get(sessionId);
      if (existingSession) {
        try {
          existingSession.ptyProcess.kill();
        } catch {
          // ignore
        }
        terminalSessions.delete(sessionId);
      }

      try {
        try {
          const stats = await fs.promises.stat(cwd);
          if (!stats.isDirectory()) {
            res.status(400).json({ error: "Invalid working directory: not a directory" });
            return;
          }
        } catch {
          res.status(400).json({ error: "Invalid working directory: not accessible" });
          return;
        }

        const envPath = buildAugmentedPath();
        const resolvedEnv = sanitizeTerminalEnv({
          ...process.env,
          PATH: envPath,
        });

        const shellCandidates = getTerminalShellCandidates(
          process.platform,
          process.env,
          searchPathFor,
          isExecutable,
        );

        const pty = await getPtyProvider(isBunRuntime);
        const { ptyProcess, shell } = spawnTerminalPtyWithFallback(
          pty,
          {
            cols: cols ?? 80,
            rows: rows ?? 24,
            cwd,
            env: resolvedEnv,
          },
          shellCandidates,
        );

        const { sessionId: newSessionId, session: newSession } =
          createSession(ptyProcess as unknown as PtyProcess, pty.backend, cwd);

        ptyProcess.onData((data: string) => {
          wsServer.broadcastOutput(newSessionId, newSession, data);
        });

        ptyProcess.onExit(
          ({
            exitCode,
            signal,
          }: {
            exitCode: number;
            signal: number;
          }) => {
            console.log(
              `Terminal session ${newSessionId} exited with code ${exitCode}, signal ${signal}`,
            );
            wsServer.broadcastExit(newSessionId, exitCode, signal);
          },
        );

        console.log(
          `Restarted terminal session: ${sessionId} -> ${newSessionId} in ${cwd} using shell ${shell}`,
        );
        res.json({
          sessionId: newSessionId,
          cols: cols || 80,
          rows: rows || 24,
          capabilities: getTerminalCapabilities(),
        });
      } catch (error) {
        console.error("Failed to restart terminal session:", error);
        const message = error instanceof Error ? error.message : "Failed to restart terminal session";
        res.status(500).json({ error: message });
      }
    },
  );

  app.post(
    "/api/terminal/force-kill",
    (req: Request, res: Response) => {
      const { sessionId, cwd } = req.body as {
        sessionId?: string;
        cwd?: string;
      };
      let killedCount = 0;

      if (sessionId) {
        const session = terminalSessions.get(sessionId);
        if (session) {
          try {
            session.ptyProcess.kill();
          } catch {
            // ignore
          }
          terminalSessions.delete(sessionId);
          killedCount++;
        }
      } else if (cwd) {
        for (const [id, session] of terminalSessions) {
          if (session.cwd === cwd) {
            try {
              session.ptyProcess.kill();
            } catch {
              // ignore
            }
            terminalSessions.delete(id);
            killedCount++;
          }
        }
      } else {
        for (const [id, session] of terminalSessions) {
          try {
            session.ptyProcess.kill();
          } catch {
            // ignore
          }
          terminalSessions.delete(id);
          killedCount++;
        }
      }

      console.log(`Force killed ${killedCount} terminal session(s)`);
      res.json({ success: true, killedCount });
    },
  );
};
