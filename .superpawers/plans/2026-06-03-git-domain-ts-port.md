# Git Domain TypeScript Port — Stage 9.3 ✅ COMPLETE

> **Status:** All 8 tasks complete. **Date:** 2026-06-03.

**Goal:** Port 4 remaining JS files in `packages/web/server/lib/git/` to TypeScript `src/domains/git/`, following the established barrel pattern, enabling deletion of the bounded-cache shim.

**Architecture:** Three focused modules (`credentials.ts`, `identity-storage.ts`, `service.ts`) plus a `types.ts`. Barrel `index.ts` re-exports everything. `routes.ts` already ported — its dynamic `import("./index.js")` will resolve to the TS barrel after this work. The `service.ts` replaces `require("../core/bounded-cache.js")` with typed import from `../core/bounded-cache.js`.

**Tech Stack:** TypeScript, `simple-git`, `better-sqlite3` (dynamic require), Node built-ins (`fs`, `path`, `os`, `child_process`, `util`)

**Completion notes:**
- 5 TS files created (~3,800 lines), 4 JS files deleted from `lib/git/`
- `feature-routes-runtime.ts` updated: `require('../../../lib/git/index.js')` → `require('../git/index.js')`
- `bounded-cache.js` shim: consumers reduced from 2→1 (remaining consumer: `lib/opencode/routes/pwa-manifest-routes.js` — Stage 9.6)
- Server type-check: 0 errors. Build: 0 errors.

---

## File Structure

| File | Purpose |
|------|---------|
| `src/domains/git/types.ts` | All shared type interfaces |
| `src/domains/git/credentials.ts` | Git credential discovery from `~/.git-credentials` |
| `src/domains/git/identity-storage.ts` | Profile CRUD in `~/.config/openchamber/git-identities.json` |
| `src/domains/git/service.ts` | All git operations (status, diff, push, pull, worktrees, branches, etc.) |
| `src/domains/git/index.ts` | Barrel re-export (modify existing) |
| `lib/core/bounded-cache.js` | DELETE shim — no more JS consumers |

---

### Task 1: Create shared types

