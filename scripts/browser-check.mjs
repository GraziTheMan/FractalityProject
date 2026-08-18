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
    // The engine boots lazily on the first 3D view.
    await page.evaluate(() => {
        for (const b of document.querySelectorAll('.radial-item')) {
            if (b.innerText.includes('Bubble')) b.click();
        }
    });
    await page.waitForTimeout(2500);
    return { ctx, page, errors };
}

// ---------------------------------------------------------------------------
// 1. Layout: is every control on screen, and is it the topmost thing there?
// ---------------------------------------------------------------------------

console.log('\n--- layout ---------------------------------------------------');

for (const vp of VIEWPORTS) {
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

        const dockButtons = [...document.querySelectorAll('.dock-button')]
            .map((b) => ({ id: b.id, reach: reach(b) }));

        const items = [...document.querySelectorAll('.radial-item')];
        const rects = items.map((el) => ({ label: el.innerText.trim(), r: el.getBoundingClientRect() }));
        const overlaps = [];
        for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
                const a = rects[i].r, b = rects[j].r;
                if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
                    overlaps.push(`${rects[i].label} <-> ${rects[j].label}`);
                }
            }
        }

        return {
            dockButtons,
            dockWidth: Math.round(document.querySelector('#desktop-dock')?.getBoundingClientRect().width ?? 0),
            radialOverlaps: overlaps,
            radialOffscreen: rects
                .filter(({ r }) => r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)
                .map(({ label }) => label),
            radialUnreachable: items.map(reach).filter((s) => s !== 'ok'),
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        };
    });

    console.log(`\n${vp.name} (${vp.width}x${vp.height})`);

    if (report.dockButtons.length === 0) fail('the dock rendered no buttons at all');
    else {
        const bad = report.dockButtons.filter((b) => b.reach !== 'ok');
        if (bad.length) fail(`unreachable dock buttons: ${bad.map((b) => `${b.id} (${b.reach})`).join(', ')}`);
        else pass(`${report.dockButtons.length} dock buttons, all reachable (dock ${report.dockWidth}px wide)`);
    }

    if (report.radialOverlaps.length) fail(`radial items overlap: ${report.radialOverlaps.join(' | ')}`);
    else pass('radial menu items do not overlap');

    if (report.radialOffscreen.length) fail(`radial items off screen: ${report.radialOffscreen.join(', ')}`);
    else pass('radial menu items are all on screen');

    if (report.radialUnreachable.length) fail(`radial items not clickable: ${report.radialUnreachable.join(', ')}`);
    else pass('radial menu items are all clickable');

    if (report.horizontalOverflow) fail('the page scrolls horizontally');
    else pass('no horizontal overflow');

    if (errors.length) fail(`uncaught page errors: ${errors.slice(0, 3).join(' | ')}`);
    else pass('no uncaught page errors');

    await ctx.close();
}

// ---------------------------------------------------------------------------
// 2. Panels on a phone: do they open, fit, and close again?
// ---------------------------------------------------------------------------

console.log('\n--- panels (phone portrait) ----------------------------------');

{
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
        ['Maps', 'open-maps', '.maps-panel'],
        ['Search', 'open-search', '.search-panel'],
    ]) {
        await page.click(`#${id}`);
        await page.waitForTimeout(500);
        const r = await audit(sel);
        if (r.problem) fail(`${name} panel ${r.problem}`);
        else if (r.clipped.length) fail(`${name} panel is clipped: ${r.clipped.join(', ')}`);
        else if (r.unreachable.length) fail(`${name} panel controls unreachable: ${r.unreachable.join('; ')}`);
        else pass(`${name} panel opens at ${r.box} with all controls reachable`);

        // A panel you cannot dismiss covers the canvas forever. On a phone
        // pressing the same button again is the expected gesture, and Escape is
        // not available.
        await page.click(`#${id}`);
        await page.waitForTimeout(400);
        if (await isVisible(sel)) fail(`${name} panel did not close when its dock button was pressed again`);
        else pass(`${name} panel closes on a second press`);
    }

    // The performance overlay must default off on a phone (it is 220x364 of
    // opaque debug output) and its dock button must work both ways.
    const perfVisible = () => isVisible('#perf-dashboard');
    const before = await perfVisible();
    await page.click('#toggle-perf');
    await page.waitForTimeout(300);
    const shown = await perfVisible();
    await page.click('#toggle-perf');
    await page.waitForTimeout(300);
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

console.log('\n--- adaptive quality ----------------------------------------');

{
    const { ctx, page } = await openApp(VIEWPORTS[0]);

    // Set the quality and read the result in ONE evaluate. The adaptive
    // QualityManager calls setQuality() from its own frame loop, so anything
    // awaited in between measures the manager's value rather than ours.
    const setAndRead = (q) => page.evaluate((q) => {
        const r = window.fractalityEngine().renderer;
        if (q !== null) r.setQuality(q);
        return {
            geometry: r.instancedMesh.geometry.type,
            lowPoly: r.lowPolyActive,
            // The mesh must actually be rendering the geometry we just built.
            // It once kept the original while the renderer tracked a new one.
            inSync: r.instancedMesh.geometry === r.nodeGeometry,
        };
    }, q);

    const expect = async (label, q, wantLowPoly) => {
        const r = await setAndRead(q);
        if (r.lowPoly !== wantLowPoly) {
            fail(`${label}: expected lowPoly=${wantLowPoly}, got ${r.lowPoly} (${r.geometry})`);
        } else if (!r.inSync) {
            fail(`${label}: the mesh is rendering a different geometry than the renderer tracks`);
        } else {
            pass(`${label} (${r.geometry})`);
        }
    };

    await expect('starts on full-detail spheres', null, false);
    await expect('quality 0.30 drops to low poly', 0.30, true);
    await expect('quality 0.50 holds low poly (hysteresis)', 0.50, true);
    await expect('quality 0.70 restores spheres', 0.70, false);
    await expect('quality 0.50 holds spheres (hysteresis)', 0.50, false);
    await expect('quality 0.20 drops again', 0.20, true);
    await expect('quality 0.90 restores again', 0.90, false);

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

console.log('\n--- cloud path (API stubbed) ---------------------------------');

{
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

    await page.click('#open-maps');
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

console.log('\n--- CORS vs unreachable -------------------------------------');

for (const scenario of [
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

    await page.click('#open-maps');
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

await browser.close();

console.log('\n' + '='.repeat(62));
console.log(failures === 0 ? 'All browser checks passed.' : `${failures} browser check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
