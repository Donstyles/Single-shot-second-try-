// test/_load.js — evaluate src/*.js in one shared context, exactly as the build concatenates them.
//
// The modules are written for a browser: they declare one global each and reference lower-numbered
// globals directly. Requiring them individually in Node would fail on the first cross-reference,
// so the suite reproduces the build's own load model rather than a different one. A test that runs
// against a different module graph than the shipped file is testing something that does not ship.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// Modules that need a DOM. The pure-rules suite stops before them; asking for one is an error
// rather than a silent skip, so a test cannot quietly assert nothing.
const BROWSER_ONLY = new Set(['06b_sprites.js', '07_audio.js', '08_ui.js', '09_game.js', '10_debug.js']);

// The single global each module declares. A module declares its global with `const`, which lives in
// the context's lexical scope and is NOT a property of the context object — so after loading we
// explicitly promote each one onto globalThis, or the suite would destructure a pile of undefineds
// and every assertion would pass vacuously.
const EXPORTS = {
  '00_core.js': 'Core',
  '01_rules.js': 'Rules',
  '02_spells.js': 'Spellcraft',
  '03_items.js': 'Items',
  '04_world.js': 'World',
  '05_engine.js': 'Engine',
  '06_art.js': 'Art',
};

function loadUpTo(lastPrefix) {
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
  const ctx = vm.createContext({
    console,
    Math, JSON, Date, Object, Array, Number, String, Boolean, Map, Set, Error,
    Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array, Float64Array, ArrayBuffer,
    isNaN, isFinite, parseInt, parseFloat,
  });

  const loaded = [];
  for (const f of files) {
    if (BROWSER_ONLY.has(f)) continue;
    const prefix = f.split('_')[0];
    if (lastPrefix !== undefined && prefix > lastPrefix) break;
    const code = fs.readFileSync(path.join(SRC, f), 'utf8')
      // Strip the CommonJS tail; in the browser build it is inert, and in the vm there is no
      // `module` to assign to.
      .replace(/if \(typeof module[\s\S]*$/, '');
    try {
      vm.runInContext(code, ctx, { filename: f });
    } catch (e) {
      throw new Error('loading ' + f + ': ' + e.message);
    }
    loaded.push(f);

    // Promote this module's global so the suite can reach it off the context object.
    const name = EXPORTS[f];
    if (name) {
      vm.runInContext('globalThis.' + name + ' = ' + name + ';', ctx, { filename: 'promote:' + f });
      if (ctx[name] === undefined) {
        throw new Error(f + ' did not define the global "' + name + '" the loader expects. ' +
          'A test suite destructuring undefined would pass vacuously, so this is fatal.');
      }
    }
  }
  ctx.__loaded = loaded;
  return ctx;
}

module.exports = { loadUpTo, ROOT, SRC };
