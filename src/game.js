// Game state machine + world + per-frame simulation.
//   intro -> playing -> levelWin -> endCard -> playing(next) ... -> final
//   playing -> failing -> fail -> playing(retry)
import * as THREE from 'three';
import { LEVELS, WORLD } from './levels.js';
import {
  unitGeometry, enemyGeometry, launcherGeometry, runwayTexture, skyTexture, cloudSeaTexture, deckGeometry,
} from './models.js';
import { applyWalk } from './anim.js';
import { Units, UNIT_RADIUS } from './entities/units.js';
import { Horde, ROW, ZMIN, NROWS, ENEMY_RADIUS, ENEMY_SCALE } from './entities/horde.js';
import { Player } from './entities/player.js';
import { SmallGates, BonusGates } from './entities/gates.js';
import { Block } from './entities/block.js';
import { Boss } from './entities/boss.js';
import { FX } from './entities/fx.js';
import { writeTS, randRange } from './util.js';

const RUNWAY_LEN = 240;
const RUNWAY_TILE = 8; // texture repeat length (texture is static)
const CLOUDS = 46;
const FOG_COLOR = '#f3cdbd';
const HIT_R = ENEMY_RADIUS + UNIT_RADIUS; // unit/enemy contact distance (drawn sizes)
export const SUN_DIR = new THREE.Vector3(7, 18, 9).normalize();

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(20, 10, 40, 0.9)');
  gr.addColorStop(0.55, 'rgba(20, 10, 40, 0.5)');
  gr.addColorStop(1, 'rgba(20, 10, 40, 0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Game {
  constructor(scene, camera, ui, audio) {
    this.scene = scene;
    this.camera = camera;
    this.ui = ui;
    this.audio = audio;
    this.state = 'intro';
    this.levelIndex = 0;
    this.level = LEVELS[0];
    this.time = 0;
    this.stateTime = 0;
    this.kills = 0;
    this.autoplay = false;
    this.fireEnabled = true;
    this.lastMax = -10;
    this.unitMaxZ = WORLD.unitMaxZ;
    this.timeScale = 1;
    this.shake = 0;
    this.progress = 0;
    this.bossHitFrame = -1; // debug: frame index of the last boss damage
    this.frame = 0;

    this.buildWorld();

    // glossy materials; crowds get the GPU walk cycle (different stride per type)
    const unitMat = applyWalk(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x3a3a3a }),
      { key: 'unit', stride: 2.6, legAmp: 0.75, armAmp: 0.7, bob: 0.07, roll: 0.07 });
    const enemyMat = applyWalk(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x333333 }),
      { key: 'enemy', stride: 0.75, legAmp: 0.6, armAmp: 0, bob: 0.06, roll: 0.09 });
    const launcherMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80, specular: 0x444444 });

    // blob shadows for the crowds (crowds do not cast into the shadow map)
    const blobGeo = new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2);
    const blobMat = new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const blob = (n) => {
      const m = new THREE.InstancedMesh(blobGeo, blobMat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = 1;
      scene.add(m);
      return m;
    };

    const enemyGeo = enemyGeometry();
    const launcherGeo = launcherGeometry();
    this.units = new Units(scene, unitGeometry(), unitMat, blob(1500), 1500);
    this.horde = new Horde(scene, enemyGeo, enemyMat, blob(1500), 1500);
    this.player = new Player(scene, launcherGeo, launcherMat);
    this.gates = new SmallGates(scene);
    this.bonus = new BonusGates(scene);
    this.block = new Block(scene);
    this.boss = new Boss(scene);
    this.fx = new FX(scene, enemyGeo, launcherGeo);

    this.onCollect = (x, z, v) => {
      const added = this.player.add(v);
      if (added > 0) {
        this.ui.popup('+' + v, x, 2.4, z, v > 1 ? 'big' : '');
        this.fx.puff(x, 1, z, v > 1 ? 0xff7fd0 : 0x8dff7a, v > 1 ? 14 : 6, 2.2, v > 1 ? 1.6 : 1);
        this.audio.play(v > 1 ? 'bonus' : 'gate', 1 + Math.min(this.player.n, 37) * 0.006);
      } else if (this.time - this.lastMax > 2) {
        this.lastMax = this.time;
        this.ui.popup('MAX', x, 2.4, z, '');
      }
    };

    this.loadLevel(0);
    this.state = 'intro';
  }

  // ------------------------------------------------------------- world
  buildWorld() {
    const scene = this.scene;
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(FOG_COLOR, 70, 165);

    // bright neutral daylight: soft sky fill + one strong sun that casts the shadow map
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6e64a8, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 2.7);
    sun.target.position.set(0, 0, -30);
    sun.position.copy(SUN_DIR).multiplyScalar(45).add(sun.target.position);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; // fitted tightly to the visible runway (x +-7, z +6..-70)
    sc.left = -9; sc.right = 9; sc.top = 38; sc.bottom = -38; sc.near = 5; sc.far = 95;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // runway deck: completely static in world space (no texture scrolling); receives shadows
    const runwayTex = runwayTexture();
    runwayTex.repeat.set(1, RUNWAY_LEN / RUNWAY_TILE);
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.runwayHalf * 2, RUNWAY_LEN),
      new THREE.MeshLambertMaterial({ map: runwayTex }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, 0, 20 - RUNWAY_LEN / 2);
    top.receiveShadow = true;
    scene.add(top);

    // deck body, round edge rails and the two lane dividers: one static merged mesh
    const deck = new THREE.Mesh(
      deckGeometry(RUNWAY_LEN, 20 - RUNWAY_LEN / 2, WORLD.dividerX, WORLD.dividerStart, WORLD.dividerEnd),
      new THREE.MeshPhongMaterial({ vertexColors: true, emissive: 0x140c30, shininess: 40, specular: 0x222222 }),
    );
    deck.castShadow = true;
    scene.add(deck);

    // cloud sea far below (static)
    const seaTex = cloudSeaTexture();
    seaTex.repeat.set(5, 5);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshBasicMaterial({ map: seaTex }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -22, -120);
    scene.add(sea);

    // puffy clouds (static, written once)
    const cg = new THREE.IcosahedronGeometry(1, 2);
    const clouds = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ color: 0xffd9ea }), CLOUDS);
    const a = clouds.instanceMatrix.array;
    for (let i = 0; i < CLOUDS; i++) {
      const side = i % 2 ? 1 : -1;
      writeTS(a, i, side * randRange(9, 34), randRange(-14, -5), randRange(-200, 25), randRange(2.5, 6), randRange(1.2, 2.2), randRange(2, 4.5));
    }
    clouds.instanceMatrix.needsUpdate = true;
    clouds.computeBoundingSphere();
    scene.add(clouds);
  }

  // ------------------------------------------------------------- levels
  /** called from main.js on resize: HUD bottom edge in NDC (the boss fight must stay below it) */
  onResize(hudNdcY) {
    this.boss.hudNdcY = hudNdcY;
    if (this.state === 'intro' && this.boss.alive && this.boss.hp === this.boss.maxHp) {
      this.boss.z = this.boss.startZ(this.camera, this.level.boss.scale);
      this.boss.update(0, 0, this.player.x, this.camera);
    }
  }

  bossFootprint() {
    return 1.15 * this.level.boss.scale;
  }

  loadLevel(idx) {
    this.levelIndex = idx;
    const L = (this.level = LEVELS[idx]);
    this.units.clear();
    this.fx.clear();
    this.ui.clearPopups();
    this.player.reset(L.startLaunchers);
    this.gates.setup(WORLD.leftLaneX, L.gates.start, L.gates.end, L.gates.spacing);
    this.horde.setup(L.horde);
    this.block.setup(L.block, WORLD.rightLaneX);
    if (L.block) this.bonus.setup(L.block.bonus, WORLD.rightLaneX, L.block.z - 3.4);
    else this.bonus.clear();
    this.boss.setup(L.boss, this.boss.startZ(this.camera, L.boss.scale));
    this.boss.update(0, 0, this.player.x, this.camera);
    this.kills = 0;
    this.stateTime = 0;
    this.timeScale = 1;
    this.shake = 0;
    this.player.firing = false;
    this.progress = this.ui.setProgress(0, this.horde.total);
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
    const n = LEVELS.length;
    if (s === 'playing') this.ui.showPlaying(this.levelIndex + 1, n);
    else if (s === 'endCard') this.ui.showEnd(this.levelIndex + 1, n);
    else if (s === 'final') this.ui.showFinal();
    else if (s === 'fail') this.ui.showFail();
    else if (s === 'intro') this.ui.showIntro();
  }

  start() {
    if (this.state === 'intro') this.setState('playing');
  }

  continueNext() {
    if (this.state !== 'endCard') return;
    this.loadLevel(Math.min(this.levelIndex + 1, LEVELS.length - 1));
    this.setState('playing');
  }

  retry() {
    this.loadLevel(this.levelIndex);
    this.setState('playing');
  }

  replay() {
    this.loadLevel(0);
    this.setState('playing');
  }

  /** debug: instantly kill the boss of the current level */
  skip() {
    if (this.state === 'playing' || this.state === 'intro') {
      if (this.state === 'intro') this.setState('playing');
      this.boss.hp = 0;
    }
  }

  forceFail() {
    if (this.state === 'playing') this.beginFail();
  }

  beginFail() {
    this.state = 'failing';
    this.stateTime = 0;
    this.player.firing = false;
    this.audio.play('fail');
  }

  bossDown() {
    this.boss.startDeath();
    this.timeScale = 0.45; // brief slow motion while it topples
    this.shake = 0.35;
    this.audio.play('bossDeath');
    this.ui.popup('BOSS DOWN!', this.boss.x, 4, this.boss.z, 'big');
  }

  finishWin() {
    this.boss.die(this.fx);
    this.shake = 0.5;
    this.timeScale = 1;
    const h = this.horde; // clear stragglers (only possible if the boss fell first)
    for (let i = 0; i < h.count; i++) {
      if (!h.dead[i]) { h.dead[i] = 1; this.fx.puff(h.x[i], 0.4, h.z[i], 0xb48cff, 1, 2); }
    }
    h.removed += h.reserve;
    h.reserve = 0;
    this.player.firing = false;
    this.state = 'levelWin';
    this.stateTime = 0;
    this.audio.play('win');
  }

  // ------------------------------------------------------------- frame
  update(rawDt) {
    this.frame++;
    const dt = rawDt * this.timeScale;
    this.time += dt;
    this.stateTime += rawDt;
    this.shake = Math.max(0, this.shake - rawDt * 1.2);
    const L = this.level;
    const st = this.state;
    const active = st === 'playing';

    if (this.autoplay !== false && this.autoplay != null && (active || st === 'intro')) this.autoDrive();

    // nothing scrolls: buffs, pillar, horde and boss walk toward the static player
    const buff = active ? L.buffSpeed : 0;
    const march = active ? L.horde.march : 0;

    this.player.firing = this.fireEnabled && active && !this.boss.dying;
    this.player.update(dt, this.time, this.units, L.fireRate);
    if (this.player.shots > 0) this.audio.play('shot', 0.95 + Math.min(this.player.n, 37) * 0.012);
    this.units.move(dt, WORLD.unitSpeed, this.unitMaxZ);

    const collect = active ? this.onCollect : noop;
    this.gates.update(dt, buff, this.player, collect);
    this.bonus.update(dt, buff, this.player, collect);
    const bossBlocks = this.boss.alive && !this.boss.dying;
    this.horde.move(dt, march, this.player.x, this.boss.x, this.boss.z, bossBlocks ? this.bossFootprint() : 0);

    const boss = this.boss;
    // the boss wades down the middle of the column from the start (always in view) and is the
    // level's clock: it must fall before it reaches the player line
    const bv = active && boss.alive && !boss.dying ? boss.speed : 0;
    if (boss.update(dt, bv, this.player.x, this.camera)) this.finishWin();
    if (active && boss.alive && boss.onScreen && !boss.entered) {
      boss.entered = true;
      this.audio.play('bossEnter');
    }

    if (active || st === 'levelWin' || st === 'failing') this.collide(dt, march);
    // labels refresh after collisions so numbers change on the frame of contact
    boss.refreshBar(this.camera);
    this.block.refreshLabel(this.camera);

    if (active) {
      this.checkThreats();
      if (this.block.active) {
        if (this.block.hp <= 0) {
          this.block.shatter(this.fx);
          this.bonus.reveal();
          this.ui.popup('SMASHED!', this.block.x, 4.5, this.block.z, 'big');
          this.audio.play('shatter');
        } else if (this.block.z > -2) {
          this.block.shatter(this.fx);
          this.bonus.discard();
        }
      }
      if (this.state === 'playing' && boss.alive && !boss.dying && boss.hp <= 0) this.bossDown();
    }
    this.block.update(dt, buff, this.camera);

    // state timers
    if (this.state === 'levelWin' && this.stateTime > 1.5) {
      this.setState(this.levelIndex >= LEVELS.length - 1 ? 'final' : 'endCard');
    } else if (this.state === 'failing' && this.stateTime > 0.9) {
      this.setState('fail');
    }

    this.units.compact();
    this.horde.compact();
    this.progress = this.ui.setProgress(this.horde.removed, this.horde.total);
    this.fx.update(dt, 0);

    this.units.render();
    this.horde.render();
    this.gates.render(this.camera);
    this.bonus.render(this.camera);
    this.ui.update(rawDt, this.camera, this.player);
  }

  collide(dt, enemySpeed) {
    const u = this.units;
    const h = this.horde;
    h.buildBuckets();
    const head = h.head;
    const next = h.next;
    const hx = h.x, hz = h.z, hd = h.dead;
    const ux = u.x, uz = u.z, ud = u.dead;
    // contact when the unit's front touches the enemy's front (drawn radii) plus the distance
    // both moved this frame, so fast units never tunnel through a target
    const win = HIT_R + (WORLD.unitSpeed + enemySpeed) * dt;
    const block = this.block;
    const boss = this.boss;
    const fx = this.fx;
    let kills = 0, blockHits = 0, bossHits = 0;
    for (let i = 0; i < u.count; i++) {
      if (ud[i]) continue;
      const x = ux[i];
      const z = uz[i];
      const r = Math.floor((z - ZMIN) / ROW);
      let hit = false;
      for (let rr = r - 1; rr <= r + 2 && !hit; rr++) {
        if (rr < 0 || rr >= NROWS) continue;
        for (let e = head[rr]; e !== -1; e = next[e]) {
          if (hd[e]) continue;
          const dx = hx[e] - x;
          if (dx > HIT_R || dx < -HIT_R) continue;
          const dz = hz[e] - z;
          if (dz > win || dz < -HIT_R) continue;
          hd[e] = 1;
          ud[i] = 1;
          hit = true;
          kills++;
          fx.enemyDeath(hx[e], hz[e], ENEMY_SCALE);
          if ((i & 3) === 0) fx.puff(x, 0.4, z, 0x7ff5e4, 1, 1.2, 0.8); // teal splash
          break;
        }
      }
      if (hit) continue;
      if (block.hits(x, z)) {
        ud[i] = 1;
        block.damage(1);
        blockHits++;
        if ((i & 1) === 0) fx.puff(x, 0.8 + (i % 5) * 0.3, block.z + 1.1, 0xb9a8ff, 1, 1.4);
        continue;
      }
      if (boss.hits(x, z)) {
        ud[i] = 1;
        boss.damage(1);
        bossHits++;
        if ((i & 1) === 0) fx.puff(x, 0.6 + (i % 7) * 0.35 * boss.scale, boss.front, 0xffb066, 1, 1.6);
      }
    }
    this.kills += kills;
    if (bossHits) this.bossHitFrame = this.frame;
    if (kills) this.audio.play('pop', 0.85 + Math.random() * 0.35);
    if (blockHits) this.audio.play('blockHit', 0.9 + Math.random() * 0.2);
    if (bossHits) this.audio.play('bossHit', 0.9 + Math.random() * 0.2);
  }

  checkThreats() {
    const h = this.horde;
    const p = this.player;
    const line = p.z + p.front - 0.1;
    for (let i = 0; i < h.count; i++) {
      if (h.dead[i] || h.z[i] < line) continue;
      h.dead[i] = 1;
      this.fx.puff(h.x[i], 0.4, h.z[i], 0xff5c7a, 4, 2);
      if (p.n > 0) {
        p.remove();
        this.fx.launcherLost(p.lostX, p.lostZ, 1.25);
        this.ui.popup('-1', p.lostX, 2, p.lostZ, 'bad');
        this.audio.play('lost');
      }
      if (p.n <= 0) {
        this.beginFail();
        return;
      }
    }
    if (this.boss.alive && !this.boss.dying && this.boss.front >= p.z + p.front) {
      this.fx.puff(p.x, 0.5, p.z, 0xff5c7a, 20, 3);
      p.n = 0;
      this.beginFail();
    }
  }

  /** simple bot used by the debug hook: hold centre-left, dip right for the block / bonus gates */
  autoDrive() {
    let x = -2;
    if (this.autoplay === 'smart' || this.autoplay === 'collect') {
      // keep the cluster's left edge on the +1 gates, cover as much of the centre lane as possible
      const reach = 1.5 * WORLD.laneScale + this.player.halfW - 0.3;
      x = Math.max(-2.4, Math.min(0.6, WORLD.leftLaneX + reach));
    }
    if (this.autoplay === 'smart') {
      const b = this.block;
      let front = -99;
      for (let i = 0; i < this.horde.count; i++) if (this.horde.z[i] > front) front = this.horde.z[i];
      if (b.active && b.z > -60 && b.z < -8 && front < -8) x = 3.4;
      for (let i = 0; i < this.bonus.n; i++) {
        if (this.bonus.state[i] === 0 && this.bonus.z[i] > -16) x = this.bonus.x[i] - 0.6;
      }
    } else if (typeof this.autoplay === 'number') x = this.autoplay;
    this.player.targetX = x;
  }

  stats() {
    let front = -999;
    for (let i = 0; i < this.horde.count; i++) if (this.horde.z[i] > front) front = this.horde.z[i];
    return {
      state: this.state,
      level: this.levelIndex + 1,
      launchers: this.player.n,
      units: this.units.count,
      unitsPeak: this.units.peak,
      enemies: this.horde.count,
      enemiesTotal: this.horde.total,
      reserve: this.horde.reserve,
      removed: this.horde.removed,
      progress: this.progress,
      hordeFront: +front.toFixed(2),
      fx: this.fx.puffs.count + this.fx.debris.count + this.fx.dying.count + this.fx.wrecks.count,
      dying: this.fx.dying.count,
      bossHp: this.boss.hp,
      bossAlive: this.boss.alive,
      bossZ: +this.boss.z.toFixed(2),
      blockHp: this.block.active ? this.block.hp : null,
      kills: this.kills,
      playerX: +this.player.x.toFixed(2),
      time: +this.stateTime.toFixed(2),
    };
  }
}

function noop() {}
