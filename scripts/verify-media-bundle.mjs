import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

// Rebuild exactly the Next trace in an isolated directory. A successful install
// in the full workspace cannot prove that a trimmed serverless bundle can load.
const root = process.cwd();
const route = join(process.env.AI_BENCHMARK_NEXT_DIST_DIR || '.next', 'server/app/api/media/runtime/route.js');
const trace = resolve(root, `${route}.nft.json`);
const files = JSON.parse(await readFile(trace, 'utf8')).files;
const directory = await mkdtemp(join(tmpdir(), 'benchmark-media-bundle-'));
try {
  for (const source of new Set([resolve(root, route), ...files.map(file => resolve(dirname(trace), file))])) {
    const path = relative(root, source);
    assert.ok(!path.startsWith('..') && !path.split('/').some(part => /^\.env(?:\.|$)/.test(part)), 'Unexpected file in media trace');
    const target = join(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  const code = `
    (async () => {
      const route = require(process.argv[1]);
      const response = await route.routeModule.userland.GET();
      const result = await response.json();
      if (response.status !== 200 || !result.ok || result.audioHz !== 16000 || result.audioChannels !== 1 || !result.decodedFrames) {
        throw new Error('Isolated media function failed: ' + JSON.stringify(result));
      }
      console.log('MEDIA_BUNDLE_RESULT ' + JSON.stringify(result));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ['-e', code, join(directory, route)], {
    cwd: directory, timeout: 35_000, maxBuffer: 100_000,
    // No production credentials, workspace resolution paths or binary overrides.
    env: { PATH: process.env.PATH, NODE_ENV: 'production', VERCEL: '1', NEXT_RUNTIME: 'nodejs', TMPDIR: tmpdir() },
  });
  const result = stdout.split('\n').find(line => line.startsWith('MEDIA_BUNDLE_RESULT '));
  assert.ok(result, 'Media bundle returned no verification result');
  console.info('[media] isolated function bundle verified', JSON.parse(result.slice('MEDIA_BUNDLE_RESULT '.length)));
} finally { await rm(directory, { recursive: true, force: true }); }

if (process.env.VERCEL) {
  for (const page of ['projects', 'products']) {
    const path = resolve(root, process.env.AI_BENCHMARK_NEXT_DIST_DIR || '.next', `server/app/${page}/page.js.nft.json`);
    const files = JSON.parse(await readFile(path, 'utf8')).files;
    assert.ok(!files.some(file => /\/(?:ffmpeg|ffprobe)$/.test(file)), `${page} catalog must not package video executables`);
    const sizes = await Promise.all(files.map(file => stat(resolve(dirname(path), file))));
    console.info('[reads] lightweight catalog bundle', { page, files: files.length, MiB: Math.round(sizes.reduce((sum, entry) => sum + entry.size, 0) / 1048576) });
  }
}
