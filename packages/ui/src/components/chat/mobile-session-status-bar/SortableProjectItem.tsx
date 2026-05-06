import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    RiArrowDownLine,
    RiArrowUpLine,
    RiDeleteBinLine,
    RiDragMove2Line,
    RiEditLine,
} from '@remixicon/react';

import { useThemeSystem } from '@/contexts/useThemeSystem';
import type { ProjectEntry } from '@/lib/api/types';
import { PROJECT_COLOR_MAP, PROJECT_ICON_MAP, getProjectIconImageUrl } from '@/lib/projectMeta';
import { cn } from '@/lib/utils';

export interface SortableProjectItemProps {
    project: ProjectEntry;
    isFirst: boolean;
    isLast: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onEdit: () => void;
    onDelete: () => void;
    formatProjectLabel: (project: ProjectEntry) => string;
}

export function SortableProjectItem({
    project,
    isFirst,
    isLast,
    onMoveUp,
    onMoveDown,
    onEdit,
    onDelete,
    formatProjectLabel,
}: SortableProjectItemProps) {
    const { currentTheme } = useThemeSystem();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: project.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
    };

    const [imageFailed, setImageFailed] = React.useState(false);
    const ProjectIcon = project.icon ? PROJECT_ICON_MAP[project.icon] : null;
    const projectIconImageUrl = !imageFailed
        ? getProjectIconImageUrl(project, {
            themeVariant: currentTheme.metadata.variant,
            iconColor: currentTheme.colors.surface.foreground,
        })
        : null;
    const projectColorVar = project.color ? (PROJECT_COLOR_MAP[project.color] ?? null) : null;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-2 p-3 bg-[var(--surface-elevated)] rounded-lg border border-[var(--interactive-border)]",
                isDragging && "shadow-lg opacity-90"
            )}
        >
            {/* Drag handle */}
            <button
                type="button"
                className="flex-shrink-0 p-2.5 text-[var(--surface-mutedForeground)] hover:text-[var(--surface-foreground)] cursor-grab active:cursor-grabbing touch-none"
                {...attributes}
                {...listeners}
            >
                <RiDragMove2Line className="h-5 w-5" />
            </button>

            {/* Project info */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
                {projectIconImageUrl ? (
                    <span
                        className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-[2px] flex-shrink-0"
                        style={project.iconBackground ? { backgroundColor: project.iconBackground } : undefined}
                    >
                        <img
                            src={projectIconImageUrl}
                            alt=""
                            className="h-full w-full object-contain"
                            draggable={false}
                            onError={() => setImageFailed(true)}
                        />
                    </span>
                ) : ProjectIcon ? (
                    <ProjectIcon
                        className="h-5 w-5 flex-shrink-0"
                        style={projectColorVar ? { color: projectColorVar } : undefined}
                    />
                ) : (
                    <div className="h-5 w-5 rounded bg-[var(--surface-muted)] flex-shrink-0" />
                )}
                <span className="text-sm text-[var(--surface-foreground)] truncate">
                    {formatProjectLabel(project)}
                </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
                {/* Move up/down buttons (for non-drag sorting) */}
                <button
                    type="button"
                    onClick={onMoveUp}
                    disabled={isFirst}
                    className="p-2.5 rounded text-[var(--surface-mutedForeground)] hover:text-[var(--surface-foreground)] hover:bg-[var(--interactive-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <RiArrowUpLine className="h-5 w-5" />
                </button>
                <button
                    type="button"
                    onClick={onMoveDown}
                    disabled={isLast}
                    className="p-2.5 rounded text-[var(--surface-mutedForeground)] hover:text-[var(--surface-foreground)] hover:bg-[var(--interactive-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <RiArrowDownLine className="h-5 w-5" />
                </button>

                <div className="w-px h-5 bg-[var(--interactive-border)] mx-1" />

                {/* Edit button */}
                <button
                    type="button"
                    onClick={onEdit}
                    className="p-2.5 rounded text-[var(--surface-mutedForeground)] hover:text-[var(--primary-base)] hover:bg-[var(--primary-base)]/10"
                >
                    <RiEditLine className="h-5 w-5" />
                </button>

                {/* Delete button */}
                <button
                    type="button"
                    onClick={onDelete}
                    className="p-2.5 rounded text-[var(--surface-mutedForeground)] hover:text-[var(--status-error)] hover:bg-[var(--status-error)]/10"
                >
                    <RiDeleteBinLine className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}
