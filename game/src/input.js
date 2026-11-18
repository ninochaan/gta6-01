// input.js — keyboard and mouse state. The camera yaw/pitch live on the
// game handle; this module feeds them from pointer-lock mouse movement
// and from the arrow keys, and tracks which keys are held.

export class Input {
  constructor(canvas, handle) {
    this.keys = new Set();
    this.pressed = new Set();
    this.handle = handle;
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (handle.playing && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch { /* headless is fine */ }
      }
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      handle.cameraYaw -= e.movementX * 0.0026;
      handle.cameraPitch = Math.max(-0.15, Math.min(1.05, handle.cameraPitch + e.movementY * 0.0022));
    });
    addEventListener('mousedown', (e) => {
      if (e.button === 0 && document.pointerLockElement === canvas) this.pressed.add('MouseFire');
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  // Called once per frame after the systems have read the edge presses.
  endFrame(dt) {
    const h = this.handle;
    const turn = 1.9 * dt;
    if (this.down('ArrowLeft')) h.cameraYaw += turn;
    if (this.down('ArrowRight')) h.cameraYaw -= turn;
    if (this.down('ArrowUp')) h.cameraPitch = Math.max(-0.15, h.cameraPitch - turn * 0.5);
    if (this.down('ArrowDown')) h.cameraPitch = Math.min(1.05, h.cameraPitch + turn * 0.5);
    this.pressed.clear();
  }
}
