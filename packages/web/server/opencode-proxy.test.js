import { afterEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import express from 'express';
import path from 'path';

import { registerOpenCodeProxy, writeSseChunkWithBackpressure } from './lib/opencode/network/proxy.js';

const listen = (app, host = '127.0.0.1') => new Promise((resolve, reject) => {
  const server = app.listen(0, host, () => resolve(server));
  server.once('error', reject);
});

const closeServer = (server) => new Promise((resolve, reject) => {
  if (!server) {
    resolve();
    return;
  }
  server.close((error) => {
    if (error) {
      reject(error);
      return;
    }
    resolve();
  });
});

describe('OpenCode proxy SSE forwarding', () => {
  let upstreamServer;
  let proxyServer;

  afterEach(async () => {
    await closeServer(proxyServer);
    await closeServer(upstreamServer);
    proxyServer = undefined;
    upstreamServer = undefined;
  });

  it('forwards event streams with nginx-safe headers', async () => {
    let seenAuthorization = null;

    const upstream = express();
    upstream.get('/global/event', (req, res) => {
      seenAuthorization = req.headers.authorization ?? null;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=0');
      res.setHeader('X-Upstream-Test', 'ok');
      res.write('data: {"ok":true}\n\n');
      res.end();
    });
    upstreamServer = await listen(upstream);
    const upstreamPort = upstreamServer.address().port;

    const app = express();
    registerOpenCodeProxy(app, {
      fs: {},
      os: {},
      path,
      OPEN_CODE_READY_GRACE_MS: 0,
      openCodeRuntime: {
        getPort: () => upstreamPort,
        isReady: () => true,
        getNotReadySince: () => 0,
        isRestarting: () => false,
        getUrl: (requestPath) => `http://127.0.0.1:${upstreamPort}${requestPath}`,
        getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
        getBaseUrl: () => null,
      },
    });
    proxyServer = await listen(app);
    const proxyPort = proxyServer.address().port;

    const response = await fetch(`http://127.0.0.1:${proxyPort}/api/global/event`, {
      headers: { Accept: 'text/event-stream' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    expect(response.headers.get('x-upstream-test')).toBe('ok');
    expect(await response.text()).toBe('data: {"ok":true}\n\n');
    expect(seenAuthorization).toBe('Bearer test-token');
  });

  it('waits for drain when writing to a slow SSE response', async () => {
    const writes = [];
    const res = new EventEmitter();
    res.writableEnded = false;
    res.destroyed = false;
    res.write = (value) => {
      writes.push(value);
      return false;
    };
    const controller = new AbortController();

    const write = writeSseChunkWithBackpressure(res, Buffer.from('data: {"ok":true}\n\n'), controller.signal);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes).toHaveLength(1);

    res.emit('drain');

    await expect(write).resolves.toBe(true);
  });

  it('routes generic API requests through external OpenCode base URL', async () => {
    const upstream = express();
    upstream.get('/config/providers', (_req, res) => {
      res.json({ ok: true, source: 'external-host' });
    });
    upstreamServer = await listen(upstream);
    const upstreamPort = upstreamServer.address().port;
    const externalBaseUrl = `http://127.0.0.1:${upstreamPort}`;

    const app = express();
    registerOpenCodeProxy(app, {
      fs: {},
      os: {},
      path,
      OPEN_CODE_READY_GRACE_MS: 0,
      openCodeRuntime: {
        getUrl: (requestPath) => `${externalBaseUrl}${requestPath}`,
        getAuthHeaders: () => ({}),
        getBaseUrl: () => externalBaseUrl,
        getPort: () => 3902,
        isReady: () => true,
        getNotReadySince: () => 0,
        isRestarting: () => false,
      },
    });
    proxyServer = await listen(app);
    const proxyPort = proxyServer.address().port;

    const response = await fetch(`http://127.0.0.1:${proxyPort}/api/config/providers`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, source: 'external-host' });
  });

  it('injects SSE keepalive comments every 15 seconds', async () => {
    const upstream = express();
    upstream.get('/global/event', (_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.write('data: {"type":"server.connected","properties":{}}\n\n');
      // Keep stream open so the proxy has time to inject keepalive
      const done = new Promise((r) => setTimeout(r, 20_000));
      res.on('close', () => done);
    });
    upstreamServer = await listen(upstream);
    const upstreamPort = upstreamServer.address().port;

    const app = express();
    registerOpenCodeProxy(app, {
      fs: {},
      os: {},
      path,
      OPEN_CODE_READY_GRACE_MS: 0,
      openCodeRuntime: {
        getPort: () => upstreamPort,
        isReady: () => true,
        getNotReadySince: () => 0,
        isRestarting: () => false,
        getUrl: (requestPath) => `http://127.0.0.1:${upstreamPort}${requestPath}`,
        getAuthHeaders: () => ({}),
        getBaseUrl: () => null,
      },
    });
    proxyServer = await listen(app);
    const proxyPort = proxyServer.address().port;

    const response = await fetch(`http://127.0.0.1:${proxyPort}/api/global/event`, {
      headers: { Accept: 'text/event-stream' },
    });
    expect(response.ok).toBe(true);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let keepaliveSeen = false;
    const start = Date.now();
    while (Date.now() - start < 25_000) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.includes(': keepalive')) { keepaliveSeen = true; break; }
    }
    await reader.cancel();
    expect(keepaliveSeen).toBe(true);
  }, 30_000);
});
