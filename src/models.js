// Procedural geometry + canvas textures. Every entity type is ONE merged
// BufferGeometry with vertex colours so each crowd is a single draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export const FONT = '"Arial Black", "Avenir Next", "Helvetica Neue", Helvetica, system-ui, sans-serif';

function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  _c.set(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function build(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// ---------------------------------------------------------------- shared helpers
export { part, build };

const S = (r, w, h, phiLen = Math.PI * 2, thetaLen = Math.PI) => new THREE.SphereGeometry(r, w, h, 0, phiLen, 0, thetaLen);

/** curved, tapering horn (tube along a quadratic curve, radius shrinks to a point) */
function hornGeometry(side, len = 0.75, r = 0.13) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(side * len * 0.55, len * 0.35, 0),
    new THREE.Vector3(side * len * 0.45, len, -len * 0.15),
  );
  const tub = 7;
  const rad = 7;
  const g = new THREE.TubeGeometry(curve, tub, r, rad, false);
  const pos = g.attributes.position;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.floor(i / (rad + 1)) / tub;
    curve.getPointAt(t, c);
    v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(1 - 0.9 * t).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // round base cap
  return [g, new THREE.SphereGeometry(r, 7, 5)];
}

// ---------------------------------------------------------------- crowds (smooth, low segment counts)
// Walk-cycle data: every vertex carries `limb` = (pivotY, side, type)
//   type 0 body, 1 leg (swings about pivotY), 2 arm (swings opposite)

function limb(g, pivotY, side, type) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = pivotY; a[i * 3 + 1] = side; a[i * 3 + 2] = type; }
  g.setAttribute('limb', new THREE.BufferAttribute(a, 3));
  return g;
}
function buildLimbed(parts) {
  for (const p of parts) if (!p.attributes.limb) limb(p, 0, 0, 0);
  return build(parts);
}

/** Plump teal robot: egg body, round dome head with visor, ball-tip antenna, stubby legs + arms. Faces -z. */
export function unitGeometry() {
  const teal = '#2fe0c8';
  const dark = '#0e8f86';
  return buildLimbed([
    part(S(0.2, 7, 5), teal, 0, 0.32, 0, 0, 0, 0, 1, 1.15, 1),
    part(S(0.15, 7, 4), '#e6fffb', 0, 0.58, 0),
    part(S(0.07, 5, 2), '#160f2e', 0, 0.595, -0.115, 0, 0, 0, 1.7, 0.8, 0.6),
    part(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 3, 1, true), '#e6fffb', 0, 0.78, 0),
    part(S(0.045, 5, 3), '#ffd84a', 0, 0.87, 0),
    limb(part(new THREE.CylinderGeometry(0.055, 0.065, 0.2, 5, 1, true), dark, -0.09, 0.1, 0), 0.2, -1, 1),
    limb(part(new THREE.CylinderGeometry(0.055, 0.065, 0.2, 5, 1, true), dark, 0.09, 0.1, 0), 0.2, 1, 1),
    limb(part(new THREE.CylinderGeometry(0.04, 0.035, 0.18, 4, 1, true), teal, -0.21, 0.32, 0, 0, 0, 0.25), 0.42, -1, 2),
    limb(part(new THREE.CylinderGeometry(0.04, 0.035, 0.18, 4, 1, true), teal, 0.21, 0.32, 0, 0, 0, -0.25), 0.42, 1, 2),
  ]);
}

