#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyReleaseDirectory } from './release-lifecycle.mjs';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const policy = JSON.parse(await readFile(join(root, 'release/version-policy.json'), 'utf8'));
const releaseDir = join(root, 'release-artifacts', policy.releaseVersion);
const manifest = await verifyReleaseDirectory(releaseDir);

if (!manifest.files.some(({ path }) => path.startsWith('tauri/deb/'))) {
  throw new Error('release candidate is missing the locally supported Linux .deb artifact');
}

const checksumLines = (await readFile(join(releaseDir, 'SHA256SUMS'), 'utf8'))
  .trim()
  .split('\n')
  .filter(Boolean);
if (checksumLines.length !== manifest.files.length) {
  throw new Error('SHA256SUMS does not cover exactly the manifest payload');
}
const checksums = new Map(
  checksumLines.map((line) => {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) throw new Error(`invalid SHA256SUMS line: ${line}`);
    return [match[2], match[1]];
  }),
);
for (const file of manifest.files) {
  if (checksums.get(file.path) !== file.sha256) {
    throw new Error(`SHA256SUMS mismatch: ${file.path}`);
  }
}

console.log(
  `release candidate verified: ${manifest.releaseVersion}, ${manifest.files.length} payload files, Linux .deb present`,
);
