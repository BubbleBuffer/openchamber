// Type declarations for the legacy server/index.js module
// This module is loaded via dynamic import and provides the old runtime bridge
declare module "../server/index.js" {
  import type { Express } from "express";
  import type { WebUiServerController } from "./shared/types.js";

  export const gracefulShutdown: (options?: { exitProcess?: boolean }) => Promise<void>;
  export const setupProxy: (app: Express) => void;
  export const restartOpenCode: () => Promise<void>;
  export const startWebUiServer: (options: Record<string, unknown>) => Promise<WebUiServerController>;
  export const parseArgs: (argv?: string[]) => Record<string, unknown>;
}