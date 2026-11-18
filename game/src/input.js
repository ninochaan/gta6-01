// v3: unchanged — the existing key-edge stream (E/K/F/R) already covers every new interaction.
// input.js — keyboard state, one-shot key presses, mouse look via pointer
// lock, and click-to-shoot edges. Everything else reads this; nothing else
// touches the DOM listeners.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();       // keys that went down since last consume()
    this.mouseDX = 0; this.mouseDY = 0;
    this.clicked = false;           // left button edge since last consume()
    this.locked = false;
    this.wantLock = true;
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); });
    canvas.addEventListener('click', () => {
      if (!this.locked && this.wantLock) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.locked) this.clicked = true;
    });
  }
  down(code) { return this.keys.has(code); }
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  // Call once per frame: returns the edges gathered since the previous frame.
  consume() {
    const out = { pressed: this.pressed, clicked: this.clicked, dx: this.mouseDX, dy: this.mouseDY };
    this.pressed = new Set();
    this.clicked = false;
    this.mouseDX = 0; this.mouseDY = 0;
    return out;
  }
}
