/* Bounded run telemetry and commands. No account, credentials or save access. */
function installCompanionPage(G, env = window) {
  let latest = [], frames = [], receivedAt = -Infinity, lastID = 0, acks = [];
  const now = () => env.performance.now();
  const text = value => typeof value === 'string' ? value.slice(0,100) : '';
  const number = value => Number.isFinite(value) ? value : 0;
  function snapshot() {
    const p = G.Game.player;
    return {version:1,visible:!env.document.hidden,state:text(G.Game.state),screen:text(G.ControllerUI.screen),
      focus:text(G.ControllerUI.focusLabel),name:text(p?.mon?.name),hp:number(p?.hp),maxHp:number(p?.maxHp),
      level:number(p?.level),seconds:number(G.Game.t),active:number(p?.active),
      moves:Array.from({length:4},(_,n)=>text((p?.slots?.[n]||[]).map(m=>G.T?G.T(m.name):m.name).join(' + '))),acks:acks.splice(0)};
  }
  function normalize(input) {
    if(!Array.isArray(input)) return [];
    return input.slice(0,2).filter(p=>p&&Array.isArray(p.axes)&&Array.isArray(p.buttons)).map((p,i)=>({
      id:'Thor companion '+text(p.id),index:10000+i,connected:true,mapping:'standard',timestamp:now(),
      axes:p.axes.slice(0,4).map(n=>Math.max(-1,Math.min(1,number(n)))),
      buttons:p.buttons.slice(0,33).map(b=>{const value=Math.max(0,Math.min(1,number(b?.value)));return{value,pressed:value>=.5,touched:value>0}})
    }));
  }
  function source() {
    if(env.document.hidden || now()-receivedAt>500) {latest=[];frames=[];return [];}
    return frames.length ? frames.shift() : latest;
  }
  G.Gamepad.setExternalSource(source);
  function receive(payload) {
    if(!payload || typeof payload!=='object') return;
    if(payload.connected===false) {latest=[];frames=[];receivedAt=-Infinity;return;}
    if(!env.document.hidden && Array.isArray(payload.frames)) {
      receivedAt=now();
      for(const frame of payload.frames.slice(0,64)) {latest=normalize(frame);frames.push(latest);}
      if(frames.length>64) {frames=[];latest=[];}
    }
    for(const c of (Array.isArray(payload.commands)?payload.commands:[]).slice(0,32)) {
      if(!Number.isSafeInteger(c?.id)||c.id<=0) continue;
      acks.push(c.id);
      if(c.id<=lastID) continue;
      lastID=c.id;
      if(env.document.hidden || !Number.isFinite(c.age)||c.age<0||c.age>1000 || c.screen!==G.ControllerUI.screen) continue;
      if(/^slot[1-4]$/.test(c.action) && !G.ControllerUI.screen && G.Game.state==='playing') G.Game.player?.setActive(Number(c.action.slice(-1))-1);
      else if(['prev','next'].includes(c.action) && !G.ControllerUI.screen && G.Game.state==='playing') G.Game.player?.cycle(c.action==='prev'?-1:1);
      else if(c.action==='pause') {if(G.Game.state==='playing')G.Game.togglePause();else if(G.ControllerUI.screen==='scr-pause')G.ControllerUI.goBack();}
      else if(['confirm','cancel','up','down','left','right'].includes(c.action)) G.ControllerUI.command(c.action);
    }
    acks=[...new Set(acks)].slice(-64);
  }
  function message(e) {
    if(e.source!==env || e.origin!==env.location.origin || e.data?.type!=='ps-thor-response') return;
    receive(e.data.payload);
  }
  env.addEventListener('message',message);
  const timer=env.setInterval(()=>env.postMessage({type:'ps-thor-snapshot',payload:snapshot()},env.location.origin),100);
  return {snapshot,receive,dispose(){env.clearInterval(timer);env.removeEventListener?.('message',message);G.Gamepad.setExternalSource(null);}};
}
if(typeof module==='object'&&module.exports) module.exports=installCompanionPage;
