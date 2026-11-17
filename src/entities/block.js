// Dark crystal pillar with an HP counter. Shatters at 0 and reveals bonus gates.
import * as THREE from 'three';
import { blockGeometry, makeLabel, drawOutlinedText } from '../models.js';
import { WORLD } from '../levels.js';
import { UNIT_RADIUS } from './units.js';

const SX = WORLD.laneScale; // fits the 3.1-wide right lane

function drawHp(ctx, w, h, value) {
  ctx.fillStyle = 'rgba(18, 10, 40, 0.82)';
  const r = 26;
  ctx.beginPath();
  ctx.moveTo(r, 6);
  ctx.arcTo(w - 6, 6, w - 6, h - 6, r);
  ctx.arcTo(w - 6, h - 6, 6, h - 6, r);
  ctx.arcTo(6, h - 6, 6, 6, r);
  ctx.arcTo(6, 6, w - 6, 6, r);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#9d8bff';
  ctx.stroke();
  drawOutlinedText(ctx, String(value), w / 2, h / 2 + 5, 92, '#ffffff', '#3a2a78', 12);
}

export class Block {
  constructor(scene) {
    this.material = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x444466, emissive: 0x6a50ff, emissiveIntensity: 0 });
    this.mesh = new THREE.Mesh(blockGeometry(), this.material);
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.label = makeLabel(256, 150, drawHp);
    this.labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.11),
      new THREE.MeshBasicMaterial({ map: this.label.texture, transparent: true, depthWrite: false, depthTest: false, fog: false }),
    );
    this.labelMesh.renderOrder = 6;
    this.labelMesh.visible = false;
    scene.add(this.labelMesh);
    this.active = false;
    this.hp = 0;
    this.maxHp = 1;
    this.x = 4;
    this.z = -40;
    this.flash = 0;
    this.halfW = 1.5 * SX + UNIT_RADIUS; // drawn half width + unit radius
  }

  setup(def, x) {
    if (!def) {
      this.active = false;
      this.mesh.visible = false;
      this.labelMesh.visible = false;
      return;
    }
    this.active = true;
    this.hp = this.maxHp = def.hp;
    this.x = x;
    this.z = def.z;
    this.flash = 0;
    this.label.reset();
    this.label.set(this.hp);
    this.mesh.visible = true;
    this.labelMesh.visible = true;
    this.mesh.scale.set(SX, 1, 1);
  }

  /** returns true if the unit at (x, z) is absorbed by the block */
  hits(x, z) {
    return this.active && x > this.x - this.halfW && x < this.x + this.halfW && z < this.z + 1.05 + UNIT_RADIUS && z > this.z - 1.6;
  }

  damage(n) {
    this.hp -= n;
    this.flash = 1;
    if (this.hp < 0) this.hp = 0;
  }

  shatter(fx) {
    this.active = false;
    this.mesh.visible = false;
    this.labelMesh.visible = false;
    fx.shards(this.x, 2.4, this.z, 0x7d6cf0, 0x2b2352, 90, 1.6, 9, 1.3);
    fx.shards(this.x, 4.6, this.z, 0xb9a8ff, 0x9d8bff, 40, 1.2, 6, 0.9);
    fx.puff(this.x, 2.5, this.z + 0.8, 0xb9a8ff, 14, 3.5, 2.4);
  }

  update(dt, speed, camera) {
    if (!this.active) return;
    this.z += speed * dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.material.emissiveIntensity = this.flash * 0.9;
    const wob = 1 + this.flash * 0.03;
    this.mesh.scale.set(wob * SX, 1, wob);
    this.mesh.position.set(this.x, 0, this.z);
  }

  /** called after collisions so the number changes on the same frame as the hit */
  refreshLabel(camera) {
    if (!this.active) return;
    this.label.set(this.hp);
    this.labelMesh.position.set(this.x, 2.7, this.z + 1.3);
    this.labelMesh.quaternion.copy(camera.quaternion);
  }
}
