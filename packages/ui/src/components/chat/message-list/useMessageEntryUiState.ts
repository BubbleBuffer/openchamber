import React from 'react';
import type { TurnUiState } from './TurnBlock';

interface UseMessageEntryUiStateOptions {
  activityRenderMode: 'collapsed' | 'summary' | 'full';
}

export function useMessageEntryUiState({ activityRenderMode }: UseMessageEntryUiStateOptions) {
  const defaultActivityExpanded = activityRenderMode === 'summary';
  const [turnUiStates, setTurnUiStates] = React.useState<Map<string, TurnUiState>>(() => new Map());

  React.useEffect(() => {
    setTurnUiStates(new Map());
  }, [activityRenderMode]);

  const toggleTurnGroup = React.useCallback(
    (turnId: string) => {
      setTurnUiStates((previous) => {
        const next = new Map(previous);
        const current = next.get(turnId) ?? { isExpanded: defaultActivityExpanded };
        next.set(turnId, { isExpanded: !current.isExpanded });
        return next;
      });
    },
    [defaultActivityExpanded],
  );

  return { turnUiStates, toggleTurnGroup };
}
