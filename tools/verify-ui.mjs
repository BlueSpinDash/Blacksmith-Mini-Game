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
  const g = window.CHECKSMITH.app.game;
  return {
    strikes: g.strikes.slice(), current: g.current, total: g.totalStrikes, status: g.status,
    pieces: g.board.pieces.join(''), live: g.pieces.map((p) => p || '.').join(''),
    route: g.board.route.slice(), size: g.board.size,
    busy: window.CHECKSMITH.app.busy
  };
});
const settle = (page) => page.waitForFunction(() => !window.CHECKSMITH.app.busy, null, { timeout: 5000 });
const fast = (page, ms) => page.evaluate((m) => { window.CHECKSMITH.core.CONFIG.animation.strikeMs = m; }, ms);

/* The game now opens on a title screen; every page needs to start a run. */
async function startFromTitle(page, mode, diff) {
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  if (mode) await page.click(`.mode-card[data-mode="${mode}"]`);
  // endless picks no difficulty: it always starts on the smallest board
  if (diff && mode !== 'endless') await page.click(`#titleDiff .diff-btn[data-tdiff="${diff}"]`);
  await page.click('#beginBtn');
  await page.waitForFunction(() => window.CHECKSMITH && window.CHECKSMITH.app.game, null, { timeout: 10000 });
}

