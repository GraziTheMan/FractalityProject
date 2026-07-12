// tests/obsidian-import.test.mjs
//
// Standalone test for the Obsidian importer (run: `node tests/obsidian-import.test.mjs`).
// No test runner required. Reads the sample vault from disk, imports it with an
// in-memory ContentStore (IndexedDB is undefined under Node, so ContentStore
// falls back automatically), and asserts the resulting graph.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { importVault } from '../src/data/obsidian/ObsidianImporter.js';
import { ContentStore } from '../src/data/ContentStore.js';

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = join(here, 'fixtures', 'sample-vault');

let failures = 0;
function check(name, cond, detail = '') {
    const ok = !!cond;
    console.log(`${ok ? '  ✅' : '  ❌'} ${name}${ok ? '' : '  <-- ' + detail}`);
    if (!ok) failures++;
}

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else out.push(full);
    }
    return out;
}

const files = walk(VAULT).map(full => ({
    path: relative(VAULT, full).split(sep).join('/'),
    content: readFileSync(full, 'utf8'),
}));

console.log(`Importing ${files.length} files from sample vault…\n`);
const store = new ContentStore();
const { graph, stats } = await importVault(files, { contentStore: store, vaultName: 'My Vault' });

const byId = new Map(graph.nodes.map(n => [n.id, n]));
const find = pred => graph.nodes.find(pred);
const root = find(n => n.parentId === null);
const welcome = find(n => n.metadata.source?.path === 'Welcome.md');
const daily = find(n => n.metadata.source?.path === 'daily-note-2024.md');
const conceptsFolder = find(n => n.metadata.type === 'Container' && n.metadata.label === 'Concepts');
const consciousness = find(n => n.metadata.label === 'Consciousness');
const resonance = find(n => n.metadata.label === 'Resonance');
const stub = find(n => n.metadata.type === 'stub');

console.log('Import stats:', JSON.stringify(stats), '\n');

console.log('Structure & derivation:');
check('single root at depth 0', root && root.depth === 0 && root.metadata.label === 'My Vault');
check('4 notes imported', stats.notes === 4, `got ${stats.notes}`);
check('label from FILENAME even when an H1 exists', welcome && welcome.metadata.label === 'Welcome',
    welcome && welcome.metadata.label);
check('label from FILENAME when no H1/frontmatter', daily && daily.metadata.label === 'daily-note-2024',
    daily && daily.metadata.label);
check('inline #tags derived without frontmatter', welcome &&
    welcome.metadata.tags.includes('idea') && welcome.metadata.tags.includes('start'),
    welcome && JSON.stringify(welcome.metadata.tags));
check('frontmatter tags parsed', consciousness &&
    consciousness.metadata.tags.includes('philosophy') && consciousness.metadata.tags.includes('mind'),
    consciousness && JSON.stringify(consciousness.metadata.tags));
check('frontmatter type honored', consciousness && consciousness.metadata.type === 'Concept');
check('default type "note" when none given', welcome && welcome.metadata.type === 'note');
check('excerpt generated (non-empty, no # marks)', welcome &&
    welcome.metadata.excerpt.length > 0 && !welcome.metadata.excerpt.includes('#'),
    welcome && JSON.stringify(welcome.metadata.excerpt));

console.log('\nHierarchy (folders -> parent/child):');
check('Concepts is a Container at depth 1', conceptsFolder && conceptsFolder.depth === 1);
check('note nested under its folder', consciousness && consciousness.parentId === conceptsFolder.id
    && consciousness.depth === 2);
check('folder is child of root', conceptsFolder && root.childIds.includes(conceptsFolder.id));

console.log('\nLinks (wikilinks -> cross-edges + stubs):');
check('resolved link Welcome -> Consciousness', welcome &&
    welcome.metadata.links.includes(consciousness.id), welcome && JSON.stringify(welcome.metadata.links));
check('stub created for [[Nonexistent Note]]', stub && stub.metadata.label === 'Nonexistent Note');
check('unresolvedLinks counted', stats.unresolvedLinks === 1, `got ${stats.unresolvedLinks}`);

console.log('\nContent tier:');
check('body stored under contentRef', welcome && welcome.metadata.contentRef === `content:${welcome.id}`);
check('content retrievable from store',
    (await store.get(welcome.id))?.includes('digital garden'));

console.log('\nEngine compatibility (NodeGraph.fromJSON shape):');
check('nodes have {id, parentId, childIds, depth, metadata}', graph.nodes.every(n =>
    'id' in n && 'parentId' in n && Array.isArray(n.childIds) && typeof n.depth === 'number' && n.metadata));
check('stats present', graph.stats && graph.stats.totalNodes === graph.nodes.length);

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${graph.nodes.length} nodes total)`);
process.exit(failures === 0 ? 0 : 1);
