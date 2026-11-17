// Enemy horde: dense pool streamed in from a reserve + Z-row buckets for O(n) collision lookups.
import * as THREE from 'three';
import { writeTRS, writeTS, randRange } from '../util.js';
import { WORLD } from '../levels.js';

export const ROW = 1.0;
export const ZMIN = -150;
export const NROWS = 165; // covers z in [-150, 15)
export const ENEMY_SCALE = 1.3;
export const ENEMY_RADIUS = 0.28 * ENEMY_SCALE; // drawn body radius

export class Horde {
  constructor(scene, geometry, material, shadowMesh, max = 1500) {
    this.max = max;
    this.count = 0;
    this.x = new Float32Array(max);
    this.z = new Float32Array(max);
    this.ox = new Float32Array(max); // formation offset
    this.dead = new Uint8Array(max);
    this.head = new Int32Array(NROWS);
    this.next = new Int32Array(max);
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.shadow = shadowMesh; // instanced blob-shadow quads
    this.total = 0; // full level total (constant during the level)
    this.reserve = 0; // not yet spawned
    this.removed = 0; // killed or broke through
    this.cols = 1;
    this.spacing = 0.6;
    this.backZ = 0; // z of the last spawned row (moves with the column)
    this.front = -20; // z of the front-most enemy (previous frame)
    this.rushK = 1.5; // max extra speed factor while the front is far away
    this.squeeze = 0.35; // how much the column narrows near the player (0 = none)
    this.rowIndex = 0;
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
    this.shadow.count = 0;
    this.total = this.reserve = this.removed = 0;
  }

  spawnRow(z) {
    const cols = this.cols;
    const sp = this.spacing;
    const offset = this.rowIndex % 2 ? sp * 0.5 : 0;
    this.rowIndex++;
    for (let c = 0; c < cols && this.reserve > 0 && this.count < this.max; c++) {
      const i = this.count++;
      this.reserve--;
      let ox = (c - (cols - 1) / 2) * sp + offset - sp * 0.25;
      const lim = WORLD.hordeHalf;
      ox = ox > lim ? lim : ox < -lim ? -lim : ox;
      this.ox[i] = ox;
      this.x[i] = ox + randRange(-0.06, 0.06);
      this.z[i] = z + randRange(-0.08, 0.08);
      this.dead[i] = 0;
    }
  }

  /** level start: rows from the front z back to the spawn line; the rest waits in the reserve */
  setup(def) {
    this.clear();
    this.total = this.reserve = def.total;
    this.cols = def.cols;
    this.rushK = def.rush !== undefined ? def.rush : 1.5;
    this.squeeze = def.squeeze !== undefined ? def.squeeze : 0.35;
    this.front = def.z;
    this.spacing = def.spacing;
    this.rowIndex = 0;
    let z = def.z;
    while (this.reserve > 0 && z >= WORLD.hordeSpawnZ) {
      this.spawnRow(z);
      z -= def.spacing;
    }
    this.backZ = z + def.spacing;
  }

  /**
   * march straight down the centre lane. Far away the column is full width; close to
   * the player it leans toward the player's side, always clamped between the dividers.
   * New rows stream in at the spawn line while the reserve lasts.
   */
  move(dt, speed, playerX, bx = 0, bz = 0, br = 0) {
    const br2 = br * br;
    // the column hurries while its front is far away, then slows to its march pace near the
    // player, so a strong army meets it mid-runway instead of erasing it at the spawn line
    const far = (-12 - this.front) / 12;
    const rush = far <= 0 ? 1 : 1 + (far > 1 ? 1 : far) * this.rushK;
    const step = speed * rush * dt;
    let front = -999;
    const maxSide = 1.2 * dt;
    const lim = WORLD.hordeHalf;
    let cx = playerX * 0.5;
    if (cx > 1.1) cx = 1.1;
    else if (cx < -1.1) cx = -1.1;
    for (let i = 0; i < this.count; i++) {
      const z = (this.z[i] += step);
      if (z > front && !this.dead[i]) front = z;
      if (speed <= 0) continue;
      const k = z < -16 ? 0 : z > -6 ? 1 : (z + 16) / 10;
      let tx = this.ox[i] * (1 - this.squeeze * k) + cx * k;
      if (tx > lim) tx = lim;
      else if (tx < -lim) tx = -lim;
      let d = tx - this.x[i];
      if (d > maxSide) d = maxSide;
      else if (d < -maxSide) d = -maxSide;
      let x = this.x[i] + d;
      // keep clear of the boss: enemies flow around its footprint (ellipse, wider in x)
      if (br2 > 0) {
        const ex = (x - bx) / 1.15;
        const ez = this.z[i] - bz;
        const d2 = ex * ex + ez * ez;
        if (d2 < br2) {
          // slide sideways to the footprint edge at this depth (keeps the column's pace)
          const side = ex > 0 ? 1 : ex < 0 ? -1 : this.ox[i] >= 0 ? 1 : -1;
          x = bx + side * 1.15 * Math.sqrt(br2 - ez * ez);
          if (x > lim || x < -lim) {
            // no room beside the boss: hold at its front/back edge instead
            x = x > lim ? lim : -lim;
            this.z[i] = ez < 0 ? bz - br : bz + br;
          }
        }
      }
      if (x > lim) x = lim;
      else if (x < -lim) x = -lim;
      this.x[i] = x;
    }
    this.front = this.count ? front : WORLD.hordeSpawnZ;
    this.backZ += step;
    while (this.reserve > 0 && this.backZ - this.spacing >= WORLD.hordeSpawnZ && this.count < this.max - this.cols) {
      this.backZ -= this.spacing;
      this.spawnRow(this.backZ);
    }
  }

  /** column fully gone (nothing alive, nothing in reserve) */
  get cleared() {
    return this.count === 0 && this.reserve === 0;
  }

  buildBuckets() {
    const head = this.head;
    head.fill(-1);
    const next = this.next;
    for (let i = 0; i < this.count; i++) {
      if (this.dead[i]) continue;
      const r = Math.floor((this.z[i] - ZMIN) / ROW);
      if (r < 0 || r >= NROWS) continue;
      next[i] = head[r];
      head[r] = i;
    }
  }

  compact() {
    let n = this.count;
    for (let i = n - 1; i >= 0; i--) {
      if (this.dead[i]) {
        n--;
        this.removed++;
        if (i !== n) {
          this.x[i] = this.x[n];
          this.z[i] = this.z[n];
          this.ox[i] = this.ox[n];
          this.dead[i] = this.dead[n];
        }
      }
    }
    this.count = n;
  }

  render() {
    const a = this.mesh.instanceMatrix.array;
    const sa = this.shadow.instanceMatrix.array;
    for (let i = 0; i < this.count; i++) {
      // walk cycle / bob / waddle run in the vertex shader (see anim.js)
      writeTRS(a, i, this.x[i], 0, this.z[i], 0, ENEMY_SCALE);
      writeTS(sa, i, this.x[i] - 0.12, 0.03, this.z[i] - 0.1, 0.95, 1, 0.95);
    }
    this.mesh.count = this.count;
    this.shadow.count = this.count;
    if (this.count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.shadow.instanceMatrix.needsUpdate = true;
    }
  }
}
