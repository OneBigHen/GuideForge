#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(await readFile(join(root, 'release/version-policy.json'), 'utf8'));
const out = join(root, 'release-artifacts', policy.releaseVersion);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(root, 'apps/web/dist'), join(out, 'pwa'), { recursive: true });
await cp(join(root, 'deploy/pwa/nginx.conf'), join(out, 'nginx.conf'));
await cp(join(root, 'release/tauri-matrix.json'), join(out, 'tauri-matrix.json'));
await cp(join(root, 'release/version-policy.json'), join(out, 'version-policy.json'));
await cp(join(root, 'apps/companion/dist'), join(out, 'companion/dist'), { recursive: true });

const tauriBundle = join(root, 'apps/desktop/src-tauri/target/release/bundle');
if ((await stat(tauriBundle).catch(() => null))?.isDirectory()) {
  await cp(tauriBundle, join(out, 'tauri'), { recursive: true });
}

const companionPackage = {
  name: '@guideforge/companion',
  private: true,
  type: 'module',
  version: policy.appVersion,
  scripts: { start: 'node dist/server.js' },
  dependencies: {
    '@fastify/cookie': '11.1.2',
    '@fastify/cors': '11.3.0',
    argon2: '0.45.1',
    'better-sqlite3': '13.0.3',
    fastify: '5.11.2',
  },
};
await writeFile(
  join(out, 'companion/package.json'),
  `${JSON.stringify(companionPackage, null, 2)}\n`,
);

const licenses = spawnSync('pnpm', ['licenses', 'list', '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});
if (licenses.status !== 0) throw new Error(`license inventory failed: ${licenses.stderr}`);
await writeFile(join(out, 'licenses.json'), licenses.stdout);
await cp(join(root, 'sbom.xml'), join(out, 'sbom.xml'));

const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim();
const pnpmVersion = spawnSync('pnpm', ['--version'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const webAssets = await readdir(join(root, 'apps/web/dist/assets'));
await writeFile(
  join(out, 'build-provenance.json'),
  `${JSON.stringify(
    {
      format: 'guideforge-build-provenance',
      version: 1,
      releaseVersion: policy.releaseVersion,
      commit: git(['rev-parse', 'HEAD']),
      dirty: Boolean(git(['status', '--porcelain'])),
      node: process.version,
      pnpm: pnpmVersion,
      platform: process.platform,
      arch: process.arch,
      generatedAtIso: new Date().toISOString(),
      webAssetCount: webAssets.length,
      nativeBuild:
        'Linux .deb is the only locally supported native artifact; Windows/macOS require external signed runners.',
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  join(out, 'migration-report.json'),
  `${JSON.stringify(
    {
      format: 'guideforge-migration-report',
      version: 1,
      releaseVersion: policy.releaseVersion,
      projectSchema: { current: policy.projectSchemaVersion, supportedFrom: [1, 2, 3, 4, 5] },
      packageFormat: { current: policy.gforgePackageFormatVersion, supportedFrom: [1, 2] },
      storage: {
        current: policy.storageVersion,
        migrations: 'Dexie v1 through v11 are checked in and tested',
      },
      runtime: {
        current: policy.runtimeSessionVersion,
        migrations: 'runtime v1 to v2 is checked in and tested',
      },
      companion: {
        current: policy.companionApiVersion,
        compatibility: 'API version is separate from app and project schema versions',
      },
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  join(out, 'release-notes.md'),
  `# GuideForge ${policy.releaseVersion}\n\n- Route-split local-first web/PWA shell with readiness dashboard and job center.\n- Full .gforge backup download with local backup marker.\n- Blocking web bundle budget, CSP/cache deployment fragment, and recovery drill.\n- Signed personal .gforge verification remains offline and key-custody-safe.\n\n## Support boundary\n\nLinux x86_64 .deb is the native artifact built on the release host. Windows and macOS require external signed/notarized runners. Provider golden runs, physical devices, and production deployment are not implied by this candidate.\n`,
);

async function filesUnder(dir) {
  const entries = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) entries.push(...(await filesUnder(path)));
    else entries.push(path);
  }
  return entries;
}

const payloadFiles = (await filesUnder(out))
  .filter((path) => !path.endsWith('RELEASE_MANIFEST.json') && !path.endsWith('SHA256SUMS'))
  .sort();
const fileRecords = [];
for (const path of payloadFiles) {
  const bytes = await readFile(path);
  fileRecords.push({
    path: relative(out, path).split('\\').join('/'),
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await writeFile(
  join(out, 'SHA256SUMS'),
  `${fileRecords.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`,
);
await writeFile(
  join(out, 'RELEASE_MANIFEST.json'),
  `${JSON.stringify(
    {
      format: 'guideforge-release-candidate',
      version: 1,
      releaseVersion: policy.releaseVersion,
      files: fileRecords,
      checksumFile: 'SHA256SUMS',
      signedPersonalGforge:
        'packages/package-gforge release signing and offline verification tests',
    },
    null,
    2,
  )}\n`,
);

console.log(`release metadata built: ${out}`);
