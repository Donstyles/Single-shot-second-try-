#!/usr/bin/env node
// build.js — src/*.js (sorted) -> dist/index.html
//
// This file does exactly one thing: concatenate modules and baked asset data that are ALREADY ON
// DISK into a single self-contained HTML file.
//
// It never generates art, never calls a network API, never launches a browser. Generation is
// non-deterministic and the build must be reproducible: break that and the shot list stops being
// comparable between rounds and the discriminator's measurements become meaningless.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(ROOT, 'assets');

const SIZE_CEILING = 2 * 1024 * 1024; // hard ceiling, asserted by test/determinism.test.js

function modules() {
  // The numeric filename prefix IS the dependency order.
  return fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
}

// Baked assets: committed, palette-quantised data. Embedded as base64 indexed PNGs the runtime
// decodes for free. Absent assets simply fall back to the procedural painter, so the build never
// depends on the art pass having run.
function bakedAssets() {
  const out = { tex: {}, sprites: {} };

  const texDir = path.join(ASSETS, 'tex');
  if (fs.existsSync(texDir)) {
    for (const f of fs.readdirSync(texDir).sort()) {
      if (!f.endsWith('.png')) continue;
      out.tex[f.replace(/\.png$/, '')] = fs.readFileSync(path.join(texDir, f)).toString('base64');
    }
  }

  const sprDir = path.join(ASSETS, 'sprites');
  if (fs.existsSync(sprDir)) {
    for (const f of fs.readdirSync(sprDir).sort()) {
      if (!f.endsWith('.json')) continue;
      const raw = fs.readFileSync(path.join(sprDir, f), 'utf8');
      out.sprites[f.replace(/\.json$/, '')] = JSON.parse(raw);  // fail loudly on a corrupt manifest
    }
  }

  const nTex = Object.keys(out.tex).length, nSpr = Object.keys(out.sprites).length;
  if (nTex || nSpr) console.log('  baked: ' + nTex + ' textures, ' + nSpr + ' sprite sets');
  return JSON.stringify(out);
}

function build() {
  const files = modules();
  if (!files.length) throw new Error('no modules in src/');

  const parts = [];
  for (const f of files) {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    parts.push('\n/* ==================== ' + f + ' ==================== */\n' + code);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0a0a0c">
<title>Thornmarch: The Ashen Crown</title>
<style>
  html,body{margin:0;padding:0;background:#000;overflow:hidden;height:100%;
    -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;
    -webkit-tap-highlight-color:transparent;touch-action:none;overscroll-behavior:none}
  #wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000}
  /* The framebuffer is 800x480 (5:3, chosen to fill a landscape phone). Scale to fit, nearest-neighbour, never smoothed:
     a bilinear upscale destroys the palettised look more thoroughly than any art mistake. */
  canvas{image-rendering:pixelated;image-rendering:crisp-edges;display:block;
    -ms-interpolation-mode:nearest-neighbor}
  #rot{position:fixed;inset:0;display:none;align-items:center;justify-content:center;
    background:#0a0a0c;color:#c8b88a;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:2em;z-index:10}
  @media (orientation:portrait){#rot{display:flex}#wrap{display:none}}
</style>
</head>
<body>
<div id="wrap"><canvas id="fb" width="800" height="480"></canvas></div>
<div id="rot">Rotate your device to landscape.</div>
<script>
"use strict";
window.__BAKED__ = ${bakedAssets()};
${parts.join('\n')}
</script>
</body>
</html>
`;

  fs.mkdirSync(DIST, { recursive: true });
  const out = path.join(DIST, 'index.html');
  fs.writeFileSync(out, html);

  const bytes = Buffer.byteLength(html);
  const pct = ((bytes / SIZE_CEILING) * 100).toFixed(1);
  console.log('built dist/index.html  ' + files.length + ' modules  ' +
    (bytes / 1024).toFixed(1) + ' KB  (' + pct + '% of the 2 MB ceiling)');
  if (bytes > SIZE_CEILING) {
    console.error('SIZE CEILING EXCEEDED: ' + bytes + ' > ' + SIZE_CEILING);
    process.exit(1);
  }
  return { bytes, files };
}

if (require.main === module) build();
module.exports = { build, modules, SIZE_CEILING };
