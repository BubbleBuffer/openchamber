import React from 'react';
import { useThemeEffects } from '@/hooks/useThemeEffects';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  useThemeEffects();

  return <>{children}</>;
};
