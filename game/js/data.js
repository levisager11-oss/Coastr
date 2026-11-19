// Static game data: rides, stalls, scenery, coaster types, research, goals, achievements.

export const N = 60; // map is N x N tiles
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const MAX_TERRAIN = 8;
export const BASE_H = 2;

// Flat rides. w/h = footprint, E/I/Q = excitement / intensity / nausea, cap = riders per cycle,
// dur = ride time in seconds, run = running cost per month.
export const RIDES = {
  carousel: { w: 2, h: 2, cost: 900, run: 30, E: 2.2, I: 1.0, Q: 0.6, cap: 12, dur: 12, price: 4 },
  castle: { w: 2, h: 2, cost: 600, run: 20, E: 1.6, I: 0.8, Q: 0.3, cap: 8, dur: 10, price: 3 },
  teacups: { w: 2, h: 2, cost: 1100, run: 35, E: 2.8, I: 2.4, Q: 3.2, cap: 12, dur: 12, price: 5 },
  ferris: { w: 3, h: 1, cost: 1800, run: 45, E: 3.4, I: 1.2, Q: 0.5, cap: 16, dur: 18, price: 5.5 },
  swing: { w: 2, h: 2, cost: 2000, run: 50, E: 4.0, I: 3.6, Q: 3.0, cap: 16, dur: 13, price: 6.5 },
  pirate: { w: 3, h: 1, cost: 2400, run: 60, E: 4.6, I: 4.8, Q: 4.4, cap: 16, dur: 13, price: 7.5 },
  bumper: { w: 3, h: 3, cost: 2600, run: 60, E: 4.2, I: 3.0, Q: 1.4, cap: 12, dur: 14, price: 7 },
  haunted: { w: 3, h: 3, cost: 3200, run: 70, E: 5.2, I: 2.6, Q: 0.8, cap: 14, dur: 15, price: 8.5 },
  drop: { w: 2, h: 2, cost: 4200, run: 90, E: 6.4, I: 7.4, Q: 4.6, cap: 12, dur: 12, price: 10 },
  slide: { w: 2, h: 2, cost: 700, run: 20, E: 2.0, I: 1.2, Q: 0.8, cap: 6, dur: 8, price: 3.5 },
  maze: { w: 3, h: 3, cost: 800, run: 15, E: 2.4, I: 0.6, Q: 0.1, cap: 16, dur: 20, price: 4 },
  tower: { w: 2, h: 2, cost: 2200, run: 50, E: 3.8, I: 0.9, Q: 0.3, cap: 14, dur: 20, price: 6 },
  octopus: { w: 3, h: 3, cost: 2800, run: 65, E: 4.8, I: 4.2, Q: 4.0, cap: 16, dur: 14, price: 8 },
  tumbler: { w: 3, h: 2, cost: 3600, run: 80, E: 5.8, I: 6.4, Q: 5.6, cap: 16, dur: 13, price: 9.5 },
  slingshot: { w: 3, h: 1, cost: 4800, run: 100, E: 7.0, I: 8.2, Q: 4.2, cap: 6, dur: 9, price: 12 },
  planes: { w: 2, h: 2, cost: 1300, run: 35, E: 3.0, I: 1.6, Q: 1.2, cap: 12, dur: 13, price: 5 },
  minigolf: { w: 3, h: 3, cost: 1500, run: 25, E: 2.7, I: 0.5, Q: 0.1, cap: 12, dur: 22, price: 5 },
  funhouse: { w: 2, h: 2, cost: 1700, run: 40, E: 3.5, I: 1.9, Q: 1.0, cap: 10, dur: 14, price: 5.5 },
  cinema: { w: 3, h: 2, cost: 3000, run: 70, E: 4.9, I: 3.2, Q: 2.4, cap: 20, dur: 16, price: 8 },
  pendulum: { w: 3, h: 3, cost: 4400, run: 95, E: 6.7, I: 7.0, Q: 5.0, cap: 16, dur: 13, price: 11 },
};
// shown from gentle to wild
export const RIDE_ORDER = ['carousel', 'castle', 'slide', 'maze', 'minigolf', 'teacups', 'planes', 'ferris', 'funhouse', 'tower',
  'swing', 'bumper', 'cinema', 'haunted', 'pirate', 'octopus', 'tumbler', 'drop', 'pendulum', 'slingshot'];

