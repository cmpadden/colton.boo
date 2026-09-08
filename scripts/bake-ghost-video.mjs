#!/usr/bin/env node
// Headless Ghost bake. This uses vgpu/node rather than a browser canvas: Chrome's
// WebGPU process can lose its Dawn instance during long headless captures.

import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { once } from 'node:events';
import { parseArgs } from 'node:util';
import { init, target, geometry, draw, effect, frame } from 'vgpu/node';

const { values } = parseArgs({ args: process.argv.slice(2), options: {
  width: { type: 'string', default: '1024' }, height: { type: 'string', default: '1024' },
  fps: { type: 'string', default: '60' }, seconds: { type: 'string', default: '10' },
  out: { type: 'string' },
} });
const width = positiveInt('--width', values.width), height = positiveInt('--height', values.height);
const fps = positiveInt('--fps', values.fps), seconds = positiveFloat('--seconds', values.seconds);
const frameCount = Math.round(fps * seconds), aspect = width / height;
const outPath = values.out ?? `out/ghost/ghost-${width}x${height}-${fps}fps-${seconds}s.mp4`;
const source = readFileSync(new URL('../src/lib/ghost-renderer.ts', import.meta.url), 'utf8');
const meshShader = shader('meshShader'), compositeShader = shader('compositeShader');
const parts = readGhost(readFileSync(new URL('../public/models/ghost.glb', import.meta.url)));
const gpu = await init();
gpu.onError((error) => console.error('[ghost-bake] gpu error:', error));
const scene = target(gpu, { size: [width, height], depth: true, msaa: 4, format: 'rgba8unorm', clearColor: [0, 0, 0, 0] });
const output = target(gpu, { size: [width, height], format: 'rgba8unorm' });
const meshes = parts.sort((a, b) => Number(a.eye) - Number(b.eye)).map((part) => draw(gpu, {
  shader: meshShader, depth: part.eye ? false : undefined,
  geometry: geometry(gpu, { buffers: [
    { attributes: { position: 'float32x3' }, data: part.positions },
    { attributes: { normal: 'float32x3' }, data: part.normals },
  ], indices: part.indices }),
  set: { u: { yaw: -.4, pitch: .25, zoom: 1, aspect, time: 0, offset: [0, 0, 0], spin: 0, scale: 1, fade: 1, color: part.color } },
}));
const composite = effect(gpu, compositeShader);
mkdirSync(dirname(outPath), { recursive: true });
const encoder = createEncoder(outPath);

try {
  for (let i = 0; i < frameCount; i += 1) {
    const time = i / fps;
    // One measured turn over the clip keeps the slow rotation seamless.
    const spin = (Math.PI * 2 * i) / frameCount;
    for (const mesh of meshes) mesh.set({ yaw: -.4, pitch: .25, zoom: 1, aspect, time, offset: [0, 0, 0], spin, scale: 1, fade: 1 });
    const extent = 2 / (Math.min(aspect, 1));
    composite.set({ scene: scene.color, aspect, time, sourceA: [0, 1 / (2 * extent), time, 1], sourceB: [0, 0, 0, 0], sourceC: [0, 0, 0, 0], sourceD: [0, 0, 0, 0] });
    frame(gpu, (f) => {
      f.pass(scene, (pass) => meshes.forEach((mesh) => pass.draw(mesh)));
      f.pass(output, composite);
    });
    const pixels = await output.read();
    if (i === 0) {
      let maximum = 0;
      for (const value of pixels) maximum = Math.max(maximum, value);
      console.log(`[ghost-bake] first-frame channel maximum: ${maximum}`);
    }
    if (!encoder.stdin.write(pixels)) await once(encoder.stdin, 'drain');
    if ((i + 1) % fps === 0 || i === frameCount - 1) console.log(`[ghost-bake] frame ${i + 1}/${frameCount}`);
  }
  encoder.stdin.end();
  const [code] = await once(encoder, 'close');
  if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
  console.log(`[ghost-bake] encoded → ${outPath}`);
} finally {
  if (!encoder.killed && encoder.exitCode === null) encoder.kill('SIGTERM');
  gpu.dispose();
}

function createEncoder(outPath) {
  return spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', outPath], { stdio: ['pipe', 'inherit', 'inherit'] });
}
function shader(name) { const tick = String.fromCharCode(96), match = new RegExp(`const ${name}\\s*=\\s*${tick}([\\s\\S]*?)${tick};`).exec(source); if (!match) throw new Error(`Could not extract ${name}`); return match[1]; }
function readGhost(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('Invalid ghost GLB');
  const jsonLength = view.getUint32(12, true), glb = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))), bin = 28 + jsonLength;
  const values = (id) => { const a = glb.accessors[id], b = glb.bufferViews[a.bufferView], width = a.type === 'VEC3' ? 3 : 1, size = a.componentType === 5123 ? 2 : 4, result = new Float32Array(a.count * width); for (let i = 0; i < a.count; i += 1) for (let c = 0; c < width; c += 1) { const offset = bin + (b.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (b.byteStride ?? width * size) + c * size; result[i * width + c] = a.componentType === 5126 ? view.getFloat32(offset, true) : size === 2 ? view.getUint16(offset, true) : view.getUint32(offset, true); } return result; };
  return glb.nodes.flatMap((node) => node.mesh === undefined ? [] : glb.meshes[node.mesh].primitives.map((p) => { const positions = values(p.attributes.POSITION), normals = values(p.attributes.NORMAL), shift = node.translation ?? [0, 0, 0], scale = node.scale ?? [1, 1, 1]; for (let i = 0; i < positions.length; i += 3) { positions[i] = positions[i] * scale[0] + shift[0]; positions[i + 1] = positions[i + 1] * scale[1] + shift[1] - 1.08; positions[i + 2] = positions[i + 2] * scale[2] + shift[2]; } return { positions, normals, indices: new Uint32Array(values(p.indices)), color: (glb.materials[p.material].pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1]).slice(0, 3), eye: (node.name ?? '').startsWith('Eye inner circle') }; }));
}
function positiveInt(flag, raw) { const value = Number.parseInt(raw ?? '', 10); if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} must be a positive integer.`); return value; }
function positiveFloat(flag, raw) { const value = Number.parseFloat(raw ?? ''); if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} must be a positive number.`); return value; }
