/* Boot. Waits for web fonts (so the canvas HUD uses the right faces), then starts the game. */
(function (OO) {
  'use strict';

  function boot() {
    const canvas = document.getElementById('game');
    OO.game = new OO.Game(canvas);   // exposed for console tinkering: OO.game.player.hp = 999
  }

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(boot, boot);
})(window.OO = window.OO || {});
