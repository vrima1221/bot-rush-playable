// Allocation-free helpers for writing instance matrices straight into the
// InstancedMesh buffer (column-major, like THREE.Matrix4.elements).

/** translation + rotation about Y + uniform scale */
export function writeTRS(arr, i, x, y, z, rotY, s) {
  const o = i * 16;
  const c = Math.cos(rotY) * s;
  const n = Math.sin(rotY) * s;
  arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -n; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = n; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

/** translation + non-uniform scale, no rotation */
export function writeTS(arr, i, x, y, z, sx, sy, sz) {
  const o = i * 16;
  arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

/** rotation matrix (3x3 from a Matrix4 elements array `r`) + translation + uniform scale */
export function writeRotTS(arr, i, r, x, y, z, s) {
  const o = i * 16;
  arr[o] = r[0] * s; arr[o + 1] = r[1] * s; arr[o + 2] = r[2] * s; arr[o + 3] = 0;
  arr[o + 4] = r[4] * s; arr[o + 5] = r[5] * s; arr[o + 6] = r[6] * s; arr[o + 7] = 0;
  arr[o + 8] = r[8] * s; arr[o + 9] = r[9] * s; arr[o + 10] = r[10] * s; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

let seed = 1234567;
/** cheap deterministic-ish PRNG (no allocations) */
export function rand() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}
export function randRange(a, b) {
  return a + (b - a) * rand();
}

/** rotation (Matrix4 elements `r`) + translation + per-axis scale */
export function writeRotTS3(arr, i, r, x, y, z, sx, sy, sz) {
  const o = i * 16;
  arr[o] = r[0] * sx; arr[o + 1] = r[1] * sx; arr[o + 2] = r[2] * sx; arr[o + 3] = 0;
  arr[o + 4] = r[4] * sy; arr[o + 5] = r[5] * sy; arr[o + 6] = r[6] * sy; arr[o + 7] = 0;
  arr[o + 8] = r[8] * sz; arr[o + 9] = r[9] * sz; arr[o + 10] = r[10] * sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}
