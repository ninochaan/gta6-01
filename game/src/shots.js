// Deterministic screenshot scenes for Solmar Bay. With ?shot=<name>&seed=1 the
// game skips the menu, stages one fixed scene per name (same seed, same city,
// same traffic), and plays it live — so each screenshot shows several systems
// at once: a chase, a drive, a walk, and a mission in progress.
import { CAR_MODELS } from './config.js';
import { createCar } from './vehicles.js';
import { startMission } from './missions.js';
import { setWanted, spawnPoliceCruiser } from './police.js';
import { spawnPedestrian } from './pedestrians.js';

function givePlayerCar(game, modelId, color, x, z, heading, speed) {
  const model = CAR_MODELS.find((m) => m.id === modelId) || CAR_MODELS[0];
  const car = createCar(game, x, z, heading, model, color, false);
  car.isPlayer = true;
  car.speed = speed;
  game.player.car = car;
  game.player.onFoot = false;
  game.player.pos.set(x, 0, z);
  game.player.heading = heading;
  game.camYaw = heading + Math.PI;
  return car;
}

export function applyShot(game, mode) {
  const player = game.player;
  game.shotMode = true;
  game.hud.hideMenu();
  game.hud.hidePause();
  game.state = 'playing';
  game.audio.ensure();

  if (mode === 'chase') {
    // The cover: a police chase at three stars, mid-getaway, mission marker up.
    // The player starts far north so the chase stays on the avenue; two
    // cruisers flank him in the neighbouring lanes with their light bars on,
    // and no fresh cruiser spawns before the capture.
    givePlayerCar(game, 'coupe', 0xc01818, -3.6, -100, 0, 26);
    startMission(game, 2);
    setWanted(game, 3);
    spawnPoliceCruiser(game, 3.6, -96, 0, true).speed = 26;
    spawnPoliceCruiser(game, -10.8, -98, 0, true).speed = 26;
    game.police.spawnTimer = 12;
    game.hud.showMessage('Getaway Driver — drop 1: the north avenue');
    game.camPitch = 0.22;
  } else if (mode === 'drive') {
    // Cruising down the main avenue toward the Solmar Tower, traffic around.
    givePlayerCar(game, 'sedan', 0x2a4a8a, 3.6, -160, 0, 17);
    game.camPitch = 0.18;
  } else if (mode === 'foot') {
    // On foot by the tower plaza among pedestrians, one star on the board and
    // a cruiser parked across the avenue with its light bar flashing.
    player.pos.set(72, 0, 62);
    player.heading = -2.17;
    player.onFoot = true;
    game.camYaw = 0;
    game.camPitch = 0.16;
    for (const [px, pz] of [[60, 50], [66, 54], [58, 58], [70, 48], [64, 60]]) {
      const ped = spawnPedestrian(game, px, pz);
      if (ped) game.peds.list.push(ped);
    }
    setWanted(game, 1);
    spawnPoliceCruiser(game, 44, 8, Math.PI / 2, true);
    game.police.spawnTimer = 12;
    game.hud.showMessage('On foot in Solmar Bay — press N to start the next job');
  } else if (mode === 'mission') {
    // The Harbor Heist: the gold coupe at the harbor under its gold beacon,
    // guards closing in, cruisers parked across the avenue, wanted 3.
    startMission(game, 4);
    player.pos.set(240, 0, 200);
    player.heading = 0;
    player.onFoot = true;
    game.camYaw = Math.PI;
    game.camPitch = 0.2;
    spawnPoliceCruiser(game, 232, 214, 0, true);
    spawnPoliceCruiser(game, 248, 210, 0, true);
    game.police.spawnTimer = 12;
  }
  game.hud.refreshAll();
}

// Run the world forward a few seconds before the first frame so traffic,
// pedestrians and police have spread out into a lived-in street.
export function settleWorld(game, seconds) {
  const step = 1 / 60;
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i++) game.tick(step, true);
}
