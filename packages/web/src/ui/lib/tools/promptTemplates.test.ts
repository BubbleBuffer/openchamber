import { describe, expect, it, vi } from 'vitest';
import { renderPromptTemplate, type PromptTemplateId } from './promptTemplates';

describe('prompt templates', () => {
  it('renders built-in templates without a network request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(renderPromptTemplate('github.pr.review.visible', { pr_number: '42' }))
      .toBe('Review this pull request #42 using the provided PR context');
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('replaces missing optional placeholders with an empty string', () => {
    expect(renderPromptTemplate('git.pr.generate.instructions', {
      base_branch: 'main',
      head_branch: 'feature',
      commits: '- abc123 Add feature',
      changed_files: '- src/feature.ts',
    })).not.toContain('{{');
  });

  it('rejects unknown template identifiers', () => {
    expect(() => renderPromptTemplate('unknown' as PromptTemplateId))
      .toThrow('Unknown prompt template id: unknown');
  });
});
