#!/usr/bin/env node
/**
 * Package boundary enforcement (Phase 01).
 *
 * Reads a `boundaries.json` next to this script and verifies that no file in
 * the repository imports across a forbidden edge. Failures exit non-zero so
 * CI blocks the change.
 *
 * Boundary rule shape:
 *   {
 *     "from": "<package name | glob>",
 *     "to": ["<forbidden dependency globs>"]
 *   }
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rulePath = join(root, 'boundaries.json');

if (!existsSync(rulePath)) {
  console.error('boundaries.json not found at', rulePath);
  process.exit(1);
}

const rules = JSON.parse(readFileSync(rulePath, 'utf8'));
const fromPattern = (p) => new RegExp(p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));

const walk = (dir, out = []) => {
  for (const entry of readdirRecursive(dir)) out.push(entry);
  return out;
};

import { readdirSync, statSync } from 'node:fs';

function readdirRecursive(dir) {
  const results = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git' || name === 'target')
      continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      results.push(...readdirRecursive(full));
    } else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      results.push(full);
    }
  }
  return results;
}

const sourceFiles = walk(root);
let failed = false;

/** Extract module specifiers from a source file (ESM import/export, dynamic import, require). */
function moduleSpecifiers(text) {
  const specs = new Set();
  const esmRe =
    /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of text.matchAll(esmRe)) specs.add(m[1] ?? m[2]);
  for (const m of text.matchAll(requireRe)) specs.add(m[1]);
  return [...specs];
}

for (const rule of rules) {
  const re = fromPattern(rule.from);
  for (const file of sourceFiles) {
    const rel = relative(root, file).split('\\').join('/');
    if (!re.test(rel)) continue;
    const text = readFileSync(file, 'utf8');
    for (const spec of moduleSpecifiers(text)) {
      for (const forbidden of rule.to) {
        const forbRe = fromPattern(forbidden);
        if (forbRe.test(spec)) {
          console.error(`BOUNDARY FAIL: ${rel} may not import "${forbidden}" (imports "${spec}")`);
          failed = true;
        }
      }
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log('boundary check passed');
