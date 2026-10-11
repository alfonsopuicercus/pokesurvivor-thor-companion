const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'companion/dist');fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const strip=s=>s.replace(/^if\s*\(typeof module.*$/m,'');
const page=strip(read('companion/page.js'))+`\n(() => {let attempts=0;function start(){
 if(window.top!==window.self||location.protocol!=='https:'||!['pokesurvivor.com','www.pokesurvivor.com'].includes(location.hostname))return;
 if(window.__PS_THOR_COMPANION_PAGE__)return;
 if(!window.G?.Gamepad?.setExternalSource||!G.ControllerUI?.command){if(++attempts<75)setTimeout(start,400);return;}
 window.__PS_THOR_COMPANION_PAGE__=installCompanionPage(G);
}start();})();`;
const metadata=`// ==UserScript==
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
// ==/UserScript==\n`;
const code=metadata+'/* '+read('LICENSE')+' */\n'+strip(read('companion/transport.js'))+`\n(() => {
 if(window.top!==window.self||location.protocol!=='https:'||!['pokesurvivor.com','www.pokesurvivor.com'].includes(location.hostname))return;
 GM_addElement('script',{textContent:${JSON.stringify(page)}});
 startCompanionTransport({getValue:GM_getValue,setValue:GM_setValue,registerMenuCommand:GM_registerMenuCommand,xmlhttpRequest:GM_xmlhttpRequest});
})();\n`;
fs.writeFileSync(path.join(out,'pokesurvivor-companion.user.js'),code);
fs.writeFileSync(path.join(out,'companion-page.js'),page);
fs.copyFileSync(path.join(root,'online/dist/pokesurvivor-controller.user.js'),path.join(out,'pokesurvivor-controller.user.js'));
fs.copyFileSync(path.join(root,'LICENSE'),path.join(out,'LICENSE.txt'));
execFileSync('python3',['-c',`import pathlib,sys,zipfile
p=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(p/'PokeSurvivor Thor Companion Scripts.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['pokesurvivor-controller.user.js','pokesurvivor-companion.user.js','LICENSE.txt']: z.write(p/name,name)
`,out]);
console.log('Companion script package ready:',out);
