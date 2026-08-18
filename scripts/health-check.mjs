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

// --- 3b. Named imports exist in the target module ---------------------------
//
// Path resolution alone missed two real bugs: chat-ai-hub.js imported
// { chatSocket } from a module that never exported it, and chat-ui.js imported
// { initChatUI } from itself. Both resolved to a real file and to undefined.

const NAMED_IMPORT_RE =
  /import\s+(?:[\w$]+\s*,\s*)?\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gm;

/** Exported names of a module: `export function x`, `export const x`, `export { a, b }`. */
function exportedNames(src) {
  const names = new Set();

  const direct = /export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([\w$]+)/g;
  let m;
  while ((m = direct.exec(src)) !== null) names.add(m[1]);

  const braced = /export\s*\{([^}]+)\}/g;
  while ((m = braced.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const alias = part.trim().split(/\s+as\s+/).pop().trim();
      if (alias) names.add(alias);
    }
  }

  if (/export\s+default/.test(src)) names.add('default');
  // `export * from` re-exports an unknown set; treat the module as opaque
  if (/export\s*\*\s*from/.test(src)) names.add('*');

  return names;
}

for (const f of jsFiles) {
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  let m;
  NAMED_IMPORT_RE.lastIndex = 0;

  while ((m = NAMED_IMPORT_RE.exec(src)) !== null) {
    const [, clause, spec] = m;
    if (!spec.startsWith('.')) continue;

    const target = resolveSpec(f, spec);
    if (!target) continue; // already reported as unresolved above

    const available = exportedNames(fs.readFileSync(target, 'utf8'));
    if (available.has('*')) continue; // re-exports; can't verify statically

    const line = src.slice(0, m.index).split('\n').length;

    for (const part of clause.split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (!name || name === 'default') continue;

      if (!available.has(name)) {
        report(
          'error', f,
          `imports { ${name} } from "${spec}", which does not export it`,
          `line ${line}`
        );
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

// Packages deliberately left out of package.json, with the reason. Anything
// not listed here is flagged, so a genuinely forgotten dependency still shows
// up rather than being lost among known-and-accepted ones.
const INTENTIONALLY_UNDECLARED = new Map([
  ['playwright',
   'dev-only browser check; a browser download in every deploy is not worth it'],
]);

for (const [pkgName, sites] of undeclared) {
  const reason = INTENTIONALLY_UNDECLARED.get(pkgName);
  if (reason) {
    report(
      'info',
      path.join(ROOT, sites[0].split(':')[0]),
      `imports "${pkgName}", intentionally not in package.json`,
      reason
    );
    continue;
  }

  report(
    'warn',
    path.join(ROOT, sites[0].split(':')[0]),
    `imports "${pkgName}", which is not in package.json`,
    `${sites.length} site(s), e.g. ${sites.slice(0, 2).join(', ')}`
  );
}

// --- 5b. Selectors styled from two places ----------------------------------
//
// Several components style themselves by injecting a <style> at runtime, while
// src/styles/*.css style the page globally. When both target the same selector,
// neither wins outright — each property is resolved separately, so a component
// silently inherits whichever declarations it did not happen to override.
//
// That is not hypothetical here. `.notification` was styled both in main.css and
// in an injected block in main.js. The injected rules set top/left/right; the
// stylesheet contributed `bottom` and a `transform`, which nothing overrode. The
// result was a toast 814px tall on an 844px screen, shifted 185px off the left
// edge of a phone — and it looked correct in the DOM.
//
// Only positioning and layout declarations are compared. Sharing a colour is
// usually deliberate; sharing an edge or a transform is how elements end up off
// screen.

const LAYOUT_PROPS = new Set([
  'position', 'top', 'right', 'bottom', 'left',
  'transform', 'width', 'height', 'max-width', 'max-height',
  'display', 'margin', 'z-index'
]);

/** Selector -> Set of layout properties it declares, per source file. */
function layoutDeclarations(css) {
  const found = new Map();
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = m[1].trim();
    if (head.startsWith('@') || head.includes('%')) continue;

    const props = new Set();
    for (const decl of m[2].split(';')) {
      const name = decl.split(':')[0]?.trim().toLowerCase();
      if (name && LAYOUT_PROPS.has(name)) props.add(name);
    }
    if (props.size === 0) continue;

    for (let sel of head.split(',')) {
      sel = sel.trim();
      // Compare the base class only: `.x` and `.x.open` are the same element.
      const base = sel.match(/^(\.[A-Za-z0-9_-]+)/);
      if (!base) continue;
      if (!found.has(base[1])) found.set(base[1], new Set());
      for (const prop of props) found.get(base[1]).add(prop);
    }
  }
  return found;
}

const layoutBySelector = new Map();   // selector -> Map<file, Set<prop>>

function collectLayout(file, css) {
  for (const [sel, props] of layoutDeclarations(css)) {
    if (!layoutBySelector.has(sel)) layoutBySelector.set(sel, new Map());
    const perFile = layoutBySelector.get(sel);
    if (!perFile.has(file)) perFile.set(file, new Set());
    for (const prop of props) perFile.get(file).add(prop);
  }
}

for (const f of files.filter(f => f.endsWith('.css'))) {
  if (path.relative(ROOT, f).startsWith(ARCHIVE_PREFIX)) continue;
  collectLayout(f, fs.readFileSync(f, 'utf8'));
}

// Styles injected from JS: `style.textContent = \`...\`` and friends.
const INJECTED_CSS_RE = /textContent\s*=\s*`([\s\S]*?)`/g;
for (const f of jsFiles) {
  if (path.relative(ROOT, f).startsWith(ARCHIVE_PREFIX)) continue;
  const src = fs.readFileSync(f, 'utf8');
  INJECTED_CSS_RE.lastIndex = 0;
  for (const m of src.matchAll(INJECTED_CSS_RE)) {
    // Only template literals that actually look like a stylesheet.
    if (!/\{[^}]*:[^}]*\}/.test(m[1])) continue;
    collectLayout(f, m[1]);
  }
}

for (const [sel, perFile] of layoutBySelector) {
  if (perFile.size < 2) continue;

  const sources = [...perFile.keys()];
  // Report only where the SAME layout property is set from two places, since
  // that is the case where the outcome depends on load order.
  const counts = new Map();
  for (const props of perFile.values()) {
    for (const prop of props) counts.set(prop, (counts.get(prop) ?? 0) + 1);
  }
  const contested = [...counts.entries()].filter(([, n]) => n > 1).map(([p]) => p);
  if (contested.length === 0) continue;

  report(
    'warn',
    sources[0],
    `"${sel}" has its layout set from ${perFile.size} places, contesting: ${contested.join(', ')}`,
    `also in ${sources.slice(1).map(f => path.relative(ROOT, f)).join(', ')}`
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
// 'info' findings are recorded and printed but not counted: they document a
// deliberate choice, so counting them would make the summary line drift upward
// for reasons nobody should act on.
const notes = findings.filter(f => f.level === 'info');

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
      const icon = f.level === 'error' ? '  ✗' : f.level === 'info' ? '  ·' : '  ⚠';
      console.log(`${icon} ${f.message}${f.detail ? `  (${f.detail})` : ''}`);
    }
  }
  console.log('');
}

console.log('='.repeat(60));
console.log(
  `${errors.length} error(s), ${warnings.length} warning(s)` +
  (notes.length ? `, ${notes.length} note(s)` : '')
);

process.exit(errors.length > 0 ? 1 : 0);
