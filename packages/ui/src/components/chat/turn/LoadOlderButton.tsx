import React from 'react';

interface LoadOlderButtonProps {
    hasMoreAbove: boolean;
    isLoadingOlder: boolean;
    onLoadOlder: () => void;
}

export const LoadOlderButton: React.FC<LoadOlderButtonProps> = React.memo(({
    hasMoreAbove,
    isLoadingOlder,
    onLoadOlder,
}) => {
    if (!hasMoreAbove) return null;

    return (
        <div className="flex justify-center py-3">
            {isLoadingOlder ? (
                <span className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    Loading…
                </span>
            ) : (
                <button
                    type="button"
                    onClick={onLoadOlder}
                    className="text-xs uppercase tracking-wide text-muted-foreground/80 hover:text-foreground"
                >
                    Load older messages
                </button>
            )}
        </div>
    );
});

LoadOlderButton.displayName = 'LoadOlderButton';

export default LoadOlderButton;
