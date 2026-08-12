#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const policy = readJson('release/version-policy.json');
const errors = [];

function expectEqual(label, actual, expected) {
  if (actual !== expected) errors.push(`${label}: expected ${expected}, got ${actual}`);
}

for (const path of [
  'apps/web/package.json',
  'apps/desktop/package.json',
  'apps/companion/package.json',
]) {
  expectEqual(`${path} version`, readJson(path).version, policy.appVersion);
}

const tauriConfig = readJson('apps/desktop/src-tauri/tauri.conf.json');
expectEqual('Tauri app version', tauriConfig.version, policy.appVersion);
if (typeof tauriConfig.app?.security?.csp !== 'string')
  errors.push('Tauri CSP must be explicit for release builds');
const cargo = readFileSync(join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8');
expectEqual(
  'Tauri Cargo version',
  cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  policy.appVersion,
);

const schemaSource = readFileSync(join(root, 'packages/guide-schema/src/index.ts'), 'utf8');
expectEqual(
  'project schema version',
  Number(schemaSource.match(/GUIDE_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1]),
  policy.projectSchemaVersion,
);
const packageSchema = readJson('packages/package-gforge/schemas/PackageManifest.schema.json');
if (!packageSchema.properties.version.enum.includes(policy.gforgePackageFormatVersion)) {
  errors.push(
    `package format version ${policy.gforgePackageFormatVersion} is not in PackageManifest.schema.json`,
  );
}
const apiSource = readFileSync(join(root, 'apps/api/src/index.ts'), 'utf8');
expectEqual(
  'companion API version',
  apiSource.match(/openapi:\s*\{[^}]*version:\s*'([^']+)'/s)?.[1],
  policy.companionApiVersion,
);
const storageSource = readFileSync(join(root, 'packages/storage-web/src/index.ts'), 'utf8');
expectEqual(
  'storage version',
  Number([...storageSource.matchAll(/this\.version\((\d+)\)/g)].at(-1)?.[1]),
  policy.storageVersion,
);
const runtimeSource = readFileSync(
  join(root, 'packages/guide-schema/src/execution-runtime.ts'),
  'utf8',
);
expectEqual(
  'runtime session version',
  Number(runtimeSource.match(/RUNTIME_VERSION\s*=\s*(\d+)/)?.[1]),
  policy.runtimeSessionVersion,
);
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(policy.releaseVersion)) {
  errors.push(`invalid release version ${policy.releaseVersion}`);
}
const nginx = readFileSync(join(root, 'deploy/pwa/nginx.conf'), 'utf8');
for (const required of ['Content-Security-Policy', 'immutable', 'no-store', 'try_files']) {
  if (!nginx.includes(required)) errors.push(`PWA nginx policy is missing ${required}`);
}

if (errors.length) {
  console.error('RELEASE POLICY FAIL:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `release policy passed: ${policy.releaseVersion} app ${policy.appVersion}, schema ${policy.projectSchemaVersion}, package ${policy.gforgePackageFormatVersion}, companion ${policy.companionApiVersion}`,
);
