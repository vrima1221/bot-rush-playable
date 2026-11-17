// DOM overlay: HUD, tutorial hand, end cards, floating popups.
import * as THREE from 'three';
import { openStore } from './cta.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const POPUPS = 16;

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      hud: $('hud'), levelPill: $('levelPill'), badge: $('launcherBadge'), intro: $('intro'),
      end: $('endCard'), endTitle: $('endTitle'), endText: $('endText'),
      final: $('finalCard'), fail: $('failCard'), popups: $('popups'),
    };
    this.width = 1;
    this.height = 1;
    const cta = (e) => { e.stopPropagation(); this.h.onStore(); };
    $('hudCta').addEventListener('click', cta);
    this.el.progress = $('progress');
    this.el.progressFill = $('progressFill');
    this.el.progressBoss = $('progressBoss');
    this.lastProgress = -1;
    this.lastLit = false;
    const mute = $('muteBtn');
    mute.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = this.h.onMute();
      $('muteCross').style.display = m ? '' : 'none';
      $('muteWaves').style.display = m ? 'none' : '';
    });
    $('endDownload').addEventListener('click', cta);
    $('failDownload').addEventListener('click', cta);
    $('finalDownload').addEventListener('click', cta);
    $('endContinue').addEventListener('click', (e) => { e.stopPropagation(); this.h.onContinue(); });
    $('failRetry').addEventListener('click', (e) => { e.stopPropagation(); this.h.onRetry(); });
    $('finalReplay').addEventListener('click', (e) => { e.stopPropagation(); this.h.onReplay(); });
    // tapping anywhere on the final card opens the store
    this.el.final.addEventListener('click', () => this.h.onStore());
    for (const id of ['hudCta', 'muteBtn', 'endCard', 'finalCard', 'failCard']) {
      $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    this.pool = [];
    for (let i = 0; i < POPUPS; i++) {
      const d = document.createElement('div');
      d.className = 'popup';
      d.style.display = 'none';
      this.el.popups.appendChild(d);
      this.pool.push({ el: d, life: 0, x: 0, y: 0, z: 0, cls: '', w: 0 });
    }
    this.cursor = 0;
    this.lastBadge = -1;
    this.badgeX = -9999;
    this.badgeY = -9999;
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
  }

  hideAll() {
    for (const k of ['intro', 'end', 'final', 'fail']) this.el[k].classList.add('hidden');
  }

  showIntro() {
    this.hideAll();
    this.el.intro.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.progress.classList.add('hidden');
    this.el.badge.classList.add('hidden');
  }

  /** horde progress: removed / total; boss marker lights up when the horde (bosses included) is gone */
  setProgress(removed, total) {
    const f = total > 0 ? Math.min(1, removed / total) : 0;
    const q = Math.round(f * 1000); // only touch the DOM when the visible value changes
    if (q !== this.lastProgress) {
      this.lastProgress = q;
      this.el.progressFill.style.transform = 'scaleX(' + (q / 1000) + ')';
    }
    const lit = f >= 1;
    if (lit !== this.lastLit) {
      this.lastLit = lit;
      this.el.progressBoss.classList.toggle('lit', lit);
    }
    return q / 10;
  }

  showPlaying(level, total) {
    this.hideAll();
    this.el.hud.classList.remove('hidden');
    this.el.progress.classList.remove('hidden');
    this.el.badge.classList.remove('hidden');
    this.el.levelPill.innerHTML = `LEVEL <b>${level}</b>/${total}`;
  }

  showEnd(level, total) {
    this.hideAll();
    this.el.badge.classList.add('hidden');
    this.el.endTitle.innerHTML = `LEVEL ${level}<br />CLEARED!`;
    this.el.endText.textContent = level < total ? `Next: level ${level + 1} with a bigger horde and more bosses.` : '';
    this.el.end.classList.remove('hidden');
  }

  showFinal() {
    this.hideAll();
    this.el.badge.classList.add('hidden');
    this.el.final.classList.remove('hidden');
  }

  showFail() {
    this.hideAll();
    this.el.badge.classList.add('hidden');
    this.el.fail.classList.remove('hidden');
  }

  popup(text, x, y, z, cls) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % POPUPS;
    p.life = 0.9;
    p.x = x; p.y = y; p.z = z;
    if (p.el.textContent !== text) p.el.textContent = text;
    if (p.cls !== cls) {
      p.el.className = 'popup ' + cls;
      p.cls = cls;
    }
    p.el.style.display = 'block';
    p.w = p.el.offsetWidth * 1.25; // measured once per spawn, used to keep text inside the frame
  }

  clearPopups() {
    for (const p of this.pool) {
      p.life = 0;
      p.el.style.display = 'none';
    }
  }

  update(dt, camera, player) {
    for (let i = 0; i < POPUPS; i++) {
      const p = this.pool[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.el.style.display = 'none'; continue; }
      p.y += dt * 2.2;
      _v.set(p.x, p.y, p.z).project(camera);
      const half = p.w / 2 + 6;
      const sx = Math.max(half, Math.min(this.width - half, (_v.x * 0.5 + 0.5) * this.width));
      const sy = (-_v.y * 0.5 + 0.5) * this.height;
      const t = p.life / 0.9;
      const s = t > 0.8 ? 1 + (t - 0.8) * 1.25 : 1;
      p.el.style.transform = `translate(${sx | 0}px, ${sy | 0}px) translate(-50%, -50%) scale(${s.toFixed(2)})`;
      p.el.style.opacity = t < 0.3 ? (t / 0.3).toFixed(2) : '1';
    }
    // launcher count badge under the cluster
    if (player.n !== this.lastBadge) {
      this.lastBadge = player.n;
      this.el.badge.textContent = 'x' + player.n;
    }
    _v.set(player.x, 0, player.z + player.back + 0.4).project(camera);
    const bx = ((_v.x * 0.5 + 0.5) * this.width) | 0;
    const by = ((-_v.y * 0.5 + 0.5) * this.height) | 0;
    if (bx !== this.badgeX || by !== this.badgeY) {
      this.badgeX = bx;
      this.badgeY = Math.min(by, this.height - 34);
      this.el.badge.style.transform = `translate(${bx}px, ${this.badgeY}px) translate(-50%, 0)`;
    }
  }
}

export { openStore };
