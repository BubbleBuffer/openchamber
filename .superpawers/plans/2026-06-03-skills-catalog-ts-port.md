# Skills Catalog TypeScript Port — Stage 9.2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port 11 JS files in `packages/web/server/lib/skills-catalog/` to TypeScript under `src/domains/skills-catalog/`, extract shared helpers to eliminate code duplication, and update 2 consumer files.

**Architecture:** The skills-catalog is a self-contained function library — no cross-domain imports, no factory pattern. Each file exports plain functions. Two install modules (`install.ts`, `clawdhub/install.ts`) share duplicate helpers (`validateSkillName`, `safeRm`, `normalizeUserSkillDir`, `ensureDir`, `getTargetSkillDir`) — these will be extracted into a shared `utils.ts`. The clawdhub subdir gets a barrel, and the top-level `index.ts` barrel re-exports the same 11 functions consumed by `feature-routes-runtime.ts`.

**Tech Stack:** TypeScript, `yaml` (npm), `adm-zip` (npm, clawdhub only), Node built-ins (`fs`, `path`, `os`, `child_process`, `util`)

---

## File Structure

| File | Purpose |
|------|---------|
| `src/domains/skills-catalog/types.ts` | All shared type interfaces |
| `src/domains/skills-catalog/utils.ts` | Shared helpers: `validateSkillName`, `safeRm`, `normalizeUserSkillDir`, `ensureDir`, `getTargetSkillDir`, `copyDirectoryNoSymlinks` |
| `src/domains/skills-catalog/cache.ts` | TS port of `cache.js` |
| `src/domains/skills-catalog/curated-sources.ts` | TS port of `curated-sources.js` |
| `src/domains/skills-catalog/source.ts` | TS port of `source.js` |
| `src/domains/skills-catalog/git.ts` | TS port of `git.js` |
| `src/domains/skills-catalog/scan.ts` | TS port of `scan.js` |
| `src/domains/skills-catalog/install.ts` | TS port of `install.js` |
| `src/domains/skills-catalog/clawdhub/api.ts` | TS port of `clawdhub/api.js` |
| `src/domains/skills-catalog/clawdhub/scan.ts` | TS port of `clawdhub/scan.js` |
| `src/domains/skills-catalog/clawdhub/install.ts` | TS port of `clawdhub/install.js` |
| `src/domains/skills-catalog/clawdhub/index.ts` | ClawdHub barrel |
| `src/domains/skills-catalog/index.ts` | Top barrel re-export |
| `src/domains/routes/feature-routes-runtime.ts` | Update 2 `require()` paths |
| `lib/skills-catalog/**/*.js` (11 files) | DELETE after port |
| `lib/skills-catalog/DOCUMENTATION.md` | DELETE after port |

---

### Task 1: Create types.ts and utils.ts

**Files:**
- Create: `packages/web/server/src/domains/skills-catalog/types.ts`
- Create: `packages/web/server/src/domains/skills-catalog/utils.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p packages/web/server/src/domains/skills-catalog/clawdhub
```

- [ ] **Step 2: Write types.ts**

```typescript
export interface SkillGitIdentity {
  sshKey: string | null;
}

export interface SkillCacheKey {
  normalizedRepo: string;
  subpath: string;
  identityId: string;
}

export interface SkillCatalogItem {
  repoSource: string;
  repoSubpath?: string;
  skillDir: string;
  skillName: string;
  frontmatterName?: string;
  description?: string;
  installable: boolean;
  warnings?: string[];
}

export interface SkillSourceParseOk {
  ok: true;
  host: string;
  owner: string;
  repo: string;
  cloneUrlSsh: string;
  cloneUrlHttps: string;
  effectiveSubpath?: string | null;
  normalizedRepo: string;
}

export interface SkillSourceParseError {
  ok: false;
  error: { kind: string; message: string };
}

export type SkillSourceParseResult = SkillSourceParseOk | SkillSourceParseError;

export interface SkillSourceParseOptions {
  subpath?: string;
}

export interface GitRunResultOk {
  ok: true;
  stdout: string;
  stderr: string;
}

export interface GitRunResultError {
  ok: false;
  stdout: string;
  stderr: string;
  message: string;
  code: number | null;
  signal: string | null;
}

export type GitRunResult = GitRunResultOk | GitRunResultError;

export interface GitRunOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
  identity?: SkillGitIdentity | null;
}

export interface GitAssertResultOk {
  ok: true;
}

export interface GitAssertResultError {
  ok: false;
  error: { kind: string; message: string };
}

export type GitAssertResult = GitAssertResultOk | GitAssertResultError;

export interface ScanSkillsOptions {
  source: string;
  subpath?: string;
  defaultSubpath?: string;
  identity?: SkillGitIdentity | null;
}

export interface ScanSkillsOptions {
  source: string;
  subpath?: string;
  defaultSubpath?: string;
  identity?: SkillGitIdentity | null;
  scope?: string;
  targetSource?: string;
  workingDirectory?: string | null;
  userSkillDir: string;
  selections?: Array<{ skillDir?: string }>;
  conflictPolicy?: string;
  conflictDecisions?: Record<string, string>;
}

export interface InstalledSkill {
  skillName: string;
  scope: string;
  source: string;
}

export interface SkippedSkill {
  skillName: string;
  reason: string;
}

export interface InstallSkillsOk {
  ok: true;
  installed: InstalledSkill[];
  skipped: SkippedSkill[];
}

export interface InstallSkillsError {
  ok: false;
  error: {
    kind: string;
    message: string;
    sshOnly?: boolean;
    conflicts?: Array<{ skillName: string; scope: string; source: string }>;
  };
}

export type InstallSkillsResult = InstallSkillsOk | InstallSkillsError;

export interface CuratedSkillSource {
  id: string;
  label: string;
  description: string;
  source: string;
  defaultSubpath?: string;
  sourceType: string;
}

export interface ClawdHubApiItem {
  slug: string;
  displayName?: string;
  summary?: string | null;
  tags?: { latest?: string };
  latestVersion?: { version: string };
  owner?: { handle?: string };
  stats?: { downloads?: number; stars?: number; versions?: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface ClawdHubCatalogItem extends SkillCatalogItem {
  sourceId: string;
  gitIdentityId: null;
  repoSubpath: null;
  clawdhub: {
    slug: string;
    version: string;
    displayName?: string;
    owner?: string | null;
    downloads: number;
    stars: number;
    versionsCount: number;
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface ClawdHubScanPageOptions {
  cursor?: string | null;
}

export interface ClawdHubScanPageOk {
  ok: true;
  items: ClawdHubCatalogItem[];
  nextCursor?: string | null;
}

export interface ClawdHubScanPageError {
  ok: false;
  error: { kind: string; message: string };
}

export type ClawdHubScanPageResult = ClawdHubScanPageOk | ClawdHubScanPageError;

export interface ClawdHubInstallOptions {
  scope?: string;
  targetSource?: string;
  workingDirectory?: string | null;
  userSkillDir: string;
  selections?: Array<{ skillDir: string; clawdhub?: { slug?: string; version?: string } }>;
  conflictPolicy?: string;
  conflictDecisions?: Record<string, string>;
}

export type ClawdHubInstallResult = InstallSkillsResult;

export interface ClawdHubSkillPlan {
  slug: string;
  version: string;
  installable: boolean;
}

export interface ClawdHubFetchSkillsResult {
  items: ClawdHubApiItem[];
  nextCursor: string | null;
}
```

