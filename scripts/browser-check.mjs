#!/usr/bin/env node
/**
 * scripts/browser-check.mjs
 *
 *     npm run build && npm run browser-check
 *
 * Drives the built site in a real browser at three viewports and asserts the
 * things that only a browser can answer. `npm run health` parses files; this
 * clicks them.
 *
 * It exists because counting elements is not the same as reaching them. Every
 * one of the checks below corresponds to a bug that shipped and that no amount
 * of reading the source would have found:
 *
 *   - the dock was hidden below 720px, taking Maps/Search/Debug with it, so on
 *     a phone there was no way to open any of them
 *   - `.desktop-dock { max-width: calc(100vw - 420px) }` goes NEGATIVE on a
 *     390px screen, collapsing the dock to zero width
 *   - the radial menu spaced its items by equal ANGLE, which bunches them at
 *     the poles of the ellipse: "🧠 Mindmap" rendered underneath "👥 Social"
 *     (that menu is gone now; the dock replaced it)
 *   - eight of that menu's nine buttons pointed at views that had never been
 *     built, so they only printed "Switched to: <name>"
 *   - the node info panel was shown only on `mousemove`, an event that does
 *     not exist on a touch screen, so tapping a node did nothing visible
 *   - THREE.InstancedMesh caches its raycast bounding sphere on first use and
 *     never invalidates it, so clicking a node silently stopped working once
 *     the layout drifted or the geometry swapped to low-poly
 *
 * Playwright is NOT a dependency of this project: it pulls a browser download
 * that would bloat every deploy for the sake of a check that runs locally. The
 * script skips cleanly when it is absent.
 *
 *     npm i -D playwright && npx playwright install chromium
 *
 * Set BROWSER_CHECK_URL to point at something other than the local preview.
 *
 * The whole run takes a few minutes. BROWSER_CHECK_ONLY narrows it to the
 * sections whose names contain a substring, which is what you want while working
 * on one surface:
 *
 *     BROWSER_CHECK_ONLY=feed npm run browser-check
 *     BROWSER_CHECK_ONLY=cone,dock npm run browser-check
 */

const URL = process.env.BROWSER_CHECK_URL || 'http://localhost:4173/';

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch {
    console.log('SKIP  playwright is not installed.');
    console.log('      npm i -D playwright && npx playwright install chromium');
    process.exit(0);
}

// A pre-installed browser can be a different build than the one Playwright
// expects; honour an explicit path rather than failing on the version check.
const launchOptions = process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {};

const VIEWPORTS = [
    { name: 'phone portrait',  width: 390,  height: 844, mobile: true },
    { name: 'phone landscape', width: 844,  height: 390, mobile: true },
    { name: 'desktop',         width: 1440, height: 900, mobile: false },
];

let failures = 0;
const pass = (msg) => console.log(`  ok  ${msg}`);
const fail = (msg) => { failures++; console.log(`FAIL  ${msg}`); };

/**
 * Should a section run?
 *
 * Sections are skipped rather than removed, and a skip is printed, so a narrowed
 * run cannot be mistaken for a clean full one.
 */
const ONLY = (process.env.BROWSER_CHECK_ONLY || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function section(name) {
    const wanted = ONLY.length === 0 || ONLY.some((needle) => name.toLowerCase().includes(needle));
    const rule = '-'.repeat(Math.max(0, 61 - name.length));
    if (!wanted) {
        console.log(`\n--- ${name} ${rule}\n  -- skipped (BROWSER_CHECK_ONLY=${ONLY.join(',')})`);
        return false;
    }
    console.log(`\n--- ${name} ${rule}`);
    return true;
}

const browser = await chromium.launch(launchOptions);

/** Open the site with the 3D view booted, which is what most checks need. */
async function openApp(viewport) {
    const ctx = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.mobile,
        isMobile: viewport.mobile,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(URL, { waitUntil: 'networkidle' });
    // main.js opens the 'bubble' view on DOMContentLoaded, which is what boots
    // the engine. Wait for it rather than clicking anything.
    await page.waitForFunction(() => Boolean(window.fractalityEngine?.()), { timeout: 15000 })
        .catch(() => {});
    await page.waitForTimeout(2000);
    return { ctx, page, errors };
}

// ---------------------------------------------------------------------------
// 1. Layout: is every control on screen, and is it the topmost thing there?
// ---------------------------------------------------------------------------

const run_layout = section('layout');

if (run_layout) for (const vp of VIEWPORTS) {
    const { ctx, page, errors } = await openApp(vp);

    const report = await page.evaluate(() => {
        // elementFromPoint is the only honest test of "can the user press it":
        // a control with a perfectly good bounding box is useless if the canvas
        // is painted on top of it.
        const reach = (el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return 'zero-size';
            const cx = r.x + r.width / 2;
            const cy = r.y + r.height / 2;
            if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return 'offscreen';
            const top = document.elementFromPoint(cx, cy);
            return top === el || el.contains(top) ? 'ok' : `covered by ${top?.tagName}.${top?.className}`;
        };

        const buttons = [...document.querySelectorAll('#app-dock .dock-button')];
        const dockButtons = buttons.map((b) => ({
            id: b.dataset.dockId,
            reach: reach(b),
            h: Math.round(b.getBoundingClientRect().height),
        }));

        // Nothing in the dock may overlap anything else in it.
        const rects = buttons.map((el) => ({ id: el.dataset.dockId, r: el.getBoundingClientRect() }));
        const overlaps = [];
        for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
                const a = rects[i].r, b = rects[j].r;
                if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
                    overlaps.push(`${rects[i].id} <-> ${rects[j].id}`);
                }
            }
        }

        const dock = document.querySelector('#app-dock')?.getBoundingClientRect();

        return {
            dockButtons,
            dockWidth: Math.round(dock?.width ?? 0),
            dockOffScreen: dock
                ? dock.left < -1 || dock.right > innerWidth + 1 || dock.bottom > innerHeight + 1
                : true,
            overlaps,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        };
    });

    console.log(`\n${vp.name} (${vp.width}x${vp.height})`);

    if (report.dockButtons.length === 0) fail('the dock rendered no buttons at all');
    else {
        const bad = report.dockButtons.filter((b) => b.reach !== 'ok');
        if (bad.length) fail(`unreachable dock buttons: ${bad.map((b) => `${b.id} (${b.reach})`).join(', ')}`);
        else pass(`${report.dockButtons.length} dock buttons, all reachable (dock ${report.dockWidth}px wide)`);

        // 44px is the smallest comfortable touch target. Only enforced where a
        // thumb is doing the aiming.
        if (vp.mobile) {
            const small = report.dockButtons.filter((b) => b.h < 40);
            if (small.length) fail(`dock buttons too short to tap: ${small.map((b) => `${b.id} ${b.h}px`).join(', ')}`);
            else pass('dock buttons are large enough to tap');
        }
    }

    if (report.dockOffScreen) fail('the dock extends outside the viewport');
    else pass('the dock is fully on screen');

    if (report.overlaps.length) fail(`dock buttons overlap: ${report.overlaps.join(' | ')}`);
    else pass('dock buttons do not overlap');

    if (report.horizontalOverflow) fail('the page scrolls horizontally');
    else pass('no horizontal overflow');

    if (errors.length) fail(`uncaught page errors: ${errors.slice(0, 3).join(' | ')}`);
    else pass('no uncaught page errors');

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 2. Panels on a phone: do they open, fit, and close again?
// ---------------------------------------------------------------------------

const run_panels = section('panels');

if (run_panels) {
    const { ctx, page } = await openApp(VIEWPORTS[0]);

    // Is the panel fully on screen, and is every control inside it reachable?
    // Controls below an internal scroll fold count as reachable once scrolled
    // to, which is why this scrolls before measuring.
    const audit = (sel) => page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { problem: 'not in the DOM' };
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return { problem: 'did not become visible' };
        const r = el.getBoundingClientRect();
        const clipped = [];
        if (r.top < 0) clipped.push('above the top of the screen');
        if (r.left < 0) clipped.push('past the left edge');
        if (r.right > innerWidth) clipped.push(`${Math.round(r.right - innerWidth)}px past the right edge`);
        if (r.bottom > innerHeight) clipped.push(`${Math.round(r.bottom - innerHeight)}px below the bottom`);

        const unreachable = [];
        for (const b of el.querySelectorAll('button, input')) {
            b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            const br = b.getBoundingClientRect();
            if (br.width === 0 || br.height === 0) continue;
            const cx = br.x + br.width / 2, cy = br.y + br.height / 2;
            if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) {
                unreachable.push(`${b.textContent.trim().slice(0, 20)}: off screen`);
                continue;
            }
            const top = document.elementFromPoint(cx, cy);
            if (top !== b && !b.contains(top)) {
                unreachable.push(`${b.textContent.trim().slice(0, 20)}: under ${top?.className || top?.tagName}`);
            }
        }
        return { box: `${Math.round(r.width)}x${Math.round(r.height)}`, clipped, unreachable };
    }, sel);

    const isVisible = (sel) => page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden'
            && el.getBoundingClientRect().width > 0;
    }, sel);

    for (const [name, id, sel] of [
        ['Maps', 'maps', '.maps-panel'],
        ['Search', 'find', '.search-panel'],
    ]) {
        await page.click(`#app-dock [data-dock-id="${id}"]`);
        await page.waitForTimeout(500);
        const r = await audit(sel);
        if (r.problem) fail(`${name} panel ${r.problem}`);
        else if (r.clipped.length) fail(`${name} panel is clipped: ${r.clipped.join(', ')}`);
        else if (r.unreachable.length) fail(`${name} panel controls unreachable: ${r.unreachable.join('; ')}`);
        else pass(`${name} panel opens at ${r.box} with all controls reachable`);

        // A panel you cannot dismiss covers the canvas forever. On a phone
        // pressing the same button again is the expected gesture, and Escape is
        // not available.
        await page.click(`#app-dock [data-dock-id="${id}"]`);
        await page.waitForTimeout(400);
        if (await isVisible(sel)) fail(`${name} panel did not close when its dock button was pressed again`);
        else pass(`${name} panel closes on a second press`);
    }

    // The performance overlay must default off on a phone (it is 220x364 of
    // opaque debug output) and its dock button must work both ways.
    const perfVisible = () => isVisible('#perf-dashboard');
    // Two taps now: open the More group, then its Performance row.
    const tapPerf = async () => {
        await page.click('#app-dock [data-dock-id="more"]');
        await page.waitForTimeout(250);
        await page.click('.dock-sheet-row[data-dock-id="perf"]');
        await page.waitForTimeout(350);
    };
    const before = await perfVisible();
    await tapPerf();
    const shown = await perfVisible();
    await tapPerf();
    const hidden = await perfVisible();
    if (before !== false) fail('the performance overlay is on by default on a phone');
    else if (!shown || hidden) fail(`the performance overlay does not toggle (shown=${shown}, hidden again=${hidden})`);
    else pass('performance overlay defaults off and toggles both ways');

    // Toasts. This one shipped visibly broken: main.css and the injected block
    // both styled `.notification`, and the leftovers from the stylesheet
    // (`bottom` and a `translateX(-50%)`) combined with the injected
    // top/left/right to produce a toast 814px tall and 185px off the left edge.
    // Nothing about the DOM looked wrong — only its geometry did.
    {
        const toast = await page.evaluate(async () => {
            window.mapsPanel.notify('Opened "A map with a fairly long name"');
            await new Promise((r) => setTimeout(r, 300));
            const el = document.querySelector('.fractality-toast');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
                x: Math.round(r.x), y: Math.round(r.y),
                w: Math.round(r.width), h: Math.round(r.height),
                vw: innerWidth, vh: innerHeight,
            };
        });

        if (!toast) fail('a toast was requested but no .fractality-toast rendered');
        else {
            const offScreen = toast.x < 0 || toast.y < 0
                || toast.x + toast.w > toast.vw || toast.y + toast.h > toast.vh;
            // A toast is one or two lines. Anything approaching full height means
            // opposing edges are both set, which is the collision signature.
            const oversized = toast.h > toast.vh * 0.4;

            if (offScreen) fail(`the toast is off screen: ${JSON.stringify(toast)}`);
            else if (oversized) fail(`the toast is stretched to ${toast.h}px tall — opposing edges are both set`);
            else pass(`a toast fits on screen (${toast.w}x${toast.h} at ${toast.x},${toast.y})`);
        }
    }

    // Opening the node info panel.
    //
    // This used to sweep the 3D scene with the engine's own raycaster and TAP a
    // node, because a click on the Three.js canvas was the only way in. The cone
    // view is the default screen now and covers that canvas permanently, so those
    // taps land on the cone — and the panel had no opener left at all, which is a
    // capability lost as a side effect of a layout change rather than a stale
    // check. The dock gained a "Node info" row, and this exercises it.
    const tapped = await page.evaluate(async () => {
        const eng = window.fractalityEngine();
        const opened = eng.toggleNodeInfo();
        await new Promise((r) => setTimeout(r, 600));
        return { opened, visible: Boolean(eng.nodeInfo?.isVisible) };
    });

    if (!tapped.visible) fail('the node info panel could not be opened at all');
    else {
        pass('the node info panel opens for the selection');

        // It has to FOLLOW the selection, or it describes whatever was selected
        // when it opened — which, with several surfaces changing the focus, is a
        // panel confidently naming the wrong node.
        const followed = await page.evaluate(async () => {
            const eng = window.fractalityEngine();
            const g = eng.nodeGraph;
            const before = eng.state.focusNode;
            const other = [...g.nodes.values()].find((n) => n.id !== before);
            eng.setFocus(other.id);
            await new Promise((r) => setTimeout(r, 500));
            const shown = document.querySelector('.node-info-panel')?.textContent ?? '';
            const name = other.metadata?.label || other.id;
            return { name, names: shown.includes(name) };
        });
        if (!followed.names) {
            fail(`the info panel did not follow the selection to "${followed.name}"`);
        } else {
            pass(`the info panel follows the selection ("${followed.name}")`);
        }

        const r = await audit('.node-info-panel');
        if (r.problem) fail(`node info panel ${r.problem}`);
        else if (r.clipped.length) fail(`node info panel is clipped: ${r.clipped.join(', ')}`);
        else if (r.unreachable.length) fail(`node info panel controls unreachable: ${r.unreachable.join('; ')}`);
        else pass(`node info panel fits at ${r.box} with all controls reachable`);

        // The dock has to survive the panel opening on top of it.
        const dockOk = await page.evaluate(() =>
            [...document.querySelectorAll('.dock-button')].every((b) => {
                const r = b.getBoundingClientRect();
                const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                return t === b || b.contains(t);
            }));
        if (!dockOk) fail('the dock is unreachable while the node info panel is open');
        else pass('the dock stays reachable with the node info panel open');

        // mouseleave never fires on touch, so ✕ is the only way out.
        const closed = await page.evaluate(async () => {
            const btn = document.querySelector('.node-info-panel .close-button');
            if (!btn) return 'there is no close button';
            btn.click();
            await new Promise((r) => setTimeout(r, 700));
            return getComputedStyle(document.querySelector('.node-info-panel')).display === 'none'
                ? 'ok' : 'it stayed open';
        });
        if (closed !== 'ok') fail(`the node info panel cannot be dismissed: ${closed}`);
        else pass('the node info panel closes via its ✕ button');
    }

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 3. Adaptive quality: the "bubbles turn into pyramids and don't turn back" bug
// ---------------------------------------------------------------------------

const run_adaptive_quality = section('adaptive quality');

if (run_adaptive_quality) {
    const { ctx, page } = await openApp(VIEWPORTS[0]);

    // Run the WHOLE ladder inside one evaluate.
    //
    // The adaptive QualityManager calls setQuality() from its own frame loop, so
    // anything awaited between steps lets it overwrite the value under test — a
    // 0.30 then 0.50 pair would intermittently report spheres because the
    // manager had already pushed quality back above the 0.55 restore threshold.
    // One synchronous pass cannot be interleaved.
    const ladder = await page.evaluate(() => {
        const r = window.fractalityEngine().renderer;
        const steps = [
            ['starts on full-detail spheres', null, false],
            ['quality 0.30 drops to low poly', 0.30, true],
            ['quality 0.50 holds low poly (hysteresis)', 0.50, true],
            ['quality 0.70 restores spheres', 0.70, false],
            ['quality 0.50 holds spheres (hysteresis)', 0.50, false],
            ['quality 0.20 drops again', 0.20, true],
            ['quality 0.90 restores again', 0.90, false],
        ];

        return steps.map(([label, q, wantLowPoly]) => {
            if (q !== null) r.setQuality(q);
            return {
                label,
                wantLowPoly,
                lowPoly: r.lowPolyActive,
                geometry: r.instancedMesh.geometry.type,
                // The mesh must be rendering the geometry the renderer tracks.
                // It once kept the original while the renderer moved on.
                inSync: r.instancedMesh.geometry === r.nodeGeometry,
            };
        });
    });

    for (const step of ladder) {
        if (step.lowPoly !== step.wantLowPoly) {
            fail(`${step.label}: expected lowPoly=${step.wantLowPoly}, got ${step.lowPoly} (${step.geometry})`);
        } else if (!step.inSync) {
            fail(`${step.label}: the mesh renders a different geometry than the renderer tracks`);
        } else {
            pass(`${step.label} (${step.geometry})`);
        }
    }

    // Swapping geometry must not break picking.
    await page.evaluate(() => window.fractalityEngine().renderer.setQuality(0.2));
    await page.waitForTimeout(600);
    const stillHits = await page.evaluate(() => {
        const eng = window.fractalityEngine();
        const mesh = eng.renderer.instancedMesh;
        for (let y = 0.1; y < 0.9; y += 0.008) {
            for (let x = 0.1; x < 0.9; x += 0.008) {
                eng.mouse.set(x * 2 - 1, -(y * 2 - 1));
                eng.raycaster.setFromCamera(eng.mouse, eng.renderer.camera);
                if (eng.raycaster.intersectObject(mesh).length > 0) return true;
            }
        }
        return false;
    });
    if (!stillHits) fail('nodes are unpickable after a geometry swap (stale InstancedMesh bounds)');
    else pass('nodes stay pickable across geometry swaps');

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 4. The cloud path, with the API stood in for
// ---------------------------------------------------------------------------
//
// Reproduces the combination that was reported from a phone: a save that
// succeeds, followed by a list request that fails at the transport layer.
//
// That pairing is what made the bug confusing. The map WAS saved, but
// saveCurrent() finishes by reloading the list, and the reload's error replaced
// the success message — so a committed save read as a failed one, and Share was
// unreachable because it only existed inside a list row that never rendered.

const run_cloud_path = section('cloud path');

if (run_cloud_path) {
    const { ctx, page } = await openApp(VIEWPORTS[0]);

    await page.evaluate(() => {
        const client = window.mapsPanel.client;
        client.baseUrl = 'https://api.test.invalid';
        client.getToken = async () => 'test-token';

        window.__calls = [];
        const json = (body) => ({
            ok: true, status: 200, statusText: 'OK',
            text: async () => JSON.stringify(body),
        });

        globalThis.fetch = async (url, opts = {}) => {
            const u = String(url);
            const method = opts.method || 'GET';
            window.__calls.push(`${method} ${u.replace('https://api.test.invalid', '')}`);

            if (u.endsWith('/health')) return json({ status: 'ok', database: 'ok', auth: 'configured' });
            if (method === 'POST' && u.includes('/shares')) return json({ token: 'share-token-abc', permission: 'view' });
            if (method === 'POST' && u.includes('/maps')) {
                return json({ id: 'map-1', title: 'My Mind Map', node_count: 36, visibility: 'private' });
            }
            // Reads fail the way a restarting instance or a CORS rejection does.
            if (method === 'GET' && u.includes('/maps')) throw new TypeError('Failed to fetch');
            return json({});
        };

        window.prompt = () => 'My Mind Map';
        window.__copied = null;
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: async (t) => { window.__copied = t; } },
        });
    });

    // Wait for the status to settle rather than guessing a duration: reads
    // retry with backoff and then probe /health.
    const settle = async () => {
        await page.waitForFunction(() => {
            const t = document.querySelector('.maps-status')?.textContent ?? '';
            return t && !/retrying|Loading|Saving/i.test(t);
        }, { timeout: 30000 });
        await page.waitForTimeout(300);
    };

    await page.click('#app-dock [data-dock-id="maps"]');
    await settle();

    if (await page.evaluate(() => document.querySelector('.maps-share').disabled !== true)) {
        fail('Share is enabled before any map exists to share');
    } else {
        pass('Share starts disabled with no current map');
    }

    await page.evaluate(() => { window.__calls = []; });
    await page.click('.maps-save');
    await settle();

    const state = await page.evaluate(() => ({
        status: document.querySelector('.maps-status').textContent,
        isError: document.querySelector('.maps-status').classList.contains('error'),
        shareDisabled: document.querySelector('.maps-share').disabled,
        calls: window.__calls,
    }));

    if (state.isError) fail('a committed save is reported as an error when the list reload fails');
    else pass('a committed save is not reported as an error when the list reload fails');

    if (!/saved/i.test(state.status)) fail(`the status loses the fact that the map saved: "${state.status}"`);
    else pass('the status still says the map was saved');

    // The diagnosis has to survive too — both facts matter, and an earlier
    // version of this let an unawaited /health probe overwrite the reassurance.
    if (!/could not be reloaded/i.test(state.status)) fail('the status drops the reason the list failed');
    else pass('the status keeps the reason the list failed');

    if (state.shareDisabled) fail('Share is unusable after saving when the list fails — the original bug');
    else pass('Share becomes usable after saving, without the list loading');

    const listCalls = state.calls.filter((c) => /^GET \/maps(\?|\/public)/.test(c));
    if (listCalls.length !== 3) fail(`the failing read was tried ${listCalls.length} times, expected 3 (1 + 2 retries)`);
    else pass('a failing read is retried twice before giving up');

    const writes = state.calls.filter((c) => c.startsWith('POST /maps') && !c.includes('/shares'));
    if (writes.length !== 1) fail(`the save was sent ${writes.length} times — a retried write can duplicate data`);
    else pass('the save was sent exactly once');

    if (state.calls.filter((c) => c.includes('/health')).length !== 1) fail('health was not probed to narrow down the cause');
    else pass('health is probed once to narrow down the cause');

    await page.click('.maps-share');
    await page.waitForTimeout(600);
    const copied = await page.evaluate(() => window.__copied);
    if (typeof copied !== 'string' || !copied.includes('map=map-1') || !copied.includes('token=share-token-abc')) {
        fail(`Share produced no usable link: ${copied}`);
    } else {
        pass('Share copies a link carrying the map id and share token');
    }

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 5. Telling a CORS block apart from a dead server
// ---------------------------------------------------------------------------
//
// These two are the same opaque TypeError in JavaScript, and the first version
// of the diagnosis conflated them: it blamed the server whenever /health failed,
// which is wrong precisely when CORS is the problem, because /health carries an
// Authorization header and is blocked along with everything else.

