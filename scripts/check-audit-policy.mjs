#!/usr/bin/env node
/**
 * Supply-chain policy enforcement (Phase 00).
 *
 * Runs `pnpm audit --json` and fails when:
 *  - a high/critical advisory is found (always blocking);
 *  - a moderate/low advisory is found that is not listed in
 *    `docs/security/reviewed-exceptions.json` (blocking unless reviewed);
 *  - a listed exception has expired.
 *
 * Usage:
 *   node scripts/check-audit-policy.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadExceptions() {
  const path = join(root, 'docs/security/reviewed-exceptions.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseAuditJson(text) {
  const data = JSON.parse(text);
  // npm audit JSON v2 (pnpm): findings live under `advisories`.
  if (data.advisories && Object.keys(data.advisories).length > 0) {
    return Object.values(data.advisories).map((a) => ({
      name: a.module_name ?? a.package,
      severity: a.severity,
      via: [a.title ?? a.url ?? ''].filter(Boolean),
    }));
  }
  // npm audit JSON v1 / fallback: `vulnerabilities` map keyed by name.
  if (data.vulnerabilities) {
    return Object.entries(data.vulnerabilities).map(([name, v]) => ({
      name,
      severity: v.severity,
      via: Array.isArray(v.via)
        ? v.via.map((x) => (typeof x === 'string' ? x : (x.title ?? x.url ?? ''))).filter(Boolean)
        : [],
    }));
  }
  return [];
}

function main() {
  const exceptions = loadExceptions();
  // `pnpm audit --json` exits non-zero when vulnerabilities exist; the JSON
  // output on stdout is still valid and must be parsed regardless.
  const audit = spawnSync('pnpm', ['audit', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (audit.status === null) {
    console.error('AUDIT POLICY FAIL: could not run pnpm audit:', audit.error?.message);
    process.exit(1);
  }
  const findings = parseAuditJson(audit.stdout);
  const reviewed = new Map(exceptions.audit.map((e) => [e.package.toLowerCase(), e]));
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  let failed = false;
  const blockers = [];

  for (const f of findings) {
    if (f.severity === 'high' || f.severity === 'critical') {
      blockers.push(`${f.name} (${f.severity}) — always blocking`);
      failed = true;
      continue;
    }
    const exc = reviewed.get(f.name.toLowerCase());
    if (!exc) {
      blockers.push(`${f.name} (${f.severity}) — not in reviewed-exceptions.json`);
      failed = true;
      continue;
    }
    if (exc.expiry < today) {
      blockers.push(
        `${f.name} (${f.severity}) — reviewed exception ${exc.id} expired ${exc.expiry}`,
      );
      failed = true;
    } else {
      console.log(`OK (reviewed): ${f.name} (${f.severity}) — ${exc.id}, expiry ${exc.expiry}`);
    }
  }

  if (failed) {
    console.error('AUDIT POLICY FAIL:');
    for (const b of blockers) console.error(`  - ${b}`);
    process.exit(1);
  }
  console.log(
    `audit policy passed (${findings.length} finding(s), ${findings.length - blockers.length} reviewed)`,
  );
  void now;
}

main();
