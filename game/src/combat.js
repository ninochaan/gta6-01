// combat.js — the player's pistol (12-round magazine, tracked reserve,
// ~0.33 s cooldown, ~12 damage a hit) and the gang squads it fights.

import { GangFighter, findCoverPoint } from './pedestrians.js';
import { dist2d } from './rng.js';

export class Combat {
  constructor(scene, rng, env) {
    this.scene = scene;
    this.rng = rng;
    this.env = env; // { colliders, audio, tracer, lineBlocked }
    this.gang = [];
    this.mag = 12;
    this.reserve = 36;
    this.fireCd = 0;
    this.reloadT = 0;
  }

  gangAlive() {
    return this.gang.filter((f) => !f.dead).length;
  }

  spawnGang(spots) {
    this.clearGang();
    const n = spots.length;
    spots.forEach(([x, z], i) => {
      const angle = (i / Math.max(1, n)) * Math.PI * 2 + this.rng.range(-0.3, 0.3);
      this.gang.push(new GangFighter(this.scene, x, z, angle, this.rng));
    });
    return this.gang;
  }

  clearGang() {
    for (const f of this.gang) this.scene.remove(f.mesh);
    this.gang = [];
  }

  claims() {
    const out = [];
    for (const f of this.gang) {
      if (!f.dead && f.coverPoint) out.push(f.coverPoint);
    }
    return out;
  }

  startReload() {
    if (this.reloadT > 0 || this.mag >= 12 || this.reserve <= 0) return;
    this.reloadT = 1.1;
  }

  playerShoot(H) {
    if (this.fireCd > 0 || this.reloadT > 0) return false;
    if (this.mag <= 0) {
      this.startReload();
      return false;
    }
    this.mag -= 1;
    this.fireCd = 0.33;
    H.playerFiredAt = H.now;
    this.env.audio.shoot();
    const px = H.player.x;
    const pz = H.player.z;
    const yaw = H.cameraYaw;
    // Aim convention (shared with the camera in main.js): the view
    // forward for cameraYaw is -(sin yaw, cos yaw) — yaw 0 fires
    // toward -Z, exactly where the camera is looking. Previously this
    // read the aim as +(sin yaw, cos yaw), so every shot went out
    // the back of the camera, 180 degrees from the staged aim.
    const aimX = -Math.sin(yaw);
    const aimZ = -Math.cos(yaw);
    // Find the fighter lying most squarely on the aim ray. Fighters
    // keep moving — advancing, retreating, diving for cover — during
    // the ~0.33 s the pistol takes to cycle between an aim and the
    // next shot, so the test is a body-width cylinder around the ray
    // (2 units of lateral slack) instead of a hairline angle: a
    // fighter aimed at squarely still connects as he moves, while a
    // fighter off the line or behind the player never does.
    let target = null;
    let targetPerp = Infinity;
    let targetAlong = Infinity;
    for (const f of this.gang) {
      if (f.dead) continue;
      const dx = f.x - px;
      const dz = f.z - pz;
      const along = dx * aimX + dz * aimZ;
      if (along <= 0 || along > 48) continue;
      const perp = Math.abs(dx * aimZ - dz * aimX);
      if (perp <= 2 && (perp < targetPerp || (perp === targetPerp && along < targetAlong))) {
        target = f;
        targetPerp = perp;
        targetAlong = along;
      }
    }
    // The whole squad dives for cover when shot at.
    const claims = this.claims();
    for (const f of this.gang) {
      if (!f.dead && f !== target) f.onShotAt(claims, this.env.colliders, H.player);
    }
    if (target && !this.env.lineBlocked(px, pz, target.x, target.z)) {
      this.env.tracer(px, pz, target.x, target.z);
      this.damageFighter(target, 12, H);
    } else {
      const ex = px + aimX * 30;
      const ez = pz + aimZ * 30;
      this.env.tracer(px, pz, ex, ez);
      if (target) this.env.tracer(px, pz, target.x, target.z);
    }
    if (this.mag === 0) this.startReload();
    return true;
  }

  damageFighter(f, dmg, H) {
    if (f.dead) return;
    f.health -= dmg;
    if (f.health <= 0) {
      f.kill(this.scene);
      // A member falling sends the nearby squad diving for cover.
      const claims = this.claims();
      for (const o of this.gang) {
        if (!o.dead && dist2d(o.x, o.z, f.x, f.z) < 20) o.onShotAt(claims, this.env.colliders, H.player);
      }
    }
  }

  update(dt, H) {
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(12 - this.mag, this.reserve);
        this.mag += take;
        this.reserve -= take;
      }
    }
    const env = {
      colliders: this.env.colliders,
      claims: this.claims(),
      audio: this.env.audio,
      tracer: this.env.tracer,
      lineBlocked: this.env.lineBlocked,
    };
    for (const f of this.gang) f.update(dt, H, env);
  }
}

// Re-exported so other modules can find the cover search through combat.
export { findCoverPoint };
