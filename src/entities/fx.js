// Pooled particle effects: "puffs" (pops / flashes) and "debris" (shards with gravity).
import * as THREE from 'three';
import { writeTRS, writeRotTS, writeRotTS3, rand, randRange } from '../util.js';

const _c = new THREE.Color();
const _e = new THREE.Euler();
const _r = new THREE.Matrix4();

class Pool {
  constructor(scene, geometry, max, material) {
    this.max = max;
    this.count = 0;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.z = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.vz = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.rx = new Float32Array(max);
    this.ry = new Float32Array(max);
    this.wx = new Float32Array(max);
    this.wy = new Float32Array(max);
    this.cursor = 0;
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  alloc() {
    if (this.count < this.max) return this.count++;
    // pool full: recycle a slot round-robin
    this.cursor = (this.cursor + 1) % this.max;
    return this.cursor;
  }

  setColor(i, hex, k) {
    _c.setHex(hex);
    const a = this.mesh.instanceColor.array;
    a[i * 3] = _c.r * k;
    a[i * 3 + 1] = _c.g * k;
    a[i * 3 + 2] = _c.b * k;
  }

  kill(i) {
    const j = --this.count;
    if (i === j) return;
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.size[i] = this.size[j];
    this.rx[i] = this.rx[j]; this.ry[i] = this.ry[j]; this.wx[i] = this.wx[j]; this.wy[i] = this.wy[j];
    const a = this.mesh.instanceColor.array;
    a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2];
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
  }
}

/**
 * Capped pool of whole-model "dying" instances (knock-back pops / tumbling wrecks).
 * instanceColor drives the white flash. alloc() returns -1 when full (caller falls back to puffs).
 */
class Tumble {
  constructor(scene, geometry, max, life, flashFrom, flashTo) {
    this.max = max;
    this.count = 0;
    this.life = life;
    this.x = new Float32Array(max); this.y = new Float32Array(max); this.z = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.t = new Float32Array(max); this.rx = new Float32Array(max); this.wx = new Float32Array(max);
    this.ry = new Float32Array(max); this.wy = new Float32Array(max); this.s = new Float32Array(max);
    this.from = new THREE.Color(flashFrom);
    this.to = new THREE.Color(flashTo);
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 40, specular: 0x222222 });
    this.mesh = new THREE.InstancedMesh(geometry, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, s, spin) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.t[i] = 0; this.s[i] = s;
    this.rx[i] = 0; this.ry[i] = 0;
    this.wx[i] = randRange(-spin, spin) - spin * 0.5; this.wy[i] = randRange(-spin, spin);
    return i;
  }

  kill(i) {
    const j = --this.count;
    if (i === j) return;
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.t[i] = this.t[j]; this.s[i] = this.s[j];
    this.rx[i] = this.rx[j]; this.ry[i] = this.ry[j]; this.wx[i] = this.wx[j]; this.wy[i] = this.wy[j];
  }

  update(dt, squash) {
    const a = this.mesh.instanceMatrix.array;
    const c = this.mesh.instanceColor.array;
    for (let i = this.count - 1; i >= 0; i--) {
      this.t[i] += dt;
      if (this.t[i] >= this.life) { this.kill(i); continue; }
      this.vy[i] -= 18 * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
      if (this.y[i] < 0) { this.y[i] = 0; this.vy[i] *= -0.3; }
      this.rx[i] += this.wx[i] * dt; this.ry[i] += this.wy[i] * dt;
    }
    for (let i = 0; i < this.count; i++) {
      const k = this.t[i] / this.life; // 0..1
      _e.set(this.rx[i], this.ry[i], 0);
      _r.makeRotationFromEuler(_e);
      const s = this.s[i];
      let sx = s, sy = s, sz = s;
      if (squash) {
        // squash on impact, then stretch up and shrink away
        const q = k < 0.3 ? 1 - Math.sin((k / 0.3) * Math.PI) * 0.45 : 1 + (k - 0.3) * 0.5;
        const shrink = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
        sx = sz = s * (2 - q) * shrink; sy = s * q * shrink;
      } else if (k > 0.75) {
        sx = sy = sz = s * (1 - (k - 0.75) / 0.25);
      }
      writeRotTS3(a, i, _r.elements, this.x[i], this.y[i], this.z[i], sx, sy, sz);
      // flash: from -> to over the first 40 % of life
      const f = Math.min(1, k / 0.4);
      c[i * 3] = this.from.r + (this.to.r - this.from.r) * f;
      c[i * 3 + 1] = this.from.g + (this.to.g - this.from.g) * f;
      c[i * 3 + 2] = this.from.b + (this.to.b - this.from.b) * f;
    }
    this.mesh.count = this.count;
    if (this.count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
  }
}

export class FX {
  constructor(scene, enemyGeo, launcherGeo) {
    // enemy knock-back pops: flash white -> purple, squash, fly up/back, shrink (0.25 s)
    this.dying = new Tumble(scene, enemyGeo, 256, 0.25, 0xffffff, 0x7b3fd6);
    // destroyed launchers: grey tumbling wrecks
    this.wrecks = new Tumble(scene, launcherGeo, 12, 1.1, 0xffffff, 0x6d6f78);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    this.puffs = new Pool(scene, new THREE.IcosahedronGeometry(0.2, 0), 300, mat);
    this.puffs.mesh.renderOrder = 5;
    const dmat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.debris = new Pool(scene, new THREE.TetrahedronGeometry(0.3, 0), 300, dmat);
  }