/** Round purple blob with short spikes, one big eye and two stubby feet. Faces +z. */
export function enemyGeometry() {
  const spike = '#d2b4ff';
  const parts = [
    part(S(0.28, 8, 6), '#7b3fd6', 0, 0.36, 0, 0, 0, 0, 1, 0.88, 1),
    part(S(0.125, 7, 4), '#ffffff', 0, 0.4, 0.2),
    part(S(0.065, 5, 3), '#ff3a5c', 0, 0.405, 0.3),
    limb(part(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 5, 1, true), '#3a1a6e', -0.12, 0.09, 0), 0.17, -1, 1),
    limb(part(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 5, 1, true), '#3a1a6e', 0.12, 0.09, 0), 0.17, 1, 1),
    limb(part(S(0.08, 5, 3), '#3a1a6e', -0.12, 0.03, 0.03, 0, 0, 0, 1, 0.6, 1.3), 0.17, -1, 1),
    limb(part(S(0.08, 5, 3), '#3a1a6e', 0.12, 0.03, 0.03, 0, 0, 0, 1, 0.6, 1.3), 0.17, 1, 1),
  ];
  const sp = [
    [0, 0.66, -0.02, 0, 0], [-0.17, 0.58, 0, 0, 0.6], [0.17, 0.58, 0, 0, -0.6],
    [-0.27, 0.38, -0.05, 0, 1.4], [0.27, 0.38, -0.05, 0, -1.4],
  ];
  for (const [x, y, z, rx, rz] of sp) parts.push(part(new THREE.ConeGeometry(0.065, 0.17, 5, 1, true), spike, x, y, z, rx, 0, rz));
  return buildLimbed(parts);
}

/** Chunky rounded cannon on a hover sled (torus skirt). Barrel points -z. */
export function launcherGeometry() {
  const white = '#f1f5f8';
  const green = '#46d65a';
  const R = Math.PI / 2;
  return build([
    part(new THREE.TorusGeometry(0.29, 0.085, 6, 16), white, 0, 0.17, 0.02, R, 0, 0, 1, 1.15, 1),
    part(new THREE.CylinderGeometry(0.27, 0.24, 0.07, 16), '#8dff7a', 0, 0.12, 0.02, 0, 0, 0, 1, 1, 1.15),
    part(S(0.25, 14, 6, Math.PI * 2, Math.PI / 2), white, 0, 0.2, 0.06, Math.PI, 0, 0, 1, 0.45, 1),
    part(S(0.24, 14, 7, Math.PI * 2, Math.PI / 2), green, 0, 0.21, 0.06),
    part(new THREE.CylinderGeometry(0.115, 0.13, 0.5, 14, 1, true), white, 0, 0.36, -0.2, R, 0, 0),
    part(new THREE.CylinderGeometry(0.17, 0.12, 0.1, 14, 1, true), white, 0, 0.36, -0.49, R, 0, 0),
    part(new THREE.TorusGeometry(0.16, 0.04, 6, 14), green, 0, 0.36, -0.54),
    part(new THREE.CircleGeometry(0.15, 12), '#1c2b22', 0, 0.36, -0.535, Math.PI, 0, 0),
  ]);
}

/**
 * Rounded orange golem split into parts for CPU animation (all share one material):
 * body (torso + head + horns, origin at ground), arms (origin at the shoulder pivot),
 * legs (origin at the hip pivot). ~3 tall at scale 1. Faces +z.
 */
export const BOSS_PIVOTS = { shoulderX: 1.0, shoulderY: 1.95, hipX: 0.45, hipY: 0.85 };
export function bossParts() {
  const orange = '#ff8a2a';
  const dark = '#b5501c';
  const horn = '#f5ead0';
  const bodyParts = [
    part(S(0.95, 16, 12), orange, 0, 1.5, 0, 0, 0, 0, 1.05, 0.92, 0.82),
    part(S(0.55, 12, 8), '#ffc58a', 0, 1.42, 0.5, 0, 0, 0, 1, 0.85, 0.35),
    part(S(0.5, 14, 10), '#ff9a3c', 0, 2.5, 0.08, 0, 0, 0, 1, 0.9, 0.95),
    part(S(0.1, 8, 6), '#fff6b0', -0.2, 2.56, 0.5, 0, 0, 0, 1.2, 0.8, 0.6),
    part(S(0.1, 8, 6), '#fff6b0', 0.2, 2.56, 0.5, 0, 0, 0, 1.2, 0.8, 0.6),
    part(new THREE.TorusGeometry(0.16, 0.04, 6, 10, Math.PI), '#3a1406', 0, 2.36, 0.47, 0, 0, Math.PI),
  ];
  for (const side of [-1, 1]) {
    const [tube, cap] = hornGeometry(side);
    bodyParts.push(part(tube, horn, side * 0.32, 2.82, 0.05));
    bodyParts.push(part(cap, horn, side * 0.32, 2.82, 0.05));
  }
  const arm = (side) => build([
    part(S(0.36, 12, 8), '#e8701e', 0, 0, 0),
    part(new THREE.CapsuleGeometry(0.22, 0.6, 4, 10), '#e8701e', side * 0.18, -0.65, 0.05, 0, 0, side * 0.18),
    part(S(0.3, 12, 8), dark, side * 0.28, -1.2, 0.1),
  ]);
  const leg = () => build([
    part(new THREE.CapsuleGeometry(0.26, 0.35, 4, 10), dark, 0, -0.4, 0),
    part(S(0.3, 10, 6), dark, 0, -0.78, 0.08, 0, 0, 0, 1, 0.5, 1.3),
  ]);
  return { body: build(bodyParts), armL: arm(-1), armR: arm(1), legL: leg(), legR: leg() };
}

