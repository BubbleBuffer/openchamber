import React from 'react';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  connected: 'Connected',
  failed: 'Failed',
  needs_auth: 'Needs auth',
  needs_client_registration: 'Needs registration',
};

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  connected: {
    text: 'text-[var(--status-success)]',
    bg: 'bg-[var(--status-success)]/10',
  },
  failed: {
    text: 'text-[var(--status-error)]',
    bg: 'bg-[var(--status-error)]/10',
  },
  needs_auth: {
    text: 'text-[var(--status-warning)]',
    bg: 'bg-[var(--status-warning)]/10',
  },
  needs_client_registration: {
    text: 'text-[var(--status-warning)]',
    bg: 'bg-[var(--status-warning)]/10',
  },
};

export const McpStatusBadge: React.FC<{
  status: string | undefined;
  enabled: boolean;
  variant?: 'compact' | 'pill';
}> = ({ status, enabled, variant = 'compact' }) => {
  if (!enabled || !status) {
    return null;
  }

  const colors = STATUS_COLORS[status] ?? { text: 'text-muted-foreground', bg: '' };

  if (variant === 'pill') {
    return (
      <span
        className={cn(
          'typography-micro font-medium rounded-full px-2 py-0.5',
          colors.text,
          colors.bg,
        )}
      >
        ● {STATUS_LABEL[status] ?? status}
      </span>
    );
  }

  return (
    <span className={cn('typography-micro font-medium', colors.text)}>
      ● {STATUS_LABEL[status] ?? status}
    </span>
  );
};
