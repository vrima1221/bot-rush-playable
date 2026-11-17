// Launcher cluster. Moves on X only; each launcher fires its own stream.
// Launchers pack into a honeycomb that grows outward from the centre.
import * as THREE from 'three';
import { writeTS } from '../util.js';
import { WORLD } from '../levels.js';

const SPACING = 0.82;
const DEPTH_SQUASH = 0.8; // rows a bit closer than a perfect hex -> pack is wider than deep
const SCALE = 1.25;

// 37 hex cells (radius 3) sorted by distance from the centre; ties grow wider before deeper.
const HEX = (() => {
  const cells = [];
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      const s = -q - r;
      if (Math.abs(s) > 3) continue;
      const x = SPACING * (q + r / 2);
      const z = SPACING * r * 0.866 * DEPTH_SQUASH;
      cells.push({ x, z, d: Math.hypot(x, z * 1.5) });
    }
  }
  cells.sort((a, b) => a.d - b.d || Math.abs(a.z) - Math.abs(b.z) || a.x - b.x || a.z - b.z);
  const ox = new Float32Array(cells.length);
  const oz = new Float32Array(cells.length);
  cells.forEach((c, i) => { ox[i] = c.x; oz[i] = c.z; });
  return { ox, oz };
})();

export class Player {
  constructor(scene, geometry, material) {
    const max = Math.min(WORLD.maxLaunchers, HEX.ox.length);
    this.max = max;
    this.n = 1;
    this.x = 0;
    this.targetX = 0;
    this.z = WORLD.playerZ;
    this.ox = HEX.ox;
    this.oz = HEX.oz;
    this.cx = new Float32Array(max); // current (smoothed) offsets
    this.cz = new Float32Array(max);
    this.scale = new Float32Array(max);
    this.timer = new Float32Array(max);
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.halfW = 0.5;
    this.front = -0.5; // z offset of the front-most launcher edge (negative = toward the horde)
    this.back = 0.5;
    this.firing = true;
    this.shots = 0; // shots fired this frame (for audio)
    this.lostX = 0;
    this.lostZ = 0;
  }

  reset(n) {
    this.n = Math.min(n, this.max);
    this.x = this.targetX = -2;
    for (let i = 0; i < this.max; i++) {
      this.scale[i] = 1;
      this.timer[i] = (i * 0.37) % 0.2;
      this.cx[i] = this.ox[i];
      this.cz[i] = this.oz[i];
    }
    this.layout();
  }

  /** extents of the first n hex cells (used for gate pickup, clamping and the threat line) */
  layout() {
    let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
    for (let i = 0; i < this.n; i++) {
      const x = this.ox[i], z = this.oz[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const r = 0.37 * SCALE;
    this.halfW = Math.max(-minX, maxX) + r;
    this.front = minZ - r;
    this.back = maxZ + r;
  }

  get depth() {
    return this.back - this.front;
  }

  clampX(x) {
    const lim = WORLD.runwayHalf - this.halfW - 0.1;
    return x < -lim ? -lim : x > lim ? lim : x;
  }

  add(k) {
    const before = this.n;
    this.n = Math.min(this.max, this.n + k);
    for (let i = before; i < this.n; i++) {
      this.scale[i] = 0;
      this.timer[i] = (i * 0.37) % 0.2;
      this.cx[i] = this.ox[i];
      this.cz[i] = this.oz[i] + 0.6;
    }
    this.layout();
    return this.n - before;
  }

  /** removes the outer-most launcher; its position is left in lostX/lostZ for effects */
  remove() {
    if (this.n <= 0) return;
    this.n--;
    this.lostX = this.x + this.cx[this.n];
    this.lostZ = this.z + this.cz[this.n];
    this.layout();
  }

  update(dt, time, units, fireRate) {
    this.targetX = this.clampX(this.targetX);
    this.x += (this.targetX - this.x) * Math.min(1, dt * 16);
    const a = this.mesh.instanceMatrix.array;
    const k = Math.min(1, dt * 10);
    const interval = 1 / fireRate;
    this.shots = 0;
    for (let i = 0; i < this.n; i++) {
      this.cx[i] += (this.ox[i] - this.cx[i]) * k;
      this.cz[i] += (this.oz[i] - this.cz[i]) * k;
      if (this.scale[i] < 1) this.scale[i] = Math.min(1, this.scale[i] + dt * 5);
      const lx = this.x + this.cx[i];
      const lz = this.z + this.cz[i];
      let kick = 0;
      if (this.firing && units) {
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) {
          this.timer[i] += interval;
          if (this.timer[i] < 0) this.timer[i] = interval;
          units.spawn(lx, lz - 0.6);
          this.shots++;
        }
        kick = Math.max(0, this.timer[i] / interval - 0.7) / 0.3; // 1 right after a shot -> 0
      }
      const s = this.scale[i];
      const pop = (s < 1 ? s * (1 + Math.sin(s * Math.PI) * 0.4) : 1) * SCALE;
      // squash-and-stretch on each shot: squash down, stretch along the barrel, recoil back
      writeTS(a, i, lx, 0.04 + Math.sin(time * 5 + i) * 0.03, lz + kick * 0.12,
        pop * (1 + kick * 0.08), pop * (1 - kick * 0.14), pop * (1 + kick * 0.16));
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
