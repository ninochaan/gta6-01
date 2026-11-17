// Save and load for Solmar Bay. One small JSON object in localStorage holds
// the player's money, experience, story progress and last position, so the
// Continue button on the start screen can pick the story back up.
import { SAVE_KEY } from './config.js';

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function saveGame(game) {
  const p = game.player;
  const data = {
    version: 1,
    savedAt: Date.now(),
    cash: game.cash,
    xp: game.xp,
    missionIndex: game.missions.done,
    player: { x: p.pos.x, z: p.pos.z, heading: p.heading, health: p.health },
    ammo: p.ammo,
    wanted: 0,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
}

// Apply a loaded save onto a fresh game object. Returns true when applied.
export function applySave(game, data) {
  if (!data) return false;
  game.cash = data.cash || 0;
  game.xp = data.xp || 0;
  game.missions.done = data.missionIndex || 0;
  if (data.player) {
    game.player.pos.x = data.player.x || 0;
    game.player.pos.z = data.player.z || 40;
    game.player.heading = data.player.heading || 0;
    game.player.health = data.player.health || 100;
    game.player.ammo = data.ammo != null ? data.ammo : 12;
  }
  return true;
}
