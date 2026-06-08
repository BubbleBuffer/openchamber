/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StaticRoutesDeps } from "./types.js";
import { registerPwaManifestRoute } from "./pwa-manifest.js";

export function createStaticRoutesRuntime(deps: StaticRoutesDeps): any {
  const {
    fs,
    path,
    process,
    __dirname,
    express,
    resolveProjectDirectory,
    openCodeRuntime,
    readSettingsFromDiskMigrated,
    normalizePwaAppName,
    normalizePwaOrientation,
  } = deps;

  const resolveDistPath = (): string => {
    const env = typeof process.env.OPENCHAMBER_DIST_DIR === 'string' ? process.env.OPENCHAMBER_DIST_DIR.trim() : '';
    if (env) {
      return path.resolve(env);
    }
    return path.join(__dirname, '..', 'dist');
  };

  const registerStaticRoutes = (app: any): void => {
    const distPath = resolveDistPath();

    if (fs.existsSync(distPath)) {
      console.log(`Serving static files from ${distPath}`);
      app.use(express.static(distPath, {
        setHeaders(res: any, filePath: string) {
          // Service workers should never be long-cached; iOS is especially sensitive.
          if (typeof filePath === 'string' && filePath.endsWith(`${path.sep}sw.js`)) {
            res.setHeader('Cache-Control', 'no-store');
          }
        },
      }));

      registerPwaManifestRoute(app, {
        process,
        resolveProjectDirectory,
        openCodeRuntime,
        readSettingsFromDiskMigrated,
        normalizePwaAppName,
        normalizePwaOrientation,
      });

      app.get(/^(?!\/api|.*\.(js|css|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map)).*$/, (_req: any, res: any) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
      return;
    }

    console.warn(`Warning: ${distPath} not found, static files will not be served`);
    app.get(/^(?!\/api|.*\.(js|css|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map)).*$/, (_req: any, res: any) => {
      res.status(404).send('Static files not found. Please build the application first.');
    });
  };

  return {
    registerStaticRoutes,
  };
}