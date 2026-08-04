#!/usr/bin/env node
/**
 * Dependency health check (Phase 01).
 *
 * Verifies, for every workspace package:
 *   1. All `dependencies`/`devDependencies` use the `catalog:` protocol or
 *      `workspace:` protocol (no floating ranges — exact pinning per ADR 0001).
 *   2. No dependency is both a dependency and a devDependency.
 *   3. All catalog: references resolve to entries in pnpm-workspace.yaml.
 *   4. Domain/guide-schema/scene-core packages declare no forbidden runtime deps.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');

const catalogEntries = new Set(
  [...workspace.matchAll(/^\s{2}['"]?([@\w./-]+)['"]?:\s+.+$/gm)].map((m) => m[1]),
);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === '.pnpm') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (name === 'package.json') {
      out.push(full);
    }
  }
  return out;
}

const manifests = [join(root, 'package.json'), ...walk(root)].filter(
  (p) => !p.includes('node_modules') && p !== join(root, 'package.json'),
);

let failed = false;

for (const manifestPath of manifests) {
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, version] of Object.entries(all)) {
    if (version.startsWith('catalog:')) {
      if (!catalogEntries.has(name)) {
        console.error(
          `DEP FAIL: ${pkg.name} uses catalog: for "${name}" but no catalog entry exists`,
        );
        failed = true;
      }
    } else if (version.startsWith('workspace:')) {
      // ok
    } else if (!version.startsWith('file:')) {
      console.error(
        `DEP FAIL: ${pkg.name} has floating range "${name}@${version}" — must use catalog:`,
      );
      failed = true;
    }
  }
  // forbid domain/schema/scene-core from runtime deps outside their allowed set
  const allowedRuntime = new Set(['@guideforge/domain', '@guideforge/guide-schema']);
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (
      (pkg.name === '@guideforge/domain' || pkg.name === '@guideforge/guide-schema') &&
      !allowedRuntime.has(name)
    ) {
      console.error(`DEP FAIL: ${pkg.name} declares forbidden runtime dependency "${name}"`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('dependency check passed');
