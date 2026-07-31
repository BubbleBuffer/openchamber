import * as React from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import {
  RiArrowDownSLine,
  RiGitBranchLine,
  RiLoader4Line,
  RiRefreshLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils';
import { rankBranchesForQuery } from '@/lib/worktrees/branchSearch';

interface WorktreeBranchPickerProps {
  isMobile: boolean;
  title: string;
  value: string;
  placeholder: string;
  localBranches: string[];
  remoteBranches: string[];
  isLoading: boolean;
  onSelect: (value: string, label: string) => void;
  onFetch?: () => void;
  canFetch?: boolean;
}

function findScrollableContainer(startNode: HTMLElement | null): HTMLElement | null {
  let node = startNode;
  while (node && node !== document.body) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function WorktreeBranchPicker({
  isMobile,
  title,
  value,
  placeholder,
  localBranches,
  remoteBranches,
  isLoading,
  onSelect,
  onFetch,
  canFetch = false,
}: WorktreeBranchPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const desktopContentRef = React.useRef<HTMLDivElement | null>(null);
  const mobileListWrapperRef = React.useRef<HTMLDivElement | null>(null);
  const rankedGroups = React.useMemo(
    () => rankBranchesForQuery({ localBranches, remoteBranches, query }),
    [localBranches, remoteBranches, query],
  );
  const hasQuery = query.trim().length > 0;
  const hasMatches = rankedGroups.matching.length > 0;
  const hasBranches = localBranches.length > 0 || remoteBranches.length > 0;

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    const scrollContainer = isMobile
      ? findScrollableContainer(mobileListWrapperRef.current)
      : desktopContentRef.current?.querySelector<HTMLElement>('[data-slot="command-list"]') ?? null;
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
  }, [isMobile, open, query]);

  const selectBranch = React.useCallback((branchValue: string, label: string) => {
    onSelect(branchValue, label);
    setOpen(false);
  }, [onSelect]);

  const fetchButton = onFetch ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 px-0 shrink-0"
      onClick={onFetch}
      disabled={!canFetch || isLoading}
      title="Fetch branches"
    >
      {isLoading
        ? <RiLoader4Line className="size-4 animate-spin" />
        : <RiRefreshLine className="size-4" />}
    </Button>
  ) : null;

  const mobileList = (
    <div className="space-y-4" ref={mobileListWrapperRef}>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search branches..."
        className="h-8"
      />
      {isLoading ? (
        <div className="px-2 py-8 text-center typography-small text-muted-foreground">
          Loading branches...
        </div>
      ) : !hasBranches ? (
        <div className="px-2 py-8 text-center typography-small text-muted-foreground">
          No branches found
        </div>
      ) : (
        <div className="space-y-4">
          {hasQuery && hasMatches && (
            <MobileBranchGroup
              heading="Matching branches"
              branches={rankedGroups.matching.map((branch) => ({
                key: `${branch.source}-${branch.value}`,
                label: branch.label,
                value: branch.value,
              }))}
              selectedValue={value}
              onSelect={selectBranch}
            />
          )}
          {hasQuery && !hasMatches && (
            <div className="px-2 py-1 text-center typography-small text-muted-foreground">
              No matching branches
            </div>
          )}
          {rankedGroups.otherLocal.length > 0 && (
            <MobileBranchGroup
              heading={hasQuery ? 'Other local branches' : 'Local branches'}
              branches={rankedGroups.otherLocal.map((branch) => ({
                key: `local-${branch}`,
                label: branch,
                value: branch,
              }))}
              selectedValue={value}
              onSelect={selectBranch}
            />
          )}
          {rankedGroups.otherRemote.length > 0 && (
            <MobileBranchGroup
              heading={hasQuery ? 'Other remote branches' : 'Remote branches'}
              branches={rankedGroups.otherRemote.map((branch) => ({
                key: `remote-${branch}`,
                label: branch,
                value: `remotes/${branch}`,
              }))}
              selectedValue={value}
              onSelect={selectBranch}
            />
          )}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="flex-1 justify-between h-9"
          >
            <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
              {value || placeholder}
            </span>
            <RiGitBranchLine className="h-4 w-4 text-muted-foreground" />
          </Button>
          {fetchButton}
        </div>
        <MobileOverlayPanel open={open} title={title} onClose={() => setOpen(false)}>
          {mobileList}
        </MobileOverlayPanel>
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 min-w-[220px] max-w-full justify-between gap-2"
          >
            <span className={cn('truncate', value ? 'text-foreground' : 'text-muted-foreground')}>
              {value || placeholder}
            </span>
            <RiArrowDownSLine className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-[320px] p-0 max-h-[min(var(--available-height),24rem)] flex flex-col overflow-hidden"
          ref={desktopContentRef}
        >
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search branches..." value={query} onValueChange={setQuery} />
            <CommandList disableHorizontal>
              {isLoading ? (
                <div className="px-2 py-4 text-center typography-small text-muted-foreground">
                  Loading branches...
                </div>
              ) : !hasBranches ? (
                <CommandEmpty>No branches found</CommandEmpty>
              ) : (
                <>
                  {hasQuery && hasMatches && (
                    <DesktopBranchGroup
                      heading="Matching branches"
                      branches={rankedGroups.matching.map((branch) => ({
                        key: `${branch.source}-${branch.value}`,
                        label: branch.label,
                        value: branch.value,
                      }))}
                      onSelect={selectBranch}
                    />
                  )}
                  {hasQuery && !hasMatches && (
                    <div className="px-2 py-1 text-center typography-small text-muted-foreground">
                      No matching branches
                    </div>
                  )}
                  {rankedGroups.otherLocal.length > 0 && (
                    <>
                      {hasQuery && <CommandSeparator />}
                      <DesktopBranchGroup
                        heading={hasQuery ? 'Other local branches' : 'Local branches'}
                        branches={rankedGroups.otherLocal.map((branch) => ({
                          key: `local-${branch}`,
                          label: branch,
                          value: branch,
                        }))}
                        onSelect={selectBranch}
                      />
                    </>
                  )}
                  {rankedGroups.otherRemote.length > 0 && (
                    <>
                      {(rankedGroups.otherLocal.length > 0 || hasQuery) && <CommandSeparator />}
                      <DesktopBranchGroup
                        heading={hasQuery ? 'Other remote branches' : 'Remote branches'}
                        branches={rankedGroups.otherRemote.map((branch) => ({
                          key: `remote-${branch}`,
                          label: branch,
                          value: `remotes/${branch}`,
                        }))}
                        onSelect={selectBranch}
                      />
                    </>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </DropdownMenuContent>
      </DropdownMenu>
      {fetchButton}
    </div>
  );
}

interface BranchOption {
  key: string;
  label: string;
  value: string;
}

function MobileBranchGroup({
  heading,
  branches,
  selectedValue,
  onSelect,
}: {
  heading: string;
  branches: BranchOption[];
  selectedValue: string;
  onSelect: (value: string, label: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="typography-small font-semibold text-foreground px-2">{heading}</div>
      <div className="space-y-1">
        {branches.map((branch) => (
          <button
            key={branch.key}
            onClick={() => onSelect(branch.value, branch.label)}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-md transition-colors',
              selectedValue === branch.value
                ? 'bg-interactive-selection text-interactive-selection-foreground'
                : 'hover:bg-interactive-hover',
            )}
          >
            <span className="typography-small break-all">{branch.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DesktopBranchGroup({
  heading,
  branches,
  onSelect,
}: {
  heading: string;
  branches: BranchOption[];
  onSelect: (value: string, label: string) => void;
}) {
  return (
    <CommandGroup heading={heading}>
      {branches.map((branch) => (
        <CommandItem
          key={branch.key}
          value={branch.value}
          onSelect={() => onSelect(branch.value, branch.label)}
        >
          <span className="typography-small break-all">{branch.label}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
