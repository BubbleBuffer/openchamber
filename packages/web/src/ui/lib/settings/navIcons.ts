import type React from 'react';
import {
  RiAiAgentLine,
  RiBarChart2Line,
  RiBookOpenLine,
  RiChatAi3Line,
  RiChatHistoryLine,
  RiCloudLine,
  RiCommandLine,
  RiFoldersLine,
  RiGitBranchLine,
  RiNotification3Line,
  RiPaletteLine,
  RiRobot2Line,
  RiSlashCommands2,
} from '@remixicon/react';

import { McpIcon } from '@/components/icons/McpIcon';
import type { SettingsPageSlug } from '@/lib/settings/metadata';

export function getSettingsNavIcon(
  slug: SettingsPageSlug,
): React.ComponentType<{ className?: string }> | null {
  switch (slug) {
    case 'projects':
      return RiFoldersLine;
    case 'appearance':
      return RiPaletteLine;
    case 'chat':
      return RiChatAi3Line;
    case 'notifications':
      return RiNotification3Line;
    case 'shortcuts':
      return RiCommandLine;
    case 'sessions':
      return RiChatHistoryLine;
    case 'providers':
      return RiCloudLine;
    case 'agents':
      return RiAiAgentLine;
    case 'commands':
      return RiSlashCommands2;
    case 'mcp':
      return McpIcon;
    case 'skills.installed':
      return RiBookOpenLine;
    case 'git':
      return RiGitBranchLine;
    case 'usage':
      return RiBarChart2Line;
    case 'home':
      return null;
    default:
      return RiRobot2Line;
  }
}
