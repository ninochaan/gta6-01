// Solmar Bay — handover program for the gta6-01 entry (Node 22, stdlib only).
// The game itself is the static site under game/ (open game/index.html in a
// desktop browser, no build step, no network). This program copies game/ and
// screenshots/ into the output directory and writes dossier.json there with
// the vendored make.fun library, byte for byte as the scorer will recompute.
//
//   node serve.ts                                  play it locally on :8080
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   hand it in locally
// v3 round: foot police, smarter Los Brasa, Tito's Garage, arc turns and
// drooping palms — all inside game/, so this handover program is unchanged
// in behaviour and only this note is new.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps mirror the scorer's gate so this program refuses anything the
// scorer would refuse: dossier text budget, at most 4 screenshots of at most
// 256 KiB each, and game/ within its file-count, byte and path-length caps.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