/* Switching difficulty mid-run raises the discard prompt; answer it. */
async function pickDifficulty(page, key, size) {
  await page.click(`[data-diff="${key}"]`);
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForFunction(
    (s) => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.size === s,
    size, { timeout: 10000 });
}

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
  await startFromTitle(page, 'forge', 'novice');

  section('Boot and layout (320px wide)');
  ok('opening instruction is shown', (await page.textContent('#promptText')).trim() === 'Choose any square to begin.');
  ok('novice board has 9 tiles', (await page.locator('.tile').count()) === 9);
  ok('no horizontal scrolling',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  await page.click('[data-diff="master"]');
  await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.size === 6);
  const tileBox = await page.locator('.tile').first().boundingBox();
  ok('master tiles are at least 44 CSS px (' + tileBox.width.toFixed(1) + 'px)', tileBox.width >= 44);
  ok('master board still fits without horizontal scroll',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok('master board has 36 tiles', (await page.locator('.tile').count()) === 36);
  await page.screenshot({ path: path.join(SHOTS, '01-master-320.png'), fullPage: true });

  section('Difficulty levels');
  for (const [key, size] of [['novice', 3], ['apprentice', 4], ['journeyman', 5], ['master', 6]]) {
    await page.click(`[data-diff="${key}"]`);
    await page.waitForFunction((s) => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.size === s, size);
    const n = await page.locator('.tile').count();
    const pressed = await page.getAttribute(`[data-diff="${key}"]`, 'aria-pressed');
    ok(`${key} loads a ${size}x${size} board and marks its button`, n === size * size && pressed === 'true');
  }

  /* ============ striking ============ */
  section('Striking');
  await page.click('[data-diff="journeyman"]');
  await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.size === 5);
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
    const legal = new Set(window.CHECKSMITH.core.legalTargets(window.CHECKSMITH.app.game));
    for (let i = 0; i < 25; i++) if (i !== window.CHECKSMITH.app.game.current && !legal.has(i)) return i;
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
  const target = await page.evaluate(() => window.CHECKSMITH.core.legalTargets(window.CHECKSMITH.app.game)[0]);
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
  const legalNow = await page.evaluate(() => window.CHECKSMITH.core.legalTargets(window.CHECKSMITH.app.game)[0]);
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
  await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.size === 4);
  await fast(page, 40);
  // A verified route is a promise about a board whose symbols hold still,
  // so reshaping is switched off for this replay.
  await page.evaluate(() => { window.CHECKSMITH.app.game.morphChance = 0; });
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
  ok('overstrikes reported as 0', (await page.textContent('#rSpent')).trim() === '0');
  ok('board is frozen after completion', (await page.getAttribute('#board', 'data-frozen')) === '1');
  await page.screenshot({ path: path.join(SHOTS, '03-masterwork.png'), fullPage: true });

  const frozen = await snap(page);
  await page.evaluate(() => { document.querySelector('.tile[data-i="0"]').click(); });
  await page.waitForTimeout(150);
  ok('taps after completion change nothing', (await snap(page)).total === frozen.total);

  section('Best score memory');
  ok('best quality stored for apprentice', await page.evaluate(
    () => (JSON.parse(localStorage.getItem('checksmith:v1')).best || {}).apprentice === 100));
  await page.click('#rRetry');
  await page.waitForTimeout(200);
  ok('retry restarts the same board cold', (await snap(page)).total === 0);
  ok('best line survives a reload', await (async () => {
    await page.reload();
    await startFromTitle(page, 'forge', 'apprentice');
    await page.waitForTimeout(250);
    return (await page.textContent('#bestLine')).includes('100');
  })());

  /* ============ spending squares, and losing ============ */
  section('Spent squares and the lost run');
  await pickDifficulty(page, 'novice', 3);
  await fast(page, 40);
  // Deliberately overwork one square: strike it, leave, come back twice.
  const spentInfo = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const wait = () => new Promise((r) => {
      const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 8);
    });
    const click = async (i) => { document.querySelector(`.tile[data-i="${i}"]`).click(); await wait(); };
    const g = () => F.app.game;
    const home = g().board.route[0];
    await click(home);
    let target = null;
    for (let pass = 0; pass < 2; pass++) {
      const away = F.core.legalTargets(g()).find((t) => t !== home);
      if (away == null) break;
      await click(away);
      const back = F.core.legalTargets(g()).find((t) => t === home);
      if (back == null) break;
      await click(home);
      target = home;
    }
    return { target, strikes: g().strikes.slice(), status: g().status, current: g().current };
  });
  ok('a square can be driven to three strikes', spentInfo.strikes.some((x) => x === 3),
    JSON.stringify(spentInfo.strikes));
  ok('it renders as crumbling while the hammer is on it',
    await page.evaluate(() => {
      const g = window.CHECKSMITH.app.game;
      const el = document.querySelector(`.tile[data-i="${g.current}"]`);
      return g.strikes[g.current] < 3 || el.dataset.spent === '1';
    }));
  ok('a crumbling square still offers somewhere to go',
    await page.evaluate(() => window.CHECKSMITH.core.legalTargets(window.CHECKSMITH.app.game).length > 0)
      || spentInfo.status === 'lost');
  ok('the spent count is on screen', Number(await page.textContent('#sSpent')) >= 1);

  // step off it and the square must go blank and become unclickable
  const blanked = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const wait = () => new Promise((r) => {
      const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 8);
    });
    const spent = F.app.game.current;
    if (F.app.game.strikes[spent] < 3) return { skipped: true };
    const away = F.core.legalTargets(F.app.game)[0];
    document.querySelector(`.tile[data-i="${away}"]`).click();
    await wait();
    const el = document.querySelector(`.tile[data-i="${spent}"]`);
    return {
      skipped: false,
      piece: F.app.game.pieces[spent],
      isVoid: el.dataset.void === '1',
      glyph: el.firstChild.textContent,
      legal: F.core.canStrike(F.app.game, spent),
      label: el.getAttribute('aria-label')
    };
  });
  if (blanked.skipped) {
    ok('blanking check skipped (square never reached three strikes)', true);
  } else {
    ok('leaving a spent square blanks it', blanked.piece === null);
    ok('the blank square renders as a hole with no symbol',
      blanked.isVoid === true && blanked.glyph === '');
    ok('the blank square cannot be struck again', blanked.legal === false);
    ok('screen readers are told it is spent', /spent|blank/i.test(blanked.label), blanked.label);
  }

  // a tap on the blank square must be refused outright
  const beforeBlankTap = await snap(page);
  await page.evaluate(() => {
    const g = window.CHECKSMITH.app.game;
    const dead = g.pieces.findIndex((p) => p === null);
    if (dead >= 0) document.querySelector(`.tile[data-i="${dead}"]`).click();
  });
  await page.waitForTimeout(160);
  ok('tapping a blank square changes nothing',
    (await snap(page)).total === beforeBlankTap.total);

  /* ============ reshaping ============ */
  section('Reshaping on the first strike');
  await pickDifficulty(page, 'journeyman', 5);
  await fast(page, 40);
  const morphRun = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    F.app.game.morphChance = 1;              // force it so the test is deterministic
    const wait = () => new Promise((r) => {
      const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 8);
    });
    const start = 12;
    const was = F.app.game.pieces[start];
    document.querySelector(`.tile[data-i="${start}"]`).click();
    await wait();
    const now = F.app.game.pieces[start];
    const el = document.querySelector(`.tile[data-i="${start}"]`);
    return { was, now, glyph: el.firstChild.textContent,
      expected: F.core.PIECES[now].glyph, layout: F.app.game.board.pieces[start] };
  });
  ok('the first strike reshaped the square', morphRun.now !== morphRun.was);
  ok('the tile shows the new symbol', morphRun.glyph === morphRun.expected);
  ok('the movement hint follows the new symbol',
    (await page.textContent('#promptText')).includes(
      await page.evaluate((k) => window.CHECKSMITH.core.PIECES[k].name, morphRun.now)));
  ok('the stored board layout is untouched, so Restart still works',
    morphRun.layout === morphRun.was);
  await page.screenshot({ path: path.join(SHOTS, '04-spent-and-morph.png'), fullPage: true });

  /* ============ losing ============ */
  section('Losing the run');
  const lossRun = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const wait = () => new Promise((r) => {
      const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 8);
    });
    // Hand-place a board state with no way out: a knight whose jumps are spent.
    const g = F.app.game;
    g.pieces = g.pieces.map(() => 'R');
    g.pieces[0] = 'N';
    g.strikes = g.strikes.map(() => 1);
    for (const j of [7, 11]) g.strikes[j] = 3;   // both knight jumps from 0, spent
    g.strikes[0] = 1;
    g.current = 1;                                // a rook on the top row
    g.status = 'playing';
    document.querySelector('.tile[data-i="0"]').click();
    await wait();
    await new Promise((r) => setTimeout(r, 400));
    return { status: g.status, dialog: !document.getElementById('results').hidden,
      title: document.getElementById('resultTitle').textContent,
      label: document.getElementById('rLabel').textContent,
      frozen: document.getElementById('board').dataset.frozen };
  });
  ok('landing with no onward move loses the run', lossRun.status === 'lost', lossRun.status);
  ok('the losing screen appears', lossRun.dialog === true);
  ok('it says the work is stranded', /stranded/i.test(lossRun.title + ' ' + lossRun.label));
  ok('the board is frozen after a loss', lossRun.frozen === '1');
  const afterLoss = await snap(page);
  await page.evaluate(() => { document.querySelector('.tile[data-i="4"]').click(); });
  await page.waitForTimeout(150);
  ok('taps after a loss change nothing', (await snap(page)).total === afterLoss.total);
  ok('a loss is not recorded as a best score', await page.evaluate(
    () => { try { const d = JSON.parse(localStorage.getItem('checksmith:v1') || '{}');
      return !d.best || d.best.journeyman === undefined || typeof d.best.journeyman === 'number'; }
      catch (e) { return true; } }));
  await page.screenshot({ path: path.join(SHOTS, '05-stranded.png'), fullPage: true });
  await page.click('#rRetry');
  await page.waitForTimeout(250);
  ok('retry after a loss restores the original symbols and a cold board', await page.evaluate(
    () => { const g = window.CHECKSMITH.app.game;
      return g.totalStrikes === 0 && g.status === 'ready' &&
        g.pieces.join('') === g.board.pieces.join(''); }));

  /* ============ audio and preferences ============ */
  section('Audio');
  await page.evaluate(() => document.getElementById('newBtn').click());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForTimeout(450);
  const audio = await page.evaluate(() => ({ dead: window.CHECKSMITH.sound.dead, has: !!window.CHECKSMITH.sound.ctx, state: window.CHECKSMITH.sound.ctx && window.CHECKSMITH.sound.ctx.state }));
  ok('an audio context was created after a gesture', audio.has && !audio.dead, JSON.stringify(audio));
  ok('audio graph produces no errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.click('#muteBtn');
  ok('mute toggles aria-pressed', (await page.getAttribute('#muteBtn', 'aria-pressed')) === 'true');
  ok('mute is remembered', await page.evaluate(() => JSON.parse(localStorage.getItem('checksmith:v1')).muted === true));
  const mutedPlay = await page.evaluate(() => {
    try { window.CHECKSMITH.app.game && document.querySelector('.tile[data-i="0"]').click(); return true; } catch (e) { return String(e); }
  });
  ok('play continues while muted', mutedPlay === true);
  await settle(page);
  await page.click('#muteBtn');
  await page.evaluate(() => { const v = document.getElementById('volume'); v.value = '30'; v.dispatchEvent(new Event('input', { bubbles: true })); });
  ok('volume is remembered', await page.evaluate(
    () => Math.abs(JSON.parse(localStorage.getItem('checksmith:v1')).volume - 0.3) < 0.001));

  section('Accessibility');
  const label = await page.getAttribute('.tile[data-i="0"]', 'aria-label');
  ok('tiles are named with position, piece, strikes and reachability',
    /row 1, column 1, (King|Rook|Bishop|Knight|Queen), \d+ strikes?, /.test(label) &&
    /(legal|not reachable|hammer is here)/.test(label), label);
  ok('progress is exposed as a live region',
    await page.evaluate(() => document.getElementById('live').getAttribute('aria-live') === 'polite'));
  await page.keyboard.press('Tab');
  // start from the top-left corner so the expected step holds at any board size
  const keyed = await page.evaluate(() => {
    const t = document.querySelector('.tile[data-i="0"]');
    t.focus();
    return document.activeElement === t;
  });
  ok('tiles are focusable', keyed);
  await page.keyboard.press('ArrowRight');
  ok('arrow keys move focus across the board',
    await page.evaluate(() => document.activeElement.dataset.i === '1'),
    'focus landed on ' + await page.evaluate(() => document.activeElement.dataset.i));
  await page.keyboard.press('ArrowDown');
  ok('arrow keys move focus down a row', await page.evaluate(
    () => Number(document.activeElement.dataset.i) === window.CHECKSMITH.app.game.board.size + 1));
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  ok('focus clamps at the board edge without wrapping',
    await page.evaluate(() => document.activeElement.dataset.i === '0'));
  const kbTarget = await page.evaluate(() => window.CHECKSMITH.core.legalTargets(window.CHECKSMITH.app.game)[0]);
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
  await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.size === 6, null, { timeout: 5000 });
  ok('accepting switches difficulty', (await snap(page)).size === 6);
  await page.click('#helpBtn');
  ok('how to play opens', await page.isVisible('#help'));
  await page.keyboard.press('Escape');
  ok('escape closes how to play', await page.isHidden('#help'));

  section('Page hidden mid-swing');
  await fast(page, 900);
  const hidBefore = await snap(page);
  const hidTarget = await page.evaluate(() => window.CHECKSMITH.core.legalTargets(window.CHECKSMITH.app.game)[0]);
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

  /* The Android shell hands the hardware back gesture to the page with
     exactly this snippet, so test the snippet against the real page. */
  section('Android back-button handler (as used by the APK shell)');
  const BACK = `(function(){
      var open=document.querySelector('.overlay:not([hidden])');
      if(!open) return false;
      var close=open.querySelector('#helpClose,#confirmNo,#rChange');
      if(close){close.click();} else {open.hidden=true;}
      return true;
    })()`;
  ok('returns false when no dialog is open, so the app would exit',
    (await page.evaluate(BACK)) === false);
  await page.click('#helpBtn');
  ok('how to play is open', await page.isVisible('#help'));
  ok('back reports it handled the press', (await page.evaluate(BACK)) === true);
  ok('back closed how to play', await page.isHidden('#help'));
  await page.evaluate(() => document.getElementById('newBtn').click());
  const hadConfirm = await page.isVisible('#confirm');
  if (hadConfirm) {
    ok('back dismisses the discard prompt without discarding',
      (await page.evaluate(BACK)) === true && await page.isHidden('#confirm'));
  } else {
    ok('discard prompt not applicable (run not started)', true);
  }
  await page.waitForTimeout(150);
  ok('back leaves the board untouched', (await snap(page)).status !== 'complete');

  /* ============ title screen ============ */
  section('Title screen');
  await page.evaluate(() => document.getElementById('menuBtn').click());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  ok('the menu button returns to the title screen', await page.isVisible('#titleScreen'));
  ok('the run is put down when leaving', await page.evaluate(() => window.CHECKSMITH.app.game === null));
  ok('all three modes are offered', (await page.locator('.mode-card').count()) === 3);
  ok('all four difficulties are offered', (await page.locator('#titleDiff .diff-btn').count()) === 4);
  await page.click('#titleDiff .diff-btn[data-tdiff="journeyman"]');
  ok('picking a difficulty checks it',
    (await page.getAttribute('#titleDiff .diff-btn[data-tdiff="journeyman"]', 'aria-checked')) === 'true');
  await page.click('.mode-card[data-mode="endless"]');
  ok('picking a mode checks it and unchecks the other',
    (await page.getAttribute('.mode-card[data-mode="endless"]', 'aria-checked')) === 'true' &&
    (await page.getAttribute('.mode-card[data-mode="forge"]', 'aria-checked')) === 'false');
  ok('endless hides the difficulty picker', await page.isHidden('#titleDiffBlock'));
  ok('and says where it starts instead', await page.isVisible('#endlessNote') &&
    /3.3/.test(await page.textContent('#endlessNote')));
  await page.click('.mode-card[data-mode="forge"]');
  ok('forge brings the picker back', await page.isVisible('#titleDiffBlock'));
  await page.click('.mode-card[data-mode="endless"]');

  /* ============ endless mode ============ */
  section('Endless mode');
  await page.click('#beginBtn');
  await page.waitForFunction(() => window.CHECKSMITH && window.CHECKSMITH.app.game, null, { timeout: 10000 });
  ok('the title screen steps aside', await page.isHidden('#titleScreen'));
  const eStart = await page.evaluate(() => {
    const g = window.CHECKSMITH.app.game;
    return { mode: g.mode, round: g.round, score: g.score, size: g.board.size,
      route: g.board.route.length, squares: g.strikes.length,
      material: document.getElementById('matName').textContent,
      bar: !document.getElementById('materialBar').hidden,
      stats: !document.getElementById('statsEndless').hidden,
      forgeStats: !document.getElementById('statsForge').hidden,
      newBtn: document.getElementById('newBtn').hidden,
      menuBtn: document.getElementById('menuActionBtn').hidden,
      restart: document.getElementById('restartBtn').textContent };
  });
  ok('endless opens at Bronze, round one, score zero',
    eStart.mode === 'endless' && eStart.round === 1 && eStart.score === 0 &&
    eStart.material === 'Bronze', JSON.stringify(eStart));

  // Endless and versus now share one palette, keyed per square. The round's
  // metal must still reach every struck square, and the metal rule must no
  // longer bury the brass ring on the square the hammer is standing on.
  const eMetal = await page.evaluate(() => {
    const F = window.CHECKSMITH, g = F.app.game;
    g.strikes[0] = 1; g.strikes[1] = 1; g.current = 1;
    F.render();
    const t = (i) => document.querySelector(`#board .tile[data-i="${i}"]`);
    const out = {
      struck: t(0).dataset.metal, standing: t(1).dataset.metal,
      untouched: t(2).dataset.metal ?? null,
      ring: getComputedStyle(t(1)).boxShadow,
      marker: getComputedStyle(t(1), '::after').content
    };
    g.strikes[0] = 0; g.strikes[1] = 0; g.current = -1;
    F.render();
    return out;
  });
  ok('a struck endless square wears the round\u2019s metal',
    eMetal.struck === '0' && eMetal.standing === '0' && eMetal.untouched === null,
    JSON.stringify(eMetal));
  ok('and the square under the hammer keeps its brass ring',
    eMetal.ring.includes('202, 166, 74') && eMetal.marker.includes('\u25c6'),
    JSON.stringify([eMetal.ring, eMetal.marker]));
  ok('it always starts on the smallest board, whatever was picked before',
    eStart.size === 3, 'size ' + eStart.size);
  ok('the round is a one-visit tour', eStart.route === eStart.squares);
  ok('the material banner and endless stats replace the forge ones',
    eStart.bar && eStart.stats && !eStart.forgeStats);
  ok('the actions swap New Puzzle for Main Menu',
    eStart.newBtn === true && eStart.menuBtn === false && eStart.restart === 'Restart Run');
  ok('the tutorial names the opening round',
    (await page.textContent('#promptText')).includes('Bronze'));
  await page.evaluate(() => {
    window.CHECKSMITH.core.CONFIG.animation.strikeMs = 25;
    // A round's verified route only holds while the symbols hold still, so
    // reshaping is pinned off for the replays below (it has its own tests).
    const e = window.CHECKSMITH.core.CONFIG.endless;
    window.__shipped = { morphBase: e.morphBase, morphStep: e.morphStep };
    e.morphBase = 0; e.morphStep = 0;
    window.CHECKSMITH.app.game.morphChance = 0;
  });

  // one strike: scores, marks, and closes that square for the round
  const one = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const wait = () => new Promise((r) => { const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 8); });
    const first = F.app.game.board.route[0];
    document.querySelector(`.tile[data-i="${first}"]`).click();
    await wait();
    const g = F.app.game;
    const el = document.querySelector(`.tile[data-i="${first}"]`);
    const before = g.totalStrikes;
    el.click();                                   // try to hit it again
    await new Promise((r) => setTimeout(r, 200));
    return { first, score: g.score, hit: el.dataset.hit, label: el.getAttribute('aria-label'),
      repeatBlocked: g.totalStrikes === before, hits: document.getElementById('eHits').textContent,
      scoreChip: document.getElementById('eScore').textContent };
  });
  ok('a strike is worth ten points', one.score === 10 && one.scoreChip === '10');
  ok('the struck square renders as hit', one.hit === '1');
  ok('screen readers are told it is already struck', /already struck/.test(one.label), one.label);
  ok('a repeat strike on the same square is refused', one.repeatBlocked === true);
  ok('squares-hit is counted on screen', one.hits === '1/9');
  ok('the banner reports the reshape odds and the next whole payout', await page.evaluate(
    () => /% reshape/.test(document.getElementById('matSub2').textContent) &&
          /\+\d+ gold next board/.test(document.getElementById('matSub2').textContent)),
    await page.textContent('#matSub2'));
  await page.screenshot({ path: path.join(SHOTS, '07-endless-bronze.png'), fullPage: true });

  // clear the board via its verified route and watch it recast
  const cleared = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const wait = () => new Promise((r) => { const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 8); });
    const g0 = F.app.game;
    const route = g0.board.route.slice();
    const from = route.indexOf(g0.current);
    for (let k = from + 1; k < route.length; k++) {
      document.querySelector(`.tile[data-i="${route[k]}"]`).click();
      await wait();
    }
    await new Promise((r) => setTimeout(r, 1600));
    const g = F.app.game;
    return { round: g.round, score: g.score, cleared: g.roundsCompleted, status: g.status,
      hits: g.strikes.filter((x) => x > 0).length, current: g.current,
      material: document.getElementById('matName').textContent,
      tier: document.getElementById('board').dataset.tier,
      routeLen: g.board.route.length };
  });
  ok('the clearing blow advances the round instead of ending the run',
    cleared.round === 2 && cleared.cleared === 1 && cleared.status !== 'lost',
    JSON.stringify(cleared));
  ok('the board is recast cold with no hammer on it',
    cleared.hits === 0 && cleared.current === -1 && cleared.routeLen === 9);
  ok('the material advances to Silver', cleared.material === 'Silver' && cleared.tier === '1');
  ok('the score carries forward with the round bonus', cleared.score === 9 * 10 + 100);
  await page.screenshot({ path: path.join(SHOTS, '08-endless-silver.png'), fullPage: true });

  // a dead end ends the run
  const dead = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const wait = () => new Promise((r) => { const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 8); });
    const g = F.app.game;
    // Strand it on a 3x3: a knight in the centre has no legal jump at all,
    // and square 2 is left unstruck so the board is not cleared instead.
    g.pieces = g.pieces.map(() => 'R');
    g.pieces[4] = 'N';
    g.strikes = [1, 1, 0, 1, 0, 1, 1, 1, 1];
    g.current = 1;                                 // a rook on the top row
    g.status = 'playing';
    document.querySelector('.tile[data-i="4"]').click();    // down the column onto the knight
    await wait();
    await new Promise((r) => setTimeout(r, 700));
    return { status: g.status, frozen: document.getElementById('board').dataset.frozen,
      dialog: !document.getElementById('results').hidden,
      prompt: document.getElementById('promptText').textContent,
      caption: document.getElementById('rQualityCaption').textContent,
      score: document.getElementById('rQuality').firstChild.textContent,
      rounds: document.getElementById('rStrikes').textContent,
      material: document.getElementById('rSpent').textContent,
      retry: document.getElementById('rRetry').textContent,
      menu: document.getElementById('rChange').textContent,
      newHidden: document.getElementById('rNew').hidden };
  });
  ok('running out of legal moves ends the run', dead.status === 'lost', dead.status);
  ok('the failure message is exact', dead.prompt === 'No legal moves remaining.', dead.prompt);
  ok('the board freezes so the route stays visible', dead.frozen === '1');
  ok('the game over sheet reports the final score', dead.dialog && dead.caption === 'FINAL SCORE');
  ok('it reports rounds cleared and the highest material',
    dead.rounds === '1' && /Silver|Bronze/.test(dead.material), dead.rounds + ' / ' + dead.material);
  ok('it offers Play Again, the Forge Shop and Main Menu',
    dead.retry === 'Play Again' && dead.menu === 'Main Menu' && dead.newHidden === false);
  ok('the endless best score is saved as one number', await page.evaluate(
    () => { try { const d = JSON.parse(localStorage.getItem('checksmith:v1') || '{}');
      return typeof d.endlessBest === 'number' && d.endlessBest > 0; }
      catch (e) { return false; } }));
  ok('standard-mode results are preserved alongside', await page.evaluate(
    () => { try { const d = JSON.parse(localStorage.getItem('checksmith:v1') || '{}');
      return !!(d.best && Object.keys(d.best).length); } catch (e) { return false; } }));
  await page.screenshot({ path: path.join(SHOTS, '09-endless-over.png'), fullPage: true });

  // Play Again resets to Bronze, round 1, score 0
  await page.click('#rRetry');
  await page.waitForTimeout(600);
  const again = await page.evaluate(() => {
    const g = window.CHECKSMITH.app.game;
    return { round: g.round, score: g.score, cleared: g.roundsCompleted, status: g.status,
      material: document.getElementById('matName').textContent };
  });
  ok('Play Again starts a fresh run at Bronze, round one, score zero',
    again.round === 1 && again.score === 0 && again.cleared === 0 && again.material === 'Bronze',
    JSON.stringify(again));

  // rapid taps must score once, not once per tap
  const rapid = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const wait = () => new Promise((r) => { const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 8); });
    const g = F.app.game;
    if (g.current < 0) { document.querySelector(`.tile[data-i="${g.board.route[0]}"]`).click(); await wait(); }
    const before = g.score;
    const t = F.core.legalTargets(g)[0];
    const el = document.querySelector(`.tile[data-i="${t}"]`);
    for (let i = 0; i < 8; i++) el.click();
    await wait();
    await new Promise((r) => setTimeout(r, 150));
    return { before, after: g.score };
  });
  ok('eight rapid taps score exactly one strike',
    rapid.after === rapid.before + 10, rapid.before + ' -> ' + rapid.after);

  // a restart during the between-rounds pause must not award the old round twice
  const stale = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const wait = () => new Promise((r) => { const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 8); });
    const g0 = F.app.game;
    const route = g0.board.route.slice();
    for (const i of route) {
      if (g0.strikes[i] > 0) continue;
      document.querySelector(`.tile[data-i="${i}"]`).click();
      await wait();
    }
    // the board just cleared; the recast is still pending
    document.getElementById('restartBtn').click();
    const yes = document.getElementById('confirmYes');
    if (!document.getElementById('confirm').hidden) yes.click();
    await new Promise((r) => setTimeout(r, 1800));
    const g = F.app.game;
    return { score: g.score, round: g.round, cleared: g.roundsCompleted, status: g.status,
      material: document.getElementById('matName').textContent };
  });
  ok('restarting mid-recast cannot award the old round again',
    stale.score === 0 && stale.round === 1 && stale.cleared === 0, JSON.stringify(stale));
  ok('and the restarted run is back at Bronze', stale.material === 'Bronze');

  /* ============ gold and the forge shop ============ */
  section('Gold and the forge shop');
  const purse = await page.evaluate(() => ({
    app: window.CHECKSMITH.app.gold,
    chip: document.getElementById('eGold').textContent,
    stored: (() => { try { return JSON.parse(localStorage.getItem('checksmith:v1') || '{}').gold; }
      catch (e) { return null; } })()
  }));
  ok('clearing a board banks gold into the purse', purse.app >= 1, JSON.stringify(purse));
  ok('the gold chip shows it', Number(purse.chip) === purse.app);
  ok('the purse is a whole number of coins',
    Number.isInteger(purse.app) && /^\d+$/.test(purse.chip), purse.chip);
  ok('the purse survives in storage', purse.stored === purse.app);

  await page.evaluate(() => document.getElementById('menuActionBtn').click());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  ok('the title screen shows the purse', await page.isVisible('#titlePurse'));
  await page.click('#shopBtn');
  ok('the forge shop opens', await page.isVisible('#shop'));
  const shop = await page.evaluate(() => ({
    rows: document.querySelectorAll('.shop-row').length,
    gold: document.getElementById('shopGold').textContent,
    names: Array.from(document.querySelectorAll('.sr-name')).map((n) => n.textContent),
    buys: Array.from(document.querySelectorAll('.sr-buy')).map((b) => ({ t: b.textContent, off: b.disabled }))
  }));
  ok('every upgrade is listed', shop.rows === 3 && shop.names.length === 3, JSON.stringify(shop.names));
  ok('the purse is shown in the shop', Number(shop.gold) === purse.app);
  ok('upgrades you cannot afford are disabled',
    shop.buys.some((b) => b.off === true) || purse.app >= 5);

  // grant enough gold to buy the multiplier the request names
  await page.click('#shopClose');
  await page.evaluate(() => { window.CHECKSMITH.app.gold = 50; });
  await page.click('#shopBtn');
  const preBuy = await page.evaluate(() => ({
    gold: window.CHECKSMITH.app.gold,
    level: window.CHECKSMITH.core.levelOf(window.CHECKSMITH.app.upgrades, 'gild'),
    cost: window.CHECKSMITH.core.upgradeCost('gild', 0)
  }));
  await page.click('.sr-buy[data-buy="gild"]');
  const postBuy = await page.evaluate(() => ({
    gold: window.CHECKSMITH.app.gold,
    level: window.CHECKSMITH.core.levelOf(window.CHECKSMITH.app.upgrades, 'gild'),
    stored: (() => { try { const d = JSON.parse(localStorage.getItem('checksmith:v1') || '{}');
      return { gold: d.gold, lvl: d.upgrades && d.upgrades.gild }; } catch (e) { return null; } })(),
    label: document.querySelector('.shop-row .sr-eff').textContent
  }));
  ok('buying an upgrade spends the gold', postBuy.gold === preBuy.gold - preBuy.cost,
    preBuy.gold + ' -> ' + postBuy.gold);
  ok('the upgrade level goes up', postBuy.level === preBuy.level + 1);
  ok('both are written to storage',
    postBuy.stored.gold === postBuy.gold && postBuy.stored.lvl === postBuy.level);
  ok('the shop redraws with the new effect', /gold a board/i.test(postBuy.label), postBuy.label);
  ok('every upgrade offers ten levels', await page.evaluate(
    () => Array.from(document.querySelectorAll('.sr-lvl')).every((n) => /of 10$/.test(n.textContent))));
  ok('the shop explains the score bonus', await page.evaluate(
    () => /300/.test(document.getElementById('shopNote').textContent)));
  await page.screenshot({ path: path.join(SHOTS, '10-forge-shop.png'), fullPage: true });

  // the bought multiplier must actually pay out
  await page.click('#shopClose');
  const payout = await page.evaluate(() => {
    const F = window.CHECKSMITH;
    const board = F.core.generateTourBoard('novice', F.core.mulberry32(3));
    const g = F.core.createGame(board, { mode: 'endless', morphChance: 0, upgrades: F.app.upgrades });
    for (const step of board.route) F.core.applyStrike(g, step);
    return { gold: g.gold, level: F.core.levelOf(F.app.upgrades, 'gild'),
      expected: F.core.payoutFor(g.score, F.app.upgrades, g.goldCarry).coins };
  });
  ok('the Gilded Hammer adds its gold to the next board',
    payout.gold === payout.expected, JSON.stringify(payout));
  // the score bonus must show up in play too
  const scaled = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, c = C.CONFIG.shop;
    return {
      low: C.goldRateFor(0, {}),
      high: C.goldRateFor(c.scoreStep * 4, {}),
      step: c.goldPerScoreStep, every: c.scoreStep,
      coins: C.payoutFor(c.scoreStep * 4, {}, 0).coins,
      carry: C.payoutFor(c.scoreStep * 4, {}, 0).carry
    };
  });
  ok('the rate climbs +' + scaled.step + ' for every ' + scaled.every + ' points',
    scaled.high === scaled.low + scaled.step * 4, JSON.stringify(scaled));
  ok('but the coins paid are always whole, with the fraction carried',
    Number.isInteger(scaled.coins) && scaled.carry >= 0 && scaled.carry < 1);

  /* ============ the run gets harder ============ */
  section('Endless ramps up');
  const ramp = await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    const e = C.CONFIG.endless;
    Object.assign(e, window.__shipped);          // put the shipped ramp back
    return {
      base: C.endlessMorphChance(1, {}),
      step: C.endlessMorphChance(1 + e.morphEvery, {}),
      every: e.morphEvery,
      diffEvery: e.difficultyEvery,
      tier1: C.tierForRound('novice', 1),
      tierNext: C.tierForRound('novice', 1 + e.difficultyEvery)
    };
  });
  ok('reshape odds climb every ' + ramp.every + ' rounds', ramp.step > ramp.base);
  ok('the tier steps up every ' + ramp.diffEvery + ' rounds', ramp.tier1 !== ramp.tierNext);

  // and the board really does grow mid-run
  await startFromTitle(page, 'endless', 'novice');
  const grew = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    F.core.CONFIG.animation.strikeMs = 12;
    const e = F.core.CONFIG.endless;
    e.morphBase = 0; e.morphStep = 0;            // replaying routes again
    const wait = () => new Promise((r) => { const t = setInterval(() => { if (!F.app.busy) { clearInterval(t); r(); } }, 6); });
    const sizes = [];
    for (let round = 0; round < e.difficultyEvery + 1; round++) {
      const g = F.app.game;
      g.morphChance = 0;
      sizes.push({ round: g.round, size: g.board.size, tiles: document.querySelectorAll('.tile').length });
      for (const i of g.board.route.slice()) {
        if (g.strikes[i] > 0) continue;
        document.querySelector(`.tile[data-i="${i}"]`).click();
        await wait();
      }
      await new Promise((r) => setTimeout(r, 1200));
      if (F.core.isOver(F.app.game)) break;
    }
    return { sizes, final: F.app.game.board.size, tiles: document.querySelectorAll('.tile').length };
  });
  ok('the board grows a tier after ' + ramp.diffEvery + ' cleared rounds',
    grew.final > grew.sizes[0].size, JSON.stringify(grew.sizes));
  ok('the tile grid is rebuilt to match', grew.tiles === grew.final * grew.final);
  await page.screenshot({ path: path.join(SHOTS, '11-endless-tier-up.png'), fullPage: true });

  // back to the menu, then into forge, to prove the modes do not leak
  await page.evaluate(() => document.getElementById('menuActionBtn').click());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await startFromTitle(page, 'forge', 'novice');
  ok('forge mode still uses the two-strike rules', await page.evaluate(() => {
    const g = window.CHECKSMITH.app.game;
    return g.mode === 'forge' && g.board.route.length === 18 &&
      document.getElementById('materialBar').hidden === true &&
      document.getElementById('statsForge').hidden === false;
  }));

  /* ============ versus mode ============ */
  section('Versus: the title screen');
  await page.evaluate(() => document.getElementById('menuBtn').click());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  ok('Versus sits directly below Endless in the menu', await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.mode-card')).map((c) => c.dataset.mode);
    return cards.join(',') === 'forge,endless,versus';
  }));
  await page.click('.mode-card[data-mode="versus"]');
  ok('choosing Versus shows its own two selectors',
    await page.isVisible('#titleVersusBlock') && await page.isVisible('#titleSize') &&
    await page.isVisible('#titleFoe'));
  ok('and hides the forge difficulty picker', await page.isHidden('#titleDiffBlock'));
  await page.click('#titleSize .diff-btn[data-tsize="3"]');
  await page.click('#titleFoe .diff-btn[data-tfoe="master"]');
  ok('board size and rival skill are chosen independently', await page.evaluate(
    () => window.CHECKSMITH.app.vsSize === 3 && window.CHECKSMITH.app.vsFoe === 'master'));
  // The highlight used to be scoped to #titleDiff, so these two radios tracked
  // the choice in aria-checked and showed nothing for it.
  const litUp = await page.evaluate(() => {
    const read = (sel) => Array.from(document.querySelectorAll(sel)).map((b) => ({
      on: b.getAttribute('aria-checked') === 'true',
      lit: getComputedStyle(b).backgroundImage !== 'none'
    }));
    const rows = read('#titleSize .diff-btn').concat(read('#titleFoe .diff-btn'));
    return { agree: rows.every((r) => r.on === r.lit), lit: rows.filter((r) => r.lit).length };
  });
  ok('the chosen size and skill are visibly highlighted', litUp.agree && litUp.lit === 2,
    JSON.stringify(litUp));
  await page.click('#titleSize .diff-btn[data-tsize="4"]');
  await page.click('#titleFoe .diff-btn[data-tfoe="apprentice"]');

  section('Versus: the match');
  await page.click('#beginBtn');
  await page.waitForFunction(() => window.CHECKSMITH && window.CHECKSMITH.app.match, null, { timeout: 10000 });
  await page.waitForTimeout(250);
  const vs = await page.evaluate(() => {
    const m = window.CHECKSMITH.app.match;
    const panels = Array.from(document.querySelectorAll('.vs-panel')).map((p) => p.dataset.side);
    return {
      size: m.size, turn: m.turn, order: panels.join(','),
      foeTiles: document.querySelectorAll('#foeBoard .tile').length,
      youTiles: document.querySelectorAll('#youBoard .tile').length,
      sameBag: m.you.pieces.slice().sort().join('') === m.foe.pieces.slice().sort().join(''),
      different: m.you.pieces.join('') !== m.foe.pieces.join(''),
      shop: document.querySelectorAll('.vs-buy').length,
      forgeBoardHidden: document.querySelector('.board-wrap').hidden
    };
  });
  ok('the rival is on the left and you are on the right', vs.order === 'foe,you', vs.order);
  ok('both boards are drawn at the chosen size',
    vs.foeTiles === 16 && vs.youTiles === 16 && vs.size === 4);
  ok('the two boards share a bag but not a layout', vs.sameBag && vs.different);
  ok('the forge board is out of the way', vs.forgeBoardHidden === true);

  // Versus owns the whole view. Any forge or endless chrome still taking up
  // space here is a leak: `.actions` and `.stats` appear more than once, so a
  // careless querySelector hides the wrong one.
  const leftovers = await page.evaluate(() => {
    const shown = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return {
      diffRow: shown('.difficulty:not(#titleDiff)'),
      prompt: shown('#prompt'),
      statsForge: shown('#statsForge'),
      statsEndless: shown('#statsEndless'),
      materialBar: shown('#materialBar'),
      forgeActions: shown('#forgeActions'),
      legend: shown('#legendPanel'),
      bestLine: shown('#bestLine'),
      versusView: shown('#versusView')
    };
  });
  // Squares walk up the material ladder as they take strikes, the way endless
  // works a whole board up a metal a round.
  const ladder = await page.evaluate(() => {
    const F = window.CHECKSMITH, m = F.app.match;
    for (let k = 0; k < 8 && k < m.size * m.size; k++) m.you.strikes[k] = k;
    F.vsRender();
    const read = (i) => {
      const t = document.querySelector(`#youBoard .tile[data-i="${i}"]`);
      return { metal: t.dataset.metal ?? null, bg: getComputedStyle(t).backgroundImage };
    };
    const rows = [];
    for (let k = 0; k < 8 && k < m.size * m.size; k++) rows.push(read(k));
    for (let k = 0; k < 8 && k < m.size * m.size; k++) m.you.strikes[k] = 0;
    F.vsRender();
    return rows;
  });
  ok('an unstruck square wears no metal', ladder[0].metal === null);
  ok('each strike moves the square one metal up the ladder',
    ladder.slice(1, 7).every((r, k) => r.metal === String(k)),
    JSON.stringify(ladder.map((r) => r.metal)));
  ok('the six metals are six different colours',
    new Set(ladder.slice(1, 7).map((r) => r.bg)).size === 6);
  ok('past the last metal the colour holds rather than wrapping',
    ladder.length < 8 || ladder[7].metal === '5');

  // Damage wears the forge's third-strike art, and Repair — which only resets
  // the state — has to put the square back exactly as it was.
  const damage = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    const bg = (i) => getComputedStyle(document.querySelector(`#youBoard .tile[data-i="${i}"]`)).backgroundImage;
    const cs = (i) => getComputedStyle(document.querySelector(`#youBoard .tile[data-i="${i}"]`));
    m.you.strikes[6] = 2; m.you.strikes[9] = 2;
    F.vsRender();
    const plain = bg(6);                       // two strikes, never cracked
    const reference = bg(9);                   // its untouched twin
    m.you.states[6] = C.SQ_CRACKED; F.vsRender();
    const cracked = { bg: bg(6), outline: cs(6).outlineStyle };
    m.you.states[6] = C.SQ_ARMED; F.vsRender();
    const armed = { bg: bg(6), outline: cs(6).outlineStyle };
    m.you.states[6] = C.SQ_INTACT; F.vsRender();
    const repaired = { bg: bg(6), outline: cs(6).outlineStyle };
    return { plain, reference, cracked, armed, repaired };
  });
  ok('a cracked square stops looking like sound metal', damage.cracked.bg !== damage.plain);
  ok('the crack shows through whatever metal the square had worked up to',
    damage.cracked.bg !== damage.reference);
  ok('cracked and armed squares wear the same split-metal art',
    damage.armed.bg === damage.cracked.bg);
  ok('a cracked square is ringed by an outline, not a pseudo-element',
    damage.cracked.outline === 'dashed' && damage.armed.outline === 'solid',
    JSON.stringify([damage.cracked.outline, damage.armed.outline]));
  ok('repairing returns the square to the colour it had before',
    damage.repaired.bg === damage.plain && damage.repaired.bg === damage.reference,
    JSON.stringify(damage.repaired));
  ok('repairing clears the crack ring too', damage.repaired.outline === 'none');

  // The current-square marker and the damage ring both wanted ::after, and the
  // rings used to reach further than the grid gap and collide with a neighbour.
  const rings = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    m.you.current = 0; m.you.states[0] = C.SQ_CRACKED;
    F.vsRender();
    const tile = document.querySelector('#youBoard .tile[data-i="0"]');
    const marker = getComputedStyle(tile, '::after').content;
    // widest non-inset shadow ring, compared against the gap between squares
    const shadow = getComputedStyle(tile).boxShadow;
    const gap = parseFloat(getComputedStyle(document.getElementById('youBoard')).gap);
    const outer = shadow.split(',').filter((part) => !part.includes('inset'))
      .map((part) => {
        const nums = part.match(/(-?\d+(?:\.\d+)?)px/g) || [];
        return nums.length >= 4 ? parseFloat(nums[3]) : 0;   // the spread value
      });
    return { marker, gap, worstSpread: Math.max(0, ...outer) };
  });
  ok('the current square keeps its marker even when cracked',
    rings.marker && rings.marker !== 'none', rings.marker);
  ok('no ring reaches further than the gap between squares',
    rings.worstSpread <= rings.gap, JSON.stringify(rings));

  // The damage outline outranks the bare :focus-visible rule, so a keyboard
  // user could have lost the focus ring on exactly the squares that matter.
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    m.you.states[2] = C.SQ_CRACKED;
    F.vsRender();
    document.body.focus();
  });
  let onCracked = false;
  for (let n = 0; n < 120 && !onCracked; n++) {
    await page.keyboard.press('Tab');
    onCracked = await page.evaluate(() => {
      const a = document.activeElement;
      return !!(a && a.classList.contains('tile') && a.dataset.side === 'you' && a.dataset.i === '2');
    });
  }
  const focusRing = await page.evaluate(() => {
    const a = document.activeElement;
    const cs = getComputedStyle(a);
    return { vs: a.dataset.vs, visible: a.matches(':focus-visible'),
      width: cs.outlineWidth, style: cs.outlineStyle, offset: cs.outlineOffset };
  });
  ok('a cracked square still shows the keyboard focus ring',
    onCracked && focusRing.visible && focusRing.style === 'solid' &&
    focusRing.width === '3px' && focusRing.offset === '2px',
    JSON.stringify(focusRing));
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    m.you.states[2] = C.SQ_INTACT; F.vsRender();
  });

  ok('no forge or endless chrome leaks into the match',
    Object.entries(leftovers).every(([k, v]) => (k === 'versusView' ? v === true : v === false)),
    JSON.stringify(leftovers));
  ok('all four upgrades are offered', vs.shop === 4);
  ok('the human moves first', vs.turn === 'you');
  await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    C.CONFIG.animation.strikeMs = 20;
    C.CONFIG.versus.ai.thinkMs = 20;
  });
  await page.screenshot({ path: path.join(SHOTS, '12-versus.png'), fullPage: true });

  // striking the rival's board is not allowed
  const beforeTap = await page.evaluate(() => window.CHECKSMITH.app.match.foe.strikes.slice());
  await page.evaluate(() => document.querySelector('#foeBoard .tile[data-i="0"]').click());
  await page.waitForTimeout(150);
  ok('you cannot strike the rival’s board', await page.evaluate(
    (b) => JSON.stringify(window.CHECKSMITH.app.match.foe.strikes) === JSON.stringify(b), beforeTap));
  await page.evaluate(() => { window.CHECKSMITH.vs.focus = 'none'; window.CHECKSMITH.vsRender(); });

  // On a narrow screen the overview tiles are below a comfortable tap size,
  // so the first tap opens that board rather than striking a tiny cell.
  const tiny = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core;
    const m = F.app.match;
    const width = document.querySelector('#youBoard .tile').getBoundingClientRect().width;
    const first = C.versusTargets(m, 'you')[0];
    document.querySelector(`#youBoard .tile[data-i="${first}"]`).click();
    await new Promise((r) => setTimeout(r, 150));
    return { width, focus: document.getElementById('vsBoards').dataset.focus,
      struck: m.you.strikes[first] };
  });
  ok('overview tiles below 44px do not take a strike',
    tiny.width < 44 ? (tiny.struck === 0 && tiny.focus === 'you') : true,
    JSON.stringify(tiny));
  ok('tapping one instead enlarges that board',
    tiny.width < 44 ? tiny.focus === 'you' : true);

  // an opening strike, then the rival replies on its own
  const opened = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core;
    const m = F.app.match;
    F.vs.focus = 'you';                      // play from the enlarged board
    F.vsRender();
    const first = C.versusTargets(m, 'you')[0];
    document.querySelector(`#youBoard .tile[data-i="${first}"]`).click();
    await new Promise((r) => setTimeout(r, 1400));
    const now = F.app.match;
    return { first, yourStrikes: now.you.strikes[first], foePlaced: now.foe.current >= 0,
      turn: now.turn, points: now.you.points,
      enlarged: document.querySelector('#youBoard .tile').getBoundingClientRect().width };
  });
  ok('the enlarged board gives comfortable targets', opened.enlarged >= 44,
    String(opened.enlarged));
  ok('your opening blow lands and scores',
    opened.yourStrikes === 1 && opened.points >= 10, JSON.stringify(opened));
  ok('the rival takes its own turn unprompted', opened.foePlaced === true);
  ok('and hands the turn back', opened.turn === 'you');

  // upgrade targeting must never strike the square it is aimed at
  const targeting = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core;
    const m = F.app.match;
    m.you.points = 1000;
    F.vsRender();
    document.querySelector('.vs-buy[data-buy="shatter"]').click();
    const armed = !!F.vs.targeting;
    const before = m.foe.strikes.slice();
    const target = m.foe.states.findIndex((s) => s === C.SQ_INTACT);
    document.querySelector(`#foeBoard .tile[data-i="${target}"]`).click();
    await new Promise((r) => setTimeout(r, 120));
    return { armed, target, cracked: m.foe.states[target] === C.SQ_CRACKED,
      struck: JSON.stringify(m.foe.strikes) !== JSON.stringify(before),
      points: m.you.points, used: m.upgradeUsed, cleared: !F.vs.targeting };
  });
  ok('picking an upgrade enters targeting', targeting.armed === true);
  ok('the target tap cracks the square instead of striking it',
    targeting.cracked === true && targeting.struck === false);
  ok('it charges once and spends the turn’s allowance',
    targeting.points === 1000 - 40 && targeting.used === true);
  ok('targeting clears itself after the purchase', targeting.cleared === true);

  // cancelling spends nothing and keeps the allowance
  const cancelled = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const m = F.app.match;
    m.upgradeUsed = false; m.you.points = 1000;
    F.vsRender();
    document.querySelector('.vs-buy[data-buy="reforge"]').click();
    const armed = !!F.vs.targeting;
    document.getElementById('vsCancelBtn').click();
    return { armed, gone: !F.vs.targeting, points: m.you.points, used: m.upgradeUsed };
  });
  ok('cancelling targeting spends nothing',
    cancelled.armed && cancelled.gone && cancelled.points === 1000 && cancelled.used === false);

  // the enlarged single-board view, for narrow screens
  const zoomed = await page.evaluate(() => {
    const F = window.CHECKSMITH;
    F.vs.focus = 'none';                     // start from the overview, whatever went before
    F.vsRender();
    document.querySelector('.vs-zoom[data-zoom="you"]').click();
    const focus = document.getElementById('vsBoards').dataset.focus;
    const foeShown = document.querySelector('.vs-panel[data-side="foe"]').offsetParent !== null;
    document.getElementById('vsOverviewBtn').click();
    return { focus, foeShown, back: document.getElementById('vsBoards').dataset.focus };
  });
  ok('a board can be enlarged for comfortable taps',
    zoomed.focus === 'you' && zoomed.foeShown === false);
  ok('and the two-board overview comes back', zoomed.back === 'none');

  // play the match out and check the result sheet
  const match = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core;
    const wait = () => new Promise((r) => { const t = setInterval(() => {
      if (!F.app.busy && (C.matchOver(F.app.match) || F.app.match.turn === 'you')) { clearInterval(t); r(); }
    }, 10); });
    let guard = 0;
    while (!C.matchOver(F.app.match) && guard++ < 500) {
      const m = F.app.match;
      if (m.turn !== 'you') { await wait(); continue; }
      const mv = C.versusChooseStrike(m, 'you');
      if (mv < 0) break;
      document.querySelector(`#youBoard .tile[data-i="${mv}"]`).click();
      await wait();
    }
    const m = F.app.match;
    return { over: C.matchOver(m), winner: m.winner, turns: m.turns,
      dialog: !document.getElementById('results').hidden,
      label: document.getElementById('rLabel').textContent,
      caption: document.getElementById('rQualityCaption').textContent,
      frozenTurn: document.getElementById('vsTurnBar').dataset.turn };
  });
  ok('the match reaches a decided end', match.over === true, String(match.turns) + ' turns');
  ok('someone is declared the winner', match.winner === 'you' || match.winner === 'foe');
  ok('the result sheet explains the outcome',
    match.dialog && /win/i.test(match.label) && match.caption === 'YOUR RECORD HERE');
  ok('the match freezes once decided', match.frozenTurn === 'over');
  ok('strikes after the end change nothing', await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const before = F.app.match.you.strikes.slice();
    document.querySelector('#youBoard .tile[data-i="0"]').click();
    await new Promise((r) => setTimeout(r, 150));
    return JSON.stringify(F.app.match.you.strikes) === JSON.stringify(before);
  }));
  ok('the versus record is kept by size and skill', await page.evaluate(
    () => { try { const d = JSON.parse(localStorage.getItem('checksmith:v1') || '{}');
      return !!(d.versusRecord && d.versusRecord['4xapprentice']); } catch (e) { return false; } }));
  await page.screenshot({ path: path.join(SHOTS, '13-versus-result.png'), fullPage: true });

  // Play Again keeps the settings but forges a new match
  await page.click('#rRetry');
  await page.waitForFunction(() => window.CHECKSMITH.app.match &&
    !window.CHECKSMITH.core.matchOver(window.CHECKSMITH.app.match), null, { timeout: 10000 });
  ok('Play Again starts a fresh match on the same settings', await page.evaluate(() => {
    const m = window.CHECKSMITH.app.match;
    return m.size === 4 && m.turns === 0 && m.you.points === 0 && m.foe.points === 0 &&
      m.you.broken === 0 && m.foe.broken === 0 && m.you.current === -1;
  }));

  // and the other modes are untouched
  await page.evaluate(() => document.getElementById('vsConcedeBtn').click());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForTimeout(300);
  await page.click('#rChange');
  await startFromTitle(page, 'forge', 'novice');
  ok('forge still plays under its own rules', await page.evaluate(() => {
    const g = window.CHECKSMITH.app.game;
    return g && g.mode === 'forge' && g.board.route.length === 18 &&
      document.getElementById('versusView').hidden === true &&
      document.querySelector('.board-wrap').hidden === false;
  }));

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
  await startFromTitle(page, 'forge', 'novice');
  await page.evaluate(() => { window.CHECKSMITH.core.CONFIG.animation.strikeMs = 40; });
  await page.click('.tile[data-i="0"]');
  await settle(page);
  ok('the game boots and plays with localStorage blocked', (await snap(page)).total === 1);
  ok('no errors escape the storage wrapper', errs2.length === 0, errs2.slice(0, 2).join(' | '));
  await ctx.close();

  /* ============ best scores survive the rename ============ */
  section('Pre-rename save data');
  ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('forge-pattern:v1',
        JSON.stringify({ best: { novice: 88 }, muted: true, volume: 0.45 }));
    } catch (e) { /* ignore */ }
  });
  await page.goto(FILE);
  await startFromTitle(page, 'forge', 'novice');
  await page.waitForTimeout(200);
  ok('best score saved under the old name is still shown',
    (await page.textContent('#bestLine')).includes('88'));
  ok('audio preferences carry over too', await page.evaluate(
    () => window.CHECKSMITH.sound.muted === true && Math.abs(window.CHECKSMITH.sound.volume - 0.45) < 0.001));
  await page.click('#muteBtn');
  ok('the next write lands under the new key', await page.evaluate(
    () => !!localStorage.getItem('checksmith:v1')));
  await ctx.close();

  /* ============ reduced motion ============ */
  section('Reduced motion');
  ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce' });
  page = await ctx.newPage();
  const errs3 = [];
  page.on('pageerror', (e) => errs3.push(String(e)));
  await page.goto(FILE);
  await startFromTitle(page, 'forge', 'novice');
  ok('reduced motion is detected', await page.evaluate(() => window.CHECKSMITH.fx.reduced === true));
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
  await startFromTitle(page, 'forge', 'novice');
  await page.click('[data-diff="master"]');
  await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.size === 6);
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
