export class ServerError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ServerError";
  }
}

export class OpenCodeNotReadyError extends ServerError {
  constructor() {
    super("OpenCode is not ready", "OPENCODE_NOT_READY");
    this.name = "OpenCodeNotReadyError";
  }
}

export class ShutdownInProgressError extends ServerError {
  constructor() {
    super("Server is shutting down", "SHUTDOWN_IN_PROGRESS");
    this.name = "ShutdownInProgressError";
  }
}