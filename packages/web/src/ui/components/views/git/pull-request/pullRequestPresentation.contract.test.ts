import { describe, expect, it } from 'vitest';
import {
  buildPullRequestTimelineComments,
  linkifyGitHubMentionsMarkdown,
} from './pullRequestPresentation';

describe('pull request presentation', () => {
  it('orders issue and review comments by their timestamps', () => {
    const comments = buildPullRequestTimelineComments({
      issueComments: [{
        id: 2,
        body: 'later',
        createdAt: '2026-07-30T11:00:00.000Z',
        author: { login: 'later' },
      }],
      reviewComments: [{
        id: 1,
        body: 'earlier',
        createdAt: '2026-07-30T10:00:00.000Z',
        author: { login: 'earlier' },
        path: 'src/example.ts',
        line: 12,
      }],
    } as never);

    expect(comments.map((comment) => comment.id)).toEqual(['review-1', 'issue-2']);
    expect(comments[0]).toMatchObject({
      context: 'Code review comment',
      path: 'src/example.ts',
      line: 12,
    });
  });

  it('marks only the connected user mention and leaves inline code alone', () => {
    expect(linkifyGitHubMentionsMarkdown(
      'Hi @BreadCat and @someone; keep `@literal` unchanged.',
      'breadcat',
    )).toBe(
      'Hi [@BreadCat](https://github.com/breadcat?oc-self-mention=1) and '
      + '[@someone](https://github.com/someone); keep `@literal` unchanged.',
    );
  });
});
