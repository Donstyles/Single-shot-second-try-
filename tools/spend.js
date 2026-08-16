// tools/spend.js — a hard spending ceiling for paid APIs.
//
// This is a MECHANISM, not a promise. Every paid call goes through reserve() first, and reserve()
// throws when the ceiling would be crossed. There is no path in tools/ that spends the user's
// credits without passing through here, and the ledger is committed so the record is auditable
// rather than something the agent reports about itself.
//
// Raising the cap is a deliberate act by the user (edit CAP below or write .spend-cap), never
// something the agent does to unblock itself. If a run needs more, it stops and asks.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(ROOT, 'assets', 'spend-ledger.json');
const CAP_FILE = path.join(ROOT, '.spend-cap');

// Conservative default. ~35 meshes (525) plus anchors is the realistic full art run, so this is
// deliberately below "spend it all": crossing it should require a human decision.
const DEFAULT_CAP = 400;

function cap() {
  try {
    const v = parseInt(fs.readFileSync(CAP_FILE, 'utf8').trim(), 10);
    if (Number.isFinite(v) && v >= 0) return v;
  } catch { /* no override file */ }
  return DEFAULT_CAP;
}

function load() {
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); }
  catch { return { entries: [], spent: 0 }; }
}

function save(l) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n');
}

const spent = () => load().spent;
const remaining = () => Math.max(0, cap() - spent());

// Call BEFORE spending. Throws if this operation would cross the ceiling.
function reserve(credits, op) {
  const l = load();
  const c = cap();
  if (l.spent + credits > c) {
    throw new Error(
      'SPEND CAP REACHED — refusing to run "' + op + '".\n' +
      '  already spent : ' + l.spent + ' credits\n' +
      '  this would add: ' + credits + '\n' +
      '  ceiling       : ' + c + '\n' +
      '  Raise it deliberately by writing a number to .spend-cap, or stop here.\n' +
      '  This is a hard stop by design: the agent does not raise its own ceiling.'
    );
  }
  return true;
}

// Call AFTER spending, with the MEASURED cost (balance delta or the API's own consumed_credits),
// never an estimate. An estimated ledger drifts from reality and stops being a control.
function record(credits, op, note) {
  const l = load();
  l.entries.push({
    n: l.entries.length + 1,
    op,
    credits,
    note: note || '',
    // No wall-clock timestamp: it would make the committed ledger churn on every run and turn
    // every diff into noise. Sequence is what matters for an audit.
  });
  l.spent += credits;
  save(l);
  return l.spent;
}

function report() {
  const l = load();
  const c = cap();
  const byOp = {};
  for (const e of l.entries) byOp[e.op] = (byOp[e.op] || 0) + e.credits;
  return { spent: l.spent, cap: c, remaining: Math.max(0, c - l.spent), calls: l.entries.length, byOp };
}

module.exports = { reserve, record, spent, remaining, cap, report, LEDGER, CAP_FILE, DEFAULT_CAP };

if (require.main === module) {
  const r = report();
  console.log('spend ledger');
  console.log('  calls     : ' + r.calls);
  console.log('  spent     : ' + r.spent + ' credits');
  console.log('  ceiling   : ' + r.cap + (fs.existsSync(CAP_FILE) ? '  (from .spend-cap)' : '  (default)'));
  console.log('  remaining : ' + r.remaining + ' before the hard stop');
  for (const op of Object.keys(r.byOp).sort()) console.log('    ' + op.padEnd(22) + r.byOp[op]);
}
