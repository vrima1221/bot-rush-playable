// Level data. World units: runway is 12 wide (x -6..6), player line at z = -1,
// negative z is "up the runway". The runway is static; only gates, the pillar,
// the horde and the boss move toward the player.
// Lanes (split by two divider rails at x = +-2.6):
//   left   x -6..-2.9   : +1 gates
//   centre x -2.3..2.3  : horde + boss
//   right  x 2.9..6     : pillar block + bonus gates
//
// The horde streams in: `total` enemies, rows of `cols`, the first rows placed
// from z = `z` back to the spawn line, the rest released from a reserve as the
// column advances. Every so often a boss is embedded in the column (`bosses.at` = fraction of
// the horde released before it) and marches with it. A boss that reaches the player smashes
// `bosses.smash` launchers and dies; killing bosses does not end the level -- only clearing the
// whole horde (and every boss in it) does.

export const LEVELS = [
  {
    id: 1,
    fireRate: 7.5, // units per launcher per second
    startLaunchers: 1,
    buffSpeed: 3.2, // gates / pillar / bonus gates approach speed
    gates: { start: -6, end: -170, spacing: 4.0 },
    horde: { total: 500, cols: 6, spacing: 0.62, z: -13, march: 0.5, rush: 1.0, squeeze: 0.55 },
    block: null,
    bosses: { at: [0.35, 0.75], hp: [250, 350], scale: 0.85, smash: 3 },
  },
  {
    id: 2,
    fireRate: 6.5,
    startLaunchers: 1,
    buffSpeed: 3.2,
    gates: { start: -6, end: -190, spacing: 4.0 },
    horde: { total: 900, cols: 8, spacing: 0.56, z: -28, march: 0.8, rush: 1.8 },
    block: { hp: 50, z: -26, bonus: [6, 8] },
    bosses: { at: [0.25, 0.55, 0.85], hp: [300, 400, 500], scale: 0.9, smash: 4 },
  },
  {
    id: 3,
    fireRate: 6.5,
    startLaunchers: 1,
    buffSpeed: 3.2,
    gates: { start: -6, end: -210, spacing: 4.2 },
    horde: { total: 1400, cols: 8, spacing: 0.54, z: -28, march: 0.8, rush: 2.6 },
    block: { hp: 80, z: -26, bonus: [8, 12] },
    bosses: { at: [0.2, 0.45, 0.7, 0.92], hp: [350, 450, 550, 650], scale: 1.0, smash: 5 },
  },
];

export const WORLD = {
  runwayHalf: 6,
  playerZ: -1,
  leftLaneX: -4.45,
  rightLaneX: 4.45,
  laneScale: 0.85, // gates / pillar are scaled to fit the 3.1-wide side lanes
  dividerX: 2.6, // dividers at x = +-2.6
  dividerHalf: 0.42, // half width incl. unit radius (units are nudged out of it)
  dividerStart: -5.2, // near end (open area for the launcher cluster below this)
  dividerEnd: -200,
  hordeHalf: 2.0, // enemy centres stay within |x| <= this (centre lane)
  hordeSpawnZ: -92, // rows stream in here (beyond the visible top / in fog)
  unitSpeed: 20,
  unitMaxZ: -62, // default; main.js sets it to the top edge of the view
  maxLaunchers: 37, // full hex of radius 3
  maxBosses: 4, // boss pool size (max bosses in one level)
};
