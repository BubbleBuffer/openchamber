import { RiLoader4Line } from '@remixicon/react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { FileMutationKind, FileMutationTarget } from './FileRow';

interface FileMutationDialogProps {
  kind: FileMutationKind | null;
  target: FileMutationTarget | null;
  inputValue: string;
  submitting: boolean;
  onInputChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const TITLES: Record<FileMutationKind, string> = {
  createFile: 'Create File',
  createFolder: 'Create Folder',
  rename: 'Rename',
  delete: 'Delete',
};

const describeMutation = (kind: FileMutationKind | null, target: FileMutationTarget | null) => {
  if (kind === 'createFile') return `Create a new file in ${target?.path ?? 'root'}`;
  if (kind === 'createFolder') return `Create a new folder in ${target?.path ?? 'root'}`;
  if (kind === 'rename') return `Rename ${target?.name ?? ''}`;
  if (kind === 'delete') return `Are you sure you want to delete ${target?.name ?? ''}? This action cannot be undone.`;
  return '';
};

export const FileMutationDialog = ({
  kind,
  target,
  inputValue,
  submitting,
  onInputChange,
  onClose,
  onSubmit,
}: FileMutationDialogProps) => (
  <Dialog open={kind !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{kind ? TITLES[kind] : ''}</DialogTitle>
        <DialogDescription>{describeMutation(kind, target)}</DialogDescription>
      </DialogHeader>

      {kind !== 'delete' ? (
        <div className="py-4">
          <Input
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={kind === 'rename' ? 'New name' : 'Name'}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmit();
            }}
            autoFocus
          />
        </div>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant={kind === 'delete' ? 'destructive' : 'default'}
          onClick={onSubmit}
          disabled={submitting || (kind !== 'delete' && !inputValue.trim())}
        >
          {submitting
            ? <RiLoader4Line className="animate-spin" />
            : (kind === 'delete' ? 'Delete' : 'Confirm')}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
