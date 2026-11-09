/*
 * Portrait assets: the menu dossier, operative tabs and wardrobe show image files when they
 * exist, and fall back to the procedural portrait (js/characters.js) when they don't.
 *
 * Where the files come from
 *   assets/portraits/manifest.js lists them:
 *     OO.PORTRAIT_MANIFEST = {
 *       base: 'assets/portraits/',
 *       files: { 'rin/tactical': 'rin/tactical.webp', ... },
 *       focus: { 'dex/swimsuit': 0.4 },        // optional: vertical crop focus (0 top .. 1 bottom)
 *     };
 *   It's a script rather than JSON so the game still runs from file:// (browsers block fetch()
 *   there, but <script> and <img> work). The bundle inlines every listed image.
 *
 * Image spec: 3:4 portrait (768 x 1024 or larger), transparent background, figure centred,
 * top of the head about 8% from the top, cropped around mid-thigh. WebP or PNG.
 * `npm run portraits` regenerates the whole set from the procedural renderer; replace any file
 * with commissioned art under the same name and it's picked up with no code changes.
 */
(function (OO) {
  'use strict';

  const images = new Map();      // 'char/skin' -> HTMLImageElement (decoded)
  let ready = false;

  function manifest() {
    const m = OO.PORTRAIT_MANIFEST;
    return m && m.files ? m : { base: '', files: {} };
  }

  function key(charId, skinId) { return charId + '/' + skinId; }

  /** Start loading every listed image. Resolves when all have loaded or failed, or after timeoutMs. */
  function preload(timeoutMs = 3000) {
    const m = manifest();
    const jobs = Object.keys(m.files).map((k) => new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const done = () => { images.set(k, img); resolve(); };
        if (img.decode) img.decode().then(done, done); else done();
      };
      img.onerror = () => { console.warn('Portrait missing, using the drawn one instead:', m.files[k]); resolve(); };
      const src = m.files[k];
      img.src = /^(data:|https?:|\/)/.test(src) ? src : (m.base || '') + src;
    }));
    const all = Promise.all(jobs).then(() => { ready = true; });
    return Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  function has(charId, skinId) { return images.has(key(charId, skinId)); }

  /**
   * A DOM element showing the portrait at cssW wide (3:4): an <img> for an asset, else a canvas
   * from the procedural renderer. Both get the same class so CSS treats them alike.
   */
  function element(charId, skinId, cssW, className) {
    const skin = OO.Characters.skinOf(charId, skinId);
    const img = images.get(key(charId, skin.id));
    if (!img) return OO.Characters.portraitElement(charId, skin.id, cssW, className);
    const el = document.createElement('img');
    el.src = img.src;
    el.alt = (OO.CHARACTERS[charId] ? OO.CHARACTERS[charId].name : '') + ', ' + skin.name;
    el.width = cssW;
    el.height = Math.round(cssW * 4 / 3);
    el.className = (className || '') + ' portrait-img';
    el.draggable = false;
    const focus = (manifest().focus || {})[key(charId, skin.id)];
    if (focus !== undefined) el.style.objectPosition = '50% ' + Math.round(focus * 100) + '%';
    return el;
  }

  OO.Portraits = { preload, has, element, get ready() { return ready; }, get count() { return images.size; } };
})(window.OO = window.OO || {});