const run__vs_unreachable = section('CORS vs unreachable');

if (run__vs_unreachable) for (const scenario of [
    {
        name: 'server up, CORS blocking',
        // Every readable request fails; a no-cors probe resolves opaquely.
        install: () => {
            globalThis.fetch = async (_url, opts = {}) => {
                if (opts.mode === 'no-cors') return { type: 'opaque', status: 0 };
                throw new TypeError('Failed to fetch');
            };
        },
        expect: /CORS/i,
        reject: /down|restarting/i,
    },
    {
        name: 'nothing listening',
        install: () => {
            globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
        },
        expect: /down, restarting, or the URL is wrong/i,
        reject: /CORS/i,
    },
]) {
    const { ctx, page } = await openApp(VIEWPORTS[0]);

    await page.evaluate(() => {
        const client = window.mapsPanel.client;
        client.baseUrl = 'https://api.test.invalid';
        client.getToken = async () => 'test-token';
    });
    await page.evaluate(`(${scenario.install.toString()})()`);

    await page.click('#app-dock [data-dock-id="maps"]');
    await page.waitForFunction(() => {
        const t = document.querySelector('.maps-status')?.textContent ?? '';
        return t && !/retrying|Loading/i.test(t);
    }, { timeout: 30000 });

    const status = await page.evaluate(() => document.querySelector('.maps-status').textContent);

    if (!scenario.expect.test(status)) {
        fail(`${scenario.name}: status does not say what it should — "${status}"`);
    } else if (scenario.reject.test(status)) {
        fail(`${scenario.name}: status gives the OTHER diagnosis — "${status}"`);
    } else {
        pass(`${scenario.name}: diagnosed correctly`);
    }

    // The CORS message must name the origin to allow, since guessing between
    // fractiverse.com and www.fractiverse.com is the actual difficulty.
    if (scenario.expect.source.includes('CORS')) {
        const origin = await page.evaluate(() => window.location.origin);
        if (!status.includes(origin)) fail(`the CORS message does not name this origin (${origin})`);
        else pass(`the CORS message names the exact origin to allow (${origin})`);
    }

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 6. Every dock entry does something
// ---------------------------------------------------------------------------
//
// This is the check the old menu would have failed. Eight of its nine buttons
// called AppState.setView() with names no view existed for, and the router
// answered by printing "Switched to: <name>" over the 3D scene. They looked
// live, they were reachable, they were evenly spaced — and they did nothing.
//
// So reachability is not the property worth asserting here. Effect is: every
// entry either changes observable state, or declares itself unavailable and
// explains why.

const run_dock_entries = section('dock entries');

if (run_dock_entries) {
    const { ctx, page } = await openApp(VIEWPORTS[0]);

    // Enumerate the dock as the user meets it: top-level buttons, plus the rows
    // inside each group.
    const inventory = await page.evaluate(async () => {
        const out = [];
        const dock = document.querySelector('#app-dock');

        for (const button of [...dock.querySelectorAll('.dock-button')]) {
            const id = button.dataset.dockId;

            // Only groups get clicked. Clicking an ACTION here would open its
            // panel — Search covers most of the screen — and that panel then
            // intercepts the clicks meant for the rest of the dock. Whether the
            // actions work is section 2's job; this section is an inventory.
            const isGroup = button.getAttribute('aria-haspopup') === 'true';

            if (!isGroup) {
                out.push({
                    id,
                    kind: 'action',
                    unavailable: button.classList.contains('unavailable'),
                    reason: button.title || '',
                });
                continue;
            }

            button.click();
            await new Promise((r) => setTimeout(r, 200));

            const sheet = document.querySelector('.dock-sheet');
            if (!sheet) {
                out.push({ id, kind: 'group', unavailable: true, reason: 'the group opened no sheet' });
                continue;
            }

            for (const row of sheet.querySelectorAll('.dock-sheet-row')) {
                out.push({
                    id: row.dataset.dockId,
                    kind: 'row',
                    group: id,
                    unavailable: row.classList.contains('unavailable'),
                    reason: row.title || '',
                });
            }
            button.click();   // close again
            await new Promise((r) => setTimeout(r, 150));
        }
        return out;
    });

    if (inventory.length === 0) fail('the dock exposed no entries at all');
    else pass(`the dock exposes ${inventory.length} entries`);

    // Anything unavailable has to say why. "Nothing happens" is the bug; "not
    // yet, because X" is an answer.
    const silent = inventory.filter((e) => e.unavailable && !e.reason);
    if (silent.length) fail(`unavailable with no explanation: ${silent.map((e) => e.id).join(', ')}`);
    else pass('every unavailable entry explains itself');

    // With the 3D view booted, nothing should be unavailable at all.
    const blocked = inventory.filter((e) => e.unavailable);
    if (blocked.length) {
        fail(`still unavailable after the engine booted: ${blocked.map((e) => `${e.id} (${e.reason})`).join('; ')}`);
    } else {
        pass('no entry is unavailable once the engine has booted');
    }

    // Each view row must actually open its view — the failure being guarded
    // against is a menu entry that only narrates itself.
    //
    // This used to walk the five layout rows (family, goldenSpiral,
    // fibonacciSphere, fractalTree, cosmicWeb) and assert each changed
    // engine.getLayout(). Those rows are deliberately gone, so the check follows
    // the guard rather than the subject: two views now, and pressing a row has to
    // open the view it names. Deleting the check instead would have retired a
    // guard because its target moved.
    const viewRows = [
        { row: 'bubble', open: () => window.bubbleView.isOpen },
        { row: 'cone', open: () => window.coneView.isOpen },
    ];
    const opened = [];
    for (const { row } of viewRows) {
        await page.click('#app-dock [data-dock-id="view"]');
        await page.waitForTimeout(200);
        await page.click(`.dock-sheet-row[data-dock-id="${row}"]`);
        await page.waitForTimeout(350);
        const state = await page.evaluate(() => ({
            bubble: window.bubbleView.isOpen,
            cone: window.coneView.isOpen,
        }));
        opened.push({ row, state });
        // Close it again so the next row starts from nothing open.
        await page.evaluate(() => { window.bubbleView.hide(); window.coneView.hide(); });
        await page.waitForTimeout(200);
    }

    const inert = opened.filter(({ row, state }) =>
        (row === 'bubble' && !state.bubble) || (row === 'cone' && !state.cone));
    const bled = opened.filter(({ row, state }) =>
        (row === 'bubble' && state.cone) || (row === 'cone' && state.bubble));

    if (inert.length > 0) {
        fail(`view rows that did not open their view: ${inert.map((o) => o.row).join(', ')}`);
    } else if (bled.length > 0) {
        fail(`view rows that opened the wrong view too: ${bled.map((o) => o.row).join(', ')}`);
    } else {
        pass(`both view rows open exactly the view they name`);
    }

    // The active row has to reflect what is actually open, or the menu is lying
    // about state even while the action works.
    await page.evaluate(() => { window.coneView.hide(); window.bubbleView.show(); });
    await page.waitForTimeout(250);
    await page.click('#app-dock [data-dock-id="view"]');
    await page.waitForTimeout(250);
    const activeRows = await page.evaluate(() => ({
        active: [...document.querySelectorAll('.dock-sheet-row.active')].map((r) => r.dataset.dockId),
        bubble: window.bubbleView.isOpen,
        cone: window.coneView.isOpen,
    }));
    if (activeRows.active.length !== 1 || activeRows.active[0] !== 'bubble') {
        fail(`with the bubble view open the active row is (${activeRows.active.join(',') || 'none'}) `
            + `— bubble:${activeRows.bubble} cone:${activeRows.cone}`);
    } else {
        pass('the active row is the view that is actually open');
    }
    await page.evaluate(() => window.bubbleView.hide());
    await page.waitForTimeout(200);

    // A sheet must close on an outside tap, or it sits over the map absorbing
    // the taps meant for it.
    await page.touchscreen.tap(195, 200);
    await page.waitForTimeout(300);
    if (await page.evaluate(() => Boolean(document.querySelector('.dock-sheet')))) {
        fail('the sheet stays open after tapping outside it');
    } else {
        pass('the sheet closes on an outside tap');
    }

    // Only one sheet at a time; two overlapping sheets is how a menu becomes
    // unusable on a small screen.
    await page.click('#app-dock [data-dock-id="view"]');
    await page.waitForTimeout(200);
    await page.click('#app-dock [data-dock-id="more"]');
    await page.waitForTimeout(250);
    const sheetCount = await page.evaluate(() => document.querySelectorAll('.dock-sheet').length);
    if (sheetCount !== 1) fail(`${sheetCount} sheets open at once`);
    else pass('opening a second group replaces the first sheet');

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 7. Node Manager: does editing actually change the graph?
// ---------------------------------------------------------------------------
//
// This is the surface that builds a map, so its failure mode is worse than a
// dead button: an edit that half-applies leaves a graph whose depths and parent
// links disagree, and that then gets saved to Neo4j.

const run_node_manager = section('node manager');

if (run_node_manager) {
    const { ctx, page } = await openApp(VIEWPORTS[0]);

    // The panel drives prompt()/confirm(); answer them so the run is unattended.
    await page.evaluate(() => {
        window.prompt = () => 'Check node';
        window.confirm = () => true;
    });

    await page.click('#app-dock [data-dock-id="organise"]');
    await page.waitForTimeout(500);

    const shape = await page.evaluate(() => {
        const panel = document.querySelector('.nodemgr-panel');
        if (!panel || panel.classList.contains('hidden')) return null;
        const r = panel.getBoundingClientRect();
        return {
            clipped: r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1,
            rows: document.querySelectorAll('.nodemgr-row').length,
            nodes: window.fractalityEngine().nodeGraph.nodes.size,
            shortActions: [...document.querySelectorAll('.nodemgr-action')]
                .filter((b) => b.getBoundingClientRect().height < 36).length,
        };
    });

    if (!shape) fail('the Node Manager did not open');
    else {
        if (shape.clipped) fail('the Node Manager panel is clipped by the viewport');
        else pass('the Node Manager opens fully on screen');

        // It must show the WHOLE tree. Showing only what the 3D view shows would
        // defeat its purpose: you cannot move a node somewhere you cannot see.
        if (shape.rows !== shape.nodes) {
            fail(`the outline shows ${shape.rows} of ${shape.nodes} nodes — it must show all of them`);
        } else {
            pass(`the outline shows all ${shape.nodes} nodes`);
        }

        if (shape.shortActions > 0) fail(`${shape.shortActions} toolbar buttons are too short to tap`);
        else pass('toolbar buttons are large enough to tap');
    }

    /** Structural invariants, checked in the page after every edit. */
    const consistency = () => page.evaluate(() => {
        const graph = window.fractalityEngine().nodeGraph;
        const problems = [];
        for (const node of graph.nodes.values()) {
            if (node.parentId) {
                const parent = graph.nodes.get(node.parentId);
                if (!parent) { problems.push(`${node.id}: dangling parent`); continue; }
                if (!parent.childIds.includes(node.id)) problems.push(`${node.id}: not in parent's childIds`);
                if (node.depth !== parent.depth + 1) problems.push(`${node.id}: tier ${node.depth} under tier ${parent.depth}`);
            } else if (node.depth !== 0) {
                problems.push(`${node.id}: root at tier ${node.depth}`);
            }
            for (const childId of node.childIds) {
                const child = graph.nodes.get(childId);
                if (!child) problems.push(`${node.id}: lists missing child ${childId}`);
                else if (child.parentId !== node.id) problems.push(`${childId}: disagrees about its parent`);
            }
        }
        return problems;
    });

    const nodeCount = () => page.evaluate(() => window.fractalityEngine().nodeGraph.nodes.size);

    // Select a row deep enough to have somewhere to move in every direction.
    const selected = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.nodemgr-row')];
        // A row with a tier of 2 or more and at least one sibling above it.
        const row = rows.find((r, i) => /T[2-9]/.test(r.textContent) && i > 2);
        (row ?? rows[1]).click();
        return document.querySelector('.nodemgr-row.selected')?.dataset.nodeId ?? null;
    });
    if (!selected) fail('clicking an outline row did not select it');
    else pass(`selecting a row works (${selected})`);

    const edits = [
        ['add-child', (before, after) => after === before + 1, 'add a child'],
        ['add-sibling', (before, after) => after === before + 1, 'add a sibling'],
        ['rename', (before, after) => after === before, 'rename'],
        ['promote', (before, after) => after === before, 'move a node out a tier'],
        ['demote', (before, after) => after === before, 'move a node in a tier'],
        ['move-up', (before, after) => after === before, 'reorder upward'],
        ['move-down', (before, after) => after === before, 'reorder downward'],
    ];

    for (const [action, expect, description] of edits) {
        const before = await nodeCount();
        const wasUnavailable = await page.evaluate((a) =>
            document.querySelector(`.nodemgr-action[data-action="${a}"]`)
                ?.classList.contains('unavailable'), action);

        await page.click(`.nodemgr-action[data-action="${action}"]`);
        await page.waitForTimeout(350);
        const after = await nodeCount();

        if (wasUnavailable) {
            // Unavailable must mean "explains itself and changes nothing".
            const status = await page.evaluate(() =>
                document.querySelector('.nodemgr-status').textContent);
            if (after !== before) fail(`${description}: unavailable but it still changed the graph`);
            else if (!status.trim()) fail(`${description}: unavailable and said nothing`);
            else pass(`${description}: unavailable here, and says why ("${status.trim()}")`);
        } else if (!expect(before, after)) {
            fail(`${description}: node count went ${before} -> ${after}, which is not what it should do`);
        } else {
            pass(`${description} works (${before} -> ${after} nodes)`);
        }

        const problems = await consistency();
        if (problems.length) {
            fail(`${description} left the graph inconsistent: ${problems.slice(0, 3).join('; ')}`);
            break;
        }
    }

    const problems = await consistency();
    if (problems.length === 0) pass('the graph is still structurally consistent after every edit');

    // Deleting must actually remove nodes, and confirm() is stubbed to true.
    const before = await nodeCount();
    await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.nodemgr-row')];
        (rows[rows.length - 1] ?? rows[0]).click();
    });
    await page.waitForTimeout(200);
    await page.click('.nodemgr-action[data-action="delete"]');
    await page.waitForTimeout(400);
    const after = await nodeCount();
    if (after >= before) fail(`delete did not remove anything (${before} -> ${after})`);
    else pass(`delete removes nodes (${before} -> ${after})`);

    const afterDelete = await consistency();
    if (afterDelete.length) fail(`delete left the graph inconsistent: ${afterDelete.slice(0, 3).join('; ')}`);
    else pass('the graph is consistent after a delete');

    // The 3D engine has to be told, or it keeps drawing the old structure.
    const enginePicksUp = await page.evaluate(() => {
        const engine = window.fractalityEngine();
        return typeof engine.notifyGraphChanged === 'function'
            && engine.nodeGraph.getNode(engine.state.focusNode) !== undefined;
    });
    if (!enginePicksUp) fail('the engine is focused on a node that no longer exists after editing');
    else pass('the engine still points at a node that exists');

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 8. Cone view: the gestures are the interface
// ---------------------------------------------------------------------------

const run_cone_view = section('cone view');

if (run_cone_view) {
    const { ctx, page } = await openApp(VIEWPORTS[0]);

    await page.click('#app-dock [data-dock-id="view"]');
    await page.waitForTimeout(250);
    await page.click('.dock-sheet-row[data-dock-id="cone"]');
    await page.waitForTimeout(700);

    const state = () => page.evaluate(() => {
        const view = window.coneView;
        const el = document.querySelector('.cone-view');
        const r = el.getBoundingClientRect();
        return {
            open: view.isOpen && !el.classList.contains('hidden'),
            clipped: r.left < -1 || r.top < -1 || r.right > innerWidth + 1,
            spin: view.spin,
            tier: view.tierFocus,
            hits: view._hits.length,
            label: document.querySelector('.cone-tier-label').textContent,
            enginePaused: window.fractalityEngine().paused,
        };
    });

    const opened = await state();
    if (!opened.open) fail('the cone view did not open');
    else pass('the cone view opens');

    if (opened.clipped) fail('the cone view is clipped by the viewport');
    else pass('the cone view fits the viewport');

    // Every node must be hit-testable, or tapping one cannot select it.
    const nodeTotal = await page.evaluate(() => window.fractalityEngine().nodeGraph.nodes.size);
    if (opened.hits !== nodeTotal) fail(`${opened.hits} of ${nodeTotal} nodes are tappable`);
    else pass(`all ${nodeTotal} nodes are tappable`);

    // Rendering frames behind a full-screen overlay is battery spent on nothing.
    if (!opened.enginePaused) fail('the 3D engine keeps running behind the cone view');
    else pass('the 3D engine is paused while the cone covers it');

    const drag = async (dx, dy) => {
        await page.mouse.move(195, 400);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) await page.mouse.move(195 + (dx * i) / 8, 400 + (dy * i) / 8);
        await page.mouse.up();
        await page.waitForTimeout(250);
    };

    await drag(130, 0);
    const spun = await state();
    if (Math.abs(spun.spin - opened.spin) < 0.05) fail('dragging sideways does not spin the cone');
    else pass(`dragging sideways spins the cone (${spun.spin.toFixed(2)} rad)`);
    if (spun.tier !== opened.tier) fail('a sideways drag also changed the tier');
    else pass('a sideways drag leaves the tier alone');

    await drag(0, -170);
    const travelled = await state();
    if (travelled.tier <= spun.tier) fail(`dragging up does not descend the tiers (${spun.tier} -> ${travelled.tier})`);
    else pass(`dragging up travels down the tiers (tier ${travelled.tier})`);
    if (!Number.isInteger(travelled.tier)) fail(`the tier settled between two: ${travelled.tier}`);
    else pass('the tier settles on a whole number when the drag ends');
    if (!travelled.label.includes(`Tier ${travelled.tier}`)) {
        fail(`the readout says "${travelled.label}" at tier ${travelled.tier}`);
    } else {
        pass(`the readout matches the tier ("${travelled.label}")`);
    }

    // Tier travel must stay inside the graph.
    await drag(0, 900);
    const atTop = await state();
    if (atTop.tier < 0) fail(`travelling up ran past tier 0 (${atTop.tier})`);
    else pass('travelling up stops at tier 0');

    await drag(0, -2000);
    const atBottom = await state();
    const maxTier = await page.evaluate(() => window.fractalityEngine().nodeGraph.stats.maxDepth);
    if (atBottom.tier > maxTier) fail(`travelling down ran past the deepest tier (${atBottom.tier} > ${maxTier})`);
    else pass(`travelling down stops at the deepest tier (${maxTier})`);

    // A tap selects rather than spinning.
    const before = await page.evaluate(() => window.fractalityEngine().state.focusNode);
    const target = await page.evaluate(() => {
        const hit = window.coneView._hits.find((h) =>
            h.id !== window.fractalityEngine().state.focusNode);
        return hit ? { x: Math.round(hit.x), y: Math.round(hit.y), id: hit.id } : null;
    });
    if (!target) fail('found no cone node to tap');
    else {
        await page.touchscreen.tap(target.x, target.y);
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => window.fractalityEngine().state.focusNode);
        if (after === before) fail(`tapping a cone node did not change the selection (still ${before})`);
        else pass(`tapping a cone node selects it (${before} -> ${after})`);
    }

    // Switching to the other view hands over, and the engine stays paused.
    //
    // This used to click .cone-close and assert the 3D engine RESUMED. Both halves
    // are now wrong: the cone is the default screen, so its × is hidden at the top
    // level — the click timed out for 30s and killed the whole suite — and there is
    // no 3D view to hand back to, because it is what these views replaced. The
    // guard that survives is "leaving one view lands somewhere, and nothing starts
    // rendering behind it".
    await page.evaluate(() => window.bubbleView.show());
    await page.waitForTimeout(400);
    const handed = await page.evaluate(() => ({
        cone: window.coneView.isOpen,
        bubble: window.bubbleView.isOpen,
        paused: Boolean(window.fractalityEngine().paused),
    }));
    if (handed.cone) fail('switching to the bubble view left the cone open too');
    else if (!handed.bubble) fail('switching to the bubble view opened nothing');
    else if (!handed.paused) fail('the 3D engine started rendering behind the bubble view');
    else pass('switching views hands over without waking the 3D engine');

    await page.evaluate(() => window.coneView.show());
    await page.waitForTimeout(300);

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 9. The feed, with the API stood in for
// ---------------------------------------------------------------------------
//
// The feed renders text written by strangers, which makes it the one surface
// where a convenient template literal is a stored-XSS vector. So the hostile
// cases are part of the fixture rather than a separate "security test": a post
// whose title is an <img onerror>, whose body is a <script>, and whose link is a
// javascript: URL.
//
// One of those found a real bug. safeUrl() returns NULL for a URL it will not
// vouch for, and the first version of this panel compared against '#', so the
// check never matched and `link.href = null` rendered the literal string "null".
// Inert by luck rather than design.

