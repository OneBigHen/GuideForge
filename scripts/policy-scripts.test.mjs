/**
 * Policy-script tests (Phase 00 truth baseline).
 *
 * Exercises the audit and license policy scripts against synthetic data
 * without touching the network or install. Run via:
 *   node scripts/policy-scripts.test.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(script, args = []) {
  return spawnSync(process.execPath, [join(root, 'scripts', script), ...args], {
    encoding: 'utf8',
  });
}

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name} ${detail}`);
  }
}

// ---- license policy ----
const dir = mkdtempSync(join(tmpdir(), 'gf-pol-'));
const clean = {
  MIT: [{ name: 'lodash', versions: ['4.17.21'] }],
  'Apache-2.0': [{ name: 'fastify', versions: ['5.0.0'] }],
};
const gpl = {
  ...clean,
  'GPL-3.0-only': [{ name: 'evil-gpl', versions: ['1.0.0'] }],
};
const cleanPath = join(dir, 'clean.json');
const gplPath = join(dir, 'gpl.json');
writeFileSync(cleanPath, JSON.stringify(clean));
writeFileSync(gplPath, JSON.stringify(gpl));

const pass = run('check-license-policy.mjs', ['--data', cleanPath]);
check('license policy passes clean graph', pass.status === 0, pass.stdout + pass.stderr);

const fail = run('check-license-policy.mjs', ['--data', gplPath]);
check('license policy blocks GPL', fail.status === 1, fail.stdout + fail.stderr);
check('license policy names the package', fail.stderr.includes('evil-gpl'), fail.stderr);

// ---- audit policy parser (synthetic advisories via a stub pnpm on PATH) ----
// The audit script shells out to `pnpm audit --json`. Point PATH at a stub
// that returns a fixed JSON so the parser + policy logic is testable.
const stubDir = mkdtempSync(join(tmpdir(), 'gf-audit-'));
const stubAdvisories = {
  advisories: {
    1: { module_name: 'esbuild', severity: 'moderate', title: 'dev server' },
  },
  metadata: { vulnerabilities: { moderate: 1 } },
};
writeFileSync(
  join(stubDir, 'pnpm'),
  `#!/bin/sh\necho '${JSON.stringify(stubAdvisories).replace(/'/g, "'\\''")}'\nexit 1\n`,
  { mode: 0o755 },
);
const audited = {
  audit: [
    {
      id: 'SUPPLY-0001',
      package: 'esbuild',
      advisory: 'dev server',
      severity: 'moderate',
      introducedBy: 'drizzle-kit',
      rationale: 'dev-only',
      reviewDate: '2026-08-05',
      expiry: '2099-01-01',
    },
  ],
  licenses: [],
  notes: 'test',
};
writeFileSync(join(dir, 'exceptions.json'), JSON.stringify(audited));
// Temporarily point the exceptions file used by the script? The script reads a
// fixed path; instead run against the repo's real exceptions but with the stub
// audit output. The repo exception SUPPLY-0001 covers esbuild, so this should
// pass with the stub.
const env = { ...process.env, PATH: `${stubDir}:${process.env.PATH}` };
const auditPass = spawnSync(process.execPath, [join(root, 'scripts', 'check-audit-policy.mjs')], {
  encoding: 'utf8',
  env,
});
check(
  'audit policy passes reviewed moderate with stub',
  auditPass.status === 0,
  auditPass.stdout + auditPass.stderr,
);

// Unreviewed moderate must fail.
const stubUnreviewed = {
  advisories: { 2: { module_name: 'evil', severity: 'moderate', title: 'x' } },
  metadata: { vulnerabilities: { moderate: 1 } },
};
writeFileSync(
  join(stubDir, 'pnpm'),
  `#!/bin/sh\necho '${JSON.stringify(stubUnreviewed).replace(/'/g, "'\\''")}'\nexit 1\n`,
  { mode: 0o755 },
);
const auditFail = spawnSync(process.execPath, [join(root, 'scripts', 'check-audit-policy.mjs')], {
  encoding: 'utf8',
  env,
});
check(
  'audit policy blocks unreviewed moderate',
  auditFail.status === 1,
  auditFail.stdout + auditFail.stderr,
);

if (failures > 0) {
  console.error(`${failures} policy test(s) failed`);
  process.exit(1);
}
console.log('policy script tests passed');
void pathToFileURL;
