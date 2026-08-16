// test/_harness.js — shared test scaffolding.
//
// A silent catch in a test is a lie, and so is a tolerance window. Everything here is built so a
// failure is LOUD: page errors, console errors and unhandled rejections are collected and asserted
// against, rather than being swallowed to keep a suite green. The v1 build hid a hard game-breaking
// portal softlock for hours behind a `.catch(()=>{})` in exactly this layer.

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = 'file://' + path.join(ROOT, 'dist', 'index.html');

// Playwright is installed globally in this environment. NEVER run `playwright install`.
const CHROMIUM = '/opt/pw-browsers/chromium';

function requirePlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    // Global install: resolve through the global node_modules root.
    const { execSync } = require('child_process');
    const root = execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

// ---------------------------------------------------------------- assertions
let passed = 0;
const failures = [];
let suiteName = '';

function suite(name) { suiteName = name; }

function ok(cond, msg) {
  if (cond) { passed++; return true; }
  failures.push((suiteName ? suiteName + ': ' : '') + msg);
  return false;
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  return ok(a === b, msg + '  (expected ' + b + ', got ' + a + ')');
}

function near(actual, expected, tol, msg) {
  // Tolerance is allowed ONLY for genuinely continuous quantities, and the tolerance is stated
  // in the message so a reviewer can see how wide it is.
  return ok(Math.abs(actual - expected) <= tol,
    msg + '  (expected ' + expected + ' +/- ' + tol + ', got ' + actual + ')');
}

function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  return ok(threw, msg + '  (expected a throw, got none)');
}

function report(name) {
  const n = failures.length;
  if (n) {
    console.error('\n' + name + ': ' + passed + ' passed, ' + n + ' FAILED\n');
    for (const f of failures) console.error('  x ' + f);
    console.error('');
    process.exit(1);
  }
  console.log(name + ': ' + passed + ' checks passed');
  return true;
}

// ---------------------------------------------------------------- browser
// Opens dist/index.html and wires up strict error collection.
async function openPage(pw, opts = {}) {
  const browser = await pw.chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 844, height: 390 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('crash', () => errors.push('page crashed'));

  const url = DIST + (opts.query ? '?' + opts.query : '');
  const resp = await page.goto(url, { waitUntil: 'load' });
  if (resp && !resp.ok() && resp.status() !== 0) errors.push('navigation status ' + resp.status());

  // Wait for the harness to install. If it never appears, that IS the finding.
  await page.waitForFunction('typeof window.__game !== "undefined"', null, { timeout: 10000 });

  return { browser, context, page, errors };
}

module.exports = {
  ROOT, DIST, CHROMIUM, requirePlaywright, openPage,
  suite, ok, eq, near, throws, report,
  get passed() { return passed; },
  get failures() { return failures; },
};
