// Ray Marlowe on foot: a third-person character who walks, runs, punches and
// shoots, with a camera that follows behind and swings with the mouse.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, turnToward } from './rng.js';
import { resolveCollisions } from './city.js';

export function createPlayer(scene) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2a6a8a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), shirt);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.82;
  head.castShadow = true;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), hair);
  hairTop.position.y = 2.05;
  group.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.3), pants);
  legL.position.set(-0.2, 0.38, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.2;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), shirt);
  armL.position.set(-0.48, 1.2, 0);
  armL.castShadow = true;
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.48;
  group.add(armR);
  // The pistol in Ray's right hand, visible when he is armed.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.48, 0.85, 0.25);
  group.add(gun);

  scene.add(group);
  return {
    group, legL, legR, armL, armR, gun,
    pos: new THREE.Vector3(0, 0, 40),
    heading: 0,
    speed: 0,
    health: PLAYER.health,
    maxHealth: PLAYER.health,
    ammo: PLAYER.magSize,
    reserve: 96,
    reloading: 0,
    punchTimer: 0,
    shootCooldown: 0,
    onFoot: true,
    car: null,
    walkPhase: 0,
    dead: false,
  };
}

// Move Ray with WASD relative to the camera, animate the limbs, keep him out
// of buildings and inside the city. Returns true while he is moving.
export function updatePlayerOnFoot(player, input, dt, game) {
  const camYaw = game.camYaw;
  let fx = 0, fz = 0;
  if (input.keys['KeyW'] || input.keys['ArrowUp']) { fx -= Math.sin(camYaw); fz -= Math.cos(camYaw); }
  if (input.keys['KeyS'] || input.keys['ArrowDown']) { fx += Math.sin(camYaw); fz += Math.cos(camYaw); }
  if (input.keys['KeyA'] || input.keys['ArrowLeft']) { fx -= Math.cos(camYaw); fz += Math.sin(camYaw); }
  if (input.keys['KeyD'] || input.keys['ArrowRight']) { fx += Math.cos(camYaw); fz -= Math.sin(camYaw); }
  const len = Math.hypot(fx, fz);
  const running = input.keys['ShiftLeft'] || input.keys['ShiftRight'];
  const target = len > 0 ? (running ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
  player.speed += (target - player.speed) * Math.min(1, dt * 8);
  if (len > 0) {
    fx /= len; fz /= len;
    const wantHeading = Math.atan2(fx, fz);
    player.heading = turnToward(player.heading, wantHeading, dt * 10);
    player.pos.x += fx * player.speed * dt;
    player.pos.z += fz * player.speed * dt;
    player.walkPhase += dt * player.speed * 1.6;
  }
  resolveCollisions(player.pos, 0.6, game.city.colliders);
  if (player.pos.z > 296) player.pos.z = 296; // never walk into the sea

  // Limb swing: legs and arms counter-swing while he moves.
  const swing = Math.sin(player.walkPhase) * clamp(player.speed / PLAYER.walkSpeed, 0, 1.4) * 0.55;
  player.legL.rotation.x = swing;
  player.legR.rotation.x = -swing;
  player.armL.rotation.x = -swing * 0.8;
  player.armR.rotation.x = swing * 0.8;
  if (player.punchTimer > 0) {
    player.punchTimer -= dt;
    player.armR.rotation.x = -1.6 * Math.max(0, player.punchTimer / 0.3);
  }
  player.group.position.copy(player.pos);
  player.group.rotation.y = player.heading;
  player.group.visible = player.onFoot;
  return player.speed > 0.5;
}

// Third-person camera: behind Ray on foot, behind the car while driving,
// pulled by mouse drag and kept above the ground.
export function updateCamera(game, dt) {
  const cam = game.camera;
  const target = new THREE.Vector3();
  let dist = 8, height = 3.2, lookUp = 1.6;
  if (game.player.car) {
    const car = game.player.car;
    target.copy(car.pos);
    game.camYaw = turnToward(game.camYaw, car.heading + Math.PI, dt * 2.2);
    dist = 12.5; height = 5.0; lookUp = 1.2;
  } else {
    target.copy(game.player.pos);
    dist = 7.5; height = 3.0;
  }
  const pitch = clamp(game.camPitch, -0.15, 0.55);
  const cx = target.x + Math.sin(game.camYaw) * Math.cos(pitch) * dist;
  const cz = target.z + Math.cos(game.camYaw) * Math.cos(pitch) * dist;
  const cy = target.y + height + Math.sin(pitch) * dist;
  cam.position.x += (cx - cam.position.x) * Math.min(1, dt * 7);
  cam.position.y += (cy - cam.position.y) * Math.min(1, dt * 7);
  cam.position.z += (cz - cam.position.z) * Math.min(1, dt * 7);
  if (cam.position.y < 1.2) cam.position.y = 1.2;
  cam.lookAt(target.x, target.y + lookUp, target.z);
}
