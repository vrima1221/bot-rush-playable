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
// column advances. The boss wades down the middle of the column from a start depth derived
// from the camera (its HP bar must sit below the HUD) and is the level's clock.

export const LEVELS = [
  {
    id: 1,
    fireRate: 7.5, // units per launcher per second
    startLaunchers: 4,
    buffSpeed: 3.2, // gates / pillar / bonus gates approach speed
    gates: { start: -6, end: -170, spacing: 4.0 },
    horde: { total: 500, cols: 6, spacing: 0.62, z: -13, march: 0.5, rush: 1.0, squeeze: 0.55 },
    block: null,
    boss: { hp: 2000, speed: 0.17, scale: 1.0 },
  },
  {
    id: 2,
    fireRate: 6.5,
    startLaunchers: 4,
    buffSpeed: 3.2,
    gates: { start: -6, end: -190, spacing: 4.0 },
    horde: { total: 900, cols: 8, spacing: 0.56, z: -13, march: 0.8, rush: 1.8 },
    block: { hp: 50, z: -26, bonus: [6, 8] },
    boss: { hp: 2600, speed: 0.22, scale: 1.15 },
  },
  {
    id: 3,
    fireRate: 6.5,
    startLaunchers: 4,
    buffSpeed: 3.2,
    gates: { start: -6, end: -210, spacing: 4.2 },
    horde: { total: 1400, cols: 8, spacing: 0.54, z: -13, march: 0.8, rush: 2.6 },
    block: { hp: 80, z: -26, bonus: [8, 12] },
    boss: { hp: 3200, speed: 0.22, scale: 1.3 },
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
};
