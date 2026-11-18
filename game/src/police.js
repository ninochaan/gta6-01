// police.js — the wanted system, police cars that pursue an intercept
// point, officers who bail out and chase on foot, roadblocks with a
// standing guard at four stars, and the bust meter.

import { Car } from './vehicles.js';
import { buildPersonMesh, meshOf, box } from './geometry.js';
import { collideCircle, applyShore, clampWorld } from './physics.js';
import { clamp, dist2d } from './rng.js';

export class Wanted {
  constructor() {
    this.heat = 0;
    this.level = 0;
    this.lastSeen = -99999;
    this.unseen = 0;
    // The level the internal bookkeeping last produced. `level` is public
    // handle state, so if it ever disagrees with this shadow, it was
    // assigned from outside (a direct set through the handle) and update()
    // adopts it instead of recomputing it away from a stale heat value.
    this.levelSeen = 0;
  }

  setStars(n, now) {
    this.heat = clamp(n, 0, 5);
    this.level = Math.round(this.heat);
    this.levelSeen = this.level;
    if (now !== undefined) this.lastSeen = now;
    this.unseen = 0;
  }

  addHeat(n, now) {
    this.heat = clamp(this.heat + n, 0, 5);
    this.level = Math.min(5, Math.ceil(this.heat - 1e-6));
    this.levelSeen = this.level;
    if (now !== undefined) this.lastSeen = now;
    this.unseen = 0;
  }

  clear() {
    this.heat = 0;
    this.level = 0;
    this.levelSeen = 0;
    this.unseen = 0;
  }

  // Decay works purely from these arguments: unseen time accumulates,
  // and after 6 unseen seconds the heat falls at 0.055 per second.
  update(dt, now, seen) {
    // Honour a level assigned directly through the handle: adopt it as
    // the heat so the whole wanted system (spawning, pursuit, the bust
    // meter) engages with it, rather than the level being zeroed on the
    // very next frame because heat was never raised alongside it.
    if (this.level !== this.levelSeen) {
      this.heat = clamp(this.level, 0, 5);
      this.unseen = 0;
    }
    if (seen) {
      this.lastSeen = now;
      this.unseen = 0;
    } else {
      this.unseen += dt;
      if (this.unseen > 6 && this.heat > 0) {
        this.heat = Math.max(0, this.heat - 0.055 * dt);
      }
    }
    this.level = this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat - 1e-6));
    this.levelSeen = this.level;
  }
}

export class Officer {
  constructor(scene, x, z, heading, car, rng) {
    this.x = x;
    this.z = z;
    this.heading = heading || 0;
    this.car = car || null;
    this.state = 'pursue';
    this.drawn = false;
    this.gun = { visible: false };
    this.fireT = rng.range(1, 2);
    this.rng = rng;
    this.guardPost = null;
    this.mesh = buildPersonMesh(0x22304a, 0x1c2733, 0xc9986a);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.gunMesh = meshOf([box(0, 0, 0, 0.09, 0.12, 0.46, 0x14161a)]);
    this.gunMesh.visible = false;
    scene.add(this.gunMesh);
  }

  moveToward(dt, tx, tz, speed, colliders) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) return true;
    this.heading = Math.atan2(dx, dz);
    let nx = this.x + (dx / len) * speed * dt;
    let nz = this.z + (dz / len) * speed * dt;
    const shore = applyShore(nx, nz, this.x, this.z);
    const hit = collideCircle(shore.x, shore.z, 0.5, colliders);
    const cl = clampWorld(hit.x, hit.z);
    this.x = cl.x;
    this.z = cl.z;
    return len < 1.2;
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.gun.visible = this.drawn;
    if (this.gunMesh) {
      this.gunMesh.visible = this.drawn;
      this.gunMesh.position.set(
        this.x + Math.sin(this.heading) * 0.42,
        1.05,
        this.z + Math.cos(this.heading) * 0.42
      );
      this.gunMesh.rotation.y = this.heading;
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
    if (this.gunMesh) scene.remove(this.gunMesh);
  }
}

export class Police {
  constructor(scene, rng, env) {
    this.scene = scene;
    this.rng = rng;
    this.env = env; // { colliders, registerCar, unregisterCar }
    this.cars = [];
    this.officers = [];
    this.bust = 0;
    this.spawnT = 0;
    this.roadblock = null;
  }

  spawnCop(x, z) {
    const car = new Car(this.scene, x, z, 0, 0xf2f4f6, true);
    car.bailCd = 0;
    car.crewOut = false;
    this.cars.push(car);
    this.env.registerCar(car);
    return car;
  }

  spawnOfficer(x, z, heading, car) {
    const o = new Officer(this.scene, x, z, heading, car, this.rng);
    this.officers.push(o);
    return o;
  }

  nearestCopDistance(x, z) {
    let best = Infinity;
    for (const c of this.cars) best = Math.min(best, dist2d(x, z, c.x, c.z));
    for (const o of this.officers) best = Math.min(best, dist2d(x, z, o.x, o.z));
    return best;
  }