const run_feed = section('feed');

if (run_feed) {
    const { ctx, page } = await openApp(VIEWPORTS[0]);

    await page.evaluate(() => {
        const client = window.feedPanel.client;
        client.baseUrl = 'https://api.test.invalid';
        client.getToken = async () => 'tok';

        window.__posted = [];
        window.__rated = [];
        window.__impressions = [];
        window.__pwned = null;

        let pulses = [
            {
                id: 'p1', title: 'Recursion from the inside',
                preview: 'Consciousness may be what recursion feels like from the inside.',
                author: { id: 'u2', name: 'Ada' }, tags: ['consciousness'],
                media: null, visibility: 'public', timestamp: Date.now() - 3600e3,
                my_rating: 0, predicted: 0.7, prediction_confidence: 0.9, own: false,
            },
            {
                id: 'p2', title: 'A link post', preview: '',
                author: { id: 'u3', name: 'Bo' }, tags: ['links'],
                media: { kind: 'link', url: 'https://example.com/thing?a=1&b=2', title: 'example.com' },
                visibility: 'public', timestamp: Date.now() - 7200e3,
                my_rating: 0, predicted: -0.8, prediction_confidence: 0.9, own: false,
            },
            {
                id: 'p3', title: 'Mine', preview: 'my own post',
                author: { id: 'u1', name: 'Nick' }, tags: [],
                media: null, visibility: 'public', timestamp: Date.now() - 60e3,
                my_rating: 0, predicted: null, prediction_confidence: 0, own: true,
            },
            {
                // Hostile on every field that reaches the DOM.
                id: 'p4', title: '<img src=x onerror="window.__pwned=1">',
                preview: '<script>window.__pwned=2<\/script>',
                author: { id: 'u4', name: '<b>Evil</b>' }, tags: ['x'],
                media: { kind: 'link', url: 'javascript:window.__pwned=3', title: 'click me' },
                visibility: 'public', timestamp: Date.now(),
                my_rating: 0, predicted: null, prediction_confidence: 0, own: false,
            },
        ];

        globalThis.fetch = async (url, opts = {}) => {
            const u = String(url).replace('https://api.test.invalid', '');
            const method = opts.method || 'GET';
            const json = (body, status = 200) => ({
                ok: status < 400, status, statusText: 'OK',
                text: async () => JSON.stringify(body),
            });

            if (u.startsWith('/pulses?')) return json(pulses);
            if (method === 'POST' && u === '/pulses') {
                const body = JSON.parse(opts.body);
                window.__posted.push(body);
                pulses = [{
                    id: 'new', title: body.title, preview: body.preview,
                    author: { id: 'u1', name: 'Nick' }, tags: body.tags,
                    media: body.media ?? null, visibility: body.visibility,
                    timestamp: Date.now(), my_rating: 0,
                    predicted: null, prediction_confidence: 0, own: true,
                }, ...pulses];
                return json(pulses[0], 201);
            }
            if (method === 'PUT' && u.includes('/resonance')) {
                const id = u.split('/')[2];
                const value = Number(new URLSearchParams(u.split('?')[1] || '').get('value') || 0);
                const target = pulses.find((x) => x.id === id);
                window.__rated.push({ id, value });
                target.my_rating = value;
                return json(target);
            }
            if (method === 'POST' && u === '/pulses/impressions') {
                window.__impressions.push(...JSON.parse(opts.body).pulse_ids);
                return json(null, 204);
            }
            if (method === 'DELETE' && u.startsWith('/pulses/')) {
                const id = u.split('/')[2];
                pulses = pulses.filter((x) => x.id !== id);
                return json(null, 204);
            }
            if (method === 'POST' && u.includes('/report')) return json({ reported: true, reports: 1 }, 202);
            if (method === 'PUT' && u.includes('/block')) {
                const authorId = u.split('/')[3];
                pulses = pulses.filter((x) => x.author.id !== authorId);
                return json({ blocked: true });
            }
            return json({});
        };

        window.prompt = () => '1';
        window.confirm = () => true;
    });

    await page.click('#app-dock [data-dock-id="social"]');
    await page.waitForTimeout(700);

    const snapshot = () => page.evaluate(() => {
        const panel = document.querySelector('.pulsefeed-panel');
        const r = panel.getBoundingClientRect();
        return {
            cards: document.querySelectorAll('.pulsefeed-pulse').length,
            clipped: r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1,
            pwned: window.__pwned,
            // Any element the hostile markup would have created if it were parsed.
            injected: document.querySelectorAll('.pulsefeed-pulse img, .pulsefeed-pulse script, .pulsefeed-pulse b').length,
            links: [...document.querySelectorAll('.pulsefeed-link')].map((a) => a.getAttribute('href')),
            relAttrs: [...document.querySelectorAll('.pulsefeed-link')].map((a) => a.getAttribute('rel')),
            titles: [...document.querySelectorAll('.pulsefeed-title')].map((t) => t.textContent),
            status: document.querySelector('.pulsefeed-status').textContent,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        };
    });

    const view = await snapshot();

    if (view.cards !== 4) fail(`the feed rendered ${view.cards} of 4 posts`);
    else pass('the feed renders every post');

    if (view.clipped) fail('the feed panel is clipped by the viewport');
    else pass('the feed panel fits on screen');

    if (view.horizontalOverflow) fail('a post pushed the page wider than the viewport');
    else pass('long content does not widen the page');

    // --- the security assertions
    if (view.pwned !== null) fail(`hostile post content executed (window.__pwned = ${view.pwned})`);
    else pass('hostile post content did not execute');

    if (view.injected !== 0) fail(`${view.injected} element(s) were created from post markup`);
    else pass('post markup is rendered as text, not parsed');

    const hostileTitle = view.titles.find((t) => t.includes('img src'));
    if (!hostileTitle) fail('the hostile title vanished instead of being shown as text');
    else pass('the hostile title is displayed literally');

    if (view.links.length !== 1) fail(`${view.links.length} links rendered; the javascript: URL should produce none`);
    else if (!view.links[0].startsWith('https://example.com/thing')) {
        fail(`the safe link was mangled: ${view.links[0]}`);
    } else if (!view.links[0].includes('a=1&b=2')) {
        // safeUrl HTML-escapes what it vouches for, which is wrong for a property:
        // &amp; in an href is a different URL.
        fail(`the link's query string was HTML-escaped into a different URL: ${view.links[0]}`);
    } else {
        pass('only the safe link renders, and its query string is intact');
    }

    if (!view.relAttrs.every((rel) => rel && rel.includes('noopener'))) {
        // Without noopener the opened page can navigate this one through
        // window.opener.
        fail(`an outbound link is missing rel=noopener: ${view.relAttrs.join(', ')}`);
    } else {
        pass('outbound links carry rel=noopener');
    }

    // --- the five-notch slider, and the absence of any tally
    const slider = await page.evaluate(() => {
        const card = document.querySelector('.pulsefeed-pulse');
        const notches = [...card.querySelectorAll('.pulsefeed-notch')];
        return {
            count: notches.length,
            marks: notches.map((n) => n.textContent),
            values: notches.map((n) => n.dataset.value),
            ends: [...card.querySelectorAll('.pulsefeed-resonance-end')].map((e) => e.textContent),
            chosen: notches.filter((n) => n.classList.contains('chosen')).map((n) => n.dataset.value),
            hasOldButton: Boolean(document.querySelector('.pulsefeed-resonate')),
        };
    });

    if (slider.count !== 5) {
        fail(`the resonance control has ${slider.count} notches, not 5`);
    } else if (slider.values.join(',') !== '-2,-1,0,1,2') {
        fail(`the notches are ${slider.values.join(',')}, not -2..+2`);
    } else if (slider.marks.join(',') !== '2,1,0,1,2') {
        fail(`the notch marks read ${slider.marks.join(',')}`);
    } else {
        pass('the slider has five notches from -2 to +2, marked 2 1 0 1 2');
    }

    if (slider.ends.join(' / ') !== 'Dissonant / Resonant') {
        fail(`the ends read "${slider.ends.join(' / ')}"`);
    } else {
        pass('the ends are labelled Dissonant and Resonant');
    }

    if (slider.chosen.join(',') !== '0') {
        fail(`the default selection is ${slider.chosen.join(',') || 'nothing'}, not neutral`);
    } else {
        pass('an unrated post starts at neutral');
    }

    if (slider.hasOldButton) fail('the old resonate button is still rendered');

    // Every notch has to reach the server as the value it shows.
    const sent = await page.evaluate(async () => {
        window.__rated = [];
        for (const value of ['-2', '-1', '1', '2']) {
            document.querySelector(`.pulsefeed-pulse .pulsefeed-notch[data-value="${value}"]`).click();
            await new Promise((r) => setTimeout(r, 250));
        }
        return window.__rated;
    });

    if (sent.map((r) => r.value).join(',') !== '-2,-1,1,2') {
        fail(`the notches sent ${sent.map((r) => r.value).join(',')}`);
    } else {
        pass('each notch sends its own value, negatives included');
    }

    // Pressing the notch you are already on clears the rating: the only way back
    // to "no opinion" once one has been given.
    const backToNeutral = await page.evaluate(async () => {
        const press = async (value) => {
            document.querySelector(
                `.pulsefeed-pulse .pulsefeed-notch[data-value="${value}"]`).click();
            await new Promise((r) => setTimeout(r, 250));
        };
        // The starting state has to be established, not assumed: the sweep above
        // left this card rated, and pressing 2 from "already 2" is the clearing
        // case rather than the setting one. Getting that wrong made this check fail
        // on correct behaviour.
        await press(-2);
        window.__rated = [];
        await press(2);    // sets
        await press(2);    // and again on the chosen notch clears
        return window.__rated;
    });

    if (backToNeutral.map((r) => r.value).join(',') !== '2,0') {
        fail(`re-pressing a chosen notch sent ${backToNeutral.map((r) => r.value).join(',')}, not 2 then 0`);
    } else {
        pass('pressing the chosen notch again clears the rating');
    }

    // The chosen notch has to survive the redraw the server response triggers.
    const stuck = await page.evaluate(async () => {
        document.querySelector('.pulsefeed-pulse .pulsefeed-notch[data-value="-1"]').click();
        await new Promise((r) => setTimeout(r, 350));
        const card = document.querySelector('.pulsefeed-pulse');
        return [...card.querySelectorAll('.pulsefeed-notch.chosen')].map((n) => n.dataset.value);
    });

    if (stuck.join(',') !== '-1') {
        fail(`after rating, the shown selection is ${stuck.join(',') || 'nothing'}`);
    } else {
        pass('the rating you gave is the one still shown after the redraw');
    }

    // --- the gauge is a prediction for this reader, not a score for the post
    const gauges = await page.evaluate(() =>
        [...document.querySelectorAll('.pulsefeed-pulse')].map((card) => {
            const gauge = card.querySelector('.pulsefeed-gauge');
            return {
                id: card.dataset.pulseId,
                present: Boolean(gauge),
                resonant: gauge?.classList.contains('resonant') ?? null,
                dissonant: gauge?.classList.contains('dissonant') ?? null,
                title: gauge?.getAttribute('title') ?? null,
            };
        }));

    const positive = gauges.find((g) => g.id === 'p1');
    const negative = gauges.find((g) => g.id === 'p2');
    const unknown = gauges.find((g) => g.id === 'p4');

    if (!positive?.present || !positive.resonant) {
        fail('a post predicted to resonate has no resonant gauge');
    } else if (!negative?.present || !negative.dissonant) {
        fail('a post predicted to be dissonant has no dissonant gauge');
    } else {
        pass('the gauge shows the predicted direction for this reader');
    }

    if (unknown?.present) {
        fail('a post with no prediction still drew a gauge, which reads as zero');
    } else {
        pass('no prediction draws no gauge, so unknown does not read as neutral');
    }

    if (!positive?.title?.includes('Only you see this')) {
        fail(`the gauge does not say it is private (title: ${positive?.title})`);
    } else {
        pass('the gauge says in words that only this reader sees it');
    }

    // --- the reader's own lean on the feed
    //
    // Its three promises are what make it self-curation rather than an algorithm, so
    // each is checked in the real DOM: nothing disappears at any setting, zero is
    // exactly the order things were posted in, and every post that moved says so.
    const lean = await page.evaluate(() => {
        const bar = document.querySelector('.pulsefeed-lean');
        if (!bar) return { missing: true };
        const notches = [...bar.querySelectorAll('.pulsefeed-notch')];
        return {
            notches: notches.map((n) => n.dataset.value),
            chosen: notches.filter((n) => n.classList.contains('chosen')).map((n) => n.dataset.value),
            state: bar.querySelector('.pulsefeed-lean-state')?.textContent ?? '',
            explain: bar.querySelector('.pulsefeed-lean-explain')?.textContent ?? '',
            // The same control as on a post, so learning one teaches the other.
            matchesPostSlider: notches.length
                === document.querySelectorAll('.pulsefeed-pulse .pulsefeed-notch').length / 4,
        };
    });

    if (lean.missing) {
        fail('there is no way for the reader to curate their own feed');
    } else if (lean.notches.join(',') !== '-2,-1,0,1,2') {
        fail(`the lean control offers ${lean.notches.join(',')}, not -2..+2`);
    } else if (lean.chosen.join(',') !== '0') {
        fail(`the feed does not default to chronological (chosen ${lean.chosen.join(',')})`);
    } else {
        pass('the feed has a -2..+2 lean of its own, defaulting to chronological');
    }

    if (lean.state !== 'Chronological') {
        fail(`the lean state reads "${lean.state}" at zero`);
    } else if (!/order things were posted/i.test(lean.explain)) {
        fail(`the zero setting does not say what it does: "${lean.explain}"`);
    } else {
        pass('at zero the control says in words that nothing is being reordered');
    }

    // Chronological order, to compare every setting against.
    const chronological = await page.evaluate(() =>
        [...document.querySelectorAll('.pulsefeed-pulse')].map((c) => c.dataset.pulseId));

    const sweep = await page.evaluate(async (baseline) => {
        const setLean = async (value) => {
            document.querySelector(
                `.pulsefeed-lean .pulsefeed-notch[data-value="${value}"]`).click();
            await new Promise((r) => setTimeout(r, 250));
            return {
                order: [...document.querySelectorAll('.pulsefeed-pulse')].map((c) => c.dataset.pulseId),
                state: document.querySelector('.pulsefeed-lean-state')?.textContent ?? '',
                explain: document.querySelector('.pulsefeed-lean-explain')?.textContent ?? '',
                markers: [...document.querySelectorAll('.pulsefeed-shift')].map((m) => ({
                    text: m.textContent, title: m.getAttribute('title'),
                })),
            };
        };

        const results = {};
        for (const value of [1, 2, -1, -2]) results[value] = await setLean(value);
        // And back. Getting out has to be one move.
        results.restored = await setLean(0);
        results.baseline = baseline;
        return results;
    }, chronological);

    // 1. Nothing is hidden, at any setting.
    const lost = Object.entries(sweep)
        .filter(([key]) => key !== 'baseline')
        .filter(([, r]) => r.order && (
            r.order.length !== chronological.length
            || chronological.some((id) => !r.order.includes(id))
        ))
        .map(([key]) => key);

    if (lost.length > 0) {
        fail(`these lean settings lost or duplicated posts: ${lost.join(', ')}`);
    } else {
        pass('no lean setting hides a post — the same posts are always all there');
    }

    // 2. Back to zero is exactly chronological, in one move.
    if (sweep.restored.order.join(',') !== chronological.join(',')) {
        fail('returning the lean to zero did not restore the original order');
    } else if (sweep.restored.state !== 'Chronological') {
        fail(`after returning to zero the state reads "${sweep.restored.state}"`);
    } else {
        pass('one move back to zero restores the order things were posted in');
    }

    // 3. The lean actually leans, and the two directions differ.
    if (sweep[2].order.join(',') === chronological.join(',')) {
        fail('a strong resonant lean changed nothing');
    } else if (sweep[2].order.join(',') === sweep[-2].order.join(',')) {
        fail('leaning resonant and leaning dissonant produced the same order');
    } else {
        pass('the two directions reorder the feed differently from each other');
    }

    // The resonant lean must put the post predicted to resonate above the one
    // predicted dissonant, and the dissonant lean the other way about.
    const resonantFirst = sweep[2].order.indexOf('p1') < sweep[2].order.indexOf('p2');
    const dissonantFirst = sweep[-2].order.indexOf('p2') < sweep[-2].order.indexOf('p1');
    if (!resonantFirst) {
        fail('a resonant lean did not bring the post predicted to resonate forward');
    } else if (!dissonantFirst) {
        fail('a dissonant lean did not bring the post predicted dissonant forward');
    } else {
        pass('each direction brings the posts it names forward');
    }

    // 4. Every setting states what it is doing, and says nothing is hidden.
    const silent = [1, 2, -1, -2].filter((v) => !/hidden/i.test(sweep[v].explain));
    if (silent.length > 0) {
        fail(`these settings do not say that nothing is hidden: ${silent.join(', ')}`);
    } else {
        pass('every leaning setting states in words that nothing is hidden');
    }

    // 5. A post that moved says how far and why; one that did not stays silent.
    const marked = sweep[2].markers;
    if (marked.length === 0) {
        fail('the feed was reordered and no post said it had moved');
    } else if (!marked.every((m) => /^[↑↓]\d+$/.test(m.text))) {
        fail(`a shift marker is not a direction and a number: ${JSON.stringify(marked.map((m) => m.text))}`);
    } else if (!marked.every((m) => m.title && /place/.test(m.title))) {
        fail('a shift marker does not explain itself');
    } else {
        pass(`each post that moved says how far and why (${marked.map((m) => m.text).join(' ')})`);
    }

    if (sweep.restored.markers.length > 0) {
        fail('posts still claim to have moved after the lean returned to zero');
    } else {
        pass('at zero no post claims to have moved');
    }

    // 6. The choice survives a fresh page load, and is still visible when it does.
    //
    // Checked in a SECOND page of the same context rather than by reloading this one.
    // A reload wipes the patched fetch and the counters this section depends on — an
    // earlier version did reload, and took every check after it down with it. Same
    // context means the same localStorage, which is what is actually under test.
    await page.evaluate(async () => {
        // Something other than the default, or persisting it proves nothing.
        document.querySelector('.pulsefeed-lean .pulsefeed-notch[data-value="-2"]').click();
        await new Promise((r) => setTimeout(r, 250));
    });

    const second = await ctx.newPage();
    await second.goto(URL, { waitUntil: 'networkidle' });
    await second.waitForTimeout(1500);
    const remembered = await second.evaluate(async () => {
        window.feedPanel.show();
        await new Promise((r) => setTimeout(r, 400));
        const state = document.querySelector('.pulsefeed-lean-state');
        return {
            lean: window.feedPanel.lean,
            state: state?.textContent ?? '',
            // A curation setting in effect but not visibly marked is
            // indistinguishable from an algorithm the reader did not ask for.
            highlighted: state?.classList.contains('active') ?? false,
            chosen: [...document.querySelectorAll('.pulsefeed-lean .pulsefeed-notch.chosen')]
                .map((n) => n.dataset.value),
        };
    });
    await second.close();

    if (remembered.lean !== -2) {
        fail(`a fresh page came back with lean ${remembered.lean}, not the -2 it was left at`);
    } else if (remembered.chosen.join(',') !== '-2') {
        fail(`the remembered lean is not shown on the control (chosen ${remembered.chosen.join(',')})`);
    } else if (!remembered.highlighted) {
        fail('a lean is in effect but nothing marks the feed as non-chronological');
    } else {
        pass(`the lean is remembered on a fresh page and shown as "${remembered.state}"`);
    }

    // Back to chronological, so the checks after this see the order they expect.
    await page.evaluate(async () => {
        document.querySelector('.pulsefeed-lean .pulsefeed-notch[data-value="0"]').click();
        await new Promise((r) => setTimeout(r, 250));
    });

    // --- impressions are reported for what was actually seen
    //
    // The model's denominator. Counting everything the API returned would inflate it
    // with posts nobody scrolled to, so this asserts the ids come from cards that
    // were on screen — and that the reader's own post is not among them.
    const impressions = await page.evaluate(async () => {
        window.__impressions = [];
        // Scroll the list so the observer fires, then wait past the 1500ms batch.
        const list = document.querySelector('.pulsefeed-list');
        list.scrollTop = 0;
        await new Promise((r) => setTimeout(r, 2200));
        const own = [...document.querySelectorAll('.pulsefeed-pulse')]
            .filter((c) => c.textContent.includes('Delete'))
            .map((c) => c.dataset.pulseId);
        return { sent: [...new Set(window.__impressions)], own };
    });

    if (impressions.sent.length === 0) {
        fail('nothing was reported as seen, so the model has no denominator');
    } else if (impressions.sent.some((id) => impressions.own.includes(id))) {
        fail(`the reader's own post was counted as an impression: ${impressions.sent.join(', ')}`);
    } else {
        pass(`impressions are reported for posts that were on screen (${impressions.sent.length})`);
    }

    // One batch never names the same post twice.
    //
    // Narrower than it first looks, and deliberately so. An earlier version of this
    // check asserted that a post already reported is never reported again, and it
    // passed with the client's unobserve() deleted — because IntersectionObserver
    // only fires on CHANGES, so a page that sits still never re-fires whatever the
    // code does. It was testing the browser, not this app.
    //
    // What the client actually guarantees is that one request carries distinct ids.
    // Idempotence across renders is the server's MERGE, which has its own
    // integration test (test_an_impression_is_recorded_once_per_viewer).
    const dedupe = await page.evaluate(async () => {
        window.__impressions = [];
        await window.feedPanel.client.recordImpressions(['p1', 'p1', 'p1', 'p2']);
        return window.__impressions;
    });

    if (dedupe.join(',') !== 'p1,p2') {
        fail(`one impression batch carried repeats: ${dedupe.join(',')}`);
    } else {
        pass('one impression batch names each post once');
    }

    // --- no tally, anywhere on screen
    const tallies = await page.evaluate(() => ({
        // The old UI rendered "◈ 5" for five resonators.
        diamondCount: /◈\s*\d/.test(document.querySelector('.pulsefeed-list').textContent),
        // Any digits on a card's action row other than the notch marks would be a
        // count by another name.
        strayNumbers: [...document.querySelectorAll('.pulsefeed-actions')]
            .map((a) => a.textContent.replace(/[^0-9]/g, ''))
            .filter((digits) => digits !== '21012'),
    }));

    if (tallies.diamondCount) {
        fail('a resonator count is still rendered');
    } else if (tallies.strayNumbers.length > 0) {
        fail(`something numeric other than the notches is on a card: ${JSON.stringify(tallies.strayNumbers)}`);
    } else {
        pass('no card shows a count of how anyone else rated it');
    }

    // --- composing
    const composeCollapsed = await page.evaluate(() =>
        document.querySelector('.pulsefeed-compose-extra')?.hidden);
    if (composeCollapsed !== true) fail('the compose box is expanded before the user engages with it');
    else pass('the compose box starts collapsed');

    await page.fill('.pulsefeed-input-title', 'Hello from a test');
    await page.fill('.pulsefeed-input-tags', 'Alpha, beta , Alpha, ');
    await page.click('.pulsefeed-post');
    await page.waitForTimeout(700);

    const posted = await page.evaluate(() => window.__posted);
    if (posted.length !== 1) fail(`the post was sent ${posted.length} times`);
    else if (JSON.stringify(posted[0].tags) !== JSON.stringify(['alpha', 'beta'])) {
        fail(`tags were not normalised before sending: ${JSON.stringify(posted[0].tags)}`);
    } else {
        pass('posting sends normalised, deduplicated tags exactly once');
    }

    const afterPost = await snapshot();
    if (afterPost.cards !== 5) fail(`the new post did not appear (${afterPost.cards} cards)`);
    else pass('a new post appears in the feed');

    const cleared = await page.evaluate(() =>
        document.querySelector('.pulsefeed-input-title').value);
    if (cleared !== '') fail('the compose box kept its text after a successful post');
    else pass('the compose box clears after a successful post');

    // --- moderation is reachable
    const controls = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.pulsefeed-pulse')];
        const mine = cards.find((c) => c.textContent.includes('Delete'));
        const theirs = cards.find((c) => c.textContent.includes('Report'));
        return {
            ownHasDelete: Boolean(mine),
            ownHasReport: mine ? mine.textContent.includes('Report') : null,
            othersHaveReport: Boolean(theirs),
            othersHaveBlock: theirs ? theirs.textContent.includes('Block') : false,
        };
    });
    if (!controls.ownHasDelete) fail('your own post offers no delete');
    else if (controls.ownHasReport) fail('your own post offers a report, which is noise');
    else pass('your own post offers delete, and not report');

    if (!controls.othersHaveReport || !controls.othersHaveBlock) {
        fail('another author\'s post is missing report or block');
    } else {
        pass('another author\'s post offers both report and block');
    }

    // Blocking must remove that author's posts.
    const cardsBeforeBlock = (await snapshot()).cards;
    await page.evaluate(() => {
        const card = [...document.querySelectorAll('.pulsefeed-pulse')]
            .find((c) => c.textContent.includes('Block'));
        [...card.querySelectorAll('button')].find((b) => b.textContent === 'Block').click();
    });
    await page.waitForTimeout(800);
    const cardsAfterBlock = (await snapshot()).cards;
    if (cardsAfterBlock >= cardsBeforeBlock) {
        fail(`blocking removed nothing (${cardsBeforeBlock} -> ${cardsAfterBlock})`);
    } else {
        pass(`blocking hides that author's posts (${cardsBeforeBlock} -> ${cardsAfterBlock})`);
    }

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 10. Export and import, through the browser's real download path
// ---------------------------------------------------------------------------
//
// The JSON export was broken for the entire life of the deployed app: it
// serialised `nodeBridge.exportForCLI()`, which reads the CLI bridge's own node
// collection. That collection is only filled by the local Python helper, so in
// production it was empty and Export wrote a valid JSON file containing zero
// nodes. Silently — a download that looks like it worked.
//
// So what is asserted is the file's CONTENTS, not that a download happened.

