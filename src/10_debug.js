// 10_debug.js — boot, main loop, input, the ?debug overlay, and the test harness.
// Owner: debug. Loads last, so it may reference everything.
//
// The harness is built FIRST, before there is anything to drive, because every later stage is
// driven through it: the shot list, the E2E suite, the campaign test and the determinism diff all
// speak to __game / __session and nothing else. See ARCHITECTURE.md §10 for the contract.

const Debug = (() => {
  'use strict';

  const { Clock, RNG, Bus, Log } = Core;

  const STEP_MS = 16;          // fixed simulation timestep; the harness never uses wall-clock time
  const MAX_CATCHUP = 5;       // frames of catch-up per rAF, so a stall cannot spiral

  const state = {
    booted: false,
    ctx: null,
    canvas: null,
    acc: 0,
    last: 0,
    frames: 0,
    fps: 0,
    fpsAcc: 0,
    fpsN: 0,
    overlay: false,
    keys: Object.create(null),
    pointer: { x: 0, y: 0, down: false },
    lastError: null,
  };

  // Is the game layer present yet? Modules land across rounds; the harness must be honest about
  // what it can and cannot drive rather than failing obscurely.
  const hasGame = () => typeof Game !== 'undefined' && Game && typeof Game.update === 'function';

  function need(what) {
    throw new Error('harness: ' + what + ' requires the game layer, which is not built yet ' +
      '(src/09_game.js). This is a real gap, not a transient failure.');
  }

  // ---------------------------------------------------------------- loop
  function simulate(dtMs) {
    if (hasGame()) Game.update(dtMs);
    else Clock.advance(dtMs);
    state.frames++;
  }

  function draw() {
    if (hasGame()) Game.render();
    else Engine.testCard();
    if (state.overlay) drawOverlay();
    if (state.ctx) Engine.present(state.ctx);
  }

  // ONE bad frame must not end the session. There was no try/catch around the loop, so any
  // exception thrown inside draw() killed requestAnimationFrame permanently — the frame counter
  // froze and nothing, including closing every screen, restarted it. A crash that takes the game
  // with it is a far worse defect than the crash.
  let frameFaults = 0;
  function guard(what, fn) {
    try { fn(); return true; } catch (e) {
      frameFaults++;
      state.lastError = what + ': ' + (e && e.message ? e.message : e);
      // Report the first few, then fall silent so a per-frame throw cannot flood the console.
      if (frameFaults <= 3) console.error('frame ' + what + ' failed: ' + state.lastError);
      // A screen that throws while drawing is the usual cause; drop back to the world view so the
      // player has something to act on rather than a dead canvas.
      if (frameFaults === 1 && hasGame() && Game.state) { Game.state.screen = null; Game.state.talkingTo = null; }
      return false;
    }
  }

  function frame(now) {
    if (!state.last) state.last = now;
    let dt = now - state.last;
    state.last = now;
    if (dt > 250) dt = 250;                       // tab was backgrounded; do not fast-forward
    state.acc += dt;

    let n = 0;
    while (state.acc >= STEP_MS && n < MAX_CATCHUP) {
      guard('simulate', () => simulate(STEP_MS));
      state.acc -= STEP_MS;
      n++;
    }
    if (n === MAX_CATCHUP) state.acc = 0;

    state.fpsAcc += dt; state.fpsN++;
    if (state.fpsAcc >= 500) {
      state.fps = Math.round(1000 / (state.fpsAcc / state.fpsN));
      state.fpsAcc = 0; state.fpsN = 0;
    }

    guard('draw', draw);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- overlay
  function drawOverlay() {
    const lines = [
      'fps ' + state.fps + '  frame ' + state.frames,
      'clock ' + Clock.hhmm() + ' d' + Clock.day + ' ' + Clock.phase(),
      'seed ' + RNG.seed,
    ];
    if (hasGame() && Game.debugLines) lines.push.apply(lines, Game.debugLines());
    if (state.lastError) lines.push('ERR ' + state.lastError);

    // Drawn with raster primitives rather than a font until Art owns one.
    Engine.clipReset();
    Engine.rect(2, 2, 210, 6 + lines.length * 8, Core.idx(0, 1));
    Engine.frameRect(2, 2, 210, 6 + lines.length * 8, Core.idx(13, 9));
    if (typeof Art !== 'undefined' && Art.text) {
      for (let i = 0; i < lines.length; i++) Art.text(Engine, 6, 6 + i * 8, lines[i], Core.idx(0, 14));
    }
  }

  // ---------------------------------------------------------------- input
  const KEYMAP = {
    ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'turnL', ArrowRight: 'turnR',
    w: 'fwd', s: 'back', a: 'strafeL', d: 'strafeR', q: 'turnL', e: 'turnR',
    Enter: 'act', ' ': 'act', Escape: 'esc', Tab: 'next',
    c: 'sheet', i: 'inv', m: 'map', r: 'rest', b: 'book', x: 'quick',
    // MM6 bound turn-based to Enter. Enter is already the interact verb here (a phone has no
    // keyboard, so the on-screen ATK/USE button is the primary), so turn-based takes T and Return.
    t: 'turnbased', Return: 'turnbased',
  };

  function bindInput(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.key === '`') { state.overlay = !state.overlay; e.preventDefault(); return; }
      const k = KEYMAP[e.key] || e.key;
      state.keys[k] = true;
      if (hasGame() && Game.onKey) Game.onKey(k, true);
      if (KEYMAP[e.key]) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.key] || e.key;
      state.keys[k] = false;
      if (hasGame() && Game.onKey) Game.onKey(k, false);
    });

    // Pointer/touch mapped from CSS pixels into framebuffer coordinates.
    const toFb = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.floor((clientX - r.left) / r.width * Engine.W),
        y: Math.floor((clientY - r.top) / r.height * Engine.H),
      };
    };
    const down = (x, y) => {
      const p = toFb(x, y);
      state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.down = true;
      if (hasGame() && Game.onTap) Game.onTap(p.x, p.y, true);
    };
    const up = (x, y) => {
      const p = toFb(x, y);
      state.pointer.down = false;
      if (hasGame() && Game.onTap) Game.onTap(p.x, p.y, false);
    };
    // Bind EVERY input family. Pointer events alone left the game unreachable in any context that
    // dispatches touch or plain mouse events, and "the title screen ate four taps" is the worst
    // possible first three seconds.
    // De-duplicate PER PHASE. A browser may fire pointer AND mouse AND touch for one physical tap,
    // but press and release must be tracked separately — sharing one timestamp swallows the
    // release of any fast tap, which would leave movement keys stuck down forever.
    let lastDownAt = -1e9, lastUpAt = -1e9;
    const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : 0);
    const gdown = (cx, cy) => {
      const t = nowMs();
      if (t - lastDownAt < 30) return;
      lastDownAt = t;
      down(cx, cy);
    };
    const gup = (cx, cy) => {
      const t = nowMs();
      if (t - lastUpAt < 30) return;
      lastUpAt = t;
      up(cx, cy);
    };

    canvas.addEventListener('pointerdown', (e) => { gdown(e.clientX, e.clientY); e.preventDefault(); });
    canvas.addEventListener('pointerup', (e) => { gup(e.clientX, e.clientY); e.preventDefault(); });
    canvas.addEventListener('mousedown', (e) => { gdown(e.clientX, e.clientY); e.preventDefault(); });
    canvas.addEventListener('mouseup', (e) => { gup(e.clientX, e.clientY); e.preventDefault(); });
    canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; if (t) gdown(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0]; if (t) gup(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    // Last-resort fallback: if nothing above produced a press, a plain click still starts the game.
    canvas.addEventListener('click', (e) => {
      if (nowMs() - lastDownAt < 400) return;      // a real press already handled it
      const p = toFb(e.clientX, e.clientY);
      if (hasGame() && Game.onTap) { Game.onTap(p.x, p.y, true); Game.onTap(p.x, p.y, false); }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = toFb(e.clientX, e.clientY);
      state.pointer.x = p.x; state.pointer.y = p.y;
      if (hasGame() && Game.onMove) Game.onMove(p.x, p.y);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- layout
  function fit(canvas) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / Engine.W, vh / Engine.H);
    canvas.style.width = Math.floor(Engine.W * scale) + 'px';
    canvas.style.height = Math.floor(Engine.H * scale) + 'px';
  }

  // ---------------------------------------------------------------- boot
  function start() {
    if (state.booted) return;
    state.booted = true;

    const canvas = document.getElementById('fb');
    state.canvas = canvas;
    state.ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    state.ctx.imageSmoothingEnabled = false;

    fit(canvas);
    window.addEventListener('resize', () => fit(canvas));
    window.addEventListener('orientationchange', () => setTimeout(() => fit(canvas), 100));
    bindInput(canvas);

    const params = new URLSearchParams(location.search);
    if (params.has('debug')) state.overlay = true;
    if (params.has('seed')) RNG.setSeed(parseInt(params.get('seed'), 10) || 1);

    // Surface errors instead of swallowing them. A silent catch is a lie; this records and shows.
    window.addEventListener('error', (e) => {
      state.lastError = e.message;
      state.overlay = true;
    });

    if (hasGame() && Game.boot) Game.boot();
    Log.push('Thornmarch booted.', 'sys');
    requestAnimationFrame(frame);
  }

  // ================================================================ HARNESS
  // Contract in ARCHITECTURE.md §10. Everything the shot list, E2E suite, campaign test and
  // determinism diff use goes through here.
  //
  // Player-legality matters: walk/press/tap/key are actions a player could take. teleport, gotoMap,
  // give, gold, xp, heal, kill and spawn are NOT, and the campaign test is forbidden from using
  // them — it must win the game the way a person would.
  const harness = {
    // ---- travel (NOT player-legal; for reaching content quickly, never for skipping systems)
    teleport(x, y, ang) {
      if (!hasGame()) need('teleport');
      return Game.teleport(x, y, ang);
    },
    gotoMap(id, x, y, ang) {
      if (!hasGame()) need('gotoMap');
      return Game.gotoMap(id, x, y, ang);
    },
    face(ang) { if (!hasGame()) need('face'); Game.party.ang = ang; return ang; },
    pitch(p) { if (!hasGame()) need('pitch'); Game.party.pitch = p; return p; },

    // ---- player-legal movement and input
    walk(dir, cells) {
      if (!hasGame()) need('walk');
      return Game.walkCells(dir, cells === undefined ? 1 : cells);
    },
    press(key, ms) {
      if (!hasGame()) need('press');
      const steps = Math.max(1, Math.round((ms === undefined ? STEP_MS : ms) / STEP_MS));
      Game.onKey(key, true);
      for (let i = 0; i < steps; i++) simulate(STEP_MS);
      Game.onKey(key, false);
      return steps;
    },
    key(name) { if (!hasGame()) need('key'); Game.onKey(name, true); Game.onKey(name, false); },
    // Player-legal: the same call the ATK button makes.
    attack() { if (!hasGame()) need('attack'); return Game.partyAttack(); },
    attackWith(i) { if (!hasGame()) need('attackWith'); return Game.partyAttack(i); },
    enemiesNear(d) { if (!hasGame()) need('enemiesNear'); return Game.liveEnemies().filter((e) =>
      Math.hypot(e.x - Game.party.x, e.y - Game.party.y) < (d === undefined ? 12 : d)).length; },
    tap(x, y) {
      if (!hasGame()) need('tap');
      Game.onTap(x, y, true); Game.onTap(x, y, false);
    },

    // ---- grants (NOT player-legal)
    give(itemId, n) { if (!hasGame()) need('give'); return Game.grantItem(itemId, n === undefined ? 1 : n); },
    gold(n) { if (!hasGame()) need('gold'); Game.party.gold += n | 0; return Game.party.gold; },
    xp(n) { if (!hasGame()) need('xp'); return Game.grantXP(n | 0); },
    heal() { if (!hasGame()) need('heal'); return Game.healParty(); },
    kill(eid) { if (!hasGame()) need('kill'); return Game.killEntity(eid); },
    spawn(kind, x, y) { if (!hasGame()) need('spawn'); return Game.spawnEntity(kind, x, y); },

    // ---- clock (works without the game layer: Core owns it)
    setTime(minutesSinceMidnight) { return Clock.setTod(minutesSinceMidnight); },
    setDay(n) { Clock.t = (n | 0) * Core.MIN_PER_DAY + Clock.tod; return Clock.t; },

    // ---- persistence
    save(slot) { if (!hasGame()) need('save'); return Game.save(slot === undefined ? 0 : slot); },
    load(slot) { if (!hasGame()) need('load'); return Game.load(slot === undefined ? 0 : slot); },
    newParty(spec) { if (!hasGame()) need('newParty'); return Game.newParty(spec); },

    // ---- screens
    screen(name) { if (!hasGame()) need('screen'); return Game.openScreen(name); },
    // Where the world says its own landmarks are. The shot list is a spec the world must satisfy;
    // hardcoded camera coordinates cannot find a procedurally placed gate, bridge or shoreline,
    // which is why eight rounds of "gate at dusk" captured a brown rectangle in a field.
    landmark(mapId, kind) {
      if (!hasGame()) need('landmark');
      const m = Game.state.world.maps[mapId];
      if (!m || !m.landmarks) return null;
      const hit = m.landmarks.filter((l) => l.kind === kind);
      return hit.length ? hit[0] : null;
    },
    closeAll() { if (!hasGame()) need('closeAll'); return Game.closeScreens(); },

    // ---- determinism control
    seed(n) { RNG.setSeed(n); return RNG.seed; },

    // Advance the simulation by exactly `ms` of game time at the fixed timestep. Never touches
    // wall-clock, so a headless run reproduces exactly.
    step(ms) {
      const steps = Math.max(1, Math.round(ms / STEP_MS));
      for (let i = 0; i < steps; i++) simulate(STEP_MS);
      return steps;
    },
    // Render `n` frames without advancing simulation further than one step each — used before a
    // capture so transient state (fades, bobs) has settled.
    settle(n) {
      const k = n === undefined ? 2 : n;
      for (let i = 0; i < k; i++) { simulate(STEP_MS); draw(); }
      return k;
    },
    // Force a redraw only. A capture calls this so the framebuffer matches the asserted state.
    redraw() { draw(); return true; },

    // Introspection for tests that need to know what exists yet.
    ready() { return hasGame(); },
    layers() {
      return {
        core: typeof Core !== 'undefined',
        rules: typeof Rules !== 'undefined',
        spells: typeof Spellcraft !== 'undefined',
        items: typeof Items !== 'undefined',
        world: typeof World !== 'undefined',
        engine: typeof Engine !== 'undefined',
        art: typeof Art !== 'undefined',
        ui: typeof UI !== 'undefined',
        game: hasGame(),
      };
    },
  };

  // ---------------------------------------------------------------- session dump
  // Stable-ordered, side-effect-free JSON. The determinism diff reads this; an unstable dump or
  // one that advances an RNG stream makes the diff meaningless.
  function sortedClone(v) {
    if (v === null || typeof v !== 'object') {
      // Normalise float noise so a dump is byte-comparable across runs.
      return typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(6)) : v;
    }
    if (Array.isArray(v)) return v.map(sortedClone);
    if (ArrayBuffer.isView(v)) return Array.from(v);
    if (v instanceof Map) {
      const o = {};
      for (const k of Array.from(v.keys()).sort()) o[k] = sortedClone(v.get(k));
      return o;
    }
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (k.startsWith('_')) continue;             // internal caches are not state
      out[k] = sortedClone(v[k]);
    }
    return out;
  }

  const session = {
    dump() {
      const d = {
        clock: Clock.dump(),
        rng: RNG.dump(),
        frames: state.frames,
      };
      if (hasGame() && Game.dumpState) d.game = Game.dumpState();
      return sortedClone(d);
    },

    brief() {
      const d = { t: Clock.t, phase: Clock.phase(), frames: state.frames, ready: hasGame() };
      if (hasGame() && Game.brief) Object.assign(d, Game.brief());
      return d;
    },

    // Things that must ALWAYS hold. Returns [] or a list of violations — never throws, because
    // a test wants the list, not the first failure.
    invariants() {
      const bad = [];
      if (Clock.t < 0) bad.push('clock.t negative');
      if (!Number.isInteger(Clock.t)) bad.push('clock.t not an integer');
      if (hasGame() && Game.invariants) bad.push.apply(bad, Game.invariants());
      return bad;
    },

    // Counts every item everywhere in the world. This is the conservation probe: the way to
    // refuse to chase a reported duplication ghost is to count before and after N operations.
    census() {
      if (hasGame() && Game.census) return Game.census();
      return { total: 0, byId: {}, note: 'game layer not built' };
    },

    log() { return Log.lines.map((l) => l.text); },
  };

  return { state, start, harness, session, STEP_MS, simulate, draw };
})();

// Install the harness on window under the names every test and capture script expects.
if (typeof window !== 'undefined') {
  window.__game = Debug.harness;
  window.__session = Debug.session;
  window.__debug = Debug;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Debug.start);
  } else {
    Debug.start();
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = Debug;
