#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const webDist = fileURLToPath(new URL('../apps/web/dist/assets/', import.meta.url));
const initialGzipBudget = 100 * 1024;
const largestChunkBudget = 1_200 * 1024;

const files = (await readdir(webDist))
  .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
  .map((name) => join(webDist, name));
const sizes = await Promise.all(
  files.map(async (path) => {
    const bytes = await readFile(path);
    return {
      name: path.slice(webDist.length),
      raw: bytes.byteLength,
      gzip: gzipSync(bytes).byteLength,
    };
  }),
);
const initial = sizes.filter(({ name }) => /^index-[^/]+\.js$/.test(name));
const largest = sizes.filter(({ name }) => name.endsWith('.js')).sort((a, b) => b.raw - a.raw)[0];
const hasLazySceneChunk = sizes.some(({ name }) => /^scene\._guideId-.*\.js$/.test(name));

if (initial.length !== 1) {
  throw new Error(`WEB BUNDLE FAIL: expected one initial index JS asset, found ${initial.length}`);
}
if (initial[0].gzip > initialGzipBudget) {
  throw new Error(
    `WEB BUNDLE FAIL: initial JS ${initial[0].gzip} bytes gzip exceeds ${initialGzipBudget}`,
  );
}
if (largest.raw > largestChunkBudget) {
  throw new Error(
    `WEB BUNDLE FAIL: largest JS ${largest.name} is ${largest.raw} bytes, exceeds ${largestChunkBudget}`,
  );
}
if (!hasLazySceneChunk) {
  throw new Error('WEB BUNDLE FAIL: expected the spatial scene route to remain lazy-loaded');
}

console.log(
  `web bundle passed: initial ${initial[0].raw} bytes raw / ${initial[0].gzip} bytes gzip; largest JS ${largest.name} ${largest.raw} bytes raw / ${largest.gzip} bytes gzip`,
);
