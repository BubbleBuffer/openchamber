import { describe, expect, it } from 'vitest';
import {
  parseSkillConfigRequest,
  parseSkillNameRequest,
  parseSkillSupportingFileRequest,
  skillsError,
} from '../../../contracts/skills.js';

describe('skill route contracts', () => {
  it('rejects unsafe installed-skill names and supporting-file paths with stable codes', () => {
    expect(parseSkillNameRequest('../skill').ok).toBe(false);
    expect(parseSkillSupportingFileRequest({ name: 'safe-skill', filePath: '../secret.md' }).ok).toBe(false);
    expect(skillsError('skills_invalid_path').error.code).toBe('skills_invalid_path');
  });

  it('accepts supporting-file CRUD configuration payloads', () => {
    expect(parseSkillConfigRequest({ description: 'Updated', supportingFiles: [{ path: 'notes/setup.md', content: 'text' }] }).ok).toBe(true);
  });
});
