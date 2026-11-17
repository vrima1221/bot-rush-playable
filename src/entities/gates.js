// "+1" gate column (instanced, one shared label texture) and big "+N" bonus gates.
import * as THREE from 'three';
import { gateFrameGeometry, gatePanelGeometry, makeLabel, gateLabelDraw } from '../models.js';
import { writeRotTS, writeTS } from '../util.js';
import { WORLD } from '../levels.js';

const LS = WORLD.laneScale; // gates are narrowed to fit the side lanes

const _rot = new THREE.Matrix4();
const _c = new THREE.Color();
const GREEN = new THREE.Color('#5cff7a');
const MAGENTA = new THREE.Color('#ff3fb4');
const WHITE = new THREE.Color('#ffffff');

function panelMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide,
  });
}

function labelMaterial(map) {
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false });
}

function setInstColor(mesh, i, col) {
  const a = mesh.instanceColor.array;
  a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b;
}

/** Left lane column of small +1 gates. 3 draw calls total. */
export class SmallGates {
  constructor(scene, max = 64) {
    this.max = max;
    this.n = 0;
    this.x = new Float32Array(max);
    this.z = new Float32Array(max);
    this.state = new Uint8Array(max); // 0 active, 1 collected (animating), 2 gone
    this.t = new Float32Array(max);
    const frameMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x333333 });
    this.frame = new THREE.InstancedMesh(gateFrameGeometry(), frameMat, max);
    this.panel = new THREE.InstancedMesh(gatePanelGeometry(), panelMaterial(), max);
    this.panel.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.label = makeLabel(256, 144, gateLabelDraw('#ffffff', '#1d7a33'));
    this.label.set('+1');
    this.labels = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.7, 0.96), labelMaterial(this.label.texture), max);
    this.panel.renderOrder = 2;
    this.labels.renderOrder = 3;
    for (const m of [this.frame, this.panel, this.labels]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
  }

  setup(laneX, start, end, spacing) {
    this.n = 0;
    for (let z = start; z >= end && this.n < this.max; z -= spacing) {
      const i = this.n++;
      this.x[i] = laneX;
      this.z[i] = z;
      this.state[i] = 0;
      this.t[i] = 0;
      setInstColor(this.panel, i, GREEN);
    }
    this.panel.instanceColor.needsUpdate = true;
  }

  clear() {
    this.n = 0;
  }

  update(dt, scroll, player, onCollect) {
    for (let i = 0; i < this.n; i++) {
      const st = this.state[i];
      if (st === 2) continue;
      const z = (this.z[i] += scroll * dt);
      if (st === 0) {
        if (z > player.z + player.front - 0.3 && z < player.z + player.back + 0.3 && Math.abs(this.x[i] - player.x) < 1.5 * LS + player.halfW) {
          this.state[i] = 1;
          this.t[i] = 0;
          onCollect(this.x[i], z, 1);
        } else if (z > 12) this.state[i] = 2;
      } else {
        this.t[i] += dt;
        if (this.t[i] > 0.35) this.state[i] = 2;
      }
    }
  }

  render(camera) {
    _rot.makeRotationFromQuaternion(camera.quaternion);
    const r = _rot.elements;
    const fa = this.frame.instanceMatrix.array;
    const pa = this.panel.instanceMatrix.array;
    const la = this.labels.instanceMatrix.array;
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] === 2 || this.z[i] < -95) continue;
      let s = 1;
      if (this.state[i] === 1) {
        const t = this.t[i] / 0.35;
        s = 1 + t * 0.25;
        s *= 1 - t * t;
      }
      const x = this.x[i];
      const z = this.z[i];
      writeTS(fa, k, x, 0, z, LS, s, 1);
      writeTS(pa, k, x, 0, z, s * LS, s, 1);
      writeRotTS(la, k, r, x, 1.0 * s + 0.05, z + 0.25, s);
      setInstColor(this.panel, k, this.state[i] === 1 ? WHITE : GREEN);
      k++;
    }
    this.panel.instanceColor.needsUpdate = true;
    this.frame.count = this.panel.count = this.labels.count = k;
    this.frame.instanceMatrix.needsUpdate = true;
    this.panel.instanceMatrix.needsUpdate = true;
    this.labels.instanceMatrix.needsUpdate = true;
  }
}