  seenByAnyone(H) {
    const px = H.player.x;
    const pz = H.player.z;
    for (const c of this.cars) {
      if (dist2d(px, pz, c.x, c.z) < 58 && !this.env.lineBlocked(c.x, c.z, px, pz)) return true;
    }
    for (const o of this.officers) {
      if (dist2d(px, pz, o.x, o.z) < 42 && !this.env.lineBlocked(o.x, o.z, px, pz)) return true;
    }
    return false;
  }

  spawnNearPlayer(H) {
    const a = this.rng.range(0, Math.PI * 2);
    let x = H.player.x + Math.sin(a) * 62;
    let z = H.player.z + Math.cos(a) * 62;
    // Snap to the nearest road so the unit arrives on tarmac.
    if (this.rng.chance(0.5)) x = Math.round(x / 56) * 56;
    else z = Math.round(z / 56) * 56;
    x = clamp(x, -272, 246);
    z = clamp(z, -272, 200);
    const car = this.spawnCop(x, z);
    car.heading = Math.atan2(H.player.x - x, H.player.z - z);
    return car;
  }

  setRoadblock(H) {
    const dirX = H.player.vx || Math.sin(H.cameraYaw + Math.PI);
    const dirZ = H.player.vz || Math.cos(H.cameraYaw + Math.PI);
    const len = Math.hypot(dirX, dirZ) || 1;
    const bx = clamp(H.player.x + (dirX / len) * 55, -260, 240);
    const bz = clamp(H.player.z + (dirZ / len) * 55, -260, 196);
    const snapX = Math.round(bx / 56) * 56;
    const snapZ = Math.round(bz / 56) * 56;
    const a = this.spawnCop(snapX - 3, snapZ);
    const b = this.spawnCop(snapX + 3, snapZ);
    a.heading = Math.PI / 2;
    b.heading = Math.PI / 2;
    a.setPos(snapX - 3, snapZ, Math.PI / 2);
    b.setPos(snapX + 3, snapZ, Math.PI / 2);
    a.roadblock = true;
    b.roadblock = true;
    a.speed = 0;
    b.speed = 0;
    const guard = this.spawnOfficer(snapX, snapZ + 5, 0, a);
    guard.state = 'guard';
    guard.guardPost = { x: snapX, z: snapZ + 5 };
    this.roadblock = { cars: [a, b], guard, x: snapX, z: snapZ };
  }

  clearRoadblock() {
    if (!this.roadblock) return;
    for (const c of this.roadblock.cars) c.roadblock = false;
    if (this.roadblock.guard && this.officers.includes(this.roadblock.guard)) {
      this.roadblock.guard.state = 'return';
    }
    this.roadblock = null;
  }

  removeCar(car) {
    this.cars = this.cars.filter((c) => c !== car);
    this.env.unregisterCar(car);
    car.dispose(this.scene);
  }

  removeOfficer(o) {
    this.officers = this.officers.filter((x) => x !== o);
    o.dispose(this.scene);
  }

  update(dt, H) {
    const wanted = H.wanted;
    const px = H.player.x;
    const pz = H.player.z;
    const onFoot = !H.player.car;
    // Spawn pressure by star level.
    const desired = wanted.level === 0 ? 0 : Math.min(5, wanted.level + 1);
    this.spawnT -= dt;
    const activeCars = this.cars.filter((c) => !c.roadblock).length;
    if (wanted.level > 0 && activeCars < desired && this.spawnT <= 0) {
      this.spawnNearPlayer(H);
      this.spawnT = 2.5;
    }
    // Roadblocks at four stars and above.
    if (wanted.level >= 4 && !this.roadblock) this.setRoadblock(H);
    if ((wanted.level < 4 || dist2d(px, pz, this.roadblock?.x || 0, this.roadblock?.z || 0) > 130) && this.roadblock) this.clearRoadblock();

    // Police cars.
    for (const car of [...this.cars]) {
      car.bailCd = Math.max(0, (car.bailCd || 0) - dt);
      const d = dist2d(px, pz, car.x, car.z);
      if (wanted.level === 0) {
        // Heat died: fall back and leave when far away.
        car.speed = Math.max(0, car.speed - 10 * dt);
        car.barT += dt;
        car.syncMesh();
        if (d > 85 && !car.roadblock) this.removeCar(car);
        continue;
      }
      if (car.roadblock) {
        car.speed = 0;
        car.barT += dt;
        car.syncMesh();
        continue;
      }
      if (car.crewOut) {
        car.speed = 0;
        car.barT += dt;
        car.syncMesh(); // lights keep strobing while the crew is out
        continue;
      }
      // Pursue an intercept point ahead of the moving player.
      const lead = clamp(d / 22, 0, 1.25);
      const ix = px + (H.player.vx || 0) * lead;
      const iz = pz + (H.player.vz || 0) * lead;
      let cruise = 16 + wanted.level * 1.6;
      if (onFoot) {
        // Closing on a player on foot: do not aim to ram through the
        // player's position at full cruise speed. When the player is
        // slow or stationary, cap the approach speed by the remaining
        // distance so the car decelerates as it closes and settles
        // stopped about four units beside them — close enough to bail
        // out and to hold the bust meter — instead of overshooting,
        // orbiting at speed, or holding off far away. A fast-moving
        // player is still chased, with only a small cap right on top
        // of them so cars do not plough through them either.
        const playerSpeed = Math.abs(H.player.speedNow || 0);
        if (playerSpeed < 3) {
          if (d < 18) cruise = Math.min(cruise, Math.max(0, (d - 4.2) * 1.35));
        } else if (d < 6) {
          cruise = Math.min(cruise, 5);
        }
      }
      car.seek(dt, ix, iz, cruise, H.allCars, this.env.colliders);
      // Bail out when close and slow while the player is on foot.
      if (onFoot && d < 10.5 && Math.abs(car.speed) < 6.5 && car.bailCd <= 0) {
        car.crewOut = true;
        car.speed = 0;
        const n = wanted.level >= 2 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          this.spawnOfficer(car.x + (i ? 1.6 : -1.6), car.z + 1, car.heading, car);
        }
      }
    }

