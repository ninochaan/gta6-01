// The minimap: a small live map of Solmar Bay in the corner of the screen —
// roads, the sea, the tower, the player arrow, traffic, flashing police,
// pedestrians, gunmen and the gold mission marker.
import { WORLD } from './config.js';
import { currentTarget } from './missions.js';

const ROADS = [];
for (let c = -3; c <= 3; c++) ROADS.push(c * WORLD.roadGap);

export function drawMinimap(game) {
  const canvas = game.hud.minimap;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const scale = S / (WORLD.half * 2 + 40);
  const toMap = (x, z) => [(x + WORLD.half + 20) * scale, (z + WORLD.half + 20) * scale];

  // Sea and land.
  ctx.fillStyle = '#2e7fa8';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#3f5a3f';
  const [, sandTop] = toMap(0, WORLD.beachZ);
  ctx.fillRect(0, 0, S, sandTop);
  ctx.fillStyle = '#e8d29a';
  const [, seaTop] = toMap(0, WORLD.seaZ);
  ctx.fillRect(0, sandTop, S, seaTop - sandTop);

  // Roads.
  ctx.strokeStyle = '#3a3f46';
  ctx.lineWidth = Math.max(2, WORLD.roadHalf * 2 * scale);
  for (const c of ROADS) {
    const [x] = toMap(c, 0);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
    const [, z] = toMap(0, c);
    ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(S, z); ctx.stroke();
  }

  // The tower landmark.
  const [tx, tz] = toMap(40, 40);
  ctx.fillStyle = '#ffd860';
  ctx.beginPath(); ctx.arc(tx, tz, 5, 0, Math.PI * 2); ctx.fill();

  const dot = (x, z, r, color) => {
    const [mx, mz] = toMap(x, z);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(mx, mz, r, 0, Math.PI * 2); ctx.fill();
  };

  // Mission marker: a pulsing gold diamond.
  const target = currentTarget(game);
  if (target) {
    const [mx, mz] = toMap(target.x, target.z);
    const pulse = 5 + Math.sin(game.time * 5) * 2;
    ctx.fillStyle = '#ffd860';
    ctx.beginPath();
    ctx.moveTo(mx, mz - pulse); ctx.lineTo(mx + pulse, mz);
    ctx.lineTo(mx, mz + pulse); ctx.lineTo(mx - pulse, mz);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff2b0';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Pedestrians, traffic, gunmen, police.
  for (const ped of game.peds.list) dot(ped.pos.x, ped.pos.z, 1.5, '#b8b8b8');
  for (const car of game.cars) {
    if (car.isPolice) continue;
    dot(car.pos.x, car.pos.z, 2, car.isPlayer ? '#ffffff' : '#e8e8e8');
  }
  for (const e of game.combat.enemies) dot(e.pos.x, e.pos.z, 3, '#ff3030');
  const flash = Math.sin(game.time * 10) > 0;
  for (const car of game.police.cruisers) dot(car.pos.x, car.pos.z, 3, flash ? '#2040ff' : '#ff2020');
  for (const cop of game.police.cops) dot(cop.pos.x, cop.pos.z, 2.5, flash ? '#2040ff' : '#ff2020');

  // The player: a white arrow pointing the way he faces.
  const p = game.player;
  const [px, pz] = toMap(p.pos.x, p.pos.z);
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(Math.atan2(Math.sin(p.heading), -Math.cos(p.heading)) + Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();

  // A thin frame and the "N" so the map reads at a glance.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('N', S - 14, 14);
}
