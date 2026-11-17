// The HUD and the menus: wanted stars, cash, health, ammo, speed, the mission
// panel, the minimap canvas, and the start, pause, busted and wasted screens.
// All of it is plain DOM over the 3D canvas, so it stays readable in a photo.
export function createHud(game) {
  const hud = {
    root: null, starsEl: null, cashEl: null, levelEl: null, healthBar: null,
    ammoEl: null, speedEl: null, missionEl: null, timerEl: null, promptEl: null,
    messageEl: null, bannerEl: null, menuEl: null, pauseEl: null, endEl: null,
    damageEl: null, crossEl: null, minimap: null, messageTimer: null,
  };

  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div id="mission-panel"><div id="mission-title">SOLMAR BAY</div><div id="mission-text">Press Enter to start your first job.</div><div id="mission-timer"></div></div>
    <div id="top-right"><div id="stars"></div><div id="cash">$0</div><div id="level">LVL 1 · 0 XP</div></div>
    <div id="bottom-right"><div id="health-wrap"><div id="health-bar"></div><span id="health-label">100</span></div><div id="ammo">PISTOL 12 / 96</div><div id="speed">0 km/h</div></div>
    <canvas id="minimap" width="220" height="220"></canvas>
    <div id="crosshair">+</div>
    <div id="prompt"></div>
    <div id="message"></div>
    <div id="banner"><div id="banner-title"></div><div id="banner-sub"></div></div>
    <div id="damage"></div>
    <div id="menu" class="overlay">
      <div class="card">
        <h1>SOLMAR BAY</h1>
        <p class="tag">An original open-world crime story. A sun-soaked coastal city, a crew to build, and a Commodore to rob.</p>
        <p class="story">Ray Marlowe is home after five years away. Lena Voss has work, Marco Hale has a garage, and the Commodore owns the harbor. Five jobs stand between Ray and the biggest score Solmar Bay has ever seen.</p>
        <div class="controls">WASD move · Mouse drag camera · E enter / steal car · Click shoot · F punch · R reload · Shift run · P pause · H help · M mute</div>
        <div class="buttons"><button id="btn-start">START STORY</button><button id="btn-continue">CONTINUE</button><button id="btn-help">HELP</button></div>
        <p class="foot">Everything here is original — no names, art or music from any commercial game.</p>
      </div>
    </div>
    <div id="help" class="overlay hidden">
      <div class="card"><h2>HOW TO PLAY</h2>
      <p>On foot: WASD to move, drag the mouse to look, Shift to run. Walk up to a parked or traffic car and press E to steal it — the police will notice.</p>
      <p>Driving: W accelerate, S brake / reverse, A and D steer. Cars handle differently; the gold coupe is the fastest thing in the city.</p>
      <p>Combat: left click fires your pistol, F throws a punch, R reloads. Gunfire and car theft raise your wanted level; hide from the police and it cools off.</p>
      <p>Missions: follow the gold beacon and the gold marker on the minimap. Finish all five jobs to pull off the Harbor Heist. Press N to retry a failed job.</p>
      <p>Progress saves automatically after every job. P pauses, M mutes.</p>
      <div class="buttons"><button id="btn-help-close">BACK</button></div></div>
    </div>
    <div id="pause" class="overlay hidden">
      <div class="card"><h2>PAUSED</h2><p>Solmar Bay waits for you.</p>
      <div class="buttons"><button id="btn-resume">RESUME</button><button id="btn-save-quit">SAVE &amp; QUIT TO MENU</button></div></div>
    </div>
    <div id="busted" class="overlay hidden">
      <div class="card"><h2>BUSTED</h2><p>The Solmar Bay police have you. Your crew posts bail — you lose $200 and the job resets.</p>
      <div class="buttons"><button id="btn-busted">BACK TO THE STREETS</button></div></div>
    </div>
    <div id="wasted" class="overlay hidden">
      <div class="card"><h2>WASTED</h2><p>Ray is down. The crew patches him up and drops him at the plaza — $200 lighter, but alive.</p>
      <div class="buttons"><button id="btn-wasted">BACK TO THE STREETS</button></div></div>
    </div>
    <div id="storyend" class="overlay hidden">
      <div class="card"><h2>THE HARBOR HEIST</h2><p>The Commodore's gold coupe is Marco's now, the crew is rich, and Solmar Bay belongs to Ray Marlowe. Story complete — free roam continues. Thank you for playing.</p>
      <div class="buttons"><button id="btn-freeroam">KEEP EXPLORING</button></div></div>
    </div>`;
  document.body.appendChild(root);
  hud.root = root;
  hud.starsEl = root.querySelector('#stars');
  hud.cashEl = root.querySelector('#cash');
  hud.levelEl = root.querySelector('#level');
  hud.healthBar = root.querySelector('#health-bar');
  hud.ammoEl = root.querySelector('#ammo');
  hud.speedEl = root.querySelector('#speed');
  hud.missionEl = root.querySelector('#mission-text');
  hud.missionTitle = root.querySelector('#mission-title');
  hud.timerEl = root.querySelector('#mission-timer');
  hud.promptEl = root.querySelector('#prompt');
  hud.messageEl = root.querySelector('#message');
  hud.bannerEl = root.querySelector('#banner');
  hud.menuEl = root.querySelector('#menu');
  hud.helpEl = root.querySelector('#help');
  hud.pauseEl = root.querySelector('#pause');
  hud.bustedEl = root.querySelector('#busted');
  hud.wastedEl = root.querySelector('#wasted');
  hud.storyEl = root.querySelector('#storyend');
  hud.damageEl = root.querySelector('#damage');
  hud.crossEl = root.querySelector('#crosshair');
  hud.minimap = root.querySelector('#minimap');

  hud.updateStars = () => {
    let s = '';
    for (let i = 1; i <= 5; i++) s += i <= game.wanted ? '★' : '☆';
    hud.starsEl.textContent = s;
    hud.starsEl.className = game.wanted > 0 ? 'hot' : '';
  };
  hud.updateCash = () => { hud.cashEl.textContent = '$' + game.cash; };
  hud.updateLevel = () => {
    const level = Math.floor(game.xp / 300) + 1;
    hud.levelEl.textContent = 'LVL ' + level + ' · ' + game.xp + ' XP';
  };
  hud.updateHealth = () => {
    const h = Math.max(0, Math.round(game.player.health));
    hud.healthBar.style.width = h + '%';
    hud.healthBar.style.background = h > 50 ? '#4caf50' : (h > 25 ? '#ff9800' : '#f44336');
    root.querySelector('#health-label').textContent = h;
  };
  hud.updateAmmo = () => {
    const p = game.player;
    hud.ammoEl.textContent = p.reloading > 0 ? 'RELOADING…' : 'PISTOL ' + p.ammo + ' / ' + p.reserve;
  };
  hud.updateSpeed = () => {
    const car = game.player.car;
    hud.speedEl.textContent = car ? Math.round(Math.abs(car.speed) * 3.6) + ' km/h · ' + car.model.name : 'ON FOOT';
  };
  hud.updateMissionPanel = () => {
    const m = game.missions;
    if (m.active) {
      hud.missionTitle.textContent = m.active.def.title;
      hud.missionEl.textContent = m.active.def.steps[m.active.step].text;
      hud.timerEl.textContent = m.active.timer > 0 ? '⏱ ' + Math.ceil(m.active.timer) + 's' : '';
    } else if (m.storyDone) {
      hud.missionTitle.textContent = 'FREE ROAM';
      hud.missionEl.textContent = 'Story complete. Solmar Bay is yours.';
      hud.timerEl.textContent = '';
    } else {
      hud.missionTitle.textContent = 'SOLMAR BAY';
      hud.missionEl.textContent = m.nextTimer > 0 ? 'Next job starting…' : 'Press N to start your next job.';
      hud.timerEl.textContent = '';
    }
  };
  hud.showMessage = (text) => {
    hud.messageEl.textContent = text;
    hud.messageEl.classList.add('show');
    clearTimeout(hud.messageTimer);
    hud.messageTimer = setTimeout(() => hud.messageEl.classList.remove('show'), 4000);
  };
  hud.showPrompt = (text) => { hud.promptEl.textContent = text; };
  hud.clearPrompt = () => { hud.promptEl.textContent = ''; };
  hud.showBanner = (title, sub) => {
    root.querySelector('#banner-title').textContent = title;
    root.querySelector('#banner-sub').textContent = sub || '';
    hud.bannerEl.classList.add('show');
    clearTimeout(hud.bannerTimer);
    hud.bannerTimer = setTimeout(() => hud.bannerEl.classList.remove('show'), 4500);
  };
  hud.flashDamage = () => {
    hud.damageEl.classList.add('hit');
    setTimeout(() => hud.damageEl.classList.remove('hit'), 180);
  };
  hud.flashCrosshair = () => {
    hud.crossEl.classList.add('fire');
    setTimeout(() => hud.crossEl.classList.remove('fire'), 90);
  };
  hud.showMenu = () => {
    hud.menuEl.classList.remove('hidden');
    root.querySelector('#btn-continue').style.display = game.hasSave ? '' : 'none';
  };
  hud.hideMenu = () => hud.menuEl.classList.add('hidden');
  hud.showHelp = () => hud.helpEl.classList.remove('hidden');
  hud.hideHelp = () => hud.helpEl.classList.add('hidden');
  hud.showPause = () => hud.pauseEl.classList.remove('hidden');
  hud.hidePause = () => hud.pauseEl.classList.add('hidden');
  hud.showBusted = () => hud.bustedEl.classList.remove('hidden');
  hud.hideBusted = () => hud.bustedEl.classList.add('hidden');
  hud.showWasted = () => hud.wastedEl.classList.remove('hidden');
  hud.hideWasted = () => hud.wastedEl.classList.add('hidden');
  hud.showStoryEnd = () => hud.storyEl.classList.remove('hidden');
  hud.hideStoryEnd = () => hud.storyEl.classList.add('hidden');
  hud.setCrosshair = (on) => { hud.crossEl.style.display = on ? 'block' : 'none'; };

  hud.refreshAll = () => {
    hud.updateStars(); hud.updateCash(); hud.updateLevel();
    hud.updateHealth(); hud.updateAmmo(); hud.updateSpeed(); hud.updateMissionPanel();
  };
  return hud;
}
