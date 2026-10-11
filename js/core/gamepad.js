/* Gamepad polling and device-local bindings. No synthetic keyboard events. */
G.Gamepad = (() => {
  const KEY = 'ps.gamepad';
  const DEFAULT = {
    x: { axis: 0, sign: 1 }, y: { axis: 1, sign: 1 },
    confirm: { button: 0 }, cancel: { button: 1 }, pause: { button: 9 },
    slot1: { button: 0 }, slot2: { button: 1 }, slot3: { button: 2 }, slot4: { button: 3 },
    prev: [{ button: 4 }, { button: 6 }], next: [{ button: 5 }, { button: 7 }],
    up: { button: 12 }, down: { button: 13 }, left: { button: 14 }, right: { button: 15 },
    deadzone: 0.18
  };
  let profiles = {};
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) profiles = saved;
  } catch (e) { /* Storage may be disabled. */ }
  let pad = null, previous = new Set(), held = new Set(), pressed = new Set();
  let vector = [0, 0], raw = [], rawBefore = new Set(), used = false, activity = false;
  let focused = true, disarmed = false, capture = null, repeatDir = '', repeatAt = 0;
  const rests = new Map();
  let externalSource = null;

  function valid(b, axisOnly = false) {
    if (!b || typeof b !== 'object') return false;
    if (Number.isInteger(b.axis) && b.axis >= 0 && b.axis < 32 && (b.sign === 1 || b.sign === -1)) return true;
    return !axisOnly && Number.isInteger(b.button) && b.button >= 0 && b.button < 128;
  }
  function profile(device = pad) {
    const saved = device && profiles[device.id];
    const p = { ...DEFAULT };
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(DEFAULT)) {
        const v = saved[k];
        if (k === 'deadzone') { if (Number.isFinite(v) && v >= .05 && v <= .5) p[k] = v; }
        else if (Array.isArray(v) && k !== 'x' && k !== 'y' && v.length && v.every(b => valid(b))) p[k] = v;
        else if (valid(v, k === 'x' || k === 'y')) p[k] = v;
      }
    }
    return p;
  }
  function axisValue(p, i) { const n = p.axes && p.axes[i]; return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0; }
  function buttonValue(p, i) {
    const b = p.buttons && p.buttons[i];
    return b && (b.pressed || (Number.isFinite(b.value) && b.value >= .5));
  }
  function value(b) {
    if (Array.isArray(b)) return b.some(value);
    return b.button !== undefined ? !!buttonValue(pad, b.button) : axisInput(pad, b.axis) * b.sign >= .5;
  }
  function axisInput(p, i) {
    const cfg = profile(p);
    const n = axisValue(p, i);
    // Stick axes stay centered at zero. Some nonstandard trigger axes rest at -1.
    if (i === cfg.x.axis || i === cfg.y.axis) return n;
    const rest = rests.get(p.id + ':' + p.index)?.[i] || 0;
    return (n - rest) / (rest ? 2 : 1);
  }
  function calibrate(p) {
    const key = p.id + ':' + p.index;
    if (rests.has(key)) return;
    const cfg = profile(p);
    rests.set(key, (p.axes || []).map((_, i) => {
      const n = axisValue(p, i);
      return p.mapping !== 'standard' && i !== cfg.x.axis && i !== cfg.y.axis && Math.abs(n) >= .95 ? Math.sign(n) : 0;
    }));
  }
  function rawInputs(p) {
    const inputs = [];
    (p.buttons || []).forEach((b, i) => { if (buttonValue(p, i)) inputs.push({ button: i }); });
    (p.axes || []).forEach((_, i) => { const n = axisInput(p, i); if (Math.abs(n) >= .7) inputs.push({ axis: i, sign: n > 0 ? 1 : -1 }); });
    return inputs;
  }
  const rawKey = b => b.button !== undefined ? 'b' + b.button : 'a' + b.axis + ':' + b.sign;
  function active(p) { return rawInputs(p).length > 0 || (p.axes || []).some((_, i) => Math.abs(axisInput(p, i)) > .25); }
  function clear() { previous.clear(); held.clear(); pressed.clear(); vector = [0, 0]; repeatDir = ''; }
  function pauseOnLoss() {
    if (G.Game && G.Game.state === 'playing' && !(G.Coop && G.Coop.active)) G.Game.togglePause();
  }
  function suspend() { clear(); disarmed = true; pauseOnLoss(); }
  addEventListener('blur', () => { focused = false; suspend(); });
  addEventListener('focus', () => { focused = true; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });

  function update(now = performance.now()) {
    pressed.clear(); activity = false; raw = [];
    let pads = [];
    try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(p => p && p.connected) : []; }
    catch (e) { /* Unsupported / insecure browser: keep keyboard and touch. */ }
    let external = [];
    try { external = externalSource?.() || []; } catch (e) { /* A disconnected companion is inert. */ }
    pads.push(...external);
    pads.forEach(calibrate);
    const old = pad;
    pad = old && pads.find(p => p.index === old.index && p.id === old.id) || null;
    if (old && !pad) { clear(); disarmed = true; capture = null; pauseOnLoss(); }
    // An idle second pad never takes over; a deliberate input can select it.
    const next = pads.find(p => active(p) && (!pad || p.index !== pad.index));
    if (!pad) pad = next || pads[0] || null;
    else if (next && !active(pad)) pad = next;
    if (old && pad && (old.id !== pad.id || old.index !== pad.index)) { clear(); rawBefore.clear(); disarmed = true; }
    if (!pad) { clear(); rawBefore.clear(); return; }
    const currentRaw = rawInputs(pad), keys = new Set(currentRaw.map(rawKey));
    raw = currentRaw.filter(b => !rawBefore.has(rawKey(b)));
    rawBefore = keys;
    if ((!focused && !external.includes(pad)) || document.hidden) { clear(); return; }
    if (disarmed) {
      clear();
      if (!active(pad)) disarmed = false;
      return;
    }
    const p = profile();
    let x = axisValue(pad, p.x.axis) * p.x.sign, y = axisValue(pad, p.y.axis) * p.y.sign;
    const mag = Math.hypot(x, y);
    if (mag <= p.deadzone) x = y = 0;
    else { const scale = Math.min(1, (mag - p.deadzone) / (1 - p.deadzone)) / mag; x *= scale; y *= scale; }
    held = new Set();
    for (const k of Object.keys(DEFAULT)) if (!['x', 'y', 'deadzone'].includes(k) && value(p[k])) held.add(k);
    if (held.has('left') || held.has('right') || held.has('up') || held.has('down')) {
      x = Number(held.has('right')) - Number(held.has('left'));
      y = Number(held.has('down')) - Number(held.has('up'));
      const m = Math.hypot(x,y); if (m) { x /= m; y /= m; }
    }
    vector = [x, y];
    for (const k of held) if (!previous.has(k)) pressed.add(k);
    activity = raw.length > 0 || !!(x || y);
    if (activity) used = true;
    previous = new Set(held);
    if (capture && now >= capture.until) cancelCapture();
    if (capture) {
      const b = raw.find(b => !capture.axisOnly || b.axis !== undefined);
      if (b) { const cb = capture.done, key = capture.key; capture = null; bind(key, b); clear(); disarmed = true; cb(true); }
    }
  }
  function bind(key, binding) {
    if (!pad || !Object.hasOwn(DEFAULT, key) || key === 'deadzone' || !valid(binding, key === 'x' || key === 'y')) return false;
    const p = profile(), old = p[key];
    // Swapping A/B or stick axes must not strand a controller-only player.
    const groups = [['x','y'], ['confirm','cancel','pause'], ['slot1','slot2','slot3','slot4'],
                    ['up','down','left','right'], ['prev','next']];
    const group = groups.find(g => g.includes(key)) || [];
    for (const other of group) {
      if (other === key) continue;
      const bindings = Array.isArray(p[other]) ? p[other] : [p[other]];
      if (bindings.some(b => key === 'x' || key === 'y' ? b.axis === binding.axis : rawKey(b) === rawKey(binding))) p[other] = old;
    }
    p[key] = { ...binding }; profiles[pad.id] = p;
    save(); return true;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(profiles)); } catch (e) { /* Session still works. */ } }
  function reset() { if (pad) { delete profiles[pad.id]; save(); clear(); disarmed = true; } }
  function listen(key, done) {
    if (!pad) return false;
    capture = { key, done, axisOnly: key === 'x' || key === 'y', until: performance.now() + 15000 }; return true;
  }
  function cancelCapture() { const c = capture; capture = null; if (c) c.done(false); }
  function direction(now) {
    if (capture) return '';
    const [x,y] = vector;
    const d = Math.max(Math.abs(x),Math.abs(y)) < .45 ? '' : Math.abs(x) > Math.abs(y) ? (x<0?'left':'right') : (y<0?'up':'down');
    if (!d) { repeatDir = ''; return ''; }
    if (d !== repeatDir) { repeatDir = d; repeatAt = now + 350; return d; }
    if (now >= repeatAt) { repeatAt = now + 120; return d; }
    return '';
  }
  function describe(key) {
    const label = b => b.button !== undefined ? 'B' + b.button : 'Axis ' + b.axis + (b.sign > 0 ? '+' : '−');
    const b = profile()[key]; return Array.isArray(b) ? b.map(label).join(' / ') : label(b);
  }
  return { update, bind, reset, listen, cancelCapture, direction, describe,
    setExternalSource(source) { externalSource = typeof source === 'function' ? source : null; clear(); disarmed = true; },
    axis: () => vector, tap: key => !capture && pressed.has(key), held: key => held.has(key),
    get pad() { return pad; }, get used() { return used; }, get activity() { return activity; },
    get capturing() { return !!capture; }, get raw() { return raw; }
  };
})();