// Stalls (1x1). need = which guest need they serve ('aid' takes away nausea). A price of 0 means free to use.
export const STALLS = {
  burger: { cost: 350, run: 20, price: 5, need: 'hunger' },
  drinks: { cost: 300, run: 15, price: 3.5, need: 'thirst' },
  icecream: { cost: 320, run: 15, price: 4, need: 'treat' },
  toilet: { cost: 250, run: 10, price: 0, need: 'toilet' },
  gift: { cost: 450, run: 20, price: 8, need: 'gift' },
  candy: { cost: 300, run: 15, price: 3.5, need: 'treat' },
  coffee: { cost: 380, run: 20, price: 4, need: 'thirst' },
  hats: { cost: 500, run: 20, price: 9, need: 'hat' },
  pizza: { cost: 400, run: 20, price: 6, need: 'hunger' },
  popcorn: { cost: 300, run: 15, price: 3.5, need: 'treat' },
  firstaid: { cost: 350, run: 15, price: 0, need: 'aid' },
};
export const STALL_ORDER = ['burger', 'pizza', 'drinks', 'icecream', 'candy', 'popcorn', 'coffee', 'toilet', 'firstaid', 'gift', 'hats'];

// Scenery (1x1). Index in this array is the code stored in the map. beauty feeds the park rating.
export const SCENERY = [
  null,
  { id: 'oak', cost: 25, beauty: 2 },
  { id: 'pine', cost: 25, beauty: 2 },
  { id: 'palm', cost: 35, beauty: 2 },
  { id: 'bush', cost: 12, beauty: 1 },
  { id: 'flowers', cost: 15, beauty: 2 },
  { id: 'bench', cost: 30, beauty: 1 },
  { id: 'lamp', cost: 30, beauty: 1 },
  { id: 'fountain', cost: 220, beauty: 7 },
  { id: 'statue', cost: 180, beauty: 6 },
  { id: 'rock', cost: 15, beauty: 1 },
  // added later: new entries always go at the end, because saved parks store these numbers
  { id: 'hedge', cost: 15, beauty: 1 },
  { id: 'flag', cost: 40, beauty: 2 },
  { id: 'topiary', cost: 60, beauty: 3 },
  { id: 'torch', cost: 45, beauty: 2 },
  { id: 'cactus', cost: 20, beauty: 2 },
  { id: 'snowman', cost: 40, beauty: 3 },
  { id: 'picnic', cost: 50, beauty: 2 },
  { id: 'snowpine', cost: 25, beauty: 2 },
  { id: 'birch', cost: 25, beauty: 2 },
  { id: 'cherry', cost: 40, beauty: 3 },
  { id: 'maple', cost: 35, beauty: 3 },
  { id: 'tulips', cost: 20, beauty: 2 },
  { id: 'planter', cost: 35, beauty: 2 },
  { id: 'bin', cost: 25, beauty: 0 }, // guests with rubbish in their hands use one that stands by their path
  { id: 'clock', cost: 120, beauty: 4 },
  { id: 'gazebo', cost: 260, beauty: 8 },
  { id: 'windmill', cost: 200, beauty: 6 },
  { id: 'mushroom', cost: 70, beauty: 3 },
  { id: 'lantern', cost: 45, beauty: 2 },
  { id: 'fence', cost: 12, beauty: 1 },
];
// the order in the build menu
export const SCENERY_ORDER = ['oak', 'birch', 'pine', 'snowpine', 'cherry', 'maple', 'palm', 'cactus', 'bush', 'hedge', 'topiary', 'flowers',
  'tulips', 'planter', 'rock', 'fence', 'bench', 'bin', 'picnic', 'lamp', 'lantern', 'torch', 'flag', 'clock', 'mushroom', 'fountain',
  'statue', 'windmill', 'gazebo', 'snowman'];
