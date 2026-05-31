// Type augmentation for legacy server/index.js
// This tells TypeScript that the legacy JS module exists and has the shape we expect
declare module "../server/index" {
  import type { Express } from "express";
  import type { WebUiServerController } from "../shared/types.js";

  const exports: {
    startWebUiServer: (options: Record<string, unknown>) => Promise<WebUiServerController>;
    gracefulShutdown: (options?: { exitProcess?: boolean }) => Promise<void>;
    setupProxy: (app: Express) => void;
    restartOpenCode: () => Promise<void>;
    parseArgs: (argv?: string[]) => Record<string, unknown>;
  };
  export = exports;
}