/** Big magenta "+N" gates hidden behind the pillar block. */
export class BonusGates {
  constructor(scene, max = 3) {
    this.max = max;
    this.n = 0;
    this.x = new Float32Array(max);
    this.z = new Float32Array(max);
    this.value = new Int32Array(max);
    this.state = new Int8Array(max); // -1 hidden, 0 active, 1 collected, 2 gone
    this.t = new Float32Array(max);
    const frameMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x333333 });
    this.frame = new THREE.InstancedMesh(gateFrameGeometry('#ffe3f4', '#ff3fb4'), frameMat, max);
    this.panel = new THREE.InstancedMesh(gatePanelGeometry(), panelMaterial(), max);
    this.panel.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.panel.renderOrder = 2;
    for (const m of [this.frame, this.panel]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.frame.castShadow = true;
    this.labels = [];
    const geo = new THREE.PlaneGeometry(1.5, 0.85);
    for (let i = 0; i < max; i++) {
      const lab = makeLabel(256, 144, gateLabelDraw('#ffffff', '#8a1462'));
      const mesh = new THREE.Mesh(geo, labelMaterial(lab.texture));
      mesh.renderOrder = 3;
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.labels.push({ lab, mesh });
    }
    this.frame.castShadow = true;
    this.sx = LS; // full side-lane width; bonus gates are lined up one behind the other
    this.sy = 1.25;
  }

  clear() {
    this.n = 0;
    this.frame.count = this.panel.count = 0;
    for (const l of this.labels) l.mesh.visible = false;
  }

  setup(values, centerX, z) {
    this.clear();
    const gap = 4.5;
    for (let i = 0; i < values.length && i < this.max; i++) {
      const k = this.n++;
      this.x[k] = centerX;
      this.z[k] = z - k * gap;
      this.value[k] = values[i];
      this.state[k] = -1;
      this.t[k] = 0;
      this.labels[k].lab.set('+' + values[i]);
      setInstColor(this.panel, k, MAGENTA);
    }
    this.panel.instanceColor.needsUpdate = true;
  }

  reveal() {
    for (let i = 0; i < this.n; i++) if (this.state[i] === -1) { this.state[i] = 0; this.t[i] = 0; }
  }

  discard() {
    for (let i = 0; i < this.n; i++) this.state[i] = 2;
  }

  update(dt, scroll, player, onCollect) {
    let dirty = false;
    for (let i = 0; i < this.n; i++) {
      const st = this.state[i];
      if (st === 2) continue;
      const z = (this.z[i] += scroll * dt);
      this.t[i] += dt;
      if (st === 0) {
        const halfW = 1.45 * this.sx;
        if (z > player.z + player.front - 0.3 && z < player.z + player.back + 0.3 && Math.abs(this.x[i] - player.x) < halfW + player.halfW - 0.2) {
          this.state[i] = 1;
          this.t[i] = 0;
          setInstColor(this.panel, i, WHITE);
          dirty = true;
          onCollect(this.x[i], z, this.value[i]);
        } else if (z > 12) this.state[i] = 2;
      } else if (st === 1 && this.t[i] > 0.4) this.state[i] = 2;
      else if (st === -1 && z > 12) this.state[i] = 2;
    }
    if (dirty) this.panel.instanceColor.needsUpdate = true;
  }

  render(camera) {
    const fa = this.frame.instanceMatrix.array;
    const pa = this.panel.instanceMatrix.array;
    for (let i = 0; i < this.n; i++) {
      const st = this.state[i];
      let s = 1;
      if (st === -1 || st === 2) s = 0;
      else if (st === 0) {
        const t = Math.min(1, this.t[i] / 0.35);
        s = t < 1 ? t * (1 + Math.sin(t * Math.PI) * 0.35) : 1 + Math.sin(this.t[i] * 6) * 0.03;
      } else {
        const t = Math.min(1, this.t[i] / 0.4);
        s = (1 + t * 0.3) * (1 - t * t);
      }
      const x = this.x[i];
      const z = this.z[i];
      writeTS(fa, i, x, 0, z, this.sx * s, this.sy * s, 1);
      writeTS(pa, i, x, 0, z, this.sx * s, this.sy * s, 1);
      const m = this.labels[i].mesh;
      m.visible = s > 0.01;
      if (m.visible) {
        m.position.set(x, 1.25 * s + 0.1, z + 0.3);
        m.quaternion.copy(camera.quaternion);
        m.scale.setScalar(s);
      }
    }
    this.frame.count = this.panel.count = this.n;
    this.frame.instanceMatrix.needsUpdate = true;
    this.panel.instanceMatrix.needsUpdate = true;
  }
}
