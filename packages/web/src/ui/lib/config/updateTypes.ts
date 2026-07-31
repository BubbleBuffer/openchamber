export type UpdateInfo = {
  available: boolean;
  version?: string;
  currentVersion: string;
  body?: string;
  date?: string;
  nextSuggestedCheckInSec?: number;
  packageManager?: string;
  updateCommand?: string;
};
