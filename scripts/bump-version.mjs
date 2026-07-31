#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PACKAGE_PATHS = [
  'package.json',
  'packages/session-state/package.json',
  'packages/web/package.json',
];
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

function assertVersion(version) {
  if (!version || !VERSION_PATTERN.test(version)) {
    throw new Error('Usage: node scripts/bump-version.mjs <version>');
  }
}

function bumpVersion({ root = ROOT, version, runBun = (args, options) => execFileSync('bun', args, options) }) {
  assertVersion(version);

  const originals = new Map([...PACKAGE_PATHS, 'bun.lock'].map((relativePath) => {
    const filePath = path.join(root, relativePath);
    return [filePath, fs.readFileSync(filePath, 'utf8')];
  }));

  try {
    for (const packagePath of PACKAGE_PATHS) {
      const filePath = path.join(root, packagePath);
      const manifest = JSON.parse(originals.get(filePath));
      manifest.version = version;
      if (packagePath === 'packages/web/package.json') {
        manifest.dependencies['@openchamber/session-state'] = version;
      }
      fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    runBun(['install', '--lockfile-only'], { cwd: root, stdio: 'pipe' });
  } catch (error) {
    for (const [filePath, contents] of originals) {
      fs.writeFileSync(filePath, contents);
    }
    throw new Error(`Failed to regenerate bun.lock; restored manifests and lockfile: ${error.message}`, { cause: error });
  }
}

function main() {
  const version = process.argv[2];
  try {
    assertVersion(version);
  } catch {
    console.error('Usage: node scripts/bump-version.mjs <version>');
    console.error('Example: node scripts/bump-version.mjs 0.2.0');
    console.error('Example: node scripts/bump-version.mjs 0.2.0-beta.1');
    process.exit(1);
  }

  console.log(`Bumping version to ${version}\n`);
  const oldVersions = PACKAGE_PATHS.map((packagePath) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, packagePath), 'utf8'));
    return [packagePath, manifest.version];
  });

  try {
    bumpVersion({ version });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  for (const [packagePath, oldVersion] of oldVersions) {
    console.log(`  ${packagePath}: ${oldVersion} -> ${version}`);
  }
  console.log(`\nVersion bumped to ${version}`);
  console.log('\nNext steps:');
  console.log('  git add -A');
  console.log(`  git commit -m "release v${version}"`);
  console.log(`  git tag v${version}`);
  console.log('  git push origin main --tags');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { bumpVersion };