- [ ] **Step 3: Write utils.ts**

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export function validateSkillName(skillName: string): boolean {
  if (typeof skillName !== "string") return false;
  if (skillName.length < 1 || skillName.length > 64) return false;
  return SKILL_NAME_PATTERN.test(skillName);
}

export async function safeRm(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function normalizeUserSkillDir(userSkillDir: string | undefined | null): string | null {
  if (!userSkillDir) return null;
  const legacySkillDir = path.join(os.homedir(), ".config", "opencode", "skill");
  const pluralSkillDir = path.join(os.homedir(), ".config", "opencode", "skills");
  if (userSkillDir === legacySkillDir) {
    if (fs.existsSync(legacySkillDir) && !fs.existsSync(pluralSkillDir)) return legacySkillDir;
    return pluralSkillDir;
  }
  return userSkillDir;
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export function getTargetSkillDir({
  scope,
  targetSource,
  workingDirectory,
  userSkillDir,
  skillName,
}: {
  scope: string;
  targetSource?: string;
  workingDirectory?: string | null;
  userSkillDir: string;
  skillName: string;
}): string {
  const source = targetSource === "agents" ? "agents" : "opencode";

  if (scope === "user") {
    if (source === "agents") {
      return path.join(os.homedir(), ".agents", "skills", skillName);
    }
    return path.join(userSkillDir, skillName);
  }

  if (!workingDirectory) {
    throw new Error("workingDirectory is required for project installs");
  }

  if (source === "agents") {
    return path.join(workingDirectory, ".agents", "skills", skillName);
  }

  return path.join(workingDirectory, ".opencode", "skills", skillName);
}

export async function copyDirectoryNoSymlinks(srcDir: string, dstDir: string): Promise<void> {
  const srcReal = await fs.promises.realpath(srcDir);
  await ensureDir(dstDir);

  const walk = async (currentSrc: string, currentDst: string): Promise<void> => {
    const entries = await fs.promises.readdir(currentSrc, { withFileTypes: true });
    for (const entry of entries) {
      const nextSrc = path.join(currentSrc, entry.name);
      const nextDst = path.join(currentDst, entry.name);

      const stat = await fs.promises.lstat(nextSrc);
      if (stat.isSymbolicLink()) {
        throw new Error("Symlinks are not supported in skills");
      }

      // Guard against traversal: ensure source is still under srcReal
      const nextRealParent = await fs.promises.realpath(path.dirname(nextSrc));
      if (!nextRealParent.startsWith(srcReal)) {
        throw new Error("Invalid source path traversal detected");
      }

      if (stat.isDirectory()) {
        await ensureDir(nextDst);
        await walk(nextSrc, nextDst);
        continue;
      }

      if (stat.isFile()) {
        await ensureDir(path.dirname(nextDst));
        await fs.promises.copyFile(nextSrc, nextDst);
        try {
          await fs.promises.chmod(nextDst, stat.mode & 0o777);
        } catch {
          // best-effort
        }
        continue;
      }

      // Skip other types (sockets, devices, etc.)
    }
  };

  await walk(srcDir, dstDir);
}

export function toFsPath(repoDir: string, repoRelPosixPath: string): string {
  const parts = String(repoRelPosixPath || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  return path.join(repoDir, ...parts);
}
```

- [ ] **Step 4: Verify type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

---

### Task 2: Port leaf modules (cache.ts, curated-sources.ts, source.ts, git.ts)

**Files:**
- Create: `packages/web/server/src/domains/skills-catalog/cache.ts`
- Create: `packages/web/server/src/domains/skills-catalog/curated-sources.ts`
- Create: `packages/web/server/src/domains/skills-catalog/source.ts`
- Create: `packages/web/server/src/domains/skills-catalog/git.ts`

- [ ] **Step 1: Write cache.ts**

```typescript
import type { SkillCacheKey } from "./types.js";

const DEFAULT_TTL_MS = 30 * 60 * 1000;

const cache = new Map<string, { expiresAt: number; value: unknown }>();

export function getCacheKey({ normalizedRepo, subpath, identityId }: SkillCacheKey): string {
  const safeRepo = String(normalizedRepo || "").trim();
  const safeSubpath = String(subpath || "").trim();
  const safeIdentity = String(identityId || "").trim();
  return `${safeRepo}::${safeSubpath}::${safeIdentity}`;
}

export function getCachedScan(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedScan(key: string, value: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
  const ttl = Number.isFinite(ttlMs) ? ttlMs : DEFAULT_TTL_MS;
  cache.set(key, { expiresAt: Date.now() + ttl, value });
}

export function clearCache(): void {
  cache.clear();
}
```

- [ ] **Step 2: Write curated-sources.ts**

```typescript
import type { CuratedSkillSource } from "./types.js";

export const CURATED_SKILLS_SOURCES: CuratedSkillSource[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Anthropic's public skills repository",
    source: "anthropics/skills",
    defaultSubpath: "skills",
    sourceType: "github",
  },
  {
    id: "clawdhub",
    label: "ClawdHub",
    description: "Community skill registry with vector search",
    source: "clawdhub:registry",
    sourceType: "clawdhub",
  },
];

export function getCuratedSkillsSources(): CuratedSkillSource[] {
  return CURATED_SKILLS_SOURCES.slice();
}
```

- [ ] **Step 3: Write source.ts**

```typescript
import type { SkillSourceParseResult, SkillSourceParseOptions } from "./types.js";

const GITHUB_HOST = "github.com";

interface OwnerRepo {
  owner: string;
  repo: string;
}

function normalizeGitHubOwnerRepo(owner: string, repo: string): OwnerRepo | null {
  const normalizedOwner = String(owner || "").trim();
  const normalizedRepo = String(repo || "").trim().replace(/\.git$/i, "");
  if (!normalizedOwner || !normalizedRepo) {
    return null;
  }
  return { owner: normalizedOwner, repo: normalizedRepo };
}

export function parseSkillRepoSource(
  input: string,
  options: SkillSourceParseOptions = {}
): SkillSourceParseResult {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) {
    return { ok: false, error: { kind: "invalidSource", message: "Repository source is required" } };
  }

  const explicitSubpath =
    typeof options.subpath === "string" && options.subpath.trim() ? options.subpath.trim() : null;

  // SSH URL: git@github.com:owner/repo(.git)
  const sshMatch = raw.match(/^git@github\.com:([^/\s]+)\/([^\s#]+)$/i);
  if (sshMatch) {
    const parsed = normalizeGitHubOwnerRepo(sshMatch[1], sshMatch[2]);
    if (!parsed) {
      return { ok: false, error: { kind: "invalidSource", message: "Invalid SSH repository URL" } };
    }

    return {
      ok: true,
      host: GITHUB_HOST,
      owner: parsed.owner,
      repo: parsed.repo,
      cloneUrlSsh: `git@github.com:${parsed.owner}/${parsed.repo}.git`,
      cloneUrlHttps: `https://github.com/${parsed.owner}/${parsed.repo}.git`,
      effectiveSubpath: explicitSubpath,
      normalizedRepo: `${parsed.owner}/${parsed.repo}`,
    };
  }

  // HTTPS URL: https://github.com/owner/repo(.git)
  const httpsMatch = raw.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^\s#]+)$/i);
  if (httpsMatch) {
    const parsed = normalizeGitHubOwnerRepo(httpsMatch[1], httpsMatch[2]);
    if (!parsed) {
      return { ok: false, error: { kind: "invalidSource", message: "Invalid HTTPS repository URL" } };
    }

    return {
      ok: true,
      host: GITHUB_HOST,
      owner: parsed.owner,
      repo: parsed.repo,
      cloneUrlSsh: `git@github.com:${parsed.owner}/${parsed.repo}.git`,
      cloneUrlHttps: `https://github.com/${parsed.owner}/${parsed.repo}.git`,
      effectiveSubpath: explicitSubpath,
      normalizedRepo: `${parsed.owner}/${parsed.repo}`,
    };
  }

  // Shorthand: owner/repo[/subpath...]
  const shorthandMatch = raw.match(/^([^/\s]+)\/([^/\s]+)(?:\/(.+))?$/);
  if (shorthandMatch) {
    const parsed = normalizeGitHubOwnerRepo(shorthandMatch[1], shorthandMatch[2]);
    if (!parsed) {
      return { ok: false, error: { kind: "invalidSource", message: "Invalid repository source" } };
    }

    const shorthandSubpath =
      typeof shorthandMatch[3] === "string" && shorthandMatch[3].trim()
        ? shorthandMatch[3].trim()
        : null;
    const effectiveSubpath = explicitSubpath || shorthandSubpath;

    return {
      ok: true,
      host: GITHUB_HOST,
      owner: parsed.owner,
      repo: parsed.repo,
      cloneUrlSsh: `git@github.com:${parsed.owner}/${parsed.repo}.git`,
      cloneUrlHttps: `https://github.com/${parsed.owner}/${parsed.repo}.git`,
      effectiveSubpath,
      normalizedRepo: `${parsed.owner}/${parsed.repo}`,
    };
  }

  return { ok: false, error: { kind: "invalidSource", message: "Unsupported repository source format" } };
}
```

- [ ] **Step 4: Write git.ts**

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitRunResult, GitRunOptions, GitAssertResult } from "./types.js";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024;

export function looksLikeAuthError(message: string): boolean {
  const text = String(message || "");
  return (
    /permission denied/i.test(text) ||
    /publickey/i.test(text) ||
    /could not read from remote repository/i.test(text) ||
    /authentication failed/i.test(text) ||
    /fatal: could not/i.test(text)
  );
}

export async function runGit(args: string[], options: GitRunOptions = {}): Promise<GitRunResult> {
  const cwd = options.cwd;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxBuffer = Number.isFinite(options.maxBuffer) ? options.maxBuffer : DEFAULT_MAX_BUFFER;

  const identity = options.identity || null;
  const normalizedArgs = Array.isArray(args) ? args.slice() : [];

  // Non-interactive git (avoid prompts / hangs)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
  };

  if (identity?.sshKey) {
    const sshKeyPath = String(identity.sshKey).trim();
    if (sshKeyPath) {
      const sshCommand = `ssh -i ${sshKeyPath} -o BatchMode=yes -o StrictHostKeyChecking=accept-new`;
      normalizedArgs.unshift(`core.sshCommand=${sshCommand}`);
      normalizedArgs.unshift("-c");
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync("git", normalizedArgs, {
      cwd,
      env,
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer,
    });

    return { ok: true, stdout: stdout || "", stderr: stderr || "" };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number; signal?: string };
    const stdout = typeof err?.stdout === "string" ? err.stdout : "";
    const stderr = typeof err?.stderr === "string" ? err.stderr : "";
    const message = err instanceof Error ? err.message : String(err);

    return {
      ok: false,
      stdout,
      stderr,
      message,
      code: typeof err?.code === "number" ? err.code : null,
      signal: typeof err?.signal === "string" ? err.signal : null,
    };
  }
}

export async function assertGitAvailable(): Promise<GitAssertResult> {
  const result = await runGit(["--version"], { timeoutMs: 5_000 });
  if (!result.ok) {
    return { ok: false, error: { kind: "gitUnavailable", message: "Git is not available in PATH" } };
  }
  return { ok: true };
}
```

- [ ] **Step 5: Verify type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

---

### Task 3: Port scan.ts

**Files:**
- Create: `packages/web/server/src/domains/skills-catalog/scan.ts`

- [ ] **Step 1: Write scan.ts**

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";

import { assertGitAvailable, looksLikeAuthError, runGit } from "./git.js";
import { parseSkillRepoSource } from "./source.js";
import { validateSkillName, safeRm } from "./utils.js";
import type { ScanSkillsOptions, ScanSkillsResult, SkillCatalogItem, SkillMdParseResult, GitRunResult, SkillGitIdentity } from "./types.js";

function parseSkillMd(content: string): SkillMdParseResult {
  const text = typeof content === "string" ? content : "";
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return {
      ok: true,
      frontmatter: {},
      warnings: ["Invalid SKILL.md: missing YAML frontmatter delimiter"],
    };
  }

  try {
    const frontmatter = (yaml.parse(match[1]) || {}) as Record<string, unknown>;
    return { ok: true, frontmatter, warnings: [] };
  } catch {
    return {
      ok: true,
      frontmatter: {},
      warnings: ["Invalid SKILL.md: failed to parse YAML frontmatter"],
    };
  }
}

async function cloneRepo({
  cloneUrl,
  identity,
  tempDir,
}: {
  cloneUrl: string;
  identity: SkillGitIdentity | null;
  tempDir: string;
}): Promise<{ ok: true } | { ok: false; error: GitRunResult }> {
  const preferred = ["clone", "--depth", "1", "--filter=blob:none", "--no-checkout", cloneUrl, tempDir];
  const fallback = ["clone", "--depth", "1", "--no-checkout", cloneUrl, tempDir];

  const result = await runGit(preferred, { identity, timeoutMs: 60_000 });
  if (result.ok) return { ok: true };

  const fallbackResult = await runGit(fallback, { identity, timeoutMs: 60_000 });
  if (fallbackResult.ok) return { ok: true };

  return {
    ok: false,
    error: fallbackResult,
  };
}

export async function scanSkillsRepository({
  source,
  subpath,
  defaultSubpath,
  identity,
}: ScanSkillsOptions = {}): Promise<ScanSkillsResult> {
  const gitCheck = await assertGitAvailable();
  if (!gitCheck.ok) {
    return { ok: false, error: gitCheck.error };
  }

  const parsed = parseSkillRepoSource(source, { subpath });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const effectiveSubpath =
    parsed.effectiveSubpath ||
    (typeof defaultSubpath === "string" && defaultSubpath.trim() ? defaultSubpath.trim() : null);
  const cloneUrl = identity?.sshKey ? parsed.cloneUrlSsh : parsed.cloneUrlHttps;

  const tempBase = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openchamber-skills-scan-"));

  try {
    const cloned = await cloneRepo({ cloneUrl, identity: identity ?? null, tempDir: tempBase });
    if (!cloned.ok) {
      const msg = `${cloned.error?.stderr || ""}\n${cloned.error?.message || ""}`.trim();
      if (looksLikeAuthError(msg)) {
        return {
          ok: false,
          error: { kind: "authRequired", message: "Authentication required to access this repository", sshOnly: true },
        };
      }
      return { ok: false, error: { kind: "networkError", message: msg || "Failed to clone repository" } };
    }

    const toFsPath = (posixPath: string): string =>
      path.join(tempBase, ...String(posixPath || "").split("/").filter(Boolean));

    const patterns = effectiveSubpath
      ? [`${effectiveSubpath}/SKILL.md`, `${effectiveSubpath}/**/SKILL.md`]
      : ["SKILL.md", "**/SKILL.md"];

    let skillMdPaths: string[] | null = null;

    // Fast path: sparse checkout only SKILL.md files, then parse from disk.
    const sparseInit = await runGit(["-C", tempBase, "sparse-checkout", "init", "--no-cone"], {
      identity: identity ?? null,
      timeoutMs: 15_000,
    });
    if (sparseInit.ok) {
      const sparseSet = await runGit(["-C", tempBase, "sparse-checkout", "set", ...patterns], {
        identity: identity ?? null,
        timeoutMs: 30_000,
      });
      if (sparseSet.ok) {
        const checkout = await runGit(["-C", tempBase, "checkout", "--force", "HEAD"], {
          identity: identity ?? null,
          timeoutMs: 60_000,
        });
        if (checkout.ok) {
          const lsFiles = await runGit(["-C", tempBase, "ls-files"], {
            identity: identity ?? null,
            timeoutMs: 15_000,
          });
          if (lsFiles.ok) {
            skillMdPaths = lsFiles.stdout
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
              .filter((p) => p.endsWith("/SKILL.md") || p === "SKILL.md");
          }
        }
      }
    }

    // Fallback: list tree and read SKILL.md blobs via git.
    if (!Array.isArray(skillMdPaths)) {
      const listArgs = ["-C", tempBase, "ls-tree", "-r", "--name-only", "HEAD"];
      if (effectiveSubpath) {
        listArgs.push("--", effectiveSubpath);
      }

      const listResult = await runGit(listArgs, { identity: identity ?? null, timeoutMs: 30_000 });
      if (!listResult.ok) {
        return {
          ok: true,
          normalizedRepo: parsed.normalizedRepo,
          effectiveSubpath,
          items: [],
        };
      }

      skillMdPaths = listResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((p) => p.endsWith("/SKILL.md") || p === "SKILL.md");
    }

    // Root-level SKILL.md doesn't map cleanly to "skill name == folder name" convention.
    const uniqueSkillDirs = Array.from(
      new Set(
        skillMdPaths
          .filter((p) => p !== "SKILL.md")
          .map((p) => path.posix.dirname(p))
      )
    );

    const items: SkillCatalogItem[] = [];
    const maxParallel = 10;
    let idx = 0;

    const worker = async (): Promise<void> => {
      while (idx < uniqueSkillDirs.length) {
        const skillDir = uniqueSkillDirs[idx++];
        const skillName = path.posix.basename(skillDir);
        const skillMdPath = path.posix.join(skillDir, "SKILL.md");

        const warnings: string[] = [];
        let skillMdContent = "";

        // Prefer filesystem reads when sparse checkout succeeded.
        const filePath = toFsPath(skillMdPath);
        try {
          skillMdContent = await fs.promises.readFile(filePath, "utf8");
        } catch {
          const showResult = await runGit(["-C", tempBase, "show", `HEAD:${skillMdPath}`], {
            identity: identity ?? null,
            timeoutMs: 15_000,
          });
          if (!showResult.ok) {
            warnings.push("Failed to read SKILL.md");
          } else {
            skillMdContent = showResult.stdout;
          }
        }

        const parsedMd = parseSkillMd(skillMdContent);
        warnings.push(...(parsedMd.warnings || []));

        const description =
          typeof parsedMd.frontmatter?.description === "string"
            ? parsedMd.frontmatter.description
            : undefined;
        const frontmatterName =
          typeof parsedMd.frontmatter?.name === "string" ? parsedMd.frontmatter.name : undefined;

        const installable = validateSkillName(skillName);
        if (!installable) {
          warnings.push("Skill directory name is not a valid OpenCode skill name");
        }

        items.push({
          repoSource: source,
          repoSubpath: effectiveSubpath || undefined,
          skillDir,
          skillName,
          frontmatterName,
          description,
          installable,
          warnings: warnings.length ? warnings : undefined,
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(maxParallel, uniqueSkillDirs.length || 1) }, () => worker())
    );

    // Stable ordering for UX
    items.sort((a, b) => a.skillName.localeCompare(b.skillName));

    return {
      ok: true,
      normalizedRepo: parsed.normalizedRepo,
      effectiveSubpath,
      items,
    };
  } finally {
    await safeRm(tempBase);
  }
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

---

### Task 4: Port install.ts

**Files:**
- Create: `packages/web/server/src/domains/skills-catalog/install.ts`

- [ ] **Step 1: Write install.ts**

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { assertGitAvailable, looksLikeAuthError, runGit } from "./git.js";
import { parseSkillRepoSource } from "./source.js";
import { validateSkillName, safeRm, normalizeUserSkillDir, ensureDir, getTargetSkillDir, copyDirectoryNoSymlinks, toFsPath } from "./utils.js";
import type { InstallSkillsOptions, InstallSkillsResult, GitRunResult } from "./types.js";
import type { SkillGitIdentity } from "./types.js";

async function cloneRepo({
  cloneUrl,
  identity,
  tempDir,
}: {
  cloneUrl: string;
  identity: SkillGitIdentity | null;
  tempDir: string;
}): Promise<{ ok: true } | { ok: false; error: GitRunResult }> {
  const preferred = ["clone", "--depth", "1", "--filter=blob:none", "--no-checkout", cloneUrl, tempDir];
  const fallback = ["clone", "--depth", "1", "--no-checkout", cloneUrl, tempDir];

  const result = await runGit(preferred, { identity, timeoutMs: 90_000 });
  if (result.ok) return { ok: true };

  const fallbackResult = await runGit(fallback, { identity, timeoutMs: 90_000 });
  if (fallbackResult.ok) return { ok: true };

  return {
    ok: false,
    error: fallbackResult,
  };
}

export async function installSkillsFromRepository({
  source,
  subpath,
  defaultSubpath,
  identity,
  scope,
  targetSource,
  workingDirectory,
  userSkillDir,
  selections,
  conflictPolicy,
  conflictDecisions,
}: InstallSkillsOptions = { userSkillDir: "" }): Promise<InstallSkillsResult> {
  const gitCheck = await assertGitAvailable();
  if (!gitCheck.ok) {
    return { ok: false, error: gitCheck.error };
  }

  let normalizedUserSkillDir = normalizeUserSkillDir(userSkillDir);
  if (normalizedUserSkillDir) {
    userSkillDir = normalizedUserSkillDir;
  }

  if (!userSkillDir) {
    return { ok: false, error: { kind: "unknown", message: "userSkillDir is required" } };
  }

  if (scope !== "user" && scope !== "project") {
    return { ok: false, error: { kind: "invalidSource", message: "Invalid scope" } };
  }

  if (targetSource !== undefined && targetSource !== "opencode" && targetSource !== "agents") {
    return { ok: false, error: { kind: "invalidSource", message: "Invalid target source" } };
  }

  if (scope === "project" && !workingDirectory) {
    return {
      ok: false,
      error: { kind: "invalidSource", message: "Project installs require a directory parameter" },
    };
  }

  const parsed = parseSkillRepoSource(source, { subpath });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const effectiveSubpath =
    parsed.effectiveSubpath ||
    (typeof defaultSubpath === "string" && defaultSubpath.trim() ? defaultSubpath.trim() : null);
  void effectiveSubpath;

  const cloneUrl = identity?.sshKey ? parsed.cloneUrlSsh : parsed.cloneUrlHttps;

  const requestedDirs = Array.isArray(selections)
    ? selections.map((s) => String(s?.skillDir || "").trim()).filter(Boolean)
    : [];
  if (requestedDirs.length === 0) {
    return { ok: false, error: { kind: "invalidSource", message: "No skills selected for installation" } };
  }

  // Validate names early and compute conflicts without mutating.
  const skillPlans = requestedDirs.map((skillDirPosix) => {
    const skillName = path.posix.basename(skillDirPosix);
    return { skillDirPosix, skillName, installable: validateSkillName(skillName) };
  });

  const conflicts: Array<{ skillName: string; scope: string; source: string }> = [];
  for (const plan of skillPlans) {
    if (!plan.installable) {
      continue;
    }

    const targetDir = getTargetSkillDir({
      scope: scope!,
      targetSource,
      workingDirectory,
      userSkillDir,
      skillName: plan.skillName,
    });
    if (fs.existsSync(targetDir)) {
      const decision = conflictDecisions?.[plan.skillName];
      const hasAutoPolicy = conflictPolicy === "skipAll" || conflictPolicy === "overwriteAll";
      if (!decision && !hasAutoPolicy) {
        conflicts.push({
          skillName: plan.skillName,
          scope: scope!,
          source: targetSource === "agents" ? "agents" : "opencode",
        });
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      error: {
        kind: "conflicts",
        message: "Some skills already exist in the selected scope",
        conflicts,
      },
    };
  }

  const tempBase = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openchamber-skills-install-"));

  try {
    const cloned = await cloneRepo({ cloneUrl, identity: identity ?? null, tempDir: tempBase });
    if (!cloned.ok) {
      const msg = `${cloned.error?.stderr || ""}\n${cloned.error?.message || ""}`.trim();
      if (looksLikeAuthError(msg)) {
        return {
          ok: false,
          error: {
            kind: "authRequired",
            message: "Authentication required to access this repository",
            sshOnly: true,
          },
        };
      }
      return { ok: false, error: { kind: "networkError", message: msg || "Failed to clone repository" } };
    }

    // Selective checkout for only requested skill dirs.
    await runGit(["-C", tempBase, "sparse-checkout", "init", "--cone"], {
      identity: identity ?? null,
      timeoutMs: 15_000,
    });
    const setResult = await runGit(["-C", tempBase, "sparse-checkout", "set", ...requestedDirs], {
      identity: identity ?? null,
      timeoutMs: 30_000,
    });
    if (!setResult.ok) {
      return {
        ok: false,
        error: { kind: "unknown", message: setResult.stderr || setResult.message || "Failed to configure sparse checkout" },
      };
    }

    const checkoutResult = await runGit(["-C", tempBase, "checkout", "--force", "HEAD"], {
      identity: identity ?? null,
      timeoutMs: 60_000,
    });
    if (!checkoutResult.ok) {
      return {
        ok: false,
        error: { kind: "unknown", message: checkoutResult.stderr || checkoutResult.message || "Failed to checkout repository" },
      };
    }

    const installed = [];
    const skipped = [];

    for (const plan of skillPlans) {
      if (!plan.installable) {
        skipped.push({ skillName: plan.skillName, reason: "Invalid skill name (directory basename)" });
        continue;
      }

      const srcDir = toFsPath(tempBase, plan.skillDirPosix);
      const skillMdPath = path.join(srcDir, "SKILL.md");
      if (!fs.existsSync(skillMdPath)) {
        skipped.push({ skillName: plan.skillName, reason: "SKILL.md not found in selected directory" });
        continue;
      }

      const targetDir = getTargetSkillDir({
        scope: scope!,
        targetSource,
        workingDirectory,
        userSkillDir,
        skillName: plan.skillName,
      });
      const exists = fs.existsSync(targetDir);

      let decision = conflictDecisions?.[plan.skillName] || null;
      if (!decision) {
        if (exists && conflictPolicy === "skipAll") decision = "skip";
        if (exists && conflictPolicy === "overwriteAll") decision = "overwrite";
        if (!exists) decision = "overwrite"; // no conflict, proceed
      }

      if (exists && decision === "skip") {
        skipped.push({ skillName: plan.skillName, reason: "Already installed (skipped)" });
        continue;
      }

      if (exists && decision === "overwrite") {
        await safeRm(targetDir);
      }

      // Ensure project parent directories exist
      await ensureDir(path.dirname(targetDir));

      try {
        await copyDirectoryNoSymlinks(srcDir, targetDir);
        installed.push({
          skillName: plan.skillName,
          scope: scope!,
          source: targetSource === "agents" ? "agents" : "opencode",
        });
      } catch (error) {
        await safeRm(targetDir);
        skipped.push({
          skillName: plan.skillName,
          reason: error instanceof Error ? error.message : "Failed to copy skill files",
        });
      }
    }

    return { ok: true, installed, skipped };
  } finally {
    await safeRm(tempBase);
  }
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

---

### Task 5: Port clawdhub/ modules (api.ts, scan.ts, install.ts, index.ts)

**Files:**
- Create: `packages/web/server/src/domains/skills-catalog/clawdhub/api.ts`
- Create: `packages/web/server/src/domains/skills-catalog/clawdhub/scan.ts`
- Create: `packages/web/server/src/domains/skills-catalog/clawdhub/install.ts`
- Create: `packages/web/server/src/domains/skills-catalog/clawdhub/index.ts`

- [ ] **Step 1: Write clawdhub/api.ts**

```typescript
import type { ClawdHubApiItem, ClawdHubFetchSkillsResult } from "../types.js";

const CLAWDHUB_API_BASE = "https://clawdhub.com/api/v1";
const CLAWDHUB_PAGE_LIMIT = 25;

// Rate limiting: ClawdHub allows 120 requests/minute
const RATE_LIMIT_DELAY_MS = 100;
let lastRequestTime = 0;

async function rateLimitedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const maxAttempts = 10;

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed));
    }
    lastRequestTime = Date.now();

    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        "User-Agent": "OpenChamber/1.0",
        ...options.headers,
      },
    });

    lastResponse = response;

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxAttempts - 1) {
        const waitMs = 50 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
    }

    return response;
  }

  return lastResponse!;
}

export async function fetchClawdHubSkills({
  cursor,
}: {
  cursor?: string;
} = {}): Promise<ClawdHubFetchSkillsResult> {
  const url = cursor
    ? `${CLAWDHUB_API_BASE}/skills?cursor=${encodeURIComponent(cursor)}&limit=${CLAWDHUB_PAGE_LIMIT}`
    : `${CLAWDHUB_API_BASE}/skills?limit=${CLAWDHUB_PAGE_LIMIT}`;

  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ClawdHub API error (${response.status}): ${text || response.statusText}`);
  }

  const data = await response.json();
  const nextCursor: string | null =
    (typeof data.nextCursor === "string" && data.nextCursor) ||
    (typeof data.next_cursor === "string" && data.next_cursor) ||
    (typeof data.next === "string" && data.next) ||
    (typeof data.cursor === "string" && data.cursor) ||
    null;

  return {
    items: data.items || [],
    nextCursor,
  };
}

export async function fetchClawdHubSkillVersion(
  slug: string,
  version: string = "latest"
): Promise<Record<string, unknown>> {
  if (version === "latest") {
    const skillResponse = await rateLimitedFetch(
      `${CLAWDHUB_API_BASE}/skills/${encodeURIComponent(slug)}`
    );
    if (!skillResponse.ok) {
      throw new Error(`ClawdHub skill not found: ${slug}`);
    }
    const skillData = await skillResponse.json();
    const latestVersion: string | undefined =
      skillData.skill?.tags?.latest || skillData.latestVersion?.version;
    if (!latestVersion) {
      throw new Error(`No latest version found for skill: ${slug}`);
    }
    version = latestVersion;
  }

  const url = `${CLAWDHUB_API_BASE}/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ClawdHub version error (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}

export async function downloadClawdHubSkill(slug: string, version: string): Promise<ArrayBuffer> {
  const versionParam =
    typeof version === "string" && version !== "latest"
      ? `&version=${encodeURIComponent(version)}`
      : "&tag=latest";
  const url = `${CLAWDHUB_API_BASE}/download?slug=${encodeURIComponent(slug)}${versionParam}`;

  const response = await rateLimitedFetch(url, {
    headers: {
      Accept: "application/zip",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ClawdHub download error (${response.status}): ${text || response.statusText}`);
  }

  return response.arrayBuffer();
}

export async function fetchClawdHubSkillInfo(slug: string): Promise<Record<string, unknown>> {
  const url = `${CLAWDHUB_API_BASE}/skills/${encodeURIComponent(slug)}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ClawdHub skill error (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}
```

- [ ] **Step 2: Write clawdhub/scan.ts**

```typescript
import { fetchClawdHubSkills } from "./api.js";
import type { ClawdHubScanPageResult, ClawdHubScanPageOptions, ClawdHubCatalogItem, ClawdHubApiItem } from "../types.js";

const MAX_PAGES = 20; // Safety limit to prevent infinite loops
const CLAWDHUB_PAGE_LIMIT = 25;

const mapClawdHubItem = (item: ClawdHubApiItem): ClawdHubCatalogItem => {
  const latestVersion = item.tags?.latest || item.latestVersion?.version || "1.0.0";

  return {
    sourceId: "clawdhub",
    repoSource: "clawdhub:registry",
    repoSubpath: null,
    gitIdentityId: null,
    skillDir: item.slug,
    skillName: item.slug,
    frontmatterName: item.displayName || item.slug,
    description: item.summary || null,
    installable: true,
    warnings: [],
    // ClawdHub-specific metadata
    clawdhub: {
      slug: item.slug,
      version: latestVersion,
      displayName: item.displayName,
      owner: item.owner?.handle || null,
      downloads: item.stats?.downloads || 0,
      stars: item.stats?.stars || 0,
      versionsCount: item.stats?.versions || 1,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    },
  };
};

export async function scanClawdHub(): Promise<
  { ok: true; items: ClawdHubCatalogItem[] } | { ok: false; error: { kind: string; message: string } }
> {
  try {
    const allItems: ClawdHubCatalogItem[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      let items: ClawdHubApiItem[] = [];
      let nextCursor: string | null = null;

      try {
        const pageResult = await fetchClawdHubSkills({ cursor: cursor ?? undefined });
        items = pageResult.items || [];
        nextCursor = pageResult.nextCursor || null;
      } catch (error) {
        if (page > 0 && allItems.length > 0) {
          console.warn("ClawdHub pagination failed; returning partial results.");
          break;
        }
        throw error;
      }

      for (const item of items) {
        allItems.push(mapClawdHubItem(item));
      }

      if (!nextCursor) {
        break;
      }
      cursor = nextCursor;
    }

    // Sort by downloads (most popular first)
    allItems.sort((a, b) => (b.clawdhub?.downloads || 0) - (a.clawdhub?.downloads || 0));

    return { ok: true, items: allItems };
  } catch (error) {
    console.error("ClawdHub scan error:", error);
    return {
      ok: false,
      error: {
        kind: "networkError",
        message: error instanceof Error ? error.message : "Failed to fetch skills from ClawdHub",
      },
    };
  }
}

export async function scanClawdHubPage({
  cursor,
}: ClawdHubScanPageOptions = {}): Promise<ClawdHubScanPageResult> {
  try {
    const { items, nextCursor } = await fetchClawdHubSkills({ cursor: cursor ?? undefined });
    const mapped: ClawdHubCatalogItem[] = (items || [])
      .map(mapClawdHubItem)
      .slice(0, CLAWDHUB_PAGE_LIMIT);
    mapped.sort((a, b) => (b.clawdhub?.downloads || 0) - (a.clawdhub?.downloads || 0));
    return { ok: true, items: mapped, nextCursor: nextCursor || null };
  } catch (error) {
    console.error("ClawdHub page scan error:", error);
    return {
      ok: false,
      error: {
        kind: "networkError",
        message: error instanceof Error ? error.message : "Failed to fetch skills from ClawdHub",
      },
    };
  }
}
```

- [ ] **Step 3: Write clawdhub/install.ts**

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";

import { downloadClawdHubSkill, fetchClawdHubSkillInfo } from "./api.js";
import { validateSkillName, safeRm, normalizeUserSkillDir, ensureDir, getTargetSkillDir } from "../utils.js";
import type { ClawdHubInstallOptions, ClawdHubInstallResult, ClawdHubSkillPlan } from "../types.js";

export async function installSkillsFromClawdHub({
  scope,
  targetSource,
  workingDirectory,
  userSkillDir,
  selections,
  conflictPolicy,
  conflictDecisions,
}: ClawdHubInstallOptions = { userSkillDir: "" }): Promise<ClawdHubInstallResult> {
  if (scope !== "user" && scope !== "project") {
    return { ok: false, error: { kind: "invalidSource", message: "Invalid scope" } };
  }

  if (targetSource !== undefined && targetSource !== "opencode" && targetSource !== "agents") {
    return { ok: false, error: { kind: "invalidSource", message: "Invalid target source" } };
  }

  if (!userSkillDir) {
    return { ok: false, error: { kind: "unknown", message: "userSkillDir is required" } };
  }

  let normalizedUserSkillDir = normalizeUserSkillDir(userSkillDir);
  if (normalizedUserSkillDir) {
    userSkillDir = normalizedUserSkillDir;
  }

  if (scope === "project" && !workingDirectory) {
    return {
      ok: false,
      error: { kind: "invalidSource", message: "Project installs require a directory parameter" },
    };
  }

  const requestedSkills = Array.isArray(selections) ? selections : [];
  if (requestedSkills.length === 0) {
    return { ok: false, error: { kind: "invalidSource", message: "No skills selected for installation" } };
  }

  // Build installation plans
  const skillPlans: ClawdHubSkillPlan[] = requestedSkills.map((sel) => {
    const slug = sel.clawdhub?.slug || sel.skillDir;
    const version = sel.clawdhub?.version || "latest";
    return {
      slug,
      version,
      installable: validateSkillName(slug),
    };
  });

  // Check for conflicts before downloading
  const conflicts: Array<{ skillName: string; scope: string; source: string }> = [];
  for (const plan of skillPlans) {
    if (!plan.installable) {
      continue;
    }

    const targetDir = getTargetSkillDir({
      scope: scope!,
      targetSource,
      workingDirectory,
      userSkillDir,
      skillName: plan.slug,
    });
    if (fs.existsSync(targetDir)) {
      const decision = conflictDecisions?.[plan.slug];
      const hasAutoPolicy = conflictPolicy === "skipAll" || conflictPolicy === "overwriteAll";
      if (!decision && !hasAutoPolicy) {
        conflicts.push({
          skillName: plan.slug,
          scope: scope!,
          source: targetSource === "agents" ? "agents" : "opencode",
        });
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      error: {
        kind: "conflicts",
        message: "Some skills already exist in the selected scope",
        conflicts,
      },
    };
  }

  const installed = [];
  const skipped = [];

  for (const plan of skillPlans) {
    if (!plan.installable) {
      skipped.push({ skillName: plan.slug, reason: "Invalid skill name" });
      continue;
    }

    try {
      // Resolve 'latest' version if needed
      let resolvedVersion = plan.version;
      if (resolvedVersion === "latest") {
        try {
          const info = await fetchClawdHubSkillInfo(plan.slug) as { skill?: { tags?: { latest?: string } }; latestVersion?: { version?: string } };
          const latest = info.skill?.tags?.latest || info.latestVersion?.version || null;
          if (latest) {
            resolvedVersion = latest;
          }
        } catch {
          // ignore
        }

        if (resolvedVersion === "latest") {
          skipped.push({ skillName: plan.slug, reason: "Unable to resolve latest version" });
          continue;
        }
      }

      const targetDir = getTargetSkillDir({
        scope: scope!,
        targetSource,
        workingDirectory,
        userSkillDir,
        skillName: plan.slug,
      });
      const exists = fs.existsSync(targetDir);

      // Determine conflict resolution
      let decision = conflictDecisions?.[plan.slug] || null;
      if (!decision) {
        if (exists && conflictPolicy === "skipAll") decision = "skip";
        if (exists && conflictPolicy === "overwriteAll") decision = "overwrite";
        if (!exists) decision = "overwrite"; // No conflict, proceed
      }

      if (exists && decision === "skip") {
        skipped.push({ skillName: plan.slug, reason: "Already installed (skipped)" });
        continue;
      }

      if (exists && decision === "overwrite") {
        await safeRm(targetDir);
      }

      // Download the skill ZIP
      const zipBuffer = await downloadClawdHubSkill(plan.slug, resolvedVersion);

      // Extract to a temp directory first for validation
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `clawdhub-${plan.slug}-`));

      try {
        const zip = new AdmZip(Buffer.from(zipBuffer));
        zip.extractAllTo(tempDir, true);

        // Verify SKILL.md exists
        const skillMdPath = path.join(tempDir, "SKILL.md");
        if (!fs.existsSync(skillMdPath)) {
          skipped.push({ skillName: plan.slug, reason: "SKILL.md not found in downloaded package" });
          continue;
        }

        // Move to target directory
        await ensureDir(path.dirname(targetDir));
        await fs.promises.rename(tempDir, targetDir);

        installed.push({
          skillName: plan.slug,
          scope: scope!,
          source: targetSource === "agents" ? "agents" : "opencode",
        });
      } catch (extractError) {
        await safeRm(tempDir);
        throw extractError;
      }
    } catch (error) {
      console.error(`Failed to install ClawdHub skill "${plan.slug}":`, error);
      skipped.push({
        skillName: plan.slug,
        reason: error instanceof Error ? error.message : "Failed to download or extract skill",
      });
    }
  }

  return { ok: true, installed, skipped };
}
```

- [ ] **Step 4: Write clawdhub/index.ts**

```typescript
export { scanClawdHub, scanClawdHubPage } from "./scan.js";
export { installSkillsFromClawdHub } from "./install.js";
export {
  fetchClawdHubSkills,
  fetchClawdHubSkillVersion,
  fetchClawdHubSkillInfo,
  downloadClawdHubSkill,
} from "./api.js";

export function isClawdHubSource(source: string): boolean {
  return typeof source === "string" && source.startsWith("clawdhub:");
}

export const CLAWDHUB_SOURCE_ID = "clawdhub";
export const CLAWDHUB_SOURCE_STRING = "clawdhub:registry";
```

- [ ] **Step 5: Verify type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

---

### Task 6: Create barrel index.ts

**Files:**
- Create: `packages/web/server/src/domains/skills-catalog/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
export {
  CURATED_SKILLS_SOURCES,
  getCuratedSkillsSources,
} from "./curated-sources.js";

export {
  getCacheKey,
  getCachedScan,
  setCachedScan,
  clearCache,
} from "./cache.js";

export {
  parseSkillRepoSource,
} from "./source.js";

export {
  scanSkillsRepository,
} from "./scan.js";

export {
  installSkillsFromRepository,
} from "./install.js";

export {
  scanClawdHub,
  scanClawdHubPage,
  installSkillsFromClawdHub,
  fetchClawdHubSkills,
  fetchClawdHubSkillVersion,
  fetchClawdHubSkillInfo,
  downloadClawdHubSkill,
  isClawdHubSource,
  CLAWDHUB_SOURCE_ID,
  CLAWDHUB_SOURCE_STRING,
} from "./clawdhub/index.js";

export type {
  SkillCacheKey,
  SkillCatalogItem,
  SkillSourceParseResult,
  SkillSourceParseOptions,
  GitRunResult,
  GitRunOptions,
  GitAssertResult,
  ScanSkillsOptions,
  ScanSkillsResult,
  SkillMdParseResult,
  InstallSkillsOptions,
  InstalledSkill,
  SkippedSkill,
  InstallSkillsResult,
  CuratedSkillSource,
  ClawdHubApiItem,
  ClawdHubCatalogItem,
  ClawdHubScanPageOptions,
  ClawdHubScanPageResult,
  ClawdHubInstallOptions,
  ClawdHubInstallResult,
} from "./types.js";
```

- [ ] **Step 2: Verify type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

---

### Task 7: Update consumers

**Files:**
- Modify: `packages/web/server/src/domains/routes/feature-routes-runtime.ts` (lines 148-153)
- Modify: `packages/web/server/lib/opencode/routes/feature-routes-runtime.js` (line 170)

- [ ] **Step 1: Update TS consumer (feature-routes-runtime.ts)**

Replace lines 148-153:

```
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCuratedSkillsSources, getCacheKey, getCachedScan, setCachedScan } = require('../../../lib/skills-catalog/index.js') as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseSkillRepoSource, scanSkillsRepository, installSkillsFromRepository } = require('../../../lib/skills-catalog/index.js') as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { scanClawdHubPage, installSkillsFromClawdHub, isClawdHubSource } = require('../../../lib/skills-catalog/index.js') as any;
```

with:

```typescript
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
      getCuratedSkillsSources, getCacheKey, getCachedScan, setCachedScan,
      parseSkillRepoSource, scanSkillsRepository, installSkillsFromRepository,
      scanClawdHubPage, installSkillsFromClawdHub, isClawdHubSource,
    } = require('../skills-catalog/index.js') as any;