    // Officers.
    // A shot only counts when the stamp is a real firing time. The handle
    // marks "never fired" with a negative sentinel (-99), and early in a
    // session H.now itself is still small — a bare difference would read
    // that sentinel as a shot fired moments ago and draw every pistol.
    const firedAt = H.playerFiredAt;
    const playerFiredRecently = firedAt >= 0 && H.now - firedAt < 6000;
    for (const o of [...this.officers]) {
      const d = dist2d(px, pz, o.x, o.z);
      const guardFlee = o.state === 'guard' && H.player.car && d < 34;
      o.drawn = wanted.level >= 3 || playerFiredRecently || guardFlee;
      if (wanted.level === 0 || (H.player.car && d > 30 && o.state !== 'guard')) {
        o.state = 'return';
      } else if (o.state === 'return' && wanted.level > 0 && !H.player.car) {
        o.state = 'pursue';
      }
      if (o.state === 'guard') {
        if (onFoot && d < 22) o.state = 'pursue';
        else {
          o.heading = Math.atan2(px - o.x, pz - o.z);
          // A guard still shoots a fleeing car it has drawn on.
          if (o.drawn) this.officerShoot(dt, o, H, d);
        }
      } else if (o.state === 'return') {
        if (o.car && this.cars.includes(o.car)) {
          if (o.moveToward(dt, o.car.x, o.car.z, 5.6, this.env.colliders) || dist2d(o.x, o.z, o.car.x, o.car.z) < 2.2) {
            o.car.crewOut = false;
            o.car.bailCd = 4;
            this.removeOfficer(o);
            continue;
          }
        } else {
          // No car to return to: fade out when far from the player.
          if (d > 45) {
            this.removeOfficer(o);
            continue;
          }
          o.moveToward(dt, o.x + Math.sin(o.heading) * 4, o.z + Math.cos(o.heading) * 4, 3, this.env.colliders);
        }
      } else {
        // Pursue on foot at 6.4 u/s.
        o.state = 'pursue';
        if (d > 1.4) o.moveToward(dt, px, pz, 6.4, this.env.colliders);
        if (o.drawn && d < 38) this.officerShoot(dt, o, H, d);
        // Fell far behind: give up and head back.
        if (d > 70 && o.car) o.state = 'return';
      }
      o.syncMesh();
    }

    // The bust meter: sustained proximity on foot fills it over ~2.5 s.
    // It only fills while the player is slow or stationary — a player
    // who keeps moving at walking pace or better is not busted, and
    // running off breaks the proximity so the meter drains again.
    // The car radius has to be measured from the car's centre: a car
    // that has pulled up beside the player sits several units away by
    // centre, and a car staged or settled next to the player can be
    // pushed a little further by collision (for example out of a
    // building footprint overlapping the stop point) while its crew
    // is plainly right there arresting them. A five-unit centre
    // radius missed exactly that stopped-car case in the live loop,
    // so the meter never filled no matter how long the car waited.
    let filling = false;
    const playerSpeed = Math.abs(H.player.speedNow || 0);
    if (onFoot && wanted.level > 0 && playerSpeed < 3) {
      for (const car of this.cars) {
        if (Math.abs(car.speed) < 2.5 && dist2d(px, pz, car.x, car.z) < 8.5) filling = true;
      }
      for (const o of this.officers) {
        if (!o.drawn && dist2d(px, pz, o.x, o.z) < 1.6) filling = true;
      }
    }
    if (filling) this.bust = Math.min(1, this.bust + dt / 2.5);
    else this.bust = Math.max(0, this.bust - dt * 0.8);
    return this.bust;
  }

  officerShoot(dt, o, H, d) {
    o.fireT -= dt;
    if (o.fireT > 0) return;
    o.fireT = this.rng.range(1.7, 2.8);
    this.env.audio.enemyShoot();
    this.env.tracer(o.x, o.z, H.player.x, H.player.z);
    // Deliberately weak: 34% hits for 3–6.5 damage.
    if (this.rng.chance(0.34) && !this.env.lineBlocked(o.x, o.z, H.player.x, H.player.z)) {
      H.hurtPlayer(this.rng.range(3, 6.5), o.x, o.z);
    }
  }
}