/** Dark crystal pillar (block) with bevelled body. ~3.3 wide, 5 tall, 2 deep. Origin at base centre. */
export function blockGeometry() {
  const core = '#2b2352';
  const facet = '#5848b0';
  const bright = '#9d8bff';
  const parts = [
    part(new RoundedBoxGeometry(3.3, 0.35, 2.1, 2, 0.12), '#191231', 0, 0.17, 0),
    part(new RoundedBoxGeometry(3.0, 4.4, 1.8, 3, 0.3), core, 0, 2.5, 0),
    part(new RoundedBoxGeometry(3.1, 0.22, 1.9, 2, 0.1), facet, 0, 4.72, 0),
  ];
  for (const [x, z] of [[-1.45, 0.85], [1.45, 0.85], [-1.45, -0.85], [1.45, -0.85]]) {
    parts.push(part(new THREE.CylinderGeometry(0.13, 0.13, 4.4, 8, 1, true), facet, x, 2.5, z));
  }
  const shards = [
    [-0.9, 0.35, 1.5, 0.15], [0.0, 0.42, 2.0, 0], [0.85, 0.32, 1.4, -0.2],
    [-0.4, 0.26, 1.0, 0.35], [0.5, 0.25, 0.9, -0.4], [0, 0.22, 0.8, 0.2],
  ];
  shards.forEach(([x, r, h, tilt], i) => {
    parts.push(part(new THREE.ConeGeometry(r, h, 6), i % 2 ? bright : '#7d6cf0', x, 4.8 + h / 2 - 0.1, (i % 3 - 1) * 0.45, tilt * 0.5, i, tilt));
  });
  parts.push(part(S(0.42, 8, 6), bright, -1.6, 1.0, 0.3, 0.3, 0.5, 0.2, 0.7, 1.6, 0.7));
  parts.push(part(S(0.36, 8, 6), '#7d6cf0', 1.6, 1.6, -0.2, 0.2, 0.2, -0.3, 0.7, 1.5, 0.7));
  return build(parts);
}

/** Gate frame: round posts with ball caps + capsule top bar. Panel centre at y = 0.96. width 3. */
export function gateFrameGeometry(color = '#e6ffe8', accent = '#46d65a') {
  return build([
    part(new THREE.CylinderGeometry(0.1, 0.11, 1.9, 10, 1, true), color, -1.5, 0.95, 0),
    part(new THREE.CylinderGeometry(0.1, 0.11, 1.9, 10, 1, true), color, 1.5, 0.95, 0),
    part(new THREE.CapsuleGeometry(0.11, 3.0, 3, 10), accent, 0, 1.95, 0, 0, 0, Math.PI / 2),
    part(S(0.16, 10, 6), accent, -1.5, 1.95, 0),
    part(S(0.16, 10, 6), accent, 1.5, 1.95, 0),
    part(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 12), accent, -1.5, 0.05, 0),
    part(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 12), accent, 1.5, 0.05, 0),
  ]);
}

export function gatePanelGeometry() {
  const g = new THREE.PlaneGeometry(2.82, 1.78);
  g.translate(0, 0.96, 0);
  return g;
}

