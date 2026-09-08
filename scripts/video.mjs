// Frame-sequence → video encoding for render scripts. Requires ffmpeg on PATH.

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Encodes a PNG frame sequence into an H.264 MP4. */
export function encodeMp4({ framesDir, fps, outPath, pattern = 'frame_%05d.png', crf = 18 }) {
  mkdirSync(dirname(outPath), { recursive: true });
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel', 'error',
    '-stats',
    '-framerate', String(fps),
    '-i', join(framesDir, pattern),
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', String(crf),
    '-preset', 'medium',
    '-movflags', '+faststart',
    outPath,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
}
