// A ready-made little park shown behind the main menu.
import { S, newGame, placePath, placeRide, placeStall, placeScenery, terrain } from './world.js';
import { startCoaster, addPiece, autoFinish } from './coaster.js';
import { SCN, N } from './data.js';
import { tick, coasterCap } from './sim.js';

export function buildDemo() {
  newGame('sandbox');
  S.demo = true;
  // the layout below is written for a 40 x 40 map; shift it to sit in front of the entrance
  const ox = S.ent.x - 20, oy = N - 40;
  const path = (x0, y0, x1, y1) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) placePath(x + ox, y + oy);
  };
  path(20, 22, 20, 35); path(13, 30, 27, 30); path(13, 25, 27, 25); path(13, 25, 13, 30); path(27, 22, 27, 30); path(20, 22, 27, 22); path(13, 21, 13, 25); path(13, 21, 17, 21);
  const rides = [['carousel', 21, 31], ['teacups', 17, 31], ['ferris', 21, 26], ['swing', 14, 26], ['pirate', 15, 24], ['castle', 24, 31],
    ['drop', 28, 26], ['bumper', 23, 27], ['haunted', 10, 26]];
  for (const [id, x, y] of rides) { const q = placeRide(id, x + ox, y + oy, 0); if (!q.ok && typeof process !== 'undefined') console.log('demo ride failed', id, q.why); }
  for (const [id, x, y] of [['burger', 19, 28], ['drinks', 19, 27], ['icecream', 21, 24], ['toilet', 19, 33], ['gift', 26, 29]]) placeStall(id, x + ox, y + oy);
  const sc = [[18, 26, 'fountain'], [12, 31, 'oak'], [14, 31, 'flowers'], [15, 31, 'flowers'], [28, 31, 'palm'], [28, 24, 'palm'], [19, 23, 'bench'],
    [21, 34, 'lamp'], [19, 35, 'lamp'], [26, 24, 'bush'], [12, 24, 'pine'], [24, 29, 'bench'], [16, 29, 'statue'], [22, 29, 'flowers'], [18, 24, 'lamp']];
  for (const [x, y, id] of sc) placeScenery(SCN[id], x + ox, y + oy);
  // a steel coaster behind the plaza
  const r = startCoaster('steel', 14 + ox, 20 + oy, 0);
  if (r.ok) {
    const c = r.obj;
    const seq = [['s', 1, 1, 0, 9], ['s'], ['r', 0, 0, 1], ['r', 0, 0, 1], ['s', -2, 0, 0, 5], ['s', 0], ['loop'], ['s', 1, 0, 0, 3], ['s', -1, 0, 0, 3],
      ['l', 0, 0, 1], ['l', 0, 0, 1], ['s', 1, 0, 0, 2], ['s', -1, 0, 0, 2], ['s']];
    for (const [t, slope = 0, chain = 0, bank = 0, n = 1] of seq) for (let i = 0; i < n; i++) addPiece(c, { t, slope, chain: !!chain, bank: !!bank });
    autoFinish(c);
    c.capacity = coasterCap(c);
    c.open = c.closed && c.sim.ok;
  }
  S.open = true; S.fee = 5; S.rating = 800;
  for (let i = 0; i < 1500; i++) tick(0.1);
  S.speed = 1;
}