/** Static runway deck: bevelled slab, round edge rails, and the two lane dividers (rail + bollards). */
export function deckGeometry(len, zc, dividerX, dividerStart, dividerEnd) {
  const parts = [
    part(new RoundedBoxGeometry(12.4, 1.4, len, 2, 0.35), '#2a2150', 0, -0.72, zc),
    part(new RoundedBoxGeometry(11.0, 0.7, len, 2, 0.3), '#1c1640', 0, -1.7, zc),
  ];
  const R = Math.PI / 2;
  for (const s of [-1, 1]) {
    // outer edge rails (round)
    parts.push(part(new THREE.CylinderGeometry(0.14, 0.14, len, 10, 1, true), '#5ff5df', s * 6.12, 0.1, zc, R, 0, 0));
    // lane divider: capsule rail on rounded bollards
    const dl = dividerStart - dividerEnd;
    const dz = (dividerStart + dividerEnd) / 2;
    const x = s * dividerX;
    parts.push(part(new THREE.CapsuleGeometry(0.2, dl, 4, 12), '#d8fff8', x, 0.42, dz, R, 0, 0));
    parts.push(part(new THREE.CapsuleGeometry(0.24, dl, 3, 12), '#3fcfbd', x, 0.08, dz, R, 0, 0, 1, 1, 0.35));
    for (let z = dividerStart - 0.4; z > dividerEnd; z -= 3.2) {
      parts.push(part(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 10, 1, true), '#ffffff', x, 0.21, z));
      parts.push(part(S(0.12, 8, 4, Math.PI * 2, Math.PI / 2), '#2fe0c8', x, 0.62, z));
    }
    // glowing end cap facing the player
    parts.push(part(S(0.3, 12, 8), '#7dfff0', x, 0.42, dividerStart + 0.15));
  }
  return build(parts);
}

// ---------------------------------------------------------------- textures

/** Canvas label texture. redraw(text) only when the value changes. */
export function makeLabel(w, h, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.anisotropy = 1;
  let last = null;
  return {
    canvas,
    texture,
    set(value, extra) {
      if (value === last) return;
      last = value;
      ctx.clearRect(0, 0, w, h);
      drawFn(ctx, w, h, value, extra);
      texture.needsUpdate = true;
    },
    reset() {
      last = null;
    },
  };
}

export function drawOutlinedText(ctx, text, x, y, size, fill, stroke, lw) {
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function gateLabelDraw(fill, stroke) {
  return (ctx, w, h, text) => drawOutlinedText(ctx, text, w / 2, h / 2 + 4, h * 0.78, fill, stroke, h * 0.14);
}

export function runwayTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  // base tiles
  g.fillStyle = '#3b3566';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 6; x++) {
      const v = (x * 7 + y * 13) % 5;
      g.fillStyle = ['#433c73', '#3f3870', '#47407a', '#3d376c', '#4a4380'][v];
      g.fillRect(x * (256 / 6) + 1, y * 64 + 1, 256 / 6 - 2, 62);
    }
  }
  // lane dividers at x = +-2 of 12 => 1/3 and 2/3
  g.fillStyle = 'rgba(200, 240, 255, 0.55)';
  const l1 = Math.round(256 * (3.4 / 12));
  const l2 = 256 - l1;
  for (let y = 0; y < 256; y += 64) {
    g.fillRect(l1 - 2, y + 8, 4, 40);
    g.fillRect(l2 - 2, y + 8, 4, 40);
  }
  // edges
  g.fillStyle = '#2fe0c8';
  g.fillRect(0, 0, 6, 256);
  g.fillRect(250, 0, 6, 256);
  g.fillStyle = '#1b6e78';
  g.fillRect(6, 0, 3, 256);
  g.fillRect(247, 0, 3, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#ffb38a');
  gr.addColorStop(0.18, '#f27fa0');
  gr.addColorStop(0.5, '#9a5ab8');
  gr.addColorStop(1, '#3a2a78');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function cloudSeaTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8f5fb8';
  g.fillRect(0, 0, 256, 256);
  // deterministic pseudo random blobs, drawn wrapped so the texture tiles
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 14 + rnd() * 34;
    const a = 0.15 + rnd() * 0.25;
    for (let ox = -256; ox <= 256; ox += 256) {
      for (let oy = -256; oy <= 256; oy += 256) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(255, 214, 230, ${a})`);
        gr.addColorStop(1, 'rgba(255, 214, 230, 0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
