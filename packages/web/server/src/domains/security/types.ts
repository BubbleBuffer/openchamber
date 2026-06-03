import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

export interface RequestSecurityDeps {
  readSettingsFromDiskMigrated: () => Promise<Record<string, unknown>>;
}

export interface RequestSecurityRuntime {
  getUiSessionTokenFromRequest(req: IncomingMessage): string | null;
  rejectWebSocketUpgrade(socket: Socket | null, statusCode: number, reason?: string): void;
  isRequestOriginAllowed(req: IncomingMessage): Promise<boolean>;
}
