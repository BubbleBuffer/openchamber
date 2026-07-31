import React from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  filterGitmojis,
  type GitmojiEntry,
} from './gitmoji-data';

type GitmojiPickerDialogProps = {
  gitmojis: GitmojiEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (emoji: string, code: string) => void;
};

export const GitmojiPickerDialog = React.memo(function GitmojiPickerDialog({
  gitmojis,
  open,
  onOpenChange,
  onSelect,
}: GitmojiPickerDialogProps) {
  const [search, setSearch] = React.useState('');
  const visibleGitmojis = React.useMemo(
    () => filterGitmojis(gitmojis, search),
    [gitmojis, search]
  );

  const handleSelect = React.useCallback(
    (entry: GitmojiEntry) => {
      onSelect(entry.emoji, entry.code);
      setSearch('');
      onOpenChange(false);
    },
    [onOpenChange, onSelect]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Pick a gitmoji</DialogTitle>
        </DialogHeader>
        <Command className="h-[420px]">
          <CommandInput
            placeholder="Search gitmojis..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No gitmojis found.</CommandEmpty>
            <CommandGroup>
              {visibleGitmojis.map((entry) => (
                <CommandItem
                  key={entry.code}
                  onSelect={() => handleSelect(entry)}
                >
                  <span className="text-lg">{entry.emoji}</span>
                  <span className="typography-ui-label text-foreground">{entry.code}</span>
                  <span className="typography-meta text-muted-foreground">{entry.description}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
});
