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

    // Tapping a node. Sweeping with the engine's own raycaster is retried
    // because the sweep can legitimately land mid-layout and find nothing.
    let tapped = null;
    for (let attempt = 1; attempt <= 6 && !tapped; attempt++) {
        const target = await page.evaluate(() => {
            const eng = window.fractalityEngine?.();
            const mesh = eng?.renderer?.instancedMesh;
            if (!mesh) return null;
            for (let y = 0.1; y < 0.9; y += 0.008) {
                for (let x = 0.1; x < 0.9; x += 0.008) {
                    eng.mouse.set(x * 2 - 1, -(y * 2 - 1));
                    eng.raycaster.setFromCamera(eng.mouse, eng.renderer.camera);
                    if (eng.raycaster.intersectObject(mesh).length > 0) {
                        return { x: Math.round(x * innerWidth), y: Math.round(y * innerHeight) };
                    }
                }
            }
            return null;
        });
        if (!target) { await page.waitForTimeout(700); continue; }
        await page.touchscreen.tap(target.x, target.y);
        await page.waitForTimeout(900);
        if (await page.evaluate(() => window.fractalityEngine()?.nodeInfo?.isVisible)) {
            tapped = { ...target, attempt };
        } else {
            await page.waitForTimeout(500);
        }
    }

    if (!tapped) fail('tapping a node never showed the info panel');
    else {
        pass(`tapping a node shows its info panel (attempt ${tapped.attempt})`);

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

    // Each layout row must actually change the engine's layout — the specific
    // failure being guarded against is a menu entry that only narrates itself.
    const layoutIds = inventory.filter((e) => e.id?.startsWith('layout-')).map((e) => e.id);
    if (layoutIds.length < 2) fail(`expected several layout options, found ${layoutIds.length}`);
    else {
        const results = [];
        for (const rowId of layoutIds) {
            const wanted = rowId.replace('layout-', '');
            await page.click('#app-dock [data-dock-id="view"]');
            await page.waitForTimeout(200);
            await page.click(`.dock-sheet-row[data-dock-id="${rowId}"]`);
            await page.waitForTimeout(300);
            const actual = await page.evaluate(() => window.fractalityEngine().getLayout());
            results.push({ wanted, actual });
        }
        const wrong = results.filter((r) => r.wanted !== r.actual);
        if (wrong.length) {
            fail(`layout rows that did not take effect: ${wrong.map((r) => `${r.wanted} -> ${r.actual}`).join(', ')}`);
        } else {
            pass(`all ${results.length} layout options change the engine's layout`);
        }
    }

    // The active row has to reflect the current layout, or the menu is lying
    // about state even while the action works.
    await page.click('#app-dock [data-dock-id="view"]');
    await page.waitForTimeout(250);
    const activeRows = await page.evaluate(() => ({
        active: [...document.querySelectorAll('.dock-sheet-row.active')].map((r) => r.dataset.dockId),
        engine: window.fractalityEngine().getLayout(),
    }));
    if (activeRows.active.length !== 1 || activeRows.active[0] !== `layout-${activeRows.engine}`) {
        fail(`the active row (${activeRows.active.join(',') || 'none'}) does not match the engine (${activeRows.engine})`);
    } else {
        pass('the active row matches the engine\'s current layout');
    }

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

    // Closing must hand the 3D view back.
    await page.click('.cone-close');
    await page.waitForTimeout(400);
    const closed = await state();
    if (closed.open) fail('the cone view did not close');
    else if (closed.enginePaused) fail('the 3D engine is left paused after the cone closes');
    else pass('closing the cone view resumes the 3D engine');

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
        window.__pwned = null;

        let pulses = [
            {
                id: 'p1', title: 'Recursion from the inside',
                preview: 'Consciousness may be what recursion feels like from the inside.',
                author: { id: 'u2', name: 'Ada' }, tags: ['consciousness'],
                media: null, visibility: 'public', timestamp: Date.now() - 3600e3,
                resonance: 0.5, resonators: 5, resonated: false, own: false,
            },
            {
                id: 'p2', title: 'A link post', preview: '',
                author: { id: 'u3', name: 'Bo' }, tags: ['links'],
                media: { kind: 'link', url: 'https://example.com/thing?a=1&b=2', title: 'example.com' },
                visibility: 'public', timestamp: Date.now() - 7200e3,
                resonance: 0, resonators: 0, resonated: false, own: false,
            },
            {
                id: 'p3', title: 'Mine', preview: 'my own post',
                author: { id: 'u1', name: 'Nick' }, tags: [],
                media: null, visibility: 'public', timestamp: Date.now() - 60e3,
                resonance: 0, resonators: 0, resonated: false, own: true,
            },
            {
                // Hostile on every field that reaches the DOM.
                id: 'p4', title: '<img src=x onerror="window.__pwned=1">',
                preview: '<script>window.__pwned=2<\/script>',
                author: { id: 'u4', name: '<b>Evil</b>' }, tags: ['x'],
                media: { kind: 'link', url: 'javascript:window.__pwned=3', title: 'click me' },
                visibility: 'public', timestamp: Date.now(),
                resonance: 0, resonators: 0, resonated: false, own: false,
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
                    timestamp: Date.now(), resonance: 0, resonators: 0,
                    resonated: false, own: true,
                }, ...pulses];
                return json(pulses[0], 201);
            }
            if (method === 'PUT' && u.includes('/resonance')) {
                const id = u.split('/')[2];
                const on = u.includes('on=true');
                const target = pulses.find((x) => x.id === id);
                target.resonated = on;
                target.resonators += on ? 1 : -1;
                return json(target);
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

    // --- resonance comes from the server, not a local guess
    const before = await page.evaluate(() =>
        document.querySelector('.pulsefeed-resonate').textContent);
    await page.click('.pulsefeed-resonate');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() =>
        document.querySelector('.pulsefeed-resonate').textContent);
    if (before === after) fail(`resonating did not change the count (${before})`);
    else pass(`resonating updates the count from the server (${before} -> ${after})`);

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
            if (u === '/me') return json({ id: 'u1', display_name: 'Me' });
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
    } else {
        pass(`visibility cycles private -> ${visibility.patched[0].visibility} ("${visibility.before}" -> "${visibility.after}")`);
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
    if (toPublic[0]?.visibility !== 'public') {
        fail(`unlisted should step to public, got ${toPublic[0]?.visibility}`);
    } else {
        pass('a map can be made public');
    }

    await ctx.close();
}

await browser.close();

console.log('\n' + '='.repeat(62));
console.log(failures === 0 ? 'All browser checks passed.' : `${failures} browser check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