  clear() {
    this.puffs.clear();
    this.debris.clear();
    this.dying.clear();
    this.wrecks.clear();
  }

  /** enemy killed by a unit: knock-back pop + white smoke + orange spark (puff only if the pool is full) */
  enemyDeath(x, z, scale) {
    const i = this.dying.spawn(x, 0, z, randRange(-0.6, 0.6), 4.2, -3.2, scale, 6);
    this.puff(x, 0.5, z, 0xffffff, i >= 0 ? 1 : 2, 1.4, 1.1);
    this.puff(x, 0.5, z, 0xff9a3c, 1, 1.8, 0.7);
  }

  launcherLost(x, z, scale) {
    this.wrecks.spawn(x, 0.2, z, randRange(-2.5, 2.5), 6.5, 2.5, scale, 9);
    this.puff(x, 0.5, z, 0xcfd3dc, 6, 2, 1.4);
    this.shards(x, 0.4, z, 0x8a8d96, 0xdfe3ea, 6, 0.8, 6, 0.6);
  }

  /** small pop. n particles of colour hex */
  puff(x, y, z, hex, n = 2, spread = 1.6, size = 1) {
    const p = this.puffs;
    for (let k = 0; k < n; k++) {
      const i = p.alloc();
      p.x[i] = x; p.y[i] = y; p.z[i] = z;
      p.vx[i] = randRange(-spread, spread);
      p.vy[i] = randRange(0.6, 2.2) * spread * 0.8;
      p.vz[i] = randRange(-spread, spread);
      p.maxLife[i] = p.life[i] = randRange(0.22, 0.4);
      p.size[i] = size * randRange(0.7, 1.3);
      p.setColor(i, hex, randRange(0.85, 1.15));
    }
  }

  /** debris shards with gravity */
  shards(x, y, z, hexA, hexB, n, spread, up, size = 1) {
    const d = this.debris;
    for (let k = 0; k < n; k++) {
      const i = d.alloc();
      d.x[i] = x + randRange(-1, 1) * spread * 0.4;
      d.y[i] = y + randRange(-1, 1) * spread * 0.6;
      d.z[i] = z + randRange(-0.5, 0.5);
      d.vx[i] = randRange(-1, 1) * spread * 2.2;
      d.vy[i] = randRange(0.3, 1) * up;
      d.vz[i] = randRange(-1.2, 1.2) * spread;
      d.maxLife[i] = d.life[i] = randRange(1.0, 1.7);
      d.size[i] = size * randRange(0.6, 1.4);
      d.rx[i] = rand() * 6; d.ry[i] = rand() * 6;
      d.wx[i] = randRange(-9, 9); d.wy[i] = randRange(-9, 9);
      d.setColor(i, rand() < 0.5 ? hexA : hexB, 1);
    }
  }

  update(dt, scroll) {
    this.dying.update(dt, true);
    this.wrecks.update(dt, false);
    const p = this.puffs;
    const pa = p.mesh.instanceMatrix.array;
    for (let i = p.count - 1; i >= 0; i--) {
      p.life[i] -= dt;
      if (p.life[i] <= 0) { p.kill(i); continue; }
      p.x[i] += p.vx[i] * dt;
      p.y[i] += p.vy[i] * dt;
      p.z[i] += (p.vz[i] + scroll) * dt;
      p.vy[i] -= 4 * dt;
    }
    for (let i = 0; i < p.count; i++) {
      const t = p.life[i] / p.maxLife[i];
      writeTRS(pa, i, p.x[i], p.y[i], p.z[i], 0, p.size[i] * (0.4 + 1.2 * t * (1.6 - t)));
    }
    p.mesh.count = p.count;
    if (p.count) {
      p.mesh.instanceMatrix.needsUpdate = true;
      p.mesh.instanceColor.needsUpdate = true;
    }

    const d = this.debris;
    const da = d.mesh.instanceMatrix.array;
    for (let i = d.count - 1; i >= 0; i--) {
      d.life[i] -= dt;
      if (d.life[i] <= 0) { d.kill(i); continue; }
      d.vy[i] -= 22 * dt;
      d.x[i] += d.vx[i] * dt;
      d.y[i] += d.vy[i] * dt;
      d.z[i] += (d.vz[i] + scroll) * dt;
      if (d.y[i] < 0.15 && d.x[i] > -6 && d.x[i] < 6 && d.vy[i] < 0) {
        d.y[i] = 0.15;
        d.vy[i] *= -0.35;
        d.vx[i] *= 0.6;
        d.vz[i] *= 0.6;
        d.wx[i] *= 0.5;
      }
      d.rx[i] += d.wx[i] * dt;
      d.ry[i] += d.wy[i] * dt;
    }
    for (let i = 0; i < d.count; i++) {
      _e.set(d.rx[i], d.ry[i], 0);
      _r.makeRotationFromEuler(_e);
      const t = d.life[i] / d.maxLife[i];
      writeRotTS(da, i, _r.elements, d.x[i], d.y[i], d.z[i], d.size[i] * Math.min(1, t * 3));
    }
    d.mesh.count = d.count;
    if (d.count) {
      d.mesh.instanceMatrix.needsUpdate = true;
      d.mesh.instanceColor.needsUpdate = true;
    }
  }
}
