// Orange horned golem boss: body + two arms + two legs (one shared material) animated on the CPU,
// with a billboard HP bar that stays readable below the HUD.
import * as THREE from 'three';
import { bossParts, BOSS_PIVOTS, makeLabel, drawOutlinedText } from '../models.js';
import { UNIT_RADIUS } from './units.js';

const _v = new THREE.Vector3();
const _up = new THREE.Vector3();
const BAR_H = 1.35; // world height of the HP bar plane
const BAR_GAP = 1.0; // bar centre sits this far above the head
export const HEAD_Y = 3.4; // top of the horns at scale 1

function drawBar(ctx, w, h, value, max) {
  const pad = 6;
  const barY = 52;
  const barH = h - barY - pad;
  ctx.fillStyle = 'rgba(20, 8, 30, 0.85)';
  ctx.fillRect(pad, barY, w - pad * 2, barH);
  const f = Math.max(0, Math.min(1, value / max));
  const gr = ctx.createLinearGradient(0, barY, 0, barY + barH);
  gr.addColorStop(0, '#ff9c6b');
  gr.addColorStop(1, '#e8384f');
  ctx.fillStyle = gr;
  ctx.fillRect(pad + 4, barY + 4, (w - pad * 2 - 8) * f, barH - 8);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(pad, barY, w - pad * 2, barH);
  drawOutlinedText(ctx, String(value), w / 2, 26, 46, '#ffffff', '#5a1430', 9);
}

