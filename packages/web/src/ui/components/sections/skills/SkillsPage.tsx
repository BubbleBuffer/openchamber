import React from 'react';
import { RiBookOpenLine, RiLoader4Line } from '@remixicon/react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useSkillsStore, type SkillDetail } from '@/stores/skills/useSkillsStore';

export const SkillsPage: React.FC = () => {
  const selectedSkillName = useSkillsStore((state) => state.selectedSkillName);
  const selectedSkill = useSkillsStore((state) =>
    state.skills.find((skill) => skill.name === selectedSkillName),
  );
  const getSkillDetail = useSkillsStore((state) => state.getSkillDetail);
  const [detail, setDetail] = React.useState<SkillDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setDetail(null);
    setFailed(false);

    if (!selectedSkillName) {
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);
    void getSkillDetail(selectedSkillName).then((nextDetail) => {
      if (!active) return;
      setDetail(nextDetail);
      setFailed(nextDetail === null);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [getSkillDetail, selectedSkillName]);

  if (!selectedSkillName || !selectedSkill) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
        <div>
          <RiBookOpenLine className="mx-auto mb-3 h-10 w-10 opacity-50" />
          <p className="typography-ui-label font-medium">Select an installed skill</p>
          <p className="mt-1 typography-meta">
            OpenChamber lists skills here without modifying their files.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollableOverlay outerClassName="h-full" className="h-full">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="typography-ui-header font-semibold text-foreground">
              {selectedSkill.name}
            </h1>
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 typography-micro text-muted-foreground">
              {selectedSkill.scope}
            </span>
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 typography-micro text-muted-foreground">
              {selectedSkill.source}
            </span>
          </div>
          {selectedSkill.description && (
            <p className="typography-ui text-muted-foreground">
              {selectedSkill.description}
            </p>
          )}
          <p className="break-all font-mono text-xs text-muted-foreground">
            {selectedSkill.path}
          </p>
        </header>

        <section className="overflow-hidden rounded-lg border border-border bg-[var(--surface-elevated)]">
          <div className="border-b border-border px-4 py-3">
            <h2 className="typography-ui-label font-medium text-foreground">Instructions</h2>
          </div>
          <div className="min-h-40 p-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <RiLoader4Line className="h-4 w-4 animate-spin" />
                <span className="typography-ui">Loading skill…</span>
              </div>
            ) : failed ? (
              <p className="typography-ui text-[var(--status-error)]">
                This skill could not be read safely.
              </p>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-foreground">
                {detail?.instructions || 'No instructions.'}
              </pre>
            )}
          </div>
        </section>
      </div>
    </ScrollableOverlay>
  );
};
