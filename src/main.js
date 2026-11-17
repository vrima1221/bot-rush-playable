// Boot: renderer, portrait frame / letterbox, input, RAF loop, adaptive DPR, debug hook.
import * as THREE from 'three';
import { Game } from './game.js';
import { UI } from './ui.js';
import { openStore, storeClicks, STORE_URL } from './cta.js';
import { WORLD, LEVELS } from './levels.js';
import { Audio } from './audio.js';

const PORTRAIT_ASPECT = 9 / 16;
const MAX_FRAME_ASPECT = 0.62; // wider than this -> letterbox into a 9:16 frame
const BASE_VFOV = 58;
const HUD_PX = 88; // bottom edge of the progress bar / boss marker (px from the frame top)
const FIT_HALF_WIDTH = WORLD.runwayHalf + 0.9; // world units that must fit horizontally at the player line
const CAM_POS = new THREE.Vector3(0, 18, 5);
const CAM_TARGET = new THREE.Vector3(0, 0, -10);

const frame = document.getElementById('frame');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; // one 1024 px sun shadow map (large objects only)
renderer.shadowMap.type = THREE.PCFShadowMap;
frame.insertBefore(renderer.domElement, frame.firstChild);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_VFOV, PORTRAIT_ASPECT, 0.5, 260);
camera.position.copy(CAM_POS);
camera.lookAt(CAM_TARGET);
camera.updateMatrixWorld();

const audio = new Audio();
const click = () => audio.play('click');
const ui = new UI({
  onStore: () => { click(); openStore(); },
  onContinue: () => { click(); game.continueNext(); },
  onRetry: () => { click(); game.retry(); },
  onReplay: () => { click(); game.replay(); },
  onMute: () => { audio.setMuted(!audio.muted); return audio.muted; },
});
const game = new Game(scene, camera, ui, audio);
ui.showIntro();

// ------------------------------------------------------------------ DPR
const nativeDpr = Math.min(window.devicePixelRatio || 1, 2);
const dprSteps = [nativeDpr, 1.5, 1].filter((v, i, a) => v <= nativeDpr && a.indexOf(v) === i);
let dprIndex = 0;
renderer.setPixelRatio(dprSteps[0]);

// ------------------------------------------------------------------ resize
let frameW = 1;
let frameH = 1;
function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw / vh > MAX_FRAME_ASPECT) {
    frameH = vh;
    frameW = Math.round(vh * PORTRAIT_ASPECT);
  } else {
    frameW = vw;
    frameH = vh;
  }
  frame.style.width = frameW + 'px';
  frame.style.height = frameH + 'px';
  renderer.setSize(frameW, frameH, true);
  const aspect = frameW / frameH;
  camera.aspect = aspect;
  // keep the whole runway width visible: horizontal FOV must cover FIT_HALF_WIDTH at the player line
  const dist = CAM_POS.distanceTo(new THREE.Vector3(0, 0, WORLD.playerZ + 1));
  const needH = Math.atan(FIT_HALF_WIDTH / dist);
  const vfovForWidth = (2 * Math.atan(Math.tan(needH) / aspect) * 180) / Math.PI;
  camera.fov = Math.max(BASE_VFOV, vfovForWidth);
  camera.updateProjectionMatrix();
  ui.resize(frameW, frameH);
  // where does the top edge of the screen meet the runway? units vanish just beyond it
  camera.updateMatrixWorld();
  const ray = new THREE.Vector3(0, 0.97, 0.5).unproject(camera).sub(camera.position).normalize();
  const topZ = ray.y < -0.01 ? camera.position.z + (ray.z * camera.position.y) / -ray.y : -120;
  game.unitMaxZ = Math.max(-110, Math.min(-40, topZ - 6));
  // HUD (level pill + progress bar) occupies the top HUD_PX of the frame
  game.onResize(1 - (2 * HUD_PX) / frameH);
  // scale UI text a little on small frames
  frame.style.fontSize = Math.max(12, Math.min(18, frameW / 24)) + 'px';
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// ------------------------------------------------------------------ input
let dragging = false;
let dragStartX = 0;
let dragStartPlayer = 0;
function worldPerPixel() {
  return (WORLD.runwayHalf * 2 * 1.15) / frameW;
}
// any first touch (also on overlay buttons) unlocks audio
window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
frame.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (game.state === 'intro') game.start();
  if (game.state !== 'playing') return;
  dragging = true;
  dragStartX = e.clientX;
  dragStartPlayer = game.player.targetX;
  try { frame.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  e.preventDefault();
});
frame.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  game.player.targetX = game.player.clampX(dragStartPlayer + (e.clientX - dragStartX) * worldPerPixel());
  e.preventDefault();
});
const endDrag = () => { dragging = false; };
frame.addEventListener('pointerup', endDrag);
frame.addEventListener('pointercancel', endDrag);
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ loop
let last = 0;
let running = false;
let rafId = 0;
let frameAcc = 0;
let frameCount = 0;
let slowWindows = 0;
let warm = 0;
let avgFrameMs = 16.7;
let peakCalls = 0;

