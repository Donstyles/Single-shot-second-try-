// Shared OpenAI access for the art pipeline.
//
// The key is read from a file OUTSIDE the repo, at call time, and is never logged, never placed in
// an environment variable, never passed as an argument, and never written to disk inside the tree.
// The scratchpad does not outlive the session: a new session needs the key pasted again.
//
// Egress goes through the agent proxy. Node needs the proxy CA. A 403 on CONNECT is a POLICY
// DENIAL, not a transient error — do not retry it, do not disable TLS verification, do not unset
// HTTPS_PROXY.

const fs = require('fs');
const path = require('path');
const https = require('https');

const KEY_CANDIDATES = [
  process.env.THORNMARCH_KEYFILE,
  '/tmp/claude-0/-home-user-Single-shot-second-try-/d684eb10-ee24-5c43-bab8-12530dc6d561/scratchpad/openai.key',
].filter(Boolean);

function readKey() {
  for (const p of KEY_CANDIDATES) {
    try {
      const k = fs.readFileSync(p, 'utf8').trim();
      if (k) return k;
    } catch { /* try next */ }
  }
  throw new Error(
    'No API key found. It lives in the session scratchpad and does not survive a new session.\n' +
    'Ask the user to paste it again, then write it to:\n  ' + KEY_CANDIDATES[KEY_CANDIDATES.length - 1]
  );
}

function hasKey() {
  try { readKey(); return true; } catch { return false; }
}

// Redact anything key-shaped before it can reach a log.
function redact(s) {
  return String(s).replace(/sk-[A-Za-z0-9_\-]{12,}/g, 'sk-***REDACTED***');
}

function agent() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const caPath = '/root/.ccr/ca-bundle.crt';
  const opts = {};
  if (fs.existsSync(caPath)) opts.ca = fs.readFileSync(caPath);
  return { proxy, opts };
}

// Minimal proxy-aware HTTPS POST/GET returning {status, body}.
function request(method, url, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const { proxy, opts } = agent();
    const key = readKey();
    const hdrs = Object.assign({ Authorization: 'Bearer ' + key }, headers);

    const done = (res, chunks) => resolve({ status: res.statusCode, body: Buffer.concat(chunks) });

    const fire = (socket) => {
      const req = https.request({
        host: u.hostname, port: 443, path: u.pathname + u.search, method,
        headers: hdrs, socket, agent: false, ca: opts.ca,
      }, (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => done(res, chunks));
      });
      req.on('error', (e) => reject(new Error(redact(e.message))));
      if (body) req.write(body);
      req.end();
    };

    if (!proxy) return fire(undefined);

    const p = new URL(proxy);
    require('http').request({
      host: p.hostname, port: p.port || 80, method: 'CONNECT',
      path: u.hostname + ':443',
      headers: p.username ? { 'Proxy-Authorization': 'Basic ' + Buffer.from(decodeURIComponent(p.username) + ':' + decodeURIComponent(p.password || '')).toString('base64') } : {},
    })
      .on('connect', (res, socket) => {
        if (res.statusCode === 403) {
          return reject(new Error(
            'CONNECT 403 — the environment network policy denies ' + u.hostname + '. ' +
            'This is a policy denial, not a transient error. Do not retry. The setting applies to ' +
            'NEW sessions only; an existing session cannot be unblocked.'
          ));
        }
        if (res.statusCode !== 200) return reject(new Error('CONNECT ' + res.statusCode));
        fire(socket);
      })
      .on('error', (e) => reject(new Error(redact(e.message))))
      .end();
  });
}

async function getJSON(url) {
  const r = await request('GET', url);
  let j = null;
  try { j = JSON.parse(r.body.toString('utf8')); } catch { /* non-JSON */ }
  return { status: r.status, json: j, text: redact(r.body.toString('utf8').slice(0, 800)) };
}

module.exports = { readKey, hasKey, redact, request, getJSON };
