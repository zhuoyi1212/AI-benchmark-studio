import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import ffmpeg from 'ffmpeg-static';
import ffprobe from '@ffprobe-installer/ffprobe';

const execute = promisify(execFile);
const entries = [['ffmpeg', process.env.FFMPEG_PATH || ffmpeg], ['ffprobe', process.env.FFPROBE_PATH || ffprobe.path]];
let size = 0;
for (const [name, path] of entries) {
  if (!path) throw new Error(`${name} binary is missing`);
  const info = await stat(path); size += info.size;
  const { stdout } = await execute(path, ['-version'], { timeout: 10000, maxBuffer: 20000 });
  console.info(`[media] ${name} ready`, { platform: process.platform, architecture: process.arch, bytes: info.size, version: stdout.split('\n')[0] });
}
if (size > 180 * 1024 * 1024) throw new Error('Media binaries leave insufficient room in a standard 250 MB function bundle');
