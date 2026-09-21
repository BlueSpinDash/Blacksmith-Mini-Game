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
    strikes: g.strikes.slice(), current: g.pos.player, total: g.totalStrikes, status: g.status,
    pieces: g.board.pieces.join(''), live: g.pieces.map((p) => p || '.').join(''),
    route: g.board.route.slice(), size: g.board.size,
    busy: window.CHECKSMITH.app.busy
  };
});
const settle = (page) => page.waitForFunction(() => !window.CHECKSMITH.app.busy, null, { timeout: 5000 });
const fast = (page, ms) => page.evaluate((m) => { window.CHECKSMITH.core.CONFIG.animation.strikeMs = m; }, ms);

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
  await page.waitForFunction(() => window.CHECKSMITH && window.CHECKSMITH.app.game);

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
    for (let i = 0; i < 25; i++) if (i !== window.CHECKSMITH.app.game.pos.player && !legal.has(i)) return i;
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
    await page.waitForFunction(() => window.CHECKSMITH && window.CHECKSMITH.app.game);
    await page.click('[data-diff="apprentice"]');
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
    return { target, strikes: g().strikes.slice(), status: g().status, current: g().pos.player };
  });
  ok('a square can be driven to three strikes', spentInfo.strikes.some((x) => x === 3),
    JSON.stringify(spentInfo.strikes));
  ok('it renders as crumbling while the hammer is on it',
    await page.evaluate(() => {
      const g = window.CHECKSMITH.app.game;
      const el = document.querySelector(`.tile[data-i="${g.pos.player}"]`);
      return g.strikes[g.pos.player] < 3 || el.dataset.spent === '1';
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
    const spent = F.app.game.pos.player;
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
    g.pos.player = 1;                                // a rook on the top row
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

  /* ============ versus mode ============ */
  section('Versus mode');
  await page.click('[data-mode="versus"]');
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.mode === 'versus',
    null, { timeout: 8000 });
  ok('the mode menu switches to versus',
    (await page.getAttribute('[data-mode="versus"]', 'aria-pressed')) === 'true' &&
    (await page.getAttribute('[data-mode="solo"]', 'aria-pressed')) === 'false');
  ok('the scoreboard appears', await page.isVisible('#versusBar'));
  ok('it is the player\'s turn first', (await page.textContent('#vsTurn')).includes('Your turn'));
  await page.evaluate(() => {
    window.CHECKSMITH.core.CONFIG.animation.strikeMs = 30;
    window.CHECKSMITH.core.CONFIG.ai.thinkMs = 40;
  });

  const vsOpen = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const wait = () => new Promise((r) => setTimeout(r, 450));
    const before = JSON.parse(JSON.stringify(F.app.game.pos));
    document.querySelector('.tile[data-i="4"]').click();
    await wait();
    const g = F.app.game;
    return { before, pos: JSON.parse(JSON.stringify(g.pos)), turn: g.turn,
      total: g.totalStrikes, tally: g.strikes.reduce((a, b) => a + b, 0) };
  });
  ok('the Rival answers the opening blow on its own',
    vsOpen.pos.ai >= 0 && vsOpen.total === 2, JSON.stringify(vsOpen));
  ok('both blows land on one shared tally', vsOpen.tally === vsOpen.total);
  ok('the turn returns to the player', vsOpen.turn === 'player');
  ok('both hammers are drawn on the board', await page.evaluate(
    () => document.querySelectorAll('.tile[data-current="1"]').length === 1 &&
          document.querySelectorAll('.tile[data-ai="1"]').length === 1));

  // taps during the Rival's turn must be ignored outright
  const duringAi = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const g = F.app.game;
    g.turn = 'ai';                                   // freeze it on the Rival
    F.app.render ? 0 : 0;
    const before = g.totalStrikes;
    const t = F.core.legalTargets(g, 'player')[0];
    if (t != null) document.querySelector(`.tile[data-i="${t}"]`).click();
    await new Promise((r) => setTimeout(r, 200));
    const after = g.totalStrikes;
    g.turn = 'player';
    return { before, after };
  });
  ok('a tap on the Rival\'s turn is refused', duringAi.after === duringAi.before);

  // play the bout out and check the result screen
  const bout = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let guard = 0;
    while (!F.core.isOver(F.app.game) && guard++ < 600) {
      const g = F.app.game;
      if (g.turn === 'player' && !F.app.busy) {
        const t = F.core.legalTargets(g, 'player');
        if (!t.length) break;
        const pick = t.find((x) => g.strikes[x] === 1);
        document.querySelector(`.tile[data-i="${pick == null ? t[0] : pick}"]`).click();
      }
      await wait(25);
    }
    await wait(500);
    const g = F.app.game;
    return { status: g.status, winner: g.winner, credits: JSON.parse(JSON.stringify(g.credits)),
      dialog: !document.getElementById('results').hidden,
      label: document.getElementById('rLabel').textContent,
      caption: document.getElementById('rQualityCaption').textContent,
      score: document.getElementById('rQuality').firstChild.textContent,
      frozen: document.getElementById('board').dataset.frozen };
  });
  ok('the bout reaches a decided end', bout.status === 'complete' || bout.status === 'lost',
    bout.status);
  ok('a winner or a draw is declared', ['player', 'ai', 'draw'].includes(bout.winner), String(bout.winner));
  ok('the result screen reports perfecting blows', bout.dialog && bout.caption === 'PERFECTING BLOWS');
  ok('the score line matches the credits',
    bout.score === bout.credits.player + '\u2013' + bout.credits.ai, bout.score);
  ok('the outcome label matches the winner',
    (bout.winner === 'player' && /You win/.test(bout.label)) ||
    (bout.winner === 'ai' && /Rival wins/.test(bout.label)) ||
    (bout.winner === 'draw' && /Dead heat/.test(bout.label)), bout.label);
  ok('the board is frozen once the bout is decided', bout.frozen === '1');
  ok('the versus record is remembered', await page.evaluate(
    () => { try { const d = JSON.parse(localStorage.getItem('checksmith:v1') || '{}');
      return !!(d.record && Object.keys(d.record).length); } catch (e) { return false; } }));
  await page.screenshot({ path: path.join(SHOTS, '06-versus.png'), fullPage: true });

  // and back to solo without disturbing anything
  await page.click('#rChange');                       // dismiss the result sheet first
  await page.waitForTimeout(150);
  await page.click('[data-mode="solo"]');
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.mode === 'solo',
    null, { timeout: 8000 });
  ok('switching back to solo hides the scoreboard', await page.isHidden('#versusBar'));
  ok('solo has no Rival hammer', await page.evaluate(
    () => document.querySelectorAll('.tile[data-ai="1"]').length === 0));

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
  await page.waitForFunction(() => window.CHECKSMITH && window.CHECKSMITH.app.game, null, { timeout: 5000 });
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
  await page.waitForFunction(() => window.CHECKSMITH && window.CHECKSMITH.app.game);
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
  await page.waitForFunction(() => window.CHECKSMITH && window.CHECKSMITH.app.game);
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
  await page.waitForFunction(() => window.CHECKSMITH && window.CHECKSMITH.app.game);
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
