import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const manifestName = 'RELEASE_MANIFEST.json';

async function readManifest(releaseDir) {
  return JSON.parse(await readFile(join(releaseDir, manifestName), 'utf8'));
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

function safeReleasePath(root, relativePath) {
  const base = resolve(root);
  const path = resolve(root, relativePath);
  if (path !== base && !path.startsWith(`${base}/`))
    throw new Error(`unsafe release path: ${relativePath}`);
  return path;
}

export async function verifyReleaseDirectory(releaseDir) {
  const manifest = await readManifest(releaseDir);
  for (const file of manifest.files ?? []) {
    const path = safeReleasePath(releaseDir, file.path);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new Error(`release file missing: ${file.path}`);
    if (info.size !== file.sizeBytes || (await sha256(path)) !== file.sha256) {
      throw new Error(`release checksum mismatch: ${file.path}`);
    }
  }
  return manifest;
}

async function moveCurrentToHistory(installDir, historyDir, version) {
  const current = await stat(installDir).catch(() => null);
  if (!current) return null;
  await mkdir(historyDir, { recursive: true });
  const historyPath = join(historyDir, `${version}-${Date.now()}-${randomUUID().slice(0, 8)}`);
  await rename(installDir, historyPath);
  return historyPath;
}

export async function installRelease(releaseDir, { installDir, dataDir }) {
  const source = resolve(releaseDir);
  const target = resolve(installDir);
  const data = resolve(dataDir);
  const manifest = await verifyReleaseDirectory(source);
  await mkdir(data, { recursive: true });
  await mkdir(dirname(target), { recursive: true });
  const historyDir = join(dirname(target), '.guideforge-release-history');
  const current = await stat(target).catch(() => null);
  const currentVersion = current ? (await readManifest(target)).releaseVersion : null;
  const previousPath = currentVersion
    ? await moveCurrentToHistory(target, historyDir, currentVersion)
    : null;
  const staging = `${target}.staging-${randomUUID()}`;
  try {
    await cp(source, staging, { recursive: true, errorOnExist: true });
    await writeFile(
      join(staging, '.release-state.json'),
      `${JSON.stringify({ releaseVersion: manifest.releaseVersion, previousPath }, null, 2)}\n`,
    );
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (previousPath) await rename(previousPath, target);
    throw error;
  }
  return { releaseVersion: manifest.releaseVersion, previousPath, dataDir: data };
}

export async function rollbackRelease({ installDir, dataDir }) {
  const target = resolve(installDir);
  const data = resolve(dataDir);
  const state = JSON.parse(await readFile(join(target, '.release-state.json'), 'utf8'));
  if (!state.previousPath) throw new Error('no previous release is available for rollback');
  const currentManifest = await readManifest(target);
  const failedPath = join(
    dirname(target),
    '.guideforge-release-history',
    `${currentManifest.releaseVersion}-rollback-${Date.now()}-${randomUUID().slice(0, 8)}`,
  );
  await rename(target, failedPath);
  try {
    await rename(state.previousPath, target);
  } catch (error) {
    await rename(failedPath, target);
    throw error;
  }
  await mkdir(data, { recursive: true });
  return { releaseVersion: (await readManifest(target)).releaseVersion, dataDir: data };
}

export async function currentReleaseVersion(installDir) {
  return (await readManifest(resolve(installDir))).releaseVersion;
}
