export type LifecyclePhase = "startup" | "running" | "shutting-down" | "stopped";

export interface LifecycleEntry {
  name: string;
  start?: () => Promise<void> | void;
  stop?: () => Promise<void> | void;
}

export interface LifecycleRegistry {
  register(entry: LifecycleEntry): void;
  runStartup(): Promise<void>;
  runShutdown(): Promise<void>;
  getPhase(): LifecyclePhase;
}

export function createLifecycleRegistry(): LifecycleRegistry {
  const entries: LifecycleEntry[] = [];
  let phase: LifecyclePhase = "startup";

  return {
    register(entry) {
      entries.push(entry);
    },

    async runStartup() {
      phase = "running";
      for (const entry of entries) {
        if (entry.start) {
          try { await entry.start(); }
          catch (err) { console.error(`[lifecycle] ${entry.name} startup failed:`, err); }
        }
      }
    },

    async runShutdown() {
      phase = "shutting-down";
      for (const entry of [...entries].reverse()) {
        if (entry.stop) {
          try { await entry.stop(); }
          catch (err) { console.error(`[lifecycle] ${entry.name} shutdown failed:`, err); }
        }
      }
      phase = "stopped";
    },

    getPhase() { return phase; },
  };
}