export const SCN = Object.fromEntries(SCENERY.map((s, i) => (s ? [s.id, i] : ['none', 0])));

// Coaster types. maxH = how many height levels above the station the track may climb.
// launch = speed (m/s) the station fires the train out at; such a coaster has no lift chain.
export const COASTERS = {
  mini: {
    maxH: 6, steep: false, loop: false, bank: false, cork: false, piece: 40, station: 300, cars: 4, cap: 8,
    mu: 0.02, rail: '#ffd23f', tie: '#e8553f', sup: '#f4f6fa', car: '#e8553f', run: 40,
  },
  wood: {
    maxH: 12, steep: true, loop: false, bank: false, cork: false, piece: 65, station: 500, cars: 4, cap: 16,
    mu: 0.022, rail: '#7a4a22', tie: '#b98550', sup: '#d9b383', car: '#3b8ed0', run: 70,
  },
  steel: {
    maxH: 20, steep: true, loop: true, bank: true, cork: true, piece: 90, station: 700, cars: 4, cap: 16,
    mu: 0.012, rail: '#ef476f', tie: '#c2334f', sup: '#dfe7f1', car: '#ffd23f', run: 100,
  },
  launch: {
    maxH: 26, steep: true, loop: true, bank: true, cork: true, piece: 110, station: 1100, cars: 5, cap: 20,
    mu: 0.011, rail: '#2ec4b6', tie: '#1f8f85', sup: '#e9edf3', car: '#ff70a6', run: 130, launch: 23,
  },
};
export const COASTER_ORDER = ['mini', 'wood', 'steel', 'launch'];
// Ready-made coasters, written as design words (see pieceWord in coaster.js). e = excitement on flat
// ground, w x h = the room they need when the station faces +x. All of them close on flat ground.
export const DESIGNS = {
  hopper: { ctype: 'mini', e: 3.4, w: 11, h: 9, words: 's1c s1c s1c s1c s0 wr0 s-1 s-1 s1 s-1 s-1 s0 r0 s1 s-1 s0 s0 s0 s0 s0 s0 s0 r0 s0 s0 s0 s0 s0 s0 s0 r-1' },
  twister: { ctype: 'mini', e: 4.2, w: 14, h: 9, words: 's1c s1c s1c s1c s1c s1c s0 r0 s-1 s-1 l0 s-1 r0 s-1 s1 s-1 wr0 s-1 s0 wr0 s-1 brake s0 s0 s0 l0 s0 s0 s0 s0 s0 s0 s0 r0 r0' },
  timber: { ctype: 'wood', e: 6, w: 21, h: 8, words: 's1c s1c s1c s1c s1c s1c s1c s1c s1c s0 wr0 wr0 s-2 s-2 s-2 s-2 s1 s1 s1 s1 s1 s-1 s-1 s-1 s-1 s1 s1 s-1 s-1 wr0 s1 s-1 s1 s-1 brake r0 s0 s0 s0 s0 r0 s0 s0 s-1 l-1' },
  thunder: { ctype: 'wood', e: 6.6, w: 22, h: 4, words: 's2c s2c s2c s2c s2c s2c s0 s-2 s-2 s-2 s-2 s-2 s2 s2 s2 s0 wr0 wr0 s-2 s-2 s-2 s1 s1 s1 s1 s-1 s-1 s-1 s1 s1 s-1 s-1 wr0 l0 s0 s0 s-1 r-1 r-1' },
  comet: { ctype: 'steel', e: 7.7, w: 20, h: 8, col: 1, words: 's1c s1c s1c s1c s1c s1c s1c s1c s1c s1c s0 wr0b wr0b s-2 s-2 s-2 s-2 s-2 s0 loop s1 s1 s-1 s-1 cork s1 s1 wr0b s-1 s-1 brake brake brake r0b s0 s0 r0b s0 s0 s0 l0b' },
  rocket: { ctype: 'launch', e: 8.5, w: 26, h: 4, words: 's0 s0 s2 s2 s2 s2 s2 s2 s0 s-2 s-2 s-2 s-2 s-2 s-2 s0 loop s1 s1 wr0b wr0b s-1 s-1 cork s1 s1 s-1 s-1 brake brake brake brake s0 s0 s0 s0 s0 s0 s0 s0 s0 s0 s0 r0b s0 s0 r0b' },
};
export const DESIGN_ORDER = ['hopper', 'twister', 'timber', 'thunder', 'comet', 'rocket'];

