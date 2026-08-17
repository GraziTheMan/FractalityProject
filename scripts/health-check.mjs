#!/usr/bin/env node
// scripts/health-check.mjs
//
// Static health check for the repo. Run with `npm run health`.
//
// This exists because the project was assembled largely by pasting code out of
// AI chat transcripts, which produced a specific family of defects that no
// linter was catching: files truncated mid-token at a copy limit, imports
// pointing at modules that were never created, template literals still carrying
// their escaping, and dunder names eaten by a markdown renderer.
//
// Checks performed:
//   1. JS/MJS files parse as ES modules
//   2. Python files compile
//   3. Relative imports resolve to real files
//   4. HTML src/href references resolve
//   5. Bare (npm) imports are declared in package.json
//   6. Chat-paste damage signatures (escaped backticks, 20000-byte truncation)
//
// Exit code is 1 if any error-level finding is present, so it can gate CI.
// Paths under archive/ are reported as warnings only.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', '__pycache__', '.vite']);
const ARCHIVE_PREFIX = 'archive' + path.sep;

// Node built-ins that are legitimate in server-side code
const NODE_BUILTINS = new Set([
  'fs', 'path', 'http', 'https', 'url', 'os', 'crypto', 'events', 'stream',
  'util', 'child_process', 'zlib', 'net', 'assert', 'buffer', 'readline'
]);

const findings = [];
function report(level, file, message, detail) {
  const rel = path.relative(ROOT, file);
  // Archived code is kept for reference and is not expected to resolve
  const effective = rel.startsWith(ARCHIVE_PREFIX) && level === 'error' ? 'warn' : level;
  findings.push({ level: effective, file: rel, message, detail });
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// This script is excluded from the import and damage-signature scans: its own
// regex literals and message templates contain the very patterns it looks for.
const files = walk(ROOT).filter(f => f !== SELF);
const jsFiles = files.filter(f => /\.(js|mjs)$/.test(f));
const pyFiles = files.filter(f => /\.py$/.test(f));
const htmlFiles = files.filter(f => /\.html$/.test(f));

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/**
 * Replace comment bodies with spaces so example code inside /* *\/ blocks is
 * not mistaken for real imports, while keeping byte offsets (and therefore
 * line numbers) intact.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

// --- 1. JS parses as ESM ----------------------------------------------------

const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'fractality-health-'));
const tmpFile = path.join(tmpDir, 'check.mjs');

for (const f of jsFiles) {
  fs.copyFileSync(f, tmpFile);
  try {
    execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' });
  } catch (err) {
    const msg = String(err.stderr || err.message)
      .split('\n')
      .find(l => /Error/.test(l)) || 'parse error';
    report('error', f, 'does not parse as an ES module', msg.trim());
  }
}
fs.rmSync(tmpDir, { recursive: true, force: true });

// --- 2. Python compiles -----------------------------------------------------

for (const f of pyFiles) {
  try {
    execFileSync('python3', ['-m', 'py_compile', f], { stdio: 'pipe' });
  } catch (err) {
    const msg = String(err.stderr || err.message)
      .split('\n')
      .filter(l => /Error|error/.test(l))
      .slice(-1)[0] || 'compile error';
    report('error', f, 'does not compile', msg.trim());
  }
}

// --- 3. Relative imports resolve -------------------------------------------

const IMPORT_RE =
  /(?:^|[\s;{(])(?:import\s+(?:[\w*{},\s$]+\s+from\s+)?|export\s+(?:\*|{[^}]*})\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]/gm;

function resolveSpec(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base, base + '.js', base + '.mjs',
    path.join(base, 'index.js'), path.join(base, 'index.mjs')
  ];
  return candidates.find(isFile) || null;
}

const declaredDeps = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {})
    ]);
  } catch {
    return new Set();
  }
})();

const undeclared = new Map();

for (const f of jsFiles) {
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  let m;
  IMPORT_RE.lastIndex = 0;

  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1];
    const line = src.slice(0, m.index).split('\n').length;

    if (spec.startsWith('.')) {
      if (!resolveSpec(f, spec)) {
        report('error', f, `unresolved import "${spec}"`, `line ${line}`);
      }
    } else if (!/^(https?:|\/)/.test(spec)) {
      // The node: prefix is unambiguously a built-in (node:test, node:assert)
      if (spec.startsWith('node:')) continue;

      const pkgName = spec.startsWith('@')
        ? spec.split('/').slice(0, 2).join('/')
        : spec.split('/')[0];

      if (!declaredDeps.has(pkgName) && !NODE_BUILTINS.has(pkgName)) {
        if (!undeclared.has(pkgName)) undeclared.set(pkgName, []);
        undeclared.get(pkgName).push(`${path.relative(ROOT, f)}:${line}`);
      }
    }
  }
}

// --- 4. HTML references resolve --------------------------------------------

const HTML_REF_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/g;

for (const f of htmlFiles) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  HTML_REF_RE.lastIndex = 0;

  while ((m = HTML_REF_RE.exec(src)) !== null) {
    const ref = m[1];
    if (/^(https?:|\/\/|#|data:|mailto:|javascript:)/.test(ref)) continue;

    const clean = ref.split('?')[0].split('#')[0];
    if (!clean) continue;

    if (!isFile(path.resolve(path.dirname(f), clean))) {
      report('error', f, `missing referenced file "${ref}"`);
    }
  }
}

// --- 5. Undeclared npm packages --------------------------------------------

for (const [pkgName, sites] of undeclared) {
  report(
    'warn',
    path.join(ROOT, sites[0].split(':')[0]),
    `imports "${pkgName}", which is not in package.json`,
    `${sites.length} site(s), e.g. ${sites.slice(0, 2).join(', ')}`
  );
}

// --- 6. Chat-paste damage signatures --------------------------------------

for (const f of [...jsFiles, ...htmlFiles, ...pyFiles]) {
  const buf = fs.readFileSync(f);

  // Escaped backticks: template literal pasted from inside another one
  if (/\\`/.test(buf.toString('utf8'))) {
    report('error', f, 'contains escaped backticks (\\`) — template literal was pasted escaped');
  }

  // Exactly-20000-byte files were cut off by a chat copy limit
  if (buf.length >= 19995 && buf.length <= 20005) {
    report('warn', f, `is ${buf.length} bytes — suspiciously close to the 20000-byte paste limit; check the tail`);
  }
}

// Python files that define classes but never use __init__ may have had their
// dunders stripped by a markdown renderer.
for (const f of pyFiles) {
  const src = fs.readFileSync(f, 'utf8');
  if (/^\s*class\s+\w+/m.test(src) && /\bdef init\(self/.test(src)) {
    report('error', f, 'has "def init(self" — underscores were likely stripped from __init__');
  }
}

// --- output ----------------------------------------------------------------

const errors = findings.filter(f => f.level === 'error');
const warnings = findings.filter(f => f.level === 'warn');

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

console.log('Fractality health check');
console.log('='.repeat(60));
console.log(
  `Scanned ${jsFiles.length} JS, ${pyFiles.length} Python, ${htmlFiles.length} HTML files.\n`
);

if (findings.length === 0) {
  console.log('✅ No issues found.');
} else {
  for (const file of [...byFile.keys()].sort()) {
    console.log(file);
    for (const f of byFile.get(file)) {
      const icon = f.level === 'error' ? '  ✗' : '  ⚠';
      console.log(`${icon} ${f.message}${f.detail ? `  (${f.detail})` : ''}`);
    }
  }
  console.log('');
}

console.log('='.repeat(60));
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);

process.exit(errors.length > 0 ? 1 : 0);
