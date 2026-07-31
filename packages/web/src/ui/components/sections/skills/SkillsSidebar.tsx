import React from 'react';
import { RiBookOpenLine, RiRefreshLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import { useSkillsStore, type DiscoveredSkill } from '@/stores/skills/useSkillsStore';
import { cn } from '@/lib/utils';

interface SkillsSidebarProps {
  onItemSelect?: () => void;
}

function SkillList({
  label,
  skills,
  selectedSkillName,
  onSelect,
}: {
  label: string;
  skills: DiscoveredSkill[];
  selectedSkillName: string | null;
  onSelect: (name: string) => void;
}) {
  if (skills.length === 0) return null;

  return (
    <section>
      <div className="px-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="space-y-0.5">
        {skills.map((skill) => (
          <button
            key={`${skill.scope}:${skill.source}:${skill.name}`}
            type="button"
            onClick={() => onSelect(skill.name)}
            className={cn(
              'flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-left',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              selectedSkillName === skill.name
                ? 'bg-interactive-selection text-foreground'
                : 'text-foreground hover:bg-interactive-hover',
            )}
          >
            <span className="min-w-0 flex-1 truncate typography-ui-label font-normal">
              {skill.name}
            </span>
            {skill.source !== 'opencode' && (
              <span className="shrink-0 rounded border border-border bg-muted px-1 typography-micro text-muted-foreground">
                {skill.source}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

export const SkillsSidebar: React.FC<SkillsSidebarProps> = ({ onItemSelect }) => {
  const skills = useSkillsStore((state) => state.skills);
  const selectedSkillName = useSkillsStore((state) => state.selectedSkillName);
  const isLoading = useSkillsStore((state) => state.isLoading);
  const setSelectedSkill = useSkillsStore((state) => state.setSelectedSkill);
  const loadSkills = useSkillsStore((state) => state.loadSkills);

  const projectSkills = React.useMemo(
    () => skills.filter((skill) => skill.scope === 'project'),
    [skills],
  );
  const userSkills = React.useMemo(
    () => skills.filter((skill) => skill.scope === 'user'),
    [skills],
  );

  const selectSkill = React.useCallback((name: string) => {
    setSelectedSkill(name);
    onItemSelect?.();
  }, [onItemSelect, setSelectedSkill]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border px-3 pb-3 pt-4">
        <div className="mb-3 flex min-h-11 items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Installed skills</h2>
            <p className="typography-meta text-muted-foreground">{skills.length} discovered</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-11 w-11 px-0 text-muted-foreground"
            aria-label="Refresh installed skills"
            disabled={isLoading}
            onClick={() => void loadSkills({ force: true })}
          >
            <RiRefreshLine className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
        <SettingsProjectSelector />
      </div>

      <ScrollableOverlay
        outerClassName="min-h-0 flex-1"
        className="overflow-x-hidden px-3 py-2"
      >
        {skills.length === 0 && !isLoading ? (
          <div className="px-4 py-12 text-center text-muted-foreground">
            <RiBookOpenLine className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="typography-ui-label font-medium">No installed skills found</p>
            <p className="mt-1 typography-meta opacity-75">
              Skills discovered by OpenCode will appear here.
            </p>
          </div>
        ) : (
          <>
            <SkillList
              label="Project"
              skills={projectSkills}
              selectedSkillName={selectedSkillName}
              onSelect={selectSkill}
            />
            <SkillList
              label="User"
              skills={userSkills}
              selectedSkillName={selectedSkillName}
              onSelect={selectSkill}
            />
          </>
        )}
      </ScrollableOverlay>
    </div>
  );
};
