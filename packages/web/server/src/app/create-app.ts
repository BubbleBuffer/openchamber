import express from "express";
import type { Express } from "express";
import { registerCommonMiddleware, registerJsonBodyParsing } from "./middleware.js";

export interface AppDependencies {
  trustProxy?: boolean;
}

export function createExpressApp(deps: AppDependencies = {}): Express {
  const app = express();
  if (deps.trustProxy !== false) { app.set("trust proxy", 1); }
  registerCommonMiddleware(app);
  registerJsonBodyParsing(app);
  return app;
}