/* Keyboard, gamepad and a floating touch/drag joystick, merged into one movement axis. */
(function (OO) {
  'use strict';

  const I = {
    keys: new Set(),
    pressed: new Set(),
    axis: { x: 0, y: 0 },
    stick: { active: false, id: null, sx: 0, sy: 0, x: 0, y: 0, max: 60 },
  };

  const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

  I.attach = function (canvas) {
    window.addEventListener('keydown', (e) => {
      if (MOVE_KEYS.includes(e.code)) e.preventDefault();
      if (!e.repeat) I.pressed.add(e.code);
      I.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => I.keys.delete(e.code));
    window.addEventListener('blur', () => { I.keys.clear(); I.stick.active = false; });

    canvas.addEventListener('pointerdown', (e) => {
      if (I.stick.active) return;
      I.stick.active = true; I.stick.id = e.pointerId;
      I.stick.sx = I.stick.x = e.clientX;
      I.stick.sy = I.stick.y = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!I.stick.active || e.pointerId !== I.stick.id) return;
      I.stick.x = e.clientX; I.stick.y = e.clientY;
    });
    const end = (e) => { if (e.pointerId === I.stick.id) I.stick.active = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  };

  I.down = (code) => I.keys.has(code);

  /** True once per key press. */
  I.consume = function (code) {
    if (I.pressed.has(code)) { I.pressed.delete(code); return true; }
    return false;
  };

  I.update = function () {
    let x = 0, y = 0;
    if (I.down('KeyA') || I.down('ArrowLeft')) x -= 1;
    if (I.down('KeyD') || I.down('ArrowRight')) x += 1;
    if (I.down('KeyW') || I.down('ArrowUp')) y -= 1;
    if (I.down('KeyS') || I.down('ArrowDown')) y += 1;

    if (I.stick.active) {
      const dx = I.stick.x - I.stick.sx, dy = I.stick.y - I.stick.sy;
      const d = Math.hypot(dx, dy);
      if (d > 6) { const m = Math.min(1, d / I.stick.max); x = (dx / d) * m; y = (dy / d) * m; }
    }

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const gx = p.axes[0] || 0, gy = p.axes[1] || 0;
      if (Math.hypot(gx, gy) > 0.2) { x = gx; y = gy; }
      if (p.buttons[9] && p.buttons[9].pressed && !I._padStart) I.pressed.add('Escape');
      I._padStart = !!(p.buttons[9] && p.buttons[9].pressed);
      break;
    }

    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    I.axis.x = x; I.axis.y = y;
  };

  I.endFrame = function () { I.pressed.clear(); };

  OO.Input = I;
})(window.OO = window.OO || {});
