// End-to-end checks in a real browser. Run: node tools/verify-ui.mjs
// Requires Playwright (globally installed in this environment).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = pathToFileURL(path.join(here, '..', 'index.html')).href;
const SHOTS = path.join(here, '..', '.shots');

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { failures.push(name); console.log('  FAIL  ' + name + (detail ? ' -> ' + detail : '')); }
}
const section = (t) => console.log('\n' + t);

const snap = (page) => page.evaluate(() => {
  const g = window.FORGE.app.game;
  return {
    strikes: g.strikes.slice(), current: g.current, total: g.totalStrikes, status: g.status,
    pieces: g.board.pieces.join(''), route: g.board.route.slice(), size: g.board.size,
    busy: window.FORGE.app.busy
  };
});
const settle = (page) => page.waitForFunction(() => !window.FORGE.app.busy, null, { timeout: 5000 });
const fast = (page, ms) => page.evaluate((m) => { window.FORGE.core.CONFIG.animation.strikeMs = m; }, ms);

async function run() {
  if (fs.existsSync(SHOTS)) fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

  /* ============ narrow phone, default difficulty ============ */
  let ctx = await browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 2 });
  let page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(FILE);
  await page.waitForFunction(() => window.FORGE && window.FORGE.app.game);

  section('Boot and layout (320px wide)');
  ok('opening instruction is shown', (await page.textContent('#promptText')).trim() === 'Choose any square to begin.');
  ok('novice board has 9 tiles', (await page.locator('.tile').count()) === 9);
  ok('no horizontal scrolling',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  await page.click('[data-diff="master"]');
  await page.waitForFunction(() => window.FORGE.app.game && window.FORGE.app.game.board.size === 6);
  const tileBox = await page.locator('.tile').first().boundingBox();
  ok('master tiles are at least 44 CSS px (' + tileBox.width.toFixed(1) + 'px)', tileBox.width >= 44);
  ok('master board still fits without horizontal scroll',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok('master board has 36 tiles', (await page.locator('.tile').count()) === 36);
  await page.screenshot({ path: path.join(SHOTS, '01-master-320.png'), fullPage: true });

  section('Difficulty levels');
  for (const [key, size] of [['novice', 3], ['apprentice', 4], ['journeyman', 5], ['master', 6]]) {
    await page.click(`[data-diff="${key}"]`);
    await page.waitForFunction((s) => window.FORGE.app.game && window.FORGE.app.game.board.size === s, size);
    const n = await page.locator('.tile').count();
    const pressed = await page.getAttribute(`[data-diff="${key}"]`, 'aria-pressed');
    ok(`${key} loads a ${size}x${size} board and marks its button`, n === size * size && pressed === 'true');
  }

  /* ============ striking ============ */
  section('Striking');
  await page.click('[data-diff="journeyman"]');
  await page.waitForFunction(() => window.FORGE.app.game && window.FORGE.app.game.board.size === 5);
  await page.click('.tile[data-i="12"]');
  ok('a hammer appears during the swing', (await page.locator('.hammer').count()) > 0);
  await page.screenshot({ path: path.join(SHOTS, '02-hammer-midswing.png') });
  await settle(page);
  let s = await snap(page);
  ok('one tap applies exactly one strike', s.total === 1 && s.strikes[12] === 1 && s.current === 12);
  ok('struck square renders the shaped state', (await page.getAttribute('.tile[data-i="12"]', 'data-s')) === '1');
  ok('current square is marked', (await page.getAttribute('.tile[data-i="12"]', 'data-current')) === '1');
  ok('legal destinations are marked', (await page.locator('.tile[data-legal="1"]').count()) > 0);
  ok('movement hint names the piece', /King|Rook|Bishop|Knight|Queen/.test(await page.textContent('#promptText')));
  await page.waitForTimeout(900);   // let the recoil and sparks finish
  ok('hammer and sparks are cleaned up once the swing ends', await page.evaluate(
    () => document.getElementById('fx').childElementCount === 0));
  ok('overlay never intercepts taps',
    await page.evaluate(() => getComputedStyle(document.getElementById('fx')).pointerEvents === 'none'));

  section('Illegal taps');
  const before = await snap(page);
  await page.click('.tile[data-i="12"]');            // standing still
  await page.waitForTimeout(120);
  let after = await snap(page);
  ok('tapping the current square changes nothing',
    after.total === before.total && after.strikes.join() === before.strikes.join());
  const illegal = await page.evaluate(() => {
    const legal = new Set(window.FORGE.core.legalTargets(window.FORGE.app.game));
    for (let i = 0; i < 25; i++) if (i !== window.FORGE.app.game.current && !legal.has(i)) return i;
    return -1;
  });
  await page.click(`.tile[data-i="${illegal}"]`);
  await page.waitForTimeout(150);
  after = await snap(page);
  ok('an illegal destination changes nothing',
    after.total === before.total && after.strikes.join() === before.strikes.join());
  ok('an illegal tap starts no hammer', (await page.locator('.hammer').count()) === 0);

  section('Rapid tapping');
  await fast(page, 260);
  const target = await page.evaluate(() => window.FORGE.core.legalTargets(window.FORGE.app.game)[0]);
  const t0 = await snap(page);
  await page.evaluate((t) => {
    const el = document.querySelector(`.tile[data-i="${t}"]`);
    for (let i = 0; i < 8; i++) el.click();
  }, target);
  await settle(page);
  await page.waitForTimeout(120);
  const t1 = await snap(page);
  ok('eight rapid taps on one square produce exactly one strike', t1.total === t0.total + 1,
    `total went ${t0.total} -> ${t1.total}`);

  section('Reset during an animation');
  const legalNow = await page.evaluate(() => window.FORGE.core.legalTargets(window.FORGE.app.game)[0]);
  await page.evaluate((t) => { document.querySelector(`.tile[data-i="${t}"]`).click(); }, legalNow);
  await page.evaluate(() => { document.getElementById('restartBtn').click(); });
  await page.evaluate(() => { const y = document.getElementById('confirmYes'); if (!document.getElementById('confirm').hidden) y.click(); });
  await page.waitForTimeout(500);
  const afterReset = await snap(page);
  ok('a strike mid-animation cannot touch the restarted game',
    afterReset.total === 0 && afterReset.strikes.every((x) => x === 0) && afterReset.current === -1);
  ok('restart keeps the same arrangement', afterReset.pieces === before.pieces);

  /* ============ full verified route through the UI ============ */
  section('Playing a verified route through the interface');
  await page.click('[data-diff="apprentice"]');
  await page.waitForFunction(() => window.FORGE.app.game && window.FORGE.app.game.board.size === 4);
  await fast(page, 40);
  let st = await snap(page);
  for (const step of st.route) {
    await page.evaluate((i) => { document.querySelector(`.tile[data-i="${i}"]`).click(); }, step);
    await settle(page);
  }
  await page.waitForTimeout(200);
  st = await snap(page);
  ok('route finishes with every square at exactly two strikes',
    st.status === 'complete' && st.strikes.every((x) => x === 2) && st.total === 32);
  ok('results screen appears', await page.isVisible('#results'));
  ok('quality is 100', (await page.textContent('#rQuality')).startsWith('100'));
  ok('label reads Masterwork', (await page.textContent('#rLabel')).trim() === 'Masterwork');
  ok('perfect squares reported as 16 / 16', (await page.textContent('#rPerfect')).trim() === '16 / 16');
  ok('overstrikes reported as 0', (await page.textContent('#rOver')).trim() === '0');
  ok('board is frozen after completion', (await page.getAttribute('#board', 'data-frozen')) === '1');
  await page.screenshot({ path: path.join(SHOTS, '03-masterwork.png'), fullPage: true });

  const frozen = await snap(page);
  await page.evaluate(() => { document.querySelector('.tile[data-i="0"]').click(); });
  await page.waitForTimeout(150);
  ok('taps after completion change nothing', (await snap(page)).total === frozen.total);

  section('Best score memory');
  ok('best quality stored for apprentice', await page.evaluate(
    () => (JSON.parse(localStorage.getItem('forge-pattern:v1')).best || {}).apprentice === 100));
  await page.click('#rRetry');
  await page.waitForTimeout(200);
  ok('retry restarts the same board cold', (await snap(page)).total === 0);
  ok('best line survives a reload', await (async () => {
    await page.reload();
    await page.waitForFunction(() => window.FORGE && window.FORGE.app.game);
    await page.click('[data-diff="apprentice"]');
    await page.waitForTimeout(250);
    return (await page.textContent('#bestLine')).includes('100');
  })());

  /* ============ overstrikes and damaged states ============ */
  section('Damage, overstrikes and scoring on screen');
  await page.click('[data-diff="novice"]');
  await page.waitForFunction(() => window.FORGE.app.game && window.FORGE.app.game.board.size === 3);
  await fast(page, 40);
  // drive an overstruck finish: walk the route but repeat one square first
  await page.evaluate(async () => {
    const F = window.FORGE;
    const wait = () => new Promise((r) => {
      const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 10);
    });
    const click = async (i) => { document.querySelector(`.tile[data-i="${i}"]`).click(); await wait(); };
    const route = F.app.game.board.route.slice();
    await click(route[0]);
    await click(route[1]);
    await click(route[0]);      // detour: third strike on the opener
    let cur = route[0];
    // now finish by following the stored route from its first occurrence
    for (let k = 1; k < route.length; k++) {
      if (F.app.game.status === 'complete') break;
      const nxt = route[k];
      if (F.core.canStrike(F.app.game, nxt)) { await click(nxt); cur = nxt; }
    }
    // mop up anything still cold with a greedy walk
    let guard = 0;
    while (F.app.game.status !== 'complete' && guard++ < 400) {
      const g = F.app.game;
      const targets = F.core.legalTargets(g);
      let best = targets[0], bestS = 99;
      for (const t of targets) if (g.strikes[t] < bestS) { bestS = g.strikes[t]; best = t; }
      await click(best);
      void cur;
    }
  });
  await page.waitForTimeout(300);
  const dmg = await snap(page);
  ok('overstruck game still completes', dmg.status === 'complete' && dmg.strikes.every((x) => x >= 2));
  const shownOver = Number(await page.textContent('#rOver'));
  const realOver = dmg.strikes.reduce((a, b) => a + Math.max(0, b - 2), 0);
  ok('reported overstrikes match the board (' + realOver + ')', shownOver === realOver);
  const q = Number((await page.textContent('#rQuality')).replace(/\D+/g, '').slice(0, 3));
  ok('quality matches the documented formula',
    q === Math.max(0, Math.round(100 * (1 - realOver / (2 * 9)))), 'shown ' + q);
  ok('damaged squares show their real strike count',
    await page.evaluate(() => {
      const g = window.FORGE.app.game;
      for (let i = 0; i < g.strikes.length; i++) {
        const el = document.querySelector(`.tile[data-i="${i}"]`);
        if (g.strikes[i] >= 3) {
          const badge = el.querySelector('.count');
          if (!badge || badge.textContent !== String(g.strikes[i])) return false;
          if (el.dataset.s !== '3') return false;
        }
      }
      return true;
    }));
  await page.screenshot({ path: path.join(SHOTS, '04-damaged-result.png'), fullPage: true });

  /* ============ audio and preferences ============ */
  section('Audio');
  await page.click('#rNew');
  await page.waitForTimeout(300);
  const audio = await page.evaluate(() => ({ dead: window.FORGE.sound.dead, has: !!window.FORGE.sound.ctx, state: window.FORGE.sound.ctx && window.FORGE.sound.ctx.state }));
  ok('an audio context was created after a gesture', audio.has && !audio.dead, JSON.stringify(audio));
  ok('audio graph produces no errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.click('#muteBtn');
  ok('mute toggles aria-pressed', (await page.getAttribute('#muteBtn', 'aria-pressed')) === 'true');
  ok('mute is remembered', await page.evaluate(() => JSON.parse(localStorage.getItem('forge-pattern:v1')).muted === true));
  const mutedPlay = await page.evaluate(() => {
    try { window.FORGE.app.game && document.querySelector('.tile[data-i="0"]').click(); return true; } catch (e) { return String(e); }
  });
  ok('play continues while muted', mutedPlay === true);
  await settle(page);
  await page.click('#muteBtn');
  await page.evaluate(() => { const v = document.getElementById('volume'); v.value = '30'; v.dispatchEvent(new Event('input', { bubbles: true })); });
  ok('volume is remembered', await page.evaluate(
    () => Math.abs(JSON.parse(localStorage.getItem('forge-pattern:v1')).volume - 0.3) < 0.001));

  section('Accessibility');
  const label = await page.getAttribute('.tile[data-i="0"]', 'aria-label');
  ok('tiles are named with position, piece, strikes and reachability',
    /row 1, column 1, (King|Rook|Bishop|Knight|Queen), \d+ strikes?, /.test(label) &&
    /(legal|not reachable|hammer is here)/.test(label), label);
  ok('progress is exposed as a live region',
    await page.evaluate(() => document.getElementById('live').getAttribute('aria-live') === 'polite'));
  await page.keyboard.press('Tab');
  const keyed = await page.evaluate(() => {
    const t = document.querySelector('.tile[data-i="4"]');
    t.focus();
    return document.activeElement === t;
  });
  ok('tiles are focusable', keyed);
  await page.keyboard.press('ArrowRight');
  ok('arrow keys move focus across the board',
    await page.evaluate(() => document.activeElement.dataset.i === '5'));
  const kbTarget = await page.evaluate(() => window.FORGE.core.legalTargets(window.FORGE.app.game)[0]);
  await page.evaluate((i) => document.querySelector(`.tile[data-i="${i}"]`).focus(), kbTarget);
  const kbBefore = await snap(page);
  await page.keyboard.press('Enter');
  await settle(page);
  const kbAfter = await snap(page);
  ok('Enter strikes the focused square',
    kbAfter.total === kbBefore.total + 1 && kbAfter.current === kbTarget,
    `total ${kbBefore.total} -> ${kbAfter.total}`);

  section('Guard rails');
  await page.evaluate(() => document.getElementById('newBtn').click());
  ok('changing puzzle mid-run asks first', await page.isVisible('#confirm'));
  await page.click('#confirmNo');
  ok('declining keeps the run', (await snap(page)).total > 0 && await page.isHidden('#confirm'));
  await page.evaluate(() => document.querySelector('[data-diff="master"]').click());
  ok('changing difficulty mid-run asks first', await page.isVisible('#confirm'));
  await page.click('#confirmYes');
  await page.waitForFunction(() => window.FORGE.app.game && window.FORGE.app.game.board.size === 6, null, { timeout: 5000 });
  ok('accepting switches difficulty', (await snap(page)).size === 6);
  await page.click('#helpBtn');
  ok('how to play opens', await page.isVisible('#help'));
  await page.keyboard.press('Escape');
  ok('escape closes how to play', await page.isHidden('#help'));

  section('Page hidden mid-swing');
  await fast(page, 900);
  const hidBefore = await snap(page);
  const hidTarget = await page.evaluate(() => window.FORGE.core.legalTargets(window.FORGE.app.game)[0]);
  await page.evaluate((t) => { document.querySelector(`.tile[data-i="${t}"]`).click(); }, hidTarget);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const hidAfter = await snap(page);
  ok('a pending strike is applied exactly once when the page hides',
    hidAfter.total === hidBefore.total + 1 && hidAfter.strikes[hidTarget] === hidBefore.strikes[hidTarget] + 1,
    `${hidBefore.total} -> ${hidAfter.total}`);
  ok('effects are cleared when hidden',
    await page.evaluate(() => document.getElementById('fx').childElementCount === 0));

  ok('no uncaught page errors during the whole run', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();

  /* ============ storage unavailable ============ */
  section('Storage unavailable');
  ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  page = await ctx.newPage();
  const errs2 = [];
  page.on('pageerror', (e) => errs2.push(String(e)));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage blocked'); }
    });
  });
  await page.goto(FILE);
  await page.waitForFunction(() => window.FORGE && window.FORGE.app.game, null, { timeout: 5000 });
  await page.evaluate(() => { window.FORGE.core.CONFIG.animation.strikeMs = 40; });
  await page.click('.tile[data-i="0"]');
  await settle(page);
  ok('the game boots and plays with localStorage blocked', (await snap(page)).total === 1);
  ok('no errors escape the storage wrapper', errs2.length === 0, errs2.slice(0, 2).join(' | '));
  await ctx.close();

  /* ============ reduced motion ============ */
  section('Reduced motion');
  ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce' });
  page = await ctx.newPage();
  const errs3 = [];
  page.on('pageerror', (e) => errs3.push(String(e)));
  await page.goto(FILE);
  await page.waitForFunction(() => window.FORGE && window.FORGE.app.game);
  ok('reduced motion is detected', await page.evaluate(() => window.FORGE.fx.reduced === true));
  await page.click('.tile[data-i="4"]');
  const shaking = await page.evaluate(() => document.querySelectorAll('.tile.impact, .tile.shake').length);
  await settle(page);
  ok('no shake or squash classes are applied', shaking === 0);
  ok('no spark particles are emitted', await page.evaluate(() => document.querySelectorAll('.spark').length) === 0);
  ok('a strike still registers under reduced motion', (await snap(page)).total === 1);
  ok('reduced-motion run is error free', errs3.length === 0, errs3.join(' | '));
  await page.screenshot({ path: path.join(SHOTS, '05-reduced-motion.png'), fullPage: true });
  await ctx.close();

  /* ============ wide screen ============ */
  section('Larger screens');
  ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  page = await ctx.newPage();
  await page.goto(FILE);
  await page.waitForFunction(() => window.FORGE && window.FORGE.app.game);
  await page.click('[data-diff="master"]');
  await page.waitForFunction(() => window.FORGE.app.game && window.FORGE.app.game.board.size === 6);
  const wide = await page.locator('.board-wrap').boundingBox();
  ok('layout stays centred and capped on desktop (' + Math.round(wide.width) + 'px)', wide.width <= 520);
  await page.screenshot({ path: path.join(SHOTS, '06-desktop.png') });
  await ctx.close();

  await browser.close();
  console.log('\n' + (failures.length ? 'FAILED: ' + failures.join('; ') : 'All browser checks passed') +
    ' (' + pass + ' checks)');
  process.exit(failures.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
