// shots.js — deterministic staged scenes for the four screenshots, selected
// with ?shot=chase|drive|foot|garage&seed=1. Each one arranges the real
// systems (traffic, pedestrians, police, missions, HUD) into a readable
// frame: the cover chase, a beachfront cruise, an on-foot police pursuit
// downtown, and Rico's car on the pad at Tito's Garage. The city itself is
// seed-fixed, and these setups place every actor by hand, so the frames
// are reproducible.
// v4: the garage frame is restaged from the south-east corner, low, looking
// north-west across the room — the pad car in the foreground, the lift and
// its coupe beyond it, the bench and poster on the north wall — instead of
// v3's pergola-beams-and-a-bumper composition.

import { createCar } from './vehicles.js';

// Common staging helpers ------------------------------------------------------
function stageTraffic(G, spots) {
  for (const [x, z, h] of spots) {
    const car = G.traffic.spawnTraffic(true);
    car.setPos(x, z, h);
    car.speed = 6;
  }
}
function stagePeds(G, spots) {
  for (const [x, z] of spots) {
    const ped = G.peds.spawn({ x, z });
    ped.x = x; ped.z = z;
    ped.group.position.set(x, 0, z);
  }
}

export function setupShot(G, name) {
  const { player } = G;
  G.shotMode = true;
  if (name === 'chase') {
    // Cover: Rico's coupe fleeing east on the boulevard, two units behind,
    // three stars lit, traffic and beach crowds all around.
    const car = createCar(G.scene, 0xe4572e, {});
    car.setPos(34, 192.9, Math.PI / 2);
    car.speed = 19;
    G.extraCars.push(car);
    player.enterCar(car);
    G.cameraYaw = car.heading + Math.PI;
    G.wanted.level = 3;
    G.wanted.lastSeen = G.now;
    // the two units sit just behind the coupe — inside the chase camera's
    // frame — and nearly as fast, so they hold their places for the shot;
    // the shot camera itself pulls back to fit all three cars in frame
    G.camDistOverride = 15.5;
    const cop1 = G.police.spawnCop(26, 196);
    cop1.setPos(26.5, 190.2, Math.PI / 2); cop1.speed = 19.5;
    const cop2 = G.police.spawnCop(22, 196);
    cop2.setPos(23, 198.8, Math.PI / 2); cop2.speed = 19.15;
    stageTraffic(G, [[86, 199.1, Math.PI / 2], [110, 189.9, -Math.PI / 2], [-40, 199.1, Math.PI / 2]]);
    stagePeds(G, [[52, 205.5], [64, 186.5], [78, 206], [24, 186.8], [100, 205]]);
    G.shotObjective = 'Lose the police — break their line of sight!';
    G.hud.banner('SOLMAR PD', 'Dispatch: orange coupe, boulevard eastbound. All units respond.');
    player.camPos.set(34 - 15.5, 4.2, 192.9);
  } else if (name === 'drive') {
    // Cruising the beachfront: palms, hotels, sand and sea in frame.
    const car = createCar(G.scene, 0x2e7f86, {});
    car.setPos(-70, 199.1, Math.PI / 2);
    car.speed = 11;
    G.extraCars.push(car);
    player.enterCar(car);
    G.cameraYaw = car.heading + Math.PI + 0.16;
    stageTraffic(G, [[-20, 189.9, -Math.PI / 2], [30, 199.1, Math.PI / 2]]);
    stagePeds(G, [[-52, 206.5], [-95, 187], [-38, 214]]);
    G.shotObjective = 'Free roam — the boulevard is yours. Watch for a green mission marker.';
    player.camPos.set(-70 - 9, 3.6, 196);
  } else if (name === 'foot') {
    // On-foot police pursuit downtown: Rico has ditched the car and the PD
    // has ditched theirs — two stars, a unit stopped at the corner, and its
    // crew closing in on foot behind him. Captured ~1.5 s in, the bust meter
    // is part full and the chase is still readable.
    player.teleport(13.5, -49, 0.45);
    G.cameraYaw = 0.55; G.cameraPitch = 0.12;
    G.wanted.level = 2; G.wanted.lastSeen = G.now;
    const cop = G.police.spawnCop(0, -62);
    cop.setPos(3.1, -62, Math.PI); cop.speed = 0; cop.parked = true; cop.bailed = true;
    const bx = -Math.sin(0.45), bz = -Math.cos(0.45); // behind Rico's shoulder
    const stage = [[5.5, -1.6], [9, 1.1], [13, -0.4]];
    for (const [back, side] of stage) {
      const ox = 13.5 + bx * back + Math.cos(0.45) * side;
      const oz = -49 + bz * back - Math.sin(0.45) * side;
      const off = G.police.spawnOfficer(ox, oz, Math.atan2(13.5 - ox, -49 - oz), cop);
      if (off) off.state = 'pursue';
    }
    stagePeds(G, [[6, -52], [3, -74], [16, -46], [-4, -58], [17.5, -43]]);
    stageTraffic(G, [[-3.1, -105, Math.PI], [40, -72.9, Math.PI / 2]]);
    const parked = G.traffic.parked[0];
    if (parked) parked.setPos(-6.5, -44, 0.3);
    G.shotObjective = 'Package Run — the PD is on your heels. Break line of sight!';
    player.camPos.set(13.5 + Math.sin(0.55) * 5.4, 2.6, -49 + Math.cos(0.55) * 5.4);
  } else if (name === 'garage') {
    // Tito's Garage (v4 restage): Rico's bent coupe sits on the repair pad
    // nose-north; the camera waits low in the south-east corner and looks
    // north-west across the room, so the pad car fills the foreground, the
    // lift with its blue coupe reads mid-frame, and the workbench, cabinet
    // and VELOZ GT poster line the north wall behind it — with the repair
    // prompt, objective, cash and minimap all on the HUD as before.
    const car = createCar(G.scene, 0xe4572e, {});
    car.setPos(G.city.garage.repair.x, G.city.garage.repair.z, 2.75);
    car.speed = 0;
    car.health = 55;
    G.extraCars.push(car);
    player.enterCar(car);
    G.cameraYaw = 0.85;      // camera SE of the car, looking NW into the room
    G.cameraPitch = -0.30;   // low, tilted down: the pergola slats stay out of frame
    G.camDistOverride = 5.0;
    G.shotObjective = 'The Solmar Job — bring the take home. Get the car straightened first.';
    G.hud.setPrompt("K — repair your car at Tito's Garage ($40)");
    player.camPos.set(G.city.garage.repair.x + 3.59, 2.37, G.city.garage.repair.z + 3.15);
  }
  player.syncMesh();
}
