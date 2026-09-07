/**
 * A small, dependency-free ghost mesh for the vGPU experiments.
 *
 * The mesh is intentionally split into parts so a renderer can give the eyes
 * and mouth their own dark material while keeping the body translucent.
 */
export type GhostPart = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
};

function lathe(profile: readonly [number, number][], segments = 32): GhostPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y < profile.length; y += 1) {
    const [radius, height] = profile[y];
    const previous = profile[Math.max(0, y - 1)];
    const next = profile[Math.min(profile.length - 1, y + 1)];
    const slope = (next[0] - previous[0]) / Math.max(0.001, next[1] - previous[1]);

    for (let x = 0; x < segments; x += 1) {
      const angle = (x / segments) * Math.PI * 2;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      const normalLength = Math.hypot(1, slope);
      positions.push(radius * nx, height, radius * nz);
      normals.push(nx / normalLength, slope / normalLength, nz / normalLength);
    }
  }

  for (let y = 0; y < profile.length - 1; y += 1) {
    for (let x = 0; x < segments; x += 1) {
      const nextX = (x + 1) % segments;
      const a = y * segments + x;
      const b = y * segments + nextX;
      const c = (y + 1) * segments + nextX;
      const d = (y + 1) * segments + x;
      indices.push(a, d, b, b, d, c);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

/** Main rounded body, with a three-lobed emoji-style hem. */
export const ghostBody = lathe([
  [0.08, -0.9], [0.28, -0.84], [0.48, -0.7], [0.63, -0.42],
  [0.69, -0.05], [0.68, 0.34], [0.6, 0.64], [0.45, 0.84],
  [0.22, 0.96], [0, 1.0],
]);

/** Face coordinates in the ghost's local space: x, y, z, scale. */
export const ghostFace = {
  leftEye: [-0.23, 0.37, 0.59, 0.105] as const,
  rightEye: [0.23, 0.37, 0.59, 0.105] as const,
  mouth: [0, 0.02, 0.66, 0.16] as const,
};

