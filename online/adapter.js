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
if (typeof module === 'object' && module.exports) module.exports = installOnlineController;
