#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentReleaseVersion, installRelease, rollbackRelease } from './release-lifecycle.mjs';

const root = await mkdtemp(join(tmpdir(), 'guideforge-release-drill-'));
const installDir = join(root, 'installed');
const dataDir = join(root, 'data');

async function writeRelease(version, marker) {
  const dir = join(root, `release-${version}`);
  const file = join(dir, 'pwa/index.html');
  await mkdir(join(dir, 'pwa'), { recursive: true });
  await writeFile(file, `<h1>${marker}</h1>\n`);
  const bytes = await readFile(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(
    join(dir, 'RELEASE_MANIFEST.json'),
    `${JSON.stringify(
      {
        releaseVersion: version,
        files: [{ path: 'pwa/index.html', sizeBytes: bytes.length, sha256 }],
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

try {
  const rc1 = await writeRelease('0.14.0-rc.1', 'RC1');
  const rc2 = await writeRelease('0.14.0-rc.2', 'RC2');
  await installRelease(rc1, { installDir, dataDir });
  await writeFile(join(dataDir, 'guide-state.json'), '{"title":"preserve me"}\n');
  await installRelease(rc2, { installDir, dataDir });
  if ((await currentReleaseVersion(installDir)) !== '0.14.0-rc.2') {
    throw new Error('upgrade did not activate RC2');
  }
  if ((await readFile(join(dataDir, 'guide-state.json'), 'utf8')) !== '{"title":"preserve me"}\n') {
    throw new Error('upgrade changed user data');
  }
  await rollbackRelease({ installDir, dataDir });
  if ((await currentReleaseVersion(installDir)) !== '0.14.0-rc.1') {
    throw new Error('rollback did not restore RC1');
  }
  if ((await readFile(join(dataDir, 'guide-state.json'), 'utf8')) !== '{"title":"preserve me"}\n') {
    throw new Error('rollback changed user data');
  }
  console.log('release recovery drill passed: install, upgrade, rollback, and data preservation');
} finally {
  await rm(root, { recursive: true, force: true });
}