function tick(now) {
  rafId = requestAnimationFrame(tick);
  if (!last) last = now;
  const rawMs = now - last;
  last = now;
  let dt = rawMs / 1000;
  if (dt > 1 / 30) dt = 1 / 30;
  if (dt < 0) dt = 0;

  const t0 = performance.now();
  game.update(dt);
  // camera shake (boss death); no allocations
  const sh = game.shake;
  if (sh > 0) {
    camera.position.set(CAM_POS.x + (Math.random() - 0.5) * sh, CAM_POS.y + (Math.random() - 0.5) * sh, CAM_POS.z);
  } else if (camera.position.x !== CAM_POS.x || camera.position.y !== CAM_POS.y) {
    camera.position.copy(CAM_POS);
  }
  renderer.render(scene, camera);
  const calls = renderer.info.render.calls;
  if (calls > peakCalls) peakCalls = calls;
  stats.cpuMs = performance.now() - t0;

  // adaptive resolution: average frame interval over ~1 s windows
  warm += rawMs;
  if (warm > 2000 && rawMs < 250) {
    frameAcc += rawMs;
    frameCount++;
    if (frameCount >= 60) {
      avgFrameMs = frameAcc / frameCount;
      frameAcc = 0;
      frameCount = 0;
      if (avgFrameMs > 20) slowWindows++;
      else slowWindows = 0;
      if (slowWindows >= 2 && dprIndex < dprSteps.length - 1) {
        dprIndex++;
        renderer.setPixelRatio(dprSteps[dprIndex]);
        renderer.setSize(frameW, frameH, true);
        slowWindows = 0;
      }
    }
  }
}

const stats = { cpuMs: 0 };

function startLoop() {
  if (running) return;
  running = true;
  last = 0;
  rafId = requestAnimationFrame(tick);
}
function stopLoop() {
  running = false;
  cancelAnimationFrame(rafId);
}
document.addEventListener('visibilitychange', () => {
  audio.setHidden(document.hidden);
  if (document.hidden) stopLoop();
  else startLoop();
});

// MRAID: wait for ready if the container is still loading
function boot() {
  const m = window.mraid;
  if (m && typeof m.addEventListener === 'function') {
    try {
      m.addEventListener('audioVolumeChange', (v) => audio.setMraidSilent(v === 0));
      if (typeof m.getAudioVolume === 'function') audio.setMraidSilent(m.getAudioVolume() === 0);
    } catch (e) { /* MRAID < 3 */ }
  }
  if (m && typeof m.getState === 'function' && m.getState() === 'loading') {
    m.addEventListener('ready', startLoop);
  } else startLoop();
}
boot();

// ------------------------------------------------------------------ debug hook
window.__game = {
  get state() { return game.state; },
  get level() { return game.levelIndex + 1; },
  game,
  renderer,
  camera,
  scene,
  STORE_URL,
  start: () => game.start(),
  setPlayerX: (x) => { game.player.targetX = game.player.clampX(x); },
  skip: () => game.skip(),
  fail: () => game.forceFail(),
  cont: () => game.continueNext(),
  retry: () => game.retry(),
  replay: () => game.replay(),
  setAutoplay: (v) => { game.autoplay = v; },
  setFire: (v) => { game.fireEnabled = !!v; },
  storeClicks,
  levels: LEVELS, // debug: level data (balance simulation)
  audio,
  audioStats: () => ({
    state: audio.ctx ? audio.ctx.state : 'none',
    counts: { ...audio.counts },
    maxVoicesSeen: audio.maxVoicesSeen,
    dropped: audio.dropped,
    activeVoices: audio.activeVoices(),
    gain: audio.gain,
    muted: audio.muted,
    hidden: audio.hidden,
  }),
  stats: () => ({
    ...game.stats(),
    drawCalls: renderer.info.render.calls,
    peakDrawCalls: peakCalls,
    triangles: renderer.info.render.triangles,
    avgFrameMs: +avgFrameMs.toFixed(2),
    cpuMs: +stats.cpuMs.toFixed(2),
    dpr: renderer.getPixelRatio(),
    frame: [frameW, frameH],
    fov: +camera.fov.toFixed(1),
  }),
};
