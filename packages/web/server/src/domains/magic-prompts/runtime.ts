import type { PathLike } from "fs";
import type { mkdir, readFile, writeFile } from "fs/promises";

const FILE_VERSION = 1;
const MAX_PROMPT_TEXT_LENGTH = 200_000;
const PROMPT_ID_PATTERN = /^[a-z0-9._-]{1,160}$/;
const isVisiblePromptID = (id: string): boolean => typeof id === "string" && id.endsWith(".visible");

const hasOwn = (input: unknown, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(input, key);

interface OverridesMap {
  [key: string]: string;
}

interface PromptState {
  version: number;
  overrides: OverridesMap;
}

function sanitizeOverrides(value: unknown): OverridesMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const next: OverridesMap = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!PROMPT_ID_PATTERN.test(key) || typeof entry !== "string") {
      continue;
    }
    next[key] = entry;
  }
  return next;
}

export interface MagicPromptRuntimeDeps {
  fsPromises: { mkdir: typeof mkdir; readFile: typeof readFile; writeFile: typeof writeFile };
  path: { dirname(p: string): string };
  filePath: string;
}

export interface MagicPromptRuntime {
  readPromptState(): Promise<PromptState>;
  setOverride(id: string, text: string): Promise<PromptState>;
  resetOverride(id: string): Promise<PromptState>;
  resetAllOverrides(): Promise<PromptState>;
}

export function createMagicPromptRuntime(dependencies: MagicPromptRuntimeDeps): MagicPromptRuntime {
  const { fsPromises, path, filePath } = dependencies;

  let writeLock: Promise<unknown> = Promise.resolve();

  const readPromptState = async (): Promise<PromptState> => {
    try {
      const raw = await fsPromises.readFile(filePath as PathLike, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const overrides = sanitizeOverrides(parsed?.overrides);
      return { version: FILE_VERSION, overrides };
    } catch (error) {
      if (error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: FILE_VERSION, overrides: {} };
      }
      console.warn("Failed to read magic prompts file:", error);
      return { version: FILE_VERSION, overrides: {} };
    }
  };

  const writePromptState = async (state: PromptState): Promise<void> => {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath as PathLike, JSON.stringify(state, null, 2), "utf8");
  };

  const persist = async (mutator: (current: PromptState) => Promise<PromptState>): Promise<PromptState> => {
    const run = async (): Promise<PromptState> => {
      const current = await readPromptState();
      const next = await mutator(current);
      await writePromptState(next);
      return next;
    };
    writeLock = writeLock.then(run, run);
    return writeLock as Promise<PromptState>;
  };

  const setOverride = async (id: string, text: string): Promise<PromptState> => {
    const normalizedId = typeof id === "string" ? id.trim() : "";
    if (!PROMPT_ID_PATTERN.test(normalizedId)) {
      throw new Error("Invalid prompt id");
    }
    if (typeof text !== "string") {
      throw new Error("Prompt text must be a string");
    }
    if (isVisiblePromptID(normalizedId) && text.trim().length === 0) {
      throw new Error("Visible prompt text cannot be empty");
    }
    if (text.length > MAX_PROMPT_TEXT_LENGTH) {
      throw new Error("Prompt text is too long");
    }

    return persist(async (state) => {
      const nextOverrides = { ...state.overrides, [normalizedId]: text };
      return { version: FILE_VERSION, overrides: nextOverrides };
    });
  };

  const resetOverride = async (id: string): Promise<PromptState> => {
    const normalizedId = typeof id === "string" ? id.trim() : "";
    if (!PROMPT_ID_PATTERN.test(normalizedId)) {
      throw new Error("Invalid prompt id");
    }

    return persist(async (state) => {
      if (!hasOwn(state.overrides, normalizedId)) {
        return state;
      }
      const nextOverrides = { ...state.overrides };
      delete nextOverrides[normalizedId];
      return { version: FILE_VERSION, overrides: nextOverrides };
    });
  };

  const resetAllOverrides = async (): Promise<PromptState> => {
    return persist(async () => ({ version: FILE_VERSION, overrides: {} }));
  };

  return {
    readPromptState,
    setOverride,
    resetOverride,
    resetAllOverrides,
  };
}