**Files:**
- Create: `packages/web/server/src/domains/git/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
export interface GitCredentialEntry {
  host: string;
  username: string;
}

export interface GitCredential {
  username: string;
  token: string;
}

export interface GitProfile {
  id: string;
  name: string;
  userName: string;
  userEmail: string;
  authType?: string;
  sshKey?: string | null;
  host?: string | null;
  color?: string;
  icon?: string;
}

export interface GitProfilesData {
  profiles: GitProfile[];
}

export interface GitIdentity {
  userName: string | null;
  userEmail: string | null;
  sshCommand: string | null;
}

export interface GitStatusOptions {
  mode?: "light";
}

export interface GitStatusResult {
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  files: Array<{ path: string; index: string; working_dir: string }>;
  isClean: boolean;
  diffStats?: Record<string, { insertions: number; deletions: number }>;
  mergeInProgress: { head: string; message: string } | null;
  rebaseInProgress: { headName: string; onto: string } | null;
}

export interface GitDiffOptions {
  path?: string;
  staged?: boolean;
  contextLines?: number;
}

export interface GitRangeDiffOptions {
  base: string;
  head: string;
  path?: string;
  contextLines?: number;
}

export interface GitFileDiffResult {
  original: string;
  modified: string;
  path: string;
  isBinary: boolean;
}

export interface GitPullOptions {
  remote?: string;
  branch?: string;
  options?: Record<string, unknown>;
}

export interface GitPushOptions {
  remote?: string;
  branch?: string;
  options?: string[] | Record<string, unknown>;
}

export interface GitFetchOptions {
  remote?: string;
  branch?: string;
  options?: Record<string, unknown>;
}

export interface GitCommitOptions {
  addAll?: boolean;
  files?: string[];
}

export interface GitBranchResult {
  all: string[];
  current: string;
  branches: Record<string, { current: boolean; name: string; commit: string; label: string }>;
}

export interface GitCreateBranchOptions {
  startPoint?: string;
}

export interface GitDeleteBranchOptions {
  force?: boolean;
}

export interface GitWorktreeEntry {
  head: string;
  name: string;
  branch: string;
  path: string;
}

export interface GitWorktreeBootstrapState {
  status: "pending" | "ready" | "failed";
  error: string | null;
  updatedAt: number;
}

export interface GitWorktreeCreateInput {
  mode?: "new" | "existing";
  worktreeName?: string;
  name?: string;
  branchName?: string;
  startRef?: string;
  existingBranch?: string;
  setUpstream?: boolean;
  upstreamRemote?: string;
  upstreamBranch?: string;
  ensureRemoteName?: string;
  ensureRemoteUrl?: string;
  startCommand?: string;
}

export interface GitWorktreeCreateResult {
  head: string;
  name: string;
  branch: string;
  path: string;
}

export interface GitWorktreeRemoveInput {
  directory: string;
  deleteLocalBranch?: boolean;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  refs: string;
  body: string;
  author_name: string;
  author_email: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitLogResult {
  all: GitLogEntry[];
  latest: GitLogEntry | null;
  total: number;
}

export interface GitLogOptions {
  maxCount?: number;
  from?: string;
  to?: string;
  file?: string;
}

export interface GitRemoteEntry {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitRemoveRemoteOptions {
  remote: string;
}

export interface GitRebaseOptions {
  onto: string;
}

export interface GitMergeOptions {
  branch: string;
}

export interface GitConflictDetails {
  statusPorcelain: string;
  unmergedFiles: string[];
  diff: string;
  headInfo: string;
  operation: string;
}

export interface GitStashOptions {
  includeUntracked?: boolean;
  message?: string;
}

export interface GitWorktreeValidateResult {
  ok: boolean;
  errors: Array<{ code: string; message: string }>;
  resolved: {
    mode: string;
    localBranch: string | null;
  };
}

export interface GitWorktreePreviewResult {
  name: string;
  branch: string;
  path: string;
}

export interface GitWorktreeValidateDirResult {
  valid: boolean;
  insideWorktreeRoot: boolean;
  resolvedWorktreeRoot: string | null;
  resolvedCwd: string | null;
}

export interface GitCanonicalizeStateResult {
  worktreeRoot: string | null;
  cwd: string | null;
  branch: string | null;
  headState: "branch" | "detached" | "unborn";
  worktreeStatus: string;
  legacy: boolean;
  degraded: boolean;
  attentionReason: "merge" | "rebase" | "cherry-pick" | "revert" | "bisect" | null;
}

export interface GitCommitFilesResult {
  files: Array<{
    path: string;
    insertions: number;
    deletions: number;
    isBinary: boolean;
    changeType: string;
  }>;
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

---

### Task 2: Port credentials.ts

**Files:**
- Create: `packages/web/server/src/domains/git/credentials.ts`

- [ ] **Step 1: Write credentials.ts**

```typescript
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { GitCredentialEntry, GitCredential } from "./types.js";

const GIT_CREDENTIALS_PATH = path.join(os.homedir(), ".git-credentials");

