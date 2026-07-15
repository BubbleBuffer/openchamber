import React from 'react';
import { RiFolderLine } from '@remixicon/react';
import type { ProjectEntry } from '@/lib/api/types';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { PROJECT_ICON_MAP, getProjectIconImageUrl } from '@/lib/project/projectMeta';
import { getProjectDisplayLabel, getProjectIconColor } from './projectHelpers';

type ProjectSelectLabelProps = {
    project: ProjectEntry;
};

export const ProjectSelectLabel = React.memo(({ project }: ProjectSelectLabelProps) => {
    const { currentTheme } = useThemeSystem();
    const imageUrl = getProjectIconImageUrl(
        { id: project.id, iconImage: project.iconImage ?? null },
        {
            themeVariant: currentTheme.metadata.variant,
            iconColor: currentTheme.colors.surface.foreground,
        },
    );
    const ProjectIcon = project.icon ? PROJECT_ICON_MAP[project.icon] : null;
    const iconColor = getProjectIconColor(project.color);

    return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
            {imageUrl ? (
                <span
                    className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-hidden rounded-[3px]"
                    style={project.iconBackground ? { backgroundColor: project.iconBackground } : undefined}
                >
                    <img src={imageUrl} alt="" className="h-full w-full object-contain" draggable={false} />
                </span>
            ) : ProjectIcon ? (
                <ProjectIcon className="h-3.5 w-3.5 shrink-0" style={iconColor ? { color: iconColor } : undefined} />
            ) : (
                <RiFolderLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" style={iconColor ? { color: iconColor } : undefined} />
            )}
            <span className="truncate">{getProjectDisplayLabel(project)}</span>
        </span>
    );
});

ProjectSelectLabel.displayName = 'ProjectSelectLabel';