const run_export_import = section('export and import');

if (run_export_import) {
    const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        acceptDownloads: true,
    });
    const page = await ctx.newPage();
    const jsRequests = [];
    page.on('request', (r) => {
        if (r.url().endsWith('.js')) jsRequests.push(r.url().split('/').pop());
    });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.fractalityEngine?.()), { timeout: 15000 })
        .catch(() => {});
    await page.waitForTimeout(2000);

    const liveNodes = await page.evaluate(() =>
        window.fractalityEngine()?.nodeGraph?.nodes?.size ?? 0);

    if (liveNodes === 0) fail('no map is loaded, so export cannot be checked');
    else pass(`a map with ${liveNodes} nodes is loaded`);

    // The Turtle library must not be in the initial payload for the sake of a
    // button most visitors never press.
    if (jsRequests.some((u) => /turtle/i.test(u))) {
        fail('the Turtle chunk is fetched on page load; it should be lazy');
    } else {
        pass('the Turtle chunk is not fetched on page load');
    }

    /** Click a row in the More sheet and return the downloaded text. */
    const downloadVia = async (rowId) => {
        await page.click('#app-dock [data-dock-id="more"]');
        await page.waitForTimeout(250);
        const pending = page.waitForEvent('download', { timeout: 20000 });
        await page.click(`.dock-sheet-row[data-dock-id="${rowId}"]`);
        const download = await pending;
        const fs = await import('node:fs');
        return {
            name: download.suggestedFilename(),
            text: fs.readFileSync(await download.path(), 'utf8'),
        };
    };

    // --- JSON
    try {
        const json = await downloadVia('export-json');
        const parsed = JSON.parse(json.text);
        const count = parsed.nodes?.length ?? 0;

        if (!json.name.endsWith('.json')) fail(`JSON export produced "${json.name}"`);
        else if (count === 0) fail('the JSON export contains ZERO nodes — the original bug');
        else if (count !== liveNodes) fail(`JSON export has ${count} nodes, the map has ${liveNodes}`);
        else pass(`JSON export contains all ${count} nodes`);

        // Structure, not just a node list: an export without parent links is not
        // a map, it is a bag of labels.
        const withParents = (parsed.nodes || []).filter((n) => n.parentId).length;
        if (withParents === 0) fail('the JSON export carries no parent links');
        else pass(`JSON export preserves structure (${withParents} nodes have a parent)`);
    } catch (error) {
        fail(`JSON export failed: ${error.message}`);
    }

    // --- Turtle
    let turtleText = null;
    try {
        const ttl = await downloadVia('export-turtle');
        turtleText = ttl.text;

        if (!ttl.name.endsWith('.ttl')) fail(`Turtle export produced "${ttl.name}"`);
        else pass(`Turtle export produced ${ttl.name}`);

        if (!jsRequests.some((u) => /turtle/i.test(u))) {
            fail('the Turtle chunk was never fetched, yet an export happened');
        } else {
            pass('the Turtle chunk loads on demand');
        }

        // `a skos:Concept` is a prefix of `a skos:ConceptScheme`, so the scheme
        // would inflate a naive count by one.
        const concepts = (turtleText.match(/a skos:Concept[;\s]/g) || []).length;
        if (concepts !== liveNodes) fail(`Turtle has ${concepts} concepts, the map has ${liveNodes}`);
        else pass(`Turtle export contains all ${concepts} concepts`);

        for (const term of ['skos:prefLabel', 'skos:broader', 'skos:ConceptScheme', 'fract:position']) {
            if (!turtleText.includes(term)) fail(`Turtle export is missing ${term}`);
        }
        if (['skos:prefLabel', 'skos:broader', 'skos:ConceptScheme', 'fract:position']
            .every((t) => turtleText.includes(t))) {
            pass('Turtle export uses SKOS, with order carried in fract:position');
        }
    } catch (error) {
        fail(`Turtle export failed: ${error.message}`);
    }

    // --- import the Turtle back
    if (turtleText) {
        try {
            const fs = await import('node:fs');
            const os = await import('node:os');
            const path = await import('node:path');
            const file = path.join(os.tmpdir(), 'browser-check-roundtrip.ttl');
            fs.writeFileSync(file, turtleText);

            const before = await page.evaluate(() => {
                const graph = window.fractalityEngine().nodeGraph;
                return [...graph.nodes.values()]
                    .map((n) => `${n.id}|${n.depth}|${n.parentId ?? ''}|${n.childIds.join(',')}`)
                    .sort().join('\n');
            });

            await page.click('#app-dock [data-dock-id="more"]');
            await page.waitForTimeout(250);
            const chooser = page.waitForEvent('filechooser', { timeout: 15000 });
            await page.click('.dock-sheet-row[data-dock-id="import"]');
            (await chooser).setFiles(file);
            await page.waitForTimeout(2500);

            const after = await page.evaluate(() => {
                const graph = window.fractalityEngine().nodeGraph;
                return [...graph.nodes.values()]
                    .map((n) => `${n.id}|${n.depth}|${n.parentId ?? ''}|${n.childIds.join(',')}`)
                    .sort().join('\n');
            });

            if (after === before) {
                pass('a Turtle round trip returns an identical structure, sibling order included');
            } else {
                const beforeLines = before.split('\n');
                const afterLines = after.split('\n');
                const differing = beforeLines.find((line, i) => line !== afterLines[i]);
                fail(`the Turtle round trip changed the graph, e.g. "${differing}" -> "${afterLines[beforeLines.indexOf(differing)]}"`);
            }

            // And the imported graph must satisfy the tier invariant.
            const problems = await page.evaluate(() => {
                const graph = window.fractalityEngine().nodeGraph;
                const out = [];
                for (const node of graph.nodes.values()) {
                    if (node.parentId) {
                        const parent = graph.nodes.get(node.parentId);
                        if (!parent) out.push(`${node.id}: dangling parent`);
                        else if (node.depth !== parent.depth + 1) out.push(`${node.id}: bad tier`);
                    } else if (node.depth !== 0) out.push(`${node.id}: root not at tier 0`);
                }
                return out;
            });
            if (problems.length) fail(`the imported graph is inconsistent: ${problems.slice(0, 3).join('; ')}`);
            else pass('the imported graph satisfies the tier invariant');
        } catch (error) {
            fail(`Turtle import failed: ${error.message}`);
        }
    }

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 11. Identity, visibility and overlay stacking
// ---------------------------------------------------------------------------
//
// Three reported problems, and the first two had the same root cause.
//
// "Maps saved on my phone don't show up on desktop" was not a sync failure. The
// only ways to sign in were a button inside the Maps panel and one inside the
// feed composer, so a fresh desktop browser was never signed in — and an
// anonymous visitor sees only PUBLIC maps. The maps were private, and in Neo4j
// the whole time.
//
// "The dock disappears when Cone View is selected" was overlay stacking: the cone
// is z-index 900 across the whole viewport, and the dock was 30. On a desktop the
// dock sits at the TOP, where `bottom: var(--dock-height)` clears nothing, so the
// cone buried it and only a refresh brought it back.

const run_identity = section('identity and overlays');

