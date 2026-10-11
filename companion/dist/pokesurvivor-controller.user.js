// ==UserScript==
// @name PokéSurvivor Thor Controller
// @namespace pokesurvivor-thor-controller
// @version 0.3.0
// @description Joystick, buttons and menus on the official online game. Website accounts and cloud saves remain unchanged.
// @match https://pokesurvivor.com/*
// @match https://www.pokesurvivor.com/*
// @run-at document-end
// @grant none
// @inject-into page
// @noframes
// @license MIT
// ==/UserScript==
/* Original game copyright (c) 2026 JPTER78.
PokéSurvivor — licencias

1) CÓDIGO (todo lo que hay en js/, css/, index.html, tools/ y la música de
   js/data/music.js): licencia MIT.

MIT License

Copyright (c) 2026 JPTER78

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

2) CONTENIDO DE TERCEROS (NO cubierto por la licencia MIT):

- assets/pokemon/: sprites de SpriteCollab (https://github.com/PMDCollab/SpriteCollab),
  licencia CC BY-NC 4.0. Uso NO comercial y con atribución; los autores están
  en CREDITS.md.
- assets/fonts/: Pixelify Sans, SIL Open Font License 1.1 (assets/fonts/OFL.txt).
- js/data/pokedex.js: datos obtenidos de PokeAPI (https://pokeapi.co/).

3) MARCAS

Pokémon y todos los nombres y personajes relacionados son marcas y propiedad
de Nintendo, Creatures Inc., GAME FREAK y The Pokémon Company. Este es un
proyecto de fan sin ánimo de lucro, no afiliado ni aprobado por ellos.

*/
(() => {
  if (window.top !== window.self || location.protocol !== 'https:' || !['pokesurvivor.com','www.pokesurvivor.com'].includes(location.hostname)) return;
  if (window.__PS_ONLINE_CONTROLLER__) return;
  const status = window.__PS_ONLINE_CONTROLLER__ = { version: '0.3.0', state: 'waiting' };
  let attempts = 0;
  function attach() {
    const G = window.G;
    if (!G?.Game || !G.Input?.axis || !G.Input?.tap || !G.Input?.endFrame || !G.I18n?.add || !G.SettingsUI || !G.UI) {
      if (++attempts < 75) return setTimeout(attach, 400);
      status.state = 'incompatible'; console.warn('[Thor controls] Game interfaces unavailable; reload or update the add-on.'); return;
    }
    if (G.Gamepad && G.ControllerUI) { status.state = 'native'; return; }
    if (G.Gamepad || G.ControllerUI) { status.state = 'incompatible'; return; }
    if (!navigator.getGamepads) { status.state = 'unsupported'; G.UI.toast('This browser has no gamepad input.'); return; }
    try {
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

      /* Controller menus: focus visible controls, trap overlays, and reuse their click handlers. */
G.ControllerUI = (() => {
  const SELECTOR = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [tabindex], .tab, .cell, .card, .fav-slot, #user-pill, #slot, #tap-start';
  let root = null, focused = null, index = 0, editing = null, mode = false, blocking = false;
  let keyIdentity = '', keyboard = null, captureEl = null;
  const memory = new Map();
  G.I18n.add({
    'Mando':'Controller', 'Escribir con el mando':'Controller keyboard', 'Símbolos':'Symbols', 'Mayúsculas':'Shift', 'Espacio':'Space', 'Borrar':'Delete', 'Listo':'Done',
    'Stick horizontal (derecha)':'Horizontal stick (right)', 'Stick vertical (abajo)':'Vertical stick (down)',
    'Confirmar':'Confirm', 'Volver':'Back', 'Pausa':'Pause', 'Ataque 1':'Move 1', 'Ataque 2':'Move 2', 'Ataque 3':'Move 3', 'Ataque 4':'Move 4',
    'Ataque anterior':'Previous move', 'Ataque siguiente':'Next move', 'Arriba':'Up', 'Abajo':'Down', 'Izquierda':'Left', 'Derecha':'Right',
    'Restablecer mando':'Reset controller', 'Cambiar control':'Remap control',
    'Configura los controles si no coinciden':'Remap controls if needed',
    'Pulsa un botón del mando para conectarlo':'Press a controller button to connect',
    'Mueve el stick a la derecha':'Move the stick to the right', 'Mueve el stick hacia abajo':'Move the stick down',
    'Pulsa el botón o gatillo que quieres usar':'Press the button or trigger you want to use',
    'Se cancela en 15 segundos si no pulsas nada.':'Cancels in 15 seconds if no input is received.',
    'Stick o cruceta: moverse y navegar. Botón inferior: confirmar. Botón derecho: volver. L/R o gatillos: cambiar ataque. Start: pausa.':
      'Stick or D-pad: move and navigate. Bottom button: confirm. Right button: back. L/R or triggers: switch moves. Start: pause.',
    'Selecciona un control para cambiarlo. Los cambios se guardan para este mando en este dispositivo.':
      'Select a control to remap it. Bindings are saved for this controller on this device.'
  });
  const T = s => G.T ? G.T(s) : s;
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function visible(el) {
    return !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[aria-hidden=true]');
  }
  function scope() {
    const layers = [...document.querySelectorAll('.scr, .sound-panel, #pull-fx, #tap-start, #invite-pop, #rotate, #pad-keyboard, #pad-capture, .boot')].filter(visible);
    // Matching the CSS stack also covers dynamic account confirmation dialogs.
    return layers.map((el,i)=>({el,i,z:parseInt(getComputedStyle(el).zIndex,10)||0})).sort((a,b)=>b.z-a.z||b.i-a.i)[0]?.el || null;
  }
  function controls(layer) {
    if (!layer) return [];
    const nodes = [...layer.querySelectorAll(SELECTOR)];
    if (layer.matches(SELECTOR)) nodes.unshift(layer);
    if (layer.id === 'scr-menu') nodes.push(...document.querySelectorAll('#topbar button, #user-pill, #credits-line a'));
    return [...new Set(nodes)].filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'
      && !el.closest('#cards.done') && !(el.matches('.cell,.card,.fav-slot') && !el.onclick));
  }
  function identity(el) {
    if (!el) return '';
    if (el.id) return '#' + el.id;
    const data = ['go','t','tab','k','v','padBind','char'].map(k=>el.dataset[k]||'').join(':');
    return el.tagName + ':' + data + (data.replace(/:/g,'') ? '' : ':' + el.textContent.trim());
  }
  function focus(el, scroll = true) {
    if (!el || el === focused && el.classList.contains('pad-focus')) return;
    if (focused) focused.classList.remove('pad-focus');
    focused = el;
    if (!el.matches('button,a,input,select,textarea') && !el.hasAttribute('tabindex')) {
      el.tabIndex = 0; el.setAttribute('role','button');
    }
    el.classList.add('pad-focus');
    el.focus({preventScroll:true});
    if (scroll) el.scrollIntoView({block:'nearest',inline:'nearest'});
    const items = controls(root); index = items.indexOf(el); keyIdentity = identity(el);
    memory.set(root,{index,keyIdentity});
  }
  function setMode(on) {
    mode = on; document.body.classList.toggle('gamepad-mode',on);
    if (!on) { focused?.classList.remove('pad-focus'); editing?.classList.remove('pad-edit'); editing = null; }
  }
  function init() {
    document.addEventListener('pointerdown',()=>setMode(false),true);
    document.addEventListener('keydown',e=>{
      if (e.key === 'Escape' && G.Gamepad.capturing) { G.Gamepad.cancelCapture(); e.preventDefault(); e.stopImmediatePropagation(); return; }
      setMode(false);
      if (['Enter',' '].includes(e.key) && e.target.matches('[role=button]:not(button):not(a):not(input):not(select):not(textarea)')) {
        e.preventDefault(); e.target.click();
      }
    },true);
  }
  function changeValue(el, step) {
    if (el.tagName === 'SELECT') {
      const options = [...el.options].filter(o=>!o.disabled && !o.hidden);
      const old = options.indexOf(el.selectedOptions[0]);
      const next = options[Math.max(0,Math.min(options.length-1,old+step))];
      if (!next || next === el.selectedOptions[0]) return;
      el.value = next.value;
    } else {
      const min=Number(el.min||0), max=Number(el.max||100), size=Number(el.getAttribute('step'))||((max-min)/20)||1;
      el.value = Math.max(min,Math.min(max,Number(el.value)+step*size));
    }
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function navigate(dir, items) {
    if (!focused) { focus(items[0]); return; }
    if (focused.matches('input[type=range],select') && (dir === 'left' || dir === 'right' || editing === focused)) {
      changeValue(focused,dir==='left'||dir==='up'?-1:1); return;
    }
    const a=focused.getBoundingClientRect(), ax=a.x+a.width/2, ay=a.y+a.height/2;
    const horiz=dir==='left'||dir==='right', sign=dir==='left'||dir==='up'?-1:1;
    let best=null, score=Infinity;
    for(const el of items) {
      if(el===focused) continue;
      const b=el.getBoundingClientRect(), dx=b.x+b.width/2-ax, dy=b.y+b.height/2-ay;
      const along=(horiz?dx:dy)*sign, cross=Math.abs(horiz?dy:dx);
      if(along<=2) continue;
      const overlap=horiz ? b.bottom>a.top+2&&b.top<a.bottom-2 : b.right>a.left+2&&b.left<a.right-2;
      const cost=along+cross*3+(overlap?0:1000);
      if(cost<score) {score=cost;best=el;}
    }
    if(!best) best=items[(items.indexOf(focused)+(sign>0?1:-1)+items.length)%items.length];
    focus(best);
    if(G.Audio) G.Audio.sfx('hover');
  }
  function activate(el) {
    if(!el) return;
    if(el.tagName==='SELECT') { editing=editing===el?null:el; el.classList.toggle('pad-edit',editing===el); return; }
    if(el.matches('input:not([type=range]):not([type=checkbox]):not([type=radio]),textarea')) { openKeyboard(el); return; }
    el.click();
  }
  function back(layer) {
    if(editing) {editing.classList.remove('pad-edit');editing=null;return;}
    if(keyboard) {finishKeyboard(false);return;}
    const ids = {
      'scr-settings':'set-close','scr-support':'sup-close','scr-legal':'legal-close','scr-profile':'prof-close',
      'scr-starters':'starter-back','scr-result':'res-other','scr-nick':'nick-later','scr-lobby':'lobby-menu',
      'scr-pause':'btn-resume','scr-over':'btn-again','invite-pop':'inv-no','pull-fx':'pull-close','scr-bond':'bond-back'
    };
    if(layer.id==='sound-panel') {layer.classList.add('hidden');return;}
    const el=layer.querySelector('[data-a=no]') || layer.querySelector('#fav-back') || layer.querySelector('[data-back]') || document.getElementById(ids[layer.id]);
    if(visible(el) && !el.disabled) el.click();
  }
  function update(now, pad = G.Gamepad) {
    const layer=scope(); blocking=!!layer;
    if(pad.activity) setMode(true);
    if(!pad.pad && mode) setMode(false);
    if(captureEl && !pad.capturing) {captureEl.remove();captureEl=null;}
    updateStatus();
    if(pad.capturing) return true;
    if(!mode || !layer) {if(focused) focused.classList.remove('pad-focus');return blocking;}
    if(root!==layer) {
      if(root) memory.set(root,{index,keyIdentity});
      root=layer; focused?.classList.remove('pad-focus'); editing?.classList.remove('pad-edit'); focused=null; editing=null;
      const saved=memory.get(root);index=saved?.index||0;keyIdentity=saved?.keyIdentity||'';
    }
    const items=controls(root);
    if(!items.length) { focused?.classList.remove('pad-focus'); focused=null;return true; }
    if(!items.includes(focused)) {
      const remembered=items.find(e=>identity(e)===keyIdentity);
      const preferred=root.id==='scr-pause'?document.getElementById('btn-resume'):root.id==='scr-menu'?root.querySelector('[data-go=play]'):null;
      focus(remembered||preferred||items[Math.min(index,items.length-1)],false);
    } else if(!focused.classList.contains('pad-focus')) focus(focused,false);
    if(pad.tap('cancel') || pad.tap('pause')) {back(root);return true;}
    const dir=pad.direction(now); if(dir && items.length) navigate(dir,items);
    if(pad.tap('confirm')) activate(focused);
    return true;
  }

  // A small controller keyboard keeps name, password and filter fields usable.
  function openKeyboard(input) {
    if(keyboard) return;
    const original=input.value, layer=document.createElement('section');
    layer.id='pad-keyboard';layer.className='scr dim';
    keyboard={input,original,layer,upper:false,symbols:false};
    layer.innerHTML=`<div class="box pad-keyboard-box"><h3>${T('Escribir con el mando')}</h3><p class="pad-text" translate="no"></p><div class="pad-keys"></div><div class="row wrap pad-key-actions"></div></div>`;
    document.body.appendChild(layer);renderKeyboard();
  }
  function renderKeyboard() {
    const {input,layer,upper,symbols}=keyboard;
    layer.querySelector('.pad-text').textContent=input.type==='password'?'•'.repeat(input.value.length):input.value||'…';
    const chars=upper?'ABCDEFGHIJKLMNOPQRSTUVWXYZ':'abcdefghijklmnopqrstuvwxyz';
    const grid=layer.querySelector('.pad-keys');grid.innerHTML='';
    const symbolsText = '@._-!?+/,:;#$%&*()[]=^{}<>\\|"\'`~';
    for(const c of '1234567890'+(symbols?symbolsText:chars+'@._-!?+/')) {
      const b=document.createElement('button');b.className='btn small';b.dataset.char=c;b.textContent=c;
      b.onclick=()=>{if(input.maxLength<0||input.value.length<input.maxLength) input.value+=c; keyboardText();};grid.appendChild(b);
    }
    const row=layer.querySelector('.pad-key-actions');row.innerHTML='';
    for(const [label,fn] of [
      ['Mayúsculas',()=>{keyboard.upper=!keyboard.upper;renderKeyboard();}],
      ['Símbolos',()=>{keyboard.symbols=!keyboard.symbols;renderKeyboard();}],
      ['Espacio',()=>{if(input.maxLength<0||input.value.length<input.maxLength) input.value+=' ';keyboardText();}],
      ['Borrar',()=>{input.value=input.value.slice(0,-1);keyboardText();}],
      ['Cancelar',()=>finishKeyboard(false)],['Listo',()=>finishKeyboard(true)]
    ]) {const b=document.createElement('button');b.className='btn small';b.textContent=T(label);b.onclick=fn;row.appendChild(b);}
  }
  function keyboardText() {
    const {input,layer}=keyboard;
    layer.querySelector('.pad-text').textContent=input.type==='password'?'•'.repeat(input.value.length):input.value||'…';
  }
  function finishKeyboard(commit) {
    const k=keyboard;keyboard=null;if(!k)return;
    if(!commit) k.input.value=k.original;
    k.layer.remove();
    if(commit) {k.input.dispatchEvent(new Event('input',{bubbles:true}));k.input.dispatchEvent(new Event('change',{bubbles:true}));}
    focused=null;keyIdentity=identity(k.input);
  }

  function settingsHTML() {
    const names={x:'Stick horizontal (derecha)',y:'Stick vertical (abajo)',confirm:'Confirmar',cancel:'Volver',pause:'Pausa',
      slot1:'Ataque 1',slot2:'Ataque 2',slot3:'Ataque 3',slot4:'Ataque 4',prev:'Ataque anterior',next:'Ataque siguiente',
      up:'Arriba',down:'Abajo',left:'Izquierda',right:'Derecha'};
    return `<h3 class="set-h">${T('Mando')}</h3><p id="pad-status" class="sub" translate="no"></p>
      <p class="sub">${T('Stick o cruceta: moverse y navegar. Botón inferior: confirmar. Botón derecho: volver. L/R o gatillos: cambiar ataque. Start: pausa.')}</p>
      <p class="sub">${T('Selecciona un control para cambiarlo. Los cambios se guardan para este mando en este dispositivo.')}</p>
      <div class="pad-bindings">${Object.entries(names).map(([k,n])=>`<button class="btn small" data-pad-bind="${k}">${T(n)} <small translate="no">${esc(G.Gamepad.describe(k))}</small></button>`).join('')}</div>
      <button id="pad-reset" class="btn small ghost">${T('Restablecer mando')}</button>`;
  }
  function wireSettings(box) {
    box.querySelectorAll('[data-pad-bind]').forEach(b=>{b.onclick=()=>{
      if(!G.Gamepad.pad) {G.UI.toast(T('Pulsa un botón del mando para conectarlo'));return;}
      const key=b.dataset.padBind, layer=document.createElement('section');
      layer.id='pad-capture';layer.className='scr dim';
      layer.innerHTML=`<div class="box center"><h3>${T('Cambiar control')}</h3><p translate="no">${esc(b.textContent)}</p><p>${T(key==='x'?'Mueve el stick a la derecha':'y'===key?'Mueve el stick hacia abajo':'Pulsa el botón o gatillo que quieres usar')}</p><p class="sub">${T('Se cancela en 15 segundos si no pulsas nada.')}</p><button class="btn" id="pad-cancel-capture">${T('Cancelar')}</button></div>`;
      document.body.appendChild(layer);captureEl=layer;
      layer.querySelector('button').onclick=()=>G.Gamepad.cancelCapture();
      G.Gamepad.listen(key,()=>{layer.remove();captureEl=null;box.querySelectorAll('[data-pad-bind]').forEach(el=>el.querySelector('small').textContent=G.Gamepad.describe(el.dataset.padBind));});
    };});
    const reset=box.querySelector('#pad-reset');if(reset) reset.onclick=()=>{G.Gamepad.reset();box.querySelectorAll('[data-pad-bind]').forEach(b=>b.querySelector('small').textContent=G.Gamepad.describe(b.dataset.padBind));};
    updateStatus();
  }
  function updateStatus() {
    const el=document.getElementById('pad-status');if(!el)return;
    const pad=G.Gamepad.pad;
    const status=pad ? pad.id + (pad.mapping==='standard'?'': ' · '+T('Configura los controles si no coinciden')) : T('Pulsa un botón del mando para conectarlo');
    if(el.textContent!==status) el.textContent=status;
  }
  return {init,update,settingsHTML,wireSettings,
    command(action) {
      if(document.hidden) return;
      if(G.Gamepad.capturing) {if(action==='cancel')G.Gamepad.cancelCapture();return;}
      if(!['up','down','left','right','confirm','cancel'].includes(action)) return;
      update(performance.now(),{pad:{id:'Thor panel'},activity:true,capturing:false,
        direction:()=>['up','down','left','right'].includes(action)?action:'',tap:key=>key===action});
    },
    get focusLabel() {
      if(['scr-login','pad-keyboard'].includes(scope()?.id)) return 'Use the top screen for text/sign-in';
      if(!['scr-menu','scr-settings','scr-pause','scr-starters','scr-test','scr-over'].includes(scope()?.id)||focused?.id==='user-pill')return '';
      return focused?.matches('button,[role=button],.cell,.card,.tab') ? (focused.getAttribute('aria-label')||focused.textContent||'').trim().slice(0,100) : '';
    },
    goBack(){const layer=scope();if(layer)back(layer);},get screen(){return scope()?.id||'';},get blocking(){return blocking;}};
})();

      /* Controller-only attachment to the live game; authentication and saves stay with the website. */
function installOnlineController(G) {
  const input = G.Input, original = { axis: input.axis, tap: input.tap, endFrame: input.endFrame };
  let processed = false, disposed = false;
  function advance() {
    if (processed || disposed) return;
    processed = true;
    const now = performance.now();
    G.Gamepad.update(now);
    const menu = G.ControllerUI.update(now);
    if (!menu && G.Game.state === 'playing') {
      if (G.Gamepad.tap('pause')) { G.Game.togglePause(); return; }
      const p = G.Game.player;
      if (!p) return;
      for (let n = 0; n < 4; n++) if (G.Gamepad.tap('slot' + (n + 1))) p.setActive(n);
      if (G.Gamepad.tap('prev')) p.cycle(-1);
      if (G.Gamepad.tap('next')) p.cycle(1);
    }
  }
  input.tap = function (...args) { advance(); return original.tap.apply(this, args); };
  input.axis = function (...args) {
    advance();
    if (G.ControllerUI.blocking) return [0, 0];
    const existing = original.axis.apply(this, args);
    return existing[0] || existing[1] ? existing : G.Gamepad.axis();
  };
  input.endFrame = function (...args) {
    // Some results screens don't query keyboard input. Poll them before ending the frame.
    advance();
    original.endFrame.apply(this, args);
    processed = false;
  };
  const wrapped = { axis: input.axis, tap: input.tap, endFrame: input.endFrame };
  function settings() {
    const tab = document.querySelector('#set-tabs [data-t=ctl].on');
    const box = document.querySelector('#set-body');
    if (!tab || !box || box.querySelector('#thor-online-bindings')) return;
    const section = document.createElement('div');
    section.id = 'thor-online-bindings';
    section.innerHTML = G.ControllerUI.settingsHTML();
    box.prepend(section);
    G.ControllerUI.wireSettings(section);
  }
  const settingsRoot = document.querySelector('#scr-settings');
  const observer = settingsRoot && typeof MutationObserver !== 'undefined' ? new MutationObserver(settings) : null;
  observer?.observe(settingsRoot, { childList: true, subtree: true });
  settings();
  return { dispose() {
    disposed = true;
    observer?.disconnect();
    document.querySelector('#thor-online-bindings')?.remove();
    for (const key of Object.keys(original)) if (input[key] === wrapped[key]) input[key] = original[key];
  } };
}


      const style = document.createElement('style'); style.id = 'thor-online-style'; style.textContent = ".gamepad-mode .pad-focus { outline: 3px solid #ffd23f !important; outline-offset: 2px; box-shadow: 0 0 0 5px rgba(255,210,63,.2); }\r\n.gamepad-mode .pad-edit { outline-color: #82e8ff !important; }\r\n.pad-bindings { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin: 12px 0; }\r\n.pad-bindings button { text-align: left; white-space: normal; }\r\n.pad-bindings small { display: block; opacity: .7; }\r\n#pad-keyboard, #pad-capture { z-index: 90; }\r\n.pad-keyboard-box { width: min(640px,100%); }\r\n.pad-text { min-height: 1.6em; overflow-wrap: anywhere; padding: 8px; background: #080f23; border-radius: 6px; }\r\n.pad-keys { display: grid; grid-template-columns: repeat(10,minmax(0,1fr)); gap: 6px; }\r\n.pad-keys .btn { padding: 8px 0; }\r\n.pad-key-actions { gap: 6px; margin-top: 12px; justify-content: center; }\r\n@media (max-height: 600px) { .pad-keyboard-box { padding: 10px; } .pad-text { margin: 4px 0; } .pad-keys .btn { padding: 4px 0; } }\r\n";
      document.head.appendChild(style);
      G.ControllerUI.init();
      installOnlineController(G);
      status.state = 'ready';
      G.UI.toast('Controller support enabled');
    } catch (error) { status.state = 'error'; console.error('[Thor controls]', error); }
  }
  attach();
})();