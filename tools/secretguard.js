#!/usr/bin/env node
// Fails loudly if anything that looks like a credential is staged, tracked, or sitting in the tree.
// Run standalone, from the test suite, and from .git/hooks/pre-commit.
//
// This exists because a leaked key is the one mistake in this project that cannot be undone by
// editing a file. Everything else is recoverable.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Patterns are deliberately broad. A false positive costs one conversation; a miss costs the user.
const PATTERNS = [
  [/sk-proj-[A-Za-z0-9_-]{20,}/, 'OpenAI project key'],
  [/sk-[A-Za-z0-9]{32,}/, 'OpenAI legacy key'],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic key'],
  [/msy_[A-Za-z0-9]{24,}/, 'Meshy key'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key block'],
  [/Bearer\s+[A-Za-z0-9_\-.]{40,}/, 'bearer token'],
];

const SKIP_DIRS = new Set(['.git', 'node_modules', 'assets/raw']);

function scan(text, label, hits) {
  for (const [re, what] of PATTERNS) {
    if (re.test(text)) hits.push(`${label}: ${what}`);
  }
}

function walk(dir, root, hits) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full);
    if (SKIP_DIRS.has(name) || SKIP_DIRS.has(rel)) continue;
    const st = fs.lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) { walk(full, root, hits); continue; }
    if (st.size > 4 * 1024 * 1024) continue;
    // secretguard.js itself contains the patterns by definition.
    if (rel === path.join('tools', 'secretguard.js')) continue;
    let buf;
    try { buf = fs.readFileSync(full); } catch { continue; }
    if (buf.includes(0)) continue; // binary
    scan(buf.toString('utf8'), rel, hits);
  }
}

function main() {
  const root = path.resolve(__dirname, '..');
  const hits = [];

  walk(root, root, hits);

  // Staged content too — catches a file added then deleted from the worktree.
  try {
    const staged = execSync('git diff --cached', { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString();
    scan(staged, 'STAGED DIFF', hits);
  } catch { /* not a git repo, or nothing staged — the tree scan above still ran */ }

  if (hits.length) {
    console.error('\n  SECRET GUARD FAILED — credential-shaped content found:\n');
    for (const h of hits) console.error('    ' + h);
    console.error('\n  Nothing is committed. Remove it and re-run.\n');
    process.exit(1);
  }
  console.log('secretguard: clean (' + PATTERNS.length + ' patterns)');
}

main();
