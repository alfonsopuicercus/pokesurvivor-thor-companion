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
