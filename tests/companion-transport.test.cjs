const {test}=require('node:test'),assert=require('node:assert/strict');
function fixture(hostname='pokesurvivor.com'){
 let now=1,handler;const requests=[],messages=[],menus={};
 const env={location:{hostname,protocol:'https:',origin:'https://'+hostname},crypto:{randomUUID:()=> 'test-browser-session'},performance:{now:()=>now},
  setInterval:()=>1,clearInterval(){},addEventListener:(k,f)=>handler=f,removeEventListener(){},postMessage:m=>messages.push(m)};
 env.self=env;env.top=env;
 const api={getValue:()=> 'a'.repeat(64),setValue(){},registerMenuCommand:(k,f)=>menus[k]=f,xmlhttpRequest:r=>requests.push(r)};
 const start=require('../companion/transport.js'),transport=start(api,env);
 const snapshot={version:1,visible:true,moves:['Tackle'],state:'playing',screen:'',hp:10,secret:'PASSWORD',acks:[1]};
 return{env,requests,messages,menus,transport,send(){handler({source:env,origin:env.location.origin,data:{type:'ps-thor-snapshot',payload:snapshot}})},time(n){now=n}};
}
test('transport sends only bounded telemetry to authenticated loopback without cookies',()=>{
 const f=fixture();f.send();f.transport.tick();assert.equal(f.requests.length,1);const r=f.requests[0];
 assert.equal(r.url,'http://127.0.0.1:28765/exchange');assert.equal(r.anonymous,true);assert.equal(r.data.includes('PASSWORD'),false);assert.equal(r.headers.Authorization,'Bearer '+'a'.repeat(64));
 f.transport.tick();assert.equal(f.requests.length,1,'No concurrent polls');r.onload({status:200,responseText:'{"commands":[],"frames":[]}'});
 f.transport.tick();assert.equal(JSON.parse(f.requests[1].data).acks.length,0);
});
test('transport refuses nonofficial origins and stops stale input after failures',()=>{
 assert.equal(fixture('accounts.google.com').transport,undefined);
 const f=fixture();f.send();f.transport.tick();f.requests[0].onerror();assert.equal(f.messages.at(-1).payload.connected,false);
 f.time(600);f.transport.tick();assert.equal(f.requests.length,1);
});
test('disconnect invalidates an outstanding response so input cannot reconnect',()=>{
 const f=fixture();f.send();f.transport.tick();f.menus['Disconnect Thor panel']();
 f.requests[0].onload({status:200,responseText:'{"connected":true,"commands":[],"frames":[]}'});
 assert.equal(f.messages.at(-1).payload.connected,false);
});
test('late responses cannot renew native input and command age includes transit',()=>{
 const f=fixture();f.send();f.transport.tick();f.time(1101);f.requests[0].onload({status:200,responseText:'{"connected":true,"commands":[{"id":1,"age":0}],"frames":[[]]}'});
 assert.equal(f.messages.at(-1).payload.connected,false);
 const g=fixture();g.send();g.transport.tick();g.time(201);g.requests[0].onload({status:200,responseText:'{"connected":true,"commands":[{"id":1,"age":900}],"frames":[[]]}'});
 assert.ok(g.messages.at(-1).payload.commands[0].age>=1100);
});
