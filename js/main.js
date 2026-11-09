/* Boot. Waits for web fonts (so the canvas HUD uses the right faces), then starts the game. */
(function (OO) {
  'use strict';

  function boot() {
    const canvas = document.getElementById('game');
    OO.game = new OO.Game(canvas);   // exposed for console tinkering: OO.game.player.hp = 999
    OO.game.secrets = new OO.Secrets(OO.game);
    OO.game.ui.updateSettings();
  }

  // Canvas text doesn't trigger font loading by itself, so ask for the faces the HUD draws with.
  const faces = ['600 14px "Chakra Petch"', '700 14px "Chakra Petch"', '500 12px "IBM Plex Mono"', '600 12px "IBM Plex Mono"', '800 30px "Big Shoulders Stencil Display"'];
  const fontsReady = document.fonts && document.fonts.load
    ? Promise.all(faces.map((f) => document.fonts.load(f))).then(() => document.fonts.ready)
    : Promise.resolve();
  // Wait (briefly) for the fonts and the portrait images so the menu doesn't pop in.
  const portraitsReady = OO.Portraits ? OO.Portraits.preload(2500) : Promise.resolve();
  Promise.all([
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]),
    portraitsReady,
  ]).then(boot, boot);
})(window.OO = window.OO || {});
