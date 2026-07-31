import React from 'react';

export type ActiveSessionContextValue = {
  isActive: boolean;
};

export const ActiveSessionContext = React.createContext<ActiveSessionContextValue>({
  isActive: true,
});

export function useIsActiveSession(): boolean {
  return React.useContext(ActiveSessionContext).isActive;
}
