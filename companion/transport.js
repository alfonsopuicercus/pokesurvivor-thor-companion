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
if(typeof module==='object'&&module.exports) module.exports=startCompanionTransport;
