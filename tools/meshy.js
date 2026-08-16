// tools/meshy.js — Meshy text-to-3D client for the sprite foundry.
//
// WHY THIS EXISTS. MM6's creatures were pre-rendered 3D sprites, and ~340 of this project's ~500
// assets are creature frames. The foundry pipeline is:
//
//     3D mesh  ->  OUR fixed light rig  ->  multi-facing render  ->  palette quantise  ->  frames
//
// Meshy supplies only the first box. Everything that produces COHERENCE across hundreds of assets
// — the fixed key light, the camera ladder, the 256-index palette, the 1px outline — stays under
// our control. That is the whole reason this is safe to use at volume: two hundred sprites look
// like one art department because the rig is identical, not because the generator was consistent.
//
// The key is read at call time from outside the repo. Never logged, never an argument, never an
// environment variable.

const fs = require('fs');
const path = require('path');
const oai = require('./oai.js');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'assets', 'raw');
const BASE = 'https://api.meshy.ai/openapi';

const KEY_PATH = process.env.THORNMARCH_MESHY_KEYFILE ||
  '/tmp/claude-0/-home-user-Single-shot-second-try-/d684eb10-ee24-5c43-bab8-12530dc6d561/scratchpad/meshy.key';

function readKey() {
  try {
    const k = fs.readFileSync(KEY_PATH, 'utf8').trim();
    if (k) return k;
  } catch { /* fall through */ }
  throw new Error(
    'No Meshy key. It lives in the session scratchpad and does not survive a new session.\n' +
    'Ask the user to paste it again, then write it to:\n  ' + KEY_PATH
  );
}

async function api(method, endpoint, body) {
  const opts = { key: readKey() };
  if (body) {
    const s = JSON.stringify(body);
    opts.body = s;
    opts.headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) };
  }
  const r = await oai.request(method, BASE + endpoint, opts);
  const text = r.body.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  if (r.status < 200 || r.status >= 300) {
    throw new Error('Meshy ' + method + ' ' + endpoint + ' -> HTTP ' + r.status + ': ' +
      oai.redact(text.slice(0, 400)));
  }
  return json;
}

const balance = () => api('GET', '/v1/balance').then((j) => j.balance);

// Start a preview (geometry-only) task. Returns a task id.
async function createPreview(prompt, opts = {}) {
  const body = Object.assign({
    mode: 'preview',
    prompt,
    art_style: 'realistic',
    ai_model: 'meshy-5',
    should_remesh: true,
    target_polycount: 6000,   // plenty for something that ends up 40px tall
    symmetry_mode: 'auto',
  }, opts);
  const j = await api('POST', '/v2/text-to-3d', body);
  return j.result;
}

// Texture an existing preview. Returns a task id.
async function createRefine(previewId, opts = {}) {
  const body = Object.assign({
    mode: 'refine',
    preview_task_id: previewId,
    enable_pbr: false,          // we relight everything ourselves; PBR maps are wasted bytes
    texture_resolution: '2k',
  }, opts);
  const j = await api('POST', '/v2/text-to-3d', body);
  return j.result;
}

const getTask = (id) => api('GET', '/v2/text-to-3d/' + id);

// ---------------------------------------------------------------- text to image
// Meshy proxies image generation, gpt-image-2 included. This is the OTHER half of the art
// pipeline — the flat single-view surfaces a primitive-built mesh cannot do well: wall and floor
// textures, portraits, sky bands, UI ornament, item icons.
//
// Measured credit costs: nano-banana 3, nano-banana-2 6, nano-banana-pro 9, gpt-image-2 9.
const IMAGE_MODELS = ['nano-banana', 'nano-banana-2', 'nano-banana-pro', 'gpt-image-2'];

