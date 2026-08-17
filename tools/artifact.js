#!/usr/bin/env node
// tools/artifact.js — dist/index.html -> a page the Artifact host can publish.
//
// The build is a COMPLETE html document: doctype, html, head, body. The artifact host wraps
// whatever it is given in its own skeleton, so publishing the build directly would nest one
// document inside another. This lifts the parts that belong in a body — the title, the stylesheet
// and the content — and drops the wrapper.
//
// The game is the artifact. There is no landing page around it, no title card and no explanatory
// chrome: the user asked for a link they can tap and play on a phone, and anything between the tap
// and the game is in the way. The only thing added is a portrait-orientation nudge, because the
// game is built for 844x390 landscape and a phone held upright would otherwise show a letterbox
// with no explanation.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'dist', 'index.html');
const OUT = process.argv[2] || path.join(ROOT, 'dist', 'artifact.html');

const html = fs.readFileSync(SRC, 'utf8');

const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [, 'Thornmarch'])[1];
const style = (html.match(/<style>([\s\S]*?)<\/style>/i) || [, ''])[1];
const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, ''])[1];

if (!body.trim()) {
  console.error('could not find a <body> in ' + SRC);
  process.exit(1);
}

// The nudge is in the game's own register — dark ground, worn gold, a serif — because it is the
// first thing a player sees if they tap the link holding the phone upright, and it should read as
// part of the game rather than as a browser warning.
const EXTRA = `
  /* The artifact host paints its own ground behind the page, so the background is explicit. This
     is a single-theme design on purpose: it is a 1998 game screen, and it looks the same on a
     light host as on a dark one. */
  :root { color-scheme: dark; }
  html, body { background: #07070a; }

  #rotate {
    position: fixed; inset: 0; z-index: 50; display: none;
    align-items: center; justify-content: center; text-align: center;
    background: #07070a; padding: 2rem;
  }
  #rotate p {
    margin: 0; max-width: 22ch;
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    font-size: clamp(1.05rem, 4.5vw, 1.5rem); line-height: 1.5;
    color: #e2c274; letter-spacing: 0.01em; text-wrap: balance;
  }
  #rotate span { display: block; margin-top: 0.9rem; font-size: 0.78em; color: #8a7a55; }
  @media (orientation: portrait) { #rotate { display: flex; } }
  @media (prefers-reduced-motion: no-preference) {
    #rotate p { animation: fade 420ms ease-out both; }
    @keyframes fade { from { opacity: 0; transform: translateY(6px); } }
  }
`;

const page = `<title>${title}</title>
<style>
${style}
${EXTRA}</style>
${body.trim()}
<div id="rotate" role="status">
  <p>Turn your phone sideways.<span>Thornmarch is played in landscape.</span></p>
</div>
`;

fs.writeFileSync(OUT, page);
const kb = (Buffer.byteLength(page) / 1024).toFixed(1);
console.log(`${path.relative(ROOT, OUT)}  ${kb} KB  (title: ${title})`);