// Paint for a coaster: [rails, ties, train]. Index 0 means the type's own colours.
export const TRACK_COLORS = [
  null,
  ['#ef476f', '#c2334f', '#ffd23f'], ['#3b8ed0', '#2a6ea8', '#ffd23f'], ['#06d6a0', '#04a57c', '#ef476f'],
  ['#ffd23f', '#d9a900', '#3b8ed0'], ['#9b5de5', '#7740c0', '#06d6a0'], ['#f78c1f', '#c96a0a', '#2b2d42'],
  ['#2b2d42', '#50546e', '#ef476f'], ['#f4f6fa', '#c9d1de', '#ef476f'],
];

// Unlocked at the start of a career.
export const START_UNLOCKS = [
  'carousel', 'castle', 'teacups', 'burger', 'drinks', 'toilet', 'oak', 'bush', 'flowers', 'bench', 'mini',
];

// Research projects, in career order. unlocks = ids from the tables above (or 'booster').
// Progress is "the first project with something still locked", so this list can be reordered and
// extended without breaking saved parks.
export const RESEARCH = [
  { id: 'r_icecream', unlocks: ['icecream'], pts: 200 },
  { id: 'r_slide', unlocks: ['slide'], pts: 250 },
  { id: 'r_nature', unlocks: ['pine', 'palm', 'rock', 'hedge', 'cactus', 'snowpine'], pts: 200 },
  { id: 'r_ferris', unlocks: ['ferris'], pts: 300 },
  { id: 'r_wood', unlocks: ['wood'], pts: 450 },
  { id: 'r_maze', unlocks: ['maze'], pts: 250 },
  { id: 'r_swing', unlocks: ['swing'], pts: 350 },
  { id: 'r_deco', unlocks: ['lamp', 'fountain', 'flag'], pts: 250 },
  { id: 'r_gift', unlocks: ['gift', 'candy'], pts: 250 },
  { id: 'r_pirate', unlocks: ['pirate'], pts: 400 },
  { id: 'r_bumper', unlocks: ['bumper'], pts: 400 },
  { id: 'r_tower', unlocks: ['tower'], pts: 400 },
  { id: 'r_steel', unlocks: ['steel'], pts: 600 },
  { id: 'r_statue', unlocks: ['statue', 'topiary', 'picnic', 'torch', 'snowman'], pts: 200 },
  { id: 'r_coffee', unlocks: ['coffee', 'hats'], pts: 300 },
  { id: 'r_haunted', unlocks: ['haunted'], pts: 450 },
  { id: 'r_octopus', unlocks: ['octopus'], pts: 450 },
  { id: 'r_booster', unlocks: ['booster'], pts: 350 },
  { id: 'r_drop', unlocks: ['drop'], pts: 500 },
  { id: 'r_tumbler', unlocks: ['tumbler'], pts: 500 },
  { id: 'r_launch', unlocks: ['launch'], pts: 600 },
  { id: 'r_slingshot', unlocks: ['slingshot'], pts: 600 },
];
export const RESEARCH_LEVELS = [0, 100, 200, 400]; // cost and points per month

// Goal kinds: open, guests, coaster (excitement), rating, value, coasters (how many open),
// rides (how many rides and coasters open), inv (inversions on one coaster), high (metres), speed (km/h).
const MEADOW_GOALS = [
  { id: 'g_open', k: 'open', reward: 1500 },
  { id: 'g_guests1', k: 'guests', n: 40, reward: 2000 },
  { id: 'g_coaster1', k: 'coaster', n: 3.5, reward: 3000 },
  { id: 'g_rating1', k: 'rating', n: 600, reward: 3000 },
  { id: 'g_guests2', k: 'guests', n: 120, reward: 4000 },
  { id: 'g_value1', k: 'value', n: 40000, reward: 5000 },
  { id: 'g_coaster2', k: 'coaster', n: 7, reward: 6000 },
  { id: 'g_guests3', k: 'guests', n: 250, reward: 8000 },
  { id: 'g_rating2', k: 'rating', n: 800, reward: 10000 },
  { id: 'g_value2', k: 'value', n: 150000, reward: 0 },
];

