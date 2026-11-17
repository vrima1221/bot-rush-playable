// Original synthesized sound effects (WebAudio). No audio files: every sound is
// rendered into a Float32Array at start-up and turned into an AudioBuffer once the
// AudioContext exists (created inside the first pointerdown, as browsers require).

export const MUSIC_ENABLED = true;

const SR = 44100;
const MAX_VOICES = 12;
const TAU = Math.PI * 2;

let seed = 99991;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 1073741823.5 - 1);

function synth(dur, fn) {
  const n = Math.floor(dur * SR);
  const a = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const r = fn(t, i / n, ph);
    a[i] = r.v;
    ph = r.ph;
  }
  return a;
}

// tiny helpers returning {v, ph} so oscillators keep continuous phase through sweeps
const out = { v: 0, ph: 0 };
function osc(ph, freq, shape) {
  const p = ph + freq / SR;
  const f = p - Math.floor(p);
  let v;
  if (shape === 1) v = f < 0.5 ? 1 : -1; // square
  else if (shape === 2) v = 1 - 4 * Math.abs(f - 0.5); // triangle
  else if (shape === 3) v = 2 * f - 1; // saw
  else v = Math.sin(f * TAU);
  out.ph = p;
  out.v = v;
  return out;
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const lerp = (a, b, k) => a + (b - a) * k;

function notes(seq, step, shape, decay, gain) {
  // seq: array of frequencies (0 = rest)
  const dur = seq.length * step + decay * 4;
  return synth(dur, (t) => {
    let v = 0;
    for (let k = 0; k < seq.length; k++) {
      const t0 = k * step;
      if (!seq[k] || t < t0) continue;
      const tt = t - t0;
      const f = seq[k];
      const ph = tt * f;
      const fr = ph - Math.floor(ph);
      const w = shape === 2 ? 1 - 4 * Math.abs(fr - 0.5) : Math.sin(fr * TAU);
      v += w * env(tt, 0.006, decay) * 0.5 + Math.sin(fr * TAU * 2) * env(tt, 0.004, decay * 0.5) * 0.15;
    }
    return { v: v * gain, ph: 0 };
  });
}

function buildBank() {
  const B = {};
  // shot: soft plastic "pop" with a quick downward chirp
  B.shot = synth(0.07, (t, k, ph) => {
    const o = osc(ph, lerp(1100, 380, k), 0);
    return { v: o.v * env(t, 0.002, 0.018) * 0.5, ph: o.ph };
  });
  // enemy pop: bubbly upward blip + click
  B.pop = synth(0.1, (t, k, ph) => {
    const o = osc(ph, lerp(260, 820, Math.sqrt(k)), 0);
    return { v: (o.v * 0.7 + noise() * 0.25 * env(t, 0.001, 0.006)) * env(t, 0.002, 0.03) * 0.6, ph: o.ph };
  });
  B.gate = notes([784, 1175], 0.06, 2, 0.08, 0.6);
  B.bonus = notes([523, 659, 784, 1047, 1319], 0.055, 2, 0.12, 0.55);
  // pillar hit: dull crystal knock
  B.blockHit = synth(0.09, (t, k, ph) => {
    const o = osc(ph, lerp(520, 300, k), 2);
    return { v: (o.v * 0.6 + noise() * 0.3) * env(t, 0.001, 0.02) * 0.55, ph: o.ph };
  });
  // pillar shatter: filtered noise burst + glassy pings
  let lp = 0;
  B.shatter = synth(0.9, (t) => {
    lp += (noise() - lp) * 0.25;
    let v = lp * env(t, 0.003, 0.18) * 1.2;
    v += Math.sin(t * TAU * 2350) * env(t, 0.002, 0.12) * 0.15;
    v += Math.sin(t * TAU * 3120) * env(Math.max(0, t - 0.05), 0.002, 0.1) * (t > 0.05 ? 0.12 : 0);
    v += Math.sin(t * TAU * 1870) * env(Math.max(0, t - 0.11), 0.002, 0.15) * (t > 0.11 ? 0.12 : 0);
    return { v, ph: 0 };
  });
  // boss hit: short low thump
  B.bossHit = synth(0.1, (t, k, ph) => {
    const o = osc(ph, lerp(150, 70, k), 0);
    return { v: (o.v + noise() * 0.15) * env(t, 0.002, 0.03) * 0.8, ph: o.ph };
  });
  // boss entrance: low wobbling growl
  B.bossEnter = synth(1.0, (t, k, ph) => {
    const o = osc(ph, 62 + Math.sin(t * TAU * 7) * 6, 3);
    let lpv = o.v * 0.6 + noise() * 0.12;
    return { v: lpv * Math.min(1, t / 0.08) * (1 - k) * 0.5, ph: o.ph };
  });
  // boss death: falling boom + rumble
  let lp2 = 0;
  B.bossDeath = synth(1.3, (t, k, ph) => {
    const o = osc(ph, lerp(130, 32, Math.sqrt(k)), 0);
    lp2 += (noise() - lp2) * 0.08;
    return { v: (o.v * 0.8 + lp2 * 1.5) * env(t, 0.004, 0.45) * 0.8, ph: o.ph };
  });
  // launcher lost: descending "bwomp"
  B.lost = synth(0.28, (t, k, ph) => {
    const o = osc(ph, lerp(420, 140, k), 1);
    return { v: o.v * env(t, 0.003, 0.09) * 0.22, ph: o.ph };
  });
  B.win = notes([523, 659, 784, 0, 1047, 1047], 0.11, 2, 0.22, 0.5);
  B.fail = notes([440, 392, 330, 262], 0.16, 2, 0.25, 0.45);
  B.click = synth(0.03, (t, k, ph) => {
    const o = osc(ph, 1900, 0);
    return { v: o.v * env(t, 0.001, 0.006) * 0.4, ph: o.ph };
  });
  if (MUSIC_ENABLED) {
    // 4 s loop @ 120 bpm: soft bass line + muted plucks + light hats
    const bass = [110, 110, 131, 131, 98, 98, 123, 123];
    const pluck = [440, 0, 523, 0, 392, 0, 494, 587, 440, 0, 523, 659, 392, 0, 494, 0];
    B.music = synth(4.0, (t) => {
      const beat = t * 2; // 2 beats / s
      const bi = Math.floor(beat) % 8;
      const bt = (beat - Math.floor(beat)) / 2;
      let v = Math.sin(TAU * bass[bi] * t) * env(bt, 0.01, 0.25) * 0.35;
      const e8 = t * 4;
      const pi = Math.floor(e8) % 16;
      const pt = (e8 - Math.floor(e8)) / 4;
      if (pluck[pi]) v += Math.sin(TAU * pluck[pi] * t) * env(pt, 0.004, 0.06) * 0.12;
      v += noise() * env(pt, 0.001, 0.01) * 0.05;
      return { v, ph: 0 };
    });
  }
  return B;
}

// minimum seconds between two plays of the same type (keeps hundreds of kills/s cheap)
const THROTTLE = {
  shot: 1 / 14, pop: 1 / 14, gate: 0.05, bonus: 0.2, blockHit: 1 / 12, shatter: 0.3, bossHit: 1 / 12,
  bossEnter: 1, bossDeath: 1, lost: 1 / 10, win: 1, fail: 1, click: 0.05,
};
const VOLUME = {
  shot: 0.16, pop: 0.32, gate: 0.5, bonus: 0.6, blockHit: 0.4, shatter: 0.8, bossHit: 0.45,
  bossEnter: 0.7, bossDeath: 0.9, lost: 0.6, win: 0.7, fail: 0.7, click: 0.4,
};

export class Audio {
  constructor() {
    this.bank = buildBank(); // Float32 data, rendered once at start-up
    this.ctx = null;
    this.buffers = {};
    this.master = null;
    this.muted = false;
    this.hidden = false;
    this.mraidSilent = false;
    this.last = {};
    this.counts = {};
    this.dropped = 0; // plays refused by the voice cap
    this.voiceEnd = new Float64Array(MAX_VOICES);
    this.maxVoicesSeen = 0;
    for (const k in THROTTLE) { this.last[k] = -1; this.counts[k] = 0; }
    this.musicSrc = null;
  }

  /** call from inside a pointerdown handler */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const k in this.bank) {
        const data = this.bank[k];
        const b = this.ctx.createBuffer(1, data.length, SR);
        b.copyToChannel(data, 0);
        this.buffers[k] = b;
      }
      this.applyGain();
      if (MUSIC_ENABLED && this.buffers.music) {
        const g = this.ctx.createGain();
        g.gain.value = 0.22;
        g.connect(this.master);
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffers.music;
        src.loop = true;
        src.connect(g);
        src.start();
        this.musicSrc = src;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyGain() {
    if (!this.master) return;
    const on = !(this.muted || this.hidden || this.mraidSilent);
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
  }

  setMuted(v) { this.muted = v; this.applyGain(); }
  setHidden(v) { this.hidden = v; this.applyGain(); }
  setMraidSilent(v) { this.mraidSilent = v; this.applyGain(); }

  get gain() {
    return this.master ? this.master.gain.value : 0;
  }

  play(type, rate = 1, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return false;
    const now = ctx.currentTime;
    if (now - this.last[type] < THROTTLE[type]) return false;
    // global voice cap
    let slot = -1;
    let active = 0;
    for (let i = 0; i < MAX_VOICES; i++) {
      if (this.voiceEnd[i] > now) active++;
      else if (slot < 0) slot = i;
    }
    if (slot < 0) { this.dropped++; return false; }
    if (active + 1 > this.maxVoicesSeen) this.maxVoicesSeen = active + 1;
    const buf = this.buffers[type];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    let node = src;
    const v = VOLUME[type] * vol;
    if (v !== 1) {
      const g = ctx.createGain();
      g.gain.value = v;
      src.connect(g);
      node = g;
    }
    node.connect(this.master);
    src.start(now);
    this.voiceEnd[slot] = now + buf.duration / rate;
    this.last[type] = now;
    this.counts[type]++;
    return true;
  }

  activeVoices() {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime;
    let n = 0;
    for (let i = 0; i < MAX_VOICES; i++) if (this.voiceEnd[i] > now) n++;
    return n;
  }
}
