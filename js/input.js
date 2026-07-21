const Input = (function () {
  const keys = new Set();
  const touch = { throttle: false, brake: false, left: false, right: false };

  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  function bindTouchButton(id, prop) {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); touch[prop] = true; };
    const off = (e) => { e.preventDefault(); touch[prop] = false; };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  }
  bindTouchButton('touchThrottle', 'throttle');
  bindTouchButton('touchBrake', 'brake');
  bindTouchButton('touchLeft', 'left');
  bindTouchButton('touchRight', 'right');

  if ('ontouchstart' in window) {
    const tc = document.getElementById('touchControls');
    if (tc) tc.classList.add('enabled');
  }

  function getControls() {
    const up = keys.has('ArrowUp') || keys.has('KeyW') || touch.throttle;
    const down = keys.has('ArrowDown') || keys.has('KeyS') || touch.brake;
    const left = keys.has('ArrowLeft') || keys.has('KeyA') || touch.left;
    const right = keys.has('ArrowRight') || keys.has('KeyD') || touch.right;
    const brake = keys.has('Space');

    let throttle = 0;
    if (up) throttle = 1;
    else if (down) throttle = -1;

    let steer = 0;
    if (left) steer -= 1;
    if (right) steer += 1;

    return { throttle, steer, brake };
  }

  function isPressed(code) {
    return keys.has(code);
  }

  return { getControls, isPressed };
})();
