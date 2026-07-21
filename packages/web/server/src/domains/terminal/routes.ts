import type { Express, Request, Response } from "express";
import type { IncomingMessage } from "node:http";
import {
  parseTerminalCreateRequest,
  parseTerminalInputRequest,
  parseTerminalKillRequest,
  parseTerminalResizeRequest,
  parseTerminalRestartRequest,
  TERMINAL_SSE_CONTENT_TYPE,
  terminalError,
  type TerminalErrorCode,
} from "../../contracts/terminal.js";
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
  const respondError = (res: Response, status: number, code: TerminalErrorCode): void => {
    res.status(status).json(terminalError(code));
  };

  const getSessionIdParam = (params: Record<string, string | string[]>): string => {
    const val = params.sessionId;
    return Array.isArray(val) ? val[0] : val;
  };

  app.post("/api/terminal/create", async (req: Request, res: Response) => {
    try {
      if (getSessionCount() >= MAX_TERMINAL_SESSIONS) {
        respondError(res, 429, "terminal_rate_limited");
        return;
      }

      const parsedRequest = parseTerminalCreateRequest(req.body);
      if (!parsedRequest.ok) {
        respondError(res, 400, "terminal_invalid_request");
        return;
      }
      const { cwd, cols, rows } = parsedRequest.value;

      try {
        await fs.promises.access(cwd);
      } catch {
        respondError(res, 400, "terminal_invalid_request");
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
      respondError(res, 500, "terminal_process_failed");
    }
  });

  app.get(
    "/api/terminal/:sessionId/stream",
    (req: Request, res: Response) => {
      const sessionId = getSessionIdParam(req.params);
      const session = terminalSessions.get(sessionId);

      if (!session) {
        respondError(res, 404, "terminal_session_not_found");
        return;
      }

      res.setHeader("Content-Type", TERMINAL_SSE_CONTENT_TYPE);
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
        respondError(res, 404, "terminal_session_not_found");
        return;
      }

      const parsedInput = parseTerminalInputRequest(req.body);
      if (!parsedInput.ok) {
        respondError(res, 400, "terminal_invalid_request");
        return;
      }
      const data = parsedInput.value;

      try {
        session.ptyProcess.write(data);
        session.lastActivity = Date.now();
        res.json({ success: true });
      } catch (error) {
        console.error("Failed to write to terminal:", error);
        respondError(res, 500, "terminal_process_failed");
      }
    },
  );

  app.post(
    "/api/terminal/:sessionId/resize",
    (req: Request, res: Response) => {
      const sessionId = getSessionIdParam(req.params);
      const session = terminalSessions.get(sessionId);

      if (!session) {
        respondError(res, 404, "terminal_session_not_found");
        return;
      }

      const parsedResize = parseTerminalResizeRequest(req.body);
      if (!parsedResize.ok) {
        respondError(res, 400, "terminal_invalid_request");
        return;
      }
      const { cols, rows } = parsedResize.value;

      try {
        session.ptyProcess.resize(cols, rows);
        session.lastActivity = Date.now();
        res.json({ success: true, cols, rows });
      } catch (error) {
        console.error("Failed to resize terminal:", error);
        respondError(res, 500, "terminal_process_failed");
      }
    },
  );

  app.delete(
    "/api/terminal/:sessionId",
    (req: Request, res: Response) => {
      const sessionId = getSessionIdParam(req.params);
      const session = terminalSessions.get(sessionId);

      if (!session) {
        respondError(res, 404, "terminal_session_not_found");
        return;
      }

      try {
        session.ptyProcess.kill();
        terminalSessions.delete(sessionId);
        console.log(`Closed terminal session: ${sessionId}`);
        res.json({ success: true });
      } catch (error) {
        console.error("Failed to close terminal:", error);
        respondError(res, 500, "terminal_process_failed");
      }
    },
  );

  app.post(
    "/api/terminal/:sessionId/restart",
    async (req: Request, res: Response) => {
      const sessionId = getSessionIdParam(req.params);
      const parsedRequest = parseTerminalRestartRequest(req.body);
      if (!parsedRequest.ok) {
        respondError(res, 400, "terminal_invalid_request");
        return;
      }
      const { cwd, cols, rows } = parsedRequest.value;

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
            respondError(res, 400, "terminal_invalid_request");
            return;
          }
        } catch {
          respondError(res, 400, "terminal_invalid_request");
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
        respondError(res, 500, "terminal_process_failed");
      }
    },
  );

  app.post(
    "/api/terminal/force-kill",
    (req: Request, res: Response) => {
      const parsedRequest = parseTerminalKillRequest(req.body);
      if (!parsedRequest.ok) {
        respondError(res, 400, "terminal_invalid_request");
        return;
      }
      const { sessionId, cwd } = parsedRequest.value;
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
