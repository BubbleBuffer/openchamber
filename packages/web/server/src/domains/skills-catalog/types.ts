// Type-only interfaces for skills-catalog

export interface ParseResult {
  ok: true;
  host: string;
  owner: string;
  repo: string;
  cloneUrlSsh: string;
  cloneUrlHttps: string;
  effectiveSubpath: string | null;
  normalizedRepo: string;
}

export interface ParseError {
  ok: false;
  error: {
    kind: "invalidSource";
    message: string;
  };
}

export type ParseSkillRepoSourceResult = ParseResult | ParseError;

export interface ScanResult {
  ok: true;
  normalizedRepo: string;
  effectiveSubpath: string | null;
  items: SkillScanItem[];
}

export interface ScanError {
  ok: false;
  error: {
    kind: "authRequired" | "networkError" | "invalidSource" | "gitUnavailable";
    message: string;
    sshOnly?: boolean;
  };
}

export type ScanSkillsRepositoryResult = ScanResult | ScanError;

export interface SkillScanItem {
  repoSource: string;
  repoSubpath?: string;
  skillDir: string;
  skillName: string;
  frontmatterName?: string;
  description?: string;
  installable: boolean;
  warnings?: string[];
}

export interface InstallResult {
  ok: true;
  installed: Array<{
    skillName: string;
    scope: string;
    source: string;
  }>;
  skipped: Array<{
    skillName: string;
    reason: string;
  }>;
}

export interface InstallError {
  ok: false;
  error: {
    kind: "conflicts" | "authRequired" | "networkError" | "invalidSource" | "unknown" | "gitUnavailable";
    message?: string;
    sshOnly?: boolean;
    conflicts?: Array<{
      skillName: string;
      scope: string;
      source: string;
    }>;
  };
}

export type InstallSkillsFromRepositoryResult = InstallResult | InstallError;

export interface ClawdHubSkillInfo {
  slug: string;
  displayName?: string;
  summary?: string;
  owner?: {
    handle?: string;
  };
  stats?: {
    downloads?: number;
    stars?: number;
    versions?: number;
  };
  createdAt?: string;
  updatedAt?: string;
  tags?: {
    latest?: string;
  };
  latestVersion?: {
    version?: string;
  };
}

export interface ClawdHubScanItem {
  sourceId: "clawdhub";
  repoSource: string;
  repoSubpath: null;
  gitIdentityId: null;
  skillDir: string;
  skillName: string;
  frontmatterName?: string;
  description: string | null;
  installable: boolean;
  warnings: string[];
  clawdhub: {
    slug: string;
    version: string;
    displayName?: string;
    owner: string | null;
    downloads: number;
    stars: number;
    versionsCount: number;
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface ClawdHubScanResult {
  ok: true;
  items: ClawdHubScanItem[];
}

export interface ClawdHubScanError {
  ok: false;
  error: {
    kind: "networkError";
    message: string;
  };
}

export type ScanClawdHubResult = ClawdHubScanResult | ClawdHubScanError;

export interface ClawdHubPageResult {
  ok: true;
  items: ClawdHubScanItem[];
  nextCursor: string | null;
}

export interface ClawdHubPageError {
  ok: false;
  error: {
    kind: "networkError";
    message: string;
  };
}

export type ScanClawdHubPageResult = ClawdHubPageResult | ClawdHubPageError;

export interface ClawdHubInstallResult {
  ok: true;
  installed: Array<{
    skillName: string;
    scope: string;
    source: string;
  }>;
  skipped: Array<{
    skillName: string;
    reason: string;
  }>;
}

export interface ClawdHubInstallError {
  ok: false;
  error: {
    kind: "conflicts" | "invalidSource" | "unknown";
    message?: string;
    conflicts?: Array<{
      skillName: string;
      scope: string;
      source: string;
    }>;
  };
}

export type InstallSkillsFromClawdHubResult = ClawdHubInstallResult | ClawdHubInstallError;

export interface CloneRepoOptions {
  url: string;
  targetDir: string;
  branch?: string;
  depth?: number;
  subpath?: string | null;
  repoLock?: Promise<void>;
}

export interface CloneSuccess {
  ok: true;
  targetDir: string;
}

export interface CloneFailure {
  ok: false;
  error: string;
}

export type CloneResult = CloneSuccess | CloneFailure;
