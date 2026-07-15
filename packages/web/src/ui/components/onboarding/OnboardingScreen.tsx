import React from 'react';
import { ChooserScreen } from './ChooserScreen';
import { LocalSetupScreen } from './LocalSetupScreen';

export type OnboardingScreenMode = 'first-launch' | 'local-setup';

type OnboardingScreenProps = {
  /** Callback when user goes back from local-setup */
  onBack?: () => void;
  /** Callback when CLI becomes available */
  onCliAvailable?: () => void;
  /** Screen mode to render */
  mode?: OnboardingScreenMode;
};

export function OnboardingScreen({
  onBack,
  onCliAvailable,
  mode = 'first-launch',
}: OnboardingScreenProps) {
  if (mode === 'local-setup') {
    return (
      <LocalSetupScreen
        onBack={() => onBack?.()}
        onCliAvailable={onCliAvailable}
      />
    );
  }

  return (
    <ChooserScreen
      onCliAvailable={onCliAvailable}
    />
  );
}