export function discoverGitCredentials(): GitCredentialEntry[] {
  const credentials: GitCredentialEntry[] = [];

  if (!fs.existsSync(GIT_CREDENTIALS_PATH)) {
    return credentials;
  }

  try {
    const content = fs.readFileSync(GIT_CREDENTIALS_PATH, "utf8");
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const url = new URL(line.trim());
        const hostname = url.hostname;
        const pathname = url.pathname && url.pathname !== "/" ? url.pathname : "";
        const host = hostname + pathname;
        const username = url.username || "";

        if (host && username) {
          const exists = credentials.some((c) => c.host === host && c.username === username);
          if (!exists) {
            credentials.push({ host, username });
          }
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.error("Failed to read .git-credentials:", error);
  }

  return credentials;
}

export function getCredentialForHost(host: string): GitCredential | null {
  if (!fs.existsSync(GIT_CREDENTIALS_PATH)) {
    return null;
  }

  try {
    const content = fs.readFileSync(GIT_CREDENTIALS_PATH, "utf8");
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const url = new URL(line.trim());
        const hostname = url.hostname;
        const pathname = url.pathname && url.pathname !== "/" ? url.pathname : "";
        const credHost = hostname + pathname;

        if (credHost === host) {
          return {
            username: url.username || "",
            token: url.password || "",
          };
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.error("Failed to read .git-credentials for host lookup:", error);
  }

  return null;
}
```

---

### Task 3: Port identity-storage.ts

**Files:**
- Create: `packages/web/server/src/domains/git/identity-storage.ts`

- [ ] **Step 1: Write identity-storage.ts**

```typescript
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { GitProfile, GitProfilesData } from "./types.js";

const STORAGE_DIR = path.join(os.homedir(), ".config", "openchamber");
const STORAGE_FILE = path.join(STORAGE_DIR, "git-identities.json");

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export function loadProfiles(): GitProfilesData {
  ensureStorageDir();

  if (!fs.existsSync(STORAGE_FILE)) {
    return { profiles: [] };
  }

  try {
    const content = fs.readFileSync(STORAGE_FILE, "utf8");
    const data = JSON.parse(content) as GitProfilesData;
    return data;
  } catch (error) {
    console.error("Failed to load git identity profiles:", error);
    return { profiles: [] };
  }
}

export function saveProfiles(data: GitProfilesData): boolean {
  ensureStorageDir();

  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Failed to save git identity profiles:", error);
    throw error;
  }
}

export function getProfiles(): GitProfile[] {
  const data = loadProfiles();
  return data.profiles || [];
}

export function getProfile(id: string): GitProfile | null {
  const profiles = getProfiles();
  return profiles.find((p) => p.id === id) || null;
}

export function createProfile(profileData: Partial<GitProfile> & { id: string; userName: string; userEmail: string }): GitProfile {
  const profiles = getProfiles();

  if (profiles.some((p) => p.id === profileData.id)) {
    throw new Error(`Profile with ID "${profileData.id}" already exists`);
  }

  if (!profileData.id || !profileData.userName || !profileData.userEmail) {
    throw new Error("Profile must have id, userName, and userEmail");
  }

  const newProfile: GitProfile = {
    id: profileData.id,
    name: profileData.name || profileData.userName,
    userName: profileData.userName,
    userEmail: profileData.userEmail,
    authType: profileData.authType || "ssh",
    sshKey: profileData.sshKey || null,
    host: profileData.host || null,
    color: profileData.color || "keyword",
    icon: profileData.icon || "branch",
  };

  profiles.push(newProfile);
  saveProfiles({ profiles });

  return newProfile;
}

export function updateProfile(id: string, updates: Partial<GitProfile>): GitProfile {
  const profiles = getProfiles();
  const index = profiles.findIndex((p) => p.id === id);

  if (index === -1) {
    throw new Error(`Profile with ID "${id}" not found`);
  }

  profiles[index] = {
    ...profiles[index],
    ...updates,
    id: profiles[index].id,
  };

  saveProfiles({ profiles });
  return profiles[index];
}

export function deleteProfile(id: string): boolean {
  const profiles = getProfiles();
  const filteredProfiles = profiles.filter((p) => p.id !== id);

  if (filteredProfiles.length === profiles.length) {
    throw new Error(`Profile with ID "${id}" not found`);
  }

  saveProfiles({ profiles: filteredProfiles });
  return true;
}
```

---

### Task 4: Port service.ts (Part A — Internal Helpers + Core Operations)

**Files:**
- Create: `packages/web/server/src/domains/git/service.ts` (lines 1-1760: helpers + status, diff, revert, pull, push, file-diff)

This task ports the internal helper functions and the core exported functions up through `revertFile`, `collectDiffs`, `pull`, `push`, and `getFileDiff`.

**Key changes from JS → TS:**
- `import { createBoundedMap } from "../core/bounded-cache.js"` replaces `require("../core/bounded-cache.js")`
- `node:` prefix for built-ins
- `import type` for type-only imports
- Add return type annotations
- `.js` extension on relative imports

Write the full file content for `service.ts` containing the exact JS logic from `lib/git/service.js` lines 1-1760, converted to TypeScript with proper type annotations, `node:` prefixes, and the bounded-cache import fix.

---

### Task 5: Port service.ts (Part B — Branch, Worktree, Remotes, Rebase, Merge, Stash, Log Operations)

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` (append lines 1761-3359 equivalent)

Port the remaining exported functions: `getBranches`, `createBranch`, `checkoutBranch`, `getWorktrees`, `validateWorktreeCreate`, `previewWorktreeCreate`, `createWorktree`, `getWorktreeBootstrapStatus`, `removeWorktree`, `deleteBranch`, `getLog`, `isLinkedWorktree`, `validateWorktreeDirectory`, `canonicalizeWorktreeState`, `getCommitFiles`, `renameBranch`, `getRemotes`, `removeRemote`, `rebase`, `abortRebase`, `merge`, `abortMerge`, `continueRebase`, `continueMerge`, `getConflictDetails`, `stash`, `stashPop`, `deleteRemoteBranch`, `fetch`, `commit`.

All following the same TS conversion rules: `node:` prefix, type imports, return type annotations, `.js` extensions.

---

### Task 6: Update barrel index.ts

**Files:**
- Modify: `packages/web/server/src/domains/git/index.ts`

- [ ] **Step 1: Replace index.ts content**

```typescript
export { registerGitRoutes } from "./routes.js";
export type { GitRoutesDeps } from "./routes.js";

export { discoverGitCredentials, getCredentialForHost } from "./credentials.js";
export {
  loadProfiles,
  saveProfiles,
  getProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
} from "./identity-storage.js";
export {
  isGitRepository,
  getGlobalIdentity,
  getRemoteUrl,
  getCurrentIdentity,
  hasLocalIdentity,
  setLocalIdentity,
  getStatus,
  getDiff,
  getRangeDiff,
  getRangeFiles,
  getFileDiff,
  revertFile,
  collectDiffs,
  pull,
  push,
  deleteRemoteBranch,
  fetch,
  commit,
  getBranches,
  createBranch,
  checkoutBranch,
  getWorktrees,
  validateWorktreeCreate,
  previewWorktreeCreate,
  createWorktree,
  getWorktreeBootstrapStatus,
  removeWorktree,
  deleteBranch,
  getLog,
  isLinkedWorktree,
  validateWorktreeDirectory,
  canonicalizeWorktreeState,
  getCommitFiles,
  renameBranch,
  getRemotes,
  removeRemote,
  rebase,
  abortRebase,
  merge,
  abortMerge,
  continueRebase,
  continueMerge,
  getConflictDetails,
  stash,
  stashPop,
} from "./service.js";

export type {
  GitCredentialEntry,
  GitCredential,
  GitProfile,
  GitProfilesData,
  GitIdentity,
  GitStatusOptions,
  GitStatusResult,
  GitDiffOptions,
  GitRangeDiffOptions,
  GitFileDiffResult,
  GitPullOptions,
  GitPushOptions,
  GitFetchOptions,
  GitCommitOptions,
  GitBranchResult,
  GitCreateBranchOptions,
  GitDeleteBranchOptions,
  GitWorktreeEntry,
  GitWorktreeBootstrapState,
  GitWorktreeCreateInput,
  GitWorktreeCreateResult,
  GitWorktreeRemoveInput,
  GitLogEntry,
  GitLogResult,
  GitLogOptions,
  GitRemoteEntry,
  GitRemoveRemoteOptions,
  GitRebaseOptions,
  GitMergeOptions,
  GitConflictDetails,
  GitStashOptions,
  GitWorktreeValidateResult,
  GitWorktreePreviewResult,
  GitWorktreeValidateDirResult,
  GitCanonicalizeStateResult,
  GitCommitFilesResult,
} from "./types.js";
```

---

### Task 7: Verify and Cleanup

**Files:**
- Delete: `packages/web/server/lib/git/credentials.js`
- Delete: `packages/web/server/lib/git/identity-storage.js`
- Delete: `packages/web/server/lib/git/service.js`
- Delete: `packages/web/server/lib/git/index.js`
- Delete: `packages/web/server/lib/core/bounded-cache.js`

- [ ] **Step 1: Run type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

- [ ] **Step 2: Build server**

```bash
bun run build:web-server
```

- [ ] **Step 3: Run git domain tests**

```bash
cd packages/web && bun test server/src/domains/git/
```

- [ ] **Step 4: Run full domain tests**

```bash
cd packages/web && bun test server/src/domains/
```

- [ ] **Step 5: Delete old lib files**

Delete the 5 JS files listed above.

- [ ] **Step 6: Run type-check again to confirm no stale imports**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```

- [ ] **Step 7: Full verification**

```bash
bun run type-check && bun run build:web-server
```

---

### Task 8: Self-Review and Commit

- [ ] **Step 1: Verify bounded-cache shim is no longer imported**

```bash
grep -r "bounded-cache" packages/web/server/ --include="*.ts" --include="*.js" | grep -v node_modules | grep -v src/domains/core
```

Expected: No results (all consumers use the TS version from `src/domains/core/`).

- [ ] **Step 2: Commit all changes**

```bash
git add packages/web/server/src/domains/git/
git rm packages/web/server/lib/git/credentials.js packages/web/server/lib/git/identity-storage.js packages/web/server/lib/git/service.js packages/web/server/lib/git/index.js packages/web/server/lib/core/bounded-cache.js
git commit -m "feat: port git domain to TypeScript (Stage 9.3)"
```
