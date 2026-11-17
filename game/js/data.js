// Static game data: rides, stalls, scenery, coaster types, research, goals, achievements.

export const N = 40; // map is N x N tiles
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
};
export const RIDE_ORDER = ['carousel', 'castle', 'teacups', 'ferris', 'swing', 'pirate', 'bumper', 'haunted', 'drop'];

// Stalls (1x1). need = which guest need they serve.
export const STALLS = {
  burger: { cost: 350, run: 20, price: 5, need: 'hunger' },
  drinks: { cost: 300, run: 15, price: 3.5, need: 'thirst' },
  icecream: { cost: 320, run: 15, price: 4, need: 'treat' },
  toilet: { cost: 250, run: 10, price: 0, need: 'toilet' },
  gift: { cost: 450, run: 20, price: 8, need: 'gift' },
};
export const STALL_ORDER = ['burger', 'drinks', 'icecream', 'toilet', 'gift'];

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
];
export const SCN = Object.fromEntries(SCENERY.map((s, i) => (s ? [s.id, i] : ['none', 0])));

// Coaster types. maxH = how many height levels above the station the track may climb.
export const COASTERS = {
  mini: {
    maxH: 6, steep: false, loop: false, bank: false, piece: 40, station: 300, cars: 4, cap: 8,
    mu: 0.02, rail: '#ffd23f', tie: '#e8553f', sup: '#f4f6fa', car: '#e8553f', run: 40,
  },
  wood: {
    maxH: 12, steep: true, loop: false, bank: false, piece: 65, station: 500, cars: 4, cap: 16,
    mu: 0.022, rail: '#7a4a22', tie: '#b98550', sup: '#d9b383', car: '#3b8ed0', run: 70,
  },
  steel: {
    maxH: 20, steep: true, loop: true, bank: true, piece: 90, station: 700, cars: 4, cap: 16,
    mu: 0.012, rail: '#ef476f', tie: '#c2334f', sup: '#dfe7f1', car: '#ffd23f', run: 100,
  },
};
export const COASTER_ORDER = ['mini', 'wood', 'steel'];

// Unlocked at the start of a career.
export const START_UNLOCKS = [
  'carousel', 'castle', 'teacups', 'burger', 'drinks', 'toilet', 'oak', 'bush', 'flowers', 'bench', 'mini',
];

// Research projects, in career order. unlocks = ids from the tables above (or 'booster').
export const RESEARCH = [
  { id: 'r_icecream', unlocks: ['icecream'], pts: 200 },
  { id: 'r_ferris', unlocks: ['ferris'], pts: 300 },
  { id: 'r_nature', unlocks: ['pine', 'palm', 'rock'], pts: 200 },
  { id: 'r_wood', unlocks: ['wood'], pts: 450 },
  { id: 'r_swing', unlocks: ['swing'], pts: 350 },
  { id: 'r_deco', unlocks: ['lamp', 'fountain'], pts: 250 },
  { id: 'r_gift', unlocks: ['gift'], pts: 250 },
  { id: 'r_pirate', unlocks: ['pirate'], pts: 400 },
  { id: 'r_bumper', unlocks: ['bumper'], pts: 400 },
  { id: 'r_steel', unlocks: ['steel'], pts: 600 },
  { id: 'r_statue', unlocks: ['statue'], pts: 200 },
  { id: 'r_haunted', unlocks: ['haunted'], pts: 450 },
  { id: 'r_booster', unlocks: ['booster'], pts: 350 },
  { id: 'r_drop', unlocks: ['drop'], pts: 500 },
];
export const RESEARCH_LEVELS = [0, 100, 200, 400]; // cost and points per month

// Career goals, completed in order.
export const GOALS = [
  { id: 'g_open', reward: 1500 },
  { id: 'g_guests1', n: 40, reward: 2000 },
  { id: 'g_coaster1', n: 3.5, reward: 3000 },
  { id: 'g_rating1', n: 600, reward: 3000 },
  { id: 'g_guests2', n: 120, reward: 4000 },
  { id: 'g_value1', n: 40000, reward: 5000 },
  { id: 'g_coaster2', n: 7, reward: 6000 },
  { id: 'g_guests3', n: 250, reward: 8000 },
  { id: 'g_rating2', n: 800, reward: 10000 },
  { id: 'g_value2', n: 150000, reward: 0 },
];

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
];

export const MONTHS = 12;
export const DAY_LEN = 2; // seconds per day at normal speed
export const MONTH_DAYS = 30;
export const MAX_GUESTS = 400;
export const MAX_LOAN = 20000;
export const START_CASH = 10000;
