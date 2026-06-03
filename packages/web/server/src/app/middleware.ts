import compression from "compression";
import type { Request, Response, Express } from "express";
import express from "express";
import { SSE_PATH_PREFIXES } from "../shared/types.js";

function headerIncludesEventStream(value: unknown): boolean {
  if (typeof value === "string") return value.toLowerCase().includes("text/event-stream");
  if (Array.isArray(value)) return value.some((e) => typeof e === "string" && e.toLowerCase().includes("text/event-stream"));
  return false;
}

function shouldSkipCompression(req: Request, res: Response): boolean {
  if (headerIncludesEventStream(req.headers.accept)) return true;
  const pathname = req.path || req.url || "";
  if (pathname.startsWith("/api/terminal/") && pathname.endsWith("/stream")) return true;
  for (const prefix of SSE_PATH_PREFIXES) {
    if (pathname === prefix) return true;
  }
  return headerIncludesEventStream(res.getHeader("Content-Type"));
}

export function registerCommonMiddleware(app: Express): void {
  app.use(compression({ filter: shouldSkipCompression, threshold: 1024 }));
  app.use((req, _res, next) => {
    const timestamp = new Date().toISOString();
    process.stdout.write(`${timestamp} - ${req.method} ${req.path}\n`);
    next();
  });
}

export function registerJsonBodyParsing(app: Express): void {
  const largeBodyRoutes = [
    "/api/config/", "/api/projects", "/api/fs", "/api/git",
    "/api/magic-prompts", "/api/prompts", "/api/terminal",
    "/api/opencode", "/api/push", "/api/notifications",
    "/api/session-folders", "/api/openchamber/tunnel",
  ];

  app.use((req, _res, next) => {
    const isLargeBody = largeBodyRoutes.some((prefix) => req.path.startsWith(prefix));
    if (isLargeBody) {
      return express.json({ limit: "50mb" })(req, _res, next);
    }
    return express.json()(req, _res, next);
  });

  app.use(express.urlencoded({ extended: true, limit: "50mb" }));
}