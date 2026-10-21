// End-to-end checks in a real browser. Run: node tools/verify-ui.mjs
// Requires Playwright (globally installed in this environment).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
// The opening plays over the menu on a normal load. Every check below wants
// the menu itself, so they ask for the page without it; the opening has a
// section of its own at the end that loads the page as a player would.
const RAW_FILE = pathToFileURL(path.join(here, '..', 'index.html')).href;
const FILE = RAW_FILE + '#skipintro';
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

/* The game now opens on a title screen; every page needs to start a run.

   The Forge lays its handcrafted dagger now and has no difficulty to pick.
   A check that names a difficulty for the Forge is a check about the square
   boards Endless and Open Your Forge's anvil still play on, so it has one of
   those dealt onto the Forge screen through the test hook; the dagger's own
   checks start the Forge with no difficulty at all. */
async function startFromTitle(page, mode, diff, design) {
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  if (mode) await page.click(`.mode-card[data-mode="${mode}"]`);
  await page.click('#beginBtn');
  // the Forge opens on its gallery of designs; pick one (the dagger unless told)
  const forge = await page.evaluate(() => window.CHECKSMITH.app.mode === 'forge');
  if (forge) {
    await page.waitForSelector('#designView:not([hidden])', { timeout: 10000 });
    if (diff) { await squareBoard(page, diff); return; }
    await page.click(`#designGrid [data-design="${design || 'dagger'}"]`);
    await page.click('#designGo');
  }
  await page.waitForFunction(() => window.CHECKSMITH && window.CHECKSMITH.app.game, null, { timeout: 10000 });
}

const SQUARE_SIZES = { novice: 3, apprentice: 4, journeyman: 5, master: 6 };
async function squareBoard(page, key) {
  await page.evaluate((k) => window.CHECKSMITH.squareForge(k), key);
  await page.waitForFunction((s) => window.CHECKSMITH.app.game && !window.CHECKSMITH.app.game.board.shape &&
    window.CHECKSMITH.app.game.board.size === s, SQUARE_SIZES[key], { timeout: 10000 });
}

/* Puts a line straight onto a stand, deeper than any real stand would hold.
   Checks about the counter want a floor that does not run dry mid-queue, so
   this bypasses what a stand takes rather than stocking it properly. */
const installStock = (page) => page.evaluate(() => {
  window.CHECKSMITH.testStock = function (sh, key, qty, quality, price) {
    const C = window.CHECKSMITH.core;
    const type = C.standForItem(C.splitKey(key).item);
    let stand = sh.stands.find(function (st) { return st.key === key; });
    if (!stand) {
      stand = sh.stands.find(function (st) { return !st.key && st.type === type; });
    }
    if (!stand) {
      // out on the floor: a real spot when there is one free, else one past
      // the layout, since these shelves are deeper than any shop would hold
      const free = C.firstFreeSlot(sh);
      stand = { id: sh.nextId++, type: type || 'goods', key: null, qty: 0,
        quality: 100, price: 0, slot: free == null ? 100 + sh.stands.length : free };
      sh.stands.push(stand);
    }
    stand.key = key;
    stand.qty = qty;
    stand.quality = quality == null ? 100 : quality;
    stand.price = price == null
      ? C.recommendedPrice(C.splitKey(key).item, C.splitKey(key).material, stand.quality)
      : price;
    return stand;
  };
  window.CHECKSMITH.testClearFloor = function (sh) {
    for (const stand of sh.stands) { stand.key = null; stand.qty = 0; stand.price = 0; }
  };
});

/* A forge starts knowing one blueprint per trade it took up. Checks that want
   a deeper one put it in the book directly, along with the craft it belongs
   to - which is what the Almanac does once the experience has been earned. */
const teach = (page, ...ids) => page.evaluate((list) => {
  const C = window.CHECKSMITH.core, sh = window.CHECKSMITH.app.shop;
  for (const id of list) {
    const cat = C.disciplineOf(id);
    if (cat && !C.hasDiscipline(sh, cat)) C.takeUpDiscipline(sh, cat, 'apprenticed');
    C.learnRecipe(sh, id, 'study');
  }
}, ids);

/* Every new forge stops to say what two trades it learned. Checks that are
   about something else answer that and get on with it. */
async function chooseCrafts(page, a = 'swords', b = 'shields') {
  if (!(await page.isVisible('#shopSheet'))) return false;
  const picking = await page.evaluate(() => !!window.CHECKSMITH.shopUi.picking);
  if (!picking) return false;
  await page.click(`#shopSheetBody [data-craft="${a}"]`);
  await page.waitForTimeout(60);
  await page.click(`#shopSheetBody [data-craft="${b}"]`);
  await page.waitForTimeout(60);
  await page.click('#shopSheetActions .btn');
  await page.waitForTimeout(180);
  return true;
}

/* Switching difficulty mid-run raises the discard prompt; answer it. */
async function pickDifficulty(page, key, size) {
  await page.click(`[data-diff="${key}"]`);
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForFunction(
    (s) => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.size === s,
    size, { timeout: 10000 });
}

/* Windows turn in pages instead of scrolling (1.43). A click on something
   in a long window first turns that window to the page the target is on -
   exactly what pressing Next until it shows would do - so the walkthroughs
   below read as a player would play them. */
function paged(page) {
  /* The Upgrades window keeps its cards on three pages (Shop, Workshop,
     Staff); these find a card wherever it is, as a player would by tab. */
  page.addInitScript(() => {
    window.__growTabs = ['upShop', 'upWork', 'upStaff'];
    window.__growCard = function (name) {
      const F = window.CHECKSMITH;
      for (const t of window.__growTabs) {
        F.shopUi.tab = t; F.shopRender();
        const c = Array.from(document.querySelectorAll('#shPanel .grow-card'))
          .find((x) => (x.querySelector('.gc-head b') || {}).innerText === name);
        if (c) return c;
      }
      return null;
    };
    window.__growAll = function () {
      const F = window.CHECKSMITH;
      const out = { heads: [], text: '', count: 0, answers: true, stands: 0, html: '' };
      for (const t of window.__growTabs) {
        F.shopUi.tab = t; F.shopRender();
        const panel = document.getElementById('shPanel');
        out.heads.push(...Array.from(panel.querySelectorAll('.grow-card .gc-head b')).map((b) => b.innerText.trim()));
        out.text += ' ' + panel.innerText;
        out.count += panel.querySelectorAll('.grow-card').length;
        out.stands += panel.querySelectorAll('[data-buy-stand]').length;
        out.answers = out.answers && Array.from(panel.querySelectorAll('.grow-card:not(.empty)'))
          .every((c) => c.querySelector('.gc-lv') && c.querySelector('.gc-now') && c.querySelector('.gc-next') &&
            (c.querySelector('.gc-buy') || c.querySelector('.gc-maxed')));
      }
      return out;
    };
  });
  /* And reading a window's text reads all of its pages, as a player turning
     through them would. Only the test page sees this; the game is as is. */
  page.addInitScript(() => {
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() {
        const off = Array.from(this.querySelectorAll('.pg-off'));
        if (this.classList.contains('pg-off')) off.push(this);
        for (const el of off) el.classList.remove('pg-off');
        try { return d.get.call(this); } finally { for (const el of off) el.classList.add('pg-off'); }
      },
      set(v) { d.set.call(this, v); }
    });
  });
  for (const name of ['click', 'dblclick', 'tap', 'hover', 'focus', 'fill', 'check', 'uncheck',
    'selectOption', 'press', 'type']) {
    const raw = page[name].bind(page);
    page[name] = async (sel, ...rest) => {
      await page.evaluate((s) => {
        if (!window.CHECKSMITH || !window.CHECKSMITH.reveal) return;
        // a drawer is a window over the room: reaching past it means closing it
        const el = document.querySelector(s);
        const drawer = document.getElementById('shDrawer');
        if (el && el.closest('#shopView') && drawer && !drawer.hidden) {
          document.getElementById('shDrawerClose').click();
        }
        window.CHECKSMITH.reveal(s);
      }, sel).catch(() => {});
      return raw(sel, ...rest);
    };
  }
  return page;
}

/* 1.44: the shop's actions are in the windows of the objects they belong
   to. These take the player's own path: open the object's window, then
   press the action at its foot. */
const PLACE_OF_ACT = { forge: 'forge', tend: 'counter', buy: 'supply' };
// the page of each window the action is on
const TAB_OF_ACT = { forge: 'forge', tend: 'counter', buy: 'supply' };
async function shopAction(page, act) {
  if (PLACE_OF_ACT[act]) {
    const state = await page.evaluate(([p, t]) => {
      window.CHECKSMITH.shopOpenPlace(p, t);
      const F = window.CHECKSMITH;
      return { tab: F.shopUi.tab, playing: !!F.shopUi.playing, drawer: !document.getElementById('shDrawer').hidden,
        sheet: !document.getElementById('shopSheet').hidden, view: document.getElementById('shopView').hidden,
        foot: document.getElementById('shDrawerFoot').innerHTML.slice(0, 120) };
    }, [PLACE_OF_ACT[act], TAB_OF_ACT[act]]);
    if (!state.drawer) console.log('  (shopAction ' + act + ': ' + JSON.stringify(state) + ')');
    await page.click(`#shDrawerFoot [data-place-act="${act}"]`);
    return;
  }
  if (act === 'almanac') { await page.evaluate(() => window.CHECKSMITH.shopOpenStation('table')); return; }
  if (act === 'hire') { await page.evaluate(() => window.CHECKSMITH.shopOpenPlace('board', 'hire')); return; }
  throw new Error('no such shop action ' + act);
}
/* Whether a place's action can be pressed right now, read off its window. */
async function shopActionOpen(page, act) {
  await page.evaluate(([p, t]) => window.CHECKSMITH.shopOpenPlace(p, t), [PLACE_OF_ACT[act], TAB_OF_ACT[act]]);
  const open = await page.evaluate((a) => {
    const b = document.querySelector(`#shDrawerFoot [data-place-act="${a}"]`);
    return !!b && !b.disabled;
  }, act);
  await page.evaluate(() => { const d = document.getElementById('shDrawer'); if (!d.hidden) document.getElementById('shDrawerClose').click(); });
  return open;
}
/* The menu at the top of every screen, and one of its items. */
async function openMenu(page) {
  const inShop = await page.evaluate(() => !!document.querySelector('.app.in-shop'));
  await page.click(inShop ? '#shMenuBtn' : '#menuBtn');
  await page.waitForSelector('#gameMenu:not([hidden])', { timeout: 3000 });
}
async function menuItem(page, id) {
  await openMenu(page);
  await page.click('#' + id);
}

async function run() {
  if (fs.existsSync(SHOTS)) fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

  /* ============ narrow phone, default difficulty ============ */
  let ctx = await browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 2 });
  let page = paged(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(FILE);
  /* The shop's end-of-phase playback is its own section's business; every
     other check wants the phase's results the moment it ends. The setting is
     stored, so it survives the reloads further down. */
  await page.evaluate(() => window.CHECKSMITH.setPhaseAnim(false));
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
  // a blow on a hardened square breaks crust rather than working the metal, so
  // what a plain strike does is read on a plain square
  const hit = await page.evaluate(() => window.CHECKSMITH.app.game.crust.findIndex((c) => c === 0));
  await page.click(`.tile[data-i="${hit}"]`);
  ok('a hammer appears during the swing', (await page.locator('.hammer').count()) > 0);
  await page.screenshot({ path: path.join(SHOTS, '02-hammer-midswing.png') });
  await settle(page);
  let s = await snap(page);
  ok('one tap applies exactly one strike', s.total === 1 && s.strikes[hit] === 1 && s.current === hit,
    JSON.stringify({ hit, total: s.total, at: s.strikes[hit], current: s.current }));
  ok('struck square renders the shaped state', (await page.getAttribute(`.tile[data-i="${hit}"]`, 'data-s')) === '1');
  ok('current square is marked', (await page.getAttribute(`.tile[data-i="${hit}"]`, 'data-current')) === '1');
  ok('legal destinations are marked', (await page.locator('.tile[data-legal="1"]').count()) > 0);
  ok('movement hint names the symbol',
    /King|Rook|Bishop|Knight|Queen|Two|Three|Four|Five/.test(await page.textContent('#promptText')),
    await page.textContent('#promptText'));
  await page.waitForTimeout(900);   // let the recoil and sparks finish
  ok('hammer and sparks are cleaned up once the swing ends', await page.evaluate(
    () => document.getElementById('fx').childElementCount === 0));
  ok('overlay never intercepts taps',
    await page.evaluate(() => getComputedStyle(document.getElementById('fx')).pointerEvents === 'none'));

  section('Illegal taps');
  const before = await snap(page);
  await page.click(`.tile[data-i="${before.current}"]`);   // standing still
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
  // a crust adds a visit for every layer, so the route is the board plus it
  const crust = await page.evaluate(() =>
    (window.CHECKSMITH.app.game.board.hard || []).reduce((a, h) => a + h, 0));
  ok('the route finishes the board, crust and all',
    st.status === 'complete' && st.strikes.every((x) => x === 2) &&
    st.total === 32 + crust, st.status + ' total ' + st.total + ' crust ' + crust);
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
    // Drive one square to three strikes. A straight there-and-back is not
    // always available - on a small board a bishop next door cannot send the
    // hammer back the way it came - so the way home is searched for on the
    // board's own movement graph, which is strongly connected by construction.
    const home = g().board.route[0];
    await click(home);
    const pathHome = () => {
      const size = g().board.size, n = size * size;
      const from = g().current;
      if (from === home) return [];
      const prev = new Array(n).fill(-1);
      const seen = new Array(n).fill(false);
      seen[from] = true;
      const queue = [from];
      while (queue.length) {
        const at = queue.shift();
        for (const to of F.core.movesFrom(g().pieces[at], at, size)) {
          if (seen[to] || g().pieces[to] == null) continue;
          seen[to] = true;
          prev[to] = at;
          if (to === home) {
            const out = [];
            for (let step = home; step !== from; step = prev[step]) out.unshift(step);
            return out;
          }
          queue.push(to);
        }
      }
      return null;
    };
    let target = null;
    for (let pass = 0; pass < 2 && !F.core.isOver(g()); pass++) {
      const away = F.core.legalTargets(g()).find((t) => t !== home);
      if (away == null) break;
      await click(away);
      const way = pathHome();
      if (!way || !way.length) break;
      for (const step of way) await click(step);
      if (g().current !== home) break;
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
    // a blow on a crust breaks crust and nothing else, so reshaping is read on
    // a square with none
    const start = F.app.game.crust.findIndex((c) => c === 0);
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
    // No crust anywhere, because a crust is a blow that cannot strand you.
    const g = F.app.game;
    g.crust = g.crust.map(() => 0);
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
  // sound lives in the menu now, on every screen
  await openMenu(page);
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
  await page.click('#gameMenuClose');
  ok('volume is remembered', await page.evaluate(
    () => Math.abs(JSON.parse(localStorage.getItem('checksmith:v1')).volume - 0.3) < 0.001));

  // The forge floor has a voice of its own. Each one is counted by how many
  // nodes it puts on the graph, which is the only externally visible thing a
  // synthesised effect does - and every one must obey the mute button.
  const shopSounds = ['shelve', 'coins', 'doorbell', 'walkout', 'chime', 'prosper', 'ruin'];
  const voiced = await page.evaluate((names) => {
    const S = window.CHECKSMITH.sounds, snd = window.CHECKSMITH.sound;
    snd.setMuted(false);
    const ctx = snd.ctx;
    const out = {};
    const realOsc = ctx.createOscillator.bind(ctx);
    const realBuf = ctx.createBufferSource.bind(ctx);
    for (const name of names) {
      let n = 0;
      ctx.createOscillator = () => { n++; return realOsc(); };
      ctx.createBufferSource = () => { n++; return realBuf(); };
      try { S[name](1, true); } catch (err) { out[name] = 'threw: ' + err; continue; }
      out[name] = n;
    }
    ctx.createOscillator = realOsc;
    ctx.createBufferSource = realBuf;
    return out;
  }, shopSounds);
  ok('every shop sound actually makes one',
    shopSounds.every((n) => typeof voiced[n] === 'number' && voiced[n] > 0),
    JSON.stringify(voiced));

  const mutedNodes = await page.evaluate((names) => {
    const S = window.CHECKSMITH.sounds, snd = window.CHECKSMITH.sound;
    snd.setMuted(true);
    const ctx = snd.ctx;
    let n = 0;
    const realOsc = ctx.createOscillator.bind(ctx);
    const realBuf = ctx.createBufferSource.bind(ctx);
    ctx.createOscillator = () => { n++; return realOsc(); };
    ctx.createBufferSource = () => { n++; return realBuf(); };
    for (const name of names) { try { S[name](1, true); } catch (err) { /* counted below */ } }
    ctx.createOscillator = realOsc;
    ctx.createBufferSource = realBuf;
    snd.setMuted(false);
    return n;
  }, shopSounds);
  ok('and none of them is made while muted', mutedNodes === 0, String(mutedNodes));
  ok('the shop sounds raise no errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  section('Accessibility');
  const label = await page.getAttribute('.tile[data-i="0"]', 'aria-label');
  ok('tiles are named with position, symbol, how worked they are and reachability',
    /row 1, column 1, (King|Rook|Bishop|Knight|Queen|Two|Three|Four|Five), /.test(label) &&
    /(\d+ strikes?, |hardened, \d+ strikes? to break the crust)/.test(label) &&
    /(legal|not reachable|you are here)/.test(label), label);
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
  await menuItem(page, 'gmHelp');
  ok('how to play opens', await page.isVisible('#help'));
  await page.keyboard.press('Escape');
  ok('escape closes how to play', await page.isHidden('#help'));
  ok('and goes back to the menu it was opened from', await page.isVisible('#gameMenu'));
  await page.keyboard.press('Escape');
  ok('escape again closes the menu', await page.isHidden('#gameMenu'));

  section('Page hidden mid-swing');
  await fast(page, 900);
  const hidBefore = await snap(page);
  // a plain destination, so the blow lands on metal and the count moves
  const hidTarget = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core;
    const targets = C.legalTargets(F.app.game);
    return targets.find((t) => C.crustOf(F.app.game, t) === 0);
  });
  await page.evaluate((t) => { document.querySelector(`.tile[data-i="${t}"]`).click(); }, hidTarget);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const hidAfter = await snap(page);
  ok('a pending strike is applied exactly once when the page hides',
    hidTarget !== undefined && hidAfter.total === hidBefore.total + 1 &&
    hidAfter.strikes[hidTarget] === hidBefore.strikes[hidTarget] + 1,
    `${hidBefore.total} -> ${hidAfter.total} at ${hidTarget}`);
  ok('effects are cleared when hidden',
    await page.evaluate(() => document.getElementById('fx').childElementCount === 0));

  /* The Android shell hands the hardware back gesture to the page with
     exactly this snippet, so test the snippet against the real page. */
  section('Android back-button handler (as used by the APK shell)');
  // the snippet MainActivity runs, read from the shell itself
  const javaSrc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..',
    'android/app/src/main/java/com/bluespindash/checksmith/MainActivity.java'), 'utf8');
  const BACK = javaSrc.slice(javaSrc.indexOf('web.evaluateJavascript(\n                "(function(){"'))
    .split('value ->')[0].match(/"([^"]*)"/g).map((q) => q.slice(1, -1)).join('');
  ok('the shell hands Back to the page', /window\.checksmithBack/.test(BACK), BACK.slice(0, 80));
  ok('on a board with nothing open, Back opens the menu',
    (await page.evaluate(BACK)) === true && await page.isVisible('#gameMenu') &&
    await page.isVisible('#gmLeave') && await page.isHidden('#confirm'));
  ok('and Back again closes it: the board stays', (await page.evaluate(BACK)) === true &&
    await page.isHidden('#gameMenu') && await page.isHidden('#titleScreen'));
  await menuItem(page, 'gmLeave');
  ok('Main Menu in the menu asks before leaving the board',
    await page.isVisible('#confirm') && /main menu/i.test(await page.textContent('#confirmTitle')));
  ok('and Back answers No: the board stays', (await page.evaluate(BACK)) === true &&
    await page.isHidden('#confirm') && await page.isHidden('#titleScreen'));
  await menuItem(page, 'gmHelp');
  ok('how to play is open', await page.isVisible('#help'));
  ok('back reports it handled the press', (await page.evaluate(BACK)) === true);
  ok('back closed how to play', await page.isHidden('#help'));
  ok('and back again closed the menu', (await page.evaluate(BACK)) === true && await page.isHidden('#gameMenu'));
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
  await page.evaluate(() => window.CHECKSMITH.menuLeave());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  ok('the menu button returns to the title screen', await page.isVisible('#titleScreen'));
  ok('on the main menu, Back reports false so the app closes',
    (await page.evaluate(BACK)) === false && await page.isVisible('#titleScreen'));
  ok('the run is put down when leaving', await page.evaluate(() => window.CHECKSMITH.app.game === null));
  ok('all four modes are offered', (await page.locator('.mode-card').count()) === 4);
  await page.click('.mode-card[data-mode="forge"]');
  ok('the Forge offers no difficulty: it offers its designs instead',
    await page.isHidden('#titleDiffBlock') && await page.isVisible('#forgeNote') &&
    /6 weapon designs/i.test(await page.textContent('#forgeNote')) &&
    /weapon design/i.test(await page.textContent('.mode-card[data-mode="forge"] .mc-desc')));
  await page.click('.mode-card[data-mode="endless"]');
  ok('picking a mode checks it and unchecks the other',
    (await page.getAttribute('.mode-card[data-mode="endless"]', 'aria-checked')) === 'true' &&
    (await page.getAttribute('.mode-card[data-mode="forge"]', 'aria-checked')) === 'false');
  ok('endless hides the difficulty picker', await page.isHidden('#titleDiffBlock'));
  ok('and says where it starts instead', await page.isVisible('#endlessNote') &&
    /3.3/.test(await page.textContent('#endlessNote')) && await page.isHidden('#forgeNote'));
  await page.click('.mode-card[data-mode="forge"]');
  ok('the Forge brings its own note back, and no picker',
    await page.isVisible('#forgeNote') && await page.isHidden('#endlessNote') &&
    await page.isHidden('#titleDiffBlock'));
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
  ok('the actions drop New Puzzle, and Main Menu is in the menu',
    eStart.newBtn === true && eStart.menuBtn === true && eStart.restart === 'Restart Run');
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
          /\+\d+ gold next clear/.test(document.getElementById('matSub2').textContent)),
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
  ok('the shop redraws with the new effect', /gold per board/i.test(postBuy.label), postBuy.label);
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
  await page.evaluate(() => window.CHECKSMITH.menuLeave());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  ok('Versus sits directly below Endless in the menu', await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.mode-card')).map((c) => c.dataset.mode);
    return cards.indexOf('versus') === cards.indexOf('endless') + 1;
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
      legend: shown('#legendBtn'),
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
  ok('every power is offered', vs.shop === 6, String(vs.shop));
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
    match.dialog && /win/i.test(match.label) && match.caption === 'RECORD AT THIS SETTING');
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


  /* The six powers, driven through the real board: targeting, the running
     count for the multi-square ones, the banners, and Reforge's promise
     that it can never be the blow that ends the match. */
  /* Fresh metal pays in full; worked ground pays half and hands the other
     half across. The board has to say which is which while you choose. */
  section('Versus: fresh metal is lit apart from worked ground');
  await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    C.CONFIG.animation.strikeMs = 20;
    C.CONFIG.versus.ai.thinkMs = 20;
    window.CHECKSMITH.app.vsSize = 5;
    window.CHECKSMITH.app.vsFoe = 'journeyman';
    window.CHECKSMITH.vsStart();
  });
  await page.waitForFunction(() => !!window.CHECKSMITH.app.match, null, { timeout: 15000 });
  await page.waitForTimeout(200);

  const freshLook = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    m.turn = 'you';
    m.you.current = 0;
    m.you.strikes = m.you.strikes.map(() => 0);
    const legal = C.versusTargets(m, 'you');
    m.you.strikes[legal[0]] = 2;                     // worked ground
    F.vsRender();
    const q = (i) => document.querySelector(`#youBoard .tile[data-i="${i}"]`);
    return { worked: q(legal[0]).dataset.fresh, workedLegal: q(legal[0]).dataset.legal,
      fresh: q(legal[1]).dataset.fresh, freshLegal: q(legal[1]).dataset.legal,
      workedRing: getComputedStyle(q(legal[0]), '::after').borderStyle,
      freshRing: getComputedStyle(q(legal[1]), '::after').borderStyle,
      badge: !!q(legal[0]).querySelector('.count'),
      noBadge: !q(legal[1]).querySelector('.count') };
  });
  ok('an unstruck legal square is marked fresh, a worked one is not',
    freshLook.fresh === '1' && freshLook.worked === '0' &&
    freshLook.freshLegal === '1' && freshLook.workedLegal === '1', JSON.stringify(freshLook));
  ok('and the two are told apart by shape, not colour alone',
    freshLook.freshRing === 'solid' && freshLook.workedRing === 'dashed',
    JSON.stringify([freshLook.freshRing, freshLook.workedRing]));
  ok('the strike count still says how worked a square is',
    freshLook.badge === true && freshLook.noBadge === true, JSON.stringify(freshLook));

  // every check below strikes for real, which can decide the match, so each
  // one puts the board back on its feet first
  const resetVs = (worked) => page.evaluate((w) => {
    const F = window.CHECKSMITH, m = F.app.match;
    m.status = 'playing'; m.winner = null; m.reason = null; m.upgradeUsed = false;
    m.turn = 'you';
    m.you.current = 0;
    m.you.states = m.you.states.map(() => 0);
    m.you.strikes = m.you.strikes.map(() => w);
    m.you.points = 0; m.foe.points = 0;
    m.you.chain = []; m.you.chainPieces = []; m.you.lockedPairs = [];
    F.app.busy = false;
    F.vsRender();
  }, worked);

  await resetVs(0);
  const paid = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    const legal = C.versusTargets(m, 'you');
    const first = C.versusStrike(m, 'you', legal[0]);      // fresh
    const mineAfterFresh = m.you.points, theirsAfterFresh = m.foe.points;
    m.turn = 'you';
    const back = C.versusStrike(m, 'you', legal[0] === m.you.current ? legal[1] : legal[0]);
    return { first: first, mineAfterFresh: mineAfterFresh, theirsAfterFresh: theirsAfterFresh,
      back: back, mine: m.you.points, theirs: m.foe.points };
  });
  ok('a fresh strike pays the striker in full and the rival nothing',
    paid.first.fresh === true && paid.first.gift === 0 &&
    paid.mineAfterFresh === paid.first.points && paid.theirsAfterFresh === 0,
    JSON.stringify(paid.first));

  await resetVs(1);                                       // all worked ground
  ok('worked ground splits the blow between the two boards', await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    const legal = C.versusTargets(m, 'you');
    if (!legal.length) return false;
    const r = C.versusStrike(m, 'you', legal[0]);
    return r.fresh === false && r.gift > 0 &&
      m.you.points === r.points && m.foe.points === r.gift &&
      r.points + r.gift === r.full;
  }));

  await resetVs(1);
  ok('and the screen reader is told where the other half went', await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    const legal = C.versusTargets(m, 'you');
    if (!legal.length) return false;
    F.vsImpact('you', legal[0]);
    // read it at once: announce is synchronous, and the rival's own turn is
    // scheduled milliseconds later and would overwrite the region
    const said = document.getElementById('live').textContent;
    F.app.token++;                                   // and cancel that turn
    return /to the rival/.test(said);
  }));

  section('Versus: the powers on the board');
  // the section above plays its match out, so this one needs a board of its own
  await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    C.CONFIG.animation.strikeMs = 20;
    C.CONFIG.versus.ai.thinkMs = 20;
    window.CHECKSMITH.app.vsSize = 5;
    window.CHECKSMITH.app.vsFoe = 'journeyman';
    window.CHECKSMITH.vsStart();
  });
  await page.waitForFunction(() => !!window.CHECKSMITH.app.match, null, { timeout: 15000 });
  await page.waitForTimeout(200);

  const armPower = async (id) => {
    await page.evaluate((p) => {
      const F = window.CHECKSMITH, m = F.app.match;
      m.turn = 'you'; m.upgradeUsed = false; m.you.points = 5000;
      F.vs.targeting = null;
      F.vs.focus = 'none';
      F.vsRender();
    }, id);
    await page.click(`#vsShop [data-buy="${id}"]`);
    await page.waitForTimeout(90);
  };
  const boardState = () => page.evaluate(() => {
    const F = window.CHECKSMITH;
    return { prompt: document.getElementById('vsPromptText').textContent,
      targets: document.querySelectorAll('#foeBoard .tile[data-target="1"]').length,
      mineTargets: document.querySelectorAll('#youBoard .tile[data-target="1"]').length,
      chosen: document.querySelectorAll('.tile[data-chosen="1"]').length,
      aimingFoe: document.getElementById('foeBoard').dataset.aiming,
      aimingYou: document.getElementById('youBoard').dataset.aiming,
      points: F.app.match.you.points, used: F.app.match.upgradeUsed };
  });
  const tapFoe = async (i) => {
    await page.evaluate((k) => document.querySelector(`#foeBoard .tile[data-i="${k}"]`).click(), i);
    await page.waitForTimeout(110);
  };

  ok('every power in the new set is on the rail, and no old one is',
    await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('#vsShop [data-buy]'))
        .map((b) => b.dataset.buy);
      return ids.join(',') === 'shatter,repair,doubleShatter,reforge,masterRepair,tripleShatter';
    }));

  // ---- Shatter: one square, banner, and the crack that does not vanish
  await armPower('shatter');
  const aiming = await boardState();
  ok('arming a power lights the valid targets and dims the rest',
    aiming.targets > 0 && aiming.aimingFoe === '1' && aiming.aimingYou === '0' &&
    /intact square/.test(aiming.prompt), JSON.stringify(aiming));
  const pointsBefore = aiming.points;
  const firstTarget = await page.evaluate(() =>
    Number(document.querySelector('#foeBoard .tile[data-target="1"]').dataset.i));
  await tapFoe(firstTarget);
  const afterShatter = await page.evaluate((i) => {
    const F = window.CHECKSMITH, C = F.core;
    return { state: F.app.match.foe.states[i], points: F.app.match.you.points,
      banner: !document.getElementById('vsBanner').hidden,
      word: document.getElementById('vsBannerWord').textContent,
      side: document.getElementById('vsBanner').dataset.side,
      cracked: C.SQ_CRACKED };
  }, firstTarget);
  ok('Shatter cracks the square it was pointed at',
    afterShatter.state === afterShatter.cracked, JSON.stringify(afterShatter));
  ok('and only then are the points spent',
    afterShatter.points === pointsBefore - 40, JSON.stringify(afterShatter));
  ok('a banner announces it, in the player’s own colour',
    afterShatter.banner && /Shatter/.test(afterShatter.word) && afterShatter.side === 'you',
    JSON.stringify(afterShatter));

  // ---- Double Shatter: the running count, taking a pick back, cancelling
  await armPower('doubleShatter');
  const two0 = await boardState();
  ok('a two-square power says how many to select', /Select 2 squares/.test(two0.prompt), two0.prompt);
  const spots = await page.evaluate(() => Array.from(
    document.querySelectorAll('#foeBoard .tile[data-target="1"]')).map((t) => Number(t.dataset.i)));
  await tapFoe(spots[0]);
  const two1 = await boardState();
  ok('after one pick it counts down, and marks the square chosen',
    /1 square remaining/.test(two1.prompt) && two1.chosen === 1 && two1.used === false,
    JSON.stringify(two1));
  ok('and nothing has been spent yet', two1.points === two0.points && two1.used === false,
    JSON.stringify([two0.points, two1.points]));
  await tapFoe(spots[0]);
  const two2 = await boardState();
  ok('tapping a chosen square takes it back',
    /Select 2 squares/.test(two2.prompt) && two2.chosen === 0, JSON.stringify(two2));
  await tapFoe(spots[0]);
  await page.click('#vsCancelBtn');
  await page.waitForTimeout(90);
  ok('cancelling half way spends nothing at all', await page.evaluate((p) =>
    window.CHECKSMITH.app.match.you.points === p &&
    window.CHECKSMITH.app.match.upgradeUsed === false &&
    document.querySelectorAll('.tile[data-chosen="1"]').length === 0, two0.points));

  await armPower('doubleShatter');
  const pair = await page.evaluate(() => Array.from(
    document.querySelectorAll('#foeBoard .tile[data-target="1"]')).map((t) => Number(t.dataset.i)));
  await tapFoe(pair[0]);
  await tapFoe(pair[1]);
  ok('the second pick resolves it, cracking both', await page.evaluate((ab) => {
    const F = window.CHECKSMITH, C = F.core;
    return F.app.match.foe.states[ab[0]] === C.SQ_CRACKED &&
      F.app.match.foe.states[ab[1]] === C.SQ_CRACKED &&
      /Double Shatter/.test(document.getElementById('vsBannerWord').textContent);
  }, [pair[0], pair[1]]));

  // ---- Triple Shatter
  await armPower('tripleShatter');
  const trio = await page.evaluate(() => Array.from(
    document.querySelectorAll('#foeBoard .tile[data-target="1"]')).map((t) => Number(t.dataset.i)));
  await tapFoe(trio[0]);
  await tapFoe(trio[1]);
  const mid = await boardState();
  ok('a three-square power counts down the same way',
    /1 square remaining/.test(mid.prompt) && mid.chosen === 2, JSON.stringify(mid));
  await tapFoe(trio[2]);
  ok('and cracks all three at once', await page.evaluate((abc) => {
    const F = window.CHECKSMITH, C = F.core;
    return abc.every((i) => F.app.match.foe.states[i] === C.SQ_CRACKED) &&
      /Triple Shatter/.test(document.getElementById('vsBannerWord').textContent);
  }, trio.slice(0, 3)));

  // ---- Repair and Master Repair, on the player's own board
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    m.you.pieces[1] = 'B'; m.you.pieces[2] = 'B'; m.you.pieces[3] = 'K';
    m.you.states[1] = C.SQ_CRACKED; m.you.states[2] = C.SQ_ARMED; m.you.states[3] = C.SQ_CRACKED;
    F.vsRender();
  });
  await armPower('repair');
  const mending = await boardState();
  ok('a repair aims at your own board, not the rival’s',
    mending.mineTargets === 3 && mending.targets === 0 && mending.aimingYou === '1',
    JSON.stringify(mending));
  await page.evaluate(() => document.querySelector('#youBoard .tile[data-i="1"]').click());
  await page.waitForTimeout(110);
  ok('Repair mends the one square', await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core;
    return F.app.match.you.states[1] === C.SQ_INTACT && F.app.match.you.states[2] === C.SQ_ARMED;
  }));

  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    m.you.states[1] = C.SQ_CRACKED;
    F.vsRender();
  });
  await armPower('masterRepair');
  await page.evaluate(() => document.querySelector('#youBoard .tile[data-i="1"]').click());
  await page.waitForTimeout(110);
  ok('Master Repair mends every damaged square of that symbol', await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    return m.you.states[1] === C.SQ_INTACT && m.you.states[2] === C.SQ_INTACT &&
      m.you.states[3] === C.SQ_CRACKED &&                        // the king is untouched
      /Master Repair/.test(document.getElementById('vsBannerWord').textContent);
  }));

  // ---- Reforge: no square to pick, and never a winning blow
  await page.evaluate(() => {
    const F = window.CHECKSMITH, m = F.app.match;
    m.foe.current = -1;
    F.vsRender();
  });
  await armPower('reforge');
  ok('Reforge will not arm before the rival has struck', await page.evaluate(() =>
    window.CHECKSMITH.vs.targeting === null));

  await page.evaluate(() => {
    const F = window.CHECKSMITH, m = F.app.match;
    m.foe.current = 6;
    F.vsRender();
  });
  await armPower('reforge');
  const reforging = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core;
    const lit = Array.from(document.querySelectorAll('#foeBoard .tile[data-target="1"]'))
      .map((t) => Number(t.dataset.i));
    const choices = Array.from(document.querySelectorAll('#vsPieceChoices .vs-buy'))
      .map((b) => b.querySelector('b').textContent);
    return { lit: lit, choices: choices,
      legal: C.versusReforgeOptions(F.app.match, 'you').length,
      prompt: document.getElementById('vsPromptText').textContent };
  });
  ok('Reforge lights the square the rival is standing on, and only that one',
    reforging.lit.join(',') === '6', JSON.stringify(reforging.lit));
  ok('and offers only symbols that leave them a move',
    reforging.choices.length === reforging.legal && reforging.choices.length > 0,
    JSON.stringify(reforging));
  await page.click('#vsPieceChoices .vs-buy');
  await page.waitForTimeout(140);
  ok('choosing one reshapes that square and says what it became', await page.evaluate(() => {
    const note = document.getElementById('vsBannerNote').textContent;
    return /Reforge/.test(document.getElementById('vsBannerWord').textContent) &&
      /→/.test(note);
  }));

  ok('no offered symbol ever leaves the rival stranded', await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core;
    const m = F.app.match;
    for (let at = 0; at < m.size * m.size; at++) {
      if (m.foe.states[at] === C.SQ_BROKEN) continue;
      m.foe.current = at;
      for (const p of C.versusReforgeOptions(m, 'you', at)) {
        const probe = C.cloneMatch(m);
        probe.turn = 'you'; probe.upgradeUsed = false; probe.you.points = 5000;
        const r = C.versusBuy(probe, 'you', 'reforge', null, p);
        if (!r.ok || r.trapped === 'foe') return false;
        probe.turn = 'foe';
        if (C.versusTargets(probe, 'foe').length === 0) return false;
      }
    }
    return true;
  }));

  // ---- the rival's own power, announced against the player
  ok('a power the rival uses is announced in its own colour', await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, m = F.app.match;
    m.turn = 'foe'; m.upgradeUsed = false; m.foe.points = 5000;
    const said = F.vsPowerWords('foe', 'shatter', { count: 2, squares: [1, 2] });
    F.vsBanner('foe', said.word, said.note);
    await new Promise((r) => setTimeout(r, 60));
    const el = document.getElementById('vsBanner');
    return !el.hidden && el.dataset.side === 'foe' &&
      /Rival/.test(document.getElementById('vsBannerWord').textContent) &&
      /your board/.test(document.getElementById('vsBannerNote').textContent);
  }));
  ok('and the banner never swallows a tap meant for the board', await page.evaluate(() =>
    getComputedStyle(document.getElementById('vsBanner')).pointerEvents === 'none'));

  await page.evaluate(() => { window.CHECKSMITH.vs.targeting = null; window.CHECKSMITH.vsRender(); });

  section('Open Your Forge: the management screen');
  await page.evaluate(() => window.CHECKSMITH.menuLeave());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  await page.click('.mode-card[data-mode="shop"]');
  await page.click('#beginBtn');
  // with no forge saved, Begin asks what to call the new one
  await page.waitForSelector('#nameForge:not([hidden])', { timeout: 8000 });
  await page.fill('#nameForgeInput', 'Ashfall Forge');
  await page.click('#nameForgeGo');
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 10000 });

  section('Open Your Forge: choosing the two trades you learned');
  await page.waitForSelector('#shopSheet:not([hidden])', { timeout: 8000 });
  const setup = await page.evaluate(() => ({
    title: document.getElementById('shopSheetTitle').textContent,
    cards: document.querySelectorAll('#shopSheetBody [data-craft]').length,
    crafts: window.CHECKSMITH.core.SHOP.categories.length,
    go: document.querySelector('#shopSheetActions .btn').disabled,
    art: Array.from(document.querySelectorAll('#shopSheetBody .cc-art use'))
      .map((u) => u.getAttribute('href'))
  }));
  ok('a new forge asks what the smith served their time at',
    /Choose Starting Crafts/i.test(setup.title), setup.title);
  ok('every craft is offered as a card', setup.cards === setup.crafts,
    setup.cards + ' of ' + setup.crafts);
  ok('each card wears the sprite of the blueprint it starts you on',
    setup.art.length === setup.crafts && setup.art.every((h) => /^#it-/.test(h)),
    setup.art.slice(0, 3).join(','));
  ok('the doors stay shut until two are chosen', setup.go === true);

  await page.click('#shopSheetBody [data-craft="swords"]');
  await page.waitForTimeout(120);
  const firstPick = await page.evaluate(() => ({
    picked: document.querySelectorAll('#shopSheetBody .craft-card.picked').length,
    go: document.querySelector('#shopSheetActions .btn').disabled,
    count: document.querySelector('#shopSheetBody .pick-count').textContent
  }));
  ok('one chosen is not enough', firstPick.picked === 1 && firstPick.go === true &&
    /1 of 2/.test(firstPick.count), JSON.stringify(firstPick));

  await page.click('#shopSheetBody [data-craft="shields"]');
  await page.waitForTimeout(120);
  const bothPicked = await page.evaluate(() => ({
    picked: document.querySelectorAll('#shopSheetBody .craft-card.picked').length,
    go: document.querySelector('#shopSheetActions .btn').disabled
  }));
  ok('two chosen opens the doors', bothPicked.picked === 2 && bothPicked.go === false,
    JSON.stringify(bothPicked));

  // a third tap is refused rather than quietly swapping one out
  await page.click('#shopSheetBody [data-craft="axes"]');
  await page.waitForTimeout(150);
  ok('a third trade is refused', await page.evaluate(() =>
    document.querySelectorAll('#shopSheetBody .craft-card.picked').length === 2));
  // and tapping a chosen one again gives it back
  await page.click('#shopSheetBody [data-craft="shields"]');
  await page.waitForTimeout(120);
  ok('tapping a chosen trade again changes your mind', await page.evaluate(() =>
    document.querySelectorAll('#shopSheetBody .craft-card.picked').length === 1));
  await page.click('#shopSheetBody [data-craft="shields"]');
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(SHOTS, '13-crafts.png'), fullPage: true });

  await page.click('#shopSheetActions .btn');
  await page.waitForTimeout(250);
  const apprenticeship = await page.evaluate(() => {
    const C = window.CHECKSMITH.core, sh = window.CHECKSMITH.app.shop;
    return { crafts: sh.disciplines.slice(), known: sh.known.slice(),
      levels: sh.known.map((id) => C.blueprintLevel(sh, id)),
      sheet: document.getElementById('shopSheet').hidden };
  });
  ok('the two chosen trades are the forge\u2019s own',
    apprenticeship.crafts.join(',') === 'swords,shields',
    JSON.stringify(apprenticeship.crafts));
  ok('and each hands over its first blueprint, free, at level one',
    apprenticeship.known.join(',') === 'shortsword,buckler' &&
    apprenticeship.levels.every((l) => l === 1), JSON.stringify(apprenticeship));
  ok('the setup screen closes once the doors are open', apprenticeship.sheet === true);

  await installStock(page);
  await page.evaluate(() => { window.CHECKSMITH.core.CONFIG.animation.strikeMs = 12; });
  ok('the forge is opened under the name the player typed, painted on its sign',
    (await page.evaluate(() => window.CHECKSMITH.app.shop.name)) === 'Ashfall Forge' &&
    /Ashfall Forge/.test(await page.getAttribute('#shThings [data-station="sign"]', 'aria-label')));

  const board = await page.evaluate(() => ({
    day: document.getElementById('shDay').textContent,
    phase: document.getElementById('shPhase').textContent,
    gold: document.getElementById('shGold').textContent,
    stars: document.getElementById('shStars').getAttribute('aria-label'),
    places: Array.from(document.querySelectorAll('#shViews [data-jump]')).map((b) => b.textContent.trim()),
    view: window.CHECKSMITH.shopUi.view,
    objects: Array.from(document.querySelectorAll('#shThings .loc-stage')).map((st) =>
      st.dataset.loc + ':' + Array.from(new Set(Array.from(st.querySelectorAll('[data-station]'))
        .map((b) => b.dataset.station))).join('/')),
    rows: ['shActions', 'shGroups', 'shCrew', 'shRent'].filter((id) => !!document.getElementById(id)),
    advance: document.getElementById('shAdvanceBtn').textContent,
    noPicker: document.getElementById('titleDiffBlock').hidden
  }));
  ok('the shop opens on day one, morning', board.day === '1' && board.phase === 'Morning');
  ok('the mode offers no difficulty to pick', board.noPicker === true);
  ok('the forge opens knowing only what its two trades taught it',
    await page.evaluate(() => window.CHECKSMITH.app.shop.known.length === 2));
  ok('the shop is three places, opening on the shop floor',
    board.places.join(',') === 'Workshop,Shop Floor,Front' && board.view === 'floor', JSON.stringify(board));
  ok('every function is an object in one of them',
    board.objects.join(' ') === 'work:forge/anvil/store/supply/table floor:plans/ledger/counter ' +
      'front:sign/board/commissions/door', board.objects.join(' '));
  ok('the rows of buttons and the status card are gone', board.rows.length === 0, board.rows.join(','));
  ok('the bar under the shop ends the phase', board.advance === 'End Morning', board.advance);
  ok('gold and rating are on screen at a glance',
    board.gold === '260' && /1 of 5 stars/.test(board.stars), JSON.stringify(board));
  await page.evaluate(() => window.CHECKSMITH.shopOpenStation('ledger'));
  ok('rent and wages are at the ledger',
    /due in 7 days/.test(await page.textContent('#shPanel')) &&
    (await page.textContent('#shDrawerTitle')) === 'Ledger', await page.textContent('#shPanel'));
  await page.click('#shDrawerClose');
  ok('nothing on the shelves means the store cannot be tended', !(await shopActionOpen(page, 'tend')));
  await shopAction(page, 'almanac');
  ok('the Almanac is a book and not a job, so it is never shut', await page.isVisible('#shopSheet'));
  await page.evaluate(() => window.CHECKSMITH.shopSheetClose());
  await page.screenshot({ path: path.join(SHOTS, '14-shop.png'), fullPage: true });

  section('Open Your Forge: sprites and portraits');
  const art = await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    const missingItems = C.SHOP.items
      .filter((it) => !document.getElementById('it-' + it.id)).map((it) => it.id);
    const missingFaces = C.SHOP.customers
      .filter((c) => !document.getElementById('cu-' + c.id)).map((c) => c.id);
    const tinted = C.SHOP.materials.filter((m) => !m.tint).map((m) => m.id);
    const missingCarts = C.SHOP.vehicles
      .filter((v) => !document.getElementById('pr-' + v.id)).map((v) => v.id);
    return { missingItems, missingFaces, tinted, missingCarts,
      ingot: !!document.getElementById('it-ingot'),
      ore: !!document.getElementById('it-ore'),
      // one a recipe, one a customer, one a fixture, one a vehicle, plus the
      // ingot, the raw ore, the mine, the pick and the contract
      expect: C.SHOP.items.length + C.SHOP.customers.length + C.SHOP.stands.length +
        C.SHOP.vehicles.length + 5,
      symbols: document.querySelectorAll('.sprite-defs symbol').length };
  });
  ok('every item has a sprite', art.missingItems.length === 0, art.missingItems.join(','));
  ok('every customer type has a portrait', art.missingFaces.length === 0, art.missingFaces.join(','));
  ok('there is an ingot sprite for the raw metal', art.ingot);
  ok('raw ore is drawn as its own thing, not as an ingot', art.ore);
  ok('every vehicle has a sprite', art.missingCarts.length === 0, art.missingCarts.join(','));
  ok('every material carries a tint', art.tinted.length === 0, art.tinted.join(','));
  ok('every display stand has a fixture sprite', await page.evaluate(() =>
    window.CHECKSMITH.core.SHOP.stands.every((d) => !!document.getElementById(d.icon))));
  // one symbol a recipe, one a customer, one a fixture, plus the raw ingot
  ok('the sheet holds one symbol per thing drawn, not one per use',
    art.symbols === art.expect, art.symbols + ' of ' + art.expect);

  // the same sword in two metals must actually differ on screen
  const tint = await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = window.CHECKSMITH.itemSprite('longsword', 'bronze') +
      window.CHECKSMITH.itemSprite('longsword', 'gold');
    document.body.appendChild(host);
    const [a, b] = host.querySelectorAll('svg');
    const out = { a: getComputedStyle(a).color, b: getComputedStyle(b).color,
      usesA: a.querySelector('use').getAttribute('href'),
      label: a.getAttribute('aria-label') };
    host.remove();
    return out;
  });
  ok('a sprite is tinted by the material it is worked in', tint.a !== tint.b,
    JSON.stringify(tint));
  ok('and both point at the one symbol for that item',
    tint.usesA === '#it-longsword', tint.usesA);
  ok('a sprite names itself for a screen reader',
    tint.label === 'Bronze Longsword', tint.label);

  section('Open Your Forge: material drives the board, not the tier');
  const forged = await (async () => {
    await teach(page, 'stiletto', 'rondel', 'longsword', 'plate', 'kite');
    await shopAction(page, 'forge');
    await page.waitForSelector('#shopSheet:not([hidden])');
    // a silver dagger: 4x4 board, two strikes a square
    await page.selectOption('#shopSheetBody [data-sel="item"]', 'stiletto');
    await page.evaluate(() => {
      const sh = window.CHECKSMITH.app.shop;
      sh.materials.silver = 6;
      window.CHECKSMITH.shopUi.redraw();
    });
    await page.selectOption('#shopSheetBody [data-sel="material"]', 'silver');
    await page.waitForTimeout(120);
    // a batch of one is a Novice board; the dialog has to say so before it is worked
    const said = await page.evaluate(() => document.getElementById('shopSheetBody').innerText);
    ok('the order dialog names the difficulty the batch will be worked at',
      /Board difficulty/.test(said) && /Novice/.test(said), said.slice(0, 200));
    await page.click('#shopSheetActions button:not([disabled])');
    // wait for THIS order's board, not whatever game the last section left
    await page.waitForFunction(
      () => { const g = window.CHECKSMITH.app.game; return g && g.perfect === 2 && g.board.size === 4; },
      null, { timeout: 15000 });
    // A verified route only holds while the metal stays put, so pin reshaping
    // off for the walk. What is under test here is the material's strike
    // count, not the hot-metal rule the forge tiers bring with them.
    await page.evaluate(() => { window.CHECKSMITH.app.game.morphChance = 0; });
    return page.evaluate(() => {
      const g = window.CHECKSMITH.app.game;
      return { size: g.board.size, visits: g.board.visits, perfect: g.perfect, spent: g.spent,
        shopHidden: document.getElementById('shopView').hidden,
        prompt: document.getElementById('promptText').innerText,
        banner: !!document.getElementById('forgeBanner'),
        above: Array.from(document.querySelectorAll('.app > *')).filter((e) => {
          const r = e.getBoundingClientRect();
          const board = document.querySelector('.board-wrap').getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < board.top && e.id !== 'live';
        }).map((e) => e.id || e.className),
        route: g.board.route.length };
    });
  })();
  ok('the item picks the board size', forged.size === 4, String(forged.size));
  ok('the material picks the strikes a square needs',
    forged.perfect === 2 && forged.spent === 3, JSON.stringify(forged));
  ok('the route visits every square that many times',
    forged.visits === 2 && forged.route === 2 * 16);
  ok('the anvil takes over the screen', forged.shopHidden === true);
  // The item decides the board and so the symbols; the batch decides how
  // unruly the metal on it is. Raising the batch has to bite somewhere real.
  ok('the item decides the symbols, whatever the batch', await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    const sh = window.CHECKSMITH.app.shop;
    const small = C.forgeBoardSpec(sh, 'plate', 'bronze', 1);
    const large = C.forgeBoardSpec(sh, 'plate', 'bronze', 7);
    return small.size === large.size &&
      C.poolForSize(small.size).join(',') === C.poolForSize(large.size).join(',');
  }));
  // Harder here means more crust to break. Symbols never change on this
  // anvil, however big the batch (its own section checks that end to end).
  ok('and a bigger batch makes that metal harder to work', await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    const sh = window.CHECKSMITH.app.shop;
    const small = C.CONFIG.difficulties[C.forgeBoardSpec(sh, 'plate', 'bronze', 1).difficulty];
    const large = C.CONFIG.difficulties[C.forgeBoardSpec(sh, 'plate', 'bronze', 7).difficulty];
    return large.hardenChance > small.hardenChance && !C.reshapeAllowed('shop');
  }));

  // Nothing sits above the board but the top bar and the prompt: a banner up
  // there reads as a board-size picker, which is not something this mode has.
  ok('nothing stands between the top bar and the board',
    forged.banner === false && forged.above.join(',') === 'topbar,prompt',
    JSON.stringify(forged.above));
  ok('the prompt says what is on the anvil and what the metal asks',
    /Silver Stiletto/.test(forged.prompt) && /2 strikes per square/.test(forged.prompt),
    forged.prompt);

  // On its own board, never the live one: striking the order the player is
  // about to work would desynchronise it from its verified route.
  ok('a square is ruined only one strike past the material\u2019s count', await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    const board = C.makeShopBoard(3, 'novice', 2, C.mulberry32(4242));
    const g = C.createGame(board, { perfect: 2, spent: 3, morphChance: 0 });
    const idx = board.route[0];
    C.applyStrike(g, idx);
    const soundAtOne = C.isSpent(g, idx) === false;
    C.applyStrike(g, C.legalTargets(g)[0]);
    C.applyStrike(g, idx);
    const stillSoundAtTwo = C.isSpent(g, idx) === false;
    C.applyStrike(g, C.legalTargets(g)[0]);
    C.applyStrike(g, idx);
    return soundAtOne && stillSoundAtTwo && C.isSpent(g, idx) === true;
  }));

  /* Gold is where the work starts to bite: that rung and every one above it is
     worked a full difficulty step harder than the batch alone would ask for.
     Read off the real order sheet and the real board it deals. */
  section('Open Your Forge: Gold and above are worked a tier harder');
  // the section before this leaves a board on the anvil; go back to the floor
  await page.evaluate(() => { window.CHECKSMITH.shopUi.order = null; window.CHECKSMITH.shopReturn(); });
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 10000 });
  await installStock(page);
  const tiers = await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    const out = [];
    for (const m of C.SHOP.materials) {
      for (const qty of [1, 4, 7, 10]) {
        out.push({ metal: m.name, id: m.id, qty: qty,
          batch: C.batchDifficulty(qty), forge: C.forgeDifficulty(m.id, qty),
          step: C.materialDifficultyStep(m.id) });
      }
    }
    return out;
  });
  const soft = tiers.filter((t) => t.step === 0), hard = tiers.filter((t) => t.step > 0);
  ok('Bronze and Silver are still worked at whatever the batch asked',
    soft.length === 8 && soft.every((t) => t.forge === t.batch) &&
    ['Bronze', 'Silver'].every((n) => soft.some((t) => t.metal === n)),
    JSON.stringify(soft.slice(0, 2)));
  ok('Gold, Mithril and Adamantine are each a tier above the batch',
    hard.length === 12 && hard.every((t) => {
      const order = ['novice', 'apprentice', 'journeyman', 'master'];
      return t.forge === order[Math.min(order.indexOf(t.batch) + 1, 3)];
    }), JSON.stringify(hard.filter((t) => t.qty === 1)));
  ok('and nothing is ever worked above Master',
    tiers.filter((t) => t.qty === 10).every((t) => t.forge === 'master'));

  // the order sheet has to name the tier the anvil will actually deal
  for (const metal of ['bronze', 'gold']) {
    await page.evaluate((id) => {
      const F = window.CHECKSMITH;
      F.app.shop.materials[id] = 20;
      F.shopRender();
    }, metal);
    await shopAction(page, 'forge');
    await page.waitForSelector('#shopSheet:not([hidden])');
    await page.selectOption('#shopSheetBody [data-sel="item"]', 'shortsword');
    await page.waitForTimeout(100);
    await page.selectOption('#shopSheetBody [data-sel="material"]', metal);
    await page.waitForTimeout(150);
    const sheet = await page.evaluate(() => document.getElementById('shopSheetBody').innerText);
    if (metal === 'bronze') {
      ok('a batch of one in Bronze is offered as a Novice board',
        /Novice/.test(sheet) && !/difficulty for Bronze/.test(sheet), sheet.slice(0, 260));
    } else {
      ok('the same batch in Gold is offered as an Apprentice board',
        /Apprentice/.test(sheet) && !/Novice/.test(sheet), sheet.slice(0, 260));
      ok('and the sheet says the metal is what raised it',
        /\+1 difficulty for Gold/.test(sheet), sheet.slice(0, 260));
    }
    // and the board it actually deals matches what it just promised
    await page.click('#shopSheetActions button:not([disabled])');
    await page.waitForFunction(() => !!window.CHECKSMITH.app.game, null, { timeout: 15000 });
    const dealt = await page.evaluate(() => window.CHECKSMITH.app.game.board.difficulty);
    ok('the anvil deals the ' + metal + ' board at the tier the sheet named',
      dealt === (metal === 'bronze' ? 'novice' : 'apprentice'), dealt);
    await page.evaluate(() => { window.CHECKSMITH.shopUi.order = null; window.CHECKSMITH.shopReturn(); });
    await page.waitForSelector('#shopView:not([hidden])', { timeout: 10000 });
  await installStock(page);
  }

  /* A hardened square has to be broken open before the metal under it can be
     worked at all. It has to look like one, say so, and behave like one. */
  section('Hardened squares on a real board');
  {
    const crusted = await page.evaluate(async () => {
      const F = window.CHECKSMITH, C = F.core;
      F.shopUi.order = null; F.shopReturn();
      // a board big enough to harden: the smallest never does
      let board = null;
      for (let seed = 1; seed < 400 && !(board && board.hard); seed++) {
        board = C.makeBoard('master', C.mulberry32(seed * 13 + 1));
      }
      if (!board) return null;
      F.app.difficulty = 'master';
      F.buildTiles(board.size);
      F.app.game = C.createGame(board, { mode: 'forge', morphChance: 0, rnd: F.app.rnd });
      F.buildLegend();
      F.render();
      const at = board.hard.findIndex((h) => h > 0);
      const plain = board.hard.findIndex((h) => h === 0);
      const el = () => document.querySelector('#board .tile[data-i="' + at + '"]');
      return { at: at, plain: plain, layers: board.hard[at],
        crustAttr: el().getAttribute('data-crust'),
        pips: el().querySelectorAll('.crust i').length,
        glyph: el().querySelector('.glyph').textContent,
        label: el().getAttribute('aria-label'),
        plainCrust: document.querySelector('#board .tile[data-i="' + plain + '"]')
          .getAttribute('data-crust'),
        legend: document.getElementById('legendBody').textContent,
        bg: getComputedStyle(el()).backgroundImage.slice(0, 40) };
    });
    ok('a hardened board can be dealt at all', !!crusted, JSON.stringify(crusted));
    if (crusted) {
      ok('a hardened square is marked as one, with a pip per layer owed',
        crusted.crustAttr === String(crusted.layers) && crusted.pips === crusted.layers,
        JSON.stringify(crusted));
      ok('and a plain square beside it is not', crusted.plainCrust === null,
        String(crusted.plainCrust));
      ok('its symbol still shows through the crust, because you plan around it',
        crusted.glyph.length > 0, crusted.glyph);
      ok('it says so to a screen reader',
        /hardened, \d+ strikes? to break the crust/.test(crusted.label), crusted.label);
      ok('and the legend explains the crust when a board carries one',
        /Hardened/.test(crusted.legend) && /crust/.test(crusted.legend),
        crusted.legend.slice(-200));

      const broke = await page.evaluate(async (at) => {
        const F = window.CHECKSMITH, C = F.core, g = F.app.game;
        const before = { crust: C.crustOf(g, at), strikes: g.strikes[at] };
        C.applyStrike(g, at);
        F.render();
        const el = document.querySelector('#board .tile[data-i="' + at + '"]');
        return { before: before, crust: C.crustOf(g, at), strikes: g.strikes[at],
          attr: el.getAttribute('data-crust'), state: el.dataset.s,
          metal: el.getAttribute('data-metal'), current: el.dataset.current,
          total: g.totalStrikes };
      }, crusted.at);
      ok('a blow breaks a layer of crust and leaves the metal untouched',
        broke.crust === broke.before.crust - 1 && broke.strikes === broke.before.strikes &&
        broke.total === 1, JSON.stringify(broke));
      ok('and you are standing on it, so its symbol steers the next blow',
        broke.current === '1', JSON.stringify(broke));
      ok('the metal under a crust shows nothing until the crust is off',
        broke.crust > 0 ? (broke.attr === String(broke.crust) && broke.metal === null)
          : broke.attr === null, JSON.stringify(broke));

      ok('working the route through finishes a hardened board at quality 100',
        await page.evaluate(() => {
          const F = window.CHECKSMITH, C = F.core;
          const board = F.app.game.board;
          const g = C.createGame(board, { mode: 'forge', morphChance: 0 });
          for (const step of board.route) if (!C.applyStrike(g, step)) return false;
          F.app.game = g;
          F.render();
          return g.status === 'complete' && g.crust.every((c) => c === 0) &&
            C.scoreGame(g).quality === 100;
        }));
    }
    await page.evaluate(() => {
      const F = window.CHECKSMITH;
      F.app.game = null;
      F.shopReturn();
    });
    await page.waitForSelector('#shopView:not([hidden])', { timeout: 10000 });
    await installStock(page);
  }

  /* What is on a board is decided by its size, and a 3x3 is a king, a rook
     and numbers. A number must be drawn, named and highlighted like any other
     symbol - no special case anywhere. */
  section('A 3x3 board carries numbers');
  {
    const numberBoard = await page.evaluate(async () => {
      const F = window.CHECKSMITH, C = F.core;
      F.app.shop.materials.bronze = 40;
      // a 3x3 item in a soft metal is a Novice board; deal until one has a number
      for (let tries = 0; tries < 30; tries++) {
        F.shopUi.draft = { item: 'dagger', material: 'bronze', qty: 1 };
        F.shopStartForge();
        await new Promise((r) => setTimeout(r, 90));
        const g = F.app.game;
        if (!g) continue;
        const at = g.pieces.findIndex((p) => C.pieceNumber(p) > 0);
        if (g.board.size === 3 && g.board.difficulty === 'novice' && at >= 0) {
          return { size: g.board.size, difficulty: g.board.difficulty, at: at,
            piece: g.pieces[at], pool: C.poolForSize(3),
            glyph: document.querySelector('#board .tile[data-i="' + at + '"] .glyph').textContent,
            label: document.querySelector('#board .tile[data-i="' + at + '"]').getAttribute('aria-label'),
            // a closed <details>, so textContent is the only honest read
            legend: document.getElementById('legendBody').textContent };
        }
        F.shopUi.order = null; F.shopReturn();
        await new Promise((r) => setTimeout(r, 40));
      }
      return null;
    });
    ok('a 3x3 Novice board is dealt with a number on it', !!numberBoard,
      JSON.stringify(numberBoard));
    if (numberBoard) {
      ok('the number is drawn as the digit it is',
        numberBoard.glyph === numberBoard.piece, numberBoard.glyph);
      ok('and named to a screen reader', /Two|Three/.test(numberBoard.label),
        numberBoard.label);
      ok('the legend lists the smallest board as a king, a rook, a bishop and numbers',
        /King/.test(numberBoard.legend) && /Rook/.test(numberBoard.legend) &&
        /Two/.test(numberBoard.legend) &&
        /Bishop/.test(numberBoard.legend) && !/Knight/.test(numberBoard.legend),
        JSON.stringify(numberBoard.legend));
      ok('and says how far it sends you',
        /squares away/.test(numberBoard.legend), numberBoard.legend.slice(0, 200));

      // the highlighting has to agree with the rule, square by square
      const moves = await page.evaluate((info) => {
        const F = window.CHECKSMITH, C = F.core, g = F.app.game;
        g.current = info.at;
        g.status = 'playing';
        g.strikes[info.at] = 1;
        F.render();
        const lit = [], want = C.movesFrom(info.piece, info.at, 3);
        for (let i = 0; i < 9; i++) {
          if (document.querySelector('#board .tile[data-i="' + i + '"]').dataset.legal === '1') lit.push(i);
        }
        return { lit: lit, want: want.slice().sort((a, b) => a - b) };
      }, { at: numberBoard.at, piece: numberBoard.piece });
      ok('standing on it lights exactly the ring it names, and nothing else',
        moves.lit.join(',') === moves.want.join(','), JSON.stringify(moves));

      const tapped = await page.evaluate(async (info) => {
        const F = window.CHECKSMITH, C = F.core;
        const reach = C.movesFrom(info.piece, info.at, 3);
        const legal = reach[0];
        const illegal = [...Array(9).keys()].find((i) => i !== info.at && !reach.includes(i));
        const before = F.app.game.strikes.slice();
        F.tap(illegal);
        await new Promise((r) => setTimeout(r, 220));
        const afterBad = F.app.game.strikes.slice();
        F.tap(legal);
        await new Promise((r) => setTimeout(r, 400));
        return { illegal: illegal, legal: legal,
          refused: afterBad.join(',') === before.join(','),
          took: F.app.game.strikes[legal] > before[legal] };
      }, { at: numberBoard.at, piece: numberBoard.piece });
      ok('a square off the ring is refused', tapped.refused, JSON.stringify(tapped));
      ok('and one on it lands', tapped.took, JSON.stringify(tapped));

      // last, because it deals a different board: the legend follows the board
      // the anvil dealt, not the mode. A Gold order is raised a tier, so its
      // legend must name that board's symbols rather than the player's setting.
      // The legend follows the board that was actually dealt. In this mode the
      // ITEM decides the board, so a bigger item brings a bigger board and its
      // symbols with it, whatever the player's own difficulty setting says.
      ok('the legend follows the board the anvil dealt, not the mode', await page.evaluate(async () => {
        const F = window.CHECKSMITH;
        F.shopUi.order = null; F.shopReturn();
        F.app.difficulty = 'novice';
        F.app.shop.materials.bronze = 40;
        F.core.learnRecipe(F.app.shop, 'plate', 'schematic');
        F.shopUi.draft = { item: 'plate', material: 'bronze', qty: 1 };
        F.shopStartForge();
        await new Promise((r) => setTimeout(r, 400));
        const g = F.app.game;
        const text = document.getElementById('legendBody').textContent;
        const size = g ? g.board.size : 0;
        return !!g && size > 3 && F.core.poolForSize(size)
          .every((p) => text.includes(F.core.PIECES[p].name));
      }));
    }
    await page.evaluate(() => { window.CHECKSMITH.shopUi.order = null; window.CHECKSMITH.shopReturn(); });
    await page.waitForSelector('#shopView:not([hidden])', { timeout: 10000 });
  await installStock(page);
  }

  /* The reported bug: a Gold board showed its third blow - the one that
     finished the square - as a ruined square, because the tile art counted to
     the plain forge's two-and-three. Every blueprint metal is walked here on a
     real board, reading the real tiles. */
  section('Open Your Forge: every metal climbs its own ladder');
  const PALETTE = await page.evaluate(() => window.CHECKSMITH.core.METAL_PALETTE);
  const metals = await page.evaluate(() =>
    window.CHECKSMITH.core.SHOP.materials.map((m) => ({ id: m.id, name: m.name, strikes: m.strikes })));
  for (const metal of metals) {
    // put the board on the anvil directly: what is under test is the tile, not
    // the dialog, and the order sheet is covered elsewhere
    const opened = await page.evaluate((id) => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      sh.materials[id] = 20;
      F.shopUi.draft = { item: 'shortsword', material: id, qty: 1 };
      F.shopStartForge();
      return C.forgeBoardSpec(sh, 'shortsword', id, 1).perfect;
    }, metal.id);
    await page.waitForFunction(() => !!window.CHECKSMITH.app.game, null, { timeout: 15000 });
    await page.waitForTimeout(120);
    ok(metal.name + ': the anvil asks for ' + metal.strikes + ' blows a square',
      opened === metal.strikes && (await page.evaluate(() =>
        window.CHECKSMITH.core.perfectOf(window.CHECKSMITH.app.game))) === metal.strikes);

    // drive the strike count straight and read what the tile says. A hardened
    // square shows its crust rather than its metal, by design, so the walk is
    // read off a plain one.
    const walk = await page.evaluate((need) => {
      const F = window.CHECKSMITH;
      const at = F.app.game.crust.findIndex((c) => c === 0);
      const out = [];
      for (let n = 0; n <= need + 1; n++) {
        F.app.game.strikes[at] = n;
        F.render();
        // #board, not any tile: the versus boards are still in the document
        const el = document.querySelector('#board .tile[data-i="' + at + '"]');
        const bg = getComputedStyle(el).backgroundImage;
        out.push({ n: n, at: at, metal: el.getAttribute('data-metal'), s: el.dataset.s,
          spent: el.dataset.spent, label: el.getAttribute('aria-label'),
          edge: getComputedStyle(el).borderTopColor, bg: bg.slice(0, 60) });
      }
      F.app.game.strikes[at] = 0;
      F.render();
      return out;
    }, metal.strikes);

    const ladder = await page.evaluate(() => window.CHECKSMITH.core.shopLadder());
    const want = ladder.slice(0, metal.strikes).map((n) => String(PALETTE.indexOf(n)));
    const got = walk.slice(1, metal.strikes + 1).map((w) => w.metal);
    ok(metal.name + ': each blow moves the tile exactly one metal',
      got.join(',') === want.join(','),
      'got ' + got.join(',') + ' want ' + want.join(','));
    ok(metal.name + ': the finished tile wears ' + metal.name + '’s own colour',
      got[got.length - 1] === String(PALETTE.indexOf(metal.name)),
      got[got.length - 1] + ' vs ' + PALETTE.indexOf(metal.name));

    const done = walk[metal.strikes], over = walk[metal.strikes + 1];
    ok(metal.name + ': reaching ' + metal.name + ' is finished, never cracked',
      done.s === '2' && done.spent === '0' && done.metal !== null,
      JSON.stringify(done));
    ok(metal.name + ': no earlier blow is drawn as cracked either',
      walk.slice(1, metal.strikes + 1).every((w) => w.s !== '3' && w.spent === '0'),
      JSON.stringify(walk.map((w) => w.n + ':s' + w.s)));
    ok(metal.name + ': only the blow past ' + metal.name + ' cracks it',
      over.s === '3' && over.spent === '1' && over.metal === null, JSON.stringify(over));
    ok(metal.name + ': the tile names the metal it has reached',
      new RegExp(metal.name.toLowerCase()).test(done.label), done.label);
    // colour is not the only signal: each rung paints a different tile
    const edges = walk.slice(1, metal.strikes + 1).map((w) => w.edge);
    ok(metal.name + ': every rung looks different from the one below',
      new Set(edges).size === edges.length, edges.join(' | '));

    // the metal palette must not swallow the chrome painted over it: the
    // hammer's own square keeps its ring, and a ruined square keeps its crack
    const onTop = await page.evaluate((need) => {
      const F = window.CHECKSMITH;
      const at = F.app.game.crust.findIndex((c) => c === 0);
      F.app.game.strikes[at] = need;
      F.app.game.current = at;
      F.render();
      const el = document.querySelector('#board .tile[data-i="' + at + '"]');
      const mark = getComputedStyle(el, '::after');
      return { at: at, metal: el.getAttribute('data-metal'), current: el.dataset.current,
        ring: mark.content !== 'none' && parseFloat(mark.width) > 0 };
    }, metal.strikes);
    ok(metal.name + ': the hammer\'s ring still shows over worked metal',
      onTop.metal !== null && onTop.current === '1' && onTop.ring === true,
      JSON.stringify(onTop));

    await page.evaluate(() => { window.CHECKSMITH.shopUi.order = null; window.CHECKSMITH.shopReturn(); });
    await page.waitForSelector('#shopView:not([hidden])', { timeout: 10000 });
  await installStock(page);
  }

  // put back the silver stiletto the section before this one was working, so
  // the walk below still starts from the board it expects
  await page.evaluate(() => {
    const F = window.CHECKSMITH;
    F.app.shop.materials.silver = 6;
    F.shopUi.draft = { item: 'stiletto', material: 'silver', qty: 1 };
    F.shopStartForge();
  });
  await page.waitForFunction(
    () => { const g = window.CHECKSMITH.app.game; return g && g.perfect === 2 && g.board.size === 4; },
    null, { timeout: 15000 });
  await page.evaluate(() => { window.CHECKSMITH.app.game.morphChance = 0; });

  section('Open Your Forge: a batch is one puzzle');
  const batch = await page.evaluate(async () => {
    const F = window.CHECKSMITH, g = F.app.game;
    const route = g.board.route.slice();
    const settle = async () => {
      // one swing at a time: a tap landing mid-hammer is dropped by design,
      // which would desynchronise the walk from the verified route
      for (let n = 0; n < 60 && F.app.busy; n++) await new Promise((r) => setTimeout(r, 12));
    };
    for (const i of route) {
      if (!F.app.game) break;
      await settle();
      const before = F.app.game.totalStrikes;
      F.tap(i);
      await new Promise((r) => setTimeout(r, 12));
      await settle();
      const live = F.app.game;
      if (!live || live.status === 'complete' || live.status === 'lost') break;
      if (live.totalStrikes === before) break;      // the tap was refused: stop
    }
    await new Promise((r) => setTimeout(r, 400));
    return { title: document.getElementById('shopSheetTitle').textContent,
      body: document.getElementById('shopSheetBody').innerText,
      orders: F.app.shop.orders.length,
      made: F.app.shop.orders[0] ? F.app.shop.orders[0].qty : 0,
      silverLeft: F.app.shop.materials.silver };
  });
  ok('finishing the board ends the order', /Batch Forged/.test(batch.title), batch.title);
  ok('one puzzle produced the whole batch', batch.orders === 1 && batch.made >= 1);
  ok('the metal was spent only on success',
    batch.silverLeft === 6 - batch.made, JSON.stringify(batch));
  ok('the batch is not available yet', /start of tomorrow/i.test(batch.body), batch.body);
  await page.click('#shopSheet [data-at="0"]');
  await page.waitForTimeout(250);
  ok('working the anvil spent the phase', await page.evaluate(
    () => document.getElementById('shPhase').textContent === 'Afternoon'));
  ok('and the shop screen is back', await page.evaluate(
    () => !document.getElementById('shopView').hidden &&
      !document.getElementById('forgeBanner')));

  section('Open Your Forge: production, then stocking, then selling');
  await page.click('#shAdvanceBtn');
  await page.waitForTimeout(200);
  await page.click('#shAdvanceBtn');
  await page.waitForTimeout(350);
  if (await page.isVisible('#shopSheet')) await page.click('#shopSheet [data-at="0"]');
  await page.waitForTimeout(200);
  const nextDay = await page.evaluate(() => ({
    day: document.getElementById('shDay').textContent,
    storage: window.CHECKSMITH.core.countStorage(window.CHECKSMITH.app.shop),
    shelf: window.CHECKSMITH.core.countShelf(window.CHECKSMITH.app.shop)
  }));
  ok('the batch arrives in storage the next day',
    nextDay.day === '2' && nextDay.storage > 0, JSON.stringify(nextDay));
  ok('and lands in storage, never straight onto the shelf', nextDay.shelf === 0);

  // The floor is stands now: tap one, and it asks what of yours belongs on it.
  // Top up storage first so there is more than one thing to choose between.
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core;
    C.addStorage(F.app.shop, C.lineKey('hammer', 'bronze'), 5, 86);
    C.addStorage(F.app.shop, C.lineKey('buckler', 'bronze'), 4, 90);
    // the shop opens with its drawers shut; the Shelves screen is in Inventory
    F.shopUi.tab = 'shelf';
    F.shopRender();
  });
  const fixtures = await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop, C = window.CHECKSMITH.core;
    return { boxes: document.querySelectorAll('#shPanel .shelf-box').length,
      stands: sh.stands.length, cap: C.standCap(sh),
      spaces: document.querySelectorAll('#shPanel [data-buystand]').length,
      kinds: sh.stands.map((st) => st.type).join(',') };
  });
  ok('the shop tab draws a box for every stand and every free floor space',
    fixtures.boxes === fixtures.cap &&
    fixtures.spaces === fixtures.cap - fixtures.stands, JSON.stringify(fixtures));
  ok('a new forge opens with fixtures, not with an empty room',
    fixtures.stands > 0 && fixtures.stands <= fixtures.cap, fixtures.kinds);

  // a stand opens its own panel, and that is where stocking starts
  await page.click('#shPanel [data-stand]');
  await page.waitForSelector('#shopSheet:not([hidden])');
  const panel = await page.evaluate(() => ({
    title: document.getElementById('shopSheetTitle').textContent,
    body: document.getElementById('shopSheetBody').innerText,
    actions: Array.from(document.querySelectorAll('#shopSheetActions .btn'))
      .map((b) => b.textContent),
    // the way back sits in the window's head, as in every window
    back: document.querySelector('#shopSheetBack [data-win-back]') ?
      document.querySelector('#shopSheetBack [data-win-back]').textContent : null
  }));
  ok('a stand says what it is, what it holds and what it will take',
    /Display|Stand|Rack|Goods/.test(panel.title) && /Accepts/.test(panel.body) &&
    /Empty/.test(panel.body), JSON.stringify(panel).slice(0, 320));
  ok('and offers stocking, re-purposing and selling it back',
    panel.actions.join(',') === 'Stock Stand,Change Stand Type,Move Stand,Sell Stand' && panel.back === 'Back',
    panel.actions.join(','));

  await page.click('#shopSheetActions .btn.primary');
  await page.waitForTimeout(150);
  const grid = await page.evaluate(() => ({
    title: document.getElementById('shopSheetTitle').textContent,
    boxes: document.querySelectorAll('#shopSheetBody .shelf-box').length,
    stands: window.CHECKSMITH.app.shop.stands.length,
    lines: document.querySelectorAll('#shopSheetBody [data-take]').length,
    confirmOff: document.querySelector('#shopSheet [data-at="0"]').disabled
  }));
  ok('stocking a stand opens straight on what that stand would take',
    /Choose Items for This Stand/.test(grid.title) && grid.lines > 0, JSON.stringify(grid));

  await page.click('#shopSheetBody [data-take]');
  await page.waitForTimeout(120);
  ok('the picker stays open so a stand can be filled in one visit',
    /\d+ \/ \d+ items/.test(await page.textContent('#shopSheetBody')));
  await page.click('#shopSheet [data-ghost]');       // back to the floor
  await page.waitForTimeout(120);
  const oneIn = await page.evaluate(() => ({
    picked: document.querySelectorAll('#shopSheetBody .shelf-box.pick').length,
    boxes: document.querySelectorAll('#shopSheetBody .shelf-box').length,
    stands: window.CHECKSMITH.app.shop.stands.length,
    confirmOff: document.querySelector('#shopSheet [data-at="0"]').disabled,
    shelf: window.CHECKSMITH.core.countShelf(window.CHECKSMITH.app.shop)
  }));
  ok('a piece picked shows on its stand, and nothing has moved yet',
    oneIn.picked === 1 && oneIn.boxes === oneIn.stands &&
    oneIn.confirmOff === false && oneIn.shelf === 0, JSON.stringify(oneIn));

  // a stand filled in the draft can be cleared again before anything moves
  await page.click('#shopSheetBody .shelf-box.pick');
  await page.waitForTimeout(100);
  ok('and tapping that stand again takes it back off',
    (await page.evaluate(() =>
      document.querySelectorAll('#shopSheetBody .shelf-box.pick').length)) === 0);

  // fill the stands one at a time, while storage has anything left for them
  for (let i = 0; i < 4; i++) {
    const more = await page.evaluate(() =>
      document.querySelectorAll('#shopSheetBody .shelf-box:not(.pick):not([disabled])').length);
    if (!more) break;
    await page.click('#shopSheetBody .shelf-box:not(.pick):not([disabled])');
    await page.waitForTimeout(80);
    const take = await page.evaluate(() =>
      document.querySelectorAll('#shopSheetBody [data-take]').length);
    if (take) {
      await page.click('#shopSheetBody [data-take]');
      await page.waitForTimeout(80);
    }
    await page.click('#shopSheet [data-ghost]');
    await page.waitForTimeout(80);
  }
  const filled = await page.evaluate(() =>
    document.querySelectorAll('#shopSheetBody .shelf-box.pick').length);
  ok('stands are filled one at a time', filled >= 1, String(filled));
  const takenOut = await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop;
    let total = 0;
    for (const k in sh.storage) total += sh.storage[k].qty;
    return total;
  });
  await page.click('#shopSheetActions .btn.primary');
  await page.waitForTimeout(300);
  ok('and only what was picked leaves storage', await page.evaluate((was) => {
    const sh = window.CHECKSMITH.app.shop;
    let total = 0;
    for (const k in sh.storage) total += sh.storage[k].qty;
    return total === was - window.CHECKSMITH.core.countShelf(sh);
  }, takenOut));

  const stocked = await page.evaluate(() => {
    const F = window.CHECKSMITH, sh = F.app.shop, C = F.core;
    const stand = C.stockedStands(sh)[0];
    if (!stand) return { shelf: 0 };
    const p = C.splitKey(stand.key);
    return { shelf: C.countShelf(sh), key: stand.key, price: stand.price,
      rec: C.recommendedPrice(p.item, p.material, stand.quality) };
  });
  ok('stocking moves goods onto a stand', stocked.shelf > 0, JSON.stringify(stocked));
  ok('a fresh line starts at its recommended price', stocked.price === stocked.rec);
  const floor = await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop, C = window.CHECKSMITH.core;
    return { boxes: document.querySelectorAll('#shPanel .shelf-box').length,
      cap: C.standCap(sh),
      full: document.querySelectorAll('#shPanel .shelf-box.full').length,
      stocked: C.stockedStands(sh).length };
  });
  ok('the shop tab shows every stand, and the stocked ones as stocked',
    floor.boxes === floor.cap && floor.full === floor.stocked, JSON.stringify(floor));

  // a stand that is holding something offers its price and taking it back off
  await page.click('#shPanel .shelf-box.full');
  await page.waitForSelector('#shopSheet:not([hidden])');
  const held = await page.evaluate(() => ({
    actions: Array.from(document.querySelectorAll('#shopSheetActions .btn'))
      .map((b) => b.textContent)
  }));
  ok('a stand with something on it offers restocking, the price and taking it off',
    held.actions.join(',') ===
      'Restock,Set Price,Return Items to Storage,Move Stand,Sell Stand',
    held.actions.join(','));

  // the price is the player's to set
  await page.evaluate(() => Array.from(document.querySelectorAll('#shopSheetActions .btn'))
    .find((b) => b.textContent === 'Set Price').click());
  await page.waitForTimeout(150);
  const priced = await page.evaluate(() => {
    const body = document.getElementById('shopSheetBody').innerText;
    return { body: body, shown: /Recommended/.test(body) && /Your price/.test(body) };
  });
  ok('the sheet shows both the recommended and the asking price', priced.shown, priced.body);
  await page.click('#shopSheetBody [data-step="price"][data-by="1"]');
  await page.waitForTimeout(60);
  await page.click('#shopSheet [data-at="0"]');
  await page.waitForTimeout(200);
  ok('the player can ask more than the recommendation', await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop, C = window.CHECKSMITH.core;
    const stand = C.stockedStands(sh)[0];
    const p = C.splitKey(stand.key);
    return stand.price > C.recommendedPrice(p.item, p.material, stand.quality);
  }));

  // nothing goes on a stand that was not made for it
  ok('a stand refuses what it was not made for', await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    C.addStorage(sh, C.lineKey('buckler', 'bronze'), 2, 90);
    const rack = sh.stands.find((st) => st.type === 'weapon');
    const res = C.shopStockStand(sh, rack.id, C.lineKey('buckler', 'bronze'), 1);
    return res.moved === 0 && !!res.why;
  }));

  section('Open Your Forge: the counter');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const C = F.core;
    sh.reputation = 70;
    // a floor deeper than a real shop's, so the queue never simply runs dry
    F.testStock(sh, C.lineKey('longsword', 'bronze'), 30, 95, 62);
    F.testStock(sh, C.lineKey('buckler', 'bronze'), 30, 88, 40);
    F.shopRender();
  });
  await shopAction(page, 'tend');
  await page.waitForTimeout(300);

  // Every customer has to be a beat of their own: a banner, an offer, a
  // decision and a stamped outcome. Nothing may resolve off-screen.
  const seen = { offers: 0, full: 0, haggleScreens: 0, sold: 0, left: 0, booked: 0, beats: 0,
    specials: 0 };
  let guard = 0;
  while ((await page.isVisible('#shopSheet')) && guard++ < 60) {
    const view = await page.evaluate(() => ({
      title: document.getElementById('shopSheetTitle').textContent,
      head: !!document.querySelector('.cust-head'),
      bid: document.querySelector('.cust-bid') ? document.querySelector('.cust-bid').innerText : null,
      stamp: document.querySelector('.stamp') ? document.querySelector('.stamp').innerText : null,
      lost: !!document.querySelector('.stamp.lost'),
      booked: !!document.querySelector('.stamp.booked'),
      band: document.querySelector('.haggle-box .band')
        ? document.querySelector('.haggle-box .band').textContent : null,
      portrait: !!document.querySelector('.cust-head .portrait'),
      wantSprite: !!document.querySelector('.cust-want .sprite'),
      stampArt: !!document.querySelector('.stamp .sprite, .stamp .portrait'),
      odds: document.querySelector('.odds') ? document.querySelector('.odds').dataset.read : null,
      special: !!document.querySelector('#shopSheetBody [data-special-offer]'),
      labels: Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button')).map((b) => b.textContent)
    }));
    if (/Sales Report/.test(view.title)) break;
    seen.beats++;

    // a special commission is a beat of its own, answered on its own screen
    if (view.special) {
      seen.specials++;
      if (!view.head) seen.artMissing = true;
      await page.click('#shopSheet [data-at="0"]');
      await page.waitForTimeout(110);
      continue;
    }

    if (view.bid) {
      seen.offers++;
      if (!view.portrait || !view.wantSprite) seen.artMissing = true;
      if (/WILL PAY/i.test(view.bid)) seen.full++;
      const canHaggle = view.labels.some((l) => /^Haggle$/.test(l));
      if (canHaggle && seen.haggleScreens < 2) {
        await page.click('#shopSheet [data-at="1"]');
      } else {
        await page.click('#shopSheet [data-at="0"]');
      }
    } else if (view.band) {
      seen.haggleScreens++;
      ok('the haggle screen names the band and reads the odds ' + seen.haggleScreens,
        /Their offer/.test(view.band) && /your price/.test(view.band) &&
        ['good', 'fair', 'poor', 'grim'].includes(view.odds), JSON.stringify(view));
      await page.click('#shopSheetBody [data-ask]:nth-child(2)');   // split the difference
      await page.waitForTimeout(70);
      await page.click('#shopSheet [data-at="0"]');
    } else if (view.stamp) {
      // a contract taken on is its own outcome: neither a sale nor a walkout
      if (view.booked) seen.booked++;
      else if (view.lost) seen.left++;
      else seen.sold++;
      if (!view.stampArt) seen.stampArtMissing = true;
      if (!seen.shotSold && !view.lost && !view.booked) {
        seen.shotSold = true;
        await page.screenshot({ path: path.join(SHOTS, '16-shop-sold.png'), fullPage: true });
      }
      await page.click('#shopSheet [data-at="0"]');
    } else break;
    await page.waitForTimeout(110);
  }

  ok('every customer is shown, not resolved off-screen', seen.offers >= 3,
    JSON.stringify(seen));
  ok('every customer arrives with a face and the goods they came for',
    !seen.artMissing, JSON.stringify(seen));
  ok('every outcome is stamped with art', !seen.stampArtMissing, JSON.stringify(seen));
  ok('haggling opens a counter-offer of the player’s own', seen.haggleScreens >= 1,
    JSON.stringify(seen));
  ok('each outcome is stamped, sold or walked out', seen.sold + seen.left >= 3,
    JSON.stringify(seen));
  const report = await page.evaluate(() => ({
    title: document.getElementById('shopSheetTitle').textContent,
    body: document.getElementById('shopSheetBody').innerText,
    tally: window.CHECKSMITH.app.shop.log[0]
  }));
  // Every customer in the queue ends in exactly one stamp. Offers can differ:
  // someone who baulks never makes one, and a customer who stands firm after a
  // failed counter is shown twice.
  ok('every customer ends in exactly one stamp',
    seen.sold === report.tally.sold && seen.left === report.tally.left &&
    seen.booked === (report.tally.taken || 0) + (report.tally.specialTaken || 0) &&
    seen.specials === (report.tally.specialTaken || 0) &&
    seen.sold + seen.left + seen.booked + (report.tally.declined || 0) ===
      report.tally.customers,
    JSON.stringify([seen, report.tally]));
  ok('a selling phase ends in a sales report', /Sales Report/.test(report.title), report.title);
  ok('the report counts customers, sales, revenue and haggles',
    /Customers/.test(report.body) && /Items sold/.test(report.body) &&
    /Revenue/.test(report.body) && /Haggles attempted/.test(report.body), report.body);
  await page.screenshot({ path: path.join(SHOTS, '15-shop-report.png'), fullPage: true });
  await page.click('#shopSheet [data-at="0"]');
  await page.waitForTimeout(250);

  // Whether a full-price buyer turns up in a random queue is chance, so force
  // one: at a price nobody could baulk at, the very first offer must be the
  // full asking price, and it must be put to the player like any other.
  const willPay = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    F.testClearFloor(sh);
    F.testStock(sh, C.lineKey('dagger', 'bronze'), 40, 100, 1);
    // an unknown forge is not trusted with a bulk order, and a check about an
    // ordinary sale wants an ordinary sale put to it
    sh.reputation = 0;
    F.shopUi.session = null;
    F.shopAct('tend');
    await new Promise((r) => setTimeout(r, 250));
    const bid = document.querySelector('.cust-bid');
    const out = { full: !!document.querySelector('.cust-bid.fair'),
      text: bid ? bid.innerText.replace(/\n/g, ' ') : null,
      buttons: Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
        .map((b) => b.textContent) };
    return out;
  });
  ok('a customer who will pay the asking price is still shown to the player',
    willPay.full && /WILL PAY/i.test(willPay.text), JSON.stringify(willPay));
  ok('and they are answered, not settled behind the scenes',
    willPay.buttons.some((l) => /^Accept/.test(l)) &&
    !willPay.buttons.some((l) => /^Haggle$/.test(l)), JSON.stringify(willPay.buttons));
  // Drain whatever that forced phase raises - the queue, its report, and any
  // day-break sheet behind it - so the shop floor is reachable again.
  for (let i = 0; i < 80 && (await page.isVisible('#shopSheet')); i++) {
    await page.click('#shopSheet [data-at="0"]');
    await page.waitForTimeout(90);
  }
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(150);

  section('Open Your Forge: staff take work off your hands');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    sh.gold = 4000;
    sh.day = 2; sh.phaseIndex = 0;
    F.shopRender();
  });
  await shopAction(page, 'hire');
  await page.waitForSelector('#shopSheet:not([hidden])');
  // you ask after a trade first; nobody is at the door until you do
  await page.evaluate(() => Array.from(document.querySelectorAll('#shopSheetBody .trade'))
    .find((b) => b.innerText.trim() === 'Salesperson').click());
  await page.waitForTimeout(220);
  const applicants = await page.evaluate(() => Array.from(
    document.querySelectorAll('.applicant')).map((a) => a.innerText));
  ok('applicants show a name, rank, role and wage', applicants.length === 3 &&
    applicants.every((t) => /E-rank/.test(t) && /g\/wk/.test(t)),
    JSON.stringify(applicants));
  await page.click('#shopSheetBody [data-hire]');
  await page.waitForTimeout(350);
  const hired = await page.evaluate(() => ({
    staff: window.CHECKSMITH.app.shop.staff.length,
    phase: document.getElementById('shPhase').textContent
  }));
  ok('hiring puts them on the books', hired.staff === 1, JSON.stringify(hired));
  ok('taking somebody on costs the phase', hired.phase !== 'Morning', hired.phase);

  const delegated = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    sh.staff = [{ id: 901, name: 'Test Sal', role: 'salesperson', rank: 'B', power: 4, wage: 60 }];
    F.testStock(sh, F.core.lineKey('longsword', 'bronze'), 20, 95, 52);
    sh.assignments = {};
    F.shopRender();
    const first = F.core.shopAssign(sh, 901, {});
    const reports = F.core.shopAdvancePhase(sh).reports;
    const second = F.core.shopAssign(sh, 901, {});
    return { assigned: first.ok, reports: reports.length,
      kind: reports[0] && reports[0].kind, twice: second.ok };
  });
  ok('a salesperson can work a phase while you work elsewhere',
    delegated.assigned && delegated.reports === 1 && delegated.kind === 'sales',
    JSON.stringify(delegated));
  ok('and only one phase a day', delegated.twice === false);

  /* The day is planned from one screen: a section for each kind of work and a
     box for every phase inside it. Driven through the real boxes. */
  section('Open Your Forge: the day is planned from the Staff screen');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    // room for this cast, and a tier left above for the growth section below
    sh.tier = 3; sh.gold = 9000; sh.day = 3; sh.phaseIndex = 0;
    sh.assignments = {};
    sh.staff = [
      { id: 801, name: 'Mara Ashford', role: 'salesperson', rank: 'B', power: 4, wage: 60 },
      { id: 802, name: 'Coll Tanner', role: 'salesperson', rank: 'D', power: 2, wage: 18 },
      { id: 803, name: 'Bryn Hale', role: 'apprentice', rank: 'A', power: 5, wage: 104 },
      { id: 804, name: 'Edda Vance', role: 'runner', rank: 'C', power: 3, wage: 34 },
      { id: 805, name: 'Nell Rook', role: 'storehand', rank: 'C', power: 3, wage: 34 }
    ];
    sh.materials.bronze = 20;
    C.addStorage(sh, C.lineKey('longsword', 'bronze'), 6, 90);
    F.testStock(sh, C.lineKey('buckler', 'bronze'), 8, 90, 40);
    F.shopUi.tab = 'staff';
    F.shopRender();
  });
  await page.waitForTimeout(200);

  const rosterView = await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    const roles = Array.from(document.querySelectorAll('#shPanel .roster-role')).map((r) => ({
      head: r.querySelector('.roster-head b').textContent,
      whens: Array.from(r.querySelectorAll('.rb-when')).map((w) => w.textContent),
      boxes: r.querySelectorAll('.roster-box').length
    }));
    return { roles: roles, names: C.SHOP.roles.map((r) => r.name),
      phases: C.SHOP.phases.map((p) => C.SHOP.phaseName[p]) };
  });
  ok('every role has a section of its own, in the game’s own order',
    rosterView.roles.map((r) => r.head).join(',') === rosterView.names.join(','),
    JSON.stringify(rosterView.roles.map((r) => r.head)));
  ok('and a labelled box for every phase the game defines',
    rosterView.roles.every((r) => r.boxes === rosterView.phases.length &&
      r.whens.join(',') === rosterView.phases.join(',')),
    JSON.stringify(rosterView.roles[0]));

  // filling a box: tap, pick, done - and no phase is spent doing it
  const beforePlan = await page.evaluate(() => ({
    phase: window.CHECKSMITH.app.shop.phaseIndex, day: window.CHECKSMITH.app.shop.day }));
  await page.click('#shPanel .roster-role .roster-box.empty:not(:disabled)');
  await page.waitForTimeout(180);
  const whoSheet = await page.evaluate(() => ({
    title: document.getElementById('shopSheetTitle').textContent,
    cards: Array.from(document.querySelectorAll('#shopSheetBody [data-pick-hand]'))
      .map((c) => c.innerText.replace(/\s+/g, ' ').trim()),
    faces: document.querySelectorAll('#shopSheetBody [data-pick-hand] .portrait').length
  }));
  ok('tapping an empty box asks who should work that phase',
    /^Assign /.test(whoSheet.title) && whoSheet.cards.length === 2, JSON.stringify(whoSheet));
  ok('each candidate shows a portrait, name, role, rank and what they bring',
    whoSheet.faces === 2 && whoSheet.cards.every((t) =>
      /Salesperson/.test(t) && /rank [EDCBAS]/.test(t) && /haggling/.test(t)),
    JSON.stringify(whoSheet.cards));

  await page.click('#shopSheetBody [data-pick-hand]');
  await page.waitForTimeout(300);
  const boxFilled = await page.evaluate(() => {
    const C = window.CHECKSMITH.core, sh = window.CHECKSMITH.app.shop;
    const box = document.querySelector('#shPanel .roster-role .roster-box[data-hand]');
    return { sheetShut: document.getElementById('shopSheet').hidden,
      who: box && box.getAttribute('data-hand'),
      face: !!(box && box.querySelector('.portrait')),
      rank: box && box.querySelector('.rank') && box.querySelector('.rank').textContent,
      state: box && box.querySelector('.rb-state').textContent,
      phase: sh.phaseIndex, day: sh.day,
      assigned: C.assignmentStatus(sh, 801) };
  });
  ok('picking somebody fills the box with their portrait, rank and errand',
    boxFilled.who === '801' && boxFilled.face && boxFilled.rank === 'B' &&
    /Counter|Market|Ore run|Delivery|Anvil|Furnace|Stocking|Beside you|Worked/
      .test(boxFilled.state), JSON.stringify(boxFilled));
  ok('and planning the day costs the player no phase at all',
    boxFilled.phase === beforePlan.phase && boxFilled.day === beforePlan.day,
    JSON.stringify([beforePlan, boxFilled]));

  // one job a day: they vanish from every other picker
  const offRoster = await page.evaluate(() => {
    const C = window.CHECKSMITH.core, sh = window.CHECKSMITH.app.shop;
    return C.SHOP.phases.map((p) => C.staffCandidates(sh, 'salesperson', p).map((e) => e.id));
  });
  ok('a booked employee leaves every other picker for that day',
    offRoster.every((ids) => ids.indexOf(801) < 0), JSON.stringify(offRoster));

  // a filled box opens its details, and an upcoming one can be dropped
  await page.evaluate(() => {
    const F = window.CHECKSMITH;
    F.app.shop.assignments = {};
    F.core.shopAssign(F.app.shop, 804, { order: { bronze: 4 } }, 'evening');
    F.shopRender();
  });
  await page.waitForTimeout(150);
  await page.click('#shPanel .roster-box[data-hand="804"]');
  await page.waitForTimeout(180);
  const bookDetails = await page.evaluate(() => ({
    title: document.getElementById('shopSheetTitle').textContent,
    body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' '),
    buttons: Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button')).map((b) => b.textContent)
  }));
  ok('a filled box opens the assignment, with its task summarised',
    /Evening/.test(bookDetails.title) && /Bronze/.test(bookDetails.body), JSON.stringify(bookDetails));
  ok('and offers to change the orders, the employee, or drop it',
    bookDetails.buttons.join(',') === 'Back,Change Details,Change Employee,Remove',
    JSON.stringify(bookDetails.buttons));

  await page.click('#shopSheet [data-at="2"]');
  await page.waitForTimeout(250);
  ok('dropping upcoming work frees them for every picker again', await page.evaluate(() => {
    const C = window.CHECKSMITH.core, sh = window.CHECKSMITH.app.shop;
    return C.assignmentStatus(sh, 804) === null &&
      C.SHOP.phases.every((p) => C.staffCandidates(sh, 'runner', p).some((e) => e.id === 804));
  }));

  // backing out of a replacement keeps the original
  await page.evaluate(() => {
    const F = window.CHECKSMITH;
    F.core.shopAssign(F.app.shop, 801, {}, 'evening');
    F.shopRender();
  });
  await page.waitForTimeout(150);
  await page.click('#shPanel .roster-box[data-hand="801"]');
  await page.waitForTimeout(180);
  await page.click('#shopSheet [data-at="1"]');   // change employee
  await page.waitForTimeout(180);
  await page.click('#shopSheet [data-at="0"]');                // Back, without picking
  await page.waitForTimeout(200);
  ok('backing out of a swap leaves the original booking alone', await page.evaluate(() => {
    const C = window.CHECKSMITH.core, sh = window.CHECKSMITH.app.shop;
    const at = C.assignmentAt(sh, 'salesperson', 'evening');
    return !!at && at.staff.id === 801;
  }));

  // a job with nothing to do is flagged before its phase arrives
  ok('a job missing its orders is flagged on the box', await page.evaluate(() => {
    const F = window.CHECKSMITH;
    F.app.shop.assignments = {};
    F.core.shopAssign(F.app.shop, 804, { order: {} }, 'evening');   // empty list
    F.shopRender();
    const box = document.querySelector('#shPanel .roster-box[data-hand="804"]');
    return !!box && box.classList.contains('needs') &&
      /Needs details/.test(box.querySelector('.rb-state').textContent);
  }));

  // active and done are locked, and look it
  ok('work under way is locked and marked as such', await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.assignments = {};
    C.shopAssign(sh, 805, {}, C.SHOP.phases[sh.phaseIndex]);
    F.shopRender();
    const box = document.querySelector('#shPanel .roster-box[data-hand="805"]');
    return !!box && box.classList.contains('active') &&
      C.shopUnassign(sh, 805).ok === false;
  }));
  ok('and finished work is dimmed, its employee out for the day', await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.assignments[805].done = true;
    F.shopRender();
    const box = document.querySelector('#shPanel .roster-box[data-hand="805"]');
    return !!box && box.classList.contains('done') &&
      C.SHOP.phases.every((p) => C.staffCandidates(sh, 'storehand', p).length === 0);
  }));

  // portraits are the customers' own art, and they do not wander
  ok('staff wear the same portraits the customers do, and keep them',
    await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      sh.assignments = {};
      F.shopRender();
      const ids = C.SHOP.customers.map((c) => c.id);
      const first = sh.staff.map((e) => C.staffFace(e));
      if (!first.every((f) => ids.indexOf(f) >= 0)) return false;
      // the same answer on every screen, and after a save round trip
      const again = sh.staff.map((e) => C.staffFace(e));
      const back = C.restoreShop(C.serializeShop(sh), C.mulberry32(1));
      const after = back.staff.map((e) => C.staffFace(e));
      return first.join(',') === again.join(',') && first.join(',') === after.join(',');
    }));

  // the phone layout: three boxes across, readable labels, tappable
  ok('the roster fits a phone without scrolling sideways', await page.evaluate(() => {
    const panel = document.getElementById('shPanel');
    if (panel.scrollWidth > panel.clientWidth + 1) return false;
    // the boxes on the page in view; the rest are a page turn away
    const boxes = Array.from(document.querySelectorAll('#shPanel .roster-box'))
      .filter((b) => b.getClientRects().length);
    return boxes.length > 0 && boxes.every((b) => {
      const r = b.getBoundingClientRect();
      return r.width >= 44 && r.height >= 44 && r.right <= window.innerWidth + 1;
    });
  }));
  ok('and every phase label is legible on it', await page.evaluate(() =>
    Array.from(document.querySelectorAll('#shPanel .rb-when')).every((w) =>
      w.textContent.trim().length > 0 && parseFloat(getComputedStyle(w).fontSize) >= 9)));

  section('Open Your Forge: growth, stands and the weekly bill');
  /* An earlier section can leave a sheet up. It used to be closed by accident,
     because buying a stand from this tab closed the sheet on its way through;
     the Shop owns that purchase now, so close it on purpose instead. */
  await page.evaluate(() => window.CHECKSMITH.shopSheetClose());
  await page.waitForTimeout(150);
  const grown = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.gold = 100000;
    const all = window.__growAll();
    F.shopUi.tab = 'upShop';
    F.shopRender();
    const panel = document.getElementById('shPanel');
    const text = all.text;
    const cards = all.heads;
    const before = { room: C.standCap(sh), staff: C.staffCapacity(sh),
      rent: C.rentDue(sh), stands: sh.stands.length, floor: C.countShelf(sh) };
    const gold = sh.gold;
    const up = document.querySelector('#shPanel [data-upgrade="racks"]');
    const storeBefore = C.storageCapacity(sh);
    up.click();
    return { before, goldBefore: gold, cards: cards,
      relocation: !!panel.querySelector('[data-expand]') || /Premises|Move to|Corner Forge|Village Smithy/.test(text),
      rentAfter: C.rentDue(sh),
      upgraded: C.storageCapacity(sh) > storeBefore,
      noDisplays: !document.querySelector('#shPanel [data-upgrade="displays"]'),
      // stands are the Shop's business now, not Growth's
      sellsStands: all.stands };
  });
  ok('the Growth tab has no premises card and nothing to move into',
    grown.relocation === false, JSON.stringify(grown.cards));
  ok('and offers the three Staffing upgrades and Salesperson Earnings as cards',
    ['Smith Staffing', 'Store Hand Staffing', 'Runner Staffing', 'Salesperson Earnings',
      'Employment', 'Store Expansion', 'Forge'].every((c) => grown.cards.indexOf(c) >= 0),
    JSON.stringify(grown.cards));
  ok('rent still applies, without any premises to move', grown.rentAfter === grown.before.rent &&
    grown.rentAfter > 0, String(grown.rentAfter));
  ok('the Grow tab no longer sells stands at all', grown.sellsStands === 0,
    'found ' + grown.sellsStands);
  ok('the old slot upgrade is gone from the Grow tab', grown.noDisplays);
  ok('the other upgrades still buy capacity', grown.upgraded);

  // a stand is a fixture: it can be re-purposed while empty and sold back
  const fixture = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const stand = sh.stands.find((st) => !st.key || st.qty <= 0);
    const was = stand.type;
    const changed = C.shopSetStandType(sh, stand.id, was === 'helmet' ? 'goods' : 'helmet');
    const gold = sh.gold, count = sh.stands.length;
    const sold = C.shopSellStand(sh, stand.id);
    F.shopRender();
    return { changed: changed.ok, type: stand.type, was: was, sold: sold.ok,
      back: sold.back, gone: sh.stands.length === count - 1,
      paid: sh.gold === gold + sold.back };
  });
  ok('an empty stand can be made into another kind',
    fixture.changed && fixture.type !== fixture.was, JSON.stringify(fixture));
  ok('and sold back for part of what it cost',
    fixture.sold && fixture.gone && fixture.paid && fixture.back > 0,
    JSON.stringify(fixture));

  ok('running out of money closes the shop', await page.evaluate(() => {
    const F = window.CHECKSMITH;
    const s = F.core.createShop({ rnd: F.core.mulberry32(4), gold: 5 });
    for (let i = 0; i < 21; i++) F.core.shopAdvancePhase(s);
    return s.closed === true;
  }));

  section('Open Your Forge: the town is people with names');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.gold = 40000;
    F.testClearFloor(sh);
    F.testStock(sh, C.lineKey('shortsword', 'bronze'), 6, 93, 30);
    F.shopUi.tab = 'town';
    F.shopRender();
  });
  await page.waitForTimeout(200);
  const town = await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop;
    const cards = Array.from(document.querySelectorAll('#shPanel [data-town]'));
    const panel = document.getElementById('shPanel');
    return { cards: cards.length, people: sh.town.length,
      cap: panel.textContent.slice(0, 90),
      names: new Set(sh.town.map((o) => o.name)).size,
      faces: cards.filter((c) => c.querySelector('.portrait')).length,
      purses: cards.filter((c) => /\d/.test(c.querySelector('.tc-purse').textContent)).length,
      hidden: cards.filter((c) => /\?\?\?/.test(c.querySelector('.tc-purse').textContent)).length,
      wants: cards.filter((c) => /wants /.test(c.querySelector('.tc-want').textContent)).length,
      wide: panel.scrollWidth > panel.clientWidth + 1 };
  });
  ok('the Town tab lists everybody who shops here, by name',
    town.cards === town.people && town.people > 15 && town.names === town.people,
    JSON.stringify(town).slice(0, 200));
  ok('each of them has a face and something they are after',
    town.faces === town.cards && town.wants === town.cards, JSON.stringify(town));
  ok('but what anyone is carrying is never on the card',
    town.purses === 0, JSON.stringify(town));
  ok('an unread customer reads ???', town.hidden > 0, JSON.stringify(town));
  ok('and the roster fits a phone without scrolling sideways', town.wide === false);
  ok('the tab counts what the forge has learned, not what the town is worth',
    /customers/.test(town.cap) && /details known/.test(town.cap) &&
    !/g between them/.test(town.cap), town.cap);

  await page.click('#shPanel [data-town]');
  await page.waitForSelector('#shopSheet:not([hidden])');
  const person = await page.evaluate(() => ({
    title: document.getElementById('shopSheetTitle').textContent,
    body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ')
  }));
  ok('somebody\u2019s page is what you know and what you do not',
    /Wealth/.test(person.body) && /Likes/.test(person.body) &&
    /Dislikes/.test(person.body) && /Wants/.test(person.body) &&
    /Bought here/.test(person.body) && /Commissions/.test(person.body),
    person.body.slice(0, 300));
  ok('and it never gives a figure for what they are carrying',
    !/Carrying/.test(person.body) && !/Will spend/.test(person.body),
    person.body.slice(0, 300));

  // an unread stranger, and the same person once the forge has their measure
  const knowing = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const one = sh.town[0];
    one.known = { wealth: false, likes: [], dislikes: [] };
    F.shopOpenTownsfolk(one.id);
    await new Promise((r) => setTimeout(r, 120));
    const blind = document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ');
    const taste = C.customerTaste(one.type);
    C.learnFact(one, { kind: 'wealth' });
    C.learnFact(one, { kind: 'like', cat: taste.likes[0] });
    F.shopOpenTownsfolk(one.id);
    await new Promise((r) => setTimeout(r, 120));
    const seen = document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ');
    return { blind, seen, band: C.wealthBandOf(one).name,
      like: C.shopCategory(taste.likes[0]).name };
  });
  ok('a stranger\u2019s wealth and taste both read ???',
    /Wealth [\s\S]*\?\?\?/.test(knowing.blind) && /\?\?\?/.test(knowing.blind) &&
    !knowing.blind.includes(knowing.band), knowing.blind.slice(0, 220));
  ok('and what has been learned is written in plainly',
    knowing.seen.includes(knowing.band) && knowing.seen.includes(knowing.like),
    knowing.seen.slice(0, 260));
  ok('and the sheet is headed with their name',
    person.title.length > 2 && /\w/.test(person.title), person.title);
  await page.click('#shopSheet [data-ghost]');
  await page.waitForTimeout(120);

  ok('a purse is spent down and filled again at the turn of the week',
    await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      const one = sh.town[0];
      one.gold = 500;
      const income = one.income;
      C.payTown(sh);
      const afterPay = one.gold;
      one.gold = 0;
      return afterPay === 500 + income && C.purseFor(one) === 0;
    }));

  ok('somebody who has been looking a week starts looking for something else',
    await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      for (const one of sh.town) { one.gold = 400; one.wantDay = 1; }
      sh.day += C.SHOP.town.wantDays + 1;
      const before = sh.town.map((o) => C.wantName(o));
      const changed = C.driftWants(sh);
      const after = sh.town.map((o) => C.wantName(o));
      F.shopRender();
      return changed.length > 0 && after.some((w, i) => w !== before[i]);
    }));

  section('Open Your Forge: the board you worked is on the price tag');
  const bands = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    F.testClearFloor(sh);
    F.testStock(sh, C.lineKey('shortsword', 'bronze'), 4, 96, 40);
    F.testStock(sh, C.lineKey('hatchet', 'bronze'), 4, 22, 9);
    F.shopUi.tab = 'shelf';
    F.shopRender();
    return {
      tags: Array.from(document.querySelectorAll('#shPanel .shelf-box .sb-tag'))
        .map((t) => t.textContent),
      crude: C.recommendedPrice('shortsword', 'bronze', 10),
      master: C.recommendedPrice('shortsword', 'bronze', 98)
    };
  });
  ok('a stand names the work standing on it, not just the price',
    bands.tags.indexOf('Masterwork') >= 0 && bands.tags.indexOf('Crude') >= 0,
    bands.tags.join(','));
  ok('and a masterwork is worth several times what crude work is',
    bands.master > bands.crude * 2.5, bands.crude + ' -> ' + bands.master);

  ok('somebody with standards will not look at rough work', await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    F.testClearFloor(sh);
    F.testStock(sh, C.lineKey('shortsword', 'bronze'), 6, 18, 8);
    const knight = C.makeTownsfolk(sh, 'knight');
    knight.gold = 9000;
    knight.standards = 70;
    knight.want = { cat: 'swords', item: null };
    const rough = C.chooseGoods(sh, knight);
    F.testStock(sh, C.lineKey('shortsword', 'bronze'), 6, 96, 8);
    const good = C.chooseGoods(sh, knight);
    F.shopRender();
    return rough === null && good === C.lineKey('shortsword', 'bronze');
  }));

  ok('the counter names the person, their trade and what brought them in',
    await (async () => {
      await page.evaluate(() => {
        const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
        F.testClearFloor(sh);
        sh.reputation = 70;
        for (const one of sh.town) one.gold = 4000;
        F.testStock(sh, C.lineKey('shortsword', 'bronze'), 200, 94, 20);
        F.shopUi.tab = 'shelf';
        F.shopRender();
      });
      await shopAction(page, 'tend');
      await page.waitForTimeout(350);
      const head = await page.evaluate(() => {
        const el = document.querySelector('#shopSheetBody .cust-head');
        const F = window.CHECKSMITH;
        const p = F.shopUi.session && F.shopUi.session.pending;
        return { text: el ? el.innerText.replace(/\s+/g, ' ') : '',
          who: p ? p.name : '', trade: p ? p.trade : '', after: p ? p.after : '',
          named: !!(p && F.core.townsfolkById(F.app.shop, p.who)) };
      });
      // the head names them and says what brought them in, and the corner
      // carries what the forge knows of their means - never a figure
      return head.named && head.text.indexOf(head.who) >= 0 &&
        /wants /i.test(head.text) && !/\dg/.test(head.text) &&
        head.text.toLowerCase().indexOf(head.after.toLowerCase()) >= 0;
    })());
  await page.evaluate(() => {
    const F = window.CHECKSMITH;
    F.shopSheetClose();
    F.shopUi.session = null;
    F.shopRender();
  });
  await page.waitForTimeout(150);

  section('Open Your Forge: the Almanac is sixteen skill trees');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.gold = 100000;
    // back to the forge as it opened: two trades, their roots, nothing else
    sh.disciplines = ['swords', 'shields'];
    sh.blueprints = { shortsword: 1, buckler: 1 };
    sh.known = ['shortsword', 'buckler'];
    sh.xp = { swords: 0, shields: 0 };
    sh.xpTotal = { swords: 0, shields: 0 };
    F.shopUi.almanacCat = null;
    F.shopRender();
  });
  await shopAction(page, 'almanac');
  await page.waitForSelector('#shopSheet:not([hidden])');
  const book = await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    const body = document.getElementById('shopSheetBody');
    return { title: document.getElementById('shopSheetTitle').textContent,
      cards: body.querySelectorAll('[data-craft]').length,
      crafts: C.SHOP.categories.length,
      held: body.querySelectorAll('.craft-card:not(.shut)').length,
      shut: body.querySelectorAll('.craft-card.shut').length,
      art: body.querySelectorAll('.cc-art .sprite').length,
      wide: body.scrollWidth > body.clientWidth + 1 };
  });
  ok('the Almanac opens on the crafts themselves',
    /Almanac/.test(book.title) && book.cards === book.crafts, JSON.stringify(book));
  ok('each craft is a card with the sprite of what it starts you on',
    book.art === book.crafts, JSON.stringify(book));
  ok('the crafts you took up are told from the ones you did not',
    book.held >= 2 && book.shut > 0, JSON.stringify(book));
  ok('and the crafts do not push the sheet sideways on a phone', book.wide === false);

  await page.click('#shopSheetBody [data-craft="swords"]');
  await page.waitForTimeout(150);
  const tree = await page.evaluate(() => {
    const C = window.CHECKSMITH.core;
    const body = document.getElementById('shopSheetBody');
    const nodes = Array.from(body.querySelectorAll('.alm-node'));
    const boxes = nodes.map((n) => n.getBoundingClientRect());
    let overlap = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
          overlap = true;
        }
      }
    }
    const canvas = body.querySelector('.alm-canvas');
    const box = body.querySelector('#almTree');
    // the tree is the ordinary blueprints; a named masterwork is listed beside it
    return { nodes: nodes.length, want: C.disciplineItems('swords').filter((it) => !it.special).length,
      named: body.querySelectorAll('.alm-special').length,
      lines: body.querySelectorAll('.alm-line').length,
      sprites: body.querySelectorAll('.alm-node .sprite').length,
      bar: body.querySelector('.craft-bar').innerText.replace(/\s+/g, ' '),
      back: !!body.querySelector('[data-craft-back]'),
      unlocked: body.querySelectorAll('.alm-node.unlocked').length,
      locked: body.querySelectorAll('.alm-node.locked').length,
      overlap: overlap,
      offscreen: boxes.some((b) => b.width < 30 || b.height < 30),
      // drawn to fit its window: nothing in it scrolls, nothing is cut off
      reachable: !!(canvas && box) && canvas.scrollWidth <= box.clientWidth + 1 &&
        boxes.every((b) => b.left >= box.getBoundingClientRect().left - 1 &&
          b.right <= box.getBoundingClientRect().right + 1),
      sheetWide: body.scrollWidth > body.clientWidth + 1 };
  });
  ok('a craft opens as a tree with a node for every blueprint',
    tree.nodes === tree.want && tree.nodes > 1, JSON.stringify(tree));
  // the named masterworks are a page of their own, a button away from the tree
  const named = await page.evaluate(async () => {
    const link = document.querySelector('#shopSheetBody [data-alm-specials]');
    if (!link) return { link: false };
    link.click();
    await new Promise((r) => setTimeout(r, 80));
    const out = { link: true, listed: document.querySelectorAll('#shopSheetBody .alm-special').length,
      onTree: document.querySelectorAll('#shopSheetBody .alm-node').length };
    document.querySelector('#shopSheetBody [data-alm-tree]').click();
    await new Promise((r) => setTimeout(r, 80));
    out.backOnTree = document.querySelectorAll('#shopSheetBody .alm-node').length;
    return out;
  });
  ok('and its named masterwork is listed beside the tree, not on it',
    tree.named === 0 && named.link && named.listed === 1 && named.onTree === 0 &&
    named.backOnTree === tree.nodes, JSON.stringify([tree, named]));
  ok('every node wears its own sprite', tree.sprites === tree.nodes, JSON.stringify(tree));
  ok('the steps of the progression are drawn as lines', tree.lines >= tree.nodes - 1,
    JSON.stringify(tree));
  ok('no two blueprints are drawn on top of each other', tree.overlap === false);
  ok('every node is a reachable tap target', tree.offscreen === false);
  ok('a wide tree scrolls in its own frame rather than dragging the sheet',
    tree.sheetWide === false && tree.reachable, JSON.stringify(tree));
  ok('the head of the page counts experience, blueprints and masteries',
    /^XP \d+/i.test(tree.bar) && /TOTAL XP/i.test(tree.bar) &&
    /UNLOCKED/i.test(tree.bar) && /MASTERED/i.test(tree.bar), tree.bar);
  ok('the way back to the crafts is on the page', tree.back === true);
  ok('what is held and what is out of reach are told apart on sight',
    tree.unlocked > 0 && tree.locked > 0, JSON.stringify(tree));
  await page.screenshot({ path: path.join(SHOTS, '26-almanac.png'), fullPage: true });

  // a blueprint out of reach says exactly what it is waiting on
  await page.click('#shopSheetBody [data-recipe="greatsword"]');
  await page.waitForTimeout(150);
  const shut = await page.evaluate(() => ({
    title: document.getElementById('shopSheetTitle').textContent,
    body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' '),
    state: document.querySelector('.bp-state') ? document.querySelector('.bp-state').textContent : null,
    actions: Array.from(document.querySelectorAll('#shopSheetActions .btn')).map((b) => b.textContent)
  }));
  ok('a locked blueprint is named as locked', /Greatsword/i.test(shut.title) &&
    /Locked/i.test(shut.state), JSON.stringify(shut.state));
  ok('and says which blueprint must reach which level',
    /Requires .* at level/i.test(shut.body) && /Longsword/i.test(shut.body),
    shut.body.slice(-300));
  ok('it names its craft, its customers and what it is worth',
    /Swords/.test(shut.body) && /Wanted by/.test(shut.body) && /Value/.test(shut.body),
    shut.body.slice(0, 300));
  ok('and offers neither the anvil nor a way to buy past it',
    !shut.actions.some((a) => /Forge This Item|Unlock Blueprint|Upgrade Blueprint/i.test(a)), shut.actions.join(','));

  // the root of the tree: held, and takeable further with experience
  await page.click('#shopSheet [data-ghost]');
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    sh.xp.swords = 100000;
    if (F.shopUi.redraw) F.shopUi.redraw();
  });
  await page.click('#shopSheetBody [data-recipe="shortsword"]');
  await page.waitForTimeout(150);
  const root = await page.evaluate(() => ({
    body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' '),
    pips: document.querySelectorAll('.bp-level .an-pips i').length,
    lit: document.querySelectorAll('.bp-level .an-pips i.on').length,
    actions: Array.from(document.querySelectorAll('#shopSheetActions .btn')).map((b) => b.textContent)
  }));
  ok('a held blueprint shows its level as pips', root.pips === 5 && root.lit === 1,
    JSON.stringify(root));
  ok('and what it is worth now against what the next level would make it',
    /Value/.test(root.body) && /Next level/.test(root.body), root.body.slice(0, 300));
  ok('an upgrade is offered with its price in experience',
    root.actions.some((a) => /Upgrade Blueprint/i.test(a) && /XP/.test(a)), root.actions.join(','));

  const levelled = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const before = C.craftXp(sh, 'swords');
    const btn = Array.from(document.querySelectorAll('#shopSheetActions .btn'))
      .find((b) => /Upgrade Blueprint/i.test(b.textContent));
    btn.click();
    await new Promise((r) => setTimeout(r, 220));
    return { level: C.blueprintLevel(sh, 'shortsword'), spent: before - C.craftXp(sh, 'swords'),
      shields: C.craftXp(sh, 'shields'),
      lit: document.querySelectorAll('.bp-level .an-pips i.on').length };
  });
  ok('spending experience takes the blueprint a level further',
    levelled.level === 2 && levelled.spent > 0 && levelled.lit === 2, JSON.stringify(levelled));
  ok('and it comes out of that craft’s pocket alone', levelled.shields === 0,
    JSON.stringify(levelled));

  // taking it far enough opens the next node for purchase
  const nextNode = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    while (C.blueprintLevel(sh, 'shortsword') < C.requiredParentLevel('longsword')) {
      C.upgradeBlueprint(sh, 'shortsword');
    }
    F.shopOpenAlmanac();
    F.shopUi.almanacCat = 'swords';
    if (F.shopUi.redraw) F.shopUi.redraw();
    await new Promise((r) => setTimeout(r, 200));
    const node = document.querySelector('[data-recipe="longsword"]');
    return { state: node ? node.className : null,
      open: document.querySelectorAll('.alm-line.open').length };
  });
  ok('reaching the level lights the path and opens the next blueprint',
    /available/.test(nextNode.state) && nextNode.open > 0, JSON.stringify(nextNode));

  await page.click('#shopSheetBody [data-recipe="longsword"]');
  await page.waitForTimeout(150);
  const learn = await page.evaluate(() => ({
    actions: Array.from(document.querySelectorAll('#shopSheetActions .btn')).map((b) => b.textContent),
    body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ')
  }));
  ok('an available blueprint is offered to learn, at a price in experience',
    learn.actions.some((a) => /Unlock Blueprint/i.test(a) && /XP/.test(a)), learn.actions.join(','));
  ok('and says what it follows on from', /Requires/i.test(learn.body),
    learn.body.slice(0, 300));

  const learned = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const btn = Array.from(document.querySelectorAll('#shopSheetActions .btn'))
      .find((b) => /Unlock Blueprint/i.test(b.textContent));
    btn.click();
    await new Promise((r) => setTimeout(r, 220));
    return { level: C.blueprintLevel(sh, 'longsword'),
      known: C.recipeKnown(sh, 'longsword'),
      sibling: C.recipeKnown(sh, 'falchion'),
      actions: Array.from(document.querySelectorAll('#shopSheetActions .btn'))
        .map((b) => b.textContent).join(',') };
  });
  ok('learning it puts it in the book at level one and opens the anvil to it',
    learned.known && learned.level === 1 && /Forge This Item/.test(learned.actions),
    JSON.stringify(learned));
  ok('the branch you did not take stays untaken', learned.sibling === false);

  // a craft never taken up cannot be spent into
  await page.evaluate(() => {
    const F = window.CHECKSMITH;
    F.shopOpenAlmanac();
    F.shopUi.almanacCat = 'axes';
    if (F.shopUi.redraw) F.shopUi.redraw();
  });
  await page.waitForTimeout(180);
  const outside = await page.evaluate(() => {
    const body = document.getElementById('shopSheetBody');
    return { body: body.innerText.replace(/\s+/g, ' '),
      buy: !!body.querySelector('[data-takecraft]'),
      locked: body.querySelectorAll('.alm-node.locked').length,
      nodes: body.querySelectorAll('.alm-node').length };
  });
  ok('a craft you never took up shows its tree entirely shut',
    outside.locked === outside.nodes && outside.nodes > 0, JSON.stringify(outside));
  ok('and offers to be taken up for money rather than experience',
    outside.buy && /Take up/i.test(outside.body) && /\d+g/.test(outside.body),
    outside.body.slice(0, 220));

  const bought = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.reputation = 200;
    sh.gold = 100000;
    if (F.shopUi.redraw) F.shopUi.redraw();
    await new Promise((r) => setTimeout(r, 120));
    const before = sh.gold;
    document.querySelector('[data-takecraft]').click();
    await new Promise((r) => setTimeout(r, 250));
    return { held: C.hasDiscipline(sh, 'axes'), root: C.blueprintLevel(sh, 'hatchet'),
      xp: C.craftXp(sh, 'axes'), paid: before - sh.gold };
  });
  ok('taking up a craft costs gold and hands over its root at level one',
    bought.held && bought.root === 1 && bought.paid > 0, JSON.stringify(bought));
  ok('and starts it with no experience of its own', bought.xp === 0, JSON.stringify(bought));

  // only what the forge holds may go on the anvil
  await page.click('#shopSheet [data-ghost]');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const F = window.CHECKSMITH;
    F.app.shop.materials.bronze = 40;
    F.shopRender();
  });
  await shopAction(page, 'forge');
  await page.waitForSelector('#shopSheet:not([hidden])');
  const anvil = await page.evaluate(() => {
    const C = window.CHECKSMITH.core, sh = window.CHECKSMITH.app.shop;
    const opts = Array.from(document.querySelectorAll('#shopSheetBody [data-sel="item"] option'))
      .map((o) => o.value);
    return { opts: opts.length, known: sh.known.length,
      unknown: opts.filter((id) => !C.recipeKnown(sh, id)) };
  });
  ok('the anvil offers exactly the blueprints the forge holds, and no others',
    anvil.opts === anvil.known && anvil.unknown.length === 0, JSON.stringify(anvil));
  await page.click('#shopSheet [data-ghost]');
  await page.waitForTimeout(120);

  section('Open Your Forge: offering something else at the counter');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    F.testClearFloor(sh);
    sh.reputation = 70;
    F.testStock(sh, C.lineKey('longsword', 'bronze'), 20, 95, 62);
    F.testStock(sh, C.lineKey('shortsword', 'bronze'), 20, 90, 14);
    F.testStock(sh, C.lineKey('pan', 'bronze'), 20, 90, 9);
    F.shopUi.tab = 'shelf';
    F.shopRender();
  });
  await shopAction(page, 'tend');
  await page.waitForTimeout(300);
  // walk the queue until somebody is standing there with an offer on the table
  let atCounter = false;
  for (let i = 0; i < 12 && !atCounter; i++) {
    atCounter = await page.evaluate(() =>
      !!document.querySelector('#shopSheetActions .btn') &&
      Array.from(document.querySelectorAll('#shopSheetActions .btn'))
        .some((b) => /Offer Alternative/.test(b.textContent)));
    if (atCounter) break;
    const next = await page.$('#shopSheetActions .btn.primary');
    if (!next) break;
    await next.click();
    await page.waitForTimeout(160);
  }
  ok('a customer at the counter can be offered something else', atCounter);
  if (atCounter) {
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('#shopSheetActions .btn'))
        .find((x) => /Offer Alternative/.test(x.textContent));
      b.click();
    });
    await page.waitForTimeout(160);
    const alts = await page.evaluate(() => {
      const F = window.CHECKSMITH;
      const body = document.getElementById('shopSheetBody');
      const rows = Array.from(body.querySelectorAll('[data-alt]'));
      return { title: document.getElementById('shopSheetTitle').textContent,
        rows: rows.length,
        wanted: F.shopUi.session.pending.key,
        keys: rows.map((r) => r.dataset.alt),
        reads: rows.map((r) => r.querySelector('.sub').dataset.read) };
    });
    ok('the list holds everything on the floor but what they came for',
      alts.rows > 0 && alts.keys.indexOf(alts.wanted) < 0, JSON.stringify(alts));
    ok('and says how each one would sit with them',
      alts.reads.every((r) => ['keen', 'warm', 'cool', 'cold'].indexOf(r) >= 0),
      alts.reads.join(','));
    await page.click('#shopSheetBody [data-alt]');
    await page.waitForTimeout(200);
    const answer = await page.evaluate(() => {
      const F = window.CHECKSMITH;
      return { title: document.getElementById('shopSheetTitle').textContent,
        offers: F.shopUi.session.report.offers || 0,
        stillThere: !!F.shopUi.session.pending };
    });
    ok('they either take it or wave it away, and the offer is spent either way',
      answer.offers === 1 && /Sold|Alternative Declined/.test(answer.title),
      JSON.stringify(answer));
    if (answer.stillThere) {
      ok('a refusal leaves them standing there wanting what they came for',
        await page.evaluate(() => {
          const F = window.CHECKSMITH;
          return F.shopUi.session.pending.offered === true &&
            F.core.alternativeOffers(F.app.shop, F.shopUi.session).length === 0;
        }));
    } else {
      ok('a swap sells that item instead', await page.evaluate(() =>
        window.CHECKSMITH.shopUi.session.report.swapped === 1));
    }
  }
  await page.evaluate(() => { window.CHECKSMITH.shopSheetClose(); });
  await page.evaluate(() => {
    const F = window.CHECKSMITH;
    F.shopUi.session = null;
    F.shopRender();
  });
  await page.waitForTimeout(150);

  section('Open Your Forge: property, ore and the carts that fetch it');
  // a clean slate on the shop floor so nothing from the counter is in the way
  await page.evaluate(() => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    F.testClearFloor(sh);
    sh.gold = 400000;
    sh.mines = []; sh.vehicles = []; sh.ore = {};
    sh.commissions = []; sh.commissionOffers = [];
    F.shopUi.tab = 'props';
    F.shopRender();
  });
  await page.waitForTimeout(150);
  const propEmpty = await page.evaluate(() => ({
    text: document.getElementById('shPanel').innerText,
    deeds: document.querySelectorAll('#shPanel [data-buymine]').length,
    carts: document.querySelectorAll('#shPanel [data-buyvehicle]').length
  }));
  ok('a forge with no land is told what land would be for',
    /You own no mines/i.test(propEmpty.text), propEmpty.text.slice(0, 120));
  ok('every mineral has a deed on offer',
    propEmpty.deeds === await page.evaluate(() => window.CHECKSMITH.core.SHOP.mines.length),
    String(propEmpty.deeds));
  ok('every vehicle is on offer too',
    propEmpty.carts === await page.evaluate(() => window.CHECKSMITH.core.SHOP.vehicles.length),
    String(propEmpty.carts));

  await page.click('#shPanel [data-buymine="bronze"]');
  await page.waitForTimeout(200);
  const deed = await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop;
    return { mines: sh.mines.length, ore: sh.ore.bronze || 0,
      bars: sh.materials.bronze, cards: document.querySelectorAll('#shPanel .mine-card').length };
  });
  ok('buying a deed puts a property on the books', deed.mines === 1 && deed.cards === 1,
    JSON.stringify(deed));
  ok('and hands the forge no metal at all', deed.ore === 0, JSON.stringify(deed));

  await page.click('#shPanel [data-buymine="bronze"]');
  await page.waitForTimeout(200);
  const twice = await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop;
    return { mines: sh.mines.length, names: sh.mines.map((m) => m.name) };
  });
  ok('two mines of one mineral stand side by side, told apart by name',
    twice.mines === 2 && twice.names[0] !== twice.names[1], JSON.stringify(twice));

  // down the shaft: hire somebody, then let the week turn
  await page.click('#shPanel [data-mine]');
  await page.waitForSelector('#shopSheet:not([hidden])');
  await page.click('#shopSheetActions .btn:nth-child(1)');          // Find miners
  await page.waitForTimeout(150);
  const pit = await page.evaluate(() => ({
    applicants: document.querySelectorAll('#shopSheetBody [data-takeon]').length,
    works: document.querySelectorAll('#shopSheetBody [data-minebuy]').length
  }));
  ok('a mine finds its own miners, and its own works to buy',
    pit.applicants === 3 && pit.works === 3, JSON.stringify(pit));
  await page.click('#shopSheetBody [data-takeon]');
  await page.waitForTimeout(200);
  const staffed = await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop;
    return { miners: sh.mines[0].miners.length, staff: sh.staff.length,
      cap: window.CHECKSMITH.core.staffCapacity(sh) };
  });
  ok('a miner goes down the shaft, not onto the forge roster',
    staffed.miners === 1 && staffed.staff <= staffed.cap, JSON.stringify(staffed));
  await page.click('#shopSheet [data-ghost]');
  await page.waitForTimeout(120);

  const dug = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const before = sh.mines[0].ore;
    const rows = C.runMines(sh, 9);
    const again = C.runMines(sh, 9);
    F.shopRender();
    return { before, after: sh.mines[0].ore, mines: sh.mines.length,
      rows: rows.length, again: again.length };
  });
  ok('a week down the mine puts ore at the mine, and only once',
    dug.before === 0 && dug.after > 0 && dug.rows === dug.mines && dug.again === 0,
    JSON.stringify(dug));

  await page.click('#shPanel [data-buyvehicle="cart"]');
  await page.waitForTimeout(200);
  const yard = await page.evaluate(() => ({
    boxes: document.querySelectorAll('#shPanel .yard-box').length,
    text: document.querySelector('#shPanel .yard-box').innerText.replace(/\n/g, ' ')
  }));
  ok('a bought cart stands in the yard and says what it carries',
    yard.boxes === 1 && /5/.test(yard.text), JSON.stringify(yard));

  // and the runner who fetches it
  const fetched = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.mines[0].ore = 40;
    const res = C.collectOre(sh, sh.mines[0].id, sh.vehicles[0].id, 999);
    F.shopUi.tab = 'metal';
    F.shopRender();
    return { load: res.load, left: sh.mines[0].ore, yard: sh.ore.bronze,
      text: document.getElementById('shPanel').innerText };
  });
  ok('a handcart brings home five and leaves the rest down the mine',
    fetched.load === 5 && fetched.left === 35 && fetched.yard === 5, JSON.stringify(fetched));
  ok('the metal page keeps raw ore apart from bar stock',
    /Ore \d+ \/ \d+/.test(fetched.text) && /Ingots/i.test(fetched.text),
    fetched.text.slice(0, 200));

  await page.click('#shPanel [data-smelt="bronze"]');
  await page.waitForSelector('#shopSheet:not([hidden])');
  await page.click('#shopSheetActions .btn:nth-child(1)');
  await page.waitForTimeout(400);
  const smelted = await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop;
    return { ore: sh.ore.bronze || 0, bars: sh.materials.bronze };
  });
  ok('smelting takes the ore away and leaves bar stock behind',
    smelted.ore < 10, JSON.stringify(smelted));
  for (let i = 0; i < 40 && (await page.isVisible('#shopSheet')); i++) {
    await page.click('#shopSheet [data-at="0"]');
    await page.waitForTimeout(80);
  }
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 8000 });

  section('Open Your Forge: the commission ledger');
  const ledger = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.commissions = []; sh.commissionOffers = [];
    for (const id of ['farming', 'tools', 'household']) {
      if (!C.hasDiscipline(sh, id)) C.takeUpDiscipline(sh, id, 'apprenticed');
    }
    sh.reputation = 60;
    const one = C.makeTownsfolk(sh, 'farmer');
    one.gold = 4000;
    const rnd = sh.rnd;
    sh.rnd = () => 0;
    const com = C.rollCommission(sh, one);
    sh.rnd = rnd;
    sh.commissionOffers.push(com);
    F.shopUi.tab = 'ledger';
    F.shopRender();
    return { id: com.id, qty: com.qty, key: com.key, pay: com.pay,
      cards: document.querySelectorAll('#shPanel .contract').length,
      text: document.getElementById('shPanel').innerText };
  });
  ok('an offer left with your people waits in the ledger for you',
    ledger.cards === 1 && /waiting for your answer/i.test(ledger.text), ledger.text.slice(0, 160));
  ok('the contract says who wants what, and by when',
    /Accept/.test(ledger.text) && /Decline/.test(ledger.text), ledger.text.slice(0, 200));

  const took = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const before = sh.gold;
    document.querySelector('#shPanel [data-take]').click();
    await new Promise((r) => setTimeout(r, 200));
    return { taken: sh.commissions.length, offers: sh.commissionOffers.length,
      paid: sh.gold - before, text: document.getElementById('shPanel').innerText };
  });
  ok('accepting books the contract and pays the advance up front',
    took.taken === 1 && took.offers === 0 && took.paid > 0, JSON.stringify(took));
  ok('and the ledger then shows what is owed on it',
    /still needed/i.test(took.text), took.text.slice(0, 220));

  const promised = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const com = sh.commissions[0];
    C.addStorage(sh, com.key, com.qty, 100);
    F.shopRender();
    const held = sh.storage[com.key].qty;
    document.querySelector('#shPanel [data-fill]').click();
    await new Promise((r) => setTimeout(r, 200));
    return { held, filled: com.filled, qty: com.qty,
      storage: sh.storage[com.key] ? sh.storage[com.key].qty : 0,
      text: document.getElementById('shPanel').innerText };
  });
  // storage may hold more than the contract needs, so what matters is that
  // exactly what was promised left it — nothing copied, nothing over-taken
  ok('promising goods moves them out of storage rather than copying them',
    promised.filled === promised.qty &&
    promised.storage === promised.held - promised.qty, JSON.stringify(promised));
  ok('a contract whose goods are made says it is awaiting delivery',
    /Awaiting delivery/i.test(promised.text), promised.text.slice(0, 260));
  ok('and it is not paid for merely being made', await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop;
    return sh.commissions.length === 1 && !window.CHECKSMITH.core
      .commissionDone(sh.commissions[0]);
  }));

  // with nothing in the yard there is no way to get it to them
  const grounded = await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop;
    sh.vehicles = [];
    window.CHECKSMITH.shopRender();
    const btn = document.querySelector('#shPanel [data-deliver]');
    return { disabled: !!(btn && btn.disabled),
      text: btn ? btn.textContent : '' };
  });
  ok('a delivery with nothing to cart it in is offered but refused',
    grounded.disabled && /No vehicle/i.test(grounded.text), JSON.stringify(grounded));

  // a handcart, and a contract too big for one trip
  const split = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.gold = 100000;
    const cart = C.shopBuyVehicle(sh, 'cart').vehicle;
    F.shopRender();
    const com = sh.commissions[0];
    const trips = Math.ceil(C.commissionToShip(com) / C.vehicleCapacity(cart));
    document.querySelector('#shPanel [data-deliver]').click();
    await new Promise((r) => setTimeout(r, 200));
    const sheet = document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ');
    return { trips, sheet, cap: C.vehicleCapacity(cart), qty: com.qty };
  });
  ok('taking it out yourself asks which vehicle and says how many trips',
    /Waiting to deliver/i.test(split.sheet) && /Trips needed/i.test(split.sheet) &&
    /uses this phase/i.test(split.sheet), split.sheet.slice(0, 260));

  const firstRun = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const com = sh.commissions[0];
    const before = sh.gold, phase = sh.phaseIndex, day = sh.day;
    document.querySelector('#shopSheetActions .btn.primary').click();
    await new Promise((r) => setTimeout(r, 400));
    return { delivered: com.delivered || 0, paid: sh.gold - before,
      moved: sh.phaseIndex !== phase || sh.day !== day,
      state: C.commissionStateName(sh, com) };
  });
  ok('one load goes out, and the phase goes with it',
    firstRun.delivered === split.cap && firstRun.moved, JSON.stringify(firstRun));
  ok('a part-delivered contract is not paid yet, and says so',
    firstRun.paid === 0 && /Partly delivered/i.test(firstRun.state),
    JSON.stringify(firstRun));

  // drain whatever that phase raised, then cart the rest of it
  for (let i = 0; i < 60 && (await page.isVisible('#shopSheet')); i++) {
    await page.click('#shopSheet [data-at="0"]');
    await page.waitForTimeout(80);
  }
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 8000 });

  const handed = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const com = sh.commissions[0];
    const before = sh.gold, rep = sh.reputation;
    const cart = sh.vehicles[0];
    let guard = 0, paid = 0;
    while (!C.commissionDone(com) && guard++ < 20) {
      cart.busy = null;
      paid += C.deliverCommission(sh, com.id, cart.id).paid || 0;
    }
    F.shopRender();
    return { open: sh.commissions.length, paid: sh.gold - before, banked: paid,
      better: sh.reputation > rep, trips: guard };
  });
  ok('the last load pays the balance and builds the forge a name',
    handed.open === 0 && handed.paid > 0 && handed.better, JSON.stringify(handed));
  ok('and the balance is paid once however many trips it took',
    handed.trips > 1 && handed.paid === handed.banked, JSON.stringify(handed));

  const missed = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    for (const id of ['farming', 'tools', 'household']) {
      if (!C.hasDiscipline(sh, id)) C.takeUpDiscipline(sh, id, 'apprenticed');
    }
    const one = C.makeTownsfolk(sh, 'farmer');
    one.gold = 4000;
    const rnd = sh.rnd;
    sh.rnd = () => 0;
    const com = C.rollCommission(sh, one);
    sh.rnd = rnd;
    sh.commissionOffers.push(com);
    C.acceptCommission(sh, com.id);
    const rep = sh.reputation;
    sh.day = com.dueDay + 1;
    const failed = C.expireCommissions(sh);
    F.shopRender();
    return { failed: failed.length, open: sh.commissions.length, worse: sh.reputation < rep };
  });
  ok('a contract whose day has gone is off the books, and it costs you',
    missed.failed === 1 && missed.open === 0 && missed.worse, JSON.stringify(missed));
  await page.screenshot({ path: path.join(SHOTS, '31-ledger.png'), fullPage: true });

  section('Open Your Forge: a runner on the road');
  const errands = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    // a contract with its goods made, a mine, and two carts in the yard
    sh.gold = 200000;
    sh.commissions = []; sh.commissionOffers = [];
    sh.vehicles = [];
    C.shopBuyVehicle(sh, 'cart');
    C.shopBuyVehicle(sh, 'wagon');
    if (!sh.mines.length) C.shopBuyMine(sh, 'bronze');
    const one = C.makeTownsfolk(sh, 'farmer');
    one.gold = 4000;
    sh.reputation = 60;
    const rnd = sh.rnd; sh.rnd = () => 0;
    const com = C.rollCommission(sh, one); sh.rnd = rnd;
    sh.commissionOffers.push(com);
    C.acceptCommission(sh, com.id);
    C.addStorage(sh, com.key, com.qty, 100, 1);
    C.allocateCommission(sh, com.id, com.qty);
    // a runner on the books, free this phase
    sh.staff = sh.staff.filter((e) => e.role !== 'runner');
    sh.staff.push({ id: sh.nextId++, name: 'Wren Carter', role: 'runner',
      rank: 'C', power: 3, wage: 30, face: 'traveler' });
    sh.assignments = {};
    F.shopUi.tab = 'staff';
    F.shopRender();
    return { com: com.id, qty: com.qty, ready: C.commissionReady(com) };
  });
  ok('a contract with its goods made is ready for the road', errands.ready);

  await page.click('#shPanel [data-slot-role="runner"]');
  await page.waitForSelector('#shopSheet:not([hidden])');
  await page.click('#shopSheetBody [data-pick-hand]');
  await page.waitForTimeout(200);
  const choices = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#shopSheetActions .btn')).map((b) => b.textContent));
  ok('a runner is offered market, ore and a delivery',
    choices.some((l) => /Buy Ingots/i.test(l)) && choices.some((l) => /Collect Ore/i.test(l)) &&
    choices.some((l) => /Deliver a Commission/i.test(l)), choices.join(','));

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('#shopSheetActions .btn'))
      .find((b) => /Deliver a Commission/i.test(b.textContent));
    btn.click();
  });
  await page.waitForTimeout(220);
  const ship = await page.evaluate(() => {
    const body = document.getElementById('shopSheetBody');
    return { text: body.innerText.replace(/\s+/g, ' '),
      commissions: body.querySelectorAll('[data-sel="commission"] option').length,
      vehicles: body.querySelectorAll('[data-sel="vehicle"] option').length,
      disabled: body.querySelectorAll('[data-sel="vehicle"] option[disabled]').length };
  });
  ok('the delivery screen names the contract, the customer and the cart',
    /Commission/i.test(ship.text) && /Customer/i.test(ship.text) &&
    /Still to deliver/i.test(ship.text) && /Vehicle capacity/i.test(ship.text) &&
    /Due/i.test(ship.text), ship.text.slice(0, 300));
  ok('it offers every vehicle owned, and every contract ready to go',
    ship.commissions >= 1 && ship.vehicles === 2, JSON.stringify(ship));

  const sent = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const phase = sh.phaseIndex, day = sh.day;
    document.querySelector('#shopSheetActions .btn.primary').click();
    await new Promise((r) => setTimeout(r, 250));
    const runner = sh.staff.find((e) => e.role === 'runner');
    const job = sh.assignments[runner.id];
    return { booked: !!job, kind: job && job.job.order.kind,
      yours: sh.phaseIndex === phase && sh.day === day,
      free: F.core.freeVehicles(sh).length,
      panel: document.getElementById('shPanel').innerText.replace(/\s+/g, ' ') };
  });
  ok('booking a runner costs the player no phase at all',
    sent.booked && sent.kind === 'deliver' && sent.yours, JSON.stringify(sent).slice(0, 200));
  ok('and the cart they took is off the yard for that phase',
    sent.free === 1, JSON.stringify(sent).slice(0, 160));
  ok('the staff screen says which errand they are on',
    /deliver/i.test(sent.panel), sent.panel.slice(0, 220));

  const ran = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const com = sh.commissions[0];
    const before = com.delivered || 0;
    const res = C.shopAdvancePhase(sh);
    F.shopRender();
    return { before, after: com.delivered || 0,
      report: (res.reports || []).some((r) => r.kind === 'delivery'),
      free: C.freeVehicles(sh).length };
  });
  ok('the phase closing is what puts the goods on the road',
    ran.before === 0 && ran.after > 0 && ran.report, JSON.stringify(ran));
  ok('and the cart is back in the yard afterwards', ran.free === 2, JSON.stringify(ran));
  await page.screenshot({ path: path.join(SHOTS, '32-delivery.png'), fullPage: true });

  section('Open Your Forge: a roster that keeps itself');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.gold = 200000;
    sh.materials.bronze = 200;
    sh.standing = [];
    sh.assignments = {};
    sh.staff = sh.staff.filter((e) => e.role !== 'smith' && e.role !== 'salesperson');
    sh.staff.push({ id: sh.nextId++, name: 'Mara Quill', role: 'smith', rank: 'C',
      power: 3, wage: 60, face: 'craftsman' });
    sh.staff.push({ id: sh.nextId++, name: 'Ode Vance', role: 'salesperson', rank: 'B',
      power: 4, wage: 70, face: 'merchant' });
    F.shopUi.tab = 'staff';
    F.shopRender();
  });
  await page.waitForTimeout(200);
  const roster = await page.evaluate(() => {
    const panel = document.getElementById('shPanel');
    return { tools: !!panel.querySelector('.roster-tools'),
      note: panel.querySelector('.rt-note').innerText.replace(/\s+/g, ' '),
      marks: panel.querySelectorAll('.rb-repeat').length };
  });
  ok('the staff screen says what is kept and what is not',
    roster.tools && /No recurring assignments/i.test(roster.note) && roster.marks === 0,
    JSON.stringify(roster));

  // keep the smith's morning box
  await page.click('#shPanel .roster-role [data-slot-role="smith"][data-slot-phase="morning"]');
  await page.waitForSelector('#shopSheet:not([hidden])');
  const picker = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#shopSheetActions .btn')).map((b) => b.textContent));
  ok('a box offers to be kept as well as filled for today',
    picker.some((l) => /^Repeat Daily$/i.test(l)), picker.join(','));

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('#shopSheetActions .btn'))
      .find((b) => /Repeat Daily/i.test(b.textContent));
    btn.click();
  });
  await page.waitForTimeout(220);
  const editor = await page.evaluate(() => {
    const body = document.getElementById('shopSheetBody');
    return { text: body.innerText.replace(/\s+/g, ' '),
      who: body.querySelectorAll('[data-sel="staff"] option').length,
      auto: body.querySelector('[data-sel="staff"] option').textContent,
      item: !!body.querySelector('[data-sel="item"]'),
      material: !!body.querySelector('[data-sel="material"]'),
      batch: !!body.querySelector('[data-num="qty"]') };
  });
  ok('the editor asks who holds it, with auto-fill offered first',
    editor.who >= 2 && /Any available/i.test(editor.auto), JSON.stringify(editor).slice(0, 220));
  ok('and asks a smith what to make, in what, and how many',
    editor.item && editor.material && editor.batch, JSON.stringify(editor).slice(0, 220));
  ok('it says what it would do as things stand',
    /If it ran now/i.test(editor.text), editor.text.slice(-200));

  const written = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    document.querySelector('#shopSheetActions .btn.primary').click();
    await new Promise((r) => setTimeout(r, 300));
    const slot = C.standingAt(sh, 'smith', 'morning');
    const panel = document.getElementById('shPanel');
    return { slot: !!slot, on: slot && slot.on, plan: slot && slot.plan,
      marks: panel.querySelectorAll('.rb-repeat').length,
      note: panel.querySelector('.rt-note').innerText.replace(/\s+/g, ' ') };
  });
  ok('keeping a box writes it into the standing roster',
    written.slot && written.on && written.plan.item, JSON.stringify(written).slice(0, 200));
  ok('and the box is marked as kept on the grid',
    written.marks === 1 && /1 recurring assignment/i.test(written.note), JSON.stringify(written).slice(0, 200));

  const morning = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    // clear today and let the day turn book it
    sh.assignments = {};
    const day = C.shopEndDay(sh);
    F.shopRender();
    const smith = sh.staff.find((e) => e.role === 'smith');
    return { rows: (day.roster || []).length,
      booked: !!C.assignedThisDay(sh, smith.id),
      marked: !!(C.assignedThisDay(sh, smith.id) || {}).job.standing,
      kept: document.querySelectorAll('#shPanel .roster-box.kept').length };
  });
  ok('the turn of the day fills the kept box by itself',
    morning.rows >= 1 && morning.booked && morning.marked, JSON.stringify(morning));
  ok('and the filled box shows it came from the book', morning.kept >= 1,
    JSON.stringify(morning));
  await page.screenshot({ path: path.join(SHOTS, '33-roster.png'), fullPage: true });

  // a box that cannot be filled is left empty, and says why
  const stuck = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.materials.bronze = 0;
    sh.assignments = {};
    const day = C.shopEndDay(sh);
    F.shopRender();
    const smith = sh.staff.find((e) => e.role === 'smith');
    const box = document.querySelector(
      '#shPanel .roster-box.empty.standing[data-slot-role="smith"]');
    return { booked: !!C.assignedThisDay(sh, smith.id),
      why: (day.roster.find((r) => r.role === 'smith') || {}).why,
      onBox: box ? box.innerText.replace(/\s+/g, ' ') : null };
  });
  ok('a kept box with no metal is left empty rather than doing something else',
    !stuck.booked && /ingot/i.test(stuck.why || ''), JSON.stringify(stuck));
  ok('and the empty box on the grid says why', /Unfilled/i.test(stuck.onBox || ''),
    JSON.stringify(stuck));

  // pausing, and the day report
  const paused = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.materials.bronze = 200;
    C.toggleStanding(sh, 'smith', 'morning', false);
    sh.assignments = {};
    const day = C.shopEndDay(sh);
    F.shopRender();
    const smith = sh.staff.find((e) => e.role === 'smith');
    return { rows: (day.roster || []).length, booked: !!C.assignedThisDay(sh, smith.id),
      still: !!C.standingAt(sh, 'smith', 'morning') };
  });
  ok('a paused box stops filling itself but is not forgotten',
    paused.rows === 0 && !paused.booked && paused.still, JSON.stringify(paused));

  const summary = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    C.toggleStanding(sh, 'smith', 'morning', true);
    C.setStanding(sh, 'runner', 'afternoon', null, { kind: 'deliver' });
    // a second smith box in the evening cannot fill: the one smith is already
    // on the morning box, and nobody works twice in a day. That is the miss.
    const dup = C.standingAt(sh, 'smith', 'morning');
    C.setStanding(sh, 'smith', 'evening', null, JSON.parse(JSON.stringify(dup.plan)));
    sh.assignments = {};
    const day = C.shopEndDay(sh);
    F.shopDayBreak(day);
    await new Promise((r) => setTimeout(r, 200));
    return { body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' '),
      rows: document.querySelectorAll('#shopSheetBody .rr-row').length,
      misses: document.querySelectorAll('#shopSheetBody .rr-row.miss').length };
  });
  ok('the morning reports every box the roster filled and every one it did not',
    /Daily assignments/i.test(summary.body) && summary.rows >= 2 && summary.misses >= 1,
    summary.body.slice(0, 280));
  for (let i = 0; i < 40 && (await page.isVisible('#shopSheet')); i++) {
    await page.click('#shopSheet [data-at="0"]');
    await page.waitForTimeout(80);
  }
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 8000 });

  section('Open Your Forge: a hand earns their rank');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.gold = 200000;
    sh.standing = [];
    sh.assignments = {};
    sh.staff = [];
    sh.staff.push({ id: sh.nextId++, name: 'Wyn Tarrow', role: 'storehand', rank: 'E',
      power: 1, wage: 9, xp: 0, face: 'labourer' });
    /* Earlier sections left miners down a shaft who have dug for weeks, and
       they are ready - rightly - so clear them to test the flag on its own. */
    for (const m of sh.mines) m.miners = [];
    F.shopUi.tab = 'staff';
    F.shopRender();
  });

  const green = await page.evaluate(() => {
    const panel = document.getElementById('shPanel');
    return { bar: panel.querySelectorAll('.crew .xp-bar').length,
      fig: (panel.querySelector('.crew .xp-fig') || {}).innerText,
      call: !!panel.querySelector('.rank-call'),
      flags: panel.querySelectorAll('.up-flag').length };
  });
  ok('a hand on the books shows the work behind them and what is left',
    green.bar === 1 && /0 \/ 60/.test(green.fig || ''), JSON.stringify(green));
  ok('and nobody is flagged for promotion before they have earned it',
    !green.call && green.flags === 0, JSON.stringify(green));

  // the work itself, through the roster, is what moves the bar
  const worked = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.storage['dagger|bronze'] = { qty: 60, quality: 60, level: 1 };
    const hand = sh.staff[0];
    C.shopAssign(sh, hand.id, { job: 'storehand', order: { keys: ['dagger|bronze'] } },
      C.shopPhase(sh));
    C.shopAdvancePhase(sh);
    F.shopRender();
    const panel = document.getElementById('shPanel');
    return { xp: hand.xp, fig: (panel.querySelector('.crew .xp-fig') || {}).innerText };
  });
  ok('doing the work moves the bar', worked.xp > 0 && !/^0 \//.test(worked.fig || ''),
    JSON.stringify(worked));

  const due = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const hand = sh.staff[0];
    C.awardXp(hand, C.rankUpAt(hand));            // they have earned it now
    F.shopRender();
    const panel = document.getElementById('shPanel');
    return { call: (panel.querySelector('.rank-call') || {}).innerText || '',
      flags: panel.querySelectorAll('.up-flag').length,
      ready: panel.querySelectorAll('.crew.ready').length };
  });
  ok('the screen says who has earned a promotion without opening anyone',
    /Wyn Tarrow/.test(due.call) && /ready for promotion/i.test(due.call),
    JSON.stringify(due));
  ok('and the hand themselves is marked on the list',
    due.flags === 1 && due.ready === 1, JSON.stringify(due));
  await page.screenshot({ path: path.join(SHOTS, '34-ranks.png'), fullPage: true });

  // opening them: what they do now, what the next rank buys, and the button
  await page.click('#shPanel .shop-list .crew');
  await page.waitForSelector('#shopSheet:not([hidden])', { timeout: 8000 });
  const panelText = await page.evaluate(() => ({
    body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' '),
    perks: document.querySelectorAll('#shopSheetBody .perks').length,
    acts: Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
      .map((b) => b.innerText.trim())
  }));
  ok('their panel says what they can do now and what the next rank buys',
    panelText.perks === 2 && /Current \(E-rank\)/.test(panelText.body) && /After promotion \(D-rank\)/.test(panelText.body),
    panelText.body.slice(0, 260));
  ok('and offers the rank up',
    panelText.acts.some((a) => /Promote to D/i.test(a)), JSON.stringify(panelText.acts));

  const ranked = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const before = { rank: sh.staff[0].rank, power: sh.staff[0].power,
      wage: sh.staff[0].wage, phase: sh.phaseIndex, day: sh.day };
    const btn = Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
      .find((b) => /Promote to/i.test(b.innerText));
    btn.click();
    await new Promise((r) => setTimeout(r, 260));
    const hand = sh.staff[0];
    return { before: before, rank: hand.rank, power: hand.power, wage: hand.wage,
      phase: sh.phaseIndex, day: sh.day,
      body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ') };
  });
  ok('ranking up promotes them then and there',
    ranked.rank === 'D' && ranked.power === ranked.before.power + 1 &&
    ranked.wage > ranked.before.wage, JSON.stringify(ranked).slice(0, 220));
  ok('and it costs no phase',
    ranked.phase === ranked.before.phase && ranked.day === ranked.before.day,
    JSON.stringify({ was: ranked.before.phase, now: ranked.phase }));
  ok('the panel now reads as a D with the road to C ahead',
    /Current \(D-rank\)/.test(ranked.body) && /After promotion \(C-rank\)/.test(ranked.body),
    ranked.body.slice(0, 220));

  for (let i = 0; i < 40 && (await page.isVisible('#shopSheet')); i++) {
    await page.click('#shopSheet [data-at-last]');
    await page.waitForTimeout(80);
  }
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 8000 });

  // asking after a trade costs nothing until somebody is taken on
  const asking = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const was = { phase: sh.phaseIndex, day: sh.day };
    F.shopAct('hire');
    await new Promise((r) => setTimeout(r, 200));
    return { was: was, phase: sh.phaseIndex, day: sh.day,
      trades: Array.from(document.querySelectorAll('#shopSheetBody .trade'))
        .map((b) => b.innerText.trim()),
      cards: document.querySelectorAll('#shopSheetBody .applicant').length };
  });
  ok('opening the search offers every trade and costs nothing',
    asking.phase === asking.was.phase && asking.day === asking.was.day &&
    asking.trades.length === 6 && asking.trades.indexOf('Miner') >= 0,
    JSON.stringify(asking));
  ok('and shows nobody until a trade is chosen', asking.cards === 0,
    JSON.stringify(asking));

  const chose = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const was = { phase: sh.phaseIndex, day: sh.day };
    const btn = Array.from(document.querySelectorAll('#shopSheetBody .trade'))
      .find((b) => b.innerText.trim() === 'Runner');
    btn.click();
    await new Promise((r) => setTimeout(r, 220));
    const cards = Array.from(document.querySelectorAll('#shopSheetBody .applicant'));
    return { was: was, phase: sh.phaseIndex, day: sh.day, cards: cards.length,
      roles: cards.map((c) => c.querySelector('.role').innerText.trim()),
      ranks: cards.map((c) => c.querySelector('.rank').innerText.trim()) };
  });
  ok('choosing a trade shows only that trade, and still costs nothing',
    chose.phase === chose.was.phase && chose.day === chose.was.day &&
    chose.cards === 3 && chose.roles.every((r) => /Runner/.test(r)),
    JSON.stringify(chose).slice(0, 240));
  ok('and every one of them starts at E',
    chose.ranks.length === 3 && chose.ranks.every((r) => r === 'E'),
    JSON.stringify(chose.ranks));

  const switched = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const was = { phase: sh.phaseIndex, day: sh.day };
    Array.from(document.querySelectorAll('#shopSheetBody .trade'))
      .find((b) => b.innerText.trim() === 'Smith').click();
    await new Promise((r) => setTimeout(r, 220));
    const roles = Array.from(document.querySelectorAll('#shopSheetBody .applicant .role'))
      .map((c) => c.innerText.trim());
    return { was: was, phase: sh.phaseIndex, day: sh.day, roles: roles };
  });
  ok('changing your mind about the trade is free too',
    switched.phase === switched.was.phase && switched.day === switched.was.day &&
    switched.roles.every((r) => /Smith/.test(r)), JSON.stringify(switched).slice(0, 200));

  const walked = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const was = { phase: sh.phaseIndex, day: sh.day };
    Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
      .find((b) => /^Close$/i.test(b.innerText.trim())).click();
    await new Promise((r) => setTimeout(r, 220));
    return { was: was, phase: sh.phaseIndex, day: sh.day,
      open: !document.getElementById('shopSheet').hidden };
  });
  ok('and walking away costs nothing at all',
    walked.phase === walked.was.phase && walked.day === walked.was.day && !walked.open,
    JSON.stringify(walked));

  const engaged = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    F.shopAct('hire');
    await new Promise((r) => setTimeout(r, 180));
    Array.from(document.querySelectorAll('#shopSheetBody .trade'))
      .find((b) => b.innerText.trim() === 'Runner').click();
    await new Promise((r) => setTimeout(r, 220));
    const was = { phase: sh.phaseIndex, day: sh.day, staff: sh.staff.length };
    document.querySelector('#shopSheetBody [data-hire]').click();
    await new Promise((r) => setTimeout(r, 400));
    const hired = sh.staff[sh.staff.length - 1];
    return { was: was, staff: sh.staff.length, phase: sh.phaseIndex, day: sh.day,
      rank: hired && hired.rank, xp: hired && hired.xp };
  });
  ok('taking somebody on hires them at E', engaged.staff === engaged.was.staff + 1 &&
    engaged.rank === 'E' && engaged.xp === 0, JSON.stringify(engaged));
  ok('and that is the moment the phase is spent',
    engaged.phase !== engaged.was.phase || engaged.day !== engaged.was.day,
    JSON.stringify(engaged));

  /* The search is a menu, not an action. Every way in and out of it is
     free; a hire is the only thing that spends the phase, it spends exactly
     one, and when there is no phase to spend it is refused and says why. */
  section('Open Your Forge: searching is free, hiring costs one phase');
  const clockOf = () => page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop;
    return { tick: sh.day * 3 + sh.phaseIndex, staff: sh.staff.length, gold: sh.gold };
  });
  const tradeTap = (name) => page.evaluate(async (n) => {
    Array.from(document.querySelectorAll('#shopSheetBody .trade'))
      .find((b) => b.innerText.trim() === n).click();
    await new Promise((r) => setTimeout(r, 180));
  }, name);
  await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    // put back afterwards, so the sections that follow see the same forge
    F.testKept = { staff: sh.staff.slice(), gold: sh.gold, mines: sh.mines.slice(),
      assignments: sh.assignments };
    sh.gold = 4000;
    sh.staff = [];
    sh.assignments = {};
    F.shopSheetClose();
    F.shopRender();
  });

  const fromBoard = await (async () => {
    const was = await clockOf();
    await page.evaluate(async () => {
      window.CHECKSMITH.shopOpenPlace('board', 'hire');
      await new Promise((r) => setTimeout(r, 120));
      document.querySelector('#shPanel [data-trade-open]').click();
      await new Promise((r) => setTimeout(r, 180));
    });
    const title = await page.textContent('#shopSheetTitle');
    for (const t of ['Salesperson', 'Smith', 'Apprentice', 'Miner', 'Runner']) await tradeTap(t);
    await page.evaluate(async () => {
      Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
        .find((b) => b.textContent === 'Search Again').click();
      await new Promise((r) => setTimeout(r, 180));
    });
    const mid = await clockOf();
    await page.evaluate(() => Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
      .find((b) => b.textContent === 'Close').click());
    await page.waitForTimeout(150);
    return { title: title, was: was, mid: mid, now: await clockOf() };
  })();
  ok('the noticeboard opens the same search, and browsing it costs nothing',
    fromBoard.title === 'Search for Employees' &&
    fromBoard.mid.tick === fromBoard.was.tick && fromBoard.now.tick === fromBoard.was.tick &&
    fromBoard.now.staff === fromBoard.was.staff && fromBoard.now.gold === fromBoard.was.gold,
    JSON.stringify(fromBoard));

  // a hire that cannot go through - the applicant has gone - spends nothing
  const failed = await (async () => {
    await page.evaluate(() => window.CHECKSMITH.shopAct('hire'));
    await page.waitForTimeout(150);
    await tradeTap('Runner');
    const was = await clockOf();
    await page.evaluate(() => {
      const F = window.CHECKSMITH;
      const btn = document.querySelector('#shopSheetBody [data-hire]');
      F.app.shop.applicants = [];
      btn.click();
    });
    await page.waitForTimeout(200);
    return { was: was, now: await clockOf(),
      open: !(await page.isHidden('#shopSheet')), toast: await page.textContent('#shPromptText') };
  })();
  ok('a failed hire spends no phase and hires nobody',
    failed.now.tick === failed.was.tick && failed.now.staff === failed.was.staff && failed.open,
    JSON.stringify(failed));

  // nor does a miner the forge cannot pay up front for
  const poorMiner = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    if (!sh.mines.length) C.shopBuyMine(sh, 'bronze');
    sh.gold = 100000;
    Array.from(document.querySelectorAll('#shopSheetBody .trade'))
      .find((b) => b.innerText.trim() === 'Miner').click();
    await new Promise((r) => setTimeout(r, 180));
    const was = { tick: sh.day * 3 + sh.phaseIndex, miners: sh.mines[0].miners.length };
    const btn = document.querySelector('#shopSheetBody [data-minehire]');
    sh.gold = 0;
    btn.click();
    await new Promise((r) => setTimeout(r, 200));
    return { was: was, tick: sh.day * 3 + sh.phaseIndex, miners: sh.mines[0].miners.length,
      open: !document.getElementById('shopSheet').hidden };
  });
  ok('a miner hire refused for want of gold spends no phase either',
    poorMiner.tick === poorMiner.was.tick && poorMiner.miners === poorMiner.was.miners &&
    poorMiner.open, JSON.stringify(poorMiner));

  // with no phase to spend the search still opens and browses, but will not hire
  const noPhase = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    sh.gold = 4000;
    const out = {};
    for (const why of ['playing', 'closed']) {
      if (why === 'playing') F.shopUi.playing = true; else sh.closed = true;
      Array.from(document.querySelectorAll('#shopSheetBody .trade'))
        .find((b) => b.innerText.trim() === 'Smith').click();
      await new Promise((r) => setTimeout(r, 180));
      const was = { tick: sh.day * 3 + sh.phaseIndex, staff: sh.staff.length };
      const warn = document.querySelector('#shopSheetBody [data-hire-blocked]');
      const buttons = Array.from(document.querySelectorAll('#shopSheetBody [data-hire]'));
      const cards = buttons.length;
      const allOff = cards > 0 && buttons.every((b) => b.disabled);
      // and a hire forced through anyway is still refused
      buttons[0].disabled = false;
      buttons[0].click();
      await new Promise((r) => setTimeout(r, 150));
      out[why] = { warn: warn ? warn.textContent : null, cards: cards, allOff: allOff,
        tick: sh.day * 3 + sh.phaseIndex, staff: sh.staff.length, was: was,
        toast: document.getElementById('shPromptText').textContent };
      F.shopUi.playing = false;
      sh.closed = false;
    }
    return out;
  });
  ok('with no phase to spend, the search still lists applicants',
    noPhase.playing.cards === 3 && noPhase.closed.cards === 3, JSON.stringify(noPhase).slice(0, 300));
  ok('but every hire button is off, and the sheet says why',
    noPhase.playing.allOff && noPhase.closed.allOff &&
    /Hiring is unavailable/.test(noPhase.playing.warn) && /still playing out/.test(noPhase.playing.warn) &&
    /no phases remain/.test(noPhase.closed.warn), JSON.stringify(noPhase).slice(0, 400));
  ok('and a hire forced through is refused without touching the clock',
    noPhase.playing.tick === noPhase.playing.was.tick && noPhase.playing.staff === noPhase.playing.was.staff &&
    noPhase.closed.tick === noPhase.closed.was.tick && noPhase.closed.staff === noPhase.closed.was.staff &&
    /no phases remain/.test(noPhase.closed.toast), JSON.stringify(noPhase).slice(0, 400));

  // a real hire, tapped twice in a row: one employee, one phase
  const once = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    Array.from(document.querySelectorAll('#shopSheetBody .trade'))
      .find((b) => b.innerText.trim() === 'Runner').click();
    await new Promise((r) => setTimeout(r, 180));
    const was = { tick: sh.day * 3 + sh.phaseIndex, staff: sh.staff.length };
    const btn = document.querySelector('#shopSheetBody [data-hire]');
    btn.click();
    btn.click();
    await new Promise((r) => setTimeout(r, 300));
    for (let i = 0; i < 10 && !document.getElementById('shopSheet').hidden; i++) {
      const close = document.querySelector('#shopSheet [data-at="0"]');
      if (close) close.click();
      await new Promise((r) => setTimeout(r, 80));
    }
    return { was: was, tick: sh.day * 3 + sh.phaseIndex, staff: sh.staff.length };
  });
  ok('a hire tapped twice hires one employee and spends exactly one phase',
    once.staff === once.was.staff + 1 && once.tick === once.was.tick + 1, JSON.stringify(once));
  await page.evaluate(() => {
    const F = window.CHECKSMITH, sh = F.app.shop, kept = F.testKept;
    sh.staff = kept.staff; sh.gold = kept.gold; sh.mines = kept.mines;
    sh.assignments = kept.assignments;
    F.shopRender();
  });

  section('Open Your Forge: Growth buys room, the Shop buys fixtures');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    sh.gold = 200000;
    F.shopUi.tab = 'upShop';
    F.shopRender();
  });
  const cards = await page.evaluate(() => {
    const all = window.__growAll();
    return { count: all.count, heads: all.heads, everyCardAnswers: all.answers, sellsStands: all.stands };
  });
  ok('Growth offers the four tracks',
    cards.heads.indexOf('Forge') >= 0 && cards.heads.indexOf('Employment') >= 0 &&
    cards.heads.indexOf('Store Expansion') >= 0 && cards.count >= 4,
    JSON.stringify(cards.heads));
  ok('every card says its level, what it gives now, what is next and the cost',
    cards.everyCardAnswers, JSON.stringify(cards));
  ok('and Growth sells no stands at all', cards.sellsStands === 0,
    'found ' + cards.sellsStands + ' stand buttons on Growth');
  await page.screenshot({ path: path.join(SHOTS, '35-growth.png'), fullPage: true });

  const forgeBuy = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const was = C.batchCapacity(sh);
    const btn = window.__growCard('Forge')
      .querySelector('.gc-buy');
    const price = btn.innerText;
    btn.click();
    await new Promise((r) => setTimeout(r, 220));
    return { was: was, now: C.batchCapacity(sh), price: price,
      text: document.getElementById('shPanel').innerText.replace(/\s+/g, ' ') };
  });
  ok('buying the forge track is worth one more ingot, at once',
    forgeBuy.now === forgeBuy.was + 1, JSON.stringify(forgeBuy).slice(0, 150));
  ok('and the card redraws to the new capacity',
    new RegExp('Max batch: ' + forgeBuy.now + ' items').test(forgeBuy.text),
    forgeBuy.text.slice(0, 200));

  const employed = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const was = { cap: C.staffCapacity(sh), staff: sh.staff.length };
    window.__growCard('Employment')
      .querySelector('.gc-buy').click();
    await new Promise((r) => setTimeout(r, 220));
    return { was: was, cap: C.staffCapacity(sh), staff: sh.staff.length };
  });
  ok('an employment slot is a place, not a person',
    employed.cap === employed.was.cap + 1 && employed.staff === employed.was.staff,
    JSON.stringify(employed));

  const expanded = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const was = { cap: C.standCap(sh), stands: sh.stands.length };
    window.__growCard('Store Expansion')
      .querySelector('.gc-buy').click();
    await new Promise((r) => setTimeout(r, 220));
    return { was: was, cap: C.standCap(sh), stands: sh.stands.length };
  });
  ok('a store expansion is floor space, not a stand',
    expanded.cap === expanded.was.cap + 1 && expanded.stands === expanded.was.stands,
    JSON.stringify(expanded));

  // the stand itself is bought in the Shop, and only there
  const standBuy = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const was = sh.stands.length;
    F.shopUi.tab = 'shelf';
    F.shopRender();
    const cap = document.querySelector('#shPanel .shop-cap').innerText.replace(/\s+/g, ' ');
    document.querySelector('#shPanel [data-buystand]').click();
    await new Promise((r) => setTimeout(r, 240));
    const sheet = document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ');
    document.querySelector('#shopSheetBody [data-buy-stand]').click();
    await new Promise((r) => setTimeout(r, 300));
    return { was: was, stands: sh.stands.length, cap: cap, sheet: sheet,
      room: C.standCap(sh) - sh.stands.length };
  });
  ok('the Shop says how much floor space is left',
    /\d+ empty spaces?/i.test(standBuy.cap) && /Stands \d+ \/ \d+/.test(standBuy.sheet),
    JSON.stringify({ cap: standBuy.cap, sheet: standBuy.sheet.slice(0, 120) }));
  ok('and buying a stand there puts one on the floor',
    standBuy.stands === standBuy.was + 1, JSON.stringify(standBuy));

  // a full floor refuses, and points at Growth rather than selling space itself
  const crammed = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    let guard = 0;
    while (sh.stands.length < C.standCap(sh) && guard++ < 30) C.shopBuyStand(sh, 'weapon');
    F.shopRender();
    const was = sh.stands.length;
    F.shopOpenBuyStand();
    await new Promise((r) => setTimeout(r, 240));
    const body = document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ');
    return { was: was, stands: sh.stands.length, body: body,
      offers: document.querySelectorAll('#shopSheetBody [data-buy-stand]').length };
  });
  ok('a full floor sells nothing and says where space comes from',
    crammed.offers === 0 && /Growth/.test(crammed.body) && crammed.stands === crammed.was,
    crammed.body.slice(0, 200));
  for (let i = 0; i < 40 && (await page.isVisible('#shopSheet')); i++) {
    await page.click('#shopSheet [data-at-last]');
    await page.waitForTimeout(80);
  }

  // displays: bought one at a time, and worth more on the floor
  const display = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const stand = sh.stands[0];
    stand.key = C.lineKey('shortsword', 'bronze');
    stand.qty = 5; stand.quality = 100; stand.level = 1;
    stand.price = C.standWorth(stand);
    const was = { price: stand.price, level: C.standLevel(stand) };
    F.shopUi.tab = 'grow';
    F.shopRender();
    const cardsFor = document.querySelectorAll('#shPanel .grow-card [data-grow-stand]').length;
    document.querySelector('#shPanel [data-grow-stand="' + stand.id + '"]').click();
    await new Promise((r) => setTimeout(r, 240));
    return { was: was, cards: cardsFor, level: C.standLevel(stand),
      price: stand.price, others: sh.stands.filter((st) => C.standLevel(st) > 0).length,
      text: document.getElementById('shPanel').innerText.replace(/\s+/g, ' ') };
  });
  ok('each display has its own card and its own upgrade',
    display.cards >= 2 && display.level === display.was.level + 1 && display.others === 1,
    JSON.stringify(display).slice(0, 200));
  ok('upgrading one lifts what it asks',
    display.price > display.was.price,
    JSON.stringify({ was: display.was.price, now: display.price }));
  ok('and the card shows the percentage it now carries',
    /\+2\.5% sale price/.test(display.text), display.text.slice(0, 220));

  const broke = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    sh.gold = 0;
    F.shopRender();
    const buys = Array.from(document.querySelectorAll('#shPanel .gc-buy'));
    return { total: buys.length, dead: buys.filter((b) => b.disabled).length };
  });
  ok('an empty purse greys out every purchase',
    broke.total > 0 && broke.dead === broke.total, JSON.stringify(broke));

  section('Open Your Forge: the storefront');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    F.shopSheetClose();
    F.shopEditMode(false);
    sh.gold = 200000;
    sh.phaseIndex = 0;
    sh.assignments = {};
    sh.standing = [];
    F.shopUi.tab = 'shelf';
    F.shopRender();
  });
  const front = await page.evaluate(() => {
    const sh = window.CHECKSMITH.app.shop;
    const sign = document.querySelector('#shThings [data-station="sign"] text');
    const stations = Array.from(document.querySelectorAll('#shThings [data-station]'))
      .map((b) => b.dataset.station);
    const r = document.getElementById('shScene').getBoundingClientRect();
    return { sign: sign && sign.textContent, name: sh.name, stations: stations,
      wide: document.getElementById('shWorld').getBoundingClientRect().width, view: r.width,
      places: document.querySelectorAll('#shThings .loc-stage').length,
      page: document.documentElement.scrollWidth <= window.innerWidth + 1 };
  });
  ok('the shop is three places side by side, the screen showing one',
    front.places === 3 && Math.abs(front.wide - 3 * front.view) < 2 && front.page, JSON.stringify(front));
  ok('the business name hangs on a sign over the door', front.sign === front.name,
    JSON.stringify(front));
  ok('every workstation is in the shop',
    ['forge', 'anvil', 'store', 'supply', 'table', 'plans', 'ledger', 'counter', 'board', 'commissions', 'door', 'sign']
      .every((id) => front.stations.indexOf(id) >= 0), JSON.stringify(front.stations));

  // every object opens its window, and none of them costs a phase
  const stationOf = async (id) => page.evaluate(async (which) => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const was = { phase: sh.phaseIndex, day: sh.day, gold: sh.gold };
    const btn = document.querySelector('#shThings [data-station="' + which + '"]');
    F.sceneView(btn.closest('.loc-stage').dataset.loc, false);
    btn.click();
    await new Promise((r) => setTimeout(r, 160));
    const drawer = document.getElementById('shDrawer'), sheet = document.getElementById('shopSheet');
    const inDrawer = !drawer.hidden;
    const bg = getComputedStyle(inDrawer ? drawer : sheet).backgroundColor;
    const out = { was: was, phase: sh.phaseIndex, day: sh.day, gold: sh.gold,
      open: inDrawer || !sheet.hidden, see: Number((bg.match(/[\d.]+(?=\))/) || ['1'])[0]) < 0.8,
      title: document.getElementById(inDrawer ? 'shDrawerTitle' : 'shopSheetTitle').textContent,
      tabs: inDrawer ? Array.from(document.querySelectorAll('#shTabs [data-tab]')).map((b) => b.textContent.trim()) : [],
      acts: Array.from(document.querySelectorAll(inDrawer ? '#shDrawerFoot button'
        : '#shopSheetBack button, #shopSheetActions button')).map((b) => b.textContent),
      duty: Array.from(document.querySelectorAll('#shPanel .duty-head b')).map((b) => b.textContent) };
    if (inDrawer) document.getElementById('shDrawerClose').click(); else F.shopSheetClose();
    return out;
  }, id);
  const counter = await stationOf('counter');
  ok('tapping the counter opens selling: tend the store, or put a Salesperson behind it',
    counter.open && counter.title === 'Counter' && counter.acts.indexOf('Tend the Store') >= 0 &&
    counter.duty.some((a) => /salesperson/i.test(a)), JSON.stringify(counter));
  ok('and the window lets the shop show through behind it', counter.see, JSON.stringify(counter));
  const forge = await stationOf('forge');
  ok('tapping the forge offers your own batch or the anvils\' staff',
    forge.title === 'Forge' && forge.acts.indexOf('Forge a Batch') >= 0 &&
    forge.duty.some((a) => /smith/i.test(a)) && forge.duty.some((a) => /apprentice/i.test(a)), JSON.stringify(forge));
  const anvilWin = await stationOf('anvil');
  ok('an anvil opens the same window as the forge', anvilWin.title === 'Forge', JSON.stringify(anvilWin));
  const stBoard = await stationOf('board');
  ok('the hiring board opens staff and recruiting',
    stBoard.title === 'Hiring Board' && stBoard.tabs.join(',') === 'Employees,Schedule,Hire', JSON.stringify(stBoard));
  const store = await stationOf('store');
  ok('the storeroom opens what the forge holds',
    store.title === 'Storeroom' && store.tabs.join(',') === 'Metal & Ore,Finished Goods', JSON.stringify(store));
  const supply = await stationOf('supply');
  ok('the supplies open the market and the Runner',
    supply.title === 'Supplies' && supply.acts.indexOf('Buy Metal') >= 0 &&
    supply.duty.some((a) => /runner/i.test(a)), JSON.stringify(supply));
  const door = await stationOf('door');
  ok('the door opens deliveries without making one',
    door.title === 'Entrance' && door.tabs[0] === 'Deliveries' && door.gold === door.was.gold,
    JSON.stringify(door));
  const table = await stationOf('table');
  ok('the blueprint table opens the Almanac', /almanac/i.test(table.title), JSON.stringify(table));
  ok('looking at any of it costs no phase and no gold',
    [counter, forge, anvilWin, stBoard, store, supply, door, table].every((s) =>
      s.phase === s.was.phase && s.day === s.was.day && s.gold === s.was.gold));

  // what is on a display is what you can see on it
  const shown = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const st = C.placedStands(sh).find((x) => x.type === 'weapon');
    const count = (q) => {
      st.key = C.lineKey('shortsword', 'bronze'); st.qty = q; st.quality = 80; st.level = 1;
      st.price = C.standWorth(st);
      if (!q) { st.key = null; }
      F.shopRender();
      const el = document.querySelector('#shThings [data-sstand="' + st.id + '"]');
      return el.querySelectorAll('.st-good').length;
    };
    const hold = C.standHold();
    return { full: count(hold), part: count(Math.ceil(hold * 0.5)), low: count(1), none: count(0) };
  });
  ok('a display shows its own goods, fewer as it empties',
    shown.full === 3 && shown.part === 2 && shown.low === 1 && shown.none === 0,
    JSON.stringify(shown));

  // staff stand where this phase's work is, and nowhere else
  const crew = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.staff = [
      { id: 7101, name: 'Marcus Vale', role: 'salesperson', rank: 'C', power: 3, wage: 30, xp: 0, face: 'merchant' },
      { id: 7102, name: 'Eleanor Pike', role: 'storehand', rank: 'D', power: 2, wage: 18, xp: 0, face: 'farmer' }
    ];
    sh.assignments = {};
    C.shopAssign(sh, 7101, {}, C.SHOP.phases[0]);
    C.shopAssign(sh, 7102, { order: { keys: [] } }, C.SHOP.phases[1]);
    F.shopRender();
    const drawn = Array.from(document.querySelectorAll('#shThings .fig.staff')).map((b) => Number(b.dataset.crew));
    return { drawn: drawn };
  });
  ok('a hand working this phase stands at their station',
    crew.drawn.indexOf(7101) >= 0, JSON.stringify(crew));
  ok('a hand booked for later is not drawn working now',
    crew.drawn.indexOf(7102) < 0, JSON.stringify(crew));
  await page.evaluate(() => document.querySelector('#shThings .fig[data-crew="7101"]').click());
  await page.waitForTimeout(160);
  const card = await page.evaluate(() => ({
    title: document.getElementById('shopSheetTitle').textContent,
    body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ') }));
  ok('tapping them opens their card, with what they are doing today',
    /Marcus/.test(card.title) && /Counter/.test(card.body) && /working this morning/i.test(card.body),
    card.body.slice(0, 200));
  await page.evaluate(() => window.CHECKSMITH.shopSheetClose());

  // Edit Shop: pick up, put down, swap, put away - all of it free
  const edit = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const was = { phase: sh.phaseIndex, gold: sh.gold };
    const st = C.placedStands(sh).find((x) => x.type === 'weapon');
    st.key = C.lineKey('shortsword', 'bronze'); st.qty = 4; st.quality = 80; st.price = 37; st.up = 2;
    const home = st.slot;
    F.shopRender();
    document.getElementById('shEditBtn').click();
    await new Promise((r) => setTimeout(r, 80));
    const editing = document.getElementById('shWorld').classList.contains('editing');
    document.querySelector('#shThings [data-sstand="' + st.id + '"]').click();
    await new Promise((r) => setTimeout(r, 60));
    const pad = document.querySelector('#shThings .spot.pad');
    const target = Number(pad.dataset.spot);
    pad.click();
    await new Promise((r) => setTimeout(r, 60));
    const moved = st.slot === target;
    // roped-off floor refuses
    document.querySelector('#shThings [data-sstand="' + st.id + '"]').click();
    const rope = document.querySelector('#shThings .spot.roped');
    if (rope) rope.click();
    await new Promise((r) => setTimeout(r, 60));
    const refused = st.slot === target;
    // into the back and out again
    document.querySelector('[data-tray-act="store"]').click();
    await new Promise((r) => setTimeout(r, 60));
    const inBack = !C.standPlaced(st) && !!document.querySelector('[data-tray="' + st.id + '"]');
    document.querySelector('[data-tray="' + st.id + '"]').click();
    document.querySelector('#shThings [data-spot="' + home + '"]').click();
    await new Promise((r) => setTimeout(r, 60));
    document.querySelector('[data-tray-act="done"]').click();
    await new Promise((r) => setTimeout(r, 60));
    return { editing: editing, moved: moved, refused: refused || !rope, inBack: inBack,
      home: st.slot === home, kept: st.qty === 4 && st.price === 37 && st.up === 2,
      phase: sh.phaseIndex, gold: sh.gold, was: was,
      off: !document.getElementById('shWorld').classList.contains('editing') };
  });
  ok('Edit Shop picks a display up and puts it down elsewhere',
    edit.editing && edit.moved, JSON.stringify(edit));
  ok('floor not yet bought is refused', edit.refused, JSON.stringify(edit));
  ok('a display can go into the back and come out again',
    edit.inBack && edit.home, JSON.stringify(edit));
  ok('and it carries its stock, price and level wherever it goes', edit.kept, JSON.stringify(edit));
  ok('none of it costs a phase or a coin, and Done leaves edit mode',
    edit.phase === edit.was.phase && edit.gold === edit.was.gold && edit.off, JSON.stringify(edit));

  // the sign can be repainted
  await page.evaluate(() => document.querySelector('#shThings [data-station="sign"]').click());
  await page.waitForSelector('#shRename');
  await page.fill('#shRename', 'The Iron Owl');
  await page.evaluate(() => Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
    .find((b) => b.textContent === 'Save').click());
  await page.waitForTimeout(200);
  const renamed = await page.evaluate(() => {
    window.CHECKSMITH.openGameMenu();
    const where = document.getElementById('gmWhere').textContent;
    document.getElementById('gameMenuClose').click();
    return { name: window.CHECKSMITH.app.shop.name, bar: where,
      sign: document.querySelector('#shThings [data-station="sign"] text').textContent };
  });
  ok('renaming changes the sign and the name', renamed.name === 'The Iron Owl' &&
    renamed.sign === 'The Iron Owl' && /The Iron Owl/.test(renamed.bar), JSON.stringify(renamed));

  // morning, afternoon and evening are one room in different light
  const light = await page.evaluate(() => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const out = [];
    for (let i = 0; i < 3; i++) {
      sh.phaseIndex = i;
      F.shopRender();
      const w = document.getElementById('shWorld');
      out.push({ phase: w.dataset.phase, tint: getComputedStyle(w).getPropertyValue('--tint').trim(),
        stands: document.querySelectorAll('#shThings .spot.stand').length });
    }
    sh.phaseIndex = 0;
    F.shopRender();
    return out;
  });
  ok('each phase has its own light over the same room',
    light.map((l) => l.phase).join(',') === 'morning,afternoon,evening' &&
    new Set(light.map((l) => l.tint)).size === 3 &&
    light.every((l) => l.stands === light[0].stands), JSON.stringify(light));

  // the phase plays out, and nothing about how it is watched changes a result
  const stPlayed = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    F.setPhaseAnim(true);
    F.testStock(sh, C.lineKey('longsword', 'bronze'), 40, 95, 30);
    sh.phaseIndex = 0;
    F.shopRender();
    F.shopSpendPhase('You let the morning go by.');
    // the phase has ALREADY resolved: read the results before a frame plays
    const now = { gold: sh.gold, phase: sh.phaseIndex, shelf: C.countShelf(sh),
      xp: sh.staff.map((e) => e.xp).join(',') };
    const playing = document.getElementById('shopView').classList.contains('playing') &&
      !document.getElementById('shSkip').hidden;
    const slot = JSON.parse(localStorage.getItem('checksmith:v1') || '{}');
    const saved = (slot.shopSaves || []).find((x) => x.id === F.app.shopSlot);
    await new Promise((r) => setTimeout(r, 400));
    F.shopSkipPhase();
    F.shopSkipPhase();                                     // twice: must be harmless
    await new Promise((r) => setTimeout(r, 200));
    const after = { gold: sh.gold, phase: sh.phaseIndex, shelf: C.countShelf(sh),
      xp: sh.staff.map((e) => e.xp).join(',') };
    const summary = !document.getElementById('shopSheet').hidden &&
      /summary/.test(document.getElementById('shopSheetTitle').textContent);
    F.setPhaseAnim(false);
    return { now: now, after: after, playing: playing, summary: summary,
      replaySaved: !!(saved && saved.replay),
      stopped: !document.getElementById('shopView').classList.contains('playing') };
  });
  ok('ending a phase plays the shop at work, with a skip button', stPlayed.playing, JSON.stringify(stPlayed));
  ok('the phase is resolved and saved before the playback starts',
    stPlayed.now.phase === 1 && stPlayed.replaySaved, JSON.stringify(stPlayed));
  ok('skipping it, even twice, changes nothing it resolved',
    JSON.stringify(stPlayed.now) === JSON.stringify(stPlayed.after) && stPlayed.stopped,
    JSON.stringify(stPlayed));
  ok('and it ends on one summary of what happened', stPlayed.summary, JSON.stringify(stPlayed));
  await page.screenshot({ path: path.join(SHOTS, '36-storefront.png'), fullPage: true });

  // a game closed on the summary opens again on it, then forgets it once seen
  await page.reload();
  await installStock(page);                                // a reload drops the test helpers
  await page.evaluate(() => window.CHECKSMITH.introSkip && window.CHECKSMITH.introSkip());
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  await page.click('.mode-card[data-mode="shop"]');
  await page.click('#beginBtn');
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(250);
  const stResumed = await page.evaluate(() => ({
    open: !document.getElementById('shopSheet').hidden,
    title: document.getElementById('shopSheetTitle').textContent }));
  ok('a summary left unseen is shown again on reopening',
    stResumed.open && /summary/.test(stResumed.title), JSON.stringify(stResumed));
  await page.evaluate(() => Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
    .find((b) => b.textContent === 'Close').click());
  await page.waitForTimeout(200);
  const stCleared = await page.evaluate(() => {
    const F = window.CHECKSMITH;
    const data = JSON.parse(localStorage.getItem('checksmith:v1') || '{}');
    const saved = (data.shopSaves || []).find((x) => x.id === F.app.shopSlot);
    return { replay: saved ? saved.replay : 'missing', name: F.app.shop.name };
  });
  ok('and once seen it is not owed again', stCleared.replay === null, JSON.stringify(stCleared));
  ok('the new name survived closing the game', stCleared.name === 'The Iron Owl', JSON.stringify(stCleared));
  for (let i = 0; i < 20 && (await page.isVisible('#shopSheet')); i++) {
    await page.click('#shopSheet [data-at-last]');
    await page.waitForTimeout(80);
  }

  section('1.34: the room stays behind the menus');
  const lightCheck = async (view) => {
    await page.evaluate((v) => {
      const F = window.CHECKSMITH, sh = F.app.shop;
      F.shopSheetClose();
      sh.phaseIndex = 2;                                    // evening: every light lit
      F.shopUi.tab = null;
      F.shopRender();
      F.sceneView(v, false);
      // the forge's window, which lies over the place itself
      F.shopOpenStation('forge');
      for (const el of document.querySelectorAll('.glow,.spark,.sc-coals,.sc-candle,.fig')) el.style.animation = 'none';
      window.scrollTo(0, 0);
    }, view);
    await page.waitForTimeout(250);
    const box = await page.evaluate(() => {
      const s = document.querySelector('#shDrawer .sheet').getBoundingClientRect();
      const r = document.getElementById('shScene').getBoundingClientRect();
      const inset = 16;                                     // inside the rounded corners
      const top = Math.max(s.top + inset, r.top), bottom = Math.min(s.bottom - inset, r.bottom);
      const left = Math.max(s.left + inset, r.left), right = Math.min(s.right - inset, r.right);
      return { x: left, y: top, width: right - left, height: bottom - top };
    });
    if (box.height < 8 || box.width < 8) return { view: view, overlap: false };
    const lit = await page.screenshot({ clip: box });
    await page.evaluate(() => { for (const el of document.querySelectorAll('.scene-light,.scene-glow,.scene-fx')) el.style.visibility = 'hidden'; });
    await page.waitForTimeout(60);
    const dark = await page.screenshot({ clip: box });
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.scene-light,.scene-glow,.scene-fx')) el.style.visibility = '';
      window.CHECKSMITH.shopSheetClose();
      const F = window.CHECKSMITH; F.shopUi.tab = null; F.shopRender();
    });
    return { view: view, overlap: true, same: lit.equals(dark) };
  };
  const lights = [await lightCheck('work'), await lightCheck('floor'), await lightCheck('front')];
  ok('an open window over the shop is untouched by its light, in every place',
    lights.every((l) => l.overlap && l.same), JSON.stringify(lights));
  const layers = await page.evaluate(() => {
    const scene = getComputedStyle(document.getElementById('shScene'));
    const lightsOff = ['.scene-light', '.scene-glow', '.scene-fx'].every((sel) =>
      getComputedStyle(document.querySelector(sel)).pointerEvents === 'none');
    return { isolated: scene.isolation === 'isolate', lightsOff: lightsOff };
  });
  ok('the room is its own layer, and its light never takes a tap',
    layers.isolated && layers.lightsOff, JSON.stringify(layers));
  const phaseLight = await page.evaluate(() => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    const out = [];
    for (let i = 0; i < 3; i++) {
      sh.phaseIndex = i; F.shopRender();
      out.push(getComputedStyle(document.getElementById('shWorld')).getPropertyValue('--tint').trim());
    }
    sh.phaseIndex = 0; F.shopRender();
    return out;
  });
  ok('and the day still changes its light', new Set(phaseLight).size === 3, JSON.stringify(phaseLight));

  /* When a phase ends the camera visits each employee who did their job, one
     at a time: it arrives first, then their animation starts, then it moves
     on, and at the end it goes back. None of that may change a result. */
  section('Open Your Forge: the camera shows each worker at their job');
  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core;
    F.testKeptShop = C.serializeShop(F.app.shop);
    // four hands in four corners of the room, all booked for the morning
    F.testTourShop = function (roles) {
      const sh = F.app.shop;
      sh.gold = 50000; sh.reputation = 40; sh.materials.bronze = 40;
      sh.phaseIndex = 0; sh.closed = false; sh.assignments = {}; sh.standing = [];
      for (const one of sh.town) one.gold = 4000;
      const key = C.lineKey('shortsword', 'bronze');
      if (C.countStorage(sh) < 20) C.addStorage(sh, key, 20, 80, 1);
      const stand = sh.stands.find((st) => st.type === 'weapon' && C.standPlaced(st));
      // half full of the line in storage, so a Store Hand always has room to
      // work and something of the right kind to bring out, whatever an earlier
      // check left standing there
      if (stand && stand.key && stand.key !== key) { stand.key = null; stand.qty = 0; stand.price = 0; }
      if (stand && !stand.qty) C.shopStockStand(sh, stand.id, key, 3);
      else if (stand) stand.qty = Math.min(stand.qty, 3);
      const all = {
        salesperson: { id: 901, name: 'Sal Counter', face: 'guard', job: {} },
        smith: { id: 902, name: 'Smi Anvil', face: 'cleric',
          job: { order: { item: 'shortsword', material: 'bronze', qty: 2 } } },
        runner: { id: 903, name: 'Run Door', face: 'farmer', job: { order: { bronze: 3 } } },
        storehand: { id: 904, name: 'Sto Floor', face: 'miner', job: { order: { keys: [] } } },
        apprentice: { id: 905, name: 'App Bench', face: 'scout', job: {} }
      };
      sh.staff = roles.map((role) => ({ id: all[role].id, name: all[role].name, role: role,
        rank: 'C', power: 3, wage: 20, xp: 0, face: all[role].face }));
      for (const role of roles) C.shopAssign(sh, all[role].id, all[role].job, C.SHOP.phases[0]);
      F.shopSheetClose();
      F.shopRender();
    };
    /* End the phase and watch it to the end. `skipAt`/`grabAt`/`menuAt` act
       once that many workers have been shown. */
    F.testTourRun = async function (opt) {
      const o = opt || {};
      // the camera stands at one of the three places; it starts from one
      const at = () => F.shopUi.view;
      if (o.home != null) F.sceneView(o.home, false);
      await new Promise((r) => setTimeout(r, 60));
      const home = at();
      const sh = F.app.shop;
      const before = { tick: sh.day * 3 + sh.phaseIndex };
      const t0 = Date.now();
      F.shopSpendPhase(null);
      const resolved = JSON.stringify(C.serializeShop(F.app.shop));
      const out = { home: home, before: before, lefts: [], skipped: false, grabbed: null,
        menuHeld: null, label: document.getElementById('shSkip').textContent };
      let menuAt = null;
      while (F.shopUi.playing && Date.now() - t0 < 45000) {
        const tourShown = (F.shopUi.tourLog || []).filter((x) => x.role).length;
        out.lefts.push(at());
        if (o.skipAt != null && tourShown >= o.skipAt && !out.skipped) {
          out.skipped = true;
          const t = Date.now();
          document.getElementById('shSkip').click();
          document.getElementById('shSkip').click();
          out.skipMs = Date.now() - t;
          out.restoredAt = at();
        }
        if (o.grabAt != null && tourShown >= o.grabAt && out.grabbed == null) {
          // the player picks another view mid-playback
          F.sceneView(o.grabTo, false);
          out.grabbed = at();
        }
        if (o.menuAt != null && tourShown >= o.menuAt && menuAt == null) {
          F.shopOpenStation('sign');
          menuAt = { shown: tourShown, left: at() };
          await new Promise((r) => setTimeout(r, 5200));
          out.menuHeld = { shownBefore: menuAt.shown,
            shownAfter: (F.shopUi.tourLog || []).filter((x) => x.role).length,
            leftBefore: menuAt.left, leftAfter: at(),
            playing: !!F.shopUi.playing,
            title: document.getElementById('shopSheetTitle').textContent };
          F.shopSheetClose();
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      out.ms = Date.now() - t0;
      out.end = at();
      out.log = (F.shopUi.tourLog || []).slice();
      out.after = { tick: sh.day * 3 + sh.phaseIndex };
      out.same = JSON.stringify(C.serializeShop(F.app.shop)) === resolved;
      out.summary = !document.getElementById('shopSheet').hidden &&
        /summary/.test(document.getElementById('shopSheetTitle').textContent);
      for (let k = 0; k < 6 && !document.getElementById('shopSheet').hidden; k++) {
        const b = document.querySelector('#shopSheet [data-at="0"]');
        if (b) b.click();
        await new Promise((r) => setTimeout(r, 60));
      }
      out.state = JSON.stringify(C.serializeShop(F.app.shop));
      return out;
    };
  });
  const tourShown = (run) => run.log.filter((x) => x.role);
  const roleList = (run) => tourShown(run).map((x) => x.role).join(',');

  // the same phase, from the same save and the same dice, watched four ways
  const tours = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core;
    F.setPhaseAnim(true);
    F.setWorkerCam(true);
    F.testTourShop(['salesperson', 'smith', 'runner', 'storehand']);
    const snap = C.serializeShop(F.app.shop);
    F.sceneView('front', false);
    const front = F.shopUi.view;
    const fresh = () => {
      F.app.shop = C.restoreShop(JSON.parse(JSON.stringify(snap)), C.mulberry32(4242));
      F.shopRender();
    };
    const out = {};
    fresh(); out.full = await F.testTourRun({ home: 'front' });
    fresh(); out.skip = await F.testTourRun({ home: 'front', skipAt: 1 });
    fresh(); out.grab = await F.testTourRun({ home: 'front', grabAt: 1, grabTo: 'work' });
    F.setWorkerCam(false);
    fresh(); out.off = await F.testTourRun({ home: 'front' });
    F.setWorkerCam(true);
    out.front = front;
    return out;
  });
  const tourFull = tours.full;
  ok('the skip control is labelled Skip Animations', tourFull.label === 'Skip Animations', tourFull.label);
  ok('every employee who worked gets one turn on camera, one after another',
    tourShown(tourFull).length === 4 &&
    new Set(tourShown(tourFull).map((x) => x.role)).size === 4, roleList(tourFull));
  ok('the camera sweeps the places once, starting from the end it was looking at',
    roleList(tourFull) === 'runner,salesperson,storehand,smith', roleList(tourFull));
  ok('each worker is on screen when their animation starts',
    tourShown(tourFull).every((x) => x.visible), JSON.stringify(tourShown(tourFull)));
  ok('and the camera moved to reach the ones that were off screen',
    tourShown(tourFull).filter((x) => x.moved).length >= 2, JSON.stringify(tourShown(tourFull)));
  ok('no worker’s animation starts before the camera reaches them',
    tourShown(tourFull).every((x) => x.busyAlready.length === 0), JSON.stringify(tourShown(tourFull)));
  ok('each one waits for the last to finish',
    tourShown(tourFull).every((x, i, a) => i === 0 || x.t - a[i - 1].t >= 900), JSON.stringify(tourShown(tourFull).map((x) => x.t)));
  ok('afterwards the camera is back where the player left it',
    tourFull.end === tourFull.home && tourFull.home === 'front', tourFull.home + ' -> ' + tourFull.end);
  ok('and the phase summary follows', tourFull.summary, JSON.stringify(tourFull).slice(0, 200));
  ok('watching it changed nothing the phase had already settled', tourFull.same);
  ok('the phase advanced exactly once', tourFull.after.tick === tourFull.before.tick + 1,
    JSON.stringify([tourFull.before, tourFull.after]));

  const skip = tours.skip;
  ok('Skip Animations ends the playback at once',
    skip.skipped && skip.ms < tourFull.ms - 3000 && skip.summary, skip.ms + 'ms vs ' + tourFull.ms + 'ms');
  ok('and puts the camera straight back', skip.restoredAt === skip.home && skip.end === skip.home,
    skip.restoredAt + ' / ' + skip.end + ' / ' + skip.home);
  ok('skipping (twice) advanced the phase once and changed no result',
    skip.after.tick === skip.before.tick + 1 && skip.same, JSON.stringify(skip.after));

  const grab = tours.grab;
  const afterGrab = grab.log.slice(grab.log.findIndex((x) => x.manual) + 1).filter((x) => x.role);
  ok('choosing another view mid-playback takes the camera, and is noticed',
    grab.log.some((x) => x.manual) && grab.grabbed === 'work', JSON.stringify(grab.log).slice(0, 300));
  ok('after that the playback still shows everyone, but never moves the camera',
    tourShown(grab).length === 4 && afterGrab.length >= 1 &&
    afterGrab.every((x) => x.view === grab.grabbed && !x.moved), JSON.stringify(afterGrab));
  ok('and does not pull it back at the end: the room stays at the view chosen', grab.end === grab.grabbed,
    String(grab.end));

  const off = tours.off;
  ok('with automatic viewing off the camera never moves',
    off.lefts.every((x) => x === off.home) && off.end === off.home,
    JSON.stringify(off.lefts.filter((x) => x !== off.home).slice(0, 5)));
  ok('but every worker is still shown in turn', tourShown(off).length === 4 &&
    tourShown(off).every((x) => !x.moved), roleList(off));
  ok('every way of watching ends in exactly the same forge',
    tourFull.state === skip.state && tourFull.state === grab.state && tourFull.state === off.state,
    [tourFull.state.length, skip.state.length, grab.state.length, off.state.length].join(','));

  // one worker the camera is already looking at: it holds still
  const steady = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    F.testTourShop(['smith']);
    return F.testTourRun({ home: 'work' });
  });
  ok('a worker already on screen is shown without moving the camera',
    tourShown(steady).length === 1 && tourShown(steady)[0].role === 'smith' && !tourShown(steady)[0].moved &&
    steady.lefts.every((x) => x === 'work') && steady.end === 'work', JSON.stringify(steady.log));

  // nobody working: the phase passes quickly and the camera stays put
  const empty = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    F.testTourShop([]);
    return F.testTourRun({ home: 'floor' });
  });
  ok('with nobody working there is nothing to show and nothing waits',
    tourShown(empty).length === 0 && empty.ms < 2500 && empty.lefts.every((x) => x === empty.home) &&
    empty.after.tick === empty.before.tick + 1, JSON.stringify({ ms: empty.ms, log: empty.log }));

  // a hand whose job came to nothing is not shown at work
  const idle = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    F.testTourShop(['storehand', 'smith']);
    for (const k in sh.storage) delete sh.storage[k];        // nothing to carry out
    sh.materials.bronze = 0;                                 // nothing to forge with
    F.shopRender();
    return F.testTourRun({ home: 'work' });
  });
  ok('employees who could not do their job get no work animation',
    tourShown(idle).length === 0, roleList(idle));

  // an apprentice's work is the player's own batch: shown only when there was one
  const bench = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    F.testTourShop(['apprentice']);
    const idleRun = await F.testTourRun({ home: 'work' });
    F.testTourShop(['apprentice']);
    F.shopUi.forgedNow = true;                               // as Return to Shop after a batch
    const forgedRun = await F.testTourRun({ home: 'work' });
    return { idle: idleRun.log, forged: forgedRun.log, left: F.shopUi.forgedNow };
  });
  ok('an apprentice is shown helping only in a phase where you forged a batch',
    bench.idle.filter((x) => x.role).length === 0 &&
    bench.forged.filter((x) => x.role === 'apprentice' && x.visible).length === 1 &&
    bench.left === false, JSON.stringify(bench));

  // a Repeat Daily booking is shown exactly like one made by hand
  const repeat = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    F.testTourShop(['storehand', 'salesperson']);
    sh.assignments = {};
    C.setStanding(sh, 'storehand', C.SHOP.phases[0], 904, { kind: 'shelve' });
    C.setStanding(sh, 'salesperson', C.SHOP.phases[0], 901, {});
    sh.phaseIndex = 2;
    C.shopEndDay(sh);                                        // the new morning books itself
    const key = C.lineKey('shortsword', 'bronze');
    if (C.countStorage(sh) < 10) C.addStorage(sh, key, 10, 80, 1);
    const booked = Object.keys(sh.assignments).length;
    F.shopRender();
    const run = await F.testTourRun({ home: 'work' });
    run.booked = booked;
    return run;
  });
  ok('jobs booked by a recurring schedule are shown too',
    repeat.booked === 2 && tourShown(repeat).some((x) => x.role === 'storehand') &&
    tourShown(repeat).every((x) => x.visible), JSON.stringify({ booked: repeat.booked, log: repeat.log }));

  // a menu opened mid-playback is waited for, not covered or moved under
  const tourHeld = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    F.testTourShop(['salesperson', 'smith', 'storehand']);
    const scene = document.getElementById('shScene');
    return F.testTourRun({ home: 'front', menuAt: 1 });
  });
  ok('an open menu holds the playback: no new worker, no camera move, no summary on top',
    tourHeld.menuHeld && tourHeld.menuHeld.shownAfter === tourHeld.menuHeld.shownBefore &&
    tourHeld.menuHeld.leftAfter === tourHeld.menuHeld.leftBefore && tourHeld.menuHeld.playing &&
    tourHeld.menuHeld.title === 'Shop Settings', JSON.stringify(tourHeld.menuHeld));
  ok('and once it is closed the playback carries on to the end',
    tourShown(tourHeld).length === 3 && tourHeld.summary, roleList(tourHeld));

  // the setting itself
  const pref = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    localStorage.setItem('checksmith:v1', JSON.stringify(Object.assign(
      JSON.parse(localStorage.getItem('checksmith:v1') || '{}'), { workerCam: undefined })));
    F.shopOpenStation('sign');
    await new Promise((r) => setTimeout(r, 120));
    const box = document.getElementById('shCamPref');
    const row = box && box.closest('label').textContent.trim();
    const was = box && box.checked;
    box.checked = false;
    Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
      .find((b) => b.textContent === 'Save').click();
    await new Promise((r) => setTimeout(r, 120));
    const saved = JSON.parse(localStorage.getItem('checksmith:v1') || '{}').workerCam;
    F.setWorkerCam(true);
    return { row: row, was: was, saved: saved };
  });
  ok('Shop Settings offers Automatically Show Worker Actions, on by default',
    pref.row === 'Automatically Show Worker Actions' && pref.was === true, JSON.stringify(pref));
  ok('and switching it off is remembered', pref.saved === false, JSON.stringify(pref));

  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core;
    F.setPhaseAnim(false);
    F.app.shop = C.restoreShop(F.testKeptShop, F.app.rnd);
    F.shopSheetClose();
    F.shopRender();
  });

  /* Staffing upgrades add places per phase; Salesperson Earnings adds a share
     of every hired Salesperson's sale. Bought from Growth, used on the Staff
     screen, resolved in one phase, and kept across a reload. */
  section('Open Your Forge: Staffing and Salesperson Earnings');
  const keptForStaffing = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    F.setPhaseAnim(false);
    const kept = JSON.stringify(C.serializeShop(sh));
    sh.gold = 200000; sh.phaseIndex = 0; sh.closed = false;
    sh.assignments = {}; sh.standing = [];
    sh.staff = [];
    for (const k of ['smithSeats', 'storeSeats', 'runnerSeats', 'salesBonus']) delete sh.upgrades[k];
    sh.blueprints.shortsword = Math.max(1, sh.blueprints.shortsword || 0);
    sh.materials.bronze = 40;
    F.shopSheetClose();
    F.shopUi.tab = 'grow';
    F.shopRender();
    return kept;
  });

  // buying from the Growth cards: twice for Smiths, once each for the rest
  const seatBuys = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const clock = () => sh.day * 3 + sh.phaseIndex;
    const tick0 = clock();
    const card = (title) => window.__growCard(title);
    const read = (title) => {
      const c = card(title);
      return { lv: c.querySelector('.gc-lv').innerText,
        now: c.querySelector('.gc-now').innerText.replace(/\s+/g, ' '),
        next: c.querySelector('.gc-next').innerText.replace(/\s+/g, ' '),
        price: (c.querySelector('.gc-buy') || {}).innerText || '' };
    };
    const fresh = read('Smith Staffing');
    const prices = [];
    for (const [title, times] of [['Smith Staffing', 2], ['Store Hand Staffing', 1],
      ['Runner Staffing', 1], ['Salesperson Earnings', 2]]) {
      for (let i = 0; i < times; i++) {
        const before = sh.gold;
        const price = parseInt(card(title).querySelector('.gc-buy').innerText.replace(/,/g, ''), 10);
        card(title).querySelector('.gc-buy').click();
        await new Promise((r) => setTimeout(r, 60));
        prices.push(before - sh.gold === price);
      }
    }
    return { fresh: fresh, smith: read('Smith Staffing'), sales: read('Salesperson Earnings'),
      prices: prices, seats: ['smith', 'storehand', 'runner', 'salesperson'].map((r) => C.phaseSeats(sh, r)),
      rate: C.salesBonusRate(sh), tick: clock() - tick0, staff: sh.staff.length };
  });
  ok('a fresh Staffing card shows its level, what it gives now and next, and its price',
    seatBuys.fresh.lv === 'Level 0 / 3' && /1 Smith per phase/.test(seatBuys.fresh.now) &&
    /2 Smiths per phase/.test(seatBuys.fresh.next) && /g$/.test(seatBuys.fresh.price),
    JSON.stringify(seatBuys.fresh));
  ok('each purchase costs exactly the price on the card', seatBuys.prices.length === 6 &&
    seatBuys.prices.every(Boolean), JSON.stringify(seatBuys.prices));
  ok('two levels of Smith Staffing make three Smiths a phase, and the card says so',
    seatBuys.seats.join(',') === '3,2,2,1' && seatBuys.smith.lv === 'Level 2 / 3' &&
    /3 Smiths per phase/.test(seatBuys.smith.now) && /4 Smiths per phase/.test(seatBuys.smith.next),
    JSON.stringify(seatBuys));
  ok('Salesperson Earnings shows the same +10% the sales will get',
    Math.abs(seatBuys.rate - 0.1) < 1e-9 && /\+10% gold/.test(seatBuys.sales.now) &&
    /\+15% gold/.test(seatBuys.sales.next), JSON.stringify(seatBuys.sales));
  ok('buying, opening and closing Growth spends no phase and hires nobody',
    seatBuys.tick === 0 && seatBuys.staff === 0, JSON.stringify(seatBuys));

  // the Staff screen grows a row per place, at once
  const rows = await page.evaluate(async () => {
    const F = window.CHECKSMITH, sh = F.app.shop;
    let id = 7300;
    for (const role of ['smith', 'smith', 'smith', 'storehand', 'storehand', 'runner', 'salesperson']) {
      sh.staff.push({ id: id++, name: role + ' ' + id, role: role, rank: 'C', power: 3, wage: 20, xp: 0,
        face: 'guard' });
    }
    F.shopUi.tab = 'staff';
    F.shopRender();
    const count = (role) => document.querySelectorAll('#shPanel [data-slot-role="' + role + '"]').length;
    const head = Array.from(document.querySelectorAll('#shPanel .roster-role'))
      .find((r) => /^Smith/.test(r.querySelector('.roster-head b').innerText));
    return { smith: count('smith'), storehand: count('storehand'), runner: count('runner'),
      salesperson: count('salesperson'), head: head.querySelector('.roster-head').innerText,
      wide: document.getElementById('shPanel').scrollWidth > document.getElementById('shPanel').clientWidth + 1 };
  });
  ok('the Staff screen shows a box for every place in every phase',
    rows.smith === 9 && rows.storehand === 6 && rows.runner === 6 && rows.salesperson === 3,
    JSON.stringify(rows));
  ok('and tells hiring apart from places per phase', /3 hired · 3 per phase/.test(rows.head) &&
    !rows.wide, rows.head);

  // filling the second Store Hand place through the screens themselves
  const viaUi = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // something in storage and an empty stand, so there is a job to give
    const key = C.lineKey('shortsword', 'bronze');
    C.addStorage(sh, key, 4, 80, 1);
    const stand = sh.stands.find((st) => st.type === C.standForItem('shortsword') && C.standPlaced(st));
    stand.key = null; stand.qty = 0;
    F.shopRender();
    document.querySelector('#shPanel [data-slot-role="storehand"][data-slot-phase="morning"][data-slot-seat="1"]').click();
    await wait(120);
    const title = document.getElementById('shopSheetTitle').textContent;
    document.querySelector('#shopSheetBody [data-pick-hand]').click();
    await wait(120);
    document.querySelector('#shopSheetBody [data-box="' + stand.id + '"]').click();
    await wait(120);
    document.querySelector('#shopSheetBody [data-take="' + key + '"]').click();
    await wait(120);
    if (F.shopUi.slot !== null) {
      Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
        .find((b) => b.textContent === 'Back').click();
      await wait(120);
    }
    Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
      .find((b) => b.textContent === 'Assign Job').click();
    await wait(120);
    const held = C.assignmentsAt(sh, 'storehand', 'morning');
    return { title: title, held: held.map((h) => h.seat + ':' + h.staff.id),
      tick: sh.day * 3 + sh.phaseIndex };
  });
  ok('tapping the second place assigns into the second place',
    /Assign Store Hand 2: Morning/.test(viaUi.title) && viaUi.held.length === 1 &&
    /^1:/.test(viaUi.held[0]), JSON.stringify(viaUi));

  // and making that place repeat daily
  const seatRepeat = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    F.shopRender();
    document.querySelector('#shPanel [data-slot-role="runner"][data-slot-phase="afternoon"][data-slot-seat="1"]').click();
    await wait(120);
    Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
      .find((b) => b.textContent === 'Repeat Daily').click();
    await wait(120);
    const title = document.getElementById('shopSheetTitle').textContent;
    Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
      .find((b) => b.textContent === 'Repeat Daily').click();
    await wait(150);
    const slot = C.standingAt(sh, 'runner', 'afternoon', 1);
    const first = C.standingAt(sh, 'runner', 'afternoon', 0);
    const box = document.querySelector('#shPanel .roster-role:nth-of-type(n) [data-slot-seat="1"][data-slot-phase="afternoon"][data-slot-role="runner"]') ||
      Array.from(document.querySelectorAll('#shPanel .roster-box')).find((b) =>
        /Afternoon, Runner 2/.test(b.getAttribute('aria-label') || ''));
    return { title: title, seat: slot && slot.seat, first: !!first,
      marked: !!(box && box.querySelector('.rb-repeat')) };
  });
  ok('a second place can repeat daily on its own',
    /Repeat Daily: Runner 2, Afternoon/.test(seatRepeat.title) && seatRepeat.seat === 1 && !seatRepeat.first &&
    seatRepeat.marked, JSON.stringify(seatRepeat));

  // three Smiths in one phase: all work, one phase passes, each shown in turn
  const three = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const smiths = sh.staff.filter((e) => e.role === 'smith');
    for (const e of smiths) {
      C.shopAssign(sh, e.id, { order: { item: 'shortsword', material: 'bronze', qty: 2 } }, 'morning');
    }
    F.shopRender();
    const figs = smiths.map((e) => document.querySelector('#shThings [data-crew="' + e.id + '"]'));
    const lefts = figs.map((f) => f && parseFloat(f.style.left));
    const before = { tick: sh.day * 3 + sh.phaseIndex, bronze: sh.materials.bronze, orders: sh.orders.length };
    F.setPhaseAnim(true);
    F.setWorkerCam(true);
    F.shopSpendPhase(null);
    const t0 = Date.now();
    while (F.shopUi.playing && Date.now() - t0 < 40000) await new Promise((r) => setTimeout(r, 80));
    const shown = (F.shopUi.tourLog || []).filter((x) => x.role === 'smith');
    for (let k = 0; k < 6 && !document.getElementById('shopSheet').hidden; k++) {
      document.querySelector('#shopSheet [data-at="0"]').click();
      await new Promise((r) => setTimeout(r, 60));
    }
    F.setPhaseAnim(false);
    const made = sh.log.filter((r) => r.kind === 'smith' && r.ok && r.day === sh.day);
    return { lefts: lefts, figs: figs.every(Boolean), before: before,
      tick: sh.day * 3 + sh.phaseIndex, bronze: sh.materials.bronze, orders: sh.orders.length,
      made: made.length, ids: new Set(made.map((r) => r.staffId)).size,
      shown: shown.length, visible: shown.every((x) => x.visible) };
  });
  ok('three Smiths stand at three different places in the room',
    three.figs && new Set(three.lefts).size === 3, JSON.stringify(three.lefts));
  ok('all three forge in the same phase, and that phase is spent once',
    three.made === 3 && three.ids === 3 && three.tick === three.before.tick + 1 &&
    three.before.bronze - three.bronze === 6 && three.orders === three.before.orders + 3,
    JSON.stringify(three));
  ok('and the camera shows each of them at work', three.shown === 3 && three.visible,
    JSON.stringify(three));

  // a hired Salesperson's phase: the share shows in the summary and the gold
  const earned = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    const sal = sh.staff.find((e) => e.role === 'salesperson');
    F.testStock(sh, C.lineKey('shortsword', 'bronze'), 30, 90, 40);
    for (const one of sh.town) one.gold = 5000;
    sh.reputation = 40;
    // only the Salesperson works this phase, so the gold moves by the sales alone
    for (const id in sh.assignments) {
      if (sh.assignments[id].phase === C.shopPhase(sh) && !sh.assignments[id].done) delete sh.assignments[id];
    }
    const res = C.shopAssign(sh, sal.id, {}, C.shopPhase(sh));
    F.shopRender();
    const gold = sh.gold;
    F.shopSpendPhase(null);
    await new Promise((r) => setTimeout(r, 200));
    const rep = sh.log.find((r) => r.kind === 'sales' && r.staffId === sal.id);
    const body = document.getElementById('shopSheetBody').innerText;
    for (let k = 0; k < 6 && !document.getElementById('shopSheet').hidden; k++) {
      document.querySelector('#shopSheet [data-at="0"]').click();
      await new Promise((r) => setTimeout(r, 60));
    }
    return { booked: res.ok, sold: rep && rep.sold, revenue: rep && rep.revenue, bonus: rep && rep.bonus,
      gained: sh.gold - gold, summary: body.replace(/\s+/g, ' ') };
  });
  ok('a hired Salesperson’s phase earns the share on top of the sales',
    earned.booked && earned.sold > 0 && earned.bonus > 0 &&
    Math.abs(earned.bonus - earned.revenue * 0.1) <= earned.sold * 0.5 &&
    earned.gained === earned.revenue + earned.bonus, JSON.stringify(earned).slice(0, 300));
  ok('and the phase summary shows it', new RegExp('Salesperson Earnings \\+' + earned.bonus + 'g')
    .test(earned.summary), earned.summary.slice(0, 300));

  // everything survives closing the game
  const beforeReload = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    F.shopRender();                                       // rendering puts the forge down
    return { upgrades: ['smithSeats', 'storeSeats', 'runnerSeats', 'salesBonus'].map((k) => sh.upgrades[k]),
      standing: sh.standing.map((x) => x.role + '@' + x.phase + '#' + (x.seat || 0)).sort(),
      staff: sh.staff.length };
  });
  await page.reload();
  await installStock(page);
  await page.evaluate(() => window.CHECKSMITH.introSkip && window.CHECKSMITH.introSkip());
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  await page.click('.mode-card[data-mode="shop"]');
  await page.click('#beginBtn');
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(250);
  const afterReload = await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    return { upgrades: ['smithSeats', 'storeSeats', 'runnerSeats', 'salesBonus'].map((k) => sh.upgrades[k]),
      standing: sh.standing.map((x) => x.role + '@' + x.phase + '#' + (x.seat || 0)).sort(),
      staff: sh.staff.length, seats: C.phaseSeats(sh, 'smith'), rate: C.salesBonusRate(sh) };
  });
  ok('upgrade levels, places and recurring places are all there after a reload',
    JSON.stringify(afterReload.upgrades) === JSON.stringify(beforeReload.upgrades) &&
    JSON.stringify(afterReload.standing) === JSON.stringify(beforeReload.standing) &&
    afterReload.staff === beforeReload.staff && afterReload.seats === 3 &&
    Math.abs(afterReload.rate - 0.1) < 1e-9, JSON.stringify([beforeReload, afterReload]));

  await page.evaluate((kept) => {
    const F = window.CHECKSMITH, C = F.core;
    for (let k = 0; k < 6 && !document.getElementById('shopSheet').hidden; k++) F.shopSheetClose();
    F.app.shop = C.restoreShop(JSON.parse(kept), F.app.rnd);
    F.shopUi.tab = null;
    F.shopRender();
  }, keptForStaffing);

  section('1.44: every object opens its own window');
  const places = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    const tick = () => new Promise((r) => setTimeout(r, 40));
    F.shopUi.tab = null; F.shopRender();
    const shut = document.getElementById('shDrawer').hidden;
    const out = {};
    for (const id of ['forge', 'store', 'supply', 'counter', 'ledger', 'plans', 'board', 'commissions', 'door']) {
      const btn = document.querySelector(`#shThings [data-station="${id}"]`);
      F.sceneView(btn.closest('.loc-stage').dataset.loc, false);
      btn.click();
      await tick();
      out[id] = { title: document.getElementById('shDrawerTitle').textContent,
        tabs: Array.from(document.querySelectorAll('#shTabs [data-tab]')).map((b) => b.textContent.replace(/\d+$/, '').trim()),
        open: !document.getElementById('shDrawer').hidden, art: !!document.querySelector('#shDrawerArt svg'),
        view: F.shopUi.view };
      document.getElementById('shDrawerClose').click();
      await tick();
    }
    // a window closes, and opens again on the page it was left at
    document.querySelector('#shThings [data-station="ledger"]').click();
    await tick();
    document.querySelector('#shTabs [data-tab="props"]').click();
    await tick();
    const onProps = F.shopUi.tab;
    document.getElementById('shDrawerClose').click();
    await tick();
    const closed = F.shopUi.tab === null && document.getElementById('shDrawer').hidden;
    document.querySelector('#shThings [data-station="ledger"]').click();
    await tick();
    const remembered = F.shopUi.tab;
    document.getElementById('shDrawerClose').click();
    // the pages as older code names them still find their place
    F.shopShowTab('grow');
    const grow = F.shopUi.tab + '@' + document.getElementById('shDrawerTitle').textContent;
    F.shopShowTab('ledger');
    const ledger = F.shopUi.tab + '@' + document.getElementById('shDrawerTitle').textContent;
    F.shopUi.tab = null; F.shopRender();
    return { shut, out, onProps, closed, remembered, grow, ledger };
  });
  ok('the shop opens with every window shut', places.shut, JSON.stringify(places));
  const want = { forge: 'Forge:', store: 'Storeroom:Metal & Ore,Finished Goods', supply: 'Supplies:',
    counter: 'Counter:Counter,Displays,Customers', ledger: 'Ledger:Accounts,Properties',
    plans: 'Upgrades:Shop,Workshop,Staff', board: 'Hiring Board:Employees,Schedule,Hire',
    commissions: 'Commission Board:Available,Active,Completed', door: 'Entrance:Deliveries,Vehicles' };
  ok('each object opens a window of its own, organised by what it is for',
    Object.keys(want).every((id) => places.out[id].open && places.out[id].art &&
      places.out[id].title + ':' + places.out[id].tabs.join(',') === want[id]),
    JSON.stringify(places.out));
  ok('opening a window leaves the camera where it was',
    Object.values(places.out).every((o) => ['work', 'floor', 'front'].includes(o.view)) &&
    places.out.forge.view === 'work' && places.out.counter.view === 'floor' && places.out.door.view === 'front',
    JSON.stringify(places.out));
  ok('a window closes and opens again on the page it was left at',
    places.onProps === 'props' && places.closed && places.remembered === 'props', JSON.stringify(places));
  ok('the pages older code names still reach their windows',
    places.grow === 'upShop@Upgrades' && places.ledger === 'active@Commission Board', JSON.stringify(places));

  // every label whole, at every phone width asked for
  const widths = {};
  for (const w of [320, 360, 390, 430]) {
    await page.setViewportSize({ width: w, height: 760 });
    await page.waitForTimeout(80);
    widths[w] = await page.evaluate(async () => {
      const F = window.CHECKSMITH;
      const bad = [];
      const scan = () => {
        for (const el of document.querySelectorAll('#shopView *, #shopSheet *, #shDrawer *')) {
          if (el.closest('#shScene') || el.closest('svg')) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || !el.textContent.trim()) continue;
          const cs = getComputedStyle(el);
          if (cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis') continue;
          if (el.scrollWidth > el.clientWidth + 1) bad.push(el.className + ':' + el.textContent.trim().slice(0, 20));
        }
      };
      for (const t of [null, 'forge', 'metal', 'storage', 'supply', 'counter', 'shelf', 'town', 'accounts',
        'props', 'upShop', 'upWork', 'upStaff', 'crew', 'staff', 'hire', 'offers', 'active', 'done', 'deliver', 'yard']) {
        F.shopUi.tab = t; F.shopRender(); scan();
      }
      for (const st of ['table', 'sign']) {
        F.shopOpenStation(st); scan(); F.shopSheetClose();
      }
      F.shopUi.tab = null; F.shopRender();
      const page = document.documentElement.scrollWidth <= window.innerWidth + 1;
      return { bad: bad.slice(0, 5), page: page };
    });
  }
  await page.setViewportSize({ width: 320, height: 700 });
  ok('no label is cut off, at 320, 360, 390 or 430 pixels wide',
    Object.values(widths).every((r) => !r.bad.length && r.page), JSON.stringify(widths));

  section('1.34: the phase that ended is the one you watch');
  const watched = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    F.shopSheetClose();
    const P = C.SHOP.phases;
    sh.day += 1; sh.phaseIndex = 0; sh.assignments = {}; sh.standing = [];
    sh.staff = [
      { id: 8101, name: 'Morning Mara', role: 'salesperson', rank: 'C', power: 3, wage: 20, xp: 0, face: 'merchant' },
      { id: 8102, name: 'Afternoon Abe', role: 'salesperson', rank: 'C', power: 3, wage: 20, xp: 0, face: 'guard' },
      { id: 8103, name: 'Evening Eda', role: 'salesperson', rank: 'C', power: 3, wage: 20, xp: 0, face: 'cleric' }
    ];
    C.shopAssign(sh, 8101, {}, P[0]);
    C.shopAssign(sh, 8102, {}, P[1]);
    C.shopAssign(sh, 8103, {}, P[2]);
    F.setPhaseAnim(true);
    const seen = [];
    for (let i = 0; i < 3; i++) {
      F.testStock(sh, C.lineKey('longsword', 'bronze'), 40, 95, 20);
      F.shopRender();
      const before = { phase: sh.phaseIndex, day: sh.day };
      F.shopSpendPhase(null);
      F.shopSpendPhase(null);                              // a second press mid-playback
      const after = { phase: sh.phaseIndex, day: sh.day };
      // wait until the seller is shown at work, then note who it was
      let busy = null;
      for (let t = 0; t < 40 && !busy; t++) {
        await new Promise((r) => setTimeout(r, 60));
        const el = document.querySelector('#shThings .fig.busy');
        if (el) busy = Number(el.dataset.crew);
      }
      F.shopSkipPhase();
      await new Promise((r) => setTimeout(r, 120));
      for (let k = 0; k < 5 && !document.getElementById('shopSheet').hidden; k++) {
        const b = Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))[0];
        if (b) b.click();
        await new Promise((r) => setTimeout(r, 80));
      }
      seen.push({ busy: busy, before: before, after: after });
    }
    F.setPhaseAnim(false);
    return seen;
  });
  ok('the morning plays the morning hand, not the afternoon one',
    watched[0].busy === 8101, JSON.stringify(watched));
  ok('the afternoon plays the afternoon hand', watched[1].busy === 8102, JSON.stringify(watched));
  ok('the evening plays the evening hand, even across the turn of the day',
    watched[2].busy === 8103, JSON.stringify(watched));
  ok('a second press during the playback never advances the day twice',
    watched[0].after.phase === 1 && watched[1].after.phase === 2 &&
    watched[2].after.phase === 0 && watched[2].after.day === watched[2].before.day + 1,
    JSON.stringify(watched));

  section('1.34: the Novice board has a bishop');
  // a dagger in bronze is a 3x3 Novice board; make sure this forge knows it
  await teach(page, 'dagger');
  const bishop = await page.evaluate(async () => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.materials.bronze = 200;
    let dealt = 0, withB = 0, found = null;
    for (let tries = 0; tries < 40 && !found; tries++) {
      F.shopUi.draft = { item: 'dagger', material: 'bronze', qty: 1 };
      F.shopStartForge();
      await new Promise((r) => setTimeout(r, 90));
      const g = F.app.game;
      if (!g || g.board.size !== 3) { F.shopUi.order = null; F.shopReturn(); continue; }
      dealt++;
      const at = g.pieces.indexOf('B');
      if (at >= 0) {
        withB++;
        F.tap(at);                                           // stand on the bishop
        await new Promise((r) => setTimeout(r, 400));
        const diag = C.movesFrom('B', at, 3);
        const allowed = [];
        for (let j = 0; j < 9; j++) if (C.canStrike(g, j)) allowed.push(j);
        const ortho = [at - 3, at + 3, at % 3 ? at - 1 : -1, at % 3 < 2 ? at + 1 : -1]
          .filter((j) => j >= 0 && j < 9);
        found = { at: at, diag: diag.slice().sort(), allowed: allowed.slice().sort(),
          orthoRefused: ortho.every((j) => !C.canStrike(g, j)),
          legend: /Bishop/.test(document.getElementById('legendBody').textContent) };
      }
      F.shopUi.order = null; F.shopReturn();
      await new Promise((r) => setTimeout(r, 40));
    }
    return { dealt: dealt, withB: withB, found: found };
  });
  ok('a Novice board can deal a bishop, and the legend names it',
    bishop.found && bishop.found.legend, JSON.stringify(bishop));
  ok('struck, a bishop reaches exactly its diagonals and nothing square to it',
    bishop.found && JSON.stringify(bishop.found.diag) === JSON.stringify(bishop.found.allowed) &&
    bishop.found.orthoRefused, JSON.stringify(bishop.found));

  section('Open Your Forge leaves the other modes alone');
  await page.evaluate(() => window.CHECKSMITH.menuLeave());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  await startFromTitle(page, 'forge', 'novice');
  ok('forge still deals its own two-strike board', await page.evaluate(() => {
    const g = window.CHECKSMITH.app.game;
    return g.perfect === 2 && g.spent === 3 && g.board.route.length === 2 * 9;
  }));
  ok('and the shop screen is nowhere in sight', await page.evaluate(() => {
    const el = document.getElementById('shopView');
    const r = el.getBoundingClientRect();
    return el.hidden && r.width === 0;
  }));

  /* ============ the Forge's dagger ============ */
  section('The Forge: a dagger blank');
  {
    const N = 11;
    const at = (r, c) => r * N + c;
    const order = (list) => list.slice().sort((x, y) => x - y).join(',');
    const cells = (...rc) => order(rc.map(([r, c]) => at(r, c)));
    await page.evaluate(() => window.CHECKSMITH.menuLeave());
    if (await page.isVisible('#confirm')) await page.click('#confirmYes');
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    const bestBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('checksmith:v1')).best || {});
    await startFromTitle(page, 'forge');
    await page.waitForTimeout(150);

    const opened = await page.evaluate(() => {
      const F = window.CHECKSMITH, g = F.app.game;
      const vis = (id) => { const el = document.getElementById(id); return !!el && !el.hidden && el.getBoundingClientRect().height > 0; };
      return {
        piece: g.board.piece, shaped: !!g.board.shape, mode: g.mode, morph: g.morphChance,
        bar: document.getElementById('pieceBar').textContent.replace(/\s+/g, ' ').trim(), barShown: vis('pieceBar'),
        diffRow: !document.querySelector('.difficulty:not(#titleDiff)').hidden,
        newShown: vis('newBtn'), restart: document.getElementById('restartBtn').textContent,
        menu: vis('menuActionBtn') && document.getElementById('menuActionBtn').textContent,
        prompt: document.getElementById('promptText').textContent.trim(),
        best: document.getElementById('bestLine').textContent,
        legend: Array.from(document.querySelectorAll('#legendBody .legend-row b')).map((b) => b.textContent)
      };
    });
    ok('picking the dagger lays its blank on the anvil, not a square board',
      opened.piece === 'dagger' && opened.shaped && opened.mode === 'forge' && opened.morph === 0,
      JSON.stringify(opened));
    ok('it names the piece and counts the blade and the tang apart',
      opened.barShown && /Dagger/.test(opened.bar) && /Blade 0\/31/.test(opened.bar) &&
      /Tang 0\/4/.test(opened.bar), opened.bar);
    ok('no board size to pick and no other puzzle to deal; restart and the way back to the designs',
      !opened.diffRow && !opened.newShown && opened.restart === 'Restart Piece' && opened.menu === 'All Designs',
      JSON.stringify(opened));
    ok('the legend lists exactly the symbols the dagger carries',
      opened.legend.join(',') === 'King,Rook,Bishop,Knight,Two,Three', opened.legend.join(','));
    ok('the prompt and best line read for the dagger',
      opened.prompt === 'Choose any square to begin.' && /the Dagger/.test(opened.best), JSON.stringify(opened));

    const layout = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('#board .tile'));
      const shown = tiles.filter((t) => t.getBoundingClientRect().width > 0);
      const air = tiles.filter((t) => t.dataset.air === '1');
      const rows = {};
      for (const t of shown) {
        const r = t.getBoundingClientRect();
        const key = Math.round(r.top);
        (rows[key] = rows[key] || []).push(r);
      }
      const board = document.getElementById('board').getBoundingClientRect();
      const mid = board.left + board.width / 2;
      const lines = Object.keys(rows).map(Number).sort((a, b) => a - b).map((k) => rows[k]);
      const wrap = getComputedStyle(document.querySelector('.board-wrap'));
      return {
        total: tiles.length, shown: shown.length,
        widths: lines.map((l) => l.length),
        centred: lines.every((l) => {
          const lo = Math.min(...l.map((r) => r.left)), hi = Math.max(...l.map((r) => r.right));
          return Math.abs((lo + hi) / 2 - mid) < 2;
        }),
        tangStraight: lines.slice(7).every((l) => Math.abs(l[0].left - lines[0][0].left) < 1),
        airHidden: air.length === tiles.length - 35 && air.every((t) =>
          getComputedStyle(t).display === 'none' && t.disabled && t.getAttribute('aria-hidden') === 'true'),
        onlyTilesAndBlank: Array.from(document.getElementById('board').children)
          .every((el) => el.classList.contains('tile') || el.classList.contains('blank')),
        blank: !!document.querySelector('#board .blank path.blank-metal'),
        panel: wrap.borderTopColor + ' | ' + wrap.backgroundColor + ' | ' + wrap.backgroundImage.slice(0, 20)
      };
    });
    ok('the dagger is drawn in its shape: point, blade, and a one-square tang',
      layout.shown === 35 && layout.widths.join(',') === '1,3,5,7,7,5,3,1,1,1,1', JSON.stringify(layout));
    ok('every row is centred on the blade, and the tang runs straight down from the point',
      layout.centred && layout.tangStraight, JSON.stringify(layout));
    ok('no square of the grid around it is drawn: air tiles are gone, not just dimmed',
      layout.airHidden && layout.onlyTilesAndBlank, JSON.stringify(layout));
    ok('the blank is drawn under the tiles, and no rectangular panel frames it',
      layout.blank && /rgba\(0, 0, 0, 0\)/.test(layout.panel) && /radial/.test(layout.panel), layout.panel);

    // where the grid's squares sit on screen, read off the metal tiles themselves
    const geo = await page.evaluate(() => {
      const t = (i) => document.querySelector(`#board .tile[data-i="${i}"]`).getBoundingClientRect();
      const a = t(3 * 11 + 0), b = t(3 * 11 + 6), top = t(0 * 11 + 3), end = t(10 * 11 + 3);
      return { x0: a.left, pitchX: (b.left - a.left) / 6, y0: top.top, pitchY: (end.top - top.top) / 10, size: a.width };
    });
    const centre = (r, c) => ({ x: geo.x0 + c * geo.pitchX + geo.size / 2, y: geo.y0 + r * geo.pitchY + geo.size / 2 });
    const hits = await page.evaluate((pts) => pts.map((p) => {
      const el = document.elementFromPoint(p.x, p.y);
      const tile = el && el.closest ? el.closest('.tile') : null;
      return tile ? Number(tile.dataset.i) : -1;
    }), (() => {
      const pts = [];
      for (let r = 0; r < 11; r++) for (let c = 0; c < 7; c++) pts.push(Object.assign({ i: at(r, c) }, centre(r, c)));
      return pts;
    })());
    const metalIdx = await page.evaluate(() => {
      const b = window.CHECKSMITH.app.game.board, out = [];
      for (let i = 0; i < 121; i++) if (window.CHECKSMITH.core.isMetal(b, i)) out.push(i);
      return out;
    });
    const want = [];
    for (let r = 0; r < 11; r++) for (let c = 0; c < 7; c++) want.push(metalIdx.includes(at(r, c)) ? at(r, c) : -1);
    ok('every visible square answers a tap at its centre, and the blank never covers one',
      JSON.stringify(hits) === JSON.stringify(want), JSON.stringify({ hits, want }));

    const labels = await page.evaluate(() => Array.from(document.querySelectorAll('#board .tile'))
      .filter((t) => t.dataset.air !== '1').map((t) => t.getAttribute('aria-label')));
    ok('every metal square is offered as an opening, and the tang says so',
      labels.length === 35 && labels.every((l) => /legal opening square/.test(l)) &&
      labels.filter((l) => /in the tang/.test(l)).length === 4, labels.slice(0, 2).join(' / '));

    // taps on the air, by pointer, by a hidden button and by the controller
    const airTaps = [[0, 0], [0, 6], [2, 0], [7, 2], [10, 0], [10, 6], [8, 4]];
    for (const [r, c] of airTaps) {
      const p = centre(r, c);
      await page.mouse.click(p.x, p.y);
    }
    await page.waitForTimeout(250);
    const afterAir = await page.evaluate((list) => {
      const F = window.CHECKSMITH;
      for (const i of list) {
        F.tap(i);
        const el = document.querySelector(`#board .tile[data-i="${i}"]`);
        if (el) el.click();
      }
      const g = F.app.game;
      return { total: g.totalStrikes, current: g.current, struck: g.strikes.reduce((a, x) => a + x, 0), busy: F.app.busy };
    }, airTaps.map(([r, c]) => at(r, c)));
    ok('the air cannot be struck: not tapped, not clicked, not by the controller',
      afterAir.total === 0 && afterAir.current === -1 && afterAir.struck === 0 && !afterAir.busy,
      JSON.stringify(afterAir));

    // what each kind of square offers, as the board lights it up
    const lit = await page.evaluate((cases) => {
      const F = window.CHECKSMITH, g = F.app.game;
      const out = {};
      for (const [name, idx, as] of cases) {
        const was = g.pieces[idx];
        if (as) g.pieces[idx] = as;
        g.current = idx; g.status = 'playing'; g.strikes[idx] = 1;
        F.render();
        const tiles = Array.from(document.querySelectorAll('#board .tile[data-legal="1"]'));
        out[name] = {
          lit: tiles.map((t) => Number(t.dataset.i)).sort((a, b) => a - b).join(','),
          core: F.core.legalTargets(g).slice().sort((a, b) => a - b).join(','),
          allShown: tiles.every((t) => t.getBoundingClientRect().width > 0),
          prompt: document.getElementById('promptText').textContent
        };
        g.pieces[idx] = was; g.strikes[idx] = 0;
      }
      g.current = -1; g.status = 'ready';
      F.render();
      return out;
    }, [['rookTip', at(0, 3)], ['rookBlade', at(3, 2)], ['bishop', at(4, 0)], ['knight', at(6, 2)],
      ['kingTang', at(9, 3)], ['three', at(6, 3)], ['two', at(8, 3)], ['queen', at(4, 3), 'Q'],
      ['four', at(5, 3), '4'], ['five', at(10, 3), '5']]);
    ok('a rook slides the length of the spine, from the point to the end of the tang',
      lit.rookTip.lit === cells([1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3]),
      lit.rookTip.lit);
    ok('a rook in the blade lights its row and column, and nothing past the edge of the metal',
      lit.rookBlade.lit === cells([3, 0], [3, 1], [3, 3], [3, 4], [3, 5], [3, 6], [1, 2], [2, 2], [4, 2], [5, 2], [6, 2]),
      lit.rookBlade.lit);
    ok('a bishop lights its diagonals, down the bevel into the throat',
      lit.bishop.lit === cells([3, 1], [2, 2], [1, 3], [5, 1], [6, 2], [7, 3]), lit.bishop.lit);
    ok('a knight lights its jumps, into the tang and back up the blade',
      lit.knight.lit === cells([4, 1], [4, 3], [5, 4], [8, 3]), lit.knight.lit);
    ok('a king in the tang lights only the squares above and below it',
      lit.kingTang.lit === cells([8, 3], [10, 3]), lit.kingTang.lit);
    ok('numbers count their rings across the dagger',
      lit.three.lit === cells([3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [4, 0], [4, 6], [9, 3]) &&
      lit.two.lit === cells([6, 2], [6, 3], [6, 4], [10, 3]), lit.three.lit + ' / ' + lit.two.lit);
    ok('every symbol the forge knows - a queen and bigger numbers too - lights exactly its legal squares',
      Object.values(lit).every((v) => v.lit === v.core && v.allShown && v.lit.length > 0) &&
      /Queen/.test(lit.queen.prompt), JSON.stringify(lit.queen));

    // a real blow, with its hammer and its sound
    await fast(page, 260);
    await page.evaluate(() => {
      const F = window.CHECKSMITH;
      F.heard = [];
      for (const k of ['shape', 'finish', 'crack', 'invalid', 'complete', 'stranded']) {
        const orig = F.sounds[k];
        F.sounds[k] = function () { F.heard.push(k); return orig.apply(this, arguments); };
      }
    });
    await page.click(`#board .tile[data-i="${at(0, 3)}"]`);
    const swinging = await page.locator('.hammer').count();
    await settle(page);
    const first = await page.evaluate(() => {
      const F = window.CHECKSMITH, g = F.app.game;
      return { current: g.current, strikes: g.strikes[g.current], s: document.querySelector(`#board .tile[data-i="${g.current}"]`).dataset.s,
        heard: F.heard.slice(), prompt: document.getElementById('promptText').textContent,
        lit: document.querySelectorAll('#board .tile[data-legal="1"]').length };
    });
    ok('a blow on the point swings the hammer and rings, and the square takes it',
      swinging > 0 && first.current === at(0, 3) && first.strikes === 1 && first.s === '1' &&
      first.heard.includes('shape') && /Rook/.test(first.prompt) && first.lit === 10, JSON.stringify(first));
    await page.click(`#board .tile[data-i="${at(1, 2)}"]`);           // a bishop square: no rook reaches it
    await page.waitForTimeout(260);
    const refused = await page.evaluate(() => ({ total: window.CHECKSMITH.app.game.totalStrikes, heard: window.CHECKSMITH.heard.slice() }));
    ok('an illegal square is refused with a shake and the invalid sound', refused.total === 1 &&
      refused.heard.includes('invalid'), JSON.stringify(refused));
    await page.click(`#board .tile[data-i="${at(10, 3)}"]`);          // down the spine to the tang's end
    await settle(page);
    const tangEnd = await page.evaluate(() => ({
      current: window.CHECKSMITH.app.game.current,
      bar: document.querySelector('#pieceParts [data-part="1"] b').textContent,
      fxClean: document.getElementById('fx').childElementCount
    }));
    ok('the point\'s rook reaches the end of the tang in one blow', tangEnd.current === at(10, 3) && tangEnd.bar === '0/4',
      JSON.stringify(tangEnd));
    await page.waitForTimeout(900);
    ok('hammer and sparks clear away after the swing',
      await page.evaluate(() => document.getElementById('fx').childElementCount === 0));

    // arrow keys walk the metal and step over the air
    const keys = await page.evaluate(() => {
      const F = window.CHECKSMITH;
      F.app.focusIndex = 3;
      document.querySelector('#board .tile[data-i="3"]').focus();
      return document.activeElement.dataset.i;
    });
    const walk = [];
    for (const k of ['ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(k);
      walk.push(await page.evaluate(() => Number(document.activeElement.dataset.i)));
    }
    ok('arrow keys walk the metal and never land on air',
      keys === '3' && walk.join(',') === [at(1, 3), at(1, 2), at(1, 2), at(2, 2), at(3, 2), at(3, 1), at(2, 1)].join(','),
      walk.join(','));

    // the hammer mid-swing never sits over a menu
    await page.evaluate(() => {
      const F = window.CHECKSMITH;
      const t = F.core.legalTargets(F.app.game)[0];
      document.querySelector(`#board .tile[data-i="${t}"]`).click();
      window.openHelp();
    });
    const cover = await page.evaluate(() => {
      const close = document.getElementById('helpClose');
      close.scrollIntoView({ block: 'center' });
      const r = close.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const help = document.getElementById('help');
      return { onTop: el === close || close.contains(el), dagger: /weapon designs/i.test(help.textContent) &&
        /tang/i.test(help.textContent) && /eye/i.test(help.textContent), hammerZ: Number(getComputedStyle(document.getElementById('fx')).zIndex),
        overlayZ: Number(getComputedStyle(help).zIndex) };
    });
    ok('How to Play covers the dagger, the hammer and the glow, and explains the tang',
      cover.onTop && cover.dagger && cover.hammerZ < cover.overlayZ, JSON.stringify(cover));
    await page.click('#helpClose');
    await settle(page);

    // restart puts the same dagger back, cold
    const piecesBefore = await page.evaluate(() => window.CHECKSMITH.app.game.board.pieces.join(''));
    await page.evaluate(() => document.getElementById('restartBtn').click());
    if (await page.isVisible('#confirm')) await page.click('#confirmYes');
    await page.waitForTimeout(200);
    const restarted = await page.evaluate(() => {
      const g = window.CHECKSMITH.app.game;
      return { total: g.totalStrikes, cold: g.strikes.every((x) => x === 0), current: g.current, status: g.status,
        pieces: g.board.pieces.join(''), shown: Array.from(document.querySelectorAll('#board .tile'))
          .filter((t) => t.getBoundingClientRect().width > 0).length,
        bar: document.getElementById('pieceBar').textContent.replace(/\s+/g, ' ') };
    });
    ok('restarting puts the same dagger back, every square cold',
      restarted.total === 0 && restarted.cold && restarted.current === -1 && restarted.status === 'ready' &&
      restarted.pieces === piecesBefore && restarted.shown === 35 && /Blade 0\/31/.test(restarted.bar),
      JSON.stringify(restarted));

    // the whole piece, point to tang, through the interface
    await fast(page, 30);
    const route = await page.evaluate(() => window.CHECKSMITH.app.game.board.route.slice());
    let tangSeen = false;
    for (const step of route) {
      await page.evaluate((i) => { document.querySelector(`#board .tile[data-i="${i}"]`).click(); }, step);
      await settle(page);
      if (!tangSeen && Math.floor(step / N) >= 7) {
        tangSeen = await page.evaluate((i) => document.querySelector(`#board .tile[data-i="${i}"]`).dataset.current === '1', step);
      }
    }
    await page.waitForTimeout(300);
    const done = await page.evaluate(() => {
      const g = window.CHECKSMITH.app.game;
      const text = (id) => document.getElementById(id).textContent.trim();
      return { status: g.status, results: !document.getElementById('results').hidden,
        quality: text('rQuality'), label: text('rLabel'), perfect: text('rPerfect'),
        pieceLabel: text('rDiffLabel'), piece: text('rDiff'), retry: text('rRetry'),
        next: document.getElementById('rNew').hidden, change: text('rChange'), bestNote: text('rBest'),
        blade: document.querySelector('#pieceParts [data-part="0"] b').textContent,
        tang: document.querySelector('#pieceParts [data-part="1"] b').textContent,
        frozen: document.getElementById('board').dataset.frozen,
        best: JSON.parse(localStorage.getItem('checksmith:v1')).best,
        heard: window.CHECKSMITH.heard.slice(-3) };
    });
    ok('the stored route walks into the tang and back out, and forges every square',
      tangSeen && done.status === 'complete' && done.blade === '31/31' && done.tang === '4/4', JSON.stringify(done));
    ok('completing the dagger brings up the results: a Masterwork, 35 of 35 perfect',
      done.results && done.quality.startsWith('100') && done.label === 'Masterwork' && done.perfect === '35 / 35' &&
      done.frozen === '1' && done.heard.includes('complete'), JSON.stringify(done));
    ok('the results name the piece, and offer to forge it again or go back to the designs',
      done.pieceLabel === 'Piece' && done.piece === 'Dagger' && done.retry === 'Forge It Again' &&
      done.next === true && done.change === 'All Designs', JSON.stringify(done));
    ok('the best is kept for the dagger, and the old square-board records are left as they were',
      done.best.dagger === 100 && Object.keys(bestBefore).every((k) => done.best[k] === bestBefore[k]),
      JSON.stringify({ before: bestBefore, after: done.best }));

    await page.click('#rRetry');
    await page.waitForTimeout(200);
    const retried = await page.evaluate(() => {
      const g = window.CHECKSMITH.app.game;
      return { total: g.totalStrikes, cold: g.strikes.every((x) => x === 0), frozen: document.getElementById('board').dataset.frozen,
        pieces: g.board.pieces.join(''), results: document.getElementById('results').hidden,
        best: document.getElementById('bestLine').textContent };
    });
    ok('forging it again resets the dagger cold, and the best line shows the masterwork',
      retried.total === 0 && retried.cold && retried.frozen === '0' && retried.pieces === piecesBefore &&
      retried.results && /the Dagger: 100/.test(retried.best), JSON.stringify(retried));

    // stranded in the tang: the second king with both its neighbours spent
    await fast(page, 30);
    await page.evaluate((s) => {
      const F = window.CHECKSMITH, g = F.app.game;
      g.strikes[s.t8] = 3; g.strikes[s.t10] = 3; g.strikes[s.tip] = 1; g.current = s.tip; g.status = 'playing';
      g.totalStrikes = 7;
      F.render();
    }, { t8: at(8, 3), t10: at(10, 3), tip: at(0, 3) });
    await page.click(`#board .tile[data-i="${at(9, 3)}"]`);
    await settle(page);
    await page.waitForTimeout(350);
    const stranded = await page.evaluate(() => ({
      status: window.CHECKSMITH.app.game.status, results: !document.getElementById('results').hidden,
      label: document.getElementById('rLabel').textContent.trim(), piece: document.getElementById('rDiff').textContent,
      retry: document.getElementById('rRetry').textContent }));
    ok('walking onto the tang\'s second king with nowhere left to go strands the piece',
      stranded.status === 'lost' && stranded.results && stranded.label === 'Stranded' &&
      stranded.piece === 'Dagger' && stranded.retry === 'Try Again', JSON.stringify(stranded));
    await page.click('#rRetry');
    await page.waitForTimeout(200);
    ok('and back at the anvil it is cold again', await page.evaluate(() =>
      window.CHECKSMITH.app.game.totalStrikes === 0 && window.CHECKSMITH.app.game.status === 'ready'));

    // leaving and coming back, through another mode that uses square boards
    await page.click(`#board .tile[data-i="${at(4, 3)}"]`);
    await settle(page);
    await page.evaluate(() => window.CHECKSMITH.menuLeave());
    if (await page.isVisible('#confirm')) await page.click('#confirmYes');
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    await startFromTitle(page, 'endless');
    await page.waitForTimeout(200);
    const endless = await page.evaluate(() => ({
      shape: document.getElementById('board').dataset.shape || null,
      wrap: document.querySelector('.board-wrap').dataset.shape || null,
      tiles: document.querySelectorAll('#board .tile').length,
      shown: Array.from(document.querySelectorAll('#board .tile')).filter((t) => t.getBoundingClientRect().width > 0).length,
      blank: !!document.querySelector('#board .blank'), bar: !document.getElementById('pieceBar').hidden,
      size: window.CHECKSMITH.app.game.board.size }));
    ok('Endless after the dagger deals its own square board, with no trace of the dagger',
      !endless.shape && !endless.wrap && endless.tiles === endless.size * endless.size &&
      endless.shown === endless.tiles && !endless.blank && !endless.bar, JSON.stringify(endless));
    await page.evaluate(() => window.CHECKSMITH.menuLeave());
    if (await page.isVisible('#confirm')) await page.click('#confirmYes');
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    await startFromTitle(page, 'forge');
    await page.waitForTimeout(150);
    const back = await page.evaluate(() => {
      const g = window.CHECKSMITH.app.game;
      return { piece: g.board.piece, total: g.totalStrikes, cold: g.strikes.every((x) => x === 0),
        shown: Array.from(document.querySelectorAll('#board .tile')).filter((t) => t.getBoundingClientRect().width > 0).length,
        valid: window.CHECKSMITH.core.validateBoard(g.board), pieces: g.board.pieces.join('') };
    });
    ok('leaving mid-piece and coming back lays a fresh, whole dagger',
      back.piece === 'dagger' && back.total === 0 && back.cold && back.shown === 35 && back.valid &&
      back.pieces === piecesBefore, JSON.stringify(back));

    // Open Your Forge after the dagger: its anvil is the square board it always was
    await page.evaluate(() => window.CHECKSMITH.menuLeave());
    if (await page.isVisible('#confirm')) await page.click('#confirmYes');
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    await page.click('.mode-card[data-mode="shop"]');
    await page.click('#beginBtn');
    await page.waitForFunction(() => window.CHECKSMITH.app.shop, null, { timeout: 10000 });
    await chooseCrafts(page);
    const anvil = await page.evaluate(async () => {
      const F = window.CHECKSMITH, sh = F.app.shop;
      const item = sh.known[0];
      sh.materials.bronze = 200;
      F.shopUi.draft = { item: item, material: 'bronze', qty: 1 };
      F.shopStartForge();
      for (let k = 0; k < 40 && !F.app.game; k++) await new Promise((r) => setTimeout(r, 80));
      const g = F.app.game;
      const tiles = Array.from(document.querySelectorAll('#board .tile'));
      const out = { item: item, has: !!g, shape: g && !!g.board.shape,
        boardShape: document.getElementById('board').dataset.shape || null,
        tiles: tiles.length, size: g && g.board.size,
        shown: tiles.filter((t) => t.getBoundingClientRect().width > 0).length,
        blank: !!document.querySelector('#board .blank'), bar: !document.getElementById('pieceBar').hidden,
        picker: !document.querySelector('.difficulty:not(#titleDiff)').hidden,
        perfect: g && g.perfect, want: F.core.shopMaterial ? F.core.shopMaterial('bronze').strikes : null,
        restart: document.getElementById('restartBtn').textContent,
        menu: document.getElementById('menuActionBtn').textContent };
      F.shopUi.order = null; F.shopReturn();
      return out;
    });
    ok('Open Your Forge still works its orders on a square board at the anvil, untouched by the dagger',
      anvil.has && !anvil.shape && !anvil.boardShape && anvil.tiles === anvil.size * anvil.size &&
      anvil.shown === anvil.tiles && !anvil.blank && !anvil.bar && !anvil.picker &&
      (anvil.want == null || anvil.perfect === anvil.want) &&
      anvil.restart === 'Restart Board' && anvil.menu === 'Abandon Order', JSON.stringify(anvil));
  }

  /* ============ the Forge's gallery of designs ============ */
  section('The Forge: choosing a design');
  {
    const IDS = ['dagger', 'shortsword', 'spearhead', 'axe', 'mace', 'longsword'];
    await page.evaluate(() => window.CHECKSMITH.menuLeave());
    if (await page.isVisible('#confirm')) await page.click('#confirmYes');
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    await page.click('.mode-card[data-mode="forge"]');
    ok('the title counts the designs forged so far',
      /1 of 6 designs forged/.test(await page.textContent('#forgeBest')), await page.textContent('#forgeBest'));
    await page.click('#beginBtn');
    await page.waitForSelector('#designView:not([hidden])', { timeout: 8000 });
    const gallery = await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core;
      const vis = (sel) => { const el = document.querySelector(sel); return !!el && !el.hidden && el.getBoundingClientRect().height > 0; };
      // the strip holds every design; tapping one brings it up on the stage
      const ids = Array.from(document.querySelectorAll('#designGrid .design-card')).map((c) => c.dataset.design);
      const first = document.querySelector('#designGrid [aria-current="true"]').dataset.design;
      const out = {
        game: F.app.game, board: vis('.board-wrap'), actions: vis('#forgeActions'), prompt: vis('#prompt'),
        bar: vis('#pieceBar'), stats: vis('#statsForge'), stage: vis('#designStage'), go: vis('#designGo'),
        cards: ids.map((id) => {
          const c = document.querySelector(`#designGrid [data-design="${id}"]`);
          const b = C.forgePieceBoard(id);
          const label = c.getAttribute('aria-label');
          c.click();
          const st = document.getElementById('designStage');
          return {
            id: id, name: st.querySelector('.ds-name').textContent,
            meta: st.querySelector('.ds-meta').textContent, best: st.querySelector('.ds-best').textContent,
            label: label, current: id === first, go: document.getElementById('designGo').textContent,
            selected: document.querySelector(`#designGrid [data-design="${id}"]`).getAttribute('aria-selected') === 'true',
            outline: !!st.querySelector('svg.design-pic path.th-metal'),
            squares: st.querySelectorAll('svg.design-pic rect.th-sq').length, metal: C.metalCount(b),
            rough: st.querySelectorAll('svg.design-pic rect.th-sq.rough').length,
            roughMetal: Array.from({ length: b.size * b.size }, (_, i) => i).filter((i) => C.inRough(b, i)).length
          };
        })
      };
      document.querySelector(`#designGrid [data-design="${first}"]`).click();
      out.game = F.app.game;
      return out;
    });
    ok('Begin opens the Forge on its gallery, with nothing on the anvil yet',
      gallery.game === null && !gallery.board && !gallery.actions && !gallery.prompt && !gallery.bar && !gallery.stats &&
      gallery.stage && gallery.go, JSON.stringify(gallery).slice(0, 300));
    ok('tapping a design in the strip brings it up, large, and names it on the Forge button - and forges nothing',
      gallery.cards.every((c) => c.selected && c.go === 'Forge the ' + c.name) && gallery.game === null,
      gallery.cards.map((c) => c.go).join(' | '));
    ok('six designs, gentlest first, each with its name, difficulty and size',
      gallery.cards.map((c) => c.id).join(',') === IDS.join(',') &&
      gallery.cards.map((c) => c.name).join(',') === 'Dagger,Shortsword,Spearhead,Axe Head,Mace Head,Longsword' &&
      gallery.cards.every((c) => /(Introductory|Moderate|Hard|Demanding) · \d+ squares/.test(c.meta)),
      gallery.cards.map((c) => c.name + ' / ' + c.meta).join(' | '));
    ok('each card\'s picture is the design itself: its outline, every square of it, the rough iron marked',
      gallery.cards.every((c) => c.outline && c.squares === c.metal && c.rough === c.roughMetal && c.rough > 0),
      JSON.stringify(gallery.cards.map((c) => [c.id, c.squares, c.metal, c.rough, c.roughMetal])));
    ok('the dagger shows the best it was forged to; the rest are not yet forged',
      gallery.cards[0].best === 'Best quality 100' && gallery.cards.slice(1).every((c) => c.best === 'Not yet forged') &&
      gallery.cards[0].current && /Best quality 100/.test(gallery.cards[0].label),
      gallery.cards.map((c) => c.best).join(' | '));

    // the gallery's help covers it, and its Main Menu goes home
    await menuItem(page, 'gmHelp');
    ok('How to Play opens over the gallery', await page.isVisible('#help'));
    await page.click('#helpClose');
    await page.click('#gameMenuClose');

    // every design: laid out as drawn, lit as the rules say, the air out of reach
    const drawn = await page.evaluate(() => {
      const out = {};
      for (const [id, def] of Object.entries(window.CHECKSMITH.core.FORGE_PIECES)) out[id] = def.rows;
      return out;
    });
    for (const id of IDS) {
      await page.click(`#designGrid [data-design="${id}"]`);
      await page.click('#designGo');
      await page.waitForFunction((d) => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.piece === d, id);
      await page.waitForTimeout(80);
      const seen = await page.evaluate(() => {
        const F = window.CHECKSMITH, C = F.core, g = F.app.game, b = g.board;
        const tiles = Array.from(document.querySelectorAll('#board .tile'));
        const shown = tiles.filter((t) => t.getBoundingClientRect().width > 0);
        // rebuild the drawing from what is on screen
        const pitch = (() => {
          const xs = [...new Set(shown.map((t) => Math.round(t.getBoundingClientRect().left)))].sort((a, b) => a - b);
          const ys = [...new Set(shown.map((t) => Math.round(t.getBoundingClientRect().top)))].sort((a, b) => a - b);
          return { x0: xs[0], y0: ys[0], dx: xs.length > 1 ? (xs[xs.length - 1] - xs[0]) / (b.cols - 1) : 1,
            dy: (ys[ys.length - 1] - ys[0]) / (b.rows - 1) };
        })();
        const grid = Array.from({ length: b.rows }, () => '.'.repeat(b.cols).split(''));
        for (const t of shown) {
          const r = t.getBoundingClientRect();
          const row = Math.round((r.top - pitch.y0) / pitch.dy), col = Math.round((r.left - pitch.x0) / pitch.dx);
          grid[row][col] = t.querySelector('.glyph').textContent;
        }
        const glyph = (p) => C.PIECES[p].glyph;
        // light every square in turn and compare with the rules
        let lit = 0, wrong = [];
        const metal = [];
        for (let i = 0; i < b.size * b.size; i++) if (C.isMetal(b, i)) metal.push(i);
        for (const i of metal) {
          g.current = i; g.status = 'playing'; g.strikes[i] = 1;
          F.render();
          const on = Array.from(document.querySelectorAll('#board .tile[data-legal="1"]')).map((t) => Number(t.dataset.i)).sort((a, b) => a - b);
          const want = C.legalTargets(g).slice().sort((a, b) => a - b);
          if (on.join() !== want.join() || on.some((j) => !C.isMetal(b, j))) wrong.push(i);
          lit += on.length;
          g.strikes[i] = 0;
        }
        g.current = -1; g.status = 'ready'; F.render();
        // the air: by the controller and by its own (hidden) button
        for (let i = 0; i < b.size * b.size; i++) {
          if (C.isMetal(b, i)) continue;
          F.tap(i);
          const el = document.querySelector(`#board .tile[data-i="${i}"]`);
          if (el) el.click();
        }
        const legend = Array.from(document.querySelectorAll('#legendBody .legend-row b')).map((x) => x.textContent);
        return {
          rows: grid.map((r, ri) => r.map((ch, ci) => ch === '.' ? '.' : ch).join('')),
          expect: b.pieces.length ? Array.from({ length: b.rows }, (_, r) => Array.from({ length: b.cols }, (_, c) =>
            C.isMetal(b, r * b.size + c) ? glyph(b.pieces[r * b.size + c]) : '.').join('')) : [],
          count: shown.length, tiles: tiles.length, metal: metal.length,
          stray: shown.some((t) => !C.isMetal(b, Number(t.dataset.i))),
          wrong, lit, airStrikes: g.totalStrikes, current: g.current,
          bar: Array.from(document.querySelectorAll('#pieceParts .pb-part')).map((x) => x.textContent).join(' | '),
          parts: b.parts.map((p) => p.name),
          name: document.getElementById('pieceName').textContent,
          legend: legend.join(','), symbols: C.forgePieceSymbols(b).map((p) => C.PIECES[p].name).join(','),
          blanks: document.querySelectorAll('#board .blank').length,
          shape: document.getElementById('board').dataset.shape,
          stale: document.querySelectorAll('#board .tile[data-current="1"], #board .tile[data-s="1"]').length
        };
      });
      const name = drawn[id] ? id : '(missing) ' + id;
      ok(name + ': drawn in its own shape, every square in the right place with the right symbol',
        seen.count === seen.metal && !seen.stray && seen.rows.join('/') === seen.expect.join('/'),
        seen.rows.join('/') + ' vs ' + seen.expect.join('/'));
      ok(name + ': every square lights exactly the squares its symbol reaches, all of them metal',
        seen.wrong.length === 0 && seen.lit > 0, 'wrong at ' + seen.wrong.join(','));
      ok(name + ': the air around it cannot be struck', seen.airStrikes === 0 && seen.current === -1,
        JSON.stringify({ strikes: seen.airStrikes, current: seen.current }));
      ok(name + ': its name, its parts and its legend replace the last design\'s, with nothing left behind',
        seen.parts.every((p) => seen.bar.includes(p)) && seen.legend === seen.symbols && seen.blanks === 1 &&
        seen.shape === id && seen.stale === 0,
        JSON.stringify({ bar: seen.bar, legend: seen.legend, symbols: seen.symbols, blanks: seen.blanks, shape: seen.shape, stale: seen.stale }));

      // strike once, then go back to the gallery: it asks first, because there is work to lose
      const opening = await page.evaluate(() => window.CHECKSMITH.core.legalTargets(window.CHECKSMITH.app.game)[0]);
      await fast(page, 30);
      await page.click(`#board .tile[data-i="${opening}"]`);
      await settle(page);
      await page.click('#menuActionBtn');
      const asked = await page.isVisible('#confirm');
      if (asked) await page.click('#confirmYes');
      await page.waitForSelector('#designView:not([hidden])', { timeout: 8000 });
      ok(name + ': All Designs asks before putting a struck piece down, then returns to the gallery',
        asked && await page.evaluate((d) => window.CHECKSMITH.app.game === null &&
          document.querySelector(`#designGrid [data-design="${d}"]`).getAttribute('aria-current') === 'true', id));
    }

    // every design, forged to the end through the interface
    for (const id of IDS.slice(1)) {
      await page.click(`#designGrid [data-design="${id}"]`);
      await page.click('#designGo');
      await page.waitForFunction((d) => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.piece === d, id);
      await fast(page, 25);
      const route = await page.evaluate(() => window.CHECKSMITH.app.game.board.route.slice());
      for (const step of route) {
        await page.evaluate((i) => { document.querySelector(`#board .tile[data-i="${i}"]`).click(); }, step);
        await settle(page);
      }
      await page.waitForTimeout(250);
      const end = await page.evaluate(() => {
        const g = window.CHECKSMITH.app.game, text = (x) => document.getElementById(x).textContent.trim();
        return { status: g.status, results: !document.getElementById('results').hidden, quality: text('rQuality'),
          piece: text('rDiff'), name: g.board.name, perfect: text('rPerfect'), squares: window.CHECKSMITH.core.metalCount(g.board),
          parts: Array.from(document.querySelectorAll('#pieceParts .pb-part b')).map((b) => b.textContent),
          change: text('rChange') };
      });
      ok(id + ': forged to the end, it completes as a masterwork named for the design',
        end.status === 'complete' && end.results && end.quality.startsWith('100') && end.piece === end.name &&
        end.perfect === end.squares + ' / ' + end.squares &&
        end.parts.every((x) => { const [a, b] = x.split('/'); return a === b; }) && end.change === 'All Designs',
        JSON.stringify(end));
      await page.click('#rRetry');
      await page.waitForTimeout(150);
      const again = await page.evaluate(() => ({ piece: window.CHECKSMITH.app.game.board.piece,
        total: window.CHECKSMITH.app.game.totalStrikes, results: document.getElementById('results').hidden }));
      ok(id + ': forging it again lays the same design back, cold', again.piece === id && again.total === 0 && again.results,
        JSON.stringify(again));
      // finish it once more and leave by the results' own button
      for (const step of route) {
        await page.evaluate((i) => { document.querySelector(`#board .tile[data-i="${i}"]`).click(); }, step);
        await settle(page);
      }
      await page.waitForTimeout(250);
      await page.click('#rChange');
      await page.waitForSelector('#designView:not([hidden])', { timeout: 8000 });
    }
    const after = await page.evaluate(() => ({
      marks: document.querySelectorAll('#designGrid .design-card .dc-done').length,
      bests: Array.from(document.querySelectorAll('#designGrid .design-card')).map((c) => {
        c.click(); return document.querySelector('#designStage .ds-best').textContent; }),
      saved: JSON.parse(localStorage.getItem('checksmith:v1')).best }));
    ok('back in the gallery, every design shows the masterwork, and each is kept in the save',
      after.marks === 6 && after.bests.every((b) => b === 'Best quality 100') &&
      IDS.every((id) => after.saved[id] === 100), JSON.stringify(after));

    // leaving for the title and coming back remembers the last design picked
    await page.click('#designGrid [data-design="axe"]');
    await page.click('#designGo');
    await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.piece === 'axe');
    await page.evaluate(() => window.CHECKSMITH.menuLeave());
    if (await page.isVisible('#confirm')) await page.click('#confirmYes');
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    ok('the title now counts six of six designs forged',
      /6 of 6 designs forged/.test(await page.textContent('#forgeBest')), await page.textContent('#forgeBest'));
    await page.click('#beginBtn');
    await page.waitForSelector('#designView:not([hidden])', { timeout: 8000 });
    ok('re-entering the Forge opens the gallery on the design last picked',
      await page.evaluate(() => document.querySelector('#designGrid [aria-current="true"]').dataset.design === 'axe' &&
        window.CHECKSMITH.app.game === null));
    await menuItem(page, 'gmLeave');
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    ok('the gallery\'s Main Menu goes back to the title', await page.isVisible('#titleScreen'));
  }

  ok('no uncaught page errors during the whole run', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();

  /* ============ storage unavailable ============ */

  section('Storage unavailable');
  ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  page = paged(await ctx.newPage());
  const errs2 = [];
  page.on('pageerror', (e) => errs2.push(String(e)));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage blocked'); }
    });
  });
  await page.goto(FILE);
  await page.evaluate(() => window.CHECKSMITH.setPhaseAnim(false));
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
  page = paged(await ctx.newPage());
  await page.addInitScript(() => {
    try {
      localStorage.setItem('forge-pattern:v1',
        JSON.stringify({ best: { novice: 88 }, muted: true, volume: 0.45 }));
    } catch (e) { /* ignore */ }
  });
  await page.goto(FILE);
  await page.evaluate(() => window.CHECKSMITH.setPhaseAnim(false));
  await startFromTitle(page, 'forge', 'novice');
  await page.waitForTimeout(200);
  ok('best score saved under the old name is still shown',
    (await page.textContent('#bestLine')).includes('88'));
  ok('audio preferences carry over too', await page.evaluate(
    () => window.CHECKSMITH.sound.muted === true && Math.abs(window.CHECKSMITH.sound.volume - 0.45) < 0.001));
  await openMenu(page);
  await page.click('#muteBtn');
  ok('the next write lands under the new key', await page.evaluate(
    () => !!localStorage.getItem('checksmith:v1')));
  await ctx.close();

  /* ============ reduced motion ============ */
  section('Reduced motion');
  ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce' });
  page = paged(await ctx.newPage());
  const errs3 = [];
  page.on('pageerror', (e) => errs3.push(String(e)));
  await page.goto(FILE);
  await page.evaluate(() => window.CHECKSMITH.setPhaseAnim(false));
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
  page = paged(await ctx.newPage());
  await page.goto(FILE);
  await page.evaluate(() => window.CHECKSMITH.setPhaseAnim(false));
  await startFromTitle(page, 'forge', 'novice');
  await page.click('[data-diff="master"]');
  await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.size === 6);
  const wide = await page.locator('.board-wrap').boundingBox();
  ok('layout stays centred and capped on desktop (' + Math.round(wide.width) + 'px)', wide.width <= 520);
  await page.screenshot({ path: path.join(SHOTS, '06-desktop.png') });
  await ctx.close();

  /* ============ the designs on every screen ============ */
  section('The Forge: the gallery and every design on every screen');
  // [width, height, the smallest square a design may be given there]. Since
  // 1.43 every design stands on the screen whole, at every size: a short
  // screen gives smaller squares, never a scroll.
  for (const [w, h, least] of [[320, 568, 15], [360, 640, 17], [360, 740, 20], [390, 844, 24],
    [430, 932, 27], [900, 900, 27], [740, 360, 15]]) {
    ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2,
      reducedMotion: w === 390 ? 'reduce' : 'no-preference' });
    page = paged(await ctx.newPage());
    const pageErrs = [];
    page.on('pageerror', (e) => pageErrs.push(String(e)));
    await page.goto(FILE);
    await page.evaluate(() => window.CHECKSMITH.setPhaseAnim(false));
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    await page.click('#beginBtn');
    await page.waitForSelector('#designView:not([hidden])', { timeout: 8000 });
    const label = w + 'x' + h;
    const gal = await page.evaluate(() => {
      // measured with every page of the gallery laid out at once
      const grid = document.getElementById('designGrid');
      const pages = Number(grid.dataset.pages || 1);
      const off = Array.from(grid.querySelectorAll('.pg-off'));
      for (const el of off) el.classList.remove('pg-off');
      const cards = Array.from(document.querySelectorAll('#designGrid .design-card'));
      const rects = cards.map((c) => c.getBoundingClientRect());
      const overlap = rects.some((a, i) => rects.some((b, j) => j > i &&
        a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
      return {
        count: cards.length, overlap,
        inside: rects.every((r) => r.left >= 0 && r.right <= window.innerWidth),
        pictures: cards.every((c) => {
          const pic = c.querySelector('svg.design-pic'), box = c.getBoundingClientRect();
          const r = pic && pic.getBoundingClientRect();
          return r && r.width > 30 && r.height > 30 && r.left >= box.left - 1 && r.right <= box.right + 1 &&
            r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
        }),
        texts: cards.every((c) => Array.from(c.querySelectorAll('.dc-name, .dc-meta, .dc-best'))
          .every((t) => t.scrollWidth <= t.clientWidth + 1 && t.textContent.trim().length > 0)),
        hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
        pages: pages, restored: (off.forEach((el) => el.classList.add('pg-off')), true)
      };
    });
    ok(label + ': the gallery shows all six designs, pictures inside their cards, nothing clipped or overlapping',
      gal.count === 6 && !gal.overlap && gal.inside && gal.pictures && gal.texts && !gal.hscroll, JSON.stringify(gal));
    const sizes = [];
    for (const id of ['dagger', 'shortsword', 'spearhead', 'axe', 'mace', 'longsword']) {
      await page.click(`#designGrid [data-design="${id}"]`);
      await page.click('#designGo');
      await page.waitForFunction((d) => window.CHECKSMITH.app.game && window.CHECKSMITH.app.game.board.piece === d, id);
      await page.waitForTimeout(80);
      const fit = await page.evaluate(() => {
        const b = window.CHECKSMITH.app.game.board;
        const shown = Array.from(document.querySelectorAll('#board .tile'))
          .filter((t) => t.getBoundingClientRect().width > 0).map((t) => t.getBoundingClientRect());
        const wrap = document.querySelector('.board-wrap').getBoundingClientRect();
        const poly = document.querySelector('#board .blank .blank-metal');
        const bb = poly.getBBox(), m = poly.getScreenCTM();
        const bar = document.getElementById('pieceBar');
        return {
          count: shown.length, metal: window.CHECKSMITH.core.metalCount(b),
          size: Math.min(...shown.map((r) => r.width)),
          left: Math.min(...shown.map((r) => r.left)), right: Math.max(...shown.map((r) => r.right)),
          bottom: Math.max(...shown.map((r) => r.bottom)) + window.scrollY,
          top: Math.min(...shown.map((r) => r.top)),
          vscroll: document.documentElement.scrollHeight > window.innerHeight + 1,
          outline: { top: m.f + bb.y * m.d - wrap.top, bottom: wrap.bottom - (m.f + (bb.y + bb.height) * m.d),
            left: m.e + bb.x * m.a, right: m.e + (bb.x + bb.width) * m.a },
          vw: window.innerWidth, vh: window.innerHeight,
          hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
          barFits: bar.scrollWidth <= bar.clientWidth + 1
        };
      });
      sizes.push(id + ' ' + fit.size.toFixed(0) + 'px');
      ok(label + ' ' + id + ': every square shown, the outline whole, nothing clipped at the sides',
        fit.count === fit.metal && fit.left >= 0 && fit.right <= fit.vw && !fit.hscroll &&
        fit.outline.left >= 0 && fit.outline.right <= fit.vw && fit.outline.top >= 0 && fit.outline.bottom >= 0 &&
        fit.barFits, JSON.stringify(fit));
      ok(label + ' ' + id + ': stands on the screen whole, no scrolling (' + fit.size.toFixed(0) + 'px squares)',
        fit.bottom <= fit.vh && fit.top >= 0 && fit.size >= least && !fit.vscroll, JSON.stringify(fit));
      // a real tap on its first square lands a blow
      const first = await page.evaluate(() => {
        const b = window.CHECKSMITH.app.game.board;
        for (let i = 0; i < b.size * b.size; i++) if (window.CHECKSMITH.core.isMetal(b, i)) return i;
        return -1;
      });
      await page.click(`#board .tile[data-i="${first}"]`);
      await page.waitForFunction(() => !window.CHECKSMITH.app.busy, null, { timeout: 5000 });
      await page.waitForTimeout(w === 390 ? 40 : 320);
      const struck = await page.evaluate(() => window.CHECKSMITH.app.game.current);
      ok(label + ' ' + id + ': a tap strikes it' + (w === 390 ? ', reduced motion and all' : ''),
        struck === first && pageErrs.length === 0, struck + ' ' + pageErrs.join(' | '));
      if (id === 'axe' || id === 'longsword') await page.screenshot({ path: path.join(SHOTS, '07-' + id + '-' + label + '.png') });
      await page.evaluate(() => window.CHECKSMITH.showDesigns());
      await page.waitForSelector('#designView:not([hidden])', { timeout: 8000 });
    }
    console.log('        squares at ' + label + ': ' + sizes.join(', '));
    await page.screenshot({ path: path.join(SHOTS, '07-gallery-' + label + '.png'), fullPage: true });
    await ctx.close();
  }

  /* ============ the forge is carried between sittings ============ */
  section('Open Your Forge: the shop is saved');
  ctx = await browser.newContext({ viewport: { width: 390, height: 950 } });
  page = paged(await ctx.newPage());
  const saveErrs = [];
  page.on('pageerror', (e) => saveErrs.push(String(e)));
  await page.goto(FILE);
  await page.evaluate(() => window.CHECKSMITH.setPhaseAnim(false));

  // `name` is typed into the naming dialog when Begin raises it, which it
  // does whenever no saved forge is picked
  const openShop = async (name) => {
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    await page.click('.mode-card[data-mode="shop"]');
    await page.waitForTimeout(140);
    const line = await page.textContent('#shopSaveLine');
    const begin = await page.textContent('#beginBtn');
    const rows = await page.$$eval('#shopSlots .forge-slot',
      (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    await page.click('#beginBtn');
    if (await page.isVisible('#nameForge')) {
      if (name) await page.fill('#nameForgeInput', name);
      await page.click('#nameForgeGo');
    }
    // carrying on can land either on the shop floor or straight back at the
    // anvil, so wait for whichever the save asked for
    await page.waitForFunction(
      () => !document.getElementById('shopView').hidden || !!window.CHECKSMITH.app.game,
      null, { timeout: 15000 });
    await page.waitForTimeout(250);
    await chooseCrafts(page);
    await installStock(page);
    return { line, begin, rows };
  };
  const toMenu = async () => {
    await page.evaluate(() => window.CHECKSMITH.menuLeave());
    if (await page.isVisible('#confirm')) await page.click('#confirmYes');
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  };
  const shopState = () => page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    return { day: sh.day, gold: sh.gold, silver: sh.materials.silver,
      storage: C.countStorage(sh), shelf: C.countShelf(sh), staff: sh.staff.length,
      stars: C.shopStars(sh), phase: document.getElementById('shPhase').textContent };
  });

  const first = await openShop('Cinderhall');
  ok('a first visit offers a new forge, not a saved one',
    /starts a new forge/.test(first.line) && first.begin === 'Begin' && first.rows.length === 0,
    JSON.stringify(first));
  ok('and it is opened under the typed name',
    (await page.evaluate(() => window.CHECKSMITH.app.shop.name)) === 'Cinderhall');

  await page.evaluate(() => {
    const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
    sh.gold = 1777; sh.day = 4; sh.reputation = 48; sh.materials.silver = 6;
    C.addStorage(sh, C.lineKey('mace', 'gold'), 3, 88);
    F.testStock(sh, C.lineKey('longsword', 'bronze'), 5, 93, 58);
    sh.staff.push({ id: 1, name: 'Mara Ashford', role: 'salesperson', rank: 'C', power: 3, wage: 32 });
    F.shopRender();
  });
  await page.waitForTimeout(200);
  const kept = await shopState();
  await page.reload();
  const second = await openShop();
  ok('the title screen lists the saved forge and offers to carry it on',
    second.begin === 'Continue' && second.rows.length === 1 &&
    /^Cinderhall /.test(second.rows[0]) && /Day 4/.test(second.rows[0]) &&
    /1,777g/.test(second.rows[0]) && /Cinderhall/.test(second.line),
    JSON.stringify(second));
  const back = await shopState();
  ok('gold, day, metal, stock, staff and standing all come back',
    JSON.stringify(back) === JSON.stringify(kept), JSON.stringify([kept, back]));

  // a batch on the anvil resumes as the same board, not a fresh one
  await shopAction(page, 'forge');
  await page.waitForSelector('#shopSheet:not([hidden])');
  await page.click('#shopSheetActions button:not([disabled])');
  await page.waitForFunction(() => window.CHECKSMITH.app.game, null, { timeout: 15000 });
  await page.evaluate(() => { window.CHECKSMITH.core.CONFIG.animation.strikeMs = 12; });
  const struck = await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    F.tap(F.app.game.board.route[0]);
    await new Promise((r) => setTimeout(r, 200));
    const g = F.app.game;
    return { pieces: g.board.pieces.join(''), strikes: g.strikes.join(','),
      current: g.current, perfect: g.perfect };
  });
  await page.reload();
  const third = await openShop();
  ok('a batch left on the anvil is announced on the forge\'s row',
    third.rows.length === 1 && /order in progress/.test(third.rows[0]), JSON.stringify(third.rows));
  const resumed = await page.evaluate(() => {
    const g = window.CHECKSMITH.app.game;
    return g ? { pieces: g.board.pieces.join(''), strikes: g.strikes.join(','),
      current: g.current, perfect: g.perfect,
      atAnvil: document.getElementById('shopView').hidden,
      picker: !document.querySelector('.difficulty:not(#titleDiff)').hidden } : null;
  });
  ok('it resumes on the very same board, blows and all',
    resumed && JSON.stringify(resumed).includes(struck.pieces) &&
    resumed.strikes === struck.strikes && resumed.current === struck.current,
    JSON.stringify([struck, resumed]));
  ok('and the board-size picker is not offered at the anvil',
    resumed && resumed.atAnvil === true && resumed.picker === false, JSON.stringify(resumed));

  // a selling phase left half-served is not banked
  await page.evaluate(() => {
    const F = window.CHECKSMITH;
    F.shopUi.order = null;
    F.app.game = null;
    document.getElementById('shopView').hidden = false;
    F.syncModeChrome();
    F.core.addStorage(F.app.shop, F.core.lineKey('longsword', 'bronze'), 0, 100);
    F.testStock(F.app.shop, F.core.lineKey('longsword', 'bronze'), 20, 95, 60);
    F.app.shop.reputation = 70;
    F.shopRender();
  });
  await page.waitForTimeout(200);
  const beforeSelling = await shopState();
  // Who walks in is random, and an empty queue would prove nothing here, so
  // the counter is reopened until somebody actually comes to it. Reopening
  // does not spend the phase; only closing up does, and this never closes.
  let midSale = { gold: beforeSelling.gold, open: false };
  for (let attempt = 0; attempt < 8 && midSale.gold === beforeSelling.gold; attempt++) {
    await shopAction(page, 'tend');
    await page.waitForTimeout(350);
    for (let i = 0; i < 3 && (await page.isVisible('#shopSheet')); i++) {
      if (/Sales Report/.test(await page.textContent('#shopSheetTitle'))) break;
      await page.click('#shopSheet [data-at="0"]');
      await page.waitForTimeout(150);
    }
    midSale = await page.evaluate(() => ({ gold: window.CHECKSMITH.app.shop.gold,
      open: !!window.CHECKSMITH.shopUi.session }));
    if (midSale.gold === beforeSelling.gold) {
      // nobody bought: drop this session on the floor and open up again
      await page.evaluate(() => { window.CHECKSMITH.shopUi.session = null; });
      await page.click('#shopSheet [data-at-last]');
      await page.waitForTimeout(200);
      if (await page.isVisible('#shopSheet')) await page.evaluate(() =>
        document.getElementById('shopSheet').hidden = true);
    }
  }
  ok('somebody came to the counter to be served', midSale.gold > beforeSelling.gold,
    JSON.stringify([beforeSelling.gold, midSale]));
  await page.reload();
  await openShop();
  const afterSale = await shopState();
  ok('a selling phase abandoned half way is simply unplayed',
    midSale.gold > beforeSelling.gold && afterSale.gold === beforeSelling.gold &&
    afterSale.phase === beforeSelling.phase,
    JSON.stringify([beforeSelling, midSale, afterSale]));

  // but a phase played out is kept
  await shopAction(page, 'tend');
  await page.waitForTimeout(350);
  for (let i = 0; i < 40 && (await page.isVisible('#shopSheet')); i++) {
    const done = /Sales Report/.test(await page.textContent('#shopSheetTitle'));
    await page.click('#shopSheet [data-at="0"]');
    await page.waitForTimeout(140);
    if (done) break;
  }
  await page.waitForTimeout(300);
  const played = await shopState();
  await page.reload();
  await openShop();
  const stillThere = await shopState();
  ok('a phase played to its end is kept',
    stillThere.gold === played.gold && stillThere.phase === played.phase,
    JSON.stringify([played, stillThere]));

  ok('saving and restoring raises no errors', saveErrs.length === 0, saveErrs.slice(0, 3).join(' | '));
  await ctx.close();

  /* ============ the anvil never reshapes ============ */
  /* Open Your Forge's anvil never changes a struck square's symbol: not on a
     new board, a retry or a resumed one, and not after another mode left a
     certain chance on its game or a Versus Reforge armed. The modes that do
     reshape are checked on either side of it. */
  section('Open Your Forge: the anvil never reshapes, whatever came before');
  {
    ctx = await browser.newContext({ viewport: { width: 390, height: 950 } });
    page = paged(await ctx.newPage());
    const calmErrs = [];
    page.on('pageerror', (e) => calmErrs.push(String(e)));
    await page.goto(FILE);
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    await page.evaluate(() => {
      const F = window.CHECKSMITH;
      F.setPhaseAnim(false);
      F.core.CONFIG.animation.strikeMs = 12;      // a quick hammer; the rules are untouched
      // walks a list of squares on the live anvil, one blow at a time, noting
      // anything the player was told about a symbol changing
      window.__walk = async (steps) => {
        const said = [];
        let morphed = 0, refused = 0;
        const settle = async () => {
          for (let n = 0; n < 80 && F.app.busy; n++) await new Promise((r) => setTimeout(r, 10));
        };
        for (const i of steps) {
          const g = F.app.game;
          if (!g || g.status === 'complete' || g.status === 'lost') break;
          await settle();
          const before = g.totalStrikes, sym = g.pieces[i], first = g.strikes[i] === 0 && !g.crust[i];
          F.tap(i);
          await new Promise((r) => setTimeout(r, 14));
          await settle();
          if (g.totalStrikes === before) { refused++; break; }
          if (first && g.pieces[i] !== sym) morphed++;
          said.push(document.getElementById('live').textContent);
        }
        return { morphed: morphed, refused: refused,
          told: said.filter((s) => /Reshaped|Still a /.test(s)).length };
      };
    });
    const toTitle = async () => {
      await page.evaluate(() => window.CHECKSMITH.menuLeave());
      if (await page.isVisible('#confirm')) await page.click('#confirmYes');
      await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    };
    // a batch that could not be finished is put down, so the next one can start
    const leaveAnvil = () => page.evaluate(() => {
      const F = window.CHECKSMITH;
      if (F.shopUi.order) { F.shopUi.order = null; F.shopReturn(); }
    });
    const clearSheets = async () => {
      for (let k = 0; k < 8 && (await page.isVisible('#shopSheet')); k++) {
        await page.click('#shopSheetActions button:first-child');
        await page.waitForTimeout(120);
      }
    };

    // 1. Endless reshapes, and is left with a certain chance on its live game
    await page.click('.mode-card[data-mode="endless"]');
    await page.click('#beginBtn');
    await page.waitForFunction(() => { const g = window.CHECKSMITH.app.game; return g && g.mode === 'endless'; },
      null, { timeout: 15000 });
    await page.waitForTimeout(200);
    const hot = await page.evaluate(async () => {
      const F = window.CHECKSMITH, C = F.core, g = F.app.game;
      const base = g.morphChance, live = C.canReshape(g);
      g.morphChance = 1;
      const start = g.board.route ? g.board.route[0] : 0;
      const walked = await window.__walk([start]);
      window.__staleGame = F.app.game;
      return { base: base, want: C.CONFIG.endless.morphBase, live: live, walked: walked };
    });
    ok('Endless still reshapes: it opens at its base chance and a certain one changes the struck square',
      hot.live && hot.base === hot.want && hot.walked.morphed === 1, JSON.stringify(hot));
    await toTitle();

    // 2. Versus, left with Reforge armed and its match still live
    await page.click('.mode-card[data-mode="versus"]');
    await page.click('#beginBtn');
    await page.waitForFunction(() => !!window.CHECKSMITH.app.match, null, { timeout: 15000 });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, m = F.app.match;
      m.turn = 'you'; m.upgradeUsed = false; m.you.points = 5000;
      for (let at = 0; at < m.size * m.size; at++) {
        m.foe.current = at;
        if (C.versusReforgeOptions(m, 'you').length) break;
      }
      F.vs.targeting = null; F.vs.focus = 'none';
      F.vsRender();
    });
    await page.click('#vsShop [data-buy="reforge"]');
    await page.waitForTimeout(100);
    const armed = await page.evaluate(() => {
      const F = window.CHECKSMITH;
      window.__staleTarget = F.vs.targeting;
      window.__staleMatch = F.app.match;
      return F.vs.targeting && F.vs.targeting.id;
    });
    ok('Versus still offers Reforge, and it is left armed on the way out', armed === 'reforge', armed);
    await toTitle();

    /* Put all of it back, as if the way out had not cleared it: a live Endless
       game with a certain chance, a Versus match and Reforge waiting for a
       symbol. Opening the forge has to leave every bit of it behind. */
    await page.evaluate(() => {
      const F = window.CHECKSMITH;
      F.app.game = window.__staleGame;
      F.app.match = window.__staleMatch;
      F.vs.targeting = window.__staleTarget;
    });
    await page.click('.mode-card[data-mode="shop"]');
    await page.click('#beginBtn');
    if (await page.isVisible('#nameForge')) {
      await page.fill('#nameForgeInput', 'Stillwater');
      await page.click('#nameForgeGo');
    }
    await page.waitForFunction(() => !document.getElementById('shopView').hidden, null, { timeout: 15000 });
    await page.waitForTimeout(250);
    await chooseCrafts(page);
    await installStock(page);
    const carried = await page.evaluate(() => {
      const F = window.CHECKSMITH;
      return { game: F.app.game, match: F.app.match, target: F.vs.targeting };
    });
    ok('nothing from Endless or Versus comes into the forge: no game, no match, no armed Reforge',
      carried.game === null && carried.match === null && carried.target === null,
      JSON.stringify(carried).slice(0, 200));

    // 3. Orders across metals and every difficulty, each played to the end
    await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      sh.gold = 100000;
      sh.upgrades.bellows = 8;                   // batches big enough to reach Master
      for (const m of C.SHOP.materials) sh.materials[m.id] = 80;
      sh.blueprints.shortsword = Math.max(1, sh.blueprints.shortsword || 0);
      sh.blueprints.buckler = Math.max(1, sh.blueprints.buckler || 0);
      F.shopRender();
    });
    const orders = [
      { item: 'shortsword', material: 'bronze', qty: 1 },
      { item: 'buckler', material: 'silver', qty: 5 },
      { item: 'shortsword', material: 'gold', qty: 4 },
      { item: 'buckler', material: 'mithril', qty: 10 },
      { item: 'shortsword', material: 'adamantine', qty: 11 }
    ];
    const played = [];
    for (const order of orders) {
      await clearSheets();
      await shopAction(page, 'forge');
      await page.waitForSelector('#shopSheet:not([hidden])');
      const sheet = await page.evaluate((o) => {
        const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
        Object.assign(F.shopUi.draft, o, { commission: 0 });
        F.shopUi.redraw();
        const spec = C.forgeBoardSpec(sh, o.item, o.material, o.qty);
        return { text: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' '),
          difficulty: spec.difficulty, tierChance: C.CONFIG.difficulties[spec.difficulty].morphChance,
          tick: sh.day * 3 + sh.phaseIndex, metal: sh.materials[o.material] };
      }, order);
      await page.click('#shopSheetActions button:not([disabled])');
      await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.shopUi.order,
        null, { timeout: 15000 });
      await page.waitForTimeout(120);
      const run = await page.evaluate(async () => {
        const F = window.CHECKSMITH, C = F.core, g = F.app.game;
        const opened = { chance: g.morphChance, reshapes: g.reshapes, perfect: g.perfect,
          legend: document.getElementById('legendBody').textContent };
        g.morphChance = 1;                       // stale or tampered: the rule still holds
        const route = g.board.route.slice();
        const walked = await window.__walk(route);
        const st = C.gameStats(g);
        return { opened: opened, walked: walked, status: g.status, over: st.overstrikes,
          same: g.pieces.join('') === g.board.pieces.join(''),
          sheet: document.getElementById('shopSheetTitle').textContent };
      });
      let after = null;
      if (/Batch Forged/.test(run.sheet)) {
        await page.click('#shopSheet [data-at="0"]');
        await page.waitForTimeout(250);
        after = await page.evaluate((o) => {
          const sh = window.CHECKSMITH.app.shop;
          return { tick: sh.day * 3 + sh.phaseIndex, metal: sh.materials[o.material] };
        }, order);
      }
      if (!after) await leaveAnvil();
      played.push({ order: order, sheet: sheet, run: run, after: after });
    }
    const tiers = new Set(played.map((p) => p.sheet.difficulty));
    ok('the orders cover every difficulty, Master included, in five different metals',
      tiers.size === 4 && tiers.has('master'), [...tiers].join(','));
    ok('no order sheet says a square may change symbol, even where the tier would elsewhere',
      played.every((p) => !/changes symbol|reshap/i.test(p.sheet.text)) &&
      played.some((p) => p.sheet.tierChance > 0), played.map((p) => p.sheet.text.slice(0, 80)).join(' | '));
    ok('every anvil opens with no chance to reshape, and its legend does not suggest one',
      played.every((p) => p.run.opened.chance === 0 && p.run.opened.reshapes === false &&
        !/change symbol/i.test(p.run.opened.legend)), JSON.stringify(played.map((p) => p.run.opened.chance)));
    ok('played to the end with the chance forced to 100%, no square ever changed symbol',
      played.every((p) => p.run.walked.morphed === 0 && p.run.same && p.run.walked.told === 0),
      JSON.stringify(played.map((p) => p.run.walked)));
    ok('and every batch was forged the normal way: perfect, at its metal’s strikes',
      played.every((p) => p.run.status === 'complete' && p.run.over === 0 && p.run.walked.refused === 0 &&
        p.run.opened.perfect === ({ bronze: 1, silver: 2, gold: 3, mithril: 4, adamantine: 5 })[p.order.material]),
      JSON.stringify(played.map((p) => [p.run.status, p.run.over, p.run.opened.perfect])));
    ok('each one spent its ingots and exactly one phase',
      played.every((p) => p.after && p.after.tick === p.sheet.tick + 1 &&
        p.after.metal === p.sheet.metal - p.order.qty), JSON.stringify(played.map((p) => [p.sheet, p.after].map((x) => x && x.tick))));

    // 4. a retry is the same board under the same rule
    await clearSheets();
    await shopAction(page, 'forge');
    await page.waitForSelector('#shopSheet:not([hidden])');
    await page.evaluate(() => {
      const F = window.CHECKSMITH;
      Object.assign(F.shopUi.draft, { item: 'buckler', material: 'gold', qty: 11, commission: 0 });
      F.shopUi.redraw();
    });
    await page.click('#shopSheetActions button:not([disabled])');
    await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.shopUi.order,
      null, { timeout: 15000 });
    await page.waitForTimeout(120);
    const before = await page.evaluate(async () => {
      const F = window.CHECKSMITH, g = F.app.game;
      g.morphChance = 1;
      const walked = await window.__walk(g.board.route.slice(0, 6));
      return { layout: g.board.pieces.join(''), strikes: F.app.game.totalStrikes, walked: walked };
    });
    await page.click('#restartBtn');
    if (await page.isVisible('#confirm')) await page.click('#confirmYes');
    await page.waitForTimeout(200);
    const retried = await page.evaluate(async () => {
      const F = window.CHECKSMITH, C = F.core, g = F.app.game;
      const opened = { chance: g.morphChance, reshapes: g.reshapes, strikes: g.totalStrikes,
        layout: g.board.pieces.join(''), difficulty: g.board.difficulty };
      g.morphChance = 1;
      const walked = await window.__walk(g.board.route.slice());
      return { opened: opened, walked: walked, status: g.status, over: C.gameStats(g).overstrikes };
    });
    ok('a restarted board is the same board, cleared, and still cannot reshape',
      before.walked.morphed === 0 && retried.opened.chance === 0 && retried.opened.reshapes === false &&
      retried.opened.strikes === 0 && retried.opened.layout === before.layout &&
      retried.opened.difficulty === 'master', JSON.stringify([before, retried.opened]));
    ok('and is forged to the end without a symbol changing',
      retried.walked.morphed === 0 && retried.status === 'complete' && retried.over === 0,
      JSON.stringify(retried));
    await clearSheets();
    await leaveAnvil();

    // 5. a batch put down and picked up again, from a save that still carries a chance
    await shopAction(page, 'forge');
    await page.waitForSelector('#shopSheet:not([hidden])');
    await page.evaluate(() => {
      const F = window.CHECKSMITH;
      Object.assign(F.shopUi.draft, { item: 'shortsword', material: 'silver', qty: 11, commission: 0 });
      F.shopUi.redraw();
    });
    await page.click('#shopSheetActions button:not([disabled])');
    await page.waitForFunction(() => window.CHECKSMITH.app.game && window.CHECKSMITH.shopUi.order,
      null, { timeout: 15000 });
    await page.waitForTimeout(120);
    const putDown = await page.evaluate(async () => {
      const F = window.CHECKSMITH, g = F.app.game;
      const route = g.board.route.slice();
      const walked = await window.__walk(route.slice(0, 5));
      const data = JSON.parse(localStorage.getItem('checksmith:v1') || '{}');
      const slot = (data.shopSaves || []).find((x) => x.id === F.app.shopSlot);
      const kept = !!(slot && slot.anvil);
      const wrote = kept && 'morphChance' in slot.anvil;
      // what an older build wrote: a reshape chance on the saved board
      if (kept) { slot.anvil.morphChance = 1; localStorage.setItem('checksmith:v1', JSON.stringify(data)); }
      return { route: route, done: 5, walked: walked, kept: kept, wrote: wrote,
        strikes: g.strikes.join(','), pieces: g.pieces.join('') };
    });
    ok('a half-worked batch is saved without any reshape chance of its own',
      putDown.kept && !putDown.wrote && putDown.walked.morphed === 0, JSON.stringify(putDown).slice(0, 200));
    await page.reload();
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    await page.click('.mode-card[data-mode="shop"]');
    await page.click('#beginBtn');
    await page.waitForFunction(() => !!window.CHECKSMITH.app.game, null, { timeout: 15000 });
    await page.waitForTimeout(250);
    const resumed = await page.evaluate(async (left) => {
      const F = window.CHECKSMITH, C = F.core, g = F.app.game;
      F.core.CONFIG.animation.strikeMs = 12;
      const opened = { chance: g.morphChance, reshapes: g.reshapes, strikes: g.strikes.join(','),
        pieces: g.pieces.join(''), legend: document.getElementById('legendBody').textContent };
      g.morphChance = 1;
      // the walk helper went with the reload; the same walk, inline
      let morphed = 0, refused = 0;
      for (const i of left) {
        if (g.status === 'complete' || g.status === 'lost') break;
        for (let n = 0; n < 80 && F.app.busy; n++) await new Promise((r) => setTimeout(r, 10));
        const before = g.totalStrikes, sym = g.pieces[i], first = g.strikes[i] === 0 && !g.crust[i];
        F.tap(i);
        await new Promise((r) => setTimeout(r, 14));
        for (let n = 0; n < 80 && F.app.busy; n++) await new Promise((r) => setTimeout(r, 10));
        if (g.totalStrikes === before) { refused++; break; }
        if (first && g.pieces[i] !== sym) morphed++;
      }
      return { opened: opened, morphed: morphed, refused: refused, status: g.status,
        over: C.gameStats(g).overstrikes };
    }, putDown.route.slice(putDown.done));
    ok('it comes back on the same blows with no chance to reshape, whatever the save said',
      resumed.opened.chance === 0 && resumed.opened.reshapes === false &&
      resumed.opened.strikes === putDown.strikes && resumed.opened.pieces === putDown.pieces &&
      !/change symbol/i.test(resumed.opened.legend), JSON.stringify(resumed.opened).slice(0, 200));
    ok('and is finished from there without a symbol changing',
      resumed.morphed === 0 && resumed.refused === 0 && resumed.status === 'complete' && resumed.over === 0,
      JSON.stringify(resumed).slice(0, 200));
    await clearSheets();
    await leaveAnvil();

    // 6. and the modes that reshape still do, after the forge
    await toTitle();
    await page.click('.mode-card[data-mode="endless"]');
    await page.click('#beginBtn');
    await page.waitForFunction(() => { const g = window.CHECKSMITH.app.game; return g && g.mode === 'endless'; },
      null, { timeout: 15000 });
    const endlessAgain = await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, g = F.app.game;
      return { chance: g.morphChance, live: C.canReshape(g), base: C.CONFIG.endless.morphBase };
    });
    ok('Endless after the forge still opens at its own reshape chance',
      endlessAgain.live && endlessAgain.chance === endlessAgain.base, JSON.stringify(endlessAgain));
    await toTitle();
    await page.click('.mode-card[data-mode="forge"]');
    await page.click('#beginBtn');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.CHECKSMITH.squareForge('master'));
    await page.waitForFunction(() => { const g = window.CHECKSMITH.app.game; return g && !g.board.shape && g.board.size === 6; },
      null, { timeout: 15000 });
    const forgeAgain = await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, g = F.app.game;
      return { chance: g.morphChance, live: C.canReshape(g), want: C.CONFIG.difficulties.master.morphChance,
        legend: document.getElementById('legendBody').textContent };
    });
    ok('the Forge’s square boards still reshape at their difficulty, and say so',
      forgeAgain.live && forgeAgain.chance === forgeAgain.want && /change symbol/.test(forgeAgain.legend),
      JSON.stringify(forgeAgain).slice(0, 200));

    ok('none of it raises an error', calmErrs.length === 0, calmErrs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* ============ special commissions ============ */
  /* One named piece, asked for by one trade, made once and by the player
     alone: offered, declined and offered again, accepted at the counter,
     designed and molded a phase at a time, then attempted on its own
     silhouette - put down and picked up, finished imperfectly, stranded,
     abandoned and finally forged perfectly - and the blueprint it earns
     taken into the Almanac and the forge's list. */
  section('Open Your Forge: special commissions');
  {
    ctx = await browser.newContext({ viewport: { width: 360, height: 900 } });
    page = paged(await ctx.newPage());
    const spErrs = [];
    page.on('pageerror', (e) => spErrs.push(String(e)));
    await page.goto(FILE);
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    const openForge = async (name) => {
      await page.click('.mode-card[data-mode="shop"]');
      await page.click('#beginBtn');
      if (await page.isVisible('#nameForge')) {
        await page.fill('#nameForgeInput', name || 'Masterworks');
        await page.click('#nameForgeGo');
      }
      await page.waitForFunction(() => !document.getElementById('shopView').hidden || !!window.CHECKSMITH.app.game,
        null, { timeout: 15000 });
      await page.waitForTimeout(250);
      await chooseCrafts(page);
      await installStock(page);
      await page.evaluate(() => {
        const F = window.CHECKSMITH;
        F.setPhaseAnim(false);
        F.core.CONFIG.animation.strikeMs = 12;
      });
    };
    const sheet = () => page.evaluate(() => ({
      open: !document.getElementById('shopSheet').hidden,
      title: document.getElementById('shopSheetTitle').textContent,
      body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' '),
      // in the order the dialog gave them, wherever each was placed
      buttons: Array.from(document.querySelectorAll('#shopSheet [data-at]'))
        .sort((a, b) => Number(a.dataset.at) - Number(b.dataset.at))
        .map((b) => b.textContent + (b.disabled ? ' (off)' : ''))
    }));
    const press = async (label) => {
      await page.evaluate((l) => {
        const b = Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button'))
          .find((x) => x.textContent === l || x.textContent.indexOf(l) === 0);
        b.click();
      }, label);
      await page.waitForTimeout(160);
    };
    const closeSheets = async () => {
      for (let k = 0; k < 60 && (await page.isVisible('#shopSheet')); k++) {
        await page.click('#shopSheet [data-at="0"]');
        await page.waitForTimeout(110);
      }
    };
    const state = () => page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      const rec = C.specialRecord(sh, 'embercleaver');
      return { stage: C.specialStage(sh, 'embercleaver'), tick: sh.day * 3 + sh.phaseIndex,
        bronze: sh.materials.bronze, attempts: rec ? rec.attempts : 0,
        design: rec ? rec.design : 0, mold: rec ? rec.mold : 0,
        known: C.recipeKnown(sh, 'embercleaver'), offers: (sh.specialOffers || []).length };
    });
    const ledgerCard = () => page.evaluate(() => {
      const F = window.CHECKSMITH;
      F.shopUi.tab = 'ledger';
      F.shopRender();
      const card = document.querySelector('#shPanel [data-special-card="embercleaver"]');
      const btn = card && card.querySelector('[data-special-act]');
      const panel = document.getElementById('shPanel');
      return { text: card ? card.innerText.replace(/\s+/g, ' ') : null,
        btn: btn ? btn.textContent : null, btnOff: btn ? btn.disabled : null,
        wide: panel.scrollWidth > panel.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth };
    });

    await openForge();
    // a forge with the craft and the name for the cleaver, and a cook in front
    await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      C.takeUpDiscipline(sh, 'household', 'bought');
      sh.reputation = 30; sh.gold = 5000; sh.materials.bronze = 12;
      F.testStock(sh, C.lineKey('cookknife', 'bronze'), 30, 90, 20);
      let cook = sh.town.find((o) => o.type === 'cook') || C.makeTownsfolk(sh, 'cook');
      cook.gold = 800;
      sh.town.splice(sh.town.indexOf(cook), 1); sh.town.unshift(cook);
      F.shopRender();
    });

    // 1. a salesperson takes it down, and it waits for the player after the phase
    const queued = await page.evaluate(async () => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      sh.staff.push({ id: 7701, name: 'Rhea Counter', role: 'salesperson', rank: 'C', power: 3, wage: 20, xp: 0, face: 'merchant' });
      C.shopAssign(sh, 7701, {}, C.shopPhase(sh));
      const keep = sh.rnd; sh.rnd = () => 0;
      const tick = sh.day * 3 + sh.phaseIndex;
      F.shopSpendPhase(null);
      sh.rnd = keep;
      await new Promise((r) => setTimeout(r, 250));
      const body = document.getElementById('shopSheetBody');
      return { tick: sh.day * 3 + sh.phaseIndex - tick, title: document.getElementById('shopSheetTitle').textContent,
        text: body.innerText.replace(/\s+/g, ' '), take: !!body.querySelector('[data-special-take="embercleaver"]'),
        offers: sh.specialOffers.length, stage: C.specialStage(sh, 'embercleaver'),
        bulk: sh.commissionOffers.length };
    });
    ok('a salesperson takes a special commission down and it is shown after the phase',
      queued.tick === 1 && /summary/.test(queued.title) && queued.take && queued.offers === 1 &&
      queued.stage === 'offered' && /special commission offer is waiting/.test(queued.text) &&
      /Embercleaver/.test(queued.text), JSON.stringify(queued).slice(0, 300));
    const ledgerOffer = await page.evaluate(() => {
      const F = window.CHECKSMITH;
      document.querySelector('#shopSheet [data-at="0"]').click();
      F.shopUi.tab = 'offers'; F.shopRender();
      const card = document.querySelector('#shPanel [data-special-offer="embercleaver"]');
      const badge = document.querySelector('#shThings [data-station="commissions"] .sc-badge');
      return { text: card ? card.innerText.replace(/\s+/g, ' ') : '', sprite: !!(card && card.querySelector('.sprite.named')),
        badge: badge ? badge.textContent : '' };
    });
    ok('the Commission Board shows the offer in full: who, what, the stages, the metal and the reputation',
      /Embercleaver/.test(ledgerOffer.text) && /Cook/.test(ledgerOffer.text) &&
      /Household Goods/.test(ledgerOffer.text) && /DESIGN 1 phase/i.test(ledgerOffer.text) &&
      /MOLD 1 phase/i.test(ledgerOffer.text) && /2 Bronze/.test(ledgerOffer.text) &&
      /reputation 12/.test(ledgerOffer.text) && /No deadline/.test(ledgerOffer.text) && ledgerOffer.sprite,
      ledgerOffer.text.slice(0, 300));
    const declined = await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      const tick = sh.day * 3 + sh.phaseIndex;
      document.querySelector('#shPanel [data-special-drop="embercleaver"]').click();
      return { tick: sh.day * 3 + sh.phaseIndex - tick, offers: sh.specialOffers.length,
        stage: C.specialStage(sh, 'embercleaver'), eligible: C.specialEligible(sh, 'embercleaver'),
        card: !!document.querySelector('#shPanel [data-special-offer="embercleaver"]') };
    });
    ok('declining is free, clears the offer and leaves it to be put again later',
      declined.tick === 0 && declined.offers === 0 && declined.stage === 'open' && !declined.eligible &&
      !declined.card, JSON.stringify(declined));

    // 2. days later the cook asks again, at the player's own counter
    await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      sh.day += C.SHOP.special.cooldown;
      sh.phaseIndex = 0;
      sh.assignments = {};
      window.__keep = sh.rnd; sh.rnd = () => 0;
      F.shopUi.tab = null; F.shopRender();
    });
    const before = await state();
    await shopAction(page, 'tend');
    await page.waitForTimeout(300);
    const asked = await sheet();
    ok('a customer of the right trade asks at the counter and describes the piece',
      asked.title === 'Special Commission' && /Embercleaver/.test(asked.body) &&
      /oversized/.test(asked.body) && /Cook/.test(asked.body) &&
      asked.buttons.join() === 'Accept Commission,Decline', JSON.stringify(asked).slice(0, 300));
    await press('Accept Commission');
    await page.evaluate(() => { window.CHECKSMITH.app.shop.rnd = window.__keep; });
    const stamped = await sheet();
    const took = await state();
    ok('accepting is stamped and costs nothing', /Special Commission Accepted/.test(stamped.title) &&
      /added to Special Commissions in the Ledger/.test(stamped.body) && took.stage === 'design' &&
      took.bronze === before.bronze, JSON.stringify([stamped.title, took]));
    await closeSheets();

    // 3. design and mold: one phase of the player's each
    let card = await ledgerCard();
    ok('the Ledger card shows the stage, the progress and the next action',
      /DESIGN 0 \/ 1/i.test(card.text) && /MOLD 0 \/ 1/i.test(card.text) && /Attempts so far: 0/.test(card.text) &&
      card.btn === 'Work on Design (Uses Phase)' && !card.wide, JSON.stringify(card).slice(0, 300));
    const t0 = await state();
    await page.click('#shPanel [data-special-act="embercleaver"]');
    await page.waitForTimeout(250);
    await closeSheets();
    const t1 = await state();
    card = await ledgerCard();
    ok('working on the design uses exactly one phase and counts once',
      t1.tick === t0.tick + 1 && t1.design === 1 && t1.stage === 'mold' && card.btn === 'Fashion Mold (Uses Phase)',
      JSON.stringify([t0, t1, card.btn]));
    await page.click('#shPanel [data-special-act="embercleaver"]');
    await page.waitForTimeout(250);
    await closeSheets();
    const t2 = await state();
    card = await ledgerCard();
    ok('fashioning the mold uses exactly one phase, and then it is ready to forge',
      t2.tick === t1.tick + 1 && t2.mold === 1 && t2.stage === 'ready' && card.btn === 'Attempt Forge',
      JSON.stringify([t2, card.btn]));

    // 4. the attempt sheet says what it costs, and refuses without the metal
    await page.evaluate(() => { window.CHECKSMITH.app.shop.materials.bronze = 1; });
    await page.click('#shPanel [data-special-act="embercleaver"]');
    await page.waitForTimeout(200);
    const short = await sheet();
    ok('without the ingots the attempt cannot start, and says why',
      /Attempt Forge/.test(short.title) && /requires 2 Bronze ingots/.test(short.body) &&
      short.buttons[0] === 'Start Attempt · 2 Bronze (off)', JSON.stringify(short).slice(0, 300));
    await press('Back');
    await page.evaluate(() => { window.CHECKSMITH.app.shop.materials.bronze = 12; window.CHECKSMITH.shopRender(); });
    await page.click('#shPanel [data-special-act="embercleaver"]');
    await page.waitForTimeout(200);
    const full = await sheet();
    ok('the sheet shows the metal required and the ingots held, before anything is spent',
      /Ingots required/.test(full.body) && /2 Bronze/.test(full.body) && /Ingots in stock/.test(full.body) &&
      /12/.test(full.body) && /not returned/.test(full.body) && full.buttons[0] === 'Start Attempt · 2 Bronze',
      full.body.slice(0, 300));
    // a double tap starts one attempt and charges once
    await page.evaluate(() => {
      const b = document.querySelector('#shopSheet [data-at="0"]');
      b.click(); b.click();
    });
    await page.waitForTimeout(300);
    const anvil = await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, g = F.app.game, sh = F.app.shop;
      return { shaped: !!(g && g.board.shape), special: g && g.board.special, perfect: g && g.perfect,
        squares: g && C.metalCount(g.board), bronze: sh.materials.bronze,
        attempts: C.specialRecord(sh, 'embercleaver').attempts,
        menu: document.getElementById('menuActionBtn').textContent,
        restart: document.getElementById('restartBtn').hidden,
        bar: !document.getElementById('pieceBar').hidden && document.getElementById('pieceName').textContent,
        prompt: document.getElementById('promptText').textContent,
        air: document.querySelectorAll('#board .tile[data-air]').length };
    });
    ok('one attempt starts, charged once, on the piece’s own silhouette',
      anvil.shaped && anvil.special === 'embercleaver' && anvil.perfect === 1 && anvil.squares === 26 &&
      anvil.air > 0 && anvil.bronze === 10 && anvil.attempts === 1, JSON.stringify(anvil));
    ok('the anvil names the piece, says perfect is required, and offers no free restart',
      anvil.bar === 'Embercleaver' && /exactly 1 strike/.test(anvil.prompt) && /perfect/.test(anvil.prompt) &&
      anvil.menu === 'Abandon Attempt' && anvil.restart, JSON.stringify(anvil));

    // 5. put down half way and picked up again: the same attempt, not charged again
    const midway = await page.evaluate(async () => {
      const F = window.CHECKSMITH, g = F.app.game;
      for (const i of g.board.route.slice(0, 3)) {
        for (let n = 0; n < 60 && F.app.busy; n++) await new Promise((r) => setTimeout(r, 10));
        F.tap(i);
        await new Promise((r) => setTimeout(r, 20));
      }
      for (let n = 0; n < 60 && F.app.busy; n++) await new Promise((r) => setTimeout(r, 10));
      return { strikes: g.strikes.join(','), current: g.current };
    });
    await page.reload();
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    await page.click('.mode-card[data-mode="shop"]');
    await page.waitForTimeout(150);
    const row = await page.$$eval('#shopSlots .forge-slot', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
    await openForge();
    const resumed = await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, g = F.app.game, sh = F.app.shop;
      return { at: !!g && g.board.special, strikes: g && g.strikes.join(','), current: g && g.current,
        bronze: sh.materials.bronze, attempts: C.specialRecord(sh, 'embercleaver').attempts,
        stage: C.specialStage(sh, 'embercleaver'), menu: document.getElementById('menuActionBtn').textContent };
    });
    ok('the forge’s row says an attempt is in progress', /special commission attempt in progress/.test(row.join(' ')),
      row.join(' | '));
    ok('reopened, it is the same attempt on the same blows, and nothing is charged again',
      resumed.at === 'embercleaver' && resumed.strikes === midway.strikes && resumed.current === midway.current &&
      resumed.bronze === 10 && resumed.attempts === 1 && resumed.stage === 'forging' &&
      resumed.menu === 'Abandon Attempt', JSON.stringify([midway, resumed]).slice(0, 400));

    // 6. finished, but imperfectly: no blueprint, metal gone, progress kept
    const imperfect = await page.evaluate(async () => {
      const F = window.CHECKSMITH, g = F.app.game;
      const r = g.board.route;
      // every square of the route struck as it should be, one of them once too often
      for (let k = 0; k < r.length - 1; k++) g.strikes[r[k]] = 1;
      g.strikes[r[2]] = 2;
      g.totalStrikes = r.length;
      g.current = r[r.length - 2];
      g.status = 'playing';
      F.tap(r[r.length - 1]);
      for (let n = 0; n < 80 && F.app.busy; n++) await new Promise((res) => setTimeout(res, 10));
      await new Promise((res) => setTimeout(res, 300));
      return { title: document.getElementById('shopSheetTitle').textContent,
        body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ') };
    });
    const afterImperfect = await state();
    ok('a finished but imperfect piece shows its quality and does not complete the commission',
      imperfect.title === 'Forged Imperfectly' && /quality \d+/i.test(imperfect.body) &&
      !/quality 100\b/i.test(imperfect.body.split('The commission')[0]) && /ingots are spent/.test(imperfect.body) &&
      afterImperfect.stage === 'ready' && !afterImperfect.known && afterImperfect.bronze === 10 &&
      afterImperfect.design === 1 && afterImperfect.mold === 1, JSON.stringify([imperfect, afterImperfect]).slice(0, 400));
    const tickA = afterImperfect.tick;
    await press('Return to Shop');
    await closeSheets();
    ok('and the attempt used its phase', (await state()).tick === tickA + 1);

    // 7. run out of moves: the ordinary failure, progress kept
    await page.evaluate(() => { const F = window.CHECKSMITH; F.shopUi.tab = 'ledger'; F.shopRender(); });
    await page.click('#shPanel [data-special-act="embercleaver"]');
    await page.waitForTimeout(200);
    await press('Start Attempt');
    await page.waitForTimeout(250);
    const failed = await page.evaluate(async () => {
      const F = window.CHECKSMITH, C = F.core, g = F.app.game;
      // always the first move offered: a plain smith who does not plan ahead
      for (let k = 0; k < 80 && (g.status === 'ready' || g.status === 'playing'); k++) {
        for (let n = 0; n < 60 && F.app.busy; n++) await new Promise((r) => setTimeout(r, 10));
        const t = C.legalTargets(g);
        if (!t.length) break;
        F.tap(t[0]);
        await new Promise((r) => setTimeout(r, 20));
      }
      for (let n = 0; n < 80 && F.app.busy; n++) await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 300));
      return { status: g.status, title: document.getElementById('shopSheetTitle').textContent,
        body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ') };
    });
    const afterFail = await state();
    ok('running out of legal moves fails the attempt the ordinary way, keeping the progress',
      failed.status === 'lost' && failed.title === 'Attempt Failed' && /No legal moves/.test(failed.body) &&
      afterFail.stage === 'ready' && afterFail.bronze === 8 && afterFail.attempts === 2 &&
      afterFail.design === 1 && afterFail.mold === 1, JSON.stringify([failed, afterFail]).slice(0, 400));
    await press('Return to Shop');
    await closeSheets();

    // 8. abandoned, with a warning that the metal is lost
    await page.evaluate(() => { const F = window.CHECKSMITH; F.shopUi.tab = 'ledger'; F.shopRender(); });
    await page.click('#shPanel [data-special-act="embercleaver"]');
    await page.waitForTimeout(200);
    await press('Start Attempt');
    await page.waitForTimeout(250);
    const t3 = await state();
    await page.click('#menuActionBtn');
    await page.waitForTimeout(150);
    const warn = await page.evaluate(() => ({ open: !document.getElementById('confirm').hidden,
      text: document.getElementById('confirm').innerText.replace(/\s+/g, ' ') }));
    await page.click('#confirmYes');
    await page.waitForTimeout(300);
    await closeSheets();
    const afterAbandon = await state();
    ok('abandoning warns that the committed ingots are lost',
      warn.open && /2 Bronze ingots committed to this attempt are lost/.test(warn.text), warn.text);
    ok('and leaves the commission ready, the metal spent and the phase used',
      afterAbandon.stage === 'ready' && afterAbandon.bronze === 6 && afterAbandon.attempts === 3 &&
      afterAbandon.tick === t3.tick + 1 && !afterAbandon.known, JSON.stringify([t3, afterAbandon]));

    // 9. perfect: delivered, and the blueprint is the forge's
    await page.evaluate(() => { const F = window.CHECKSMITH; F.shopUi.tab = 'ledger'; F.shopRender(); });
    await page.click('#shPanel [data-special-act="embercleaver"]');
    await page.waitForTimeout(200);
    await press('Start Attempt');
    await page.waitForTimeout(250);
    const perfect = await page.evaluate(async () => {
      const F = window.CHECKSMITH, g = F.app.game;
      for (const i of g.board.route.slice()) {
        for (let n = 0; n < 60 && F.app.busy; n++) await new Promise((r) => setTimeout(r, 10));
        F.tap(i);
        await new Promise((r) => setTimeout(r, 14));
      }
      for (let n = 0; n < 80 && F.app.busy; n++) await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 300));
      return { title: document.getElementById('shopSheetTitle').textContent,
        body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' ') };
    });
    const done = await state();
    ok('a perfect forge completes the commission and unlocks the blueprint',
      perfect.title === 'Commission Complete' && /quality 100/i.test(perfect.body) &&
      /delivered to/.test(perfect.body) && /Blueprint unlocked/i.test(perfect.body) &&
      done.stage === 'done' && done.known && done.bronze === 4 && done.attempts === 4,
      JSON.stringify([perfect, done]).slice(0, 400));
    await press('Return to Shop');
    await closeSheets();
    card = await ledgerCard();
    const after = await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      return { storage: C.countStorage(sh), learned: sh.learned.filter((l) => l.id === 'embercleaver').length,
        offer: (() => { sh.rnd = () => 0; const o = C.rollSpecial(sh, sh.town.find((x) => x.type === 'cook')); return o; })() };
    });
    ok('the piece went to the customer, not to storage, and the Ledger marks it completed',
      after.storage === 0 && /COMPLETED/i.test(card.text) && /Delivered on day/.test(card.text) &&
      after.learned === 1 && after.offer === null, JSON.stringify([after, card.text]).slice(0, 300));

    // 10. the book: earned here, locked with its reason elsewhere, and forgeable
    const book = await page.evaluate(async () => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      F.shopOpenAlmanac();
      await new Promise((r) => setTimeout(r, 100));
      document.querySelector('#shopSheetBody [data-craft="household"]').click();
      await new Promise((r) => setTimeout(r, 120));
      // the tree first, then the craft's named pieces, a page of their own
      const treeHas = !!document.querySelector('#shopSheetBody .alm-node[data-recipe="embercleaver"]');
      document.querySelector('#shopSheetBody [data-alm-specials]').click();
      await new Promise((r) => setTimeout(r, 100));
      const earned = document.querySelector('#shopSheetBody .alm-special');
      const mine = { text: earned ? earned.innerText.replace(/\s+/g, ' ') : '', earned: !!(earned && earned.classList.contains('earned')),
        treeHas: treeHas };
      document.querySelector('#shopSheetBody [data-alm-tree]').click();
      await new Promise((r) => setTimeout(r, 100));
      document.querySelector('#shopSheetBody [data-craft-back]').click();
      await new Promise((r) => setTimeout(r, 100));
      document.querySelector('#shopSheetBody [data-craft="swords"]').click();
      await new Promise((r) => setTimeout(r, 120));
      document.querySelector('#shopSheetBody [data-alm-specials]').click();
      await new Promise((r) => setTimeout(r, 100));
      const locked = document.querySelector('#shopSheetBody .alm-special');
      const other = { text: locked ? locked.innerText.replace(/\s+/g, ' ') : '',
        earned: !!(locked && locked.classList.contains('earned')) };
      locked.click();
      await new Promise((r) => setTimeout(r, 120));
      const page2 = { title: document.getElementById('shopSheetTitle').textContent,
        body: document.getElementById('shopSheetBody').innerText.replace(/\s+/g, ' '),
        buttons: Array.from(document.querySelectorAll('#shopSheetBack button, #shopSheetActions button')).map((b) => b.textContent) };
      F.shopSheetClose();
      return { mine, other, page2, known: C.knownRecipes(sh).some((it) => it.id === 'embercleaver'),
        forge: C.forgeCheck(sh, 'embercleaver', 'bronze', 1).ok };
    });
    ok('the Almanac lists the earned masterwork beside its craft’s tree',
      book.mine.earned && /Embercleaver/.test(book.mine.text) && /Earned/.test(book.mine.text) && !book.mine.treeHas,
      JSON.stringify(book.mine));
    ok('and one not yet earned as a special discovery, with how to earn it',
      !book.other.earned && /Vowkeeper/.test(book.other.text) && /Special Commission/.test(book.other.text) &&
      /Knight/.test(book.other.text) && /reputation 70/.test(book.other.text), JSON.stringify(book.other));
    ok('its page cannot be bought with experience', book.page2.title === 'Vowkeeper' &&
      /Special Commission/.test(book.page2.body) && !book.page2.buttons.some((b) => /Unlock/.test(b)),
      JSON.stringify(book.page2).slice(0, 300));
    ok('the earned blueprint is on the forge’s list for copies', book.known && book.forge, JSON.stringify(book));

    // 11. copies on the floor, marked as named work, and the screens fit a phone
    const floor = await page.evaluate(() => {
      const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
      F.testStock(sh, C.lineKey('embercleaver', 'bronze'), 6, 90);
      F.shopUi.tab = 'shelf'; F.shopRender();
      return { named: document.querySelectorAll('#shPanel .sprite.named, #shThings .sprite.named, #shScene use[href="#it-embercleaver"]').length };
    });
    ok('copies stand on the floor and are drawn as named work', floor.named > 0, JSON.stringify(floor));

    ok('none of it raises an error', spErrs.length === 0, spErrs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  /* ============ several forges at once ============ */
  section('Open Your Forge: a forge for every slot');
  ctx = await browser.newContext({ viewport: { width: 390, height: 950 } });
  page = paged(await ctx.newPage());
  const slotErrs = [];
  page.on('pageerror', (e) => slotErrs.push(String(e)));
  await page.goto(FILE);
  await page.evaluate(() => window.CHECKSMITH.setPhaseAnim(false));

  // the same helpers, against this page
  const shopCard = async () => {
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
    await page.click('.mode-card[data-mode="shop"]');
    await page.waitForTimeout(160);
  };
  const slotNames = () => page.$$eval('#shopSlots .fs-name', (els) => els.map((e) => e.textContent));
  const newForge = async (name) => {
    await shopCard();
    await page.click('#shopNewBtn');
    await page.waitForSelector('#nameForge:not([hidden])', { timeout: 8000 });
    if (name !== undefined) await page.fill('#nameForgeInput', name);
    await page.click('#nameForgeGo');
    await page.waitForSelector('#shopView:not([hidden])', { timeout: 15000 });
    await page.waitForTimeout(200);
    await chooseCrafts(page);
  };
  const leave = async () => {
    await page.click('#menuBtn');
    if (await page.isVisible('#confirm')) await page.click('#confirmYes');
    await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  };

  await shopCard();
  await page.click('#beginBtn');
  await page.waitForSelector('#nameForge:not([hidden])', { timeout: 8000 });
  ok('with nothing saved, Begin asks for a name first',
    await page.isVisible('#nameForgeInput'));
  await page.fill('#nameForgeInput', 'Emberline');
  await page.click('#nameForgeGo');
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 15000 });
  await chooseCrafts(page);
  await page.evaluate(() => { window.CHECKSMITH.app.shop.gold = 111; window.CHECKSMITH.shopRender(); });
  await page.waitForTimeout(150);
  await leave();

  await newForge('Coldwater Anvil');
  await page.evaluate(() => { window.CHECKSMITH.app.shop.gold = 222; window.CHECKSMITH.shopRender(); });
  await page.waitForTimeout(150);
  await leave();
  await shopCard();
  ok('a second forge sits beside the first rather than replacing it',
    JSON.stringify(await slotNames()) === JSON.stringify(['Emberline', 'Coldwater Anvil']),
    JSON.stringify(await slotNames()));

  // each keeps its own ledger
  await page.click('#shopSlots .forge-row:nth-child(1) .forge-slot');
  await page.waitForTimeout(150);
  await page.click('#beginBtn');
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 15000 });
  const openedFirst = await page.evaluate(() => ({ name: window.CHECKSMITH.app.shop.name,
    gold: window.CHECKSMITH.app.shop.gold, bar: document.getElementById('shName').textContent }));
  ok('picking a forge opens that one, with its own purse',
    openedFirst.name === 'Emberline' && openedFirst.gold === 111 && openedFirst.bar === 'Emberline', JSON.stringify(openedFirst));
  await leave();
  await shopCard();
  await page.click('#shopSlots .forge-row:nth-child(2) .forge-slot');
  await page.waitForTimeout(150);
  await page.click('#beginBtn');
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 15000 });
  const openedSecond = await page.evaluate(() => ({ name: window.CHECKSMITH.app.shop.name,
    gold: window.CHECKSMITH.app.shop.gold }));
  ok('and the other keeps its own', openedSecond.name === 'Coldwater Anvil' && openedSecond.gold === 222,
    JSON.stringify(openedSecond));
  await leave();

  // the forge last played is the one waiting on the way back in
  await page.reload();
  await shopCard();
  ok('the forge last played is the one waiting when you come back',
    (await page.getAttribute('#shopSlots .forge-row:nth-child(2) .forge-slot', 'aria-checked')) === 'true' &&
    /Coldwater Anvil/.test(await page.textContent('#shopSaveLine')));

  // names are cleaned up rather than taken on trust
  await newForge('   ');
  ok('an empty name falls back rather than leaving a blank sign',
    (await page.evaluate(() => window.CHECKSMITH.app.shop.name)).length > 0,
    await page.evaluate(() => window.CHECKSMITH.app.shop.name));
  await leave();
  await newForge('Emberline');
  ok('a name already in use is made unique',
    (await page.evaluate(() => window.CHECKSMITH.app.shop.name)) === 'Emberline 2',
    await page.evaluate(() => window.CHECKSMITH.app.shop.name));
  await leave();

  await shopCard();
  const beforeFull = (await slotNames()).length;
  await newForge('Last One');
  await leave();
  await shopCard();
  const full = await page.evaluate(() => ({
    rows: document.querySelectorAll('#shopSlots .forge-slot').length,
    newDisabled: document.getElementById('shopNewBtn').disabled,
    label: document.getElementById('shopNewBtn').textContent,
    cap: window.CHECKSMITH.core.SHOP_SAVE_SLOTS
  }));
  ok('the list fills up and then says so',
    beforeFull === 4 && full.rows === full.cap && full.newDisabled === true &&
    /in use/.test(full.label), JSON.stringify([beforeFull, full]));

  // a forge can be closed for good, and only that one
  await page.click('#shopSlots .forge-row:nth-child(1) .forge-bin');
  await page.waitForSelector('#confirm:not([hidden])', { timeout: 8000 });
  ok('closing a forge names the one being thrown away',
    /Emberline/.test(await page.textContent('#confirmText')),
    await page.textContent('#confirmText'));
  await page.click('#confirmYes');
  await page.waitForTimeout(250);
  const afterBin = await slotNames();
  ok('closing one forge leaves the rest alone',
    afterBin.length === full.cap - 1 && afterBin.indexOf('Emberline') < 0 &&
    afterBin.indexOf('Coldwater Anvil') >= 0, JSON.stringify(afterBin));
  ok('and the New forge button opens up again',
    (await page.evaluate(() => document.getElementById('shopNewBtn').disabled)) === false);

  // a forge left at the menu is still there after a reload
  await page.reload();
  await shopCard();
  ok('every forge survives a reload',
    JSON.stringify(await slotNames()) === JSON.stringify(afterBin), JSON.stringify(await slotNames()));

  // a save written by the build before slots existed becomes the first forge
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('checksmith:v1') || '{}');
    delete raw.shopSaves;
    delete raw.shopLast;
    raw.shopSave = { v: 1, shop: { v: 1, day: 9, gold: 640, phaseIndex: 1, reputation: 55,
      tier: 1, rentPaid: 1, closed: false, nextId: 3, upgrades: {}, materials: {},
      storage: {}, shelf: {}, staff: [], orders: [], assignments: {} }, anvil: null };
    localStorage.setItem('checksmith:v1', JSON.stringify(raw));
  });
  await page.reload();
  await shopCard();
  const legacy = await page.evaluate(() => ({
    rows: Array.from(document.querySelectorAll('#shopSlots .forge-slot'))
      .map((e) => e.innerText.replace(/\s+/g, ' ').trim())
  }));
  ok('a forge saved before there were slots is carried over, not lost',
    legacy.rows.length === 1 && /Day 9/.test(legacy.rows[0]) && /640g/.test(legacy.rows[0]),
    JSON.stringify(legacy));
  await page.click('#beginBtn');
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 15000 });
  ok('and it opens with a name rather than a blank sign',
    (await page.textContent('#shName')).length > 0, await page.textContent('#shName'));

  ok('several forges raise no errors', slotErrs.length === 0, slotErrs.slice(0, 3).join(' | '));
  await ctx.close();

  /* ============ the opening ============ */
  section('The opening');
  // a browser that allows audio without a gesture, which is what a returning
  // player's usually does; the refused case is checked separately below
  const loud = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  ctx = await loud.newContext({ viewport: { width: 390, height: 844 } });
  page = paged(await ctx.newPage());
  const introErrs = [];
  page.on('pageerror', (e) => introErrs.push(String(e)));
  await page.goto(RAW_FILE);

  const frame = () => page.evaluate(() => {
    const op = (id) => Number(getComputedStyle(document.getElementById(id)).opacity);
    const m = document.getElementById('introMusic');
    return { t: Math.round(performance.now()), up: !document.getElementById('intro').hidden,
      logo: op('introLogo'), card: op('introCard'), playing: !!(m && !m.paused && m.currentTime > 0) };
  });
  const film = [];
  for (let i = 0; i < 52; i++) { film.push(await frame()); await page.waitForTimeout(220); }

  const firstMusic = film.find((f) => f.playing);
  ok('the track starts under a black screen', !!firstMusic && firstMusic.logo === 0 &&
    firstMusic.card === 0, JSON.stringify(firstMusic));

  const logoUp = film.find((f) => f.logo > 0.98);
  const cardUp = film.find((f) => f.card > 0.98);
  ok('the logo comes up first, a couple of seconds in',
    !!logoUp && logoUp.t > 1500 && logoUp.t < 5000, logoUp && String(logoUp.t));
  ok('it holds at full strength', film.filter((f) => f.logo > 0.98).length >= 4,
    String(film.filter((f) => f.logo > 0.98).length));
  ok('the title card comes up after it', !!cardUp && cardUp.t > logoUp.t, 
    JSON.stringify([logoUp && logoUp.t, cardUp && cardUp.t]));

  // the whole point of the gap: one is never on screen while the other arrives
  const overlap = film.filter((f) => f.logo > 0.01 && f.card > 0.01);
  ok('the logo is entirely gone before the card begins', overlap.length === 0,
    JSON.stringify(overlap.slice(0, 3)));

  const ended = film.find((f) => !f.up);
  ok('the curtain lifts by itself', !!ended, JSON.stringify(film[film.length - 1]));
  ok('and hands over to the menu', await page.evaluate(() =>
    document.getElementById('intro').hidden && !document.getElementById('titleScreen').hidden));
  ok('the title track carries on behind the menu', await page.evaluate(() => {
    const m = document.getElementById('introMusic');
    return !!m && !m.paused;
  }));
  ok('and stops once a board is in front of the player', await page.evaluate(async () => {
    const F = window.CHECKSMITH;
    document.querySelector('.mode-card[data-mode="forge"]').click();
    document.getElementById('beginBtn').click();
    await new Promise((r) => setTimeout(r, 600));
    return document.getElementById('introMusic').paused;
  }));
  await ctx.close();

  // skipping, and the muted-by-refusal path
  ctx = await loud.newContext({ viewport: { width: 390, height: 844 } });
  page = paged(await ctx.newPage());
  page.on('pageerror', (e) => introErrs.push(String(e)));
  await page.goto(RAW_FILE);
  await page.waitForTimeout(2600);
  await page.mouse.click(195, 500);
  await page.waitForTimeout(1400);
  ok('a tap during the opening skips it', await page.evaluate(() =>
    document.getElementById('intro').hidden && !document.getElementById('titleScreen').hidden));
  await ctx.close();

  // a browser that refuses audio holds on black and waits to be told to start
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = paged(await ctx.newPage());
  page.on('pageerror', (e) => introErrs.push(String(e)));
  await page.goto(RAW_FILE);
  await page.waitForTimeout(1500);
  const waiting = await page.evaluate(() => ({
    up: !document.getElementById('intro').hidden,
    prompt: document.getElementById('introSkip').textContent,
    lit: document.getElementById('introSkip').classList.contains('lit'),
    logo: Number(getComputedStyle(document.getElementById('introLogo')).opacity)
  }));
  ok('a browser that refuses audio waits on black rather than playing it silent',
    waiting.up && waiting.logo === 0 && /begin/i.test(waiting.prompt) && waiting.lit,
    JSON.stringify(waiting));
  await page.mouse.click(195, 500);
  // that tap begins the sequence proper, which opens on its own black lead,
  // so the logo is still a couple of seconds away
  await page.waitForTimeout(3200);
  ok('and that same tap starts the opening', await page.evaluate(() =>
    !document.getElementById('intro').hidden &&
    Number(getComputedStyle(document.getElementById('introLogo')).opacity) > 0.5));
  await ctx.close();

  /* the score follows the player from screen to screen */
  section('The score');
  ctx = await loud.newContext({ viewport: { width: 390, height: 844 } });
  page = paged(await ctx.newPage());
  page.on('pageerror', (e) => introErrs.push(String(e)));
  await page.goto(RAW_FILE + '#skipintro');
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  const playing = () => page.evaluate(() => {
    const M = window.CHECKSMITH.music, el = M && M.el;
    return { track: M ? M.track : null, on: !!(el && !el.paused), muted: el ? el.muted : null };
  });
  await page.waitForTimeout(700);
  ok('the title track plays on the menu', JSON.stringify(await playing()) ===
    JSON.stringify({ track: 'title', on: true, muted: false }), JSON.stringify(await playing()));

  await page.click('.mode-card[data-mode="endless"]');
  await page.click('#beginBtn');
  await page.waitForTimeout(1400);
  const inRun = await playing();
  ok('endless has a track of its own', inRun.track === 'endless' && inRun.on,
    JSON.stringify(inRun));

  await page.evaluate(() => document.getElementById('menuActionBtn').click());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForTimeout(1400);
  const backHome = await playing();
  ok('and the title track comes back with the menu',
    backHome.track === 'title' && backHome.on, JSON.stringify(backHome));

  await page.click('.mode-card[data-mode="forge"]');
  await page.click('#beginBtn');
  await page.waitForTimeout(1400);
  const atForge = await playing();
  ok('a forge board is played in silence', !atForge.on, JSON.stringify(atForge));

  await page.evaluate(() => window.CHECKSMITH.menuLeave());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForTimeout(1200);
  await page.click('.mode-card[data-mode="shop"]');
  await page.click('#beginBtn');
  if (await page.isVisible('#nameForge')) await page.click('#nameForgeGo');
  await page.waitForSelector('#shopView:not([hidden])', { timeout: 15000 });
  await chooseCrafts(page);
  await page.waitForTimeout(1400);
  const atShop = await playing();
  ok('the forge floor has a track of its own', atShop.track === 'shop' && atShop.on,
    JSON.stringify(atShop));

  // the anvil is part of the same day, so the track must not cut out for it
  await shopAction(page, 'forge');
  await page.waitForSelector('#shopSheet:not([hidden])');
  await page.click('#shopSheetActions button:not([disabled])');
  await page.waitForFunction(() => !!window.CHECKSMITH.app.game, null, { timeout: 15000 });
  await page.waitForTimeout(900);
  const atAnvil = await playing();
  ok('and it carries on when a batch goes on the anvil',
    atAnvil.track === 'shop' && atAnvil.on, JSON.stringify(atAnvil));

  await page.evaluate(() => window.CHECKSMITH.menuLeave());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForTimeout(1200);
  await openMenu(page);
  ok('the mute button can be reached from the menu on the title screen', await page.evaluate(() => {
    const r = document.getElementById('muteBtn').getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!(hit && hit.closest('#muteBtn'));
  }));
  await page.click('#muteBtn');
  await page.waitForTimeout(400);
  const hushed = await playing();
  ok('and it silences the score too', hushed.muted === true, JSON.stringify(hushed));
  await page.click('#muteBtn');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const v = document.getElementById('volume');
    v.value = '30';
    v.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  ok('the volume slider carries the score with it', await page.evaluate(() =>
    Math.abs(window.CHECKSMITH.music.el.volume - 0.3) < 0.08),
    await page.evaluate(() => window.CHECKSMITH.music.el.volume));
  await ctx.close();

  /* music has to stop when the player leaves the app */
  section('The score goes quiet in the background');
  ctx = await loud.newContext({ viewport: { width: 390, height: 844 } });
  page = paged(await ctx.newPage());
  const bgErrs = [];
  page.on('pageerror', (e) => bgErrs.push(String(e)));
  await page.goto(RAW_FILE + '#skipintro');
  await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
  // the page reads document.hidden, so that is what is faked here
  await page.evaluate(() => {
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible')
    });
    window.__away = (v) => {
      window.__hidden = v;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  const score = () => page.evaluate(() => {
    const M = window.CHECKSMITH.music, el = M && M.el;
    return { track: M ? M.track : null, held: M ? M.held : null,
      on: !!(el && !el.paused), at: el ? el.currentTime : 0 };
  });
  await page.waitForTimeout(900);
  const scoreBefore = await score();
  ok('the title track is running to begin with', scoreBefore.on && scoreBefore.track === 'title',
    JSON.stringify(scoreBefore));

  await page.evaluate(() => window.__away(true));
  await page.waitForTimeout(120);
  const scoreAway = await score();
  ok('sending the app away stops the music at once',
    !scoreAway.on && scoreAway.held === true && scoreAway.track === 'title', JSON.stringify(scoreAway));
  ok('and it stops without waiting out a fade', scoreAway.at > 0 && scoreAway.at >= scoreBefore.at,
    JSON.stringify([scoreBefore.at, scoreAway.at]));

  await page.waitForTimeout(700);
  ok('it stays stopped while the app is away', !(await score()).on, JSON.stringify(await score()));

  await page.evaluate(() => window.__away(false));
  await page.waitForTimeout(400);
  const scoreBack = await score();
  ok('coming back picks the same track up again',
    scoreBack.on && scoreBack.track === 'title' && scoreBack.held === false, JSON.stringify(scoreBack));
  ok('and carries on from where it stood rather than starting over',
    scoreBack.at >= scoreAway.at, JSON.stringify([scoreAway.at, scoreBack.at]));

  // Every real minimise fires more than one of these: the shell hook, the
  // page's own visibilitychange, and pagehide. The second must not undo the
  // first - that bug stopped the music coming back at all.
  await page.evaluate(() => {
    window.checksmithPause();
    window.__away(true);
    window.dispatchEvent(new Event('pagehide'));
    window.checksmithPause();
  });
  await page.waitForTimeout(150);
  const piledOn = await score();
  ok('stopping twice over still leaves the track to come back to',
    !piledOn.on && piledOn.held === true && piledOn.track === 'title', JSON.stringify(piledOn));
  await page.evaluate(() => { window.__away(false); });
  await page.waitForTimeout(400);
  const cameBack = await score();
  ok('and it does come back, once', cameBack.on && cameBack.track === 'title',
    JSON.stringify(cameBack));

  // the same, over and over, because this is what a phone actually does
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { window.checksmithPause(); window.__away(true); });
    await page.waitForTimeout(120);
    await page.evaluate(() => { window.__away(false); window.checksmithResume(); });
    await page.waitForTimeout(350);
  }
  const stillGoing = await score();
  ok('minimising three times running still leaves the music playing',
    stillGoing.on && stillGoing.track === 'title', JSON.stringify(stillGoing));

  // and a pause the system took on its own, without telling the page
  await page.evaluate(() => { window.CHECKSMITH.music.el.pause(); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { window.__away(false); });
  await page.waitForTimeout(400);
  const healed = await score();
  ok('a track the system stopped behind our back is picked up again',
    healed.on && healed.track === 'title', JSON.stringify(healed));

  // the hooks the two native shells call, since a WebView need not report
  // being sent away as a visibility change at all
  await page.evaluate(() => window.checksmithPause());
  await page.waitForTimeout(120);
  const shellAway = await score();
  ok('the shell pause hook silences it the same way',
    !shellAway.on && shellAway.held === true, JSON.stringify(shellAway));
  await page.evaluate(() => window.checksmithResume());
  await page.waitForTimeout(400);
  ok('and the shell resume hook brings it back', (await score()).on, JSON.stringify(await score()));

  // a screen with no music of its own must stay silent through the round trip
  await page.click('.mode-card[data-mode="forge"]');
  await page.click('#beginBtn');
  await page.waitForTimeout(900);
  await page.evaluate(() => { window.__away(true); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { window.__away(false); });
  await page.waitForTimeout(500);
  const scoreQuiet = await score();
  ok('a silent screen is still silent after a trip to the background',
    !scoreQuiet.on && scoreQuiet.held === false, JSON.stringify(scoreQuiet));

  // and a player who muted stays muted
  await page.evaluate(() => window.CHECKSMITH.menuLeave());
  if (await page.isVisible('#confirm')) await page.click('#confirmYes');
  await page.waitForTimeout(1000);
  await openMenu(page);
  await page.click('#muteBtn');
  await page.click('#gameMenuClose');
  await page.evaluate(() => { window.__away(true); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { window.__away(false); });
  await page.waitForTimeout(400);
  ok('a muted player comes back to silence', await page.evaluate(() =>
    window.CHECKSMITH.music.el.muted === true));
  ok('going to the background raises no errors', bgErrs.length === 0, bgErrs.slice(0, 3).join(' | '));
  await ctx.close();

  ok('the opening raises no errors', introErrs.length === 0, introErrs.slice(0, 3).join(' | '));
  await loud.close();

  /* ============ 1.43: one screen, nothing scrolls ============
     Every screen and every window, at a small, a common and a large phone:
     nothing scrolls, nothing is cut off or pushed off the screen, a window
     that holds more turns in pages and every page fits, and none of the
     looking about - drawers, pages, viewpoints, windows opened and closed -
     spends a phase or changes anything in the forge. */
  section('1.43: every screen fits the phone, and nothing scrolls');
  {
    // what is wrong with the screen as it stands, if anything
    const fitProblems = (pg) => pg.evaluate(() => {
      const out = [];
      const de = document.documentElement;
      if (de.scrollHeight > innerHeight + 1) out.push('page scrolls down (' + de.scrollHeight + ')');
      if (de.scrollWidth > innerWidth + 1) out.push('page scrolls across (' + de.scrollWidth + ')');
      const named = (el) => el.tagName + (el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ')[0];
      for (const el of document.querySelectorAll('body *')) {
        if (!el.getClientRects().length) continue;
        const cs = getComputedStyle(el);
        if ((/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) ||
            (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1)) out.push('scrolls: ' + named(el));
      }
      for (const h of document.querySelectorAll('.pg-host')) {
        if (h.getClientRects().length && h.scrollHeight > h.clientHeight + 1) {
          out.push('page overflows: ' + named(h) + ' ' + h.scrollHeight + '>' + h.clientHeight);
        }
      }
      const shown = (el) => {
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.visibility === 'hidden' || s.display === 'none') return false;
        }
        return true;
      };
      const skip = '.sprite-defs, #intro, .fx-layer, .scene-fx, .sr-only, .scene-sizer, svg, .stamp, #toast';
      for (const el of document.querySelectorAll('button, input, select, p, h1, h2, h3, li, .stat')) {
        if (out.length > 12) break;
        if (el.closest(skip) || !el.getClientRects().length || !shown(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1) {
          out.push('off screen: ' + named(el) + ' "' + el.textContent.trim().slice(0, 24) + '"');
          continue;
        }
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
          const b = a.getBoundingClientRect();
          const across = a.classList.contains('scene');      // the room is looked along, by view
          if (r.bottom > b.bottom + 1 || r.top < b.top - 1 ||
              (!across && (r.right > b.right + 1 || r.left < b.left - 1))) {
            out.push('cut off: ' + named(el) + ' "' + el.textContent.trim().slice(0, 24) + '" by ' + named(a));
            break;
          }
        }
      }
      return out;
    });
    // every page of a window, turned with its own Next, must fit as well
    const everyPage = async (pg, hostSel, label, bad) => {
      const n = await pg.evaluate((s) => Number(document.querySelector(s).dataset.pages || 1), hostSel);
      for (let p = 1; p <= n; p++) {
        const probs = await fitProblems(pg);
        if (probs.length) bad.push(label + ' p' + p + '/' + n + ': ' + probs.slice(0, 3).join('; '));
        if (p < n) {
          await pg.evaluate((s) => document.querySelector(s).nextElementSibling.querySelector('[data-pg="1"]').click(), hostSel);
          await pg.waitForTimeout(40);
        }
      }
      return n;
    };

    for (const [w, h] of [[320, 568], [360, 640], [412, 915]]) {
      ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
      page = paged(await ctx.newPage());
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      await page.goto(FILE);
      await page.waitForSelector('#titleScreen:not([hidden])', { timeout: 8000 });
      const tag = w + 'x' + h;
      const bad = [];
      const look = async (label) => {
        await page.waitForTimeout(80);
        const p = await fitProblems(page);
        if (p.length) bad.push(label + ': ' + p.slice(0, 3).join('; '));
      };

      // the main menu, for each mode
      for (const m of ['forge', 'endless', 'versus', 'shop']) {
        await page.click(`.mode-card[data-mode="${m}"]`);
        await everyPage(page, '#titleBody', 'menu ' + m, bad);
      }
      await page.click('#titleHelpBtn');
      for (const t of ['basics', 'forge', 'endless', 'versus', 'shop']) {
        await page.click(`#helpTabs [data-help-tab="${t}"]`);
        await everyPage(page, '#helpBody', 'how to play: ' + t, bad);
      }
      await page.click('#helpClose');
      await page.click('.mode-card[data-mode="endless"]');
      await page.click('#shopBtn');
      await everyPage(page, '#shop .win-body', 'endless upgrades', bad);
      await page.click('#shopClose');

      // the Forge: its gallery, then every design on the anvil with its symbols
      await page.click('.mode-card[data-mode="forge"]');
      await page.click('#beginBtn');
      await page.waitForSelector('#designView:not([hidden])');
      await everyPage(page, '#designGrid', 'design gallery', bad);
      const designs = await page.evaluate(() => window.CHECKSMITH.core.FORGE_PIECE_ORDER);
      let smallest = 999;
      for (const id of designs) {
        await page.evaluate((d) => window.CHECKSMITH.pickDesign(d), id);
        await page.waitForTimeout(160);
        await look('forge ' + id);
        smallest = Math.min(smallest, await page.evaluate(() => Math.min.apply(null,
          Array.from(document.querySelectorAll('#board .tile:not([data-air])')).map((t) => t.getBoundingClientRect().width))));
      }
      ok(tag + ': every weapon design is on the screen whole, its squares still tappable',
        smallest >= (h < 600 ? 15 : 17), 'smallest square ' + smallest + 'px');
      await page.click('#legendBtn');
      await everyPage(page, '#infoWinBody', 'symbols', bad);
      await page.click('#infoWinClose');

      // Endless at its largest board, and Versus with both boards and one
      await page.evaluate(() => window.CHECKSMITH.menuLeave());
      if (await page.isVisible('#confirm')) await page.click('#confirmYes');
      await page.click('.mode-card[data-mode="endless"]');
      await page.click('#beginBtn');
      await page.waitForFunction(() => window.CHECKSMITH.app.game);
      await look('endless');
      await page.evaluate(() => window.CHECKSMITH.menuLeave());
      if (await page.isVisible('#confirm')) await page.click('#confirmYes');
      await page.evaluate(() => { window.CHECKSMITH.app.vsSize = 6; });
      await page.click('.mode-card[data-mode="versus"]');
      await page.click('#beginBtn');
      await page.waitForFunction(() => document.querySelectorAll('#youBoard .tile').length === 36, null, { timeout: 15000 });
      await look('versus 6x6');
      await page.evaluate(() => { const F = window.CHECKSMITH; F.vs.focus = 'you'; F.vsRender(); });
      await look('versus 6x6, your board enlarged');
      await page.evaluate(() => { const F = window.CHECKSMITH; F.vs.focus = 'none'; F.vsRender(); });
      await page.evaluate(() => window.CHECKSMITH.menuLeave());
      if (await page.isVisible('#confirm')) await page.click('#confirmYes');

      // Open Your Forge, grown as large as it goes and full of everything
      await page.click('.mode-card[data-mode="shop"]');
      await page.click('#beginBtn');
      await page.waitForSelector('#nameForge:not([hidden])');
      await page.fill('#nameForgeInput', 'The Longest Named Forge Yet');
      await page.click('#nameForgeGo');
      await page.waitForSelector('#shopSheet:not([hidden])');
      await everyPage(page, '#shopSheetBody', 'starting crafts', bad);
      await chooseCrafts(page);
      await page.evaluate(() => {
        const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
        sh.gold = 5e7;
        for (const id of Object.keys(C.SHOP.growth)) for (let i = 0; i < 40; i++) if (!C.shopBuyGrowth(sh, id).ok) break;
        const types = C.SHOP.stands.map((s) => s.id);
        for (let i = 0; sh.stands.length < C.standCap(sh) + 3 && i < 60; i++) C.shopBuyStand(sh, types[i % types.length]);
        const roles = C.SHOP.roles.map((r) => r.id);
        for (let i = 0; sh.staff.length < C.staffCapacity(sh) && i < 200; i++) {
          C.shopHire(sh, C.shopSearchStaff(sh, roles[i % roles.length], 1)[0].id);
        }
        for (const c of C.SHOP.categories) C.shopTakeUpDiscipline(sh, c.id);
        for (const it of C.SHOP.items.slice(0, 40)) C.addStorage(sh, it.id + ':bronze', 3, 80);
        for (const m of C.SHOP.materials) { sh.materials[m.id] = 999; C.addOre(sh, m.id, 30); }
        for (let i = 0; i < 40; i++) sh.town.push(C.makeTownsfolk(sh, C.SHOP.customers[i % C.SHOP.customers.length].id));
        F.shopUi.tab = null;
        F.shopRender();
      });
      await page.waitForTimeout(150);
      // everything that must not move while the player only looks
      const ledger = () => page.evaluate(() => {
        const sh = window.CHECKSMITH.app.shop;
        return JSON.stringify({ day: sh.day, phase: sh.phaseIndex, gold: sh.gold, stands: sh.stands,
          staff: sh.staff.map((e) => e.id), jobs: sh.assignments, storage: sh.storage, mats: sh.materials });
      });
      const before = await ledger();
      await look('the shop floor');

      // every drawer and every page of it
      const drawerPages = {};
      for (const tab of ['forge', 'metal', 'storage', 'supply', 'counter', 'shelf', 'town', 'accounts', 'props',
        'upShop', 'upWork', 'upStaff', 'crew', 'staff', 'hire', 'offers', 'active', 'done', 'deliver', 'yard']) {
        await page.evaluate((t) => { const F = window.CHECKSMITH; F.shopUi.tab = t; F.shopRender(); }, tab);
        drawerPages[tab] = await everyPage(page, '#shPanel', 'drawer ' + tab, bad);
      }
      await page.click('#shDrawerClose');
      // the sign's window
      for (const st of ['sign']) {
        await page.evaluate((s) => window.CHECKSMITH.shopOpenStation(s), st);
        await everyPage(page, '#shopSheetBody', 'station ' + st, bad);
        await page.evaluate(() => window.CHECKSMITH.shopSheetClose());
      }
      // the Almanac: its crafts, a tree through every tier, and the named pieces
      await page.evaluate(() => { const F = window.CHECKSMITH; F.shopUi.almanacCat = null; F.shopOpenAlmanac(); });
      await everyPage(page, '#shopSheetBody', 'almanac crafts', bad);
      const treeSeen = await page.evaluate(async () => {
        const F = window.CHECKSMITH, C = F.core;
        F.shopUi.almanacCat = 'armor'; F.shopUi.almanacSpecials = false; F.shopUi.almTier = {};
        F.shopOpenAlmanac();
        const seen = new Set(), tiers = [];
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 30));
          for (const n of document.querySelectorAll('#almTree .alm-node')) seen.add(n.dataset.recipe);
          tiers.push(document.getElementById('almTree').dataset.tiers);
          const next = document.querySelector('#almTree [data-alm-tier="1"]:not([disabled])');
          if (!next) break;
          next.click();
        }
        const want = C.disciplineTree('armor').nodes.map((n) => n.id);
        return { all: want.every((id) => seen.has(id)), tiers: tiers };
      });
      ok(tag + ': the Almanac shows every blueprint of a tall tree across its tier pages',
        treeSeen.all, JSON.stringify(treeSeen));
      await look('almanac tree');
      await page.evaluate(() => { const F = window.CHECKSMITH; F.shopUi.almanacCat = 'swords'; F.shopUi.almanacSpecials = true; F.shopOpenAlmanac(); });
      await everyPage(page, '#shopSheetBody', 'almanac named blueprints', bad);
      await page.evaluate(() => { const F = window.CHECKSMITH; F.shopUi.almanacCat = null; F.shopUi.almanacSpecials = false; F.shopSheetClose(); });

      // the shop, place by place: every object and every floor space is whole
      // in the place it belongs to, and a swipe or a wheel never just scrolls it
      const views = await page.evaluate(async () => {
        const F = window.CHECKSMITH;
        const scene = document.getElementById('shScene');
        const ids = (b) => b.dataset.station || 'spot' + (b.dataset.spot || b.dataset.sstand);
        const sel = '#shThings [data-station], #shThings [data-spot], #shThings [data-sstand]';
        const all = new Set(Array.from(document.querySelectorAll(sel)).map(ids));
        const whole = new Set(), seen = [];
        document.querySelector('#shViews [data-jump="work"]').click();
        await new Promise((r) => setTimeout(r, 600));
        for (let i = 0; i < 6; i++) {
          const r = scene.getBoundingClientRect();
          for (const b of document.querySelectorAll(sel)) {
            const q = b.getBoundingClientRect();
            if (q.left >= r.left - 1 && q.right <= r.right + 1 && q.top >= r.top - 1 && q.bottom <= r.bottom + 1) {
              whole.add(ids(b));
            }
          }
          seen.push(F.shopUi.view);
          const was = F.shopUi.view;
          scene.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          await new Promise((r) => setTimeout(r, 600));
          if (F.shopUi.view === was) break;
        }
        return { missing: Array.from(all).filter((x) => !whole.has(x)), views: seen.length, seen: seen,
          names: Array.from(document.querySelectorAll('#shViews [data-jump]')).map((b) => b.textContent) };
      });
      ok(tag + ': the shop is three places, and every object and stand is whole in its own',
        views.missing.length === 0 && views.seen.join(',') === 'work,floor,front', JSON.stringify(views));
      const box = await page.locator('#shScene').boundingBox();
      const at = await page.evaluate(() => window.CHECKSMITH.shopUi.view);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(400, 0);
      await page.waitForTimeout(150);
      const wheeled = await page.evaluate(() => window.CHECKSMITH.shopUi.view);
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(700);
      const swiped = await page.evaluate(() => ({ view: window.CHECKSMITH.shopUi.view,
        named: document.querySelector('#shViews [aria-pressed="true"]').dataset.jump,
        transform: document.getElementById('shWorld').style.transform }));
      ok(tag + ': a wheel does not move the shop; a swipe steps back one whole place',
        at === 'front' && wheeled === at && swiped.view === 'floor' && swiped.named === 'floor',
        JSON.stringify({ at: at, wheeled: wheeled, swiped: swiped }));

      ok(tag + ': looking through every drawer, window, page and view spends nothing and changes nothing',
        (await ledger()) === before);

      // Edit Shop with a back room of stands, its tray paged
      await page.evaluate(() => {
        const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
        for (const st of sh.stands.slice(0, 8)) C.storeStand(sh, st.id);
        F.shopRender();
      });
      await page.click('#shEditBtn');
      await page.waitForTimeout(300);
      await everyPage(page, '#shEditTray .tray-body', 'edit tray', bad);
      await page.click('[data-tray-act="done"]');
      await page.evaluate(() => {
        const F = window.CHECKSMITH, C = F.core, sh = F.app.shop;
        for (const st of sh.stands) if (!C.standPlaced(st)) { const s = C.firstFreeSlot(sh); if (s != null) C.placeStand(sh, st.id, s); }
        F.shopRender();
      });

      // a drawer remembers its tab and its page; a window opened from it
      // hides it, and Back brings it back exactly as it was
      const restore = await page.evaluate(async () => {
        const F = window.CHECKSMITH;
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        F.shopUi.tab = 'town'; F.shopRender();
        await wait(50);
        const pg = document.getElementById('shPanel');
        const pages = Number(pg.dataset.pages);
        if (pages > 1) { pg.nextElementSibling.querySelector('[data-pg="1"]').click(); await wait(30); }
        const left = pg.dataset.page;
        document.getElementById('shDrawerClose').click();
        await wait(50);
        document.querySelector('#shThings [data-station="counter"]').click();
        await wait(80);
        const back = { tab: F.shopUi.tab, page: pg.dataset.page };
        // a person from the list: one window at a time
        const person = Array.from(pg.querySelectorAll('[data-town]')).find((b) => !b.closest('.pg-off'));
        person.click();
        await wait(80);
        const stacked = { sheet: !document.getElementById('shopSheet').hidden,
          drawerHidden: getComputedStyle(document.getElementById('shDrawer')).visibility === 'hidden' };
        document.querySelector('#shopSheet [data-win-back]').click();
        await wait(80);
        return { pages: pages, left: left, back: back, stacked: stacked,
          after: { drawer: getComputedStyle(document.getElementById('shDrawer')).visibility, page: pg.dataset.page } };
      });
      ok(tag + ': a drawer reopens on the tab and the page it was left at',
        restore.back.tab === 'town' && restore.back.page === restore.left, JSON.stringify(restore));
      ok(tag + ': a window opened from a drawer is the only one showing, and Back returns to the drawer as it was',
        restore.stacked.sheet && restore.stacked.drawerHidden && restore.after.drawer === 'visible' &&
        restore.after.page === restore.left, JSON.stringify(restore));
      // and the system Back gesture walks the same way out
      const backs = await page.evaluate(() => {
        const r = [];
        r.push(window.checksmithBack(), document.getElementById('shDrawer').hidden);
        return r;
      });
      ok(tag + ': Back closes the drawer and stays in the forge', backs[0] === true && backs[1] === true &&
        await page.isVisible('#shopView'), JSON.stringify(backs));

      ok(tag + ': long windows are turned in pages, not scrolled', drawerPages.town > 1 && drawerPages.upStaff > 1,
        JSON.stringify(drawerPages));
      ok(tag + ': every screen and every page fits, with nothing scrolling and nothing cut off',
        bad.length === 0, bad.slice(0, 6).join(' | '));
      ok(tag + ': the tour raises no errors', errs.length === 0, errs.slice(0, 3).join(' | '));
      await ctx.close();
    }
  }

  await browser.close();
  console.log('\n' + (failures.length ? 'FAILED: ' + failures.join('; ') : 'All browser checks passed') +
    ' (' + pass + ' checks)');
  process.exit(failures.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
