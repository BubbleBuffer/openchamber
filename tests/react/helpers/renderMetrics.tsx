import { expect } from "vitest"
import type { ProfilerOnRenderCallback, ProfilerProps, ReactElement, ReactNode } from "react"
import { Profiler } from "react"

export type CommitRecord = {
  id: string
  phase: "mount" | "update" | "nested-update"
  actualDuration: number
  baseDuration: number
}

export type CommitCollector = {
  commits: CommitRecord[]
  onRender: ProfilerOnRenderCallback
  reset: () => void
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createCommitCollector(id: string): CommitCollector {
  const commits: CommitRecord[] = []
  const onRender: ProfilerOnRenderCallback = (profilerId, phase, actualDuration, baseDuration) => {
    commits.push({
      id: profilerId,
      phase,
      actualDuration,
      baseDuration,
    })
  }

  return {
    commits,
    onRender,
    reset: () => {
      commits.length = 0
    },
  }
}

export function updateCommits(commits: CommitRecord[]): CommitRecord[] {
  return commits.filter((commit) => commit.phase === "update" || commit.phase === "nested-update")
}

export function expectNoUpdateCommits(commits: CommitRecord[]): void {
  expect(updateCommits(commits)).toHaveLength(0)
}

export function expectUpdateCommitsAtMost(commits: CommitRecord[], max: number): void {
  const updates = updateCommits(commits)
  expect(updates.length).toBeLessThanOrEqual(max)
}

export function createProfiledElement(
  id: string,
  collector: CommitCollector,
  children: ReactNode,
): ReactElement<ProfilerProps> {
  return (
    <Profiler id={id} onRender={collector.onRender}>
      {children}
    </Profiler>
  )
}