if (run_identity) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.fractalityEngine?.()), { timeout: 15000 })
        .catch(() => {});
    await page.waitForTimeout(2000);

    // --- signing in must be reachable from the dock, not only from inside a panel
    const accountRow = await page.evaluate(async () => {
        document.querySelector('#app-dock [data-dock-id="more"]').click();
        await new Promise((r) => setTimeout(r, 250));
        const row = document.querySelector('.dock-sheet-row[data-dock-id="account"]');
        return row ? row.querySelector('.dock-sheet-name')?.textContent : null;
    });
    if (!accountRow) fail('there is no Account/Sign in entry in the dock');
    else pass(`the dock exposes an identity entry ("${accountRow}")`);

    const account = await page.evaluate(async () => {
        document.querySelector('.dock-sheet-row[data-dock-id="account"]').click();
        await new Promise((r) => setTimeout(r, 400));
        const el = document.querySelector('.account-panel');
        if (!el || el.classList.contains('hidden')) return null;
        const r = el.getBoundingClientRect();
        return {
            clipped: r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1,
            // With no Clerk key configured it must SAY so rather than showing a
            // sign-in button that cannot work.
            explainsItself: /not configured|Sign in/i.test(el.textContent),
        };
    });
    if (!account) fail('the account panel did not open');
    else if (account.clipped) fail('the account panel is clipped by the viewport');
    else if (!account.explainsItself) fail('the account panel neither offers sign-in nor explains its absence');
    else pass('the account panel opens and states what is available');

    await page.evaluate(() => window.accountPanel.hide());

    // --- the dock must outrank every overlay
    await page.evaluate(() => window.coneView.show());
    await page.waitForTimeout(600);
    const stacking = await page.evaluate(() => {
        const dock = document.querySelector('#app-dock');
        const d = dock.getBoundingClientRect();
        const at = document.elementFromPoint(d.x + d.width / 2, d.y + d.height / 2);
        const cone = document.querySelector('.cone-view').getBoundingClientRect();
        return {
            dockReachable: at === dock || dock.contains(at),
            overlaps: cone.top < d.bottom && cone.bottom > d.top
                   && cone.left < d.right && cone.right > d.left,
        };
    });
    if (!stacking.dockReachable) fail('the dock is unreachable while the Cone view is open — the reported bug');
    else pass('the dock stays reachable with the Cone view open');
    if (stacking.overlaps) fail('the Cone view overlaps the dock');
    else pass('the Cone view does not overlap the dock');

    // --- a rename has somewhere to appear
    const readout = await page.evaluate(async () => {
        const graph = window.fractalityEngine().nodeGraph;
        const root = graph.getRootNodes()[0];
        graph.renameNode(root.id, 'RENAMED FOR CHECK');
        window.fractalityEngine().notifyGraphChanged();
        window.fractalityEngine().setFocus(root.id);
        await new Promise((r) => setTimeout(r, 800));
        return document.querySelector('.cone-tier-label').textContent;
    });
    if (!readout.includes('RENAMED FOR CHECK')) {
        // The old behaviour: a name appeared only if the node happened to be on
        // the focused tier's front third, so a rename looked like it was ignored.
        fail(`the Cone readout does not name the selected node: "${readout}"`);
    } else {
        pass('the Cone readout names the selected node, so a rename is visible');
    }

    await page.evaluate(() => window.coneView.hide());

    // --- a panel that caches a render must notice a replaced graph
    //
    // Reported from a desktop session: a saved map was opened and the Cone view
    // showed the renamed root while the Node Manager still showed the old name.
    // loadData() REPLACES engine.nodeGraph with a different object, and the Cone
    // never showed the problem because it redraws from getGraph() every frame.
    // Anything that renders once and caches keeps the graph it read earlier.
    const staleness = await page.evaluate(async () => {
        window.nodeManagerPanel.show();
        await new Promise((r) => setTimeout(r, 400));
        const before = document.querySelector('.nodemgr-row .nodemgr-label')?.textContent;

        // Replace the graph the way an opened map arrives: a new NodeGraph built
        // from a serialised payload, with the root renamed.
        const engine = window.fractalityEngine();
        const NodeGraph = engine.nodeGraph.constructor;
        const payload = engine.nodeGraph.toJSON();
        const rootId = engine.nodeGraph.getRootNodes()[0].id;
        for (const node of payload.nodes) {
            if (node.id === rootId) {
                node.metadata = { ...node.metadata, label: 'RENAMED BY CHECK' };
            }
        }
        await engine.loadData(NodeGraph.fromJSON(payload));
        await new Promise((r) => setTimeout(r, 600));

        return {
            before,
            outline: document.querySelector('.nodemgr-row .nodemgr-label')?.textContent,
            engine: engine.nodeGraph.getRootNodes()[0].metadata.label,
            rows: document.querySelectorAll('.nodemgr-row').length,
            nodes: engine.nodeGraph.nodes.size,
        };
    });

    if (staleness.outline !== staleness.engine) {
        fail(`the Node Manager shows "${staleness.outline}" while the engine has "${staleness.engine}" — the reported bug`);
    } else if (staleness.before === staleness.outline) {
        fail('the outline did not change at all, so this check proved nothing');
    } else {
        pass(`an open Node Manager follows a replaced graph ("${staleness.before}" -> "${staleness.outline}")`);
    }

    if (staleness.rows !== staleness.nodes) {
        fail(`the outline lists ${staleness.rows} of ${staleness.nodes} nodes after a reload`);
    } else {
        pass('the outline lists every node of the newly loaded graph');
    }

    await page.evaluate(() => window.nodeManagerPanel.hide());

    // --- map visibility has a control at all
    await page.evaluate(() => {
        const client = window.mapsPanel.client;
        client.baseUrl = 'https://api.test.invalid';
        client.getToken = async () => 'tok';
        window.__patched = [];
        let maps = [{
            id: 'm1', title: 'A map', description: '', visibility: 'private',
            node_count: 3, created_at: Date.now(), updated_at: Date.now(),
            root_id: 'root', owner_id: 'u1', owner_name: 'Me',
        }];
        globalThis.fetch = async (url, opts = {}) => {
            const u = String(url).replace('https://api.test.invalid', '');
            const method = opts.method || 'GET';
            const json = (body, status = 200) => ({
                ok: status < 400, status, statusText: 'OK',
                text: async () => JSON.stringify(body),
            });
            if (u.startsWith('/maps?') || u.startsWith('/maps/public')) return json(maps);
            if (method === 'PATCH' && u.startsWith('/maps/')) {
                const body = JSON.parse(opts.body);
                window.__patched.push(body);
                maps = [{ ...maps[0], ...body }];
                return json(maps[0]);
            }
            if (u === '/me' && method === 'PATCH') {
                const body = JSON.parse(opts.body);
                window.__patched.push(body);
                window.__profile = { ...(window.__profile ?? {}), ...body };
                return json({ id: 'u1', display_name: 'Me', ...window.__profile });
            }
            if (u === '/me') return json({ id: 'u1', display_name: 'Me', ...(window.__profile ?? {}) });
            return json({});
        };
        window.confirm = () => true;
    });

    // Rendered with signedIn=true directly. The owner controls only appear for a
    // signed-in owner, and there is no Clerk key in a local build — so driving
    // _renderList is the only way to reach that branch here. What is under test is
    // the control's behaviour, not the session logic that decides to show it.
    await page.evaluate(async () => {
        const panel = window.mapsPanel;
        panel.init();
        panel.container.classList.remove('hidden');
        panel.isOpen = true;
        const maps = await panel.client.listMyMaps().catch(() => panel.client.listPublicMaps());
        panel._renderList(maps, true);
    });
    await page.waitForTimeout(500);

    const visibility = await page.evaluate(async () => {
        const button = document.querySelector('.maps-visibility');
        if (!button) return { missing: true };
        const before = button.textContent;
        button.click();
        await new Promise((r) => setTimeout(r, 700));
        // refresh() has already run and re-rendered through the session path,
        // which drops the owner controls in a keyless build — so the old button
        // is gone. Re-render as owner to read the label the owner would see.
        const panel = window.mapsPanel;
        panel._renderList(await panel.client.listMyMaps().catch(() => []), true);
        return {
            before,
            patched: window.__patched,
            after: document.querySelector('.maps-visibility')?.textContent,
        };
    });

    if (visibility.missing) fail('there is no way to change a map\'s visibility');
    else if (visibility.patched.length === 0) fail('pressing the visibility control sent nothing');
    else if (visibility.patched[0].visibility !== 'unlisted') {
        fail(`private should step to unlisted, got ${visibility.patched[0].visibility}`);
    } else if (!visibility.after || visibility.after === visibility.before) {
        fail(`the control still reads "${visibility.after}" after the change committed`);
    } else {
        pass(`visibility cycles private -> unlisted, and the label follows ("${visibility.before}" -> "${visibility.after}")`);
    }

    // Stepping round to public must be confirmed, and must reach the API.
    const toPublic = await page.evaluate(async () => {
        window.__patched = [];
        const panel = window.mapsPanel;
        // Re-render as owner: refresh() went through the session path and dropped
        // the owner controls again.
        panel._renderList(await panel.client.listMyMaps().catch(() => []), true);
        await new Promise((r) => setTimeout(r, 100));
        const button = document.querySelector('.maps-visibility');
        if (!button) return [];
        button.click();
        await new Promise((r) => setTimeout(r, 700));
        return window.__patched;
    });
    // --- the map that opens on sign-in
    //
    // Stored on the profile rather than in the browser, because which map you live in is
    // a fact about you and not about the device you are signed in from — which was the
    // whole reason for asking rather than remembering it locally.
    const starred = await page.evaluate(async () => {
        const panel = window.mapsPanel;
        panel._renderList(await panel.client.listMyMaps().catch(() => []), true);
        await new Promise((r) => setTimeout(r, 150));

        const star = document.querySelector('.maps-default');
        if (!star) return { missing: true };

        const before = { text: star.textContent, pressed: star.getAttribute('aria-pressed') };
        window.__patched = [];
        star.click();
        await new Promise((r) => setTimeout(r, 500));

        panel._renderList(await panel.client.listMyMaps().catch(() => []), true);
        const after = document.querySelector('.maps-default');
        return {
            before,
            sent: window.__patched,
            after: { text: after?.textContent, pressed: after?.getAttribute('aria-pressed') },
        };
    });

    if (starred.missing) {
        fail('there is no way to choose which map opens on sign-in');
    } else if (starred.before.pressed !== 'false') {
        fail(`the star starts pressed (${starred.before.pressed})`);
    } else if (starred.sent.length === 0 || !('default_map_id' in starred.sent[0])) {
        fail(`pressing the star sent ${JSON.stringify(starred.sent)}`);
    } else if (!starred.sent[0].default_map_id) {
        fail('pressing an unset star cleared the default instead of setting it');
    } else {
        pass(`a map can be nominated to open on sign-in (sent ${starred.sent[0].default_map_id})`);
    }

    // And pressing it again has to be the way back: a default you cannot un-choose is a
    // setting that only goes one way.
    const unstarred = await page.evaluate(async () => {
        const panel = window.mapsPanel;
        panel.defaultMapId = 'm1';
        panel._renderList(await panel.client.listMyMaps().catch(() => []), true);
        await new Promise((r) => setTimeout(r, 150));

        const star = document.querySelector('.maps-default');
        const shown = { text: star.textContent, pressed: star.getAttribute('aria-pressed') };
        window.__patched = [];
        star.click();
        await new Promise((r) => setTimeout(r, 500));
        return { shown, sent: window.__patched };
    });

    if (unstarred.shown.pressed !== 'true') {
        fail('the nominated map is not marked as nominated');
    } else if (unstarred.sent[0]?.default_map_id !== null) {
        fail(`pressing the nominated star sent ${JSON.stringify(unstarred.sent)}, not null`);
    } else {
        pass('pressing it again clears the nomination');
    }

    if (toPublic[0]?.visibility !== 'public') {
        fail(`unlisted should step to public, got ${toPublic[0]?.visibility}`);
    } else {
        pass('a map can be made public');
    }

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 12. Node pages, and whether the surfaces genuinely talk to each other.
//
// The map's value is the writing behind each concept, so the page pane has to
// hold text safely. And the outline, the cone and the 3D view are three views of
// one selection: the complaint that started this was that they behaved like three
// unrelated programs. Every direction of that is checked here, because a one-way
// binding looks correct from whichever side you happen to test.
// ---------------------------------------------------------------------------

const run_node_pages = section('node pages');

