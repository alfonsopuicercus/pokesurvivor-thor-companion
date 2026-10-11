// ==UserScript==
// @name PokéSurvivor Thor Companion
// @namespace pokesurvivor-thor-companion
// @version 0.3.0
// @description Pair the official online game with the Thor lower-screen companion.
// @match https://pokesurvivor.com/*
// @match https://www.pokesurvivor.com/*
// @run-at document-end
// @inject-into content
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_registerMenuCommand
// @grant GM_xmlhttpRequest
// @grant GM_addElement
// @connect 127.0.0.1
// @noframes
// @license MIT
// ==/UserScript==
/* PokéSurvivor — licencias

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
/* Userscript sandbox: the pairing secret never enters the game page. */
function startCompanionTransport(api, env = window) {
  if(env.top!==env.self || env.location.protocol!=='https:' || !['pokesurvivor.com','www.pokesurvivor.com'].includes(env.location.hostname)) return;
  let key=api.getValue('pairingKey',''),latest=null,seenAt=0,busy=false,stopped=false,pendingAcks=new Set(),generation=0,request=null;
  const client=env.crypto.randomUUID();
  const notify=payload=>env.postMessage({type:'ps-thor-response',payload},env.location.origin);
  function invalidate(){generation++;request?.abort?.();request=null;busy=false;pendingAcks.clear();notify({connected:false});}
  api.registerMenuCommand('Connect Thor panel',()=>{
    const entered=env.prompt('Open Thor Companion, copy its pairing key, and paste it here.');
    if(entered===null)return;
    if(!/^[a-f0-9]{64}$/i.test(entered.trim())) {env.alert('Paste the complete pairing key from the companion app.');return;}
    invalidate();key=entered.trim().toLowerCase();api.setValue('pairingKey',key);
  });
  api.registerMenuCommand('Disconnect Thor panel',()=>{invalidate();key='';api.setValue('pairingKey','');});
  function message(e) {
    if(e.source!==env || e.origin!==env.location.origin || e.data?.type!=='ps-thor-snapshot')return;
    const s=e.data.payload;
    if(!s||s.version!==1||!Array.isArray(s.moves))return;
    latest={version:1,visible:s.visible===true,state:String(s.state||'').slice(0,30),screen:String(s.screen||'').slice(0,80),
      focus:String(s.focus||'').slice(0,100),name:String(s.name||'').slice(0,100),
      hp:Number.isFinite(s.hp)?s.hp:0,maxHp:Number.isFinite(s.maxHp)?s.maxHp:0,level:Number.isFinite(s.level)?s.level:0,
      seconds:Number.isFinite(s.seconds)?s.seconds:0,active:Number.isInteger(s.active)?s.active:0,moves:s.moves.slice(0,4).map(n=>String(n).slice(0,100))};
    for(const id of (s.acks||[]).slice(0,64)) if(Number.isSafeInteger(id)&&id>0)pendingAcks.add(id);
    seenAt=env.performance.now();
  }
  function tick() {
    if(stopped||busy||!key||!latest)return;
    if(env.performance.now()-seenAt>500) {notify({connected:false});return;}
    busy=true;const sentAcks=[...pendingAcks],started=env.performance.now(),stamp=generation;
    request=api.xmlhttpRequest({method:'POST',url:'http://127.0.0.1:28765/exchange',anonymous:true,timeout:1200,
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},data:JSON.stringify({client,snapshot:latest,acks:sentAcks}),
      onload:r=>{
        if(stopped||stamp!==generation)return;busy=false;request=null;
        const elapsed=env.performance.now()-started;
        if(elapsed>500){notify({connected:false});return;}
        if(r.status!==200){notify({connected:false,reason:r.status===409?'Another game tab is connected':'Open the companion app and check pairing'});return;}
        try {const payload=JSON.parse(r.responseText);for(const c of payload.commands||[])c.age+=elapsed;for(const id of sentAcks)pendingAcks.delete(id);notify(payload);}catch{notify({connected:false});}
      },onerror:()=>{if(stopped||stamp!==generation)return;busy=false;request=null;notify({connected:false});},ontimeout:()=>{if(stopped||stamp!==generation)return;busy=false;request=null;notify({connected:false});}
    });
  }
  env.addEventListener('message',message);
  const timer=env.setInterval(tick,100);
  return {tick,dispose(){stopped=true;invalidate();env.clearInterval(timer);env.removeEventListener('message',message);}};
}