export class Boss {
  constructor(scene) {
    this.material = new THREE.MeshPhongMaterial({
      vertexColors: true, shininess: 50, specular: 0x333333, emissive: 0xff3a1a, emissiveIntensity: 0,
    });
    const g = bossParts();
    const P = BOSS_PIVOTS;
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(g.body, this.material);
    this.armL = new THREE.Mesh(g.armL, this.material);
    this.armR = new THREE.Mesh(g.armR, this.material);
    this.legL = new THREE.Mesh(g.legL, this.material);
    this.legR = new THREE.Mesh(g.legR, this.material);
    this.armL.position.set(-P.shoulderX, P.shoulderY, 0);
    this.armR.position.set(P.shoulderX, P.shoulderY, 0);
    this.legL.position.set(-P.hipX, P.hipY, 0);
    this.legR.position.set(P.hipX, P.hipY, 0);
    for (const m of [this.body, this.armL, this.armR, this.legL, this.legR]) {
      m.castShadow = true;
      this.group.add(m);
    }
    this.group.visible = false;
    scene.add(this.group);

    this.bar = makeLabel(256, 96, drawBar);
    this.barMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, BAR_H),
      new THREE.MeshBasicMaterial({ map: this.bar.texture, transparent: true, depthWrite: false, depthTest: false, fog: false }),
    );
    this.barMesh.renderOrder = 7;
    this.barMesh.visible = false;
    scene.add(this.barMesh);
    this.alive = false;
    this.dying = false;
    this.dyingT = 0;
    this.hp = 0;
    this.maxHp = 1;
    this.x = 0;
    this.z = -150;
    this.scale = 1;
    this.flash = 0;
    this.walk = 0;
    this.onScreen = false;
    this.entered = false; // became visible this level (for the entrance sound)
    this.hudNdcY = 0.73; // bottom edge of the HUD in NDC (set from main.js on resize)
    this.barClamped = false; // safety-net clamp engaged this frame (should never happen in play)
    this.barTopNdc = -1; // projected top edge of the bar (debug / assertions)
  }

  /** world y of the bar centre (above the head) */
  barAnchorY(scale = this.scale) {
    return HEAD_Y * scale + BAR_GAP;
  }

  /** projected NDC y of the bar's top edge if the boss stood at z (billboard faces the camera) */
  barTopNdcAt(camera, x, z, scale) {
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(BAR_H / 2);
    _v.set(x, this.barAnchorY(scale), z).add(_up).project(camera);
    return _v.y;
  }

  /**
   * deepest z at which the whole bar (top edge) is still below the HUD with a margin:
   * the boss starts here, so its fight always happens in view
   */
  startZ(camera, scale, margin = 0.05, deepest = -22) {
    const lim = this.hudNdcY - margin;
    let z = -6;
    for (let zz = -6; zz >= -70; zz -= 0.25) {
      if (this.barTopNdcAt(camera, 0, zz, scale) < lim) z = zz;
      else break;
    }
    // tall screens could start it deeper; cap so every screen gets the same fight length
    return Math.max(z, deepest);
  }

  /** NDC y of the chest (debug / assertions) */
  chestNdc(camera) {
    _v.set(this.x, 1.6 * this.scale, this.z).project(camera);
    return _v.y;
  }

  setup(def, z) {
    this.alive = true;
    this.dying = false;
    this.hp = this.maxHp = def.hp;
    this.x = 0;
    this.z = z;
    this.scale = def.scale;
    this.speed = def.speed;
    this.flash = 0;
    this.walk = 0;
    this.entered = false;
    this.bar.reset();
    this.group.visible = true;
    this.onScreen = false;
    this.barMesh.visible = false;
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(this.scale);
  }

  get halfW() {
    return 1.45 * this.scale + UNIT_RADIUS;
  }

  /** z of the front surface, including the unit radius (a unit touching it is a hit) */
  get front() {
    return this.z + 0.8 * this.scale + UNIT_RADIUS;
  }

  get back() {
    return this.z - 0.8 * this.scale;
  }

  hits(x, z) {
    return this.alive && !this.dying && x > this.x - this.halfW && x < this.x + this.halfW && z < this.front && z > this.back - 1;
  }

  damage(n) {
    this.hp -= n;
    if (this.hp < 0) this.hp = 0;
    if (this.flash < 0.2) this.flash = 1;
  }

  startDeath() {
    this.dying = true;
    this.dyingT = 0;
  }

  die(fx) {
    this.alive = false;
    this.dying = false;
    this.group.visible = false;
    this.barMesh.visible = false;
    const s = this.scale;
    fx.shards(this.x, 1.0 * s, this.z - 1.2 * s, 0xff8a2a, 0xa8481a, 120, 1.8 * s, 12, 1.5 * s);
    fx.shards(this.x, 1.0 * s, this.z - 2.4 * s, 0xf5ead0, 0xff9a3c, 40, 1.2 * s, 9, 1.0 * s);
    fx.puff(this.x, 1.0 * s, this.z - 1.2 * s, 0xffd84a, 30, 5, 3);
    fx.puff(this.x, 1.0 * s, this.z - 1.2 * s, 0xffffff, 20, 3.5, 2.5);
  }

  /**
   * v = forward speed decided by the game (follow the column / charge / stomp).
   * Returns true once the topple animation has finished (caller then calls die()).
   */
  update(dt, v, playerX, camera) {
    if (!this.alive) return false;
    const P = BOSS_PIVOTS;
    if (this.dying) {
      this.dyingT += dt;
      const t = Math.min(1, this.dyingT / 0.7);
      this.group.rotation.x = -t * t * 1.45; // topples backward
      this.armL.rotation.x = this.armR.rotation.x = -t * 1.2;
      return this.dyingT >= 0.7;
    }
    this.z += v * dt;
    if (v > 0) {
      let t = playerX * 0.2;
      t = t > 0.4 ? 0.4 : t < -0.4 ? -0.4 : t;
      let d = t - this.x;
      const m = 0.5 * dt;
      d = d > m ? m : d < -m ? -m : d;
      this.x += d;
    }
    // stomping gait: phase follows distance walked
    this.walk += v * dt * 2.6;
    const s = Math.sin(this.walk);
    this.legL.rotation.x = s * 0.5;
    this.legR.rotation.x = -s * 0.5;
    this.armL.rotation.x = -s * 0.45;
    this.armR.rotation.x = s * 0.45;
    this.armL.rotation.z = -0.12;
    this.armR.rotation.z = 0.12;
    this.flash = Math.max(0, this.flash - dt * 14);
    this.material.emissiveIntensity = this.flash * 0.35;
    const sc = this.scale;
    this.group.position.set(this.x, Math.abs(Math.cos(this.walk)) * 0.1 * sc, this.z);
    // flinch: lean back while being hit; slight sway with the gait
    this.group.rotation.set(-this.flash * 0.07, 0, s * 0.04);
    _v.set(this.x, 1.5 * sc, this.z).project(camera);
    this.onScreen = _v.y < 0.9 && _v.y > -1 && _v.z < 1;
    return false;
  }

  /** called after collisions so the number changes on the same frame as the hit */
  refreshBar(camera) {
    if (!this.alive) return;
    // hidden until the boss takes its first hit
    const show = this.hp < this.maxHp;
    this.barMesh.visible = show;
    if (!show) return;
    this.bar.set(this.hp, this.maxHp);
    const sc = this.scale;
    // attached above the head. Safety net only: if the bar would ever reach the HUD it slides
    // down over the body, never lower than the chest (the boss starts deep enough that this
    // does not engage in normal play; barClamped reports it)
    const ay = this.barAnchorY();
    this.barTopNdc = this.barTopNdcAt(camera, this.x, this.z, sc);
    this.barClamped = false;
    if (this.barTopNdc > this.hudNdcY) {
      _v.set(this.x, 1.6 * sc, this.z).project(camera);
      const chestY = _v.y;
      _v.set(this.x, ay, this.z).project(camera);
      _v.y = Math.max(_v.y - (this.barTopNdc - this.hudNdcY), chestY);
      _v.unproject(camera);
      this.barMesh.position.copy(_v);
      this.barClamped = true;
    } else {
      this.barMesh.position.set(this.x, ay, this.z);
    }
    this.barMesh.quaternion.copy(camera.quaternion);
  }
}