if (run_node_pages) {
    const { ctx, page } = await openApp(VIEWPORTS[2]);   // desktop

    // --- writing a page
    const written = await page.evaluate(async () => {
        const panel = window.nodeManagerPanel;
        const graph = window.fractalityEngine().nodeGraph;
        panel.show();
        const root = graph.getRootNodes()[0];
        const child = graph.getChildren(root.id)[0];
        panel.selectNode(root.id);
        await new Promise((r) => setTimeout(r, 100));

        const editor = document.querySelector('.nodemgr-editor');
        editor.value = `# ${root.metadata.label}\n\nFlows into [[${child.metadata.label}]].\n\n- one\n- two\n`;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        // Longer than the 600ms debounce.
        await new Promise((r) => setTimeout(r, 900));

        document.querySelector('.nodemgr-mode').click();
        await new Promise((r) => setTimeout(r, 100));

        const rendered = document.querySelector('.nodemgr-rendered');
        return {
            stored: graph.getNode(root.id).metadata.content ?? '',
            headingText: rendered.querySelector('h1')?.textContent ?? null,
            items: rendered.querySelectorAll('li').length,
            wikiLabel: rendered.querySelector('.md-wikilink')?.textContent ?? null,
            wikiUsable: rendered.querySelector('.md-wikilink')
                ? !rendered.querySelector('.md-wikilink').disabled : false,
            indicator: document.querySelector(
                `.nodemgr-row[data-node-id="${CSS.escape(root.id)}"] .nodemgr-haspage`)?.textContent ?? '',
            childLabel: child.metadata.label,
        };
    });

    if (!written.stored.startsWith('#')) {
        fail('typing a page did not reach the graph');
    } else {
        pass('a page typed into the editor is committed to the node');
    }

    if (written.headingText === null || written.items !== 2) {
        fail(`the page did not render (heading ${written.headingText}, ${written.items} items)`);
    } else {
        pass(`the page renders as markdown ("${written.headingText}", ${written.items} list items)`);
    }

    if (written.wikiLabel !== written.childLabel || !written.wikiUsable) {
        fail(`a [[wiki link]] to an existing node did not resolve (got ${written.wikiLabel})`);
    } else {
        pass(`a [[wiki link]] resolves by label ("${written.wikiLabel}")`);
    }

    if (written.indicator !== '◈') {
        fail('the outline does not mark which nodes have a page');
    } else {
        pass('the outline marks a node that has a page');
    }

    // --- a wiki link navigates, and takes the whole app with it
    const jumped = await page.evaluate(async () => {
        document.querySelector('.nodemgr-rendered .md-wikilink').click();
        await new Promise((r) => setTimeout(r, 200));
        return {
            selected: window.nodeManagerPanel.selectedId,
            focus: window.fractalityEngine().state.focusNode,
            title: document.querySelector('.nodemgr-page-title')?.textContent ?? '',
        };
    });

    if (jumped.selected !== jumped.focus || jumped.title !== written.childLabel) {
        fail(`following a wiki link left the app inconsistent (${JSON.stringify(jumped)})`);
    } else {
        pass(`following a wiki link moves the selection and the 3D focus together ("${jumped.title}")`);
    }

    // --- a pending edit must not be written onto the next node
    //
    // Type, then switch node inside the debounce window. The commit is keyed on the
    // id the text was loaded for; without that it lands on whatever is selected
    // when the timer fires, and the wrong page becomes the only page.
    const race = await page.evaluate(async () => {
        const panel = window.nodeManagerPanel;
        const graph = window.fractalityEngine().nodeGraph;
        const [a, b] = [...graph.nodes.values()].slice(0, 2);
        graph.setContent(a.id, '');
        graph.setContent(b.id, '');

        panel.selectNode(a.id);
        await new Promise((r) => setTimeout(r, 60));
        const editor = document.querySelector('.nodemgr-editor');
        editor.value = 'PAGE FOR A';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        panel.selectNode(b.id);              // well inside the debounce
        await new Promise((r) => setTimeout(r, 900));

        return {
            a: graph.getNode(a.id).metadata.content ?? '',
            b: graph.getNode(b.id).metadata.content ?? '',
        };
    });

    if (race.a !== 'PAGE FOR A') {
        fail(`switching node during a pending edit lost it (a = "${race.a}")`);
    } else if (race.b !== '') {
        fail(`a pending edit was written onto the newly selected node (b = "${race.b}")`);
    } else {
        pass('an edit still pending when the selection changes lands on the right node');
    }

    // --- hostile page content, in a real browser rather than jsdom
    const hostile = await page.evaluate(async () => {
        const panel = window.nodeManagerPanel;
        const graph = window.fractalityEngine().nodeGraph;
        const id = graph.getRootNodes()[0].id;
        window.__xss = 0;
        graph.setContent(id, [
            '<script>window.__xss = 1</script>',
            '<img src=x onerror="window.__xss = 2">',
            '[go](javascript:window.__xss = 3)',
            '<iframe src="https://evil.test"></iframe>',
            '<svg onload="window.__xss = 4"></svg>',
        ].join('\n\n'));
        panel.selectNode(id);
        panel._setEditing(false);
        await new Promise((r) => setTimeout(r, 400));

        const rendered = document.querySelector('.nodemgr-rendered');
        return {
            xss: window.__xss,
            injected: rendered.querySelectorAll('script, img, iframe, svg, object, embed').length,
            anchors: rendered.querySelectorAll('a').length,
            shownAsText: rendered.textContent.includes('<script>'),
        };
    });

    if (hostile.xss !== 0) {
        fail(`page content executed (window.__xss = ${hostile.xss})`);
    } else if (hostile.injected !== 0) {
        fail(`page content produced ${hostile.injected} element(s) it should not have`);
    } else if (hostile.anchors !== 0) {
        fail('a javascript: link in a page became a real link');
    } else if (!hostile.shownAsText) {
        fail('hostile markup was neither rendered nor shown — it vanished');
    } else {
        pass('hostile page content is displayed literally and executes nothing');
    }

    // --- selection is one thing, seen from three places
    const cone = await page.evaluate(async () => {
        const graph = window.fractalityEngine().nodeGraph;
        const target = [...graph.nodes.values()].find((n) => n.depth === 3)
            ?? [...graph.nodes.values()].sort((a, b) => b.depth - a.depth)[0];

        window.nodeManagerPanel.selectNode(target.id);
        await new Promise((r) => setTimeout(r, 150));
        window.nodeManagerPanel.hide();
        window.coneView.show();
        await new Promise((r) => setTimeout(r, 300));

        const angle = window.coneView._computeAngles(graph).get(target.id);
        return {
            id: target.id,
            depth: target.depth,
            tier: Math.round(window.coneView.tierFocus),
            // The front of the cone is where cos(angle + spin) is 1. A node on the
            // far side is drawn small, dim and behind everything, which reads as
            // absent — so highlighting it is not enough, it has to be turned to.
            frontness: Number(Math.cos(angle + window.coneView.spin).toFixed(3)),
            readout: document.querySelector('.cone-tier-label')?.textContent ?? '',
        };
    });

    if (cone.tier !== cone.depth) {
        fail(`the cone stayed on tier ${cone.tier} for a node on tier ${cone.depth}`);
    } else if (cone.frontness < 0.99) {
        fail(`the cone did not turn to the selected node (frontness ${cone.frontness})`);
    } else {
        pass(`selecting in the outline turns the cone to that node (tier ${cone.tier}, front)`);
    }

    // --- the same thing again with the cone ALREADY open
    //
    // A separate check because the one above reaches the cone through show(), which
    // aims on the way in whatever the listener does. Deleting the listener entirely
    // left that check passing, so it was proving the wrong thing.
    const coneLive = await page.evaluate(async () => {
        const graph = window.fractalityEngine().nodeGraph;
        // Somewhere else first, so the move is real.
        const start = graph.getRootNodes()[0];
        window.fractalityEngine().setFocus(start.id);
        await new Promise((r) => setTimeout(r, 200));
        const before = { tier: window.coneView.tierFocus, spin: window.coneView.spin };

        const target = [...graph.nodes.values()].sort((a, b) => b.depth - a.depth)[0];
        window.fractalityEngine().setFocus(target.id);
        await new Promise((r) => setTimeout(r, 250));

        const angle = window.coneView._computeAngles(graph).get(target.id);
        return {
            depth: target.depth,
            startDepth: start.depth,
            before,
            tier: Math.round(window.coneView.tierFocus),
            frontness: Number(Math.cos(angle + window.coneView.spin).toFixed(3)),
            moved: window.coneView.tierFocus !== before.tier
                || window.coneView.spin !== before.spin,
        };
    });

    if (!coneLive.moved) {
        fail('an open cone did not move at all when the focus changed elsewhere');
    } else if (coneLive.tier !== coneLive.depth || coneLive.frontness < 0.99) {
        fail(`an open cone did not follow the focus (tier ${coneLive.tier} for depth `
            + `${coneLive.depth}, frontness ${coneLive.frontness})`);
    } else {
        pass(`an already-open cone follows a focus change made elsewhere `
            + `(tier ${coneLive.before.tier} -> ${coneLive.tier})`);
    }

    // --- and back the other way, with the outline closed the whole time
    const backwards = await page.evaluate(async () => {
        window.nodeManagerPanel.hide();
        const before = { spin: window.coneView.spin, tier: window.coneView.tierFocus };
        const hit = window.coneView._hits[window.coneView._hits.length - 1];
        window.coneView._handleTap(hit.x, hit.y);
        await new Promise((r) => setTimeout(r, 150));

        window.coneView.hide();
        window.nodeManagerPanel.show();
        await new Promise((r) => setTimeout(r, 200));
        return {
            tapped: hit.id,
            selected: window.nodeManagerPanel.selectedId,
            row: document.querySelector('.nodemgr-row.selected')?.dataset.nodeId ?? null,
            // A tap must not snap the cone: the node would move out from under the
            // finger that just pointed at it.
            heldStill: window.coneView.spin === before.spin
                && window.coneView.tierFocus === before.tier,
        };
    });

    if (backwards.selected !== backwards.tapped || backwards.row !== backwards.tapped) {
        fail(`a cone tap did not reach the outline (tapped ${backwards.tapped}, `
            + `selected ${backwards.selected}, row ${backwards.row})`);
    } else {
        pass('a node tapped in the cone is selected in the outline, even if it was closed');
    }

    if (!backwards.heldStill) {
        fail('tapping a node in the cone spun the cone under the finger that tapped it');
    } else {
        pass('the cone does not re-aim on its own taps');
    }

    // --- a rename has to be visible on the other surface
    const renamed = await page.evaluate(async () => {
        const panel = window.nodeManagerPanel;
        panel.show();
        await new Promise((r) => setTimeout(r, 100));
        const id = panel.selectedId;
        window.prompt = () => 'RENAMED IN THE OUTLINE';
        panel._run('rename');
        await new Promise((r) => setTimeout(r, 150));

        panel.hide();
        window.coneView.show();
        await new Promise((r) => setTimeout(r, 350));
        return {
            label: window.fractalityEngine().nodeGraph.getNode(id).metadata.label,
            readout: document.querySelector('.cone-tier-label')?.textContent ?? '',
        };
    });

    if (!renamed.readout.includes('RENAMED IN THE OUTLINE')) {
        fail(`a rename in the outline is not visible in the cone (readout "${renamed.readout}")`);
    } else {
        pass('a rename in the outline shows up in the cone');
    }

    await page.evaluate(() => window.coneView.hide());

    // --- the panel must not cover the controls it sits between
    const fits = await page.evaluate(() => {
        window.nodeManagerPanel.show();
        const panel = document.querySelector('.nodemgr-panel').getBoundingClientRect();
        const dock = document.querySelector('.app-dock')?.getBoundingClientRect() ?? null;
        const tree = document.querySelector('.nodemgr-column-tree').getBoundingClientRect();
        const pageCol = document.querySelector('.nodemgr-column-page').getBoundingClientRect();
        return {
            clearsDock: !dock || panel.top >= dock.bottom - 1 || panel.bottom <= dock.top + 1,
            withinViewport: panel.top >= 0 && panel.bottom <= window.innerHeight + 1,
            bothColumnsVisible: tree.width > 100 && pageCol.width > 100,
            // The page is the half that gets written in, so it gets the room.
            pageIsLarger: pageCol.width > tree.width,
            noSidewaysScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
    });

    for (const [name, message] of [
        ['clearsDock', 'the panel does not cover the dock'],
        ['withinViewport', 'the panel fits the viewport'],
        ['bothColumnsVisible', 'the outline and the page are both on screen on a desktop'],
        ['pageIsLarger', 'the page gets the larger half'],
        ['noSidewaysScroll', 'the panel does not make the document scroll sideways'],
    ]) {
        if (fits[name]) pass(message);
        else fail(`NOT true: ${message}`);
    }

    await ctx.close();

    // --- on a phone the two halves take turns
    const { ctx: phoneCtx, page: phone } = await openApp(VIEWPORTS[0]);

    const tabs = await phone.evaluate(async () => {
        window.nodeManagerPanel.show();
        await new Promise((r) => setTimeout(r, 200));
        const visible = (selector) => {
            const el = document.querySelector(selector);
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const onTree = {
            tabsShown: visible('.nodemgr-tabs'),
            tree: visible('.nodemgr-column-tree'),
            page: visible('.nodemgr-column-page'),
        };
        document.querySelector('.nodemgr-tab[data-pane="page"]').click();
        await new Promise((r) => setTimeout(r, 150));
        const onPage = {
            tree: visible('.nodemgr-column-tree'),
            page: visible('.nodemgr-column-page'),
        };
        const panel = document.querySelector('.nodemgr-panel').getBoundingClientRect();
        const dock = document.querySelector('.app-dock')?.getBoundingClientRect() ?? null;
        return {
            onTree,
            onPage,
            clearsDock: !dock || panel.bottom <= dock.top + 1 || panel.top >= dock.bottom - 1,
            noSidewaysScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
    });

    if (!tabs.onTree.tabsShown) {
        fail('a phone has no way to switch between the outline and the page');
    } else if (!tabs.onTree.tree || tabs.onTree.page) {
        fail('a phone shows both columns at once, which fits neither');
    } else if (tabs.onPage.tree || !tabs.onPage.page) {
        fail('the Page tab did not switch the column');
    } else {
        pass('a phone shows one column at a time, chosen by the tabs');
    }

    if (tabs.clearsDock && tabs.noSidewaysScroll) {
        pass('the panel clears the dock on a phone without scrolling sideways');
    } else {
        fail(`on a phone: clears dock ${tabs.clearsDock}, no sideways scroll ${tabs.noSidewaysScroll}`);
    }

    await phoneCtx.close();
}

// ---------------------------------------------------------------------------
// 13. Convergent emergence: a node with more than one parent.
//
// An outline is a tree and the graph is not, so a node that several things flowed into
// has to appear once as itself and otherwise as a reference. The alternative — the
// whole subtree repeated under every contributor — gives N copies of one node and then
// the question of which copy is real. These checks are mostly about that not happening.
// ---------------------------------------------------------------------------

const run_emergence = section('convergent emergence');

if (run_emergence) {
    const { ctx, page } = await openApp(VIEWPORTS[2]);   // desktop

    const built = await page.evaluate(async () => {
        const g = window.fractalityEngine().nodeGraph;
        const panel = window.nodeManagerPanel;
        const root = g.getRootNodes()[0];
        const kids = g.getChildren(root.id);
        const contributor = kids[0];
        const emergent = kids[1];

        const before = g.getNode(emergent.id).depth;
        const added = g.addEmergence(emergent.id, contributor.id);
        panel.show();
        panel.selectNode(emergent.id);
        await new Promise((r) => setTimeout(r, 300));

        return {
            added,
            emergentId: emergent.id,
            contributorId: contributor.id,
            rootId: root.id,
            tierBefore: before,
            tierAfter: g.getNode(emergent.id).depth,
            nodeCount: g.nodes.size,
            rowCount: document.querySelectorAll('.nodemgr-row').length,
            refs: [...document.querySelectorAll('.nodemgr-ref')].map((r) => r.dataset.refId),
        };
    });

    if (!built.added) {
        fail('a legal convergent parent was refused');
    } else if (built.tierAfter <= built.tierBefore) {
        fail(`the emergent node stayed at tier ${built.tierAfter} after gaining a contributor`);
    } else {
        pass(`gaining a contributor moves a node below it (tier ${built.tierBefore} -> ${built.tierAfter})`);
    }

    // The property that makes the outline still an outline.
    if (built.rowCount !== built.nodeCount) {
        fail(`${built.rowCount} outline rows for ${built.nodeCount} nodes — the node was duplicated`);
    } else {
        pass(`each node still has exactly one row (${built.rowCount} of ${built.nodeCount})`);
    }

    if (!built.refs.includes(built.emergentId)) {
        fail('the contributor does not show that something emerged from it');
    } else {
        pass('a reference row appears under the contributor');
    }

    // A reference must not be mistakable for a home, or the toolbar would act on it.
    const refShape = await page.evaluate(() => {
        const ref = document.querySelector('.nodemgr-ref');
        return {
            isAlsoARow: ref.classList.contains('nodemgr-row'),
            saysWhereItLives: /lives in/.test(ref.textContent),
            hasNodeIdDataset: Boolean(ref.dataset.nodeId),
        };
    });

    if (refShape.isAlsoARow || refShape.hasNodeIdDataset) {
        fail('a reference row is indistinguishable from a real row');
    } else if (!refShape.saysWhereItLives) {
        fail('a reference row does not say where the node actually lives');
    } else {
        pass('a reference row is marked as a pointer and names the real home');
    }

    // Clicking it goes to the real node, and takes the rest of the app along.
    const followed = await page.evaluate(async () => {
        window.nodeManagerPanel.selectNode(
            window.fractalityEngine().nodeGraph.getRootNodes()[0].id);
        await new Promise((r) => setTimeout(r, 200));
        const ref = document.querySelector('.nodemgr-ref');
        const target = ref.dataset.refId;
        ref.click();
        await new Promise((r) => setTimeout(r, 250));
        return {
            target,
            selected: window.nodeManagerPanel.selectedId,
            focus: window.fractalityEngine().state.focusNode,
        };
    });

    if (followed.selected !== followed.target || followed.focus !== followed.target) {
        fail(`following a reference did not reach the node (${JSON.stringify(followed)})`);
    } else {
        pass('following a reference selects the real node and moves the 3D focus');
    }

    // What flows in, seen from the emergent node's own side.
    const inflow = await page.evaluate(async () => {
        const bar = document.querySelector('.nodemgr-inflow');
        return {
            hidden: bar.hidden,
            chips: [...bar.querySelectorAll('.nodemgr-inflow-chip')].map((c) => ({
                text: c.textContent,
                container: c.classList.contains('container'),
            })),
        };
    });

    const streams = inflow.chips.filter((c) => !c.container);
    const containers = inflow.chips.filter((c) => c.container);

    if (inflow.hidden) {
        fail('the selected node emerges from something and nothing says so');
    } else if (streams.length !== 1 || containers.length !== 1) {
        fail(`inflow shows ${streams.length} stream(s) and ${containers.length} container(s)`);
    } else if (!/^inside /.test(containers[0].text)) {
        fail(`the containing parent is not distinguished: "${containers[0].text}"`);
    } else {
        pass('the emergent node lists its streams, with the container marked apart');
    }

    // A node that converged from nothing must show no inflow bar at all, or the
    // distinction stops being visible where it matters.
    const plain = await page.evaluate(async () => {
        const g = window.fractalityEngine().nodeGraph;
        const bare = [...g.nodes.values()].find((n) => n.emergesFrom.length === 0 && n.parentId);
        window.nodeManagerPanel.selectNode(bare.id);
        await new Promise((r) => setTimeout(r, 250));
        return document.querySelector('.nodemgr-inflow').hidden;
    });

    if (!plain) fail('a node with no contributors still shows an inflow bar');
    else pass('a node with no contributors shows no inflow bar');

    // The picker offers only legal choices, so an illegal one is never on screen.
    const picker = await page.evaluate(async () => {
        const g = window.fractalityEngine().nodeGraph;
        const panel = window.nodeManagerPanel;
        const root = g.getRootNodes()[0];
        const target = g.getChildren(root.id)[2];
        panel.selectNode(target.id);
        await new Promise((r) => setTimeout(r, 200));

        const eligible = panel._eligibleContributors(g, g.getNode(target.id));
        const descendants = g.getDescendantIds(target.id);
        return {
            count: eligible.length,
            includesSelf: eligible.some((n) => n.id === target.id),
            includesContainer: eligible.some((n) => n.id === root.id),
            includesADescendant: eligible.some((n) => descendants.includes(n.id)),
            sortedByTier: eligible.every((n, i) => i === 0 || eligible[i - 1].depth <= n.depth),
        };
    });

    if (picker.includesSelf) fail('the contributor picker offers the node itself');
    else if (picker.includesContainer) fail('the picker offers the containing parent, which would double-count');
    else if (picker.includesADescendant) fail('the picker offers a descendant, which would make a loop');
    else if (!picker.sortedByTier) fail('the picker is not ordered by tier');
    else pass(`the picker offers only legal contributors (${picker.count}), shallowest first`);

    // --- the cone: radius means integration
    //
    // The radial coordinate is not just depth, it is how integrated a node is. The rim
    // is maximally differentiated, the axis maximally unified — which is the
    // Crystallization Spectrum drawn as a distance, with C_1 at the rim and C_4 on the
    // axis. So a node several streams converge into has to be visibly nearer the centre
    // than a sibling that nothing converges into.
    const geometry = await page.evaluate(async () => {
        const g = window.fractalityEngine().nodeGraph;
        const cone = window.coneView;

        // Start from a clean slate: earlier checks in this section left edges behind.
        for (const node of [...g.nodes.values()]) {
            for (const src of [...node.emergesFrom]) g.removeEmergence(node.id, src);
        }

        const root = g.getRootNodes()[0];
        const kids = g.getChildren(root.id);
        const plain = kids[0].id;
        const convergent = kids[1].id;
        const contributors = kids.slice(2, 6).map((n) => n.id);

        cone.show();
        await new Promise((r) => setTimeout(r, 250));

        // The RADIUS, not the screen x. x is radius * sin(angle), so a node at the
        // front of the cone sits at the horizontal centre whatever its radius — an
        // earlier version of this measured x and only passed because the angle happened
        // not to be zero.
        const measure = () => {
            const pts = cone._project(g, cone._computeAngles(g));
            const byId = new Map(pts.map((pt) => [pt.node.id, pt]));
            return {
                plain: byId.get(plain).radius,
                convergent: byId.get(convergent).radius,
            };
        };

        const before = measure();
        let added = 0;
        for (const c of contributors) if (g.addEmergence(convergent, c)) added++;
        await new Promise((r) => setTimeout(r, 250));
        const after = measure();

        // Select it before reading the readout. An earlier version read whatever the
        // previous check had left selected, and then reported the readout as broken for
        // correctly describing a node with no streams.
        window.fractalityEngine().setFocus(convergent);
        await new Promise((r) => setTimeout(r, 250));

        return {
            added,
            degree: g.getConvergenceDegree(convergent),
            before,
            after,
            plainUnmoved: Math.abs(before.plain - after.plain) < 0.01,
            readout: document.querySelector('.cone-tier-label')?.textContent ?? '',
        };
    });

    if (geometry.added === 0) {
        fail('no contributor could be added, so the geometry was never exercised');
    } else if (!(geometry.after.convergent < geometry.before.convergent)) {
        fail(`convergence did not pull the node inward `
            + `(radius ${geometry.before.convergent.toFixed(1)} -> ${geometry.after.convergent.toFixed(1)})`);
    } else if (!geometry.plainUnmoved) {
        fail('a node with no contributors moved when another node gained some');
    } else {
        pass(`convergence pulls a node toward the axis `
            + `(radius ${geometry.before.convergent.toFixed(0)} -> ${geometry.after.convergent.toFixed(0)}, `
            + `degree ${geometry.degree})`);
    }

    // Never ON the axis, however many streams: that position belongs to the apex.
    const neverZero = await page.evaluate(async () => {
        const g = window.fractalityEngine().nodeGraph;
        const cone = window.coneView;
        const emergent = [...g.nodes.values()].find((n) => n.emergesFrom.length > 0);
        // Pile on every legal contributor we can find.
        for (const candidate of [...g.nodes.values()]) g.addEmergence(emergent.id, candidate.id);
        await new Promise((r) => setTimeout(r, 250));

        const pts = cone._project(g, cone._computeAngles(g));
        const pt = pts.find((x) => x.node.id === emergent.id);
        const apex = pts.find((x) => x.node.depth === 0);
        return {
            degree: g.getConvergenceDegree(emergent.id),
            fromAxis: pt.radius,
            // The apex is on the axis because its tier is 0, which is what makes the
            // axis mean unity at both ends.
            apexOnAxis: apex ? apex.radius === 0 : null,
        };
    });

    if (neverZero.apexOnAxis !== true) {
        fail('the apex is not on the axis, so the axis does not mean unity');
    } else if (!(neverZero.fromAxis > 0)) {
        fail(`a node with ${neverZero.degree} parents landed ON the axis, `
            + 'which is the apex\'s position');
    } else {
        pass(`the apex sits on the axis and a ${neverZero.degree}-parent node only approaches it`);
    }

    if (!/converge here/.test(geometry.readout)) {
        fail(`the readout does not say why the node is off the rim: "${geometry.readout}"`);
    } else {
        pass('the readout states how many streams converge on the selected node');
    }

    await page.evaluate(() => window.coneView.hide());

    // And detaching puts the tier back.
    //
    // Sets up its own state rather than reusing whatever is attached by now: the check
    // above deliberately piles on every contributor it can find, so "remove the one
    // contributor" had nothing to work with and the action fell through to a prompt.
    const detached = await page.evaluate(async () => {
        const g = window.fractalityEngine().nodeGraph;
        const panel = window.nodeManagerPanel;

        for (const node of [...g.nodes.values()]) {
            for (const src of [...node.emergesFrom]) g.removeEmergence(node.id, src);
        }

        const root = g.getRootNodes()[0];
        const kids = g.getChildren(root.id);
        const emergent = kids[1].id;
        g.addEmergence(emergent, kids[0].id);

        panel.show();
        panel.selectNode(emergent);
        await new Promise((r) => setTimeout(r, 250));

        const before = g.getNode(emergent).depth;
        // Exactly one contributor, so no menu is shown and nothing is prompted for.
        panel._run('diverge');
        await new Promise((r) => setTimeout(r, 250));
        return {
            id: emergent,
            before,
            after: g.getNode(emergent).depth,
            emergesFrom: g.getNode(emergent).emergesFrom.length,
            refsLeft: document.querySelectorAll('.nodemgr-ref').length,
        };
    });

    if (detached.emergesFrom !== 0) {
        fail('detaching left the contributor attached');
    } else if (detached.after >= detached.before) {
        fail(`the tier did not rise after detaching (${detached.before} -> ${detached.after})`);
    } else if (detached.refsLeft !== 0) {
        fail(`${detached.refsLeft} reference row(s) survived the detach`);
    } else {
        pass(`detaching a contributor raises the tier again (${detached.before} -> ${detached.after})`);
    }

    // --- the on-axis toggle
    //
    // Declaring a reunification point has to be reachable without hand-editing a file, and
    // has to show which way it is set: a toggle whose state is invisible makes pressing it
    // a guess.
    const toggle = await page.evaluate(async () => {
        const g = window.fractalityEngine().nodeGraph;
        const panel = window.nodeManagerPanel;
        const target = g.getChildren(g.getRootNodes()[0].id)[0];
        for (const n of g.nodes.values()) delete n.metadata.onAxis;

        panel.show();
        panel.selectNode(target.id);
        await new Promise((r) => setTimeout(r, 250));

        const button = () => document.querySelector('.nodemgr-action[data-action="axis"]');
        const rowTier = () => document.querySelector(
            `.nodemgr-row[data-node-id="${CSS.escape(target.id)}"] .nodemgr-tier`);

        const before = {
            exists: Boolean(button()),
            pressed: button()?.getAttribute('aria-pressed'),
            active: button()?.classList.contains('active'),
            rowText: rowTier()?.textContent,
        };

        panel._run('axis');
        await new Promise((r) => setTimeout(r, 250));
        const after = {
            declared: g.getNode(target.id).metadata.onAxis === true,
            pressed: button()?.getAttribute('aria-pressed'),
            active: button()?.classList.contains('active'),
            rowText: rowTier()?.textContent,
            pageMeta: document.querySelector('.nodemgr-page-tier')?.textContent ?? '',
        };

        panel._run('axis');
        await new Promise((r) => setTimeout(r, 250));
        const off = {
            declared: g.getNode(target.id).metadata.onAxis === true,
            pressed: button()?.getAttribute('aria-pressed'),
            keyRemoved: !('onAxis' in g.getNode(target.id).metadata),
        };

        return { id: target.id, before, after, off };
    });

    if (!toggle.before.exists) {
        fail('there is no way to declare a node on the axis from the outline');
    } else if (!toggle.after.declared) {
        fail('pressing the toggle did not declare the node on the axis');
    } else if (toggle.before.pressed !== 'false' || toggle.after.pressed !== 'true') {
        fail(`the toggle does not report its state (${toggle.before.pressed} -> ${toggle.after.pressed})`);
    } else if (!toggle.after.active) {
        fail('the toggle is set but not visibly marked, so pressing it is a guess');
    } else {
        pass('the outline can declare a node on the axis, and shows that it is set');
    }

    // Visible on the node too, or the outline and the cone disagree about what they know.
    if (toggle.after.rowText === toggle.before.rowText) {
        fail(`the row does not show it (still "${toggle.after.rowText}")`);
    } else if (!/on the axis/.test(toggle.after.pageMeta)) {
        fail(`the page pane does not mention it: "${toggle.after.pageMeta}"`);
    } else {
        pass(`the row and the page both show it ("${toggle.before.rowText}" -> "${toggle.after.rowText}")`);
    }

    // And pressing again is the way back, removing the key rather than storing false.
    if (toggle.off.declared || toggle.off.pressed !== 'false') {
        fail('pressing the toggle again did not undeclare it');
    } else if (!toggle.off.keyRemoved) {
        fail('undeclaring stored onAxis:false instead of removing the key');
    } else {
        pass('pressing it again removes the declaration entirely');
    }

    // A node can be DECLARED on the axis, which is a claim about the ontology rather
    // than something derivable from its edges. Every derivable rule founders on sibling
    // branches: a node hanging off the side as a consequence would block the
    // reunification of something it has nothing to do with.
    const declared = await page.evaluate(async () => {
        const g = window.fractalityEngine().nodeGraph;
        const cone = window.coneView;

        for (const node of [...g.nodes.values()]) {
            for (const src of [...node.emergesFrom]) g.removeEmergence(node.id, src);
        }
        const deep = [...g.nodes.values()].sort((a, b) => b.depth - a.depth)[0];

        cone.show();
        await new Promise((r) => setTimeout(r, 250));
        const radiusOf = (id) => {
            const view = cone._view(g);
            const pts = cone._project(g, cone._computeAngles(g, view), view);
            return pts.find((x) => x.node.id === id)?.radius;
        };

        const before = radiusOf(deep.id);
        deep.metadata.onAxis = true;
        window.fractalityEngine().setFocus(deep.id);
        await new Promise((r) => setTimeout(r, 250));

        return {
            id: deep.id,
            tier: deep.depth,
            before,
            after: radiusOf(deep.id),
            readout: document.querySelector('.cone-tier-label')?.textContent ?? '',
        };
    });

    if (!(declared.before > 0)) {
        fail('the test node was already on the axis, so nothing was proven');
    } else if (declared.after !== 0) {
        fail(`a node declared onAxis has radius ${declared.after}, not 0`);
    } else if (!/on the axis/.test(declared.readout)) {
        fail(`the readout does not say the node is on the axis: "${declared.readout}"`);
    } else {
        pass(`a node declared onAxis sits exactly on it (radius ${declared.before.toFixed(0)} -> 0, tier ${declared.tier})`);
    }

    await page.evaluate(() => {
        const g = window.fractalityEngine().nodeGraph;
        for (const n of g.nodes.values()) delete n.metadata.onAxis;
    });

    // --- descending into an emergent node
    //
    // Axiom III makes a recursive cone the right representation rather than a
    // convenience: if the structure is self-similar across scales then descending into a
    // node and finding the same structure one scale down is what the model says happens.
    //
    // The load-bearing property is that descending is a VIEW and not an edit: real
    // depths belong to the whole map, and rewriting them to suit a picture would corrupt
    // the model to draw it.
    const recursion = await page.evaluate(async () => {
        const g = window.fractalityEngine().nodeGraph;
        const cone = window.coneView;

        for (const node of [...g.nodes.values()]) {
            for (const src of [...node.emergesFrom]) g.removeEmergence(node.id, src);
        }

        const root = g.getRootNodes()[0];
        const kids = g.getChildren(root.id);
        const emergent = kids[1].id;
        for (const c of [kids[2].id, kids[3].id, kids[4].id]) g.addEmergence(emergent, c);

        cone.show();
        await new Promise((r) => setTimeout(r, 250));

        const measure = () => {
            const view = cone._view(g);
            const pts = cone._project(g, cone._computeAngles(g, view), view);
            return { view, pts };
        };

        const wholeMap = measure();
        const realDepthBefore = g.getNode(emergent).depth;

        // Focus something OUTSIDE the subtree we are about to descend into, and record
        // its name. Without this the check depended on whatever a previous block had
        // left selected — which happened to be the apex itself, so removing the
        // auto-focus changed nothing and the check passed on a broken build.
        const outsider = g.getNode(root.id);
        window.fractalityEngine().setFocus(outsider.id);
        await new Promise((r) => setTimeout(r, 200));
        const outsiderName = outsider.metadata.label || outsider.id;

        const entered = cone.enterCone(emergent);
        await new Promise((r) => setTimeout(r, 300));
        const inside = measure();
        const apexPt = inside.pts.find((x) => x.node.id === emergent);
        const descendants = g.getDescendantIds(emergent);

        const result = {
            entered,
            wholeCount: wholeMap.pts.length,
            insideCount: inside.pts.length,
            apexLocalDepth: apexPt?.depth,
            apexOnAxis: apexPt?.radius === 0,
            onlyTheSubtree: inside.pts.every((x) =>
                x.node.id === emergent || descendants.includes(x.node.id)),
            collar: inside.view.collar.length,
            collarTappable: cone._collarHits?.length ?? 0,
            realDepthBefore,
            realDepthAfter: g.getNode(emergent).depth,
            crumbs: [...document.querySelectorAll('.cone-crumb')].map((c) => ({
                text: c.textContent, current: c.classList.contains('current'),
            })),
            readout: document.querySelector('.cone-tier-label').textContent,
            outsiderName,
            // Scrolling must stop at this cone's floor, not the whole map's.
            clampedTo: (() => { cone.tierFocus = cone._clampTier(999); return cone.tierFocus; })(),
            localMax: cone._maxTier(g, inside.view),
        };

        cone.tierFocus = 0;
        const exited = cone.exitCone();
        await new Promise((r) => setTimeout(r, 250));
        result.exited = exited;
        result.backCount = measure().pts.length;
        result.crumbsAfter = document.querySelector('.cone-breadcrumb').hidden;

        const leaf = [...g.nodes.values()].find((n) => n.childIds.length === 0);
        result.leafRefused = cone.enterCone(leaf.id) === false;

        return result;
    });

    if (!recursion.entered) {
        fail('could not descend into a node that contains others');
    } else if (recursion.apexLocalDepth !== 0 || !recursion.apexOnAxis) {
        fail(`the descended node is not this cone's apex `
            + `(local tier ${recursion.apexLocalDepth}, on axis ${recursion.apexOnAxis})`);
    } else {
        pass('descending puts the node at its own cone\'s apex, on the axis');
    }

    if (!recursion.onlyTheSubtree) {
        fail('a descended cone shows nodes from outside the apex');
    } else if (!(recursion.insideCount < recursion.wholeCount)) {
        fail(`descending showed ${recursion.insideCount} nodes, not fewer than ${recursion.wholeCount}`);
    } else {
        pass(`a descended cone shows only what the apex contains (${recursion.insideCount} of ${recursion.wholeCount})`);
    }

    // The property that keeps this a view rather than an edit.
    if (recursion.realDepthAfter !== recursion.realDepthBefore) {
        fail(`descending changed the node's real tier `
            + `(${recursion.realDepthBefore} -> ${recursion.realDepthAfter}) — `
            + 'the view rewrote the model');
    } else {
        pass(`descending leaves real tiers alone (still ${recursion.realDepthAfter})`);
    }

    if (recursion.collar === 0) {
        fail('the apex emerged from three nodes and no inflow collar was drawn');
    } else if (recursion.collarTappable !== recursion.collar) {
        fail(`${recursion.collar} collar node(s) drawn but ${recursion.collarTappable} tappable`);
    } else {
        pass(`the apex's contributors are drawn above it and reachable (${recursion.collar})`);
    }

    const crumbTexts = recursion.crumbs.map((c) => c.text);
    if (crumbTexts.length !== 2 || crumbTexts[0] !== 'Whole map') {
        fail(`the breadcrumb reads ${JSON.stringify(crumbTexts)}`);
    } else if (!recursion.crumbs[1].current) {
        fail('the breadcrumb does not mark which cone you are in');
    } else {
        pass(`the breadcrumb names the way back ("${crumbTexts.join(' › ')}")`);
    }

    // The readout must describe what is on screen, not what used to be selected.
    if (!/inside "/.test(recursion.readout)) {
        fail(`the readout does not say which cone you are in: "${recursion.readout}"`);
    } else if (recursion.readout.includes(`selected: ${recursion.outsiderName}`)) {
        fail(`the readout names "${recursion.outsiderName}", which is outside this cone: `
            + `"${recursion.readout}"`);
    } else {
        pass('the readout names the cone you are in, and only nodes it contains');
    }

    if (recursion.clampedTo !== recursion.localMax) {
        fail(`scrolling down reached tier ${recursion.clampedTo}, past this cone's floor `
            + `of ${recursion.localMax}`);
    } else {
        pass(`scrolling stops at this cone's floor (tier ${recursion.localMax})`);
    }

    if (!recursion.exited || recursion.backCount !== recursion.wholeCount) {
        fail(`coming back up showed ${recursion.backCount} of ${recursion.wholeCount} nodes`);
    } else if (!recursion.crumbsAfter) {
        fail('the breadcrumb is still shown at the whole-map level');
    } else {
        pass('coming back up restores the whole map and hides the breadcrumb');
    }

    if (!recursion.leafRefused) {
        fail('descending into a leaf was allowed, which shows one point and nothing else');
    } else {
        pass('a node containing nothing refuses to be descended into');
    }

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 14. Installable as an app, and a service worker that is safe about it.
//
// A service worker is the one piece of a web app that can break it permanently: it sits in
// front of every request, survives reloads, and a bad one serves a stale build to someone
// with no obvious way out. So most of these checks are about what it must NOT do.
// ---------------------------------------------------------------------------

const run_installable = section('installable');

if (run_installable) {
    const { ctx, page } = await openApp(VIEWPORTS[2]);

    const manifest = await page.evaluate(async () => {
        const link = document.querySelector('link[rel=manifest]');
        if (!link) return { missing: true };
        const res = await fetch(link.href);
        if (!res.ok) return { status: res.status };
        const body = await res.json();
        return {
            status: res.status,
            contentType: res.headers.get('content-type'),
            body,
            themeColor: document.querySelector('meta[name=theme-color]')?.content ?? null,
            appleIcon: Boolean(document.querySelector('link[rel=apple-touch-icon]')),
        };
    });

    if (manifest.missing) {
        fail('there is no web app manifest, so the app cannot be installed');
    } else if (manifest.status !== 200) {
        fail(`the manifest returned ${manifest.status}`);
    } else if (manifest.body.name !== 'Fractality Platform') {
        fail(`the manifest names the app "${manifest.body.name}"`);
    } else if (manifest.body.display !== 'standalone') {
        fail(`display is "${manifest.body.display}", so it would open in a browser tab`);
    } else {
        pass(`the manifest is served and names the app ("${manifest.body.name}")`);
    }

    // Installability needs a 192 and a 512, and a maskable variant or the platform crops
    // a square icon into a circle and takes the corners with it.
    const sizes = (manifest.body?.icons ?? []).map((i) => `${i.sizes}:${i.purpose ?? 'any'}`);
    const hasAny = ['192x192:any', '512x512:any'].every((s) => sizes.includes(s));
    const hasMaskable = sizes.some((s) => s.endsWith(':maskable'));

    if (!hasAny) {
        fail(`the manifest lacks a 192 and 512 "any" icon (has ${sizes.join(', ')})`);
    } else if (!hasMaskable) {
        fail('the manifest has no maskable icon, so the platform will crop the square one');
    } else if (!manifest.themeColor || !manifest.appleIcon) {
        fail(`theme-color ${manifest.themeColor}, apple-touch-icon ${manifest.appleIcon}`);
    } else {
        pass(`icons cover 192, 512 and maskable, with a theme colour and an iOS icon`);
    }

    // Every icon must actually be the size it claims, or the platform silently rejects it.
    //
    // Paired by INDEX, not looked back up by src. Two entries can legitimately point at the
    // same file, and an earlier version used find(d => d.src === i.src) — which returned
    // whichever entry came first and let a 512 entry pointing at the 192 file pass, since
    // the file really is the size the *other* entry declared.
    const declaredIcons = (manifest.body?.icons ?? []).map((i) => ({
        src: i.src,
        expected: Number(String(i.sizes).split('x')[0]),
        purpose: i.purpose ?? 'any',
    }));

    const icons = await page.evaluate((entries) => Promise.all(entries.map((entry) =>
        new Promise((res) => {
            const img = new Image();
            img.onload = () => res({ ...entry, w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => res({ ...entry, w: 0, h: 0 });
            img.src = entry.src;
        }))), declaredIcons);

    const wrong = icons.filter((i) => i.w !== i.expected || i.h !== i.expected);
    if (wrong.length > 0) {
        fail(`icons whose real size differs from the declared one: `
            + wrong.map((i) => `${i.src} declared ${i.expected} but is ${i.w}x${i.h}`).join(', '));
    } else {
        pass(`every declared icon is really that size (${icons.map((i) => i.w).join(', ')})`);
    }

    // --- what the service worker must not do
    const sw = await page.evaluate(async () => {
        const res = await fetch('/sw.js');
        return { status: res.status, source: res.ok ? await res.text() : '' };
    });

    if (sw.status !== 200) {
        fail(`/sw.js returned ${sw.status}, so nothing can be installed`);
    } else {
        pass('the service worker is served from the origin root, giving it root scope');
    }

    // Read from the source rather than by exercising it: the failure mode is a cache that
    // outlives a session and leaks one user's data to the next, and a behavioural test that
    // happens to miss it would be worse than no test.
    const rules = [
        ['leaves cross-origin requests alone',
            /url\.origin !== self\.location\.origin\)\s*return/],
        ['handles only GET', /request\.method !== 'GET'\)\s*return/],
        ['never caches a credentialed request', /headers\.has\('Authorization'\)\)\s*return/],
        ['excludes API paths by name even on this origin', /NEVER_CACHE/],
        ['uses network-first for navigation', /request\.mode === 'navigate'[\s\S]{0,120}networkFirst/],
        ['only caches complete same-origin responses', /response\.type === 'basic'/],
        ['waits to be told before replacing a running page', /'skip-waiting'/],
        // Cache-first is only defensible for a filename that changes with its contents.
        // Anything else added to this branch — /icons/ was, briefly — is pinned until
        // VERSION changes, which is longer than any HTTP header can undo.
        ['serves only content-hashed files from cache first',
            /startsWith\('\/assets\/'\)\)\s*\{\s*event\.respondWith\(cacheFirst/],
    ];
    const broken = rules.filter(([, re]) => !re.test(sw.source)).map(([name]) => name);

    if (broken.length > 0) {
        fail(`the service worker no longer: ${broken.join('; ')}`);
    } else {
        pass(`the service worker refuses to cache anything per-user (${rules.length} rules)`);
    }

    // A stale cache name would mean an old build's assets outliving a deploy.
    if (!/const VERSION = /.test(sw.source) || !/caches\.delete/.test(sw.source)) {
        fail('the service worker does not clean up caches from older versions');
    } else {
        pass('older caches are deleted on activation');
    }

    // --- the dock offers it, and says something true when it cannot
    const entry = await page.evaluate(async () => {
        // The dock's own class names: .dock-button along the bar, .dock-sheet-row inside
        // the More sheet. Guessing at .dock-item reported the entry as missing while it was
        // there, which is a check failing on its own selector rather than on the app.
        const more = [...document.querySelectorAll('.dock-button')]
            .find((b) => /More/i.test(b.textContent));
        more?.click();
        await new Promise((r) => setTimeout(r, 400));

        const item = [...document.querySelectorAll('.dock-sheet-row, .dock-button')]
            .find((b) => /Install app/i.test(b.textContent));
        return item
            ? { found: true, text: item.textContent.trim(), title: item.getAttribute('title') ?? '' }
            : {
                found: false,
                sheetRows: [...document.querySelectorAll('.dock-sheet-row')]
                    .map((r) => r.textContent.trim().slice(0, 30)),
            };
    });

    if (!entry.found) {
        fail(`there is no Install entry in the dock (More holds: ${JSON.stringify(entry.sheetRows)})`);
    } else {
        pass('the dock offers Install');
    }

    // It must stay pressable when the browser has not offered a prompt — which is most of
    // the time, and always on iOS. A greyed-out entry there would tell nobody anything,
    // and the dock's own rule is that no entry is a placeholder.
    const explains = await page.evaluate(async () => {
        const item = [...document.querySelectorAll('.dock-sheet-row, .dock-button')]
            .find((b) => /Install app/i.test(b.textContent));
        if (!item) return { missing: true };

        const unavailable = item.classList.contains('unavailable');
        item.click();
        await new Promise((r) => setTimeout(r, 400));
        // The app's own class, .fractality-toast. Guessing at .notification found nothing
        // and reported the message as empty while it was on screen.
        const toasts = [...document.querySelectorAll('.fractality-toast')];
        return {
            unavailable,
            said: toasts.map((t) => t.textContent).join(' | '),
        };
    });

    if (explains.unavailable) {
        fail('the Install entry is greyed out when no prompt has been offered');
    } else if (!/browser|Home Screen|installed/i.test(explains.said)) {
        fail(`pressing Install with no prompt available said: "${explains.said}"`);
    } else {
        pass('with no prompt available it explains how to install by hand');
    }

    await ctx.close();
}

// --- cone labels -----------------------------------------------------------
//
// The default is "the read tier plus the selection", which is what shipped. The
// toggle adds "every node", and the read tier is emphasised so it still stands
// out once everything is named.
//
// Measured from the canvas rather than from the flag: the flag being true says
// nothing about whether a name was actually painted, and the interesting bugs
// here are all about paint order and collision.

const run_cone_labels = section('cone labels');

if (run_cone_labels) {
    const { ctx, page } = await openApp(VIEWPORTS[2]);   // desktop

    // Count painted labels by instrumenting fillText, bounded to ONE FRAME by
    // wrapping _paintLabels.
    //
    // The frame boundary is the whole point. A first version collected across two
    // animation frames and deduplicated by label TEXT to compensate — and the demo
    // graph has duplicate labels: tier 3 holds ten nodes with five distinct
    // strings, tier 4 holds fifteen with five. So that version was counting
    // distinct strings, reported a hard ceiling of 5 that was really the fixture's
    // vocabulary, and produced a completely false finding about crowded tiers.
    // Wrapping _paintLabels gives an exact frame, so labels are counted by paint
    // and duplicate text stops mattering.
    const install = async () => page.evaluate(() => {
        const cone = window.coneView;
        const c = cone.ctx;
        if (c.__patched) return;

        let collecting = null;
        const originalFill = c.fillText.bind(c);
        c.fillText = (text, x, y) => {
            if (collecting) collecting.push({ text, x, y, font: c.font, fill: c.fillStyle });
            return originalFill(text, x, y);
        };

        const originalPaint = cone._paintLabels.bind(cone);
        cone._paintLabels = (ctx, candidates) => {
            collecting = [];
            const result = originalPaint(ctx, candidates);
            window.__labels = collecting;
            collecting = null;
            return result;
        };
        c.__patched = true;
    });

    // One frame's worth of paints, counted as paints. NOT deduplicated by text:
    // see install() above for why that was wrong.
    const sample = async () => page.evaluate(async () => {
        window.__labels = [];
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const all = window.__labels ?? [];

        // getFocusedNode(), not a .focusedId property — there isn't one, and reading
        // a missing field would quietly make `focused` null and turn the assertion
        // below into "no strays" for every input.
        const focusedId = window.coneView.getFocusedNode();
        const focused = focusedId
            ? (window.fractalityEngine().nodeGraph.getNode(focusedId)?.metadata?.label ?? null)
            : null;

        return {
            focused,
            names: all.map((l) => l.text),
            bold: all.filter((l) => /bold/.test(l.font)).map((l) => l.text),
            plain: all.filter((l) => !/bold/.test(l.font)).map((l) => l.text),
        };
    });

    await page.evaluate(async () => {
        window.coneView.show();
        // Tier 3, not tier 2, and the difference is the whole check.
        //
        // Measured across every tier and viewport: tier 2 on a desktop is the one
        // row that never loses a label at any rotation, so a check placed there
        // cannot see the collision rules work and passed a mutation that deleted
        // one. Tier 3 is where removing the read tier's collision priority is
        // observable — it drops from 5 surviving names to 4.
        //
        // tierFocus is the field the drag gesture writes, so setting it directly is
        // the same path the user takes. An optional-call helper that does not exist
        // would no-op silently and leave this measuring the apex — one node — while
        // still reporting a pass.
        window.coneView.setShowAllLabels(false);
        window.coneView.tierFocus = 3;
        await new Promise((r) => setTimeout(r, 400));
    });

    const onTierCount = await page.evaluate(() => {
        const g = window.fractalityEngine().nodeGraph;
        return [...g.nodes.values()].filter((n) => n.depth === 3).length;
    });
    if (onTierCount < 6) {
        fail(`tier 3 holds only ${onTierCount} node(s); this section needs a CROWDED `
            + 'tier, or the collision rules never fire and nothing here is tested');
    } else {
        pass(`measuring against a crowded tier (${onTierCount} nodes on tier 3)`);
    }
    await install();

    const off = await sample();
    const total = await page.evaluate(() => window.fractalityEngine().nodeGraph.nodes.size);

    if (off.names.length === 0) {
        fail('no labels were painted at all, so this section is measuring nothing');
    } else if (off.names.length >= total) {
        fail(`labels off still named ${off.names.length} of ${total} nodes`);
    } else {
        pass(`by default only some nodes are named (${off.names.length} of ${total})`);
    }

    // Everything painted by default is either ON the read tier or IS the selection.
    // The selection is legitimately not bold — it is marked by colour, and it can
    // sit on any tier — so it is excluded rather than counted as a failure. The
    // first version of this check asserted "all bold" and failed on the selected
    // root, which was the check being wrong about the design, not a bug.
    const strayPlain = off.plain.filter((name) => name !== off.focused);
    if (!off.focused) {
        fail('nothing is selected, so this cannot distinguish the selection from a stray');
    } else if (strayPlain.length > 0) {
        fail(`labels off painted ${strayPlain.length} name(s) that are neither the read `
            + `tier nor the selection: ${JSON.stringify(strayPlain.slice(0, 4))}`);
    } else {
        pass(`the read tier is drawn bold, the selection apart from it ("${off.focused}")`);
    }

    await page.evaluate(() => window.coneView.setShowAllLabels(true));
    const on = await sample();

    if (on.names.length <= off.names.length) {
        fail(`turning labels on did not add any (${off.names.length} -> ${on.names.length})`);
    } else {
        pass(`turning labels on names more nodes (${off.names.length} -> ${on.names.length})`);
    }

    // The point of the emphasis: with everything named, the read tier is still
    // separable from its context.
    if (on.bold.length === 0) {
        fail('with every label on, nothing is emphasised as the read tier');
    } else if (on.plain.length === 0) {
        fail('with every label on, everything is emphasised, so nothing is');
    } else {
        pass(`the read tier stays distinct (${on.bold.length} bold, ${on.plain.length} plain)`);
    }

    // The invariant: adding off-tier names must never REDUCE how many read-tier
    // names survive. That is what the sort's onTier rank buys.
    //
    // Measured over a rotation sweep, not at one angle. At a single angle the five
    // tier-2 names happen not to collide with anything, so removing the priority
    // rule entirely changed nothing and the first version of this check passed a
    // mutation. Contention is a function of rotation: sweeping finds the angles
    // where names actually compete, and summing over them makes the number stable
    // instead of depending on where the cone happened to stop.
    // The WORST angle over a sweep, not the sum. Contention depends on rotation, so
    // a single angle proves nothing — but a sum hides a loss at one angle, and the
    // loss is exactly what this is looking for.
    const sweep = async (showAll) => {
        await page.evaluate((on) => window.coneView.setShowAllLabels(on), showAll);
        const perAngle = [];
        for (let i = 0; i < 24; i++) {
            await page.evaluate((spin) => { window.coneView.spin = spin; },
                (i * Math.PI * 2) / 24);
            perAngle.push((await sample()).bold.length);
        }
        return { worst: Math.min(...perAngle), perAngle };
    };

    const tierAlone = await sweep(false);
    const tierWithContext = await sweep(true);

    if (tierAlone.worst === 0) {
        fail('no read-tier names survived at some angle even with nothing else drawn');
    } else if (tierWithContext.worst < tierAlone.worst) {
        fail(`adding off-tier names cost the read tier its own: worst angle went `
            + `${tierAlone.worst} -> ${tierWithContext.worst} of ${onTierCount}; `
            + `per angle ${JSON.stringify(tierWithContext.perAngle)}`);
    } else {
        pass(`off-tier names never evict a read-tier one (worst angle keeps `
            + `${tierWithContext.worst} of ${onTierCount}, either way)`);
    }

    // --- the second label slot ---------------------------------------------
    //
    // A label that cannot fit above its node is placed below it before being
    // dropped. Measured at tier 1, the apex, where five nodes share the least
    // space on screen and a single slot showed only two of them at the worst
    // rotation. Tiers 3 and 4 are deliberately NOT used here: their crowding is
    // horizontal — front and back of the ellipse both project to the centre x —
    // and a second row does not reach it, so a check placed there would pass
    // whether the slot existed or not.
    const apex = await page.evaluate(() => {
        const g = window.fractalityEngine().nodeGraph;
        return [...g.nodes.values()].filter((n) => n.depth === 1).length;
    });

    await page.evaluate(() => {
        window.coneView.tierFocus = 1;
        window.coneView.setShowAllLabels(true);
    });
    const atApex = await sweep(true);

    // 4 of 5, not 5 of 5: two slots are an improvement, not a solution, and
    // asserting perfection here would be asserting something untrue.
    if (apex < 4) {
        fail(`tier 1 holds only ${apex} node(s); too few to say anything about crowding`);
    } else if (atApex.worst < apex - 1) {
        fail(`the crowded apex shows only ${atApex.worst} of ${apex} names at its worst `
            + `angle; a second label slot should keep all but one. Per angle `
            + JSON.stringify(atApex.perAngle));
    } else {
        pass(`a label crowded out from above is placed below instead `
            + `(apex keeps ${atApex.worst} of ${apex} at every angle)`);
    }

    // --- can the controls actually be pressed? ------------------------------
    //
    // Not "is it in the DOM" and not "does it have the right attributes" — this
    // section asserted both of those and still shipped two buttons that were
    // completely unreachable on a wide screen. #perf-dashboard is position:fixed
    // at z-index 1000 in the same top-right corner, and the cone view was at 900,
    // so × and Labels rendered at full opacity underneath it.
    //
    // elementFromPoint at the centre of each control is the question that matters:
    // if the answer is not the control itself, a user cannot press it, whatever the
    // computed styles say. Checked at every viewport, because the failure was
    // desktop-only — the same buttons worked on a phone.
    const reachable = await page.evaluate(() => {
        const describe = (el) => {
            if (!el) return 'nothing';
            const cls = typeof el.className === 'string' && el.className.trim()
                ? '.' + el.className.trim().split(/\s+/).join('.') : '';
            return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}`;
        };
        return ['.cone-labels', '.cone-close'].map((sel) => {
            const el = document.querySelector(sel);
            if (!el) return { sel, missing: true };
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return {
                sel,
                covered: !(hit === el || el.contains(hit)),
                by: describe(hit),
                offscreen: r.right <= 0 || r.bottom <= 0
                    || r.left >= innerWidth || r.top >= innerHeight,
            };
        });
    });

    const unreachable = reachable.filter((r) => r.missing || r.covered || r.offscreen);
    if (unreachable.length > 0) {
        fail('cone controls that cannot be pressed: ' + unreachable
            .map((r) => r.missing ? `${r.sel} is not in the DOM`
                : r.offscreen ? `${r.sel} is off screen`
                : `${r.sel} is covered by ${r.by}`)
            .join('; '));
    } else {
        pass(`every cone control can actually be pressed (${reachable.length} checked)`);
    }

    // The button reflects it, and the preference survives a reload.
    const button = await page.evaluate(() => {
        const b = document.querySelector('.cone-labels');
        return b ? { pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('active') } : null;
    });
    if (!button) {
        fail('there is no labels button in the cone view');
    } else if (button.pressed !== 'true' || !button.active) {
        fail(`the labels button does not show its state: ${JSON.stringify(button)}`);
    } else {
        pass('the button shows that every label is on');
    }

    const persisted = await page.evaluate(
        () => localStorage.getItem('fractality.cone.showAllLabels'));
    if (persisted !== 'true') {
        fail(`the preference was not stored (got ${JSON.stringify(persisted)})`);
    } else {
        pass('the choice is remembered for the next visit');
    }

    await ctx.close();
}

// --- the default screen ----------------------------------------------------
//
// The cone view is the app's base view, not an overlay. The three things that
// makes true are each a separate claim, and each has been wrong at some point.

const run_default_view = section('default screen');

if (run_default_view) {
    const { ctx, page } = await openApp(VIEWPORTS[2]);   // desktop

    const onLoad = await page.evaluate(() => ({
        cone: window.coneView.isOpen,
        bubble: window.bubbleView.isOpen,
        paused: Boolean(window.fractalityEngine()?.paused),
        closeHidden: document.querySelector('.cone-close')?.hidden,
    }));

    if (!onLoad.cone) {
        fail('the cone view is not open on load, so the app opens on the old 3D scene');
    } else if (onLoad.bubble) {
        fail('both views are open on load');
    } else {
        pass('the app opens straight into the cone view');
    }

    // The old default view drew shaded spheres nobody was looking at. update()
    // returns early when paused, so this is the check that no Three.js work is
    // happening behind the view that replaced it.
    if (!onLoad.paused) {
        fail('the 3D engine is still rendering behind the default view');
    } else {
        pass('the 3D scene is not being drawn behind it');
    }

    // A × on the default screen would close the only thing on screen.
    if (onLoad.closeHidden !== true) {
        fail('the cone view offers a close button at the top level, where there is '
            + 'nothing behind it');
    } else {
        pass('no close button at the top level, where closing would leave nothing');
    }

    const nested = await page.evaluate(async () => {
        const g = window.fractalityEngine().nodeGraph;
        const inner = [...g.nodes.values()].find((n) => g.getChildren(n.id).length > 1);
        window.coneView.enterCone(inner.id);
        await new Promise((r) => setTimeout(r, 300));
        const shown = document.querySelector('.cone-close')?.hidden === false;
        document.querySelector('.cone-close').click();
        await new Promise((r) => setTimeout(r, 300));
        return { shown, stillOpen: window.coneView.isOpen,
                 hiddenAgain: document.querySelector('.cone-close')?.hidden };
    });
    if (!nested.shown) {
        fail('descending into a cone does not offer a way back out');
    } else if (!nested.stillOpen || nested.hiddenAgain !== true) {
        fail(`pressing it closed the view instead of the cone `
            + `(open:${nested.stillOpen} hidden:${nested.hiddenAgain})`);
    } else {
        pass('descending offers a way out that exits the cone, not the view');
    }

    // THE REGRESSION: panels must sit above the views. Raising the views to 1100
    // to escape the HUD put them over all five panels, so opening Maps from the
    // dock did nothing visible — the panel was there, underneath.
    const panels = await page.evaluate(async () => {
        const describe = (el) => {
            if (!el) return 'nothing';
            const cls = typeof el.className === 'string' && el.className.trim()
                ? '.' + el.className.trim().split(/\s+/).join('.') : '';
            return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}`;
        };
        const out = [];
        for (const [name, panel] of [['maps', window.mapsPanel],
                                     ['node manager', window.nodeManagerPanel],
                                     ['feed', window.feedPanel]]) {
            panel.show();
            await new Promise((r) => setTimeout(r, 400));
            const box = panel.container?.getBoundingClientRect();
            const probe = box && box.width > 0
                ? document.elementFromPoint(box.left + box.width / 2, box.top + 30)
                : null;
            out.push({
                name,
                visible: Boolean(box && box.width > 0),
                // The panel is on top if the topmost element at its own coordinates
                // belongs to it.
                onTop: Boolean(probe && panel.container.contains(probe)),
                covering: describe(probe),
            });
            panel.hide?.();
            await new Promise((r) => setTimeout(r, 200));
        }
        return out;
    });
    const buried = panels.filter((x) => !x.visible || !x.onTop);
    if (buried.length > 0) {
        fail('panels hidden behind the default view: ' + buried
            .map((x) => x.visible ? `${x.name} covered by ${x.covering}` : `${x.name} did not open`)
            .join('; '));
    } else {
        pass(`every panel opens above the default view (${panels.length} checked)`);
    }

    // The performance HUD shares the top-right corner with the view's controls.
    // Offsetting them is what replaced the z-index fight that caused the above.
    const hud = await page.evaluate(async () => {
        const read = () => getComputedStyle(document.documentElement)
            .getPropertyValue('--hud-inset').trim();
        const labels = document.querySelector('.cone-labels');
        const reachable = () => {
            const r = labels.getBoundingClientRect();
            const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return el === labels || labels.contains(el);
        };
        const before = { inset: read(), reachable: reachable() };
        window.fractalityEngine().togglePerformanceMonitor();
        await new Promise((r) => setTimeout(r, 350));
        const on = { inset: read(), reachable: reachable(),
                     top: Math.round(labels.getBoundingClientRect().top) };
        window.fractalityEngine().togglePerformanceMonitor();
        await new Promise((r) => setTimeout(r, 350));
        const after = { inset: read(), reachable: reachable() };
        return { before, on, after };
    });

    if (!hud.before.reachable || !hud.on.reachable || !hud.after.reachable) {
        fail(`the Labels button is unreachable at some point: ${JSON.stringify(hud)}`);
    } else if (!hud.on.inset || hud.on.inset === '0px') {
        fail('showing the performance HUD set no inset, so the controls are under it');
    } else if (hud.after.inset) {
        fail(`dismissing the HUD left --hud-inset at ${hud.after.inset}`);
    } else if (hud.on.top > 200) {
        // Offsetting by the HUD's HEIGHT rather than its width put this button at
        // y=466 on a 900px screen: reachable, and halfway down the view.
        fail(`the HUD pushed the controls to y=${hud.on.top}; it should move them `
            + 'sideways, not down the screen');
    } else {
        pass(`the HUD moves the view's controls aside and back (${hud.on.inset}, `
            + `still at y=${hud.on.top})`);
    }

    await ctx.close();
}

// --- bubble view -----------------------------------------------------------
//
// The view that replaced five 3D layouts. Its claims: one level at a time, the
// name written INSIDE the circle, and entering a bubble as the only navigation.
// Each of those is checked as geometry rather than as state, because "the label
// is inside the circle" is the entire reason this view draws flat circles and a
// boolean saying so would not notice text hanging over the edge.

const run_bubble = section('bubble view');

if (run_bubble) {
    for (const vp of VIEWPORTS) {
        const { ctx, page } = await openApp(vp);

        // Capture what the labels actually are and where they land.
        await page.evaluate(() => {
            const bv = window.bubbleView;
            bv.show();
            const c = bv.ctx;
            let collecting = null;
            const originalFill = c.fillText.bind(c);
            c.fillText = (text, x, y) => {
                if (collecting) collecting.push({ text, x, y, w: c.measureText(text).width });
                return originalFill(text, x, y);
            };
            const originalRender = bv._render.bind(bv);
            bv._render = () => { collecting = []; const r = originalRender(); window.__paint = collecting; collecting = null; return r; };
        });

        const state = async () => page.evaluate(async () => {
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            const bv = window.bubbleView;
            return {
                hits: bv._hits.map((h) => ({ id: h.id, x: h.x, y: h.y, r: h.r })),
                paint: window.__paint ?? [],
                where: document.querySelector('.bubble-where')?.textContent ?? '',
                crumbs: [...document.querySelectorAll('.bubble-crumb')].map((c) => c.textContent),
                outHidden: document.querySelector('.bubble-up')?.hidden,
            };
        });

        // Start at the top rather than wherever the selection happens to be, so
        // the first assertion is about a known state.
        await page.evaluate(async () => {
            window.bubbleView.path = [];
            window.bubbleView._renderChrome();
            await new Promise((r) => setTimeout(r, 200));
        });

        const top = await state();
        const roots = await page.evaluate(
            () => window.fractalityEngine().nodeGraph.getRootNodes().length);

        if (top.hits.length !== roots) {
            fail(`[${vp.name}] the top level shows ${top.hits.length} bubble(s) for ${roots} root(s)`);
        } else if (top.outHidden !== true) {
            fail(`[${vp.name}] "Out" is offered at the top level, where there is nowhere to go`);
        } else {
            pass(`[${vp.name}] opens on the map's root as a single bubble`);
        }

        // THE design claim: every label sits inside its own circle. Checked against
        // the circle it belongs to, using the widest line — a name that wraps to
        // three lines can fit vertically and still poke out sideways.
        const outside = [];
        for (const hit of top.hits) {
            const lines = top.paint.filter((l) =>
                Math.abs(l.x - hit.x) < hit.r && Math.abs(l.y - hit.y) < hit.r * 1.2);
            for (const line of lines) {
                // Half-width plus the vertical offset must stay inside the circle:
                // that is the chord test, not just "narrower than the diameter".
                const dy = Math.abs(line.y - hit.y);
                const halfChord = Math.sqrt(Math.max(0, hit.r * hit.r - dy * dy));
                if (line.w / 2 > halfChord) {
                    outside.push(`"${line.text}" (${Math.round(line.w / 2)}px past ${Math.round(halfChord)}px)`);
                }
            }
        }
        if (top.paint.length === 0) {
            fail(`[${vp.name}] nothing was written inside the bubbles at all`);
        } else if (outside.length > 0) {
            fail(`[${vp.name}] text spills outside its circle: ${outside.slice(0, 3).join('; ')}`);
        } else {
            pass(`[${vp.name}] every name is written inside its own circle (${top.paint.length} lines)`);
        }

        // Entering shows the children of that bubble and NOTHING else — the whole
        // difference between this view and the cone's "every node on a tier".
        const entered = await page.evaluate(async () => {
            const bv = window.bubbleView;
            const g = window.fractalityEngine().nodeGraph;
            const rootId = bv._hits[0].id;
            const expected = g.getChildren(rootId).map((n) => n.id).sort();
            const rect = bv.canvas.getBoundingClientRect();
            const h = bv._hits[0];
            bv.canvas.dispatchEvent(new PointerEvent('pointerdown', {
                clientX: rect.left + h.x, clientY: rect.top + h.y, bubbles: true }));
            const midway = { transitioning: Boolean(bv._transition) };
            await new Promise((r) => setTimeout(r, 800));
            return { rootId, expected, midway, got: bv._hits.map((x) => x.id).sort() };
        });

        if (!entered.midway.transitioning) {
            fail(`[${vp.name}] entering a bubble did not start a transition`);
        } else if (JSON.stringify(entered.got) !== JSON.stringify(entered.expected)) {
            fail(`[${vp.name}] entering showed ${JSON.stringify(entered.got)}, `
                + `expected exactly the children ${JSON.stringify(entered.expected)}`);
        } else {
            pass(`[${vp.name}] going inside shows that bubble's children and nothing else `
                + `(${entered.expected.length})`);
        }

        const inside = await state();
        if (inside.crumbs.length !== 2 || inside.crumbs[0] !== 'Top') {
            fail(`[${vp.name}] the trail does not name the way back: ${JSON.stringify(inside.crumbs)}`);
        } else if (inside.outHidden !== false) {
            fail(`[${vp.name}] "Out" is hidden one level down`);
        } else {
            pass(`[${vp.name}] the trail names the way back (${JSON.stringify(inside.crumbs)})`);
        }

        // Coming back out returns to what was there before, not to the top.
        const back = await page.evaluate(async () => {
            document.querySelector('.bubble-up').click();
            await new Promise((r) => setTimeout(r, 800));
            return { ids: window.bubbleView._hits.map((h) => h.id).sort(),
                     depth: window.bubbleView.path.length };
        });
        if (back.depth !== 0 || JSON.stringify(back.ids) !== JSON.stringify(top.hits.map((h) => h.id).sort())) {
            fail(`[${vp.name}] coming out landed on ${JSON.stringify(back.ids)} at depth ${back.depth}`);
        } else {
            pass(`[${vp.name}] coming back out returns to where you were`);
        }

        // A bubble containing nothing says so instead of playing the animation and
        // arriving at an empty screen — those two look identical otherwise.
        const leaf = await page.evaluate(async () => {
            const bv = window.bubbleView;
            const g = window.fractalityEngine().nodeGraph;
            const childless = [...g.nodes.values()].find((n) => g.getChildren(n.id).length === 0);
            const accepted = bv.enterBubble(childless.id);
            await new Promise((r) => setTimeout(r, 300));
            const said = [...document.querySelectorAll('.fractality-toast')].map((t) => t.textContent).join(' | ');
            return { accepted, said, depth: bv.path.length };
        });
        if (leaf.accepted !== false || leaf.depth !== 0) {
            fail(`[${vp.name}] entered a bubble with nothing in it`);
        } else if (!/contains nothing/i.test(leaf.said)) {
            fail(`[${vp.name}] refusing an empty bubble said: "${leaf.said}"`);
        } else {
            pass(`[${vp.name}] an empty bubble is refused, and says why`);
        }

        // Reachability, the lesson from the cone view's × being buried under the
        // performance HUD for its whole existence.
        const reach = await page.evaluate(() => {
            const describe = (el) => {
                if (!el) return 'nothing';
                const cls = typeof el.className === 'string' && el.className.trim()
                    ? '.' + el.className.trim().split(/\s+/).join('.') : '';
                return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}`;
            };
            window.bubbleView.path = [window.fractalityEngine().nodeGraph.getRootNodes()[0].id];
            window.bubbleView._renderChrome();
            return ['.bubble-close', '.bubble-up', '.bubble-crumb'].map((sel) => {
                const el = document.querySelector(sel);
                if (!el) return { sel, missing: true };
                const r = el.getBoundingClientRect();
                const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return { sel, covered: !(hit === el || el.contains(hit)), by: describe(hit) };
            });
        });
        const buried = reach.filter((r) => r.missing || r.covered);
        if (buried.length > 0) {
            fail(`[${vp.name}] bubble controls that cannot be pressed: ` + buried
                .map((r) => r.missing ? `${r.sel} missing` : `${r.sel} covered by ${r.by}`).join('; '));
        } else {
            pass(`[${vp.name}] every bubble control can actually be pressed`);
        }

        await ctx.close();
    }

    // Two full-screen views, one at a time. Opening the second on top of the first
    // would leave the first running behind it with its dock entry lit.
    const { ctx, page } = await openApp(VIEWPORTS[2]);
    const exclusive = await page.evaluate(async () => {
        window.coneView.show();
        await new Promise((r) => setTimeout(r, 200));
        const coneFirst = { cone: window.coneView.isOpen, bubble: window.bubbleView.isOpen };
        window.bubbleView.show();
        await new Promise((r) => setTimeout(r, 200));
        const afterBubble = { cone: window.coneView.isOpen, bubble: window.bubbleView.isOpen };
        window.coneView.show();
        await new Promise((r) => setTimeout(r, 200));
        const afterCone = { cone: window.coneView.isOpen, bubble: window.bubbleView.isOpen };
        return { coneFirst, afterBubble, afterCone };
    });
    if (exclusive.afterBubble.cone || exclusive.afterCone.bubble) {
        fail('both full-screen views can be open at once: '
            + JSON.stringify(exclusive));
    } else {
        pass('opening one full-screen view closes the other');
    }

    // The five layouts are gone from the dock; the two views are what is offered.
    const offered = await page.evaluate(async () => {
        const more = [...document.querySelectorAll('.dock-button')].find((b) => /View/i.test(b.textContent));
        more?.click();
        await new Promise((r) => setTimeout(r, 400));
        return [...document.querySelectorAll('.dock-sheet-row')].map((r) => r.textContent.trim());
    });
    const stale = offered.filter((row) => /Golden Spiral|Fibonacci|Fractal Tree|Cosmic Web|Family/i.test(row));
    if (stale.length > 0) {
        fail(`the View sheet still offers retired layouts: ${JSON.stringify(stale)}`);
    } else if (!offered.some((r) => /Bubble/i.test(r)) || !offered.some((r) => /Cone/i.test(r))) {
        fail(`the View sheet does not offer both views: ${JSON.stringify(offered)}`);
    } else {
        pass(`the View sheet offers exactly the two views (${offered.length} rows)`);
    }

    // And the performance HUD is no longer in anybody's face by default.
    const hud = await page.evaluate(
        () => Boolean(window.fractalityEngine()?.dashboard?.config?.visible));
    if (hud) {
        fail('the performance dashboard is still visible by default');
    } else {
        pass('the performance dashboard starts hidden, and is opt-in from More');
    }

    await ctx.close();
}

await browser.close();

console.log('\n' + '='.repeat(62));
console.log(failures === 0 ? 'All browser checks passed.' : `${failures} browser check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