// The fixed preamble every generated asset carries. Style consistency across ~150 assets comes
// from this being IDENTICAL every time, not from describing the style afresh per asset.
// NEUTRAL, not warm. The engine applies time of day by ramp arithmetic at draw time, so an asset
// with a colour cast baked in is wrong at every hour except the one it was generated for. This
// must stay in step with the foundry's light rig (tools/foundry/foundry.html) or generated
// textures and rendered sprites will disagree in the same frame.
const STYLE_PREAMBLE =
  '1998 pre-rendered CRPG game asset, 256-colour palette era, neutral daylight with no colour ' +
  'cast, directional key from the upper-left, no modern shading, no ambient occlusion halo, ' +
  'no text, no watermark, no signature, no border, flat even background for masking. ';

async function createImage(prompt, opts = {}) {
  const body = Object.assign({
    ai_model: 'gpt-image-2',
    prompt: (opts.raw ? '' : STYLE_PREAMBLE) + prompt,
    aspect_ratio: '1:1',
  }, opts.body || {});
  delete body.raw;
  const j = await api('POST', '/v1/text-to-image', body);
  return j.result || j.id;
}

const getImageTask = (id) => api('GET', '/v1/text-to-image/' + id);

async function waitForImage(id, { timeoutMs = 6 * 60 * 1000, intervalMs = 4000, onTick } = {}) {
  const t0 = Date.now();
  for (;;) {
    const t = await getImageTask(id);
    if (onTick) onTick(t);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'EXPIRED' || t.status === 'CANCELED') {
      throw new Error('Meshy image task ' + id + ' ended ' + t.status + ': ' +
        JSON.stringify(t.task_error || {}).slice(0, 300));
    }
    if (Date.now() - t0 > timeoutMs) throw new Error('Meshy image task ' + id + ' timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Generate one image and return the raw bytes. Raw RGB is a BUILD INPUT, not an asset: it is
// downsampled and quantised through the palette before anything enters the build.
async function image(prompt, opts = {}) {
  const id = await createImage(prompt, opts);
  const t = await waitForImage(id, opts);
  const urls = t.image_urls || [];
  if (!urls.length) throw new Error('image task ' + id + ' succeeded with no image_urls');
  const bufs = [];
  for (const u of urls) {
    const r = await oai.request('GET', u, { noAuth: true });
    if (r.status !== 200) throw new Error('image download ' + r.status);
    bufs.push(r.body);
  }
  return { id, images: bufs, credits: t.consumed_credits, task: t };
}

// Poll to completion. Fails loudly on FAILED/EXPIRED rather than returning a half-built task —
// a silent partial success here would put a broken mesh into the foundry and the defect would
// surface as "that sprite looks wrong" three stages later.
async function waitFor(id, { timeoutMs = 12 * 60 * 1000, intervalMs = 6000, onTick } = {}) {
  const t0 = Date.now();
  for (;;) {
    const t = await getTask(id);
    if (onTick) onTick(t);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'EXPIRED' || t.status === 'CANCELED') {
      throw new Error('Meshy task ' + id + ' ended ' + t.status + ': ' +
        JSON.stringify(t.task_error || {}).slice(0, 300));
    }
    if (Date.now() - t0 > timeoutMs) throw new Error('Meshy task ' + id + ' timed out after ' + timeoutMs + 'ms');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Download a signed asset URL. No bearer token: it is a CDN URL, and sending credentials to a
// third-party host that does not need them is how keys leak.
async function download(url, dest) {
  const r = await oai.request('GET', url, { noAuth: true });
  if (r.status !== 200) throw new Error('download ' + r.status + ' for ' + url.split('?')[0]);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, r.body);
  return r.body.length;
}

module.exports = {
  readKey, balance, createPreview, createRefine, getTask, waitFor, download, RAW,
  IMAGE_MODELS, STYLE_PREAMBLE, createImage, getImageTask, waitForImage, image,
};

// --------------------------------------------------------------------------- CLI
async function main() {
  const cmd = process.argv[2];

  if (cmd === 'balance') {
    console.log('balance:', await balance());
    return;
  }

  if (cmd === 'probe') {
    // One creature, end to end, with the credit cost MEASURED rather than guessed.
    const before = await balance();
    console.log('balance before      : ' + before);

    const prompt =
      'A hunched goblin warrior, low-poly game character, standing in a T-pose, ' +
      'leather scraps and a rusted iron cleaver, long ears, green-grey skin, ' +
      'stylised fantasy, clean silhouette, no base, no ground plane.';

    process.stdout.write('preview task ... ');
    const pid = await createPreview(prompt, { target_polycount: 5000, pose_mode: 't-pose' });
    console.log(pid);

    let lastPct = -1;
    const prev = await waitFor(pid, {
      onTick: (t) => {
        if (t.progress !== lastPct) { lastPct = t.progress; process.stdout.write('\r  preview ' + t.progress + '%   '); }
      },
    });
    console.log('\n  preview SUCCEEDED');
    const afterPreview = await balance();
    console.log('  cost (preview)    : ' + (before - afterPreview) + ' credits');

    process.stdout.write('refine task ... ');
    const rid = await createRefine(pid);
    console.log(rid);
    lastPct = -1;
    const ref = await waitFor(rid, {
      onTick: (t) => {
        if (t.progress !== lastPct) { lastPct = t.progress; process.stdout.write('\r  refine ' + t.progress + '%   '); }
      },
    });
    console.log('\n  refine SUCCEEDED');
    const afterRefine = await balance();
    console.log('  cost (refine)     : ' + (afterPreview - afterRefine) + ' credits');
    console.log('  cost (total)      : ' + (before - afterRefine) + ' credits');
    console.log('  balance after     : ' + afterRefine);

    const urls = ref.model_urls || {};
    console.log('  formats           : ' + Object.keys(urls).join(', '));
    if (urls.glb) {
      const dest = path.join(RAW, 'meshy', 'probe_goblin.glb');
      const n = await download(urls.glb, dest);
      console.log('  glb               : ' + (n / 1024).toFixed(0) + ' KB -> assets/raw/meshy/probe_goblin.glb');
    }
    if (ref.thumbnail_url) {
      const dest = path.join(RAW, 'meshy', 'probe_goblin_thumb.png');
      await download(ref.thumbnail_url, dest);
      console.log('  thumbnail         : assets/raw/meshy/probe_goblin_thumb.png');
    }
    return;
  }

  if (cmd === 'image') {
    // Prove the image path and MEASURE the cost, rather than trusting the docs table.
    const model = process.argv[3] || 'gpt-image-2';
    const name = process.argv[4] || 'wall_anchor';
    const prompt = process.argv[5] ||
      'Seamless tiling stone wall texture for a fantasy dungeon. Weathered grey granite ashlar ' +
      'blocks in regular courses, deep mortar joints, chipped edges, faint moss in the recesses. ' +
      'Orthographic flat-on view, evenly lit, no perspective, no vignette, no shadows cast onto ' +
      'the surface from outside it.';

    const before = await balance();
    console.log('model: ' + model + '   balance before: ' + before);
    process.stdout.write('generating ... ');
    const t0 = Date.now();
    const r = await image(prompt, { body: { ai_model: model, aspect_ratio: '1:1' } });
    const after = await balance();

    fs.mkdirSync(path.join(RAW, 'img'), { recursive: true });
    r.images.forEach((buf, i) => {
      const dest = path.join(RAW, 'img', name + (r.images.length > 1 ? '_' + i : '') + '.png');
      fs.writeFileSync(dest, buf);
      console.log('  -> assets/raw/img/' + path.basename(dest) + '  ' + (buf.length / 1024).toFixed(0) + ' KB');
    });
    console.log('  time            : ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    console.log('  consumed_credits: ' + r.credits);
    console.log('  measured cost   : ' + (before - after) + ' credits');
    console.log('  balance after   : ' + after);
    return;
  }

  console.log('usage: node tools/meshy.js balance | probe | image [model] [name] [prompt]');
}

if (require.main === module) {
  main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
}
