import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerGitRoutes } from './routes.js';

describe('git routes', () => {
  const tempDirectories = [];

  afterEach(async () => {
    await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('returns an empty branches payload for non-git directories', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'openchamber-git-routes-'));
    tempDirectories.push(directory);

    const app = express();
    registerGitRoutes(app);

    const response = await request(app)
      .get('/api/git/branches')
      .query({ directory });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ all: [], current: null, branches: {} });
  });
});
