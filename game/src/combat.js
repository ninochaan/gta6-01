// Combat: Ray's pistol and fists, tracers and muzzle flashes, and the enemy
// gunmen who shoot back during the story missions.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { groundDist } from './rng.js';
import { addWanted } from './police.js';

export function createCombat(game) {
  return {
    enemies: [],
    tracers: [],
    shotsFired: 0,
    muzzle: null,
  };
}

function buildGunman(game, x, z) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x5a1a1a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), jacket);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.82;
  g.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.46), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  band.position.y = 1.95;
  g.add(band);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.28), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  legL.position.set(-0.19, 0.38, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.19;
  g.add(legR);
  // A red health bar floating over the gunman.
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14), new THREE.MeshBasicMaterial({ color: 0x301010 }));
  barBg.position.y = 2.35;
  g.add(barBg);
  const barFg = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  barFg.position.set(0, 2.35, 0.01);
  g.add(barFg);
  g.position.set(x, 0, z);
  game.scene.add(g);
  return {
    group: g, barFg, legL, legR,
    pos: new THREE.Vector3(x, 0, z),
    heading: 0, health: 100, maxHealth: 100,
    shootTimer: game.rng.range(0.5, 1.5), walkPhase: 0, dead: false,
  };
}

export function spawnEnemies(game, spots) {
  const list = [];
  for (const s of spots) {
    const e = buildGunman(game, s.x, s.z);
    game.combat.enemies.push(e);
    list.push(e);
  }
  return list;
}

export function clearEnemies(game) {
  for (const e of game.combat.enemies) game.scene.remove(e.group);
  game.combat.enemies = [];
}

// A bright line from the muzzle to the hit point, fading in a blink.
function spawnTracer(game, from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe080 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.lookAt(to);
  mesh.rotateX(Math.PI / 2);
  game.scene.add(mesh);
  game.combat.tracers.push({ mesh, life: 0.09 });
}

function spawnHitPuff(game, pos, color) {
  const mat = new THREE.MeshBasicMaterial({ color: color || 0xff5040 });
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mat);
  puff.position.copy(pos);
  game.scene.add(puff);
  game.combat.tracers.push({ mesh: puff, life: 0.25, grow: true });
}

export function playerShoot(game) {
  const player = game.player;
  if (!player.onFoot || player.reloading > 0 || player.shootCooldown > 0) return;
  if (player.ammo <= 0) {
    game.audio.reload();
    startReload(game);
    return;
  }
  player.ammo -= 1;
  player.shootCooldown = 0.22;
  game.audio.shoot();
  game.combat.shotsFired = 1.2;
  if (game.wanted < 1) addWanted(game, 1);

  // Aim from the camera through the crosshair; the first thing hit takes it.
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), game.camera);
  ray.far = 90;
  const targets = [];
  for (const e of game.combat.enemies) if (!e.dead) targets.push(e.group);
  for (const car of game.cars) targets.push(car.mesh);
  const hits = ray.intersectObjects(targets, true);
  const from = game.camera.position.clone();
  let end = ray.ray.at(90, new THREE.Vector3());
  if (hits.length > 0) {
    end = hits[0].point;
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== game.scene) obj = obj.parent;
    const enemy = game.combat.enemies.find((e) => e.group === obj);
    if (enemy && !enemy.dead) {
      enemy.health -= PLAYER.pistolDamage;
      spawnHitPuff(game, end);
      if (enemy.health <= 0) {
        enemy.dead = true;
        game.scene.remove(enemy.group);
        game.cash += 50;
        game.xp += 25;
        game.hud.showMessage('Gunman down — +$50');
      }
    } else {
      spawnHitPuff(game, end, 0xcccccc);
      game.audio.crash();
    }
  }
  spawnTracer(game, from, end);
  game.hud.flashCrosshair();
}

export function playerPunch(game) {
  const player = game.player;
  if (!player.onFoot || player.punchTimer > 0) return;
  player.punchTimer = 0.35;
  game.audio.punch();
  const reach = 2.4;
  for (const e of game.combat.enemies) {
    if (e.dead) continue;
    const d = groundDist(player.pos.x, player.pos.z, e.pos.x, e.pos.z);
    if (d < reach) {
      e.health -= PLAYER.punchDamage;
      spawnHitPuff(game, new THREE.Vector3(e.pos.x, 1.4, e.pos.z));
      if (e.health <= 0) {
        e.dead = true;
        game.scene.remove(e.group);
        game.cash += 50;
        game.xp += 25;
        game.hud.showMessage('Knocked out — +$50');
      }
    }
  }
  for (const ped of game.peds.list) {
    const d = groundDist(player.pos.x, player.pos.z, ped.pos.x, ped.pos.z);
    if (d < reach) {
      ped.fleeing = 4;
      addWanted(game, 1);
    }
  }
}

export function startReload(game) {
  const player = game.player;
  if (player.reloading > 0 || player.ammo >= PLAYER.magSize) return;
  player.reloading = PLAYER.reloadTime;
  game.audio.reload();
}

export function updateCombat(game, dt) {
  const player = game.player;
  if (player.shootCooldown > 0) player.shootCooldown -= dt;
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      const need = PLAYER.magSize - player.ammo;
      const take = Math.min(need, player.reserve);
      player.ammo += take;
      player.reserve -= take;
    }
  }
  // Fade and drop spent tracers and hit puffs.
  for (let i = game.combat.tracers.length - 1; i >= 0; i--) {
    const t = game.combat.tracers[i];
    t.life -= dt;
    if (t.grow) t.mesh.scale.multiplyScalar(1 + dt * 6);
    if (t.life <= 0) {
      game.scene.remove(t.mesh);
      game.combat.tracers.splice(i, 1);
    }
  }
  // Gunmen: close in to shooting range, then fire back with poor aim.
  for (const e of game.combat.enemies) {
    if (e.dead) continue;
    const d = groundDist(e.pos.x, e.pos.z, player.pos.x, player.pos.z);
    e.heading = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
    e.group.rotation.y = e.heading;
    if (d > 14) {
      e.pos.x += Math.sin(e.heading) * 3.2 * dt;
      e.pos.z += Math.cos(e.heading) * 3.2 * dt;
      e.walkPhase += dt * 6;
      e.legL.rotation.x = Math.sin(e.walkPhase) * 0.5;
      e.legR.rotation.x = -Math.sin(e.walkPhase) * 0.5;
    } else {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && player.onFoot) {
        e.shootTimer = game.rng.range(0.9, 1.8);
        game.audio.shoot();
        const from = new THREE.Vector3(e.pos.x, 1.5, e.pos.z);
        const to = new THREE.Vector3(player.pos.x + game.rng.range(-1.5, 1.5), 1.3, player.pos.z + game.rng.range(-1.5, 1.5));
        spawnTracer(game, from, to);
        if (game.rng.chance(0.35)) {
          player.health -= 7;
          game.hud.flashDamage();
          game.audio.crash();
        }
      }
    }
    e.group.position.copy(e.pos);
    const frac = Math.max(0, e.health / e.maxHealth);
    e.barFg.scale.x = frac;
    e.barFg.position.x = -(1 - frac) * 0.53;
    e.barFg.lookAt(game.camera.position);
  }
  game.combat.enemies = game.combat.enemies.filter((e) => !e.dead);
}
