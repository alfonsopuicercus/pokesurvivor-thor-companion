const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 let now=0;const events={},document={hidden:false,addEventListener:(k,f)=>(events[k]||=[]).push(f)},out=[];
 const G={Game:{state:'playing',t:12,player:{mon:{name:'Pikachu'},hp:35,maxHp:50,level:3,active:0,slots:[[{name:'Tackle'}],[{name:'Ember'}]],setActive(n){this.active=n},cycle(n){this.active=(this.active+n+2)%2}},togglePause(){this.state=this.state==='playing'?'paused':'playing'}},
 ControllerUI:{screen:'',focusLabel:'',command(a){out.push(a)},goBack(){out.push('back')}},Coop:{active:false},DB:{secret:'PRIVATE',loginWithGoogle(){},commit(){}},FIREBASE_CONFIG:{secret:'PRIVATE'}};
 const c=vm.createContext({G,console,performance:{now:()=>now},document,navigator:{getGamepads:()=>[]},localStorage:{getItem:()=>null,setItem(){}},addEventListener:(k,f)=>(events[k]||=[]).push(f),module:{exports:{}},Map,Set,JSON,location:{origin:'https://pokesurvivor.com',protocol:'https:',hostname:'pokesurvivor.com'},setInterval:()=>1,clearInterval(){}});
 c.window=c;c.top=c;c.self=c;c.postMessage=()=>{};
 vm.runInContext(fs.readFileSync('js/core/gamepad.js','utf8'),c);
 if(fs.existsSync('companion/page.js'))vm.runInContext(fs.readFileSync('companion/page.js','utf8'),c);
 return {G,c,events,out,document,time(n){now=n},create(){return c.module.exports(G,c)}};
}
const neutral=()=>({id:'Thor panel',index:10000,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:33},()=>({value:0}))});
test('companion exports run-only summary without account, passwords or save/config objects',()=>{
 const f=setup(),api=f.create(),db=f.G.DB,login=db.loginWithGoogle;
 const s=api.snapshot();assert.equal(s.hp,35);assert.equal(s.moves[1],'Ember');assert.equal(JSON.stringify(s).includes('PRIVATE'),false);
 assert.equal(f.G.DB,db);assert.equal(db.loginWithGoogle,login);
});
test('named commands are fresh, deduplicated and restricted to the current screen',()=>{
 const f=setup(),api=f.create();api.receive({commands:[{id:1,action:'slot2',screen:'',age:0}]});assert.equal(f.G.Game.player.active,1);
 f.G.Game.player.active=0;api.receive({commands:[{id:1,action:'slot2',screen:'',age:0},{id:2,action:'slot2',screen:'',age:1001},{id:3,action:'eval',screen:'',age:0}]});assert.equal(f.G.Game.player.active,0);
 f.G.ControllerUI.screen='scr-pause';api.receive({commands:[{id:4,action:'confirm',screen:'scr-menu',age:0}]});assert.deepEqual(f.out,[]);
 assert.deepEqual(Array.from(api.snapshot().acks),[1,2,3,4]);
});
test('visible menus block move slots and receive navigation through existing UI',()=>{
 const f=setup(),api=f.create();f.G.ControllerUI.screen='scr-settings';api.receive({commands:[{id:1,action:'slot2',screen:'scr-settings',age:0},{id:2,action:'down',screen:'scr-settings',age:0}]});
 assert.equal(f.G.Game.player.active,0);assert.deepEqual(f.out,['down']);
});
test('hidden pages discard commands and native inputs',()=>{
 const f=setup(),api=f.create();f.document.hidden=true;const p=neutral();p.axes[0]=1;
 api.receive({commands:[{id:1,action:'slot2',screen:'',age:0}],frames:[[p]]});f.G.Gamepad.update();assert.equal(f.G.Game.player.active,0);assert.deepEqual(Array.from(f.G.Gamepad.axis()),[0,0]);
});
test('native focus relay rearms neutral, preserves quick button edges and expires safely',()=>{
 const f=setup(),api=f.create();f.events.blur.forEach(fn=>fn());
 const p=neutral();api.receive({frames:[[p]]});f.G.Gamepad.update();p.axes[0]=1;p.buttons[3].value=1;
 api.receive({frames:[[p],[neutral()]]});f.G.Gamepad.update();assert.equal(f.G.Gamepad.tap('slot4'),true);assert.equal(f.G.Gamepad.axis()[0],1);
 f.G.Gamepad.update();assert.equal(f.G.Gamepad.tap('slot4'),false);assert.deepEqual(Array.from(f.G.Gamepad.axis()),[0,0]);
 api.receive({frames:[[p]]});f.G.Gamepad.update();f.time(501);f.G.Gamepad.update();assert.deepEqual(Array.from(f.G.Gamepad.axis()),[0,0]);
});
test('page bridge rejects messages from other origins and frames',()=>{
 const f=setup(),api=f.create();const message=f.events.message[0];
 for(const event of [{source:{},origin:'https://pokesurvivor.com'},{source:f.c,origin:'https://accounts.google.com'}])message({...event,data:{type:'ps-thor-response',payload:{commands:[{id:1,action:'slot2',screen:'',age:0}]}}});
 assert.equal(f.G.Game.player.active,0);api.dispose();
});
test('focusing account controls never exports their text to the companion',()=>{
 const user={id:'user-pill',isConnected:true,textContent:'PRIVATE_ACCOUNT_NAME',dataset:{},classList:{add(){},remove(){},contains:()=>false},getClientRects:()=>[{}],
  matches:s=>s.includes('[role=button]'),hasAttribute:()=>true,getAttribute:()=>null,closest:()=>null,focus(){},scrollIntoView(){}};
 const layer={id:'scr-menu',isConnected:true,getClientRects:()=>[{}],closest:()=>null,matches:()=>false,querySelectorAll:()=>[user],querySelector:()=>null};
 const G={I18n:{add(){}},Gamepad:{pad:{},activity:true,capturing:false,tap:()=>false,direction:()=>''}};
 const c=vm.createContext({G,performance,document:{body:{classList:{toggle(){}}},querySelectorAll:s=>s.startsWith('.scr')?[layer]:[],getElementById:()=>null},getComputedStyle:()=>({visibility:'visible',zIndex:0}),Map});
 vm.runInContext(fs.readFileSync('js/ui/controller-ui.js','utf8'),c);G.ControllerUI.update(0);
 assert.equal(G.ControllerUI.focusLabel,'');
});
