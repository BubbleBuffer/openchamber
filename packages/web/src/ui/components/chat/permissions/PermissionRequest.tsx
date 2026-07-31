import React from 'react';
import { RiCheckLine, RiCloseLine, RiTimeLine } from '@remixicon/react';
import type { PermissionRequest as PermissionRequestPayload, PermissionResponse } from '@/types/permission';
import * as sessionActions from '@/sync/session-actions';
import { PermissionActionButton } from './PermissionActionButton';

interface PermissionRequestProps {
  permission: PermissionRequestPayload;
  onResponse?: (response: 'once' | 'always' | 'reject') => void;
}

export const PermissionRequest: React.FC<PermissionRequestProps> = ({
  permission,
  onResponse
}) => {
  const [isResponding, setIsResponding] = React.useState(false);
  const [hasResponded, setHasResponded] = React.useState(false);
  const respondToPermission = sessionActions.respondToPermission;;

  const handleResponse = async (response: PermissionResponse) => {
    setIsResponding(true);

    try {
      await respondToPermission(permission.sessionID, permission.id, response);
      setHasResponded(true);
      onResponse?.(response);
    } catch { /* ignored */ } finally {
      setIsResponding(false);
    }
  };

  if (hasResponded) {
    return null;
  }

  const command = typeof permission.metadata.command === 'string'
    ? permission.metadata.command
    : (permission.patterns?.[0] ?? permission.permission);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="min-w-0">
          <span className="typography-ui-label font-medium text-muted-foreground">
            Permission required:
          </span>
          <code className="ml-2 typography-meta bg-status-warning-background px-1.5 py-0.5 rounded font-mono text-status-warning-foreground">
            {command}
          </code>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
        <PermissionActionButton
          tone="success"
          variant="outline"
          onClick={() => handleResponse('once')}
          disabled={isResponding}
        >
          <RiCheckLine className="h-3 w-3" />
          Once
        </PermissionActionButton>

        <PermissionActionButton
          tone="info"
          variant="outline"
          onClick={() => handleResponse('always')}
          disabled={isResponding}
        >
          <RiTimeLine className="h-3 w-3" />
          Always
        </PermissionActionButton>

        <PermissionActionButton
          tone="error"
          variant="outline"
          onClick={() => handleResponse('reject')}
          disabled={isResponding}
        >
          <RiCloseLine className="h-3 w-3" />
          Reject
        </PermissionActionButton>

        {isResponding && (
          <div className="ml-2 flex items-center">
            <div className="animate-spin h-3 w-3 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--loading-spinner)' }} />
          </div>
        )}
      </div>
    </div>
  );
};