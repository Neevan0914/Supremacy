// Builds Supremacy.html: the original app bundle (src/supremacy-app.html) with
// its 2D battle component swapped for the 3D one, three.js + the 3D battle
// bundled inline, and the soldier model embedded so the file works offline.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const app = readFileSync('src/supremacy-app.html', 'utf8');
const screen = readFileSync('src/battle-screen.js', 'utf8').replace(/^\/\/.*\n/gm, '').trim();

const start = app.indexOf('function i2(');
const end = app.indexOf('function c2(');
if (start < 0 || end < start) throw new Error('battle component not found in src/supremacy-app.html');
let html = app.slice(0, start) + screen + app.slice(end);

const res = await build({
  entryPoints: ['src/battle3d/index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'Battle3D',
  minify: true,
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const engine = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const glb = readFileSync('assets/soldier.glb').toString('base64');

const marker = '<script>(()=>{var bm=';
const at = html.indexOf(marker);
if (at < 0) throw new Error('app script tag not found');
html =
  html.slice(0, at) +
  `<script>window.__SUPREMACY_SOLDIER_GLB="${glb}";</script>\n` +
  `<script>/* three.js (MIT) + 3D battle */\n${engine}</script>\n` +
  html.slice(at);

writeFileSync('Supremacy.html', html);
console.log(`Supremacy.html: ${(html.length / 1024).toFixed(0)} KB (engine ${(engine.length / 1024).toFixed(0)} KB, model ${(glb.length / 1024).toFixed(0)} KB)`);
