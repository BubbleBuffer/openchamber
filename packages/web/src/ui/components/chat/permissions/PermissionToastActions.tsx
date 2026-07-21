import React from 'react';
import { PermissionActionButton } from './PermissionActionButton';

interface PermissionToastActionsProps {
  sessionTitle: string;
  permissionBody: string;
  disabled?: boolean;
  onOnce: () => Promise<void> | void;
  onAlways: () => Promise<void> | void;
  onDeny: () => Promise<void> | void;
}

const truncateToastText = (value: string, maxLength: number): string => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
};

export const PermissionToastActions: React.FC<PermissionToastActionsProps> = ({
  sessionTitle,
  permissionBody,
  disabled = false,
  onOnce,
  onAlways,
  onDeny,
}) => {
  const [isBusy, setIsBusy] = React.useState(false);
  const actionContext = sessionTitle.trim().length > 0 ? ` for ${sessionTitle}` : '';
  const sessionPreview = truncateToastText(sessionTitle, 64) || 'Session';
  const permissionPreview = truncateToastText(permissionBody, 120) || 'Permission details unavailable';

  const handleAction = async (action: () => Promise<void> | void) => {
    if (isBusy || disabled) return;
    setIsBusy(true);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="min-w-0">
      <div className="mb-1.5 min-w-0 space-y-0.5">
        <p className="typography-meta text-muted-foreground" title={sessionTitle}>
          Session:{' '}
          <span className="inline-block max-w-[280px] align-bottom truncate text-foreground">
            {sessionPreview}
          </span>
        </p>
        <p className="typography-meta text-muted-foreground" title={permissionBody}>
          Permission:{' '}
          <span className="inline-block max-w-[280px] align-bottom truncate">
            {permissionPreview}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <PermissionActionButton
          tone="success"
          onClick={() => handleAction(onOnce)}
          disabled={disabled || isBusy}
          aria-label={`Approve once${actionContext}`}
        >
          Once
        </PermissionActionButton>

        <PermissionActionButton
          tone="neutral"
          onClick={() => handleAction(onAlways)}
          disabled={disabled || isBusy}
          aria-label={`Approve always${actionContext}`}
        >
          Always
        </PermissionActionButton>

        <PermissionActionButton
          tone="error"
          onClick={() => handleAction(onDeny)}
          disabled={disabled || isBusy}
          aria-label={`Deny permission${actionContext}`}
        >
          Deny
        </PermissionActionButton>
      </div>
    </div>
  );
};
