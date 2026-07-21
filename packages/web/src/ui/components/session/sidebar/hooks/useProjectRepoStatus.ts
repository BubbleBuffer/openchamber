import React from 'react';
import { getRootBranch } from '@/lib/worktrees/worktreeStatus';
import { mapWithConcurrency } from '@/lib/concurrency';
import { useGitStore } from '@/stores/git/useGitStore';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { checkIsGitRepositoriesBatch } from '@/lib/git/gitApi';

type Project = { id: string; path: string; normalizedPath: string };

type Args = {
  normalizedProjects: Project[];
  gitRepoStatus: Map<string, { isGitRepo: boolean | null; branch: string | null }>;
  setProjectRepoStatus: React.Dispatch<React.SetStateAction<Map<string, boolean | null>>>;
  setProjectRootBranches: React.Dispatch<React.SetStateAction<Map<string, string>>>;
};

export const useProjectRepoStatus = (args: Args): void => {
  const {
    normalizedProjects,
    gitRepoStatus,
    setProjectRepoStatus,
    setProjectRootBranches,
  } = args;

  const { git } = useRuntimeAPIs();
  const ensureStatus = useGitStore((state) => state.ensureStatus);

  React.useEffect(() => {
    if (!git || normalizedProjects.length === 0) {
      setProjectRepoStatus(new Map());
      return;
    }

    const batchCheckAndEnsure = async () => {
      const normalizedPaths = normalizedProjects.map((p) => p.normalizedPath);
      await checkIsGitRepositoriesBatch(normalizedPaths).catch(() => {});

      normalizedProjects.forEach((project) => {
        void ensureStatus(project.normalizedPath, git);
      });
    };
    void batchCheckAndEnsure();
  }, [normalizedProjects, git, ensureStatus, setProjectRepoStatus]);

  // Read isGitRepo from the store-populated state
  React.useEffect(() => {
    const next = new Map<string, boolean | null>();
    normalizedProjects.forEach((project) => {
      next.set(project.id, gitRepoStatus.get(project.normalizedPath)?.isGitRepo ?? null);
    });
    setProjectRepoStatus(next);
  }, [normalizedProjects, gitRepoStatus, setProjectRepoStatus]);

  const projectGitBranchesKey = React.useMemo(() => {
    return normalizedProjects
      .map((project) => {
        const branch = gitRepoStatus.get(project.normalizedPath)?.branch ?? '';
        return `${project.id}:${branch}`;
      })
      .join('|');
  }, [normalizedProjects, gitRepoStatus]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const entries = await mapWithConcurrency(normalizedProjects, 2, async (project) => {
        const branch = await getRootBranch(project.normalizedPath).catch(() => null);
        return { id: project.id, branch };
      });
      if (cancelled) {
        return;
      }
      setProjectRootBranches((prev) => {
        const next = new Map(prev);
        entries.forEach(({ id, branch }) => {
          if (branch) {
            next.set(id, branch);
          }
        });
        return next;
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [normalizedProjects, projectGitBranchesKey, setProjectRootBranches]);
};
