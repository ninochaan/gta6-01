// Pedestrians: ordinary people walking the sidewalks who scatter and run when
// a crime happens near them, and the bystanders a stolen car leaves behind.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { clamp, groundDist, turnToward } from './rng.js';
import { nearestRoadCoord, resolveCollisions } from './city.js';

const SHIRTS = [0xc86a5a, 0x5a8ac8, 0x6ab85a, 0xd8b84a, 0x9a6ac8, 0xe8e8e8, 0x3a3a3a];

function buildPedMesh(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick([0xc89878, 0x8a5a3a, 0xe8b898, 0x6a3a22]) });
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.36), shirt);
  torso.position.y = 1.1;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skin);
  head.position.y = 1.7;
  head.castShadow = true;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.26), pants);
  legL.position.set(-0.16, 0.35, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  return { group: g, legL, legR };
}

export function createPedestrians(game, count) {
  const peds = { list: [] };
  for (let i = 0; i < count; i++) {
    const ped = spawnPedestrian(game);
    if (ped) peds.list.push(ped);
  }
  return peds;
}

export function spawnPedestrian(game, x, z) {
  const rng = game.rng;
  const px = x !== undefined ? x : rng.range(-280, 280);
  const pz = z !== undefined ? z : rng.range(-280, 260);
  if (pz > WORLD.beachZ - 10) return null;
  const { group, legL, legR } = buildPedMesh(rng);
  group.position.set(px, 0, pz);
  game.scene.add(group);
  const ped = {
    group, legL, legR,
    pos: new THREE.Vector3(px, 0, pz),
    heading: rng.range(0, Math.PI * 2),
    speed: rng.range(1.1, 1.9),
    walkPhase: rng.range(0, 6),
    fleeing: 0,
    target: null,
    retarget: 0,
  };
  pickSidewalkTarget(game, ped);
  return ped;
}

// Choose a nearby sidewalk point to walk toward.
function pickSidewalkTarget(game, ped) {
  const rng = game.rng;
  const vertical = rng.chance(0.5);
  const road = nearestRoadCoord(vertical ? ped.pos.x : ped.pos.z);
  const side = rng.chance(0.5) ? 1 : -1;
  const along = rng.range(-280, 280);
  if (vertical) ped.target = { x: road + side * (WORLD.roadHalf + 2.5), z: along };
  else ped.target = { x: along, z: road + side * (WORLD.roadHalf + 2.5) };
}

export function updatePedestrians(game, dt) {
  const player = game.player;
  for (const ped of game.peds.list) {
    // A crime nearby sends pedestrians running the other way.
    const danger = groundDist(ped.pos.x, ped.pos.z, player.pos.x, player.pos.z);
    if ((game.wanted > 0 && danger < 18) || game.combat.shotsFired > 0) {
      if (danger < 18 && ped.fleeing <= 0) {
        ped.fleeing = 3 + game.rng.range(0, 2);
        const away = Math.atan2(ped.pos.x - player.pos.x, ped.pos.z - player.pos.z);
        ped.heading = away;
      }
    }
    if (ped.fleeing > 0) {
      ped.fleeing -= dt;
      ped.pos.x += Math.sin(ped.heading) * 4.5 * dt;
      ped.pos.z += Math.cos(ped.heading) * 4.5 * dt;
      ped.walkPhase += dt * 9;
    } else {
      ped.retarget -= dt;
      if (!ped.target || ped.retarget <= 0) { pickSidewalkTarget(game, ped); ped.retarget = 8; }
      const dx = ped.target.x - ped.pos.x, dz = ped.target.z - ped.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) { pickSidewalkTarget(game, ped); continue; }
      const want = Math.atan2(dx, dz);
      ped.heading = turnToward(ped.heading, want, dt * 4);
      ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
      ped.walkPhase += dt * ped.speed * 2.2;
    }
    resolveCollisions(ped.pos, 0.5, game.city.colliders);
    ped.pos.x = clamp(ped.pos.x, -300, 300);
    ped.pos.z = clamp(ped.pos.z, -300, 285);
    const swing = Math.sin(ped.walkPhase) * 0.5;
    ped.legL.rotation.x = swing;
    ped.legR.rotation.x = -swing;
    ped.group.position.copy(ped.pos);
    ped.group.rotation.y = ped.heading;
  }
  if (game.combat.shotsFired > 0) game.combat.shotsFired = Math.max(0, game.combat.shotsFired - dt);
}
