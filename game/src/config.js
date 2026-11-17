// Solmar Bay: every tuning number for the city, the cars, the police and the
// story lives here, so the rest of the game reads plain words, not magic numbers.

export const WORLD = {
  half: 320,            // playable ground runs from -320 to +320 on x and z
  roadGap: 80,          // distance between parallel roads
  roadHalf: 7,          // half the width of a road
  lane: 3.6,            // lane offset from a road centre line
  beachZ: 272,          // south of this line the ground turns to sand
  seaZ: 300,            // south of this line is open water
  maxWanted: 5,
};

// Colours of the sun-soaked coast: warm walls, glass towers, terracotta roofs.
export const PALETTE = {
  sky: 0x8ec9e8,
  fog: 0xcfe8f2,
  sun: 0xfff2cf,
  ground: 0x9aa578,
  sand: 0xe8d29a,
  sea: 0x2e7fa8,
  road: 0x3a3f46,
  roadLine: 0xf2e6a0,
  sidewalk: 0xb9b3a4,
  plaza: 0xcfc8b8,
  walls: [0xe8d8b8, 0xd8b89a, 0xc8d8e0, 0xe0c8c8, 0xd0d0c0, 0xb8c8b8, 0xe8e0d0, 0xc0b8d0],
  roofs: [0xa85a3a, 0x7a6a5a, 0x5a7a8a, 0x8a4a4a],
  glass: 0x6aa8c8,
  tower: 0x4a6a8a,
  palmTrunk: 0x7a5a38,
  palmLeaf: 0x3f8a4a,
};

// Car models the player can steal and drive. Each entry shapes the box-built
// body: length, width, height, top speed and how quickly it answers the wheel.
export const CAR_MODELS = [
  { id: 'sedan',   name: 'Marlin Sedan',  len: 4.6, wid: 1.9, h: 1.35, top: 30, accel: 14, grip: 2.6, colors: [0x8a2a2a, 0x2a4a8a, 0xc8c8c8, 0x3a3a3a] },
  { id: 'coupe',   name: 'Stingray Coupe', len: 4.3, wid: 1.9, h: 1.15, top: 38, accel: 18, grip: 3.1, colors: [0xd8a018, 0xc01818, 0x18a8c8, 0xe8e8e8] },
  { id: 'taxi',    name: 'Bay Taxi',      len: 4.6, wid: 1.9, h: 1.4,  top: 28, accel: 13, grip: 2.5, colors: [0xe8c818] },
  { id: 'van',     name: 'Harbor Van',    len: 5.2, wid: 2.1, h: 2.0,  top: 24, accel: 10, grip: 2.1, colors: [0xe8e8e8, 0x4a6a8a, 0x8a8a8a] },
  { id: 'muscle',  name: 'Comet Muscle',  len: 4.8, wid: 2.0, h: 1.3,  top: 34, accel: 17, grip: 2.8, colors: [0x1a5a2a, 0x5a1a5a, 0x181818] },
  { id: 'pickup',  name: 'Dune Pickup',   len: 5.0, wid: 2.0, h: 1.7,  top: 27, accel: 13, grip: 2.4, colors: [0x8a5a2a, 0x2a6a5a, 0xb8b8b8] },
];

// The Commodore's prize car: gold, fast, and the target of the final mission.
export const PRIZE_CAR = { id: 'coupe', name: 'Commodore Coupe', color: 0xd8a018, top: 40 };

// How many police answer each wanted level, and how hard they push.
export const WANTED_TABLE = [
  { cruisers: 0, cops: 0 },
  { cruisers: 1, cops: 1 },
  { cruisers: 2, cops: 2 },
  { cruisers: 3, cops: 2 },
  { cruisers: 4, cops: 3 },
  { cruisers: 5, cops: 4 },
];

export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 8.5,
  health: 100,
  pistolDamage: 34,
  punchDamage: 25,
  magSize: 12,
  reloadTime: 1.4,
};

export const ECONOMY = {
  stealFine: 0,          // stealing a car is free; the wanted level is the price
  missionXp: 120,
  levelXp: 300,          // XP per level
  cashPerLevel: 150,
};

export const SAVE_KEY = 'solmar-bay-save-v1';
