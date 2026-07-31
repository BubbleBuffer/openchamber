import React from 'react';

export const DiffTotals = React.memo<{
    insertions?: number;
    deletions?: number;
}>(({ insertions = 0, deletions = 0 }) => {
    if (!insertions && !deletions) return null;

    return (
        <span className="typography-meta flex flex-shrink-0 items-center gap-1 text-xs whitespace-nowrap">
            {insertions ? <span style={{ color: 'var(--status-success)' }}>+{insertions}</span> : null}
            {deletions ? <span style={{ color: 'var(--status-error)' }}>-{deletions}</span> : null}
        </span>
    );
});
