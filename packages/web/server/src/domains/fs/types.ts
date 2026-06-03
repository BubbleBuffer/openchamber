export interface FsSearchDeps {
  fsPromises: typeof import("fs/promises");
  path: typeof import("path");
  spawn: typeof import("child_process").spawn;
  resolveGitBinaryForSpawn: () => string;
}

export interface FsSearchOptions {
  limit: number;
  query: string;
  includeHidden?: boolean;
  respectGitignore?: boolean;
}

export interface FsSearchResult {
  name: string;
  path: string;
  relativePath: string;
  extension: string | undefined;
  score?: number;
}

export interface FsSearchRuntime {
  searchFilesystemFiles(rootPath: string, options: FsSearchOptions): Promise<FsSearchResult[]>;
}
