// Type declaration for the actual implementation at lib/github/pr-status.js
// This stub allows the TypeScript compiler to find the module

declare module "./pr-status.js" {
  export interface ResolveGitHubPrStatusOptions {
    octokit: any;
    directory: string;
    branch: string;
    remoteName: string;
  }

  export interface ResolvedPrStatus {
    repo: { owner: string; repo: string } | null;
    pr: { number: number } | null;
    defaultBranch?: string | null;
    resolvedRemoteName?: string | null;
  }

  export function resolveGitHubPrStatus(options: ResolveGitHubPrStatusOptions): Promise<ResolvedPrStatus>;
}