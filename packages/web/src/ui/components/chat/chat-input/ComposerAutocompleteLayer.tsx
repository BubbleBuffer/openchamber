import React from 'react';
import { FileMentionAutocomplete, type FileMentionHandle } from '../autocomplete/FileMentionAutocomplete';
import { CommandAutocomplete, type CommandAutocompleteHandle, type CommandInfo } from '../autocomplete/CommandAutocomplete';
import { SkillAutocomplete, type SkillAutocompleteHandle } from '../autocomplete/SkillAutocomplete';
import type { AutocompleteTab } from './autocompleteUtils';

interface AutocompleteOverlayPosition {
    left: number;
    top: number;
    maxHeight: number;
    place: 'above' | 'below';
}

interface ComposerAutocompleteLayerProps {
    showCommandAutocomplete: boolean;
    showSkillAutocomplete: boolean;
    showFileMention: boolean;
    commandRef: React.RefObject<CommandAutocompleteHandle | null>;
    skillRef: React.RefObject<SkillAutocompleteHandle | null>;
    mentionRef: React.RefObject<FileMentionHandle | null>;
    commandQuery: string;
    skillQuery: string;
    mentionQuery: string;
    isMobile: boolean;
    autocompleteTab: AutocompleteTab | null;
    isDesktopExpanded: boolean;
    autocompleteOverlayPosition: AutocompleteOverlayPosition | null;
    onCommandSelect: (command: CommandInfo) => void;
    onSkillSelect: (skillName: string) => void;
    onFileSelect: (file: { name: string; path: string; relativePath?: string }) => void;
    onAgentSelect: (agentName: string) => void;
    onAutocompleteTabSelect: (tab: AutocompleteTab) => void;
    onCloseCommandAutocomplete: () => void;
    onCloseSkillAutocomplete: () => void;
    onCloseFileMention: () => void;
}

export const ComposerAutocompleteLayer = React.memo(function ComposerAutocompleteLayer({
    showCommandAutocomplete,
    showSkillAutocomplete,
    showFileMention,
    commandRef,
    skillRef,
    mentionRef,
    commandQuery,
    skillQuery,
    mentionQuery,
    isMobile,
    autocompleteTab,
    isDesktopExpanded,
    autocompleteOverlayPosition,
    onCommandSelect,
    onSkillSelect,
    onFileSelect,
    onAgentSelect,
    onAutocompleteTabSelect,
    onCloseCommandAutocomplete,
    onCloseSkillAutocomplete,
    onCloseFileMention,
}: ComposerAutocompleteLayerProps) {
    return (
        <>
            {showCommandAutocomplete && (
                <CommandAutocomplete
                    ref={commandRef}
                    searchQuery={commandQuery}
                    onCommandSelect={onCommandSelect}
                    showTabs={isMobile}
                    activeTab={autocompleteTab ?? undefined}
                    onTabSelect={onAutocompleteTabSelect}
                    onClose={onCloseCommandAutocomplete}
                    style={isDesktopExpanded && autocompleteOverlayPosition
                        ? {
                            left: `${autocompleteOverlayPosition.left}px`,
                            top: `${autocompleteOverlayPosition.top}px`,
                            bottom: 'auto',
                            width: `min(450px, calc(100% - ${autocompleteOverlayPosition.left + 8}px))`,
                            maxHeight: `${autocompleteOverlayPosition.maxHeight}px`,
                            transform: autocompleteOverlayPosition.place === 'above' ? 'translateY(-100%)' : undefined,
                        }
                        : undefined}
                />
            )}
            { }
            {showSkillAutocomplete && (
                <SkillAutocomplete
                    ref={skillRef}
                    searchQuery={skillQuery}
                    onSkillSelect={onSkillSelect}
                    onClose={onCloseSkillAutocomplete}
                    style={isDesktopExpanded && autocompleteOverlayPosition
                        ? {
                            left: `${autocompleteOverlayPosition.left}px`,
                            top: `${autocompleteOverlayPosition.top}px`,
                            bottom: 'auto',
                            width: `min(360px, calc(100% - ${autocompleteOverlayPosition.left + 8}px))`,
                            maxHeight: `${autocompleteOverlayPosition.maxHeight}px`,
                            transform: autocompleteOverlayPosition.place === 'above' ? 'translateY(-100%)' : undefined,
                        }
                        : undefined}
                />
            )}

            {showFileMention && (

                <FileMentionAutocomplete
                    ref={mentionRef}
                    searchQuery={mentionQuery}
                    onFileSelect={onFileSelect}
                    onAgentSelect={onAgentSelect}
                    showTabs={isMobile}
                    activeTab={autocompleteTab ?? undefined}
                    onTabSelect={onAutocompleteTabSelect}
                    onClose={onCloseFileMention}
                    style={isDesktopExpanded && autocompleteOverlayPosition
                        ? {
                            left: `${autocompleteOverlayPosition.left}px`,
                            top: `${autocompleteOverlayPosition.top}px`,
                            bottom: 'auto',
                            width: `min(520px, calc(100% - ${autocompleteOverlayPosition.left + 8}px))`,
                            maxHeight: `${autocompleteOverlayPosition.maxHeight}px`,
                            transform: autocompleteOverlayPosition.place === 'above' ? 'translateY(-100%)' : undefined,
                        }
                        : undefined}
                />
            )}
        </>
    );
});
