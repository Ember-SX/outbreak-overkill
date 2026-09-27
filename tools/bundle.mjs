// Bundles index.html + css/ + js/ into one self-contained file: dist/outbreak-overkill.html
// Handy for sharing a build as a single file, or uploading to itch.io.
// Usage: node tools/bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) =>
  `<style>\n${readFileSync(join(root, href), 'utf8')}\n</style>`);

html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'outbreak-overkill.html');
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
