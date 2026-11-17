// Player robot units: dense pool, one InstancedMesh (1 draw call).
import * as THREE from 'three';
import { writeTRS, writeTS } from '../util.js';
import { WORLD } from '../levels.js';

export const UNIT_SCALE = 1.2;
export const UNIT_RADIUS = 0.2 * UNIT_SCALE;

export class Units {
  constructor(scene, geometry, material, shadowMesh, max = 1500) {
    this.shadow = shadowMesh;
    this.max = max;
    this.count = 0;
    this.x = new Float32Array(max);
    this.z = new Float32Array(max);
    this.phase = new Float32Array(max);
    this.dead = new Uint8Array(max);
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.peak = 0;
    this.seq = 0;
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
    this.shadow.count = 0;
  }

  spawn(x, z) {
    if (this.count >= this.max) return;
    const i = this.count++;
    // small deterministic spread so each stream reads as a band, not a line
    this.seq = (this.seq + 7) % 23;
    this.x[i] = x + (this.seq / 22 - 0.5) * 0.36;
    this.z[i] = z;
    this.phase[i] = (x * 13.7 + this.seq * 0.9) % 6.283;
    this.dead[i] = 0;
  }

  /**
   * fly straight up the runway; a unit lined up with a lane divider is nudged
   * sideways into the nearest lane before it reaches the divider's near end
   * (ties go to the centre lane) so every unit stays inside one lane.
   */
  move(dt, speed, maxZ) {
    const step = speed * dt;
    const dX = WORLD.dividerX;
    const dH = WORLD.dividerHalf;
    const nudgeZ = WORLD.dividerStart + 3;
    const side = 9 * dt;
    for (let i = 0; i < this.count; i++) {
      const z = this.z[i] - step;
      this.z[i] = z;
      if (z < maxZ) { this.dead[i] = 1; continue; }
      if (z < nudgeZ) {
        const x = this.x[i];
        const ax = x < 0 ? -x : x;
        const d = ax - dX; // >0 lane edge side, <=0 centre side
        if (d > -dH && d < dH) {
          const sgn = x < 0 ? -1 : 1;
          let nx;
          if (d > 0) nx = Math.min(ax + side, dX + dH); // outer lane
          else nx = Math.max(ax - side, dX - dH); // centre lane
          this.x[i] = sgn * nx;
        }
      }
    }
  }

  /** remove dead units (swap-remove) */
  compact() {
    let n = this.count;
    for (let i = n - 1; i >= 0; i--) {
      if (this.dead[i]) {
        n--;
        if (i !== n) {
          this.x[i] = this.x[n];
          this.z[i] = this.z[n];
          this.phase[i] = this.phase[n];
          this.dead[i] = this.dead[n];
        }
      }
    }
    this.count = n;
    if (n > this.peak) this.peak = n;
  }

  render() {
    const a = this.mesh.instanceMatrix.array;
    const sa = this.shadow.instanceMatrix.array;
    for (let i = 0; i < this.count; i++) {
      // run cycle / bob / waddle run in the vertex shader (see anim.js)
      writeTRS(a, i, this.x[i], 0, this.z[i], 0, UNIT_SCALE);
      writeTS(sa, i, this.x[i] - 0.1, 0.025, this.z[i] - 0.08, 0.6, 1, 0.6);
    }
    this.mesh.count = this.count;
    this.shadow.count = this.count;
    if (this.count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.shadow.instanceMatrix.needsUpdate = true;
    }
  }
}
