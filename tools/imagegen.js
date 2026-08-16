// tools/imagegen.js — image generation -> palette-quantised asset pipeline.
//
// Generation is a BUILD INPUT, never a build step. It is non-deterministic; the build must be
// reproducible. Raw RGB output lands in assets/raw/ (gitignored). Only reviewed, quantised,
// committed data enters dist/.
//
// The key is read at call time from outside the repo by tools/oai.js. It is never an argument,
// never an environment variable, never logged.

const fs = require('fs');
const path = require('path');
const oai = require('./oai.js');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'assets', 'raw');

// Token rates, $ per 1M tokens, from the live pricing page (2026-08).
// text_in is charged at model rates; image output dominates and is what we budget against.
const RATES = {
  'gpt-image-2':      { text_in: 5.00, img_in: 8.00, out: 30.00 },
  'gpt-image-1.5':    { text_in: 5.00, img_in: 8.00, out: 32.00 },
  'gpt-image-1':      { text_in: 5.00, img_in: 10.00, out: 40.00 },
  'gpt-image-1-mini': { text_in: 2.00, img_in: 2.50, out: 8.00 },
};

// Cost of one response, computed from the usage object the API actually returned rather than
// from a remembered table. Give the user a number before spending, not after.
function costOf(model, usage) {
  const r = RATES[model];
  if (!r || !usage) return null;
  const d = usage.input_tokens_details || {};
  const textIn = d.text_tokens != null ? d.text_tokens : (usage.input_tokens || 0);
  const imgIn = d.image_tokens || 0;
  const out = usage.output_tokens || 0;
  return (textIn * r.text_in + imgIn * r.img_in + out * r.out) / 1e6;
}

async function generate({ model = 'gpt-image-1-mini', prompt, size = '1024x1024', quality = 'low', n = 1, output_format = 'png' }) {
  const body = JSON.stringify({ model, prompt, size, quality, n, output_format });
  const res = await oai.request('POST', 'https://api.openai.com/v1/images/generations', {
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    body,
  });
  const text = res.body.toString('utf8');
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error('Non-JSON response (' + res.status + '): ' + oai.redact(text.slice(0, 400)));
  }
  if (res.status !== 200) {
    // Surface the API's own message. Do NOT retry a 4xx: a 401/403 is a policy or credential
    // denial, and retrying burns time without changing the outcome.
    throw new Error('HTTP ' + res.status + ': ' + oai.redact(JSON.stringify(json.error || json).slice(0, 500)));
  }
  return {
    images: (json.data || []).map((d) => Buffer.from(d.b64_json, 'base64')),
    usage: json.usage || null,
    cost: costOf(model, json.usage),
  };
}

// --------------------------------------------------------------------------- CLI
async function main() {
  const cmd = process.argv[2];

  if (cmd === 'probe') {
    // One deliberately cheap call whose purpose is to (a) prove the pipeline reaches the API and
    // (b) return a real usage object so the full-run estimate is grounded in measurement.
    const model = process.argv[3] || 'gpt-image-1-mini';
    const quality = process.argv[4] || 'low';
    const prompt =
      'Seamless stone wall texture for a 1998 pre-rendered CRPG. 256-colour palette, hard warm ' +
      'key light from the upper-left, visible courses and mortar joints, weathered grey-brown ' +
      'granite blocks. No modern shading, no text, no signature, flat even lighting for tiling.';

    process.stdout.write('probe: ' + model + ' / ' + quality + ' / 1024x1024 ... ');
    const t0 = Date.now();
    const r = await generate({ model, quality, prompt });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    fs.mkdirSync(RAW, { recursive: true });
    const out = path.join(RAW, 'probe_' + model + '_' + quality + '.png');
    fs.writeFileSync(out, r.images[0]);

    console.log('ok in ' + secs + 's');
    console.log('  bytes      : ' + r.images[0].length);
    console.log('  usage      : ' + JSON.stringify(r.usage));
    console.log('  cost       : $' + (r.cost == null ? '?' : r.cost.toFixed(5)));
    console.log('  written    : assets/raw/' + path.basename(out) + '  (gitignored)');
    return;
  }

  console.log('usage: node tools/imagegen.js probe [model] [quality]');
}

if (require.main === module) {
  main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
}

module.exports = { generate, costOf, RATES };
