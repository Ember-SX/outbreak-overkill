// Bundles index.html + css/ + js/ into one self-contained file: dist/outbreak-overkill.html
// Handy for sharing a build as a single file, or uploading to itch.io.
// Usage: node tools/bundle.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'index.html'), 'utf8');

// Stylesheets are inlined, and the fonts they reference become data: URIs.
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) => {
  const css = readFileSync(join(root, href), 'utf8').replace(/url\((fonts\/[^)]+\.woff2)\)/g, (m, file) =>
    `url(data:font/woff2;base64,${readFileSync(join(root, 'css', file)).toString('base64')})`);
  return `<style>\n${css}\n</style>`;
});

// The portrait manifest becomes an inline script whose image paths are data: URIs.
html = html.replace(/<script src="(assets\/portraits\/manifest\.js)"><\/script>/, (_, src) => {
  const sandbox = { window: {} };
  sandbox.window.OO = sandbox.OO = {};
  vm.runInNewContext(readFileSync(join(root, src), 'utf8'), sandbox);
  const m = sandbox.OO.PORTRAIT_MANIFEST || { files: {} };
  const files = {};
  const types = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', avif: 'image/avif' };
  for (const [k, f] of Object.entries(m.files)) {
    const path = join(root, m.base || '', f);
    if (!existsSync(path)) { console.warn('bundle: missing portrait ' + f); continue; }
    files[k] = `data:${types[f.split('.').pop().toLowerCase()] || 'image/png'};base64,${readFileSync(path).toString('base64')}`;
  }
  const inline = { base: '', files, focus: m.focus || {} };
  return `<script>\nwindow.OO = window.OO || {}; OO.PORTRAIT_MANIFEST = ${JSON.stringify(inline)};\n</script>`;
});

html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'outbreak-overkill.html');
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