// Scenarios: a map, a look, starting money and a list of goals. stars = how many goals must be
// done for one, two and three stars. need = stars (over all scenarios) needed to unlock it.
// The first one is the original career, so its goals and their order must stay as they are.
export const SCENARIOS = {
  meadows: { theme: 'meadow', cash: 10000, need: 0, extra: [], goals: MEADOW_GOALS, stars: [3, 6, 10] },
  lake: {
    theme: 'lagoon', cash: 12000, need: 0, extra: ['palm', 'pine', 'icecream'], stars: [2, 4, 6],
    goals: [
      { k: 'open', reward: 1500 }, { k: 'guests', n: 60, reward: 2500 }, { k: 'rides', n: 6, reward: 3000 },
      { k: 'coaster', n: 5, reward: 4000 }, { k: 'rating', n: 700, reward: 5000 }, { k: 'guests', n: 200, reward: 0 },
    ],
  },
  dunes: {
    theme: 'desert', cash: 14000, need: 2, extra: ['cactus', 'palm', 'rock', 'wood', 'icecream'], stars: [2, 4, 6],
    goals: [
      { k: 'open', reward: 1500 }, { k: 'coaster', n: 4.5, reward: 3000 }, { k: 'coasters', n: 2, reward: 4000 },
      { k: 'speed', n: 90, reward: 5000 }, { k: 'guests', n: 220, reward: 6000 }, { k: 'value', n: 120000, reward: 0 },
    ],
  },
  frost: {
    theme: 'snow', cash: 16000, need: 5, extra: ['snowpine', 'pine', 'rock', 'snowman', 'wood', 'icecream', 'slide', 'ferris'],
    stars: [2, 4, 6],
    goals: [
      { k: 'open', reward: 1500 }, { k: 'guests', n: 80, reward: 3000 }, { k: 'high', n: 30, reward: 4000 },
      { k: 'inv', n: 3, reward: 6000 }, { k: 'rating', n: 800, reward: 8000 }, { k: 'coaster', n: 8, reward: 0 },
    ],
  },
};
export const SCENARIO_ORDER = ['meadows', 'lake', 'dunes', 'frost'];
export const GOALS = MEADOW_GOALS; // kept for older code paths; use goalsOf() for the park being played

export const ACHIEVEMENTS = [
  { id: 'first-ride', icon: '🎠' },
  { id: 'first-coaster', icon: '🎢' },
  { id: 'guests-50', icon: '👨‍👩‍👧' },
  { id: 'guests-150', icon: '🎉' },
  { id: 'guests-300', icon: '🏟️' },
  { id: 'looping', icon: '🌀' },
  { id: 'thrill-maker', icon: '⚡' },
  { id: 'sky-high', icon: '🚀' },
  { id: 'rating-800', icon: '⭐' },
  { id: 'gardener', icon: '🌳' },
  { id: 'lake', icon: '💧' },
  { id: 'scientist', icon: '🔬' },
  { id: 'tycoon', icon: '💰' },
  { id: 'career-done', icon: '🏆' },
  { id: 'star-1', icon: '🌟' },
  { id: 'stars-6', icon: '✨' },
  { id: 'stars-12', icon: '👑' },
  { id: 'twisted', icon: '🌪️' },
  { id: 'speed-100', icon: '💨' },
];

export const MONTHS = 12;
export const DAY_LEN = 2; // seconds per day at normal speed
export const MONTH_DAYS = 30;
export const MAX_GUESTS = 400;
export const DAY_CYCLE = 300; // seconds of game time for one day-and-night round
export const MAX_LOAN = 20000;
export const START_CASH = 10000;
