import React from 'react';
import { useProjectsStore } from '@/stores/projects/useProjectsStore';

const APP_TITLE = 'OpenChamber';

const formatProjectLabel = (label: string): string => {
  return label.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const getProjectNameFromPath = (path: string): string => {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
};

const buildWindowTitle = (projectLabel: string | null, instanceLabel: string | null): string => {
  const parts = [projectLabel, instanceLabel, APP_TITLE].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
  return parts.join(' | ');
};

export const useWindowTitle = () => {
  const activeProject = useProjectsStore((state) => {
    if (!state.activeProjectId) {
      return null;
    }
    return state.projects.find((project) => project.id === state.activeProjectId) ?? null;
  });

  const projectLabel = React.useMemo(() => {
    if (!activeProject) {
      return null;
    }

    const label = activeProject.label?.trim();
    if (label) {
      return formatProjectLabel(label);
    }

    const pathName = getProjectNameFromPath(activeProject.path);
    if (pathName) {
      return formatProjectLabel(pathName);
    }

    return null;
  }, [activeProject]);

  const title = React.useMemo(() => buildWindowTitle(projectLabel, null), [projectLabel]);

  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = title;
    }

  }, [title]);
};