(() => {
 if(window.top!==window.self||location.protocol!=='https:'||!['pokesurvivor.com','www.pokesurvivor.com'].includes(location.hostname))return;
 GM_addElement('script',{textContent:"/* Bounded run telemetry and commands. No account, credentials or save access. */\nfunction installCompanionPage(G, env = window) {\n  let latest = [], frames = [], receivedAt = -Infinity, lastID = 0, acks = [];\n  const now = () => env.performance.now();\n  const text = value => typeof value === 'string' ? value.slice(0,100) : '';\n  const number = value => Number.isFinite(value) ? value : 0;\n  function snapshot() {\n    const p = G.Game.player;\n    return {version:1,visible:!env.document.hidden,state:text(G.Game.state),screen:text(G.ControllerUI.screen),\n      focus:text(G.ControllerUI.focusLabel),name:text(p?.mon?.name),hp:number(p?.hp),maxHp:number(p?.maxHp),\n      level:number(p?.level),seconds:number(G.Game.t),active:number(p?.active),\n      moves:Array.from({length:4},(_,n)=>text((p?.slots?.[n]||[]).map(m=>G.T?G.T(m.name):m.name).join(' + '))),acks:acks.splice(0)};\n  }\n  function normalize(input) {\n    if(!Array.isArray(input)) return [];\n    return input.slice(0,2).filter(p=>p&&Array.isArray(p.axes)&&Array.isArray(p.buttons)).map((p,i)=>({\n      id:'Thor companion '+text(p.id),index:10000+i,connected:true,mapping:'standard',timestamp:now(),\n      axes:p.axes.slice(0,4).map(n=>Math.max(-1,Math.min(1,number(n)))),\n      buttons:p.buttons.slice(0,33).map(b=>{const value=Math.max(0,Math.min(1,number(b?.value)));return{value,pressed:value>=.5,touched:value>0}})\n    }));\n  }\n  function source() {\n    if(env.document.hidden || now()-receivedAt>500) {latest=[];frames=[];return [];}\n    return frames.length ? frames.shift() : latest;\n  }\n  G.Gamepad.setExternalSource(source);\n  function receive(payload) {\n    if(!payload || typeof payload!=='object') return;\n    if(payload.connected===false) {latest=[];frames=[];receivedAt=-Infinity;return;}\n    if(!env.document.hidden && Array.isArray(payload.frames)) {\n      receivedAt=now();\n      for(const frame of payload.frames.slice(0,64)) {latest=normalize(frame);frames.push(latest);}\n      if(frames.length>64) {frames=[];latest=[];}\n    }\n    for(const c of (Array.isArray(payload.commands)?payload.commands:[]).slice(0,32)) {\n      if(!Number.isSafeInteger(c?.id)||c.id<=0) continue;\n      acks.push(c.id);\n      if(c.id<=lastID) continue;\n      lastID=c.id;\n      if(env.document.hidden || !Number.isFinite(c.age)||c.age<0||c.age>1000 || c.screen!==G.ControllerUI.screen) continue;\n      if(/^slot[1-4]$/.test(c.action) && !G.ControllerUI.screen && G.Game.state==='playing') G.Game.player?.setActive(Number(c.action.slice(-1))-1);\n      else if(['prev','next'].includes(c.action) && !G.ControllerUI.screen && G.Game.state==='playing') G.Game.player?.cycle(c.action==='prev'?-1:1);\n      else if(c.action==='pause') {if(G.Game.state==='playing')G.Game.togglePause();else if(G.ControllerUI.screen==='scr-pause')G.ControllerUI.goBack();}\n      else if(['confirm','cancel','up','down','left','right'].includes(c.action)) G.ControllerUI.command(c.action);\n    }\n    acks=[...new Set(acks)].slice(-64);\n  }\n  function message(e) {\n    if(e.source!==env || e.origin!==env.location.origin || e.data?.type!=='ps-thor-response') return;\n    receive(e.data.payload);\n  }\n  env.addEventListener('message',message);\n  const timer=env.setInterval(()=>env.postMessage({type:'ps-thor-snapshot',payload:snapshot()},env.location.origin),100);\n  return {snapshot,receive,dispose(){env.clearInterval(timer);env.removeEventListener?.('message',message);G.Gamepad.setExternalSource(null);}};\n}\n\n\n(() => {let attempts=0;function start(){\n if(window.top!==window.self||location.protocol!=='https:'||!['pokesurvivor.com','www.pokesurvivor.com'].includes(location.hostname))return;\n if(window.__PS_THOR_COMPANION_PAGE__)return;\n if(!window.G?.Gamepad?.setExternalSource||!G.ControllerUI?.command){if(++attempts<75)setTimeout(start,400);return;}\n window.__PS_THOR_COMPANION_PAGE__=installCompanionPage(G);\n}start();})();"});
 startCompanionTransport({getValue:GM_getValue,setValue:GM_setValue,registerMenuCommand:GM_registerMenuCommand,xmlhttpRequest:GM_xmlhttpRequest});
})();
