/* Package only controller code, never the game's bundle, assets or cloud configuration. */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'online/dist');fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('css/style.css').slice(read('css/style.css').indexOf('.gamepad-mode .pad-focus'));
const adapter=read('online/adapter.js').replace(/^if \(typeof module.*$/m,'');
const body=`(() => {
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
      ${read('js/core/gamepad.js')}
      ${read('js/ui/controller-ui.js')}
      ${adapter}
      const style = document.createElement('style'); style.id = 'thor-online-style'; style.textContent = ${JSON.stringify(css)};
      document.head.appendChild(style);
      G.ControllerUI.init();
      installOnlineController(G);
      status.state = 'ready';
      G.UI.toast('Controller support enabled');
    } catch (error) { status.state = 'error'; console.error('[Thor controls]', error); }
  }
  attach();
})();`;
const metadata=`// ==UserScript==
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
// ==/UserScript==\n`;
const license='/* Original game copyright (c) 2026 JPTER78.\n'+read('LICENSE')+'\n*/\n';
fs.writeFileSync(path.join(out,'pokesurvivor-controller.user.js'),metadata+license+body);
fs.writeFileSync(path.join(out,'LICENSE.txt'),read('LICENSE'));
const temp=path.join(root,'tools/cache/online/controller.js');fs.mkdirSync(path.dirname(temp),{recursive:true});fs.writeFileSync(temp,body);
const min=path.join(root,'tools/cache/online/controller.min.js');
execFileSync(process.platform==='win32'?'npx.cmd':'npx',['--yes','terser@5',temp,'--compress','--mangle','--ecma','2020','-o',min],{stdio:'inherit',shell:process.platform==='win32'});
const bookmarklet='javascript:'+encodeURIComponent(fs.readFileSync(min,'utf8'));
fs.writeFileSync(path.join(out,'Chrome Controller Shortcut.txt'),bookmarklet+'\n');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PokéSurvivor online controller setup</title>
<style>body{font:18px system-ui;max-width:750px;margin:3rem auto;padding:0 1rem;line-height:1.6}button,a{font:inherit}textarea{width:100%;height:6rem}button{padding:.6rem 1rem}small{display:block}</style>
<h1>Controls for the real online game</h1><p>This adds joystick, buttons and menu controls to <a href="https://pokesurvivor.com/en/">pokesurvivor.com</a>. The game, Google login, cloud progress and updates come from the original website.</p>
<h2>Firefox on Thor: automatic</h2><ol><li>Install Firefox and <a href="https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/">Violentmonkey</a>.</li><li>Open Violentmonkey’s dashboard, then Settings → Import from zip. Choose <b>PokeSurvivor Online Controller.zip</b>.</li><li>Open the official game and sign in to your existing account. The controller script runs automatically.</li></ol>
<h2>Chrome on Thor: shortcut</h2><ol><li>Bookmark any page, name it <b>Thor controls</b>, then edit the bookmark.</li><li>Replace its URL with the controller shortcut below. Keep its <b>javascript:</b> prefix.</li><li>Open the official game. Type <b>Thor controls</b> in Chrome’s address bar and select the bookmark suggestion to activate controls. Repeat after a page reload.</li></ol>
<button id="copy">Copy controller shortcut</button><small id="status"></small><textarea id="shortcut" readonly></textarea>
<p>Sign in through the website’s normal Google button. The browser or Google account chooser may require an initial tap or keyboard confirmation. This does not bypass login or create a new account.</p>
<p>Left stick/D-pad navigates and moves. Bottom face button confirms, right returns; face buttons select moves, shoulders/triggers cycle, Start pauses. Remap under Settings → Controls.</p>
<p>Unofficial personal add-on. Current website interfaces tested; future game updates may require an add-on update. Physical Thor input and a real account sync still need checking on your device.</p>
<script>const code=${JSON.stringify(bookmarklet)};document.querySelector('#shortcut').value=code;document.querySelector('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(code);document.querySelector('#status').textContent='Copied. Paste into the bookmark URL.'}catch{document.querySelector('#shortcut').select();document.querySelector('#status').textContent='Select and copy the text manually.'}}</script></html>`;
fs.writeFileSync(path.join(out,'Online Controller Setup.html'),html);
execFileSync('python3',['-c',`import sys,zipfile,pathlib
p=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(p/'PokeSurvivor Online Controller.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['pokesurvivor-controller.user.js','LICENSE.txt']: z.write(p/name,name)
`,out],{stdio:'inherit'});
console.log('Online-only controller script and Chrome shortcut ready:',out,'bookmark URL bytes:',bookmarklet.length);
