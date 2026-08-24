#!/usr/bin/env node
/**
 * License policy enforcement (Phase 00).
 *
 * Uses `pnpm licenses list --json` (pnpm-native, full dependency graph) and
 * fails when any production or dev dependency carries a license that is not
 * redistributable by the supply-chain policy (GPL/AGPL by default, plus
 * anything listed as blocked in `docs/security/reviewed-exceptions.json`).
 *
 * The root workspace package itself is private and excluded.
 *
 * Usage:
 *   node scripts/check-license-policy.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const BLOCKED = ['GPL', 'AGPL', 'SSPL', 'BUSL', 'CC-BY-NC', 'CC-BY-NC-SA'];

function loadExceptions() {
  const path = join(root, 'docs/security/reviewed-exceptions.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main() {
  const exceptions = loadExceptions();
  const blockedSet = new Set([
    ...BLOCKED,
    ...(exceptions.licenses ?? [])
      .filter((l) => l.startsWith('block:'))
      .map((l) => l.slice('block:'.length)),
  ]);
  const reviewed = new Set(
    (exceptions.licenses ?? [])
      .filter((l) => l.startsWith('allow:'))
      .map((l) => l.slice('allow:'.length)),
  );

  // --data <file> injects pre-captured `pnpm licenses list --json` output so
  // the policy logic is testable without a network/install round trip.
  const dataArg = process.argv.indexOf('--data');
  let data;
  if (dataArg !== -1) {
    data = JSON.parse(readFileSync(process.argv[dataArg + 1], 'utf8'));
  } else {
    const run = spawnSync('pnpm', ['licenses', 'list', '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (run.status !== 0) {
      console.error(
        'LICENSE POLICY FAIL: could not run pnpm licenses list:',
        run.stderr?.slice(0, 500),
      );
      process.exit(1);
    }
    data = JSON.parse(run.stdout);
  }

  const failures = [];
  for (const [license, packages] of Object.entries(data)) {
    const norm = String(license).toUpperCase();
    if (reviewed.has(norm)) continue;
    if ([...blockedSet].some((b) => norm.includes(b))) {
      for (const pkg of packages) {
        failures.push(`${pkg.name} — ${license}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('LICENSE POLICY FAIL: blocked licenses found:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('license policy passed (no blocked licenses in dependency graph)');
}

main();