```

- [ ] **Step 2: Update legacy JS consumer (feature-routes-runtime.js)**

Replace line 170:

```javascript
    } = await import('../../skills-catalog/index.js');
```

with:

```javascript
    } = await import('../../../src/domains/skills-catalog/index.js');
```

(But verify the relative path is correct from `lib/opencode/routes/` — should be `../../../src/domains/skills-catalog/index.js`)

- [ ] **Step 3: Verify type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

---

### Task 8: Delete old lib/ files and verify

- [ ] **Step 1: Delete old JS files**

```bash
rm packages/web/server/lib/skills-catalog/cache.js
rm packages/web/server/lib/skills-catalog/curated-sources.js
rm packages/web/server/lib/skills-catalog/git.js
rm packages/web/server/lib/skills-catalog/index.js
rm packages/web/server/lib/skills-catalog/install.js
rm packages/web/server/lib/skills-catalog/scan.js
rm packages/web/server/lib/skills-catalog/source.js
rm packages/web/server/lib/skills-catalog/DOCUMENTATION.md
rm packages/web/server/lib/skills-catalog/clawdhub/api.js
rm packages/web/server/lib/skills-catalog/clawdhub/index.js
rm packages/web/server/lib/skills-catalog/clawdhub/install.js
rm packages/web/server/lib/skills-catalog/clawdhub/scan.js
# Remove empty directories
rmdir packages/web/server/lib/skills-catalog/clawdhub
rmdir packages/web/server/lib/skills-catalog
```

- [ ] **Step 2: Run type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

Expected: 0 errors.

- [ ] **Step 3: Build server**

```bash
bun run build:web-server
```

Expected: 0 errors.

- [ ] **Step 4: Run domain tests**

```bash
cd packages/web && bun test server/src/domains/
```

Expected: all 57 tests PASS (same as pre-existing baseline from `index.js` consumers).

- [ ] **Step 5: Verify no remaining lib references to skills-catalog**

```bash
grep -r "skills-catalog" packages/web/server/ --include="*.ts" --include="*.js" | grep -v node_modules | grep -v src/domains/skills-catalog | grep -v lib/skills-catalog
```

Expected: Only `feature-routes-runtime.ts` and `feature-routes-runtime.js` (the updated consumers). No stale references.

- [ ] **Step 6: Run full type-check**

```bash
bun run type-check
```

---

### Task 9: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add packages/web/server/src/domains/skills-catalog/
git add packages/web/server/src/domains/routes/feature-routes-runtime.ts
git add packages/web/server/lib/opencode/routes/feature-routes-runtime.js
git rm packages/web/server/lib/skills-catalog/cache.js
git rm packages/web/server/lib/skills-catalog/curated-sources.js
git rm packages/web/server/lib/skills-catalog/git.js
git rm packages/web/server/lib/skills-catalog/index.js
git rm packages/web/server/lib/skills-catalog/install.js
git rm packages/web/server/lib/skills-catalog/scan.js
git rm packages/web/server/lib/skills-catalog/source.js
git rm packages/web/server/lib/skills-catalog/DOCUMENTATION.md
git rm packages/web/server/lib/skills-catalog/clawdhub/api.js
git rm packages/web/server/lib/skills-catalog/clawdhub/index.js
git rm packages/web/server/lib/skills-catalog/clawdhub/install.js
git rm packages/web/server/lib/skills-catalog/clawdhub/scan.js
git commit -m "feat: port skills-catalog domain to TypeScript (Stage 9.2)"
```
