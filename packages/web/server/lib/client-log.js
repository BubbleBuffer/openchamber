import { createRequire } from 'module';

export const registerClientLogRoutes = (app, dependencies) => {
  const { fs, path, openchamberDataDir } = dependencies;

  const logDir = path.join(openchamberDataDir, 'logs');
  const logFile = path.join(logDir, 'client.log');

  app.post('/api/client-log', (req, res) => {
    try {
      fs.mkdirSync(logDir, { recursive: true });

      const entry = {
        timestamp: new Date().toISOString(),
        ...req.body,
      };

      const line = JSON.stringify(entry) + '\n';

      try {
        const stats = fs.statSync(logFile);
        if (stats.size > 5 * 1024 * 1024) {
          const rotateFile = logFile.replace(/\.log$/, `.${Date.now()}.log`);
          fs.renameSync(logFile, rotateFile);
        }
      } catch {
        // File doesn't exist yet, fine
      }

      fs.appendFileSync(logFile, line);

      res.json({ ok: true });
    } catch (error) {
      console.error('Failed to write client log:', error);
      res.status(500).json({ error: 'Failed to log' });
    }
  });
};
