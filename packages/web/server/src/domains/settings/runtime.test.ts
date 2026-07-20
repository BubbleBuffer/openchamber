import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { createProjectIdFromPath } from "../projects/project-id.js";
import { createSettingsRuntime } from "./runtime.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("settings project migration", () => {
  it("drops obsolete entries while preserving live project metadata", async () => {
    const directory = await mkdtemp(path.join("/tmp", "openchamber-settings-runtime-"));
    tempDirectories.push(directory);
    const projectsDirectory = path.join(directory, "projects");
    await fs.mkdir(projectsDirectory, { recursive: true });
    await writeFile(path.join(directory, "settings.json"), JSON.stringify({
      projects: [{ id: "legacy-id", path: "/workspace/project" }],
      activeProjectId: "legacy-id",
    }));
    await writeFile(path.join(projectsDirectory, "legacy-id.json"), JSON.stringify({
      projectPath: "/workspace/project",
      ["scheduled" + "Tasks"]: [{ id: "obsolete" }],
      "setup-worktree": ["pnpm install"],
      projectNotes: "keep these notes",
      projectTodos: [{ id: "todo-1", text: "keep this todo" }],
      projectActions: [{ id: "action-1", name: "Build", command: "pnpm build" }],
      projectActionsPrimaryId: "action-1",
      projectPlanFiles: [{ id: "plan-1", path: "/workspace/project/PLAN.md" }],
    }));
    await writeFile(path.join(projectsDirectory, `${createProjectIdFromPath("/workspace/project")}.json`), JSON.stringify({
      ["scheduled" + "Tasks"]: [{ id: "obsolete-new" }],
    }));

    const runtime = createSettingsRuntime({
      fsPromises: fs,
      path,
      crypto,
      SETTINGS_FILE_PATH: path.join(directory, "settings.json"),
      sanitizeProjects: (projects) => Array.isArray(projects) ? projects : [],
      sanitizeSettingsUpdate: (changes) => changes,
      mergePersistedSettings: (current, changes) => ({ ...current, ...changes }),
      normalizeSettingsPaths: (settings) => ({ settings, changed: false }),
      normalizeStringArray: (values) => Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [],
      formatSettingsResponse: (settings) => settings,
      resolveDirectoryCandidate: () => null,
    });

    await runtime.readSettingsFromDiskMigrated();

    const settings = JSON.parse(await readFile(path.join(directory, "settings.json"), "utf8"));
    const migratedProject = settings.projects[0];
    const projectConfig = JSON.parse(await readFile(path.join(projectsDirectory, `${migratedProject.id}.json`), "utf8"));
    expect(projectConfig).toEqual({
      projectPath: "/workspace/project",
      "setup-worktree": ["pnpm install"],
      projectNotes: "keep these notes",
      projectTodos: [{ id: "todo-1", text: "keep this todo" }],
      projectActions: [{ id: "action-1", name: "Build", command: "pnpm build" }],
      projectActionsPrimaryId: "action-1",
      projectPlanFiles: [{ id: "plan-1", path: "/workspace/project/PLAN.md" }],
    });
  });
});

describe("settings persistence queue", () => {
  it("allows a later save after an atomic write failure", async () => {
    const directory = await mkdtemp(path.join("/tmp", "openchamber-settings-runtime-"));
    tempDirectories.push(directory);
    const settingsPath = path.join(directory, "settings.json");
    let failWrite = true;
    const fsPromises = {
      ...fs,
      rename: async (from: string, to: string) => {
        if (failWrite) {
          failWrite = false;
          throw new Error("disk unavailable");
        }
        return fs.rename(from, to);
      },
    };
    const runtime = createSettingsRuntime({
      fsPromises: fsPromises as typeof fs,
      path,
      crypto,
      SETTINGS_FILE_PATH: settingsPath,
      sanitizeProjects: (projects) => Array.isArray(projects) ? projects : [],
      sanitizeSettingsUpdate: (changes) => changes,
      mergePersistedSettings: (current, changes) => ({ ...current, ...changes }),
      normalizeSettingsPaths: (settings) => ({ settings, changed: false }),
      normalizeStringArray: () => [],
      formatSettingsResponse: (settings) => settings,
      resolveDirectoryCandidate: () => null,
    });

    await expect(runtime.persistSettings({ themeId: "first" })).rejects.toThrow("disk unavailable");
    await expect(runtime.persistSettings({ themeId: "second" })).resolves.toMatchObject({ themeId: "second" });
    expect(JSON.parse(await readFile(settingsPath, "utf8"))).toMatchObject({ themeId: "second" });
  });
});

describe("persisted settings boundary", () => {
  it("removes obsolete fields without dropping server-only push state on unrelated saves", async () => {
    const directory = await mkdtemp(path.join("/tmp", "openchamber-settings-runtime-"));
    tempDirectories.push(directory);
    const settingsPath = path.join(directory, "settings.json");
    await writeFile(settingsPath, JSON.stringify({
      publicOrigin: "https://openchamber.test",
      vapidKeys: { publicKey: "public", privateKey: "secret" },
      obsolete: true,
    }));
    const runtime = createSettingsRuntime({
      fsPromises: fs, path, crypto, SETTINGS_FILE_PATH: settingsPath,
      sanitizeProjects: (projects) => Array.isArray(projects) ? projects : [],
      sanitizeSettingsUpdate: (changes) => changes,
      mergePersistedSettings: (current, changes) => ({ ...current, ...changes }),
      normalizeSettingsPaths: (settings) => ({ settings, changed: false }),
      normalizeStringArray: () => [], formatSettingsResponse: (settings) => settings,
      resolveDirectoryCandidate: () => null,
    });
    await runtime.persistSettings({ themeId: "dark" });
    expect(JSON.parse(await readFile(settingsPath, "utf8"))).toEqual({
      publicOrigin: "https://openchamber.test",
      vapidKeys: { publicKey: "public", privateKey: "secret" },
      themeId: "dark",
    });
  });
});
