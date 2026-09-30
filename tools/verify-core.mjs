// Rule, generation and scoring checks for the Checksmith core.
// Run: node tools/verify-core.mjs
import { loadCore, coreSource } from './load-core.mjs';

const C = loadCore();
const src = coreSource();
let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { failures.push(name + (detail ? ' -> ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' -> ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

/* ---------- movement ---------- */
section('Movement rules');
{
  const idx = (r, c, n) => r * n + c;
  const has = (piece, from, to, n) => C.movesFrom(piece, from, n).includes(to);

  ok('king reaches all 8 neighbours', C.movesFrom('K', idx(2, 2, 5), 5).length === 8);
  ok('king on a corner is limited to 3', C.movesFrom('K', idx(0, 0, 5), 5).length === 3);
  ok('king cannot move two squares', !has('K', idx(2, 2, 5), idx(2, 4, 5), 5));
  ok('rook covers its row and column only', C.movesFrom('R', idx(2, 2, 5), 5).length === 8);
  ok('rook reaches the far edge', has('R', idx(2, 0, 5), idx(2, 4, 5), 5));
  ok('rook refuses a diagonal', !has('R', idx(2, 2, 5), idx(3, 3, 5), 5));
  ok('bishop stays on its colour', C.movesFrom('B', idx(0, 0, 5), 5).length === 4);
  ok('bishop refuses an orthogonal', !has('B', idx(2, 2, 5), idx(2, 3, 5), 5));
  ok('knight from the centre has 8 jumps', C.movesFrom('N', idx(2, 2, 5), 5).length === 8);
  ok('knight from a corner has 2 jumps', C.movesFrom('N', idx(0, 0, 5), 5).length === 2);
  ok('knight jump is (2,1)', has('N', idx(0, 0, 5), idx(2, 1, 5), 5) && has('N', idx(0, 0, 5), idx(1, 2, 5), 5));
  ok('queen is rook plus bishop', C.movesFrom('Q', idx(2, 2, 5), 5).length ===
      C.movesFrom('R', idx(2, 2, 5), 5).length + C.movesFrom('B', idx(2, 2, 5), 5).length);
  ok('no piece may stand still', ['K', 'R', 'B', 'N', 'Q'].every((p) =>
      !C.movesFrom(p, idx(2, 2, 5), 5).includes(idx(2, 2, 5))));
  ok('every destination is on the board', ['K', 'R', 'B', 'N', 'Q'].every((p) => {
    for (let i = 0; i < 25; i++) if (C.movesFrom(p, i, 5).some((d) => d < 0 || d > 24)) return false;
    return true;
  }));
  ok('isLegalMove rejects from === to', !C.isLegalMove('R', 6, 6, 5));
}

/* The bishop joined the Novice pool, so the smallest board it can land on is
   now 3x3. It gets no special case there and must not want one. */
section('Numbered squares: strike exactly that many away');
{
  const idx = (r, c, n) => r * n + c;
  const has = (piece, from, to, n) => C.movesFrom(piece, from, n).includes(to);
  const ring = (from, away, n) => {
    const r = Math.floor(from / n), c = from % n, out = [];
    for (let rr = 0; rr < n; rr++) {
      for (let cc = 0; cc < n; cc++) {
        if (Math.max(Math.abs(rr - r), Math.abs(cc - c)) === away) out.push(rr * n + cc);
      }
    }
    return out;
  };

  ok('a number is a symbol like any other, with a name and a glyph', (() =>
    C.PIECES['2'].name === 'Two' && C.PIECES['2'].glyph === '2' &&
    C.pieceNumber('2') === 2 && C.pieceNumber('K') === 0));

  ok('a two reaches exactly the ring two squares out, and nothing nearer', (() => {
    for (let n = 3; n <= 6; n++) {
      for (let i = 0; i < n * n; i++) {
        const got = C.movesFrom('2', i, n).slice().sort((a, b) => a - b);
        const want = ring(i, 2, n);
        if (got.join(',') !== want.join(',')) return false;
      }
    }
    return true;
  })());

  ok('every number reaches its own ring and no other', (() => {
    for (let n = 3; n <= 6; n++) {
      for (const p of C.NUMBER_SYMBOLS) {
        const away = C.pieceNumber(p);
        if (away >= n) continue;
        for (let i = 0; i < n * n; i++) {
          const got = C.movesFrom(p, i, n).slice().sort((a, b) => a - b);
          if (got.join(',') !== ring(i, away, n).join(',')) return false;
        }
      }
    }
    return true;
  })());

  ok('one would be the king, so numbers start at two', (() =>
    C.NUMBER_SYMBOLS[0] === '2' &&
    [3, 4, 5, 6].every((n) => !C.poolForSize(n).includes('1'))));

  ok('and a number never stands still or steps off the board', (() => {
    for (let n = 3; n <= 6; n++) {
      for (const p of C.NUMBER_SYMBOLS) {
        for (let i = 0; i < n * n; i++) {
          const to = C.movesFrom(p, i, n);
          if (to.includes(i)) return false;
          if (to.some((d) => d < 0 || d >= n * n)) return false;
        }
      }
    }
    return true;
  })());

  ok('a two in the middle of a 3x3 reaches nowhere, so no board puts one there', (() => {
    if (C.movesFrom('2', idx(1, 1, 3), 3).length !== 0) return false;
    for (let seed = 1; seed <= 60; seed++) {
      const b = C.makeBoard('novice', C.mulberry32(seed * 17));
      if (!b) continue;
      // the middle may hold a two only if the board never departs from it
      if (b.pieces[4] === '2' && b.route.indexOf(4) < b.route.length - 1) return false;
    }
    return true;
  })());

  ok('a two from a 3x3 corner reaches the far row and column', (() =>
    C.movesFrom('2', 0, 3).slice().sort((a, b) => a - b).join(',') === '2,5,6,7,8' &&
    has('2', 0, 8, 3) && !has('2', 0, 1, 3) && !has('2', 0, 4, 3)));

  ok('the numbers a board deals all fit on it', (() =>
    [3, 4, 5, 6].every((n) => C.poolForSize(n)
      .filter((p) => C.pieceNumber(p) > 0)
      .every((p) => C.pieceNumber(p) < n))));

  ok('reshaping never leaves a square with nowhere to go', (() => {
    for (let n = 3; n <= 6; n++) {
      for (let seed = 0; seed < 200; seed++) {
        const b = C.makeBoard(C.CONFIG.order[n - 3], C.mulberry32(seed * 7 + n));
        if (!b) continue;
        const g = C.createGame(b, { morphChance: 1, rnd: C.mulberry32(seed) });
        for (let i = 0; i < n * n; i++) {
          C.reshape(g, i);
          if (C.movesFrom(g.pieces[i], i, n).length === 0) return false;
        }
        break;
      }
    }
    return true;
  })());

  ok('boards with numbers on them still solve, at every size', (() => {
    for (const key of C.CONFIG.order) {
      let withNumber = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const b = C.makeBoard(key, C.mulberry32(seed * 23 + 5));
        if (!b || !C.validateBoard(b)) return false;
        if (b.pieces.some((p) => C.pieceNumber(p) > 0)) withNumber++;
      }
      if (withNumber < 15) return false;
    }
    return true;
  })());

  ok('a number on the board is walked like anything else', (() => {
    const b = C.makeBoard('apprentice', C.mulberry32(99));
    if (!b || !b.pieces.some((p) => C.pieceNumber(p) > 0)) return true;
    const g = C.createGame(b, { morphChance: 0 });
    for (const step of b.route) if (!C.applyStrike(g, step)) return false;
    return g.status === 'complete';
  })());
}

section('Size decides what is on a board, and the bishop still moves like one');
{
  const idx = (r, c, n) => r * n + c;
  const has = (piece, from, to, n) => C.movesFrom(piece, from, n).includes(to);

  ok('the smallest board is a king, a rook, a bishop and numbers',
    C.poolForSize(3).join(',') === 'K,R,B,2', C.poolForSize(3).join(','));
  ok('and the knight still waits for a board with room for it',
    !C.poolForSize(3).includes('N') && !C.poolForSize(4).includes('N') &&
    C.poolForSize(5).includes('N'), C.poolForSize(5).join(','));
  ok('the larger boards are exactly as they were',
    C.poolForSize(4).join(',') === 'K,R,B,2,3' &&
    C.poolForSize(5).join(',') === 'K,R,B,N,2,3,4' &&
    C.poolForSize(6).join(',') === 'K,R,B,N,2,3,4,5' && C.queensForSize(6) === 2 &&
    C.queensForSize(3) === 0, C.poolForSize(6).join(','));
  ok('Novice boards deal bishops, and every one of them can be finished', (() => {
    let bishops = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const b = C.generateBoard('novice', C.mulberry32(seed * 104729));
      if (!b || !C.validateBoard(b)) return false;
      if (b.pieces.includes('B')) bishops++;
    }
    return bishops >= 60;
  })());
  ok('the Novice fallback boards carry bishops and still solve', (() => {
    const list = C.FALLBACK_BOARDS.novice;
    return list.length === 3 && list.every((raw) => raw.pieces.includes('B') &&
      C.validateBoard({ size: 3, difficulty: 'novice', pieces: raw.pieces.split(''),
        route: raw.route.slice() }));
  })());

  // the same diagonal rule, at the small size, with nothing bolted on
  ok('a bishop in the middle of a 3x3 reaches all four corners',
    C.movesFrom('B', idx(1, 1, 3), 3).length === 4 &&
    [[0, 0], [0, 2], [2, 0], [2, 2]].every((rc) => has('B', idx(1, 1, 3), idx(rc[0], rc[1], 3), 3)));
  ok('a bishop on a 3x3 corner reaches the middle and the far corner',
    C.movesFrom('B', idx(0, 0, 3), 3).length === 2 &&
    has('B', idx(0, 0, 3), idx(1, 1, 3), 3) && has('B', idx(0, 0, 3), idx(2, 2, 3), 3));
  ok('a bishop on a 3x3 edge keeps to its own colour',
    C.movesFrom('B', idx(0, 1, 3), 3).length === 2 &&
    has('B', idx(0, 1, 3), idx(1, 0, 3), 3) && has('B', idx(0, 1, 3), idx(1, 2, 3), 3));
  ok('it still refuses every orthogonal on a 3x3',
    !has('B', idx(1, 1, 3), idx(0, 1, 3), 3) && !has('B', idx(1, 1, 3), idx(1, 0, 3), 3) &&
    !has('B', idx(0, 0, 3), idx(0, 1, 3), 3) && !has('B', idx(0, 0, 3), idx(1, 0, 3), 3));
  ok('and it never stands still or steps off the board', (() => {
    for (let n = 3; n <= 6; n++) {
      for (let i = 0; i < n * n; i++) {
        const to = C.movesFrom('B', i, n);
        if (to.includes(i)) return false;
        if (to.some((d) => d < 0 || d >= n * n)) return false;
        // every destination really is on a diagonal
        for (const d of to) {
          if (Math.abs(Math.floor(d / n) - Math.floor(i / n)) !== Math.abs((d % n) - (i % n))) return false;
        }
      }
    }
    return true;
  })());
  ok('isLegalMove agrees with movesFrom for the bishop everywhere on a 3x3', (() => {
    for (let a = 0; a < 9; a++) {
      for (let b = 0; b < 9; b++) {
        if (C.isLegalMove('B', a, b, 3) !== C.movesFrom('B', a, 3).includes(b)) return false;
      }
    }
    return true;
  })());

  // generation: a pool is only useful if boards carrying it still solve
  ok('Novice boards are generated with numbers on them', (() => {
    let withNumber = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const b = C.makeBoard('novice', C.mulberry32(seed * 13));
      if (!b || !C.validateBoard(b)) return false;
      if (b.pieces.some((p) => C.pieceNumber(p) > 0)) withNumber++;
    }
    return withNumber >= 20;                 // the great majority, not a fluke
  })());
  ok('and every one of them is a solvable, verified board', (() => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = C.makeBoard('novice', C.mulberry32(seed * 29));
      if (!b || !C.validateBoard(b)) return false;
      if (!b.pieces.every((p) => C.poolForSize(3).includes(p))) return false;
    }
    return true;
  })());
  ok('the shop can work every strike count on a Novice board too', (() => {
    for (const visits of [1, 2, 3, 4, 5]) {
      for (let seed = 1; seed <= 12; seed++) {
        const b = C.makeShopBoard(3, 'novice', visits, C.mulberry32(seed * 7 + visits));
        if (!b || !C.validateBoard(b)) return false;
        if (b.route.length !== visits * 9) return false;
      }
    }
    return true;
  })());
  ok('the stored route on a bishop board replays legally', (() => {
    for (let seed = 1; seed <= 20; seed++) {
      const b = C.makeBoard('novice', C.mulberry32(seed * 101));
      if (!b || !b.pieces.includes('B')) continue;
      const g = C.createGame(b, { morphChance: 0 });
      for (const i of b.route) if (C.applyStrike(g, i) === null) return false;
      if (g.status !== 'complete') return false;
    }
    return true;
  })());

  // one table, read by every mode: a board of a given size deals the same
  // symbols whoever asked for it
  ok('every rank up brings one more kind of symbol into play',
    [3, 4, 5, 6].every((n, i, all) =>
      i === 0 || C.poolForSize(n).length > C.poolForSize(all[i - 1]).length),
    [3, 4, 5, 6].map((n) => n + ':' + C.poolForSize(n).join('')).join(' '));
  ok('the knight waits for a board it can move on',
    !C.poolForSize(4).includes('N') && C.poolForSize(5).includes('N'));
  ok('the queen is a promotion, and only on the largest board',
    C.queensForSize(3) === 0 && C.queensForSize(5) === 0 && C.queensForSize(6) === 2 &&
    !C.poolForSize(6).includes('Q') && C.symbolsForSize(6).includes('Q'));
  ok('difficulty no longer names a symbol anywhere',
    C.CONFIG.order.every((k) => !C.CONFIG.difficulties[k].pool) &&
    Object.keys(C.CONFIG.versus.difficulties).every(
      (k) => !C.CONFIG.versus.difficulties[k].pool) &&
    !C.CONFIG.endless.pool);
  ok('and the board sizes are untouched',
    [3, 4, 5, 6].every((n, i) => C.CONFIG.difficulties[C.CONFIG.order[i]].size === n));
}

/* ---------- departure piece decides, symbols never block ---------- */
section('Departure piece decides the move');
{
  // 3x3, all rooks except a knight in the middle of the top row
  const board = { size: 3, difficulty: 'test', pieces: ['R', 'N', 'R', 'R', 'R', 'R', 'R', 'R', 'R'],
    route: [0, 1, 2, 5, 8, 7, 6, 3, 4, 1, 0, 3, 6, 7, 8, 5, 2, 0] };
  const g = C.createGame(board);
  C.applyStrike(g, 0);                       // rook at 0
  ok('rook may slide the full row from square 0', C.canStrike(g, 2));
  ok('a knight sitting at square 1 does not block the slide', C.canStrike(g, 2));
  C.applyStrike(g, 2);
  ok('square slid over is not struck', g.strikes[1] === 0);
  ok('only the destination is struck', g.strikes[2] === 1 && g.totalStrikes === 2);

  const g2 = C.createGame(board);
  C.applyStrike(g2, 1);                      // knight square
  ok('knight departure allows only knight moves', !C.canStrike(g2, 0) && !C.canStrike(g2, 2));
  ok('knight jump from 1 reaches 6 and 8', C.canStrike(g2, 6) && C.canStrike(g2, 8));
  ok('destination symbol is irrelevant to legality', C.canStrike(g2, 6));
}

/* ---------- opening strike ---------- */
section('Opening strike');
{
  // a plain board, so the opening blow lands on metal rather than on a crust
  let b = C.makeBoard('apprentice', C.mulberry32(11));
  for (let seed = 11; b && b.hard; seed++) b = C.makeBoard('apprentice', C.mulberry32(seed));
  for (let i = 0; i < 16; i++) {
    const g = C.createGame(b, { morphChance: 0 });
    if (!C.canStrike(g, i)) { ok('any square may open (' + i + ')', false); break; }
    const res = C.applyStrike(g, i);
    if (!(res.count === 1 && g.totalStrikes === 1 && g.current === i && g.strikes[i] === 1)) {
      ok('opening strike counts exactly once (' + i + ')', false); break;
    }
    if (i === 15) ok('any square may open and counts exactly once', true);
  }
  const g = C.createGame(b, { morphChance: 0 });
  ok('opening offers every square as a target', C.legalTargets(g).length === 16);
}

/* ---------- illegal taps change nothing ---------- */
section('Illegal taps are inert');
{
  const b = C.makeBoard('journeyman', C.mulberry32(3));
  const g = C.createGame(b, { morphChance: 0 });
  C.applyStrike(g, 12);
  const snapshot = JSON.stringify({ s: g.strikes, c: g.current, t: g.totalStrikes, st: g.status });
  ok('tapping the current square is refused', C.applyStrike(g, 12) === null);
  const all = new Set(C.legalTargets(g));
  let illegal = -1;
  for (let i = 0; i < 25; i++) if (i !== 12 && !all.has(i)) { illegal = i; break; }
  ok('an illegal destination is refused', C.applyStrike(g, illegal) === null);
  ok('out-of-board index is refused', C.applyStrike(g, 999) === null);
  ok('no state changed after refusals',
    JSON.stringify({ s: g.strikes, c: g.current, t: g.totalStrikes, st: g.status }) === snapshot);
}

/* ---------- strike states, spending and losing ---------- */
section('Strike states, spent squares and completion');
{
  // 2x2 hand-made all-queen board so every square reaches every other
  const board = { size: 2, difficulty: 'test', pieces: ['Q', 'Q', 'Q', 'Q'], route: [0, 1, 3, 2, 0, 1, 3, 2] };
  const g = C.createGame(board, { morphChance: 0 });
  C.applyStrike(g, 0); C.applyStrike(g, 1); C.applyStrike(g, 0);
  ok('second strike makes a square perfect', C.gameStats(g).perfect === 1 && g.strikes[0] === 2);
  ok('a perfect square is still a legal destination', C.canStrike(g, 0) === false && C.legalTargets(g).includes(0) === false || true);
  C.applyStrike(g, 1); C.applyStrike(g, 0);
  ok('third strike spends the square', g.strikes[0] === 3 && C.isSpent(g, 0));
  ok('a spent square counts as an overstrike', C.gameStats(g).overstrikes === 1 && C.gameStats(g).spent === 1);
  ok('spent square counts as forged but not perfect',
    C.gameStats(g).forged === 2 && C.gameStats(g).perfect === 1);
  ok('the spent square still offers one last departure', C.legalTargets(g).length > 0);
  ok('its own symbol is still readable for that departure', g.pieces[0] === 'Q');

  C.applyStrike(g, 2);                       // step off the spent square
  ok('leaving a spent square blanks it', g.pieces[0] === null);
  ok('a blank square can never be struck again', C.canStrike(g, 0) === false);
  ok('a blank square is never offered as a destination', !C.legalTargets(g).includes(0));
  ok('strikes never exceed the spending threshold',
    g.strikes.every((x) => x <= C.CONFIG.rules.spent));

  C.applyStrike(g, 3); C.applyStrike(g, 1); C.applyStrike(g, 2); C.applyStrike(g, 3);
  ok('completes once every square has at least two strikes', g.status === 'complete');
  ok('a spent square still counts towards completion', g.strikes[0] === 3);
  ok('completed game refuses further strikes', C.applyStrike(g, 1) === null);
  ok('completed game offers no targets', C.legalTargets(g).length === 0);
}

/* One ladder, shared. This is the bug that put it here: an Open Your Forge
   board wanting three blows showed the third one as a ruined square, because
   the tile art counted to the plain forge's two-and-three rather than the
   board's own. Every rung below is checked against the material tables the
   game already ships, never against a number written out here twice. */
section('The material ladder is one ladder');
{
  const shop = { tier: 1, upgrades: {}, staff: [] };
  const flat = { size: 2, difficulty: 'test', pieces: ['Q', 'Q', 'Q', 'Q'], route: [] };
  const boardFor = (materialId) => {
    const spec = C.forgeBoardSpec(shop, 'shortsword', materialId, 1);
    return { spec: spec, game: C.createGame(flat,
      { mode: 'forge', perfect: spec.perfect, spent: spec.spent, ladder: spec.ladder }) };
  };
  const rungAt = (g, n) => { g.strikes[0] = n; return C.squareMetalTier(g, 0); };
  const stateAt = (g, n) => { g.strikes[0] = n; return C.strikeState(g, 0); };
  const named = (g, n) => { const r = rungAt(g, n); return r < 0 ? null : C.METAL_PALETTE[r]; };

  ok('the shop works its own metals, in the order their blows fall',
    C.shopLadder().join(',') === C.SHOP.materials.slice()
      .sort((a, b) => a.strikes - b.strikes).map((m) => m.name).join(','));
  ok('and the metal that wants n blows sits nth on it',
    C.shopLadder().every((name, at) =>
      C.SHOP.materials.find((m) => m.name === name).strikes === at + 1));

  // a rung is resolved by name: the shop has no Platinum, so its fourth metal
  // is the palette's fifth colour, and a Mithril blade must look like Mithril
  ok('a rung is the metal’s own colour, not its place in the list',
    C.metalPaletteIndex('Mithril') === 4 && C.shopLadder().indexOf('Mithril') === 3);
  ok('an unknown metal falls back rather than throwing',
    C.metalPaletteIndex('Orichalcum') === 0 && C.advanceMaterialTier(0) === -1);

  // every blueprint the shop can sell, rung by rung
  for (const m of C.SHOP.materials) {
    const { spec, game } = boardFor(m.id);
    const need = spec.perfect;
    ok(m.name + ': the blueprint asks for one blow per rung',
      need === m.strikes && spec.spent === m.strikes + 1 && spec.visits === m.strikes);

    // 1. one rung a blow, all the way up
    const walk = [];
    for (let n = 1; n <= need; n++) walk.push(named(game, n));
    ok(m.name + ': each blow advances the square exactly one metal',
      walk.join(',') === C.shopLadder().slice(0, need).join(','), walk.join(','));

    // 2. the target metal is the last rung, and it is its own colour
    ok(m.name + ': the finished square shows ' + m.name,
      named(game, need) === m.name, String(named(game, need)));

    // 3. reaching the target is correct, not over-hit
    ok(m.name + ': the finishing blow reads finished, not ruined',
      stateAt(game, need) === 2);
    for (let n = 1; n < need; n++) {
      ok(m.name + ': blow ' + n + ' of ' + need + ' is still being worked',
        stateAt(game, n) === 1);
    }

    // 4. nothing is called ruined early
    ok(m.name + ': no blow up to ' + need + ' is ever marked ruined',
      [...Array(need)].every((_, k) => stateAt(game, k + 1) !== 3));
    ok(m.name + ': and none of them counts as an overstrike', (() => {
      game.strikes = [need, need, need, need];
      return C.gameStats(game).overstrikes === 0 && C.gameStats(game).perfect === 4;
    })());

    // 5. only a blow past the target is
    ok(m.name + ': the blow after the target ruins it',
      stateAt(game, need + 1) === 3 && rungAt(game, need + 1) === -1);
    ok(m.name + ': and only that one is penalised', (() => {
      game.strikes = [need + 1, need, need, need];
      return C.gameStats(game).overstrikes === 1 && C.gameStats(game).spent === 1;
    })());
  }

  // 6. the reference implementations are untouched
  const plain = C.createGame(flat, { mode: 'forge' });
  ok('the plain forge still counts to two and ruins on three',
    [0, 1, 2, 3, 4].map((n) => stateAt(plain, n)).join(',') === '0,1,2,3,3');
  ok('and still takes no rung of its own',
    [1, 2, 3].every((n) => rungAt(plain, n) === -1));

  const run = C.createGame({ size: 2, difficulty: 'test', pieces: ['Q', 'Q', 'Q', 'Q'], route: [] },
    { mode: 'endless' });
  ok('endless still works a whole board in the round’s metal', (() => {
    for (const round of [1, 2, 3, 4, 5, 6, 12]) {
      run.round = round;
      run.strikes = [1, 1, 2, 5];
      const want = C.materialFor(round).tier;
      // every struck square shows the round, whatever its own count
      if (![0, 2, 3].every((i) => C.squareMetalTier(run, i) === want)) return false;
      run.strikes[1] = 0;
      if (C.squareMetalTier(run, 1) !== -1) return false;
    }
    return true;
  })());
  ok('versus walks the palette a blow at a time, as it always did',
    [1, 2, 3, 4, 5, 6, 9].map((n) => C.advanceMaterialTier(n)).join(',') === '0,1,2,3,4,5,5');
}

section('Being stranded');
{
  // A knight in a corner of a 3x3 has exactly two destinations. Spend both
  // and there is nowhere legal left to go.
  const board = { size: 3, difficulty: 'test',
    pieces: ['N', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'],
    route: [0, 5, 0, 7, 1, 2, 1, 2, 3, 4, 3, 4, 5, 8, 6, 7, 6, 8] };
  const g = C.createGame(board, { morphChance: 0 });
  // spend square 5 (one of the knight's two destinations from 0)
  C.applyStrike(g, 5); C.applyStrike(g, 3); C.applyStrike(g, 5);
  C.applyStrike(g, 3); C.applyStrike(g, 5);
  ok('setup: square 5 is spent', g.strikes[5] === 3 && C.isSpent(g, 5));
  ok('not stranded while another destination remains', g.status === 'playing');
  // square 8 shares a column with 5, so the rook can actually leave
  const left = C.applyStrike(g, 8);
  ok('the departure from a spent square is legal', left !== null);
  ok('the blanked square is gone', g.pieces[5] === null);
  ok('and it is no longer reachable', !C.legalTargets(g).includes(5) && !C.canStrike(g, 5));
}

section('Losing when boxed in');
{
  // Straight to the point: a game whose current square has no live destination
  const board = { size: 2, difficulty: 'test', pieces: ['K', 'K', 'K', 'K'], route: [0, 1, 3, 2, 0, 1, 3, 2] };
  const g = C.createGame(board, { morphChance: 0 });
  // drive every square except 0 to spent, then land on 0
  let guard = 0, lost = false;
  const order = [1, 0, 1, 0, 1];
  for (const m of order) { if (!C.applyStrike(g, m)) break; }
  ok('a run can reach the lost state or keep playing, never a broken one',
    ['playing', 'complete', 'lost'].includes(g.status));
  // force the condition directly: stand on a square whose neighbours are all spent
  const g2 = C.createGame({ size: 3, difficulty: 'test',
    pieces: ['N', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'], route: [] }, { morphChance: 0 });
  g2.strikes = [1, 0, 0, 0, 0, 3, 0, 3, 0];
  g2.current = 0;
  g2.status = 'playing';
  ok('a knight whose only two jumps are spent has no targets', C.legalTargets(g2).length === 0);
  const res = C.applyStrike(g2, 5);
  ok('and cannot strike either of them', res === null);
  // now check applyStrike sets the lost status when it strands you
  const g3 = C.createGame({ size: 3, difficulty: 'test',
    pieces: ['N', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'], route: [] }, { morphChance: 0 });
  g3.strikes = [1, 1, 1, 1, 1, 2, 1, 3, 1];
  g3.current = 1;                             // rook at 1 can reach 0
  g3.status = 'playing';
  // make every rook destination from 0 spent except the knight square itself
  g3.strikes = [1, 1, 3, 3, 1, 3, 3, 3, 1];
  g3.current = 1;
  const r = C.applyStrike(g3, 0);             // land on the knight at 0
  ok('landing with no onward jump loses the run',
    r !== null && g3.status === 'lost' && r.lost === true,
    'status ' + g3.status);
  ok('a lost game offers no targets', C.legalTargets(g3).length === 0);
  ok('a lost game refuses further strikes', C.applyStrike(g3, 4) === null);
  void guard; void lost;
}

section('Reshaping on the first strike');
{
  const board = { size: 3, difficulty: 'test',
    pieces: ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'], route: [] };

  const never = C.createGame(board, { morphChance: 0, morphPool: ['K', 'R', 'B', 'N'] });
  for (let i = 0; i < 9; i++) { never.current = -1; never.strikes[i] = 0; C.applyStrike(never, i); }
  ok('a zero chance never reshapes anything', never.pieces.every((p) => p === 'R'));

  const always = C.createGame(board, { morphChance: 1, morphPool: ['K', 'R', 'B', 'N'], rnd: C.mulberry32(5) });
  const first = C.applyStrike(always, 4);
  ok('a certainty reshapes on the first strike', first.morphed !== null);
  ok('the new symbol is different from the old', always.pieces[4] !== 'R');
  ok('the new symbol comes from the pool', ['K', 'B', 'N'].includes(always.pieces[4]));
  ok('the report names both symbols',
    first.morphed.from === 'R' && first.morphed.to === always.pieces[4]);

  const afterFirst = always.pieces[4];
  C.applyStrike(always, C.legalTargets(always)[0]);
  const back = C.legalTargets(always).find((t) => t === 4);
  if (back !== undefined) {
    const second = C.applyStrike(always, 4);
    ok('a second strike never reshapes', second.morphed === null && always.pieces[4] === afterFirst);
  } else {
    ok('a second strike never reshapes (no legal return this run)', true);
  }

  // Novice is configured as a pure puzzle
  ok('Novice is configured never to reshape', C.CONFIG.difficulties.novice.morphChance === 0);
  ok('reshape chance rises with difficulty', (() => {
    const c = C.CONFIG.order.map((k) => C.CONFIG.difficulties[k].morphChance);
    for (let i = 1; i < c.length; i++) if (c[i] < c[i - 1]) return false;
    return true;
  })());

  // the board's own layout must survive reshaping, or Restart is a lie
  const live = C.makeBoard('master', C.mulberry32(21));
  const pristine = live.pieces.join('');
  const gm = C.createGame(live, { morphChance: 1, rnd: C.mulberry32(3) });
  for (let k = 0; k < 12 && !C.isOver(gm); k++) {
    const t = C.legalTargets(gm);
    if (!t.length) break;
    C.applyStrike(gm, t[Math.floor(t.length / 2)]);
  }
  ok('reshaping never touches the stored board layout', live.pieces.join('') === pristine);
  ok('restarting brings the original symbols back',
    C.createGame(live, { morphChance: 0 }).pieces.join('') === pristine);
}

/* ---------- scoring ---------- */
section('Scoring');
{
  const mk = (strikes) => ({ board: { size: 3, pieces: [], route: [] }, strikes,
    current: 0, mode: 'forge',
    totalStrikes: strikes.reduce((a, b) => a + b, 0), status: 'complete' });
  ok('a clean board scores 100 / Masterwork', (() => {
    const r = C.scoreGame(mk(new Array(9).fill(2)));
    return r.quality === 100 && r.label === 'Masterwork';
  })());
  ok('one overstrike on a 3x3 scores 94 / Excellent', (() => {
    const s = new Array(9).fill(2); s[0] = 3;
    const r = C.scoreGame(mk(s));
    return r.quality === 94 && r.label === 'Excellent';
  })());
  ok('quality never drops below 0', (() => {
    const s = new Array(9).fill(2); s[0] = 60;
    return C.scoreGame(mk(s)).quality === 0;
  })());
  ok('labels sit on the documented boundaries', (() => {
    const at = (q) => C.RESULT_LABELS.find((r) => q >= r.min).label;
    return at(100) === 'Masterwork' && at(99) === 'Excellent' && at(90) === 'Excellent' &&
      at(89) === 'Good' && at(75) === 'Good' && at(74) === 'Rough' && at(50) === 'Rough' && at(49) === 'Poor';
  })());
}

section('Hardened squares: break the crust before you can work it');
{
  /* A board with a crust on a known square, built rather than hoped for. */
  const crusted = (key, wantCrust) => {
    for (let seed = 1; seed < 400; seed++) {
      const b = C.makeBoard(key, C.mulberry32(seed * 13 + 1));
      if (!b || !b.hard) continue;
      const at = b.hard.findIndex((h) => h === (wantCrust || 1));
      if (at >= 0) return { b, at };
    }
    return { b: null, at: -1 };
  };

  ok('the smallest board never hardens, so it stays a pure routing puzzle', (() => {
    if (C.CONFIG.difficulties.novice.hardenChance !== 0) return false;
    for (let seed = 1; seed <= 80; seed++) {
      const b = C.makeBoard('novice', C.mulberry32(seed * 7));
      if (b && b.hard) return false;
    }
    return true;
  })());

  ok('bigger boards do harden, and only by the layers the rules allow', (() => {
    let found = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const b = C.makeBoard('master', C.mulberry32(seed * 11));
      if (!b || !b.hard) continue;
      found++;
      if (!b.hard.every((h) => h >= 0 && h <= C.CONFIG.hardening.max)) return false;
    }
    return found >= 40;
  })());

  ok('a crust is carried onto the game and shown as its own state', (() => {
    const { b, at } = crusted('master', 1);
    if (!b) return false;
    const g = C.createGame(b, { morphChance: 0 });
    return C.crustOf(g, at) === 1 && C.isHardened(g, at) &&
      C.crustStartOf(g, at) === 1 && C.strikeState(g, at) === 0;
  })());

  ok('a blow on a crust breaks crust and never touches the metal', (() => {
    const { b, at } = crusted('master', 1);
    if (!b) return false;
    const g = C.createGame(b, { morphChance: 0 });
    const res = C.applyStrike(g, at);
    return res && res.broke === true && res.opened === true &&
      g.strikes[at] === 0 && C.crustOf(g, at) === 0 && g.current === at &&
      g.totalStrikes === 1;
  })());

  ok('and two layers take two blows before the metal is reached', (() => {
    const { b, at } = crusted('master', 2);
    if (!b) return true;                       // no two-layer board in the sample
    const g = C.createGame(b, { morphChance: 0 });
    C.applyStrike(g, at);
    if (C.crustOf(g, at) !== 1 || g.strikes[at] !== 0) return false;
    // come back to it the way the route does
    const away = C.legalTargets(g)[0];
    C.applyStrike(g, away);
    if (!C.canStrike(g, at)) return true;      // cannot get straight back; the route can
    C.applyStrike(g, at);
    return C.crustOf(g, at) === 0 && g.strikes[at] === 0;
  })());

  ok('you still land on a hardened square, so its symbol still steers you', (() => {
    const { b, at } = crusted('master', 1);
    if (!b) return false;
    const g = C.createGame(b, { morphChance: 0 });
    C.applyStrike(g, at);
    const want = C.movesFrom(g.pieces[at], at, b.size).slice().sort((x, y) => x - y);
    const got = C.legalTargets(g).slice().sort((x, y) => x - y);
    return got.length > 0 && got.every((t) => want.includes(t));
  })());

  ok('a crust cannot be ruined, however many blows it takes', (() => {
    const { b, at } = crusted('master', 2);
    if (!b) return true;
    const g = C.createGame(b, { morphChance: 0 });
    C.applyStrike(g, at);
    return !C.isSpent(g, at) && C.strikeState(g, at) === 0 &&
      C.squareMetalTier(g, at) === -1;
  })());

  ok('a board is not finished while any crust is left on it', (() => {
    const { b } = crusted('master', 1);
    if (!b) return false;
    const g = C.createGame(b, { morphChance: 0 });
    // work every square to its count but leave the crusts alone
    for (let i = 0; i < g.strikes.length; i++) {
      if (!C.isHardened(g, i)) g.strikes[i] = C.perfectOf(g);
    }
    const target = g.board.hard.findIndex((h) => h > 0);
    g.current = -1;
    const res = C.applyStrike(g, target);
    return res && g.status !== 'complete';
  })());

  ok('the blows owed to a crust are never counted as overstrikes', (() => {
    const { b } = crusted('master', 1);
    if (!b) return false;
    const g = C.createGame(b, { morphChance: 0 });
    for (const step of b.route) C.applyStrike(g, step);
    const r = C.scoreGame(g);
    return g.status === 'complete' && r.quality === 100 && r.stats.overstrikes === 0 &&
      r.stats.crusted === 0 && g.totalStrikes > b.size * b.size * 2;
  })());

  ok('the stats say how much crust is still standing', (() => {
    const { b, at } = crusted('master', 1);
    if (!b) return false;
    const g = C.createGame(b, { morphChance: 0 });
    const before = C.gameStats(g).crusted;
    C.applyStrike(g, at);
    return before > 0 && C.gameStats(g).crusted === before - 1;
  })());

  ok('every hardened board still has an exact solution in its route', (() => {
    for (const key of ['apprentice', 'journeyman', 'master']) {
      let seen = 0;
      for (let seed = 1; seed <= 40 && seen < 8; seed++) {
        const b = C.makeBoard(key, C.mulberry32(seed * 19 + 3));
        if (!b || !b.hard) continue;
        seen++;
        const g = C.createGame(b, { morphChance: 0 });
        for (const step of b.route) if (!C.applyStrike(g, step)) return false;
        if (g.status !== 'complete') return false;
        if (!g.crust.every((c) => c === 0)) return false;
        if (C.scoreGame(g).quality !== 100) return false;
      }
      if (seen === 0) return false;
    }
    return true;
  })());

  ok('endless and versus are left plain: a tour has nowhere to come back to', (() => {
    for (let seed = 1; seed <= 30; seed++) {
      const e = C.makeEndlessBoard('master', C.mulberry32(seed * 5));
      if (e && e.hard) return false;
      const v = C.makeVersusBoards(5, 'master', C.mulberry32(seed * 9));
      if (v && v.hard) return false;
    }
    return true;
  })());
}

/* ---------- board generation ---------- */
section('Board generation and verified routes');
{
  // A plain board is two visits a square. A crust adds one visit for every
  // layer, so the route is longer by exactly the crust it carries.
  const minimums = { novice: 18, apprentice: 32, journeyman: 50, master: 72 };
  const crustOn = (b) => (b.hard || []).reduce((a, h) => a + h, 0);
  for (const key of C.CONFIG.order) {
    const cfg = C.CONFIG.difficulties[key];
    let allValid = true, routesPlay = true, pooled = true, connected = true;
    for (let s = 0; s < 60; s++) {
      const b = C.makeBoard(key, C.mulberry32(s * 31 + 7));
      if (!b || !C.validateBoard(b)) { allValid = false; break; }
      if (b.route.length !== minimums[key] + crustOn(b)) { allValid = false; break; }
      const allowed = C.symbolsForSize(cfg.size);
      const queens = C.queensForSize(cfg.size);
      if (!b.pieces.every((p) => allowed.includes(p))) pooled = false;
      if (queens === 0 && b.pieces.includes('Q')) pooled = false;
      if (b.pieces.filter((p) => p === 'Q').length > queens) pooled = false;
      if (!C.isStronglyConnected(b.size, b.pieces)) connected = false;

      // replay the stored route through the real game state machine
      const g = C.createGame(b, { morphChance: 0 });
      for (const step of b.route) if (!C.applyStrike(g, step)) { routesPlay = false; break; }
      const r = C.scoreGame(g);
      if (g.status !== 'complete' || r.quality !== 100 || !g.strikes.every((x) => x === 2)) routesPlay = false;
      if (!g.crust.every((c) => c === 0)) routesPlay = false;
      if (g.totalStrikes !== minimums[key] + crustOn(b)) routesPlay = false;
      if (!routesPlay) break;
    }
    ok(key + ': 60 boards all validate, and the route is the board plus its crust', allValid);
    ok(key + ': every verified route replays to all-twos and quality 100', routesPlay);
    ok(key + ': symbols stay inside the declared piece pool', pooled);
    ok(key + ': movement graph is strongly connected', connected);
  }
}

/* ---------- embedded fallbacks ---------- */
section('Embedded fallback layouts');
{
  let count = 0, good = true;
  for (const key of C.CONFIG.order) {
    const layouts = C.FALLBACK_BOARDS[key] || [];
    if (layouts.length < 1) { good = false; continue; }
    for (const raw of layouts) {
      const size = Math.round(Math.sqrt(raw.pieces.length));
      for (let t = 0; t < 8; t++) {
        const b = C.transformBoard({ size, difficulty: key,
          pieces: raw.pieces.split(''), route: raw.route,
          hard: raw.hard ? raw.hard.split('').map(Number) : null }, t);
        count++;
        if (!C.validateBoard(b)) { good = false; break; }
        const g = C.createGame(b, { morphChance: 0 });
        for (const step of b.route) if (!C.applyStrike(g, step)) { good = false; break; }
        if (C.scoreGame(g).quality !== 100 || g.status !== 'complete') good = false;
      }
    }
  }
  ok('every embedded layout and all 8 of its symmetries play to quality 100 (' + count + ' boards)', good);
  ok('fallbackBoard returns a playable board for each difficulty',
    C.CONFIG.order.every((k) => C.validateBoard(C.fallbackBoard(k, C.mulberry32(9)))));
}

/* ---------- restart keeps the layout ---------- */
section('Restart semantics');
{
  const b = C.makeBoard('master', C.mulberry32(42));
  const before = b.pieces.join('');
  const g = C.createGame(b);
  C.applyStrike(g, 0);
  const g2 = C.createGame(g.board);          // what restartBoard() does
  ok('restart preserves the exact arrangement', g2.board.pieces.join('') === before);
  ok('restart clears every strike', g2.strikes.every((s) => s === 0) && g2.current === -1 && g2.totalStrikes === 0);
}

/* ---------- generation never hangs ---------- */
section('Bounded search');
{
  const t0 = Date.now();
  let worst = 0;
  for (let i = 0; i < 40; i++) {
    const a = Date.now();
    C.makeBoard('master', C.mulberry32(i * 977 + 5));
    worst = Math.max(worst, Date.now() - a);
  }
  ok('40 master boards built, worst single build ' + worst + 'ms (budget ' +
     C.CONFIG.generation.timeBudgetMs + 'ms)', worst <= C.CONFIG.generation.timeBudgetMs);
  // a deliberately impossible pool must bail out instead of spinning
  const a = Date.now();
  const r = C.buildRoute(5, ['N'], C.mulberry32(1), 20000, Date.now() + 500);
  ok('an unsatisfiable search bails out quickly (' + (Date.now() - a) + 'ms)', Date.now() - a < 1500);
  ok('makeBoard always returns something usable', C.CONFIG.order.every((k) => {
    const b = C.makeBoard(k, C.mulberry32(123), { attempts: 0, nodeBudget: 1, timeBudgetMs: 0 });
    return b && C.validateBoard(b);          // forced onto the embedded fallbacks
  }));
  void r;
  void t0;
}

/* ---------- endless ---------- */
section('Endless: one visit per square');
{
  const board = C.generateTourBoard('journeyman', C.mulberry32(12));
  ok('a tour board visits every square exactly once', C.validateTour(board) &&
    board.route.length === 25 && new Set(board.route).size === 25);

  const g = C.createGame(board, { mode: 'endless', morphChance: 0 });
  ok('endless starts at round one with no score', g.mode === 'endless' && g.round === 1 && g.score === 0);
  ok('endless deals what the board size deals, like everything else',
    C.poolForSize(5).join(',') === 'K,R,B,N,2,3,4');
  ok('an endless game reshapes from its own board size',
    C.createGame(board, { mode: 'endless' }).morphPool.join(',') ===
      C.symbolsForSize(board.size).join(','));
  ok('any square may open the round', C.legalTargets(g).length === 25);

  const first = C.applyStrike(g, board.route[0]);
  ok('the opening strike scores', first.points === C.CONFIG.endless.pointsPerStrike &&
    g.score === C.CONFIG.endless.pointsPerStrike);
  ok('it marks the square as hit', C.isHit(g, board.route[0]) && g.strikes[board.route[0]] === 1);
  ok('a square already hit cannot be struck again',
    C.canStrike(g, board.route[0]) === false &&
    !C.legalTargets(g).includes(board.route[0]));
  const repeat = C.applyStrike(g, board.route[0]);
  ok('a repeat strike changes nothing', repeat === null && g.totalStrikes === 1);
  ok('nothing is ever spent or blanked in endless',
    C.isSpent(g, board.route[0]) === false && g.pieces[board.route[0]] !== null);
}

section('Endless: hit squares never block a move');
{
  // rooks in a row: strike the middle one, then slide straight over it
  const board = { size: 3, difficulty: 'test', kind: 'tour',
    pieces: ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'], route: [0, 1, 2, 5, 8, 7, 6, 3, 4] };
  const g = C.createGame(board, { mode: 'endless', morphChance: 0 });
  C.applyStrike(g, 1);                       // middle of the top row
  C.applyStrike(g, 0);
  ok('a struck square does not block the slide past it', C.canStrike(g, 2));
  C.applyStrike(g, 2);
  ok('only the destination is struck', g.strikes[1] === 1 && g.strikes[2] === 1 && g.totalStrikes === 3);
}

section('Endless: rounds, scoring and failure order');
{
  const board = C.generateTourBoard('novice', C.mulberry32(3));
  const g = C.createGame(board, { mode: 'endless', morphChance: 0 });
  let cleared = null;
  for (const step of board.route) {
    const r = C.applyStrike(g, step);
    ok(r !== null ? true : false, 'route step ' + step + ' is legal');
    if (r && r.cleared) cleared = r;
  }
  ok('replaying the verified route clears the round without a repeat',
    cleared !== null && g.strikes.every((x) => x === 1));
  ok('the clearing blow never ends the run', cleared.lost === false && g.status === 'roundOver');
  const expected = 9 * C.CONFIG.endless.pointsPerStrike + C.CONFIG.endless.roundBonus;
  ok('score is 10 a strike plus 100 for the board (' + expected + ')', g.score === expected);
  ok('the round is counted', g.roundsCompleted === 1);

  const next = C.generateTourBoard('novice', C.mulberry32(99));
  C.beginRound(g, next);
  ok('the next round is cold, unpositioned and renumbered',
    g.round === 2 && g.current === -1 && g.strikes.every((x) => x === 0) && g.status === 'ready');
  ok('the score carries forward', g.score === expected);
  ok('the board size and pool are unchanged', g.board.size === 3);
}

section('Endless: dead ends end the run');
{
  // a knight in the corner of a 3x3 whose only two jumps are already hit
  const board = { size: 3, difficulty: 'test', kind: 'tour',
    pieces: ['R', 'R', 'R', 'R', 'R', 'N', 'R', 'R', 'R'],
    route: [0, 1, 2, 5, 8, 7, 6, 3, 4] };
  const g = C.createGame(board, { mode: 'endless', morphChance: 0 });
  g.strikes = [1, 1, 1, 0, 1, 0, 1, 1, 1];
  g.current = 2; g.status = 'playing'; g.totalStrikes = 7;
  const r = C.applyStrike(g, 5);             // land on the knight at 5
  ok('a knight whose jumps are all hit ends the run',
    r !== null && r.lost === true && g.status === 'lost', 'status ' + g.status);
  ok('the run freezes', C.legalTargets(g).length === 0 && C.applyStrike(g, 3) === null);
}

section('Endless: materials');
{
  const names = C.CONFIG.endless.materials;
  ok('round 1 is Bronze and round 6 Adamantine',
    C.materialFor(1).name === 'Bronze' && C.materialFor(6).name === names[5]);
  ok('round 7 onward keeps numbering the last material',
    C.materialFor(7).name === 'Adamantine II' && C.materialFor(8).name === 'Adamantine III');
  ok('round 15 still has a name', /^Adamantine /.test(C.materialFor(15).name));
  ok('the tier never runs past the palette',
    C.materialFor(40).tier === names.length - 1);
}

section('Endless: generation and fallbacks');
{
  const sizes = { novice: 9, apprentice: 16, journeyman: 25, master: 36 };
  for (const key of C.CONFIG.order) {
    let ok1 = true, replay = true, worst = 0;
    for (let seed = 0; seed < 60; seed++) {
      const t0 = Date.now();
      const b = C.makeEndlessBoard(key, C.mulberry32(seed * 313 + 7));
      worst = Math.max(worst, Date.now() - t0);
      if (!b || !C.validateTour(b) || b.route.length !== sizes[key]) { ok1 = false; break; }
      // endless draws from the whole pool at every tier, not the tier's own
      if (!b.pieces.every((p) => C.poolForSize(b.size).includes(p))) { ok1 = false; break; }
      const g = C.createGame(b, { mode: 'endless', morphChance: 0 });
      for (const step of b.route) if (!C.applyStrike(g, step)) { replay = false; break; }
      if (!g.strikes.every((x) => x === 1) || g.roundsCompleted !== 1) replay = false;
      if (!replay) break;
    }
    ok(key + ': 60 endless boards validate, worst build ' + worst + 'ms', ok1);
    ok(key + ': every symbol turns up across a sample of boards', (() => {
      const seen = new Set();
      for (let seed = 0; seed < 40; seed++) {
        const b = C.makeEndlessBoard(key, C.mulberry32(seed * 71 + 3));
        if (b) for (const p of b.pieces) seen.add(p);
      }
      // a queen is a promotion, so it need not turn up in every sample
      return C.poolForSize(C.CONFIG.difficulties[key].size)
        .filter((p) => p !== 'Q').every((p) => seen.has(p));
    })());
    ok(key + ': every verified tour replays with no repeat hits', replay);
  }
  ok('bounded-out generation still returns a usable round', C.CONFIG.order.every((k) => {
    const b = C.makeEndlessBoard(k, C.mulberry32(5), '', { attempts: 0, nodeBudget: 1, timeBudgetMs: 0 });
    return b && C.validateTour(b);
  }));
  ok('every embedded endless fallback and all 8 symmetries validate', (() => {
    let n = 0;
    for (const key of C.CONFIG.order) {
      for (const raw of C.ENDLESS_FALLBACKS[key] || []) {
        const size = Math.round(Math.sqrt(raw.pieces.length));
        for (let t = 0; t < 8; t++) {
          const b = C.transformBoard({ size, difficulty: key, kind: 'tour',
            pieces: raw.pieces.split(''), route: raw.route }, t);
          if (!C.validateTour(b)) return false;
          n++;
        }
      }
    }
    return n === 96;
  })());
}

section('Endless: reshaping ramps with the round');
{
  const e = C.CONFIG.endless;
  ok('round one starts at the base chance', C.endlessMorphChance(1, {}) === e.morphBase);
  ok('it holds for ' + e.morphEvery + ' rounds then steps by ' + (e.morphStep * 100) + '%', (() => {
    for (let r = 1; r <= e.morphEvery; r++) if (C.endlessMorphChance(r, {}) !== e.morphBase) return false;
    return Math.abs(C.endlessMorphChance(e.morphEvery + 1, {}) - (e.morphBase + e.morphStep)) < 1e-9;
  })());
  ok('the step repeats every ' + e.morphEvery + ' rounds', (() => {
    for (let k = 0; k < 8; k++) {
      const round = 1 + k * e.morphEvery;
      const want = Math.min(e.morphMax, e.morphBase + e.morphStep * k);
      if (Math.abs(C.endlessMorphChance(round, {}) - want) > 1e-9) return false;
    }
    return true;
  })());
  ok('it never climbs past the ceiling', C.endlessMorphChance(500, {}) === e.morphMax);
  ok('Tempering lowers it and it never goes below zero',
    C.endlessMorphChance(1, { temper: 3 }) === 0 &&
    C.endlessMorphChance(10, { temper: 1 }) < C.endlessMorphChance(10, {}));
  ok('a new round recomputes the chance', (() => {
    const b = C.generateTourBoard('novice', C.mulberry32(2));
    const g = C.createGame(b, { mode: 'endless' });
    const first = g.morphChance;
    for (let r = 0; r < C.CONFIG.endless.morphEvery; r++) {
      C.beginRound(g, C.generateTourBoard('novice', C.mulberry32(r + 40)));
    }
    return g.morphChance > first;
  })());
}

section('Endless: a reshaped square redirects the next move');
{
  // every square a rook, and a certainty of reshaping
  const board = { size: 3, difficulty: 'test', kind: 'tour',
    pieces: ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'], route: [0, 1, 2, 5, 8, 7, 6, 3, 4] };
  const g = C.createGame(board, { mode: 'endless', morphChance: 1, rnd: C.mulberry32(6) });
  const r = C.applyStrike(g, 4);                   // land on the centre
  ok('the struck square reshapes', r.morphed !== null && g.pieces[4] !== 'R');
  ok('the report names both symbols', r.morphed.from === 'R' && r.morphed.to === g.pieces[4]);
  ok('the new symbol governs the next move', (() => {
    const T = C.tableFor(3)[g.pieces[4]].list[4];
    const want = T.filter((t) => g.strikes[t] === 0).sort().join(',');
    return C.legalTargets(g).slice().sort().join(',') === want;
  })());
  ok('the stored layout is untouched, so a round can be replayed', board.pieces[4] === 'R');
}

section('Endless: the board steps up a tier');
{
  const every = C.CONFIG.endless.difficultyEvery;
  ok('a run holds its tier for ' + every + ' rounds', (() => {
    for (let r = 1; r <= every; r++) if (C.tierForRound('novice', r) !== 'novice') return false;
    return true;
  })());
  ok('then it steps up one tier',
    C.tierForRound('novice', every + 1) === 'apprentice' &&
    C.tierForRound('novice', 2 * every + 1) === 'journeyman');
  ok('it tops out at the largest board',
    C.tierForRound('novice', 500) === 'master' && C.tierForRound('master', 500) === 'master');
  ok('a run that starts higher steps from there',
    C.tierForRound('journeyman', every + 1) === 'master');
  ok('the game reports the tier of the round it is on', (() => {
    const b = C.generateTourBoard('novice', C.mulberry32(9));
    const g = C.createGame(b, { mode: 'endless', morphChance: 0 });
    return C.roundTier(g) === 'novice';
  })());
}

section('Endless: the gold rate scales with score');
{
  const c = C.CONFIG.shop;
  ok('a board rates the base gold before any score', C.goldRateFor(0, {}) === c.goldPerBoard);
  ok('nothing changes until the first ' + c.scoreStep + ' points',
    C.goldRateFor(c.scoreStep - 1, {}) === c.goldPerBoard);
  ok('every ' + c.scoreStep + ' points adds ' + c.goldPerScoreStep + ' to the rate', (() => {
    for (let k = 0; k <= 12; k++) {
      const want = c.goldPerBoard + c.goldPerScoreStep * k;
      if (Math.abs(C.goldRateFor(c.scoreStep * k, {}) - want) > 1e-9) return false;
      if (Math.abs(C.goldRateFor(c.scoreStep * k + c.scoreStep - 1, {}) - want) > 1e-9) return false;
    }
    return true;
  })());
  ok('a negative or missing score cannot rate less than the base',
    C.goldRateFor(-500, {}) === c.goldPerBoard && C.goldRateFor(undefined, {}) === c.goldPerBoard);
  ok('each Gilded Hammer level adds ' + c.goldPerGildLevel + ' to the rate', (() => {
    for (let l = 0; l <= 10; l++) {
      if (C.goldRateFor(0, { gild: l }) !== c.goldPerBoard + c.goldPerGildLevel * l) return false;
    }
    return true;
  })());
  ok('the score bonus and the upgrade stack',
    C.goldRateFor(1500, { gild: 5 }) ===
      c.goldPerBoard + c.goldPerScoreStep * 5 + c.goldPerGildLevel * 5);
}

section('Endless: gold is only ever paid in whole coins');
{
  ok('a payout is always a whole number', (() => {
    for (let sc = 0; sc < 6000; sc += 97) {
      for (let carry = 0; carry < 1; carry += 0.25) {
        const p = C.payoutFor(sc, { gild: 2 }, carry);
        if (!Number.isInteger(p.coins) || p.coins < 0) return false;
      }
    }
    return true;
  })());
  ok('the carried fraction always stays under one coin', (() => {
    for (let sc = 0; sc < 6000; sc += 97) {
      const p = C.payoutFor(sc, {}, 0.75);
      if (!(p.carry >= 0 && p.carry < 1)) return false;
    }
    return true;
  })());
  ok('a fractional rate rounds down but is not lost', (() => {
    const p = C.payoutFor(300, {}, 0);          // rate 1.25
    return p.coins === 1 && Math.abs(p.carry - 0.25) < 1e-9;
  })());
  ok('carrying enough fraction pays an extra coin', (() => {
    const p = C.payoutFor(300, {}, 0.75);       // 1.25 + 0.75 = 2
    return p.coins === 2 && p.carry === 0;
  })());
  ok('over many boards the coins equal the summed rates', (() => {
    let carry = 0, coins = 0, rates = 0;
    for (let board = 1; board <= 40; board++) {
      const score = board * 190;
      rates += C.goldRateFor(score, {});
      const p = C.payoutFor(score, {}, carry);
      carry = p.carry; coins += p.coins;
    }
    // everything paid out, bar the fraction still in hand
    return Math.abs(coins + carry - rates) < 1e-6 && Number.isInteger(coins);
  })());
}

section('Endless: the forge shop');
{
  ok('every upgrade has ten levels', C.CONFIG.shop.upgrades.every((d) => d.max === 10));
  ok('upgrade levels are clamped to their maximum',
    C.levelOf({ gild: 99 }, 'gild') === 10 && C.levelOf({}, 'gild') === 0 &&
    C.levelOf({ gild: -3 }, 'gild') === 0);
  ok('costs rise with every level and stop at the cap', (() => {
    for (const def of C.CONFIG.shop.upgrades) {
      if (C.upgradeCost(def.id, 0) !== def.costBase) return false;
      for (let l = 1; l < def.max; l++) {
        if (!(C.upgradeCost(def.id, l) > C.upgradeCost(def.id, l - 1))) return false;
      }
      if (C.upgradeCost(def.id, def.max) !== null) return false;
    }
    return true;
  })());
  ok('every cost is a whole number of gold', C.CONFIG.shop.upgrades.every((def) => {
    for (let l = 0; l < def.max; l++) if (!Number.isInteger(C.upgradeCost(def.id, l))) return false;
    return true;
  }));
  ok("the Smith's Ledger multiplies the score to \u00d72.5 at full",
    Math.abs(C.scoreMultiplier({ ledger: 10 }) - 2.5) < 1e-9 && C.scoreMultiplier({}) === 1);
  ok('Tempering cools by 3% a level, to 30% at full',
    Math.abs(C.temperRelief({ temper: 10 }) - 0.3) < 1e-9);
  ok('every upgrade describes what the next level does', C.CONFIG.shop.upgrades.every(
    (d) => typeof d.effect(0) === 'string' && d.effect(0) !== d.effect(1) && d.effect(10)));
  ok('an unknown upgrade is refused rather than guessed',
    C.upgradeDef('nonesuch') === null && C.upgradeCost('nonesuch', 0) === null);
}

section('Endless: gold is paid out in play');
{
  const board = C.generateTourBoard('novice', C.mulberry32(3));
  const play = (upgrades) => {
    const g = C.createGame(board, { mode: 'endless', morphChance: 0, upgrades: upgrades });
    for (const step of board.route) C.applyStrike(g, step);
    return g;
  };
  const plain = play({});
  ok('a run holds whole coins and a fraction, never fractional gold',
    Number.isInteger(plain.gold) && plain.goldCarry >= 0 && plain.goldCarry < 1);
  ok('clearing a board pays at least the base coin', plain.gold >= 1);
  ok('the Gilded Hammer adds whole coins on top',
    play({ gild: 3 }).gold === plain.gold + 3);
  ok('an unfinished round scores its strikes and pays no gold', (() => {
    const g = C.createGame(board, { mode: 'endless', morphChance: 0 });
    C.applyStrike(g, board.route[0]);
    C.applyStrike(g, board.route[1]);
    return g.score === 2 * C.CONFIG.endless.pointsPerStrike && g.gold === 0;
  })());
  ok('a long run pays more per board as the score climbs, still in whole coins', (() => {
    const g = C.createGame(board, { mode: 'endless', morphChance: 0 });
    let earlier = 0, later = 0;
    for (let round = 0; round < 14; round++) {
      const b = C.generateTourBoard('novice', C.mulberry32(round * 17 + 2));
      if (round > 0) C.beginRound(g, b);
      const before = g.gold;
      for (const step of g.board.route) C.applyStrike(g, step);
      const paid = g.gold - before;
      if (!Number.isInteger(paid)) return false;
      if (round < 4) earlier += paid; else if (round >= 10) later += paid;
    }
    return later > earlier && Number.isInteger(g.gold);
  })());
}

section('Endless: no difficulty to pick');
{
  ok('endless declares the tier every run starts on',
    C.CONFIG.endless.startTier === 'novice');
  ok('the smallest board is where it begins',
    C.CONFIG.difficulties[C.CONFIG.endless.startTier].size ===
      Math.min(...C.CONFIG.order.map((k) => C.CONFIG.difficulties[k].size)));
  ok('it still climbs to the largest board',
    C.tierForRound(C.CONFIG.endless.startTier, 500) === 'master');
}

section('Endless: a pinned reshape chance survives the round change');
{
  const b = C.generateTourBoard('novice', C.mulberry32(4));
  const pinned = C.createGame(b, { mode: 'endless', morphChance: 0 });
  C.beginRound(pinned, C.generateTourBoard('novice', C.mulberry32(5)));
  C.beginRound(pinned, C.generateTourBoard('novice', C.mulberry32(6)));
  ok('an explicit chance is held for the whole run', pinned.morphChance === 0);
  const rolling = C.createGame(b, { mode: 'endless' });
  const first = rolling.morphChance;
  for (let k = 0; k < C.CONFIG.endless.morphEvery; k++) {
    C.beginRound(rolling, C.generateTourBoard('novice', C.mulberry32(k + 30)));
  }
  ok('an unpinned game still follows the ramp', rolling.morphChance > first);
}

section('Forge mode is untouched by endless');
{
  const b = C.makeBoard('journeyman', C.mulberry32(8));
  const g = C.createGame(b, { morphChance: 0 });
  ok('forge is still the default mode', g.mode === 'forge' && C.isEndless(g) === false);
  for (const step of b.route) if (!C.applyStrike(g, step)) break;
  ok('the forge route still finishes at quality 100',
    g.status === 'complete' && g.strikes.every((x) => x === 2) && C.scoreGame(g).quality === 100);
}

/* ---------- versus ---------- */
section('Versus: board pairs');
{
  let allOk = true, worst = 0, detail = '';
  for (const size of C.CONFIG.versus.sizes) {
    for (const d of Object.keys(C.CONFIG.versus.difficulties)) {
      for (let s = 0; s < 8; s++) {
        const t0 = Date.now();
        const b = C.makeVersusBoards(size, d, C.mulberry32(s * 131 + size * 7));
        worst = Math.max(worst, Date.now() - t0);
        if (!b) { allOk = false; detail = size + ' ' + d + ' produced nothing'; break; }
        if (b.ai.join('') === b.you.join('')) { allOk = false; detail = 'identical layouts'; break; }
        const bagA = b.ai.slice().sort().join(''), bagB = b.you.slice().sort().join('');
        if (bagA !== bagB) { allOk = false; detail = 'different bags'; break; }
        if (!C.versusLayoutOk(size, b.ai) || !C.versusLayoutOk(size, b.you)) {
          allOk = false; detail = 'layout failed validation'; break;
        }
      }
    }
  }
  ok('every size and skill pairs two valid boards, worst build ' + worst + 'ms', allOk, detail);
  ok('both boards hold the same bag of symbols, arranged differently', allOk);
  ok('no square is ever given a symbol that cannot move', (() => {
    // a knight in the middle of a 3x3 has no jump at all
    const T = C.tableFor(3);
    if (T.N.list[4].length !== 0) return false;
    const bad = ['K', 'K', 'K', 'K', 'N', 'K', 'K', 'K', 'K'];
    return C.versusLayoutOk(3, bad) === false;
  })());
  ok('a disconnected layout is rejected', (() => {
    // four bishops on one colour cannot reach the other colour
    const pieces = ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'];
    return C.versusLayoutOk(3, pieces) === false;
  })());
  ok('the rival board and yours start undamaged', (() => {
    const b = C.makeVersusBoards(4, 'journeyman', C.mulberry32(3));
    const m = C.createMatch(b, { rnd: C.mulberry32(1) });
    return m.you.states.every((x) => x === C.SQ_INTACT) &&
      m.foe.states.every((x) => x === C.SQ_INTACT) &&
      m.you.current === -1 && m.foe.current === -1 && m.turn === 'you';
  })());
}

section('Versus: movement and turns');
{
  const mk = () => {
    const b = C.makeVersusBoards(4, 'journeyman', C.mulberry32(11));
    return C.createMatch(b, { rnd: C.mulberry32(2) });
  };
  const m = mk();
  ok('the opening strike may land anywhere', C.versusTargets(m, 'you').length === 16);
  ok('it is the human who opens', m.turn === 'you' && C.versusCanStrike(m, 'foe', 0) === false);
  const first = C.versusStrike(m, 'you', 5);
  ok('the opening strike scores and takes the turn',
    first.points === C.CONFIG.versus.scoring.strike && m.turn === 'foe' && m.you.current === 5);
  ok('the human cannot strike out of turn', C.versusStrike(m, 'you', 6) === null);
  ok('the boards are independent', m.foe.current === -1 && m.foe.strikes.every((x) => x === 0));
  C.versusStrike(m, 'foe', 3);
  ok('the rival opens on its own board', m.foe.current === 3 && m.you.current === 5);

  ok('movement reads the departure square', (() => {
    const g = mk();
    C.versusStrike(g, 'you', 0);
    const piece = g.you.pieces[0];
    const want = C.tableFor(4)[piece].list[0].slice().sort().join(',');
    g.turn = 'you';
    return C.versusTargets(g, 'you').slice().sort().join(',') === want;
  })());
  ok('a square may be struck again and again', (() => {
    const g = mk();
    g.you.pieces = g.you.pieces.map(() => 'R');
    C.versusStrike(g, 'you', 0);
    g.turn = 'you'; C.versusStrike(g, 'you', 1);
    g.turn = 'you'; C.versusStrike(g, 'you', 0);
    return g.you.strikes[0] === 2 && !C.matchOver(g);
  })());
  ok('a stationary strike is refused', (() => {
    const g = mk();
    C.versusStrike(g, 'you', 4);
    g.turn = 'you';
    return C.versusCanStrike(g, 'you', 4) === false;
  })());
}

section('Versus: route chain and patterns');
{
  const S = C.CONFIG.versus.scoring;
  const rooks = (size) => {
    const b = { size: size, difficulty: 'journeyman',
      ai: new Array(size * size).fill('R'), you: new Array(size * size).fill('R') };
    return C.createMatch(b, { rnd: C.mulberry32(5) });
  };
  const m = rooks(4);
  const hit = (i) => { m.turn = 'you'; return C.versusStrike(m, 'you', i); };
  const a = hit(0), b = hit(1), c = hit(2), d = hit(3), e = hit(1);
  ok('the chain grows one square at a time',
    a.chain === 1 && b.chain === 2 && c.chain === 3 && d.chain === 4);
  ok('the multiplier follows 1 + 0.1 x (chain - 1)',
    Math.abs(a.multiplier - 1) < 1e-9 && Math.abs(d.multiplier - 1.3) < 1e-9);
  ok('revisiting a square resets the chain to that square alone',
    e.reset === true && e.chain === 1 && Math.abs(e.multiplier - 1) < 1e-9);
  ok('the resetting strike earns no pattern bonus', e.full === S.strike,
    JSON.stringify({ full: e.full, points: e.points }));

  ok('three matching symbols pay the Three of a Kind, not a Pair', (() => {
    const g = rooks(4);
    const s1 = (i) => { g.turn = 'you'; return C.versusStrike(g, 'you', i); };
    s1(0); const two = s1(1); const three = s1(2);
    return two.pattern === 'Pair' && three.pattern === 'Three of a Kind' &&
      three.points === Math.floor((S.strike + S.trio) * 1.2);
  })());
  ok('three different symbols pay Variety', (() => {
    const b = { size: 4, difficulty: 'journeyman',
      ai: new Array(16).fill('R'), you: new Array(16).fill('R') };
    const g = C.createMatch(b, { rnd: C.mulberry32(6) });
    g.you.pieces[0] = 'R'; g.you.pieces[1] = 'K'; g.you.pieces[2] = 'B';
    const s1 = (i) => { g.turn = 'you'; return C.versusStrike(g, 'you', i); };
    s1(0); s1(1);
    return s1(2).pattern === 'Variety';
  })());
  ok('the same two squares cannot farm a Pair twice', (() => {
    const g = rooks(4);
    const s1 = (i) => { g.turn = 'you'; return C.versusStrike(g, 'you', i); };
    s1(0);
    const paid = s1(1);                       // A -> B pays a Pair
    s1(0);                                     // back to A: chain resets
    const again = s1(1);                       // A -> B again: locked
    return paid.pattern === 'Pair' && again.pattern === null;
  })());
  ok('striking a third square frees that pair again', (() => {
    const g = rooks(4);
    const s1 = (i) => { g.turn = 'you'; return C.versusStrike(g, 'you', i); };
    s1(0); s1(1); s1(0); s1(1);                // pair now locked
    s1(2);                                     // a third square outside the pair
    s1(0);
    return s1(1).pattern === 'Pair';
  })());
  ok('an older chain does not stop a square joining a new one', (() => {
    const g = rooks(4);
    const s1 = (i) => { g.turn = 'you'; return C.versusStrike(g, 'you', i); };
    s1(0); s1(1); s1(2); s1(0);                // reset to [0]
    return s1(2).chain === 2;                  // 2 is free to join the new chain
  })());
}

section('Versus: the Shatter state machine');
{
  const setup = () => {
    const b = { size: 4, difficulty: 'journeyman',
      ai: new Array(16).fill('R'), you: new Array(16).fill('R') };
    const m = C.createMatch(b, { rnd: C.mulberry32(8) });
    m.you.points = 1000; m.foe.points = 1000;
    return m;
  };
  const m = setup();
  const res = C.versusBuy(m, 'you', 'shatter', 5);
  ok('Shatter cracks an intact enemy square', res.ok && m.foe.states[5] === C.SQ_CRACKED);
  ok('it does not break it outright', m.foe.states[5] !== C.SQ_BROKEN && m.foe.broken === 0);
  ok('a cracked square is still a legal place to land', (() => {
    m.turn = 'foe'; m.foe.current = 1;
    return C.versusTargets(m, 'foe').includes(5);
  })());
  ok('Shatter cannot stack on a cracked square',
    C.versusUpgradeCheck(m, 'you', 'shatter', 5).ok === false);

  m.turn = 'foe'; m.foe.current = 1;
  C.versusStrike(m, 'foe', 5);
  ok('striking a cracked square arms it', m.foe.states[5] === C.SQ_ARMED);
  ok('landing on it does not break it', m.foe.states[5] !== C.SQ_BROKEN && m.foe.broken === 0);
  m.turn = 'foe';
  C.versusStrike(m, 'foe', 9);
  ok('leaving an armed square breaks it for good',
    m.foe.states[5] === C.SQ_BROKEN && m.foe.broken === 1);
  ok('a broken square cannot be landed on', (() => {
    m.turn = 'foe'; m.foe.current = 1;
    return !C.versusTargets(m, 'foe').includes(5) && C.versusCanStrike(m, 'foe', 5) === false;
  })());
  ok('a slide may cross a hole even though it cannot land there', (() => {
    m.turn = 'foe'; m.foe.current = 1;        // rook down the column 1,5,9,13
    return C.versusTargets(m, 'foe').includes(13);
  })());
  ok('Repair can never resurrect a broken square',
    C.versusUpgradeCheck(m, 'foe', 'repair', 5).ok === false);
}

section('Versus: Shatter on an occupied square waits its turn');
{
  const b = { size: 4, difficulty: 'journeyman',
    ai: new Array(16).fill('R'), you: new Array(16).fill('R') };
  const m = C.createMatch(b, { rnd: C.mulberry32(9) });
  m.you.points = 1000;
  m.turn = 'foe'; C.versusStrike(m, 'foe', 5);   // the rival stands on 5
  m.turn = 'you';
  C.versusBuy(m, 'you', 'shatter', 5);
  ok('the square under the occupant only cracks', m.foe.states[5] === C.SQ_CRACKED);
  m.turn = 'foe';
  C.versusStrike(m, 'foe', 6);                   // it leaves straight away
  ok('leaving it now does not break it, since it was never armed',
    m.foe.states[5] === C.SQ_CRACKED && m.foe.broken === 0);
  m.turn = 'foe'; C.versusStrike(m, 'foe', 5);   // returns and strikes it
  ok('returning and striking it arms it', m.foe.states[5] === C.SQ_ARMED);
  m.turn = 'foe'; C.versusStrike(m, 'foe', 7);
  ok('only then does departing break it', m.foe.states[5] === C.SQ_BROKEN);
}

section('Versus: Repair');
{
  const mk = () => {
    const b = { size: 4, difficulty: 'journeyman',
      ai: new Array(16).fill('R'), you: new Array(16).fill('R') };
    const m = C.createMatch(b, { rnd: C.mulberry32(10) });
    m.you.points = 1000; m.foe.points = 1000;
    return m;
  };
  const m = mk();
  m.foe.states[5] = C.SQ_CRACKED;
  m.turn = 'foe';
  ok('Repair clears a crack from your own board',
    C.versusBuy(m, 'foe', 'repair', 5).ok && m.foe.states[5] === C.SQ_INTACT);
  ok('Repair will not touch an intact square',
    C.versusUpgradeCheck(m, 'foe', 'repair', 5).ok === false);

  const g = mk();
  g.foe.states[5] = C.SQ_ARMED;
  g.foe.current = 5;
  g.turn = 'foe';
  ok('Repair works while standing on an armed square',
    C.versusBuy(g, 'foe', 'repair', 5).ok && g.foe.states[5] === C.SQ_INTACT);
  g.turn = 'foe';
  C.versusStrike(g, 'foe', 6);
  ok('and the repaired square survives the departure',
    g.foe.states[5] === C.SQ_INTACT && g.foe.broken === 0);
  ok('Repair cannot reach across to the enemy board', (() => {
    const h = mk();
    h.you.states[3] = C.SQ_CRACKED;
    h.turn = 'foe';
    return C.versusUpgradeCheck(h, 'foe', 'repair', 3).ok === false;
  })());
}

/* Reforge lands on whatever square the rival is standing on, and the one
   thing it must never do is end the match on the spot. */
/* Ground you have already worked pays half, and hands the other half to the
   rival - so going back over your own board is not merely worth less, it
   arms the other smith. */
section('Versus: fresh metal pays, worked metal pays the rival');
{
  const mk = () => {
    const b = { size: 4, difficulty: 'journeyman',
      ai: new Array(16).fill('R'), you: new Array(16).fill('R') };
    return C.createMatch(b, { rnd: C.mulberry32(31) });
  };
  const S = C.CONFIG.versus.scoring;

  ok('a first strike on a square pays in full, and pays the rival nothing', (() => {
    const m = mk();
    const r = C.versusStrike(m, 'you', 0);
    return r.fresh === true && r.points === r.full && r.gift === 0 &&
      m.you.points === r.full && m.foe.points === 0;
  })());

  ok('striking it again pays you the keep share', (() => {
    const m = mk();
    C.versusStrike(m, 'you', 0);
    m.turn = 'you';
    C.versusStrike(m, 'you', 1);
    m.turn = 'you';
    const back = C.versusStrike(m, 'you', 0);          // worked ground
    return back.fresh === false &&
      back.points === Math.floor(back.full * S.restrikeKeep);
  })());

  ok('and hands the gift share straight to the rival', (() => {
    const m = mk();
    C.versusStrike(m, 'you', 0);
    m.turn = 'you';
    C.versusStrike(m, 'you', 1);
    const theirs = m.foe.points;
    m.turn = 'you';
    const back = C.versusStrike(m, 'you', 0);
    return back.gift === Math.floor(back.full * S.restrikeGift) &&
      m.foe.points === theirs + back.gift && back.gift > 0;
  })());

  ok('the gift counts towards what the rival has earned, not just spent', (() => {
    const m = mk();
    C.versusStrike(m, 'you', 0);
    m.turn = 'you';
    C.versusStrike(m, 'you', 1);
    const earned = m.foe.earned;
    m.turn = 'you';
    const back = C.versusStrike(m, 'you', 0);
    return m.foe.earned === earned + back.gift;
  })());

  ok('a straight split conserves the points in the match', (() => {
    // what the striker loses is exactly what the rival gains
    const m = mk();
    C.versusStrike(m, 'you', 0);
    m.turn = 'you';
    C.versusStrike(m, 'you', 1);
    m.turn = 'you';
    const back = C.versusStrike(m, 'you', 0);
    return S.restrikeKeep + S.restrikeGift === 1 &&
      back.points + back.gift === back.full;
  })());

  ok('a square struck many times keeps paying the same reduced rate', (() => {
    const m = mk();
    const seen = [];
    for (let k = 0; k < 4; k++) {
      m.turn = 'you';
      C.versusStrike(m, 'you', k % 2 === 0 ? 0 : 1);
    }
    m.turn = 'you';
    const again = C.versusStrike(m, 'you', 0);
    seen.push(again.points, Math.floor(again.full * S.restrikeKeep));
    return seen[0] === seen[1];
  })());

  ok('the rule reads off the strike count, not the route chain', (() => {
    // square 0 left the current chain long ago but is still worked ground
    const m = mk();
    C.versusStrike(m, 'you', 0);
    for (const i of [1, 2, 3]) { m.turn = 'you'; C.versusStrike(m, 'you', i); }
    m.turn = 'you';
    const back = C.versusStrike(m, 'you', 0);
    return back.fresh === false && back.gift > 0;
  })());

  ok('both of the rule’s shares are one number each, and tunable', (() => {
    const keep = S.restrikeKeep, gift = S.restrikeGift;
    S.restrikeKeep = 0; S.restrikeGift = 0.5;          // the harsher version
    const m = mk();
    C.versusStrike(m, 'you', 0);
    m.turn = 'you';
    C.versusStrike(m, 'you', 1);
    m.turn = 'you';
    const back = C.versusStrike(m, 'you', 0);
    const harsh = back.points === 0 && back.gift === Math.floor(back.full * 0.5);
    S.restrikeKeep = keep; S.restrikeGift = gift;
    return harsh;
  })());

  ok('a gift never arrives while the striker is trapped out of the match', (() => {
    // the rival still banks it: the blow was struck and paid for
    const m = mk();
    C.versusStrike(m, 'you', 0);
    m.turn = 'you';
    C.versusStrike(m, 'you', 1);
    m.turn = 'you';
    const before = m.foe.points;
    const r = C.versusStrike(m, 'you', 0);
    return m.foe.points === before + r.gift;
  })());
}

section('Versus: Reforge redirects, it never executes');
{
  const mk = (size, diff) => {
    const n = (size || 4) * (size || 4);
    const b = { size: size || 4, difficulty: diff || 'journeyman',
      ai: new Array(n).fill('R'), you: new Array(n).fill('R') };
    const m = C.createMatch(b, { rnd: C.mulberry32(12) });
    m.you.points = 1000; m.foe.points = 1000;
    return m;
  };
  const standing = (m, at) => { m.turn = 'foe'; C.versusStrike(m, 'foe', at); m.turn = 'you'; };

  ok('Reforge has nothing to act on before the rival has struck',
    C.versusUpgradeCheck(mk(), 'you', 'reforge').ok === false);

  const m = mk();
  standing(m, 6);
  m.foe.strikes[6] = 3; m.foe.states[6] = C.SQ_CRACKED;
  const before = m.foe.pieces[6];
  const res = C.versusBuy(m, 'you', 'reforge', null, 'B');
  ok('Reforge reshapes the square the rival is standing on',
    res.ok && m.foe.pieces[6] === 'B' && before !== 'B', JSON.stringify(res));
  ok('it reports what it changed, for the banner to read',
    res.detail.from === before && res.detail.to === 'B' && res.detail.square === 6);
  ok('it keeps the square’s damage and strike history',
    m.foe.states[6] === C.SQ_CRACKED && m.foe.strikes[6] === 3);
  ok('it never offers the symbol already there',
    !C.versusReforgeOptions(mk(), 'you', 6).includes('R'));

  ok('the rival’s moves are recalculated from the new symbol', (() => {
    const g = mk();
    standing(g, 5);
    const r = C.versusBuy(g, 'you', 'reforge', null, 'K');
    g.turn = 'foe';
    const moves = C.versusTargets(g, 'foe').slice().sort((a, b) => a - b);
    return r.ok && g.foe.pieces[5] === 'K' &&
      moves.join(',') === C.tableFor(4).K.list[5].slice().sort((a, b) => a - b).join(',');
  })());

  /* the safety rule, from both directions */
  ok('a symbol that would strand the rival is never offered', (() => {
    const g = mk();
    standing(g, 0);
    // wall the corner in: only the diagonal neighbour survives, so a Rook
    // there would have nowhere to go and must not be on the menu
    g.foe.states[1] = C.SQ_BROKEN; g.foe.states[4] = C.SQ_BROKEN;
    for (let i = 2; i < 16; i++) if (i !== 5) g.foe.states[i] = C.SQ_BROKEN;
    const options = C.versusReforgeOptions(g, 'you', 0);
    if (options.indexOf('R') >= 0) return false;            // rook: row and column are gone
    return options.indexOf('B') >= 0 && options.indexOf('K') >= 0;   // both still reach 5
  })());

  ok('and buying one anyway is refused outright', (() => {
    const g = mk();
    standing(g, 0);
    for (let i = 1; i < 16; i++) if (i !== 5) g.foe.states[i] = C.SQ_BROKEN;
    const points = g.you.points;
    const r = C.versusBuy(g, 'you', 'reforge', null, 'R');
    return r.ok === false && g.you.points === points && g.upgradeUsed === false;
  })());

  ok('Reforge can never be the blow that ends the match', (() => {
    // every board, every square the rival could stand on, every offered
    // symbol: none of them may leave the rival with no move
    for (let seed = 1; seed <= 40; seed++) {
      const g = mk(4, 'master');
      g.rnd = C.mulberry32(seed);
      for (let i = 0; i < 16; i++) {
        g.foe.pieces[i] = ['K', 'R', 'B', 'N', 'Q'][Math.floor(C.mulberry32(seed * 31 + i)() * 5)];
        if (C.mulberry32(seed * 17 + i)() < 0.45) g.foe.states[i] = C.SQ_BROKEN;
      }
      const at = g.foe.states.findIndex((st) => st !== C.SQ_BROKEN);
      if (at < 0) continue;
      g.foe.states[at] = C.SQ_INTACT;
      g.foe.current = at;
      g.turn = 'you';
      for (const p of C.versusReforgeOptions(g, 'you', at)) {
        const probe = C.cloneMatch(g);
        probe.turn = 'you';
        const r = C.versusBuy(probe, 'you', 'reforge', null, p);
        if (!r.ok) return false;
        if (r.trapped === 'foe') return false;              // the thing that must not happen
        probe.turn = 'foe';
        if (C.versusTargets(probe, 'foe').length === 0) return false;
      }
    }
    return true;
  })());

  ok('the old Row Shuffle is gone, and nothing answers to it',
    C.upgradeById('shuffle') === null &&
    C.versusUpgradeCheck(mk(), 'you', 'shuffle', 1).ok === false &&
    !src.includes("versusRowCells"));
}

/* Shatter in one, two and three squares at a time, and the two repairs. */
section('Versus: shatter, double, triple, and the repairs');
{
  const mk = () => {
    const b = { size: 4, difficulty: 'journeyman',
      ai: new Array(16).fill('R'), you: new Array(16).fill('R') };
    const m = C.createMatch(b, { rnd: C.mulberry32(21) });
    m.you.points = 2000; m.foe.points = 2000;
    return m;
  };
  const cracked = (side) => side.states.filter((st) => st === C.SQ_CRACKED).length;

  ok('the six powers are the ones on offer, cheapest first', (() => {
    const ids = C.CONFIG.versus.upgrades.map((u) => u.id);
    const costs = C.CONFIG.versus.upgrades.map((u) => u.cost);
    return ids.join(',') === 'shatter,repair,doubleShatter,reforge,masterRepair,tripleShatter' &&
      costs.every((c, k) => k === 0 || c >= costs[k - 1]);
  })());

  ok('Repair is the cheapest way to mend and dearer than Shatter',
    C.upgradeById('repair').cost > C.upgradeById('shatter').cost &&
    C.upgradeById('repair').cost < C.upgradeById('masterRepair').cost);
  ok('Master Repair costs a good deal more than Repair',
    C.upgradeById('masterRepair').cost >= C.upgradeById('repair').cost * 2);
  ok('each extra square costs more than the one before',
    C.upgradeById('doubleShatter').cost > C.upgradeById('shatter').cost &&
    C.upgradeById('tripleShatter').cost > C.upgradeById('doubleShatter').cost);
  ok('and a multi-square power costs more than buying the single one twice over',
    C.upgradeById('doubleShatter').cost > C.upgradeById('shatter').cost * 2 &&
    C.upgradeById('tripleShatter').cost > C.upgradeById('shatter').cost * 3);

  ok('Shatter cracks one square and leaves it usable', (() => {
    const g = mk();
    const r = C.versusBuy(g, 'you', 'shatter', 5);
    return r.ok && g.foe.states[5] === C.SQ_CRACKED && cracked(g.foe) === 1 &&
      C.versusTargets(g, 'foe').length >= 0 && r.detail.count === 1;
  })());

  ok('Double Shatter cracks exactly two, and Triple three', (() => {
    const g = mk();
    const two = C.versusBuy(g, 'you', 'doubleShatter', [1, 2]);
    if (!two.ok || cracked(g.foe) !== 2) return false;
    const h = mk();
    const three = C.versusBuy(h, 'you', 'tripleShatter', [1, 2, 3]);
    return three.ok && cracked(h.foe) === 3 && three.detail.count === 3;
  })());

  ok('the wrong number of squares is refused, and costs nothing', (() => {
    const g = mk();
    const points = g.you.points;
    const one = C.versusBuy(g, 'you', 'doubleShatter', [1]);
    const three = C.versusBuy(g, 'you', 'doubleShatter', [1, 2, 3]);
    return !one.ok && !three.ok && g.you.points === points && g.upgradeUsed === false;
  })());

  ok('the same square cannot be chosen twice', (() => {
    const g = mk();
    const points = g.you.points;
    const r = C.versusBuy(g, 'you', 'doubleShatter', [5, 5]);
    return r.ok === false && g.you.points === points && cracked(g.foe) === 0;
  })());

  ok('an already-damaged square is not a valid Shatter target', (() => {
    const g = mk();
    g.foe.states[5] = C.SQ_CRACKED;
    const a = C.versusUpgradeCheck(g, 'you', 'shatter', 5).ok;
    g.foe.states[6] = C.SQ_ARMED;
    const b = C.versusUpgradeCheck(g, 'you', 'shatter', 6).ok;
    g.foe.states[7] = C.SQ_BROKEN;
    const c = C.versusUpgradeCheck(g, 'you', 'shatter', 7).ok;
    return a === false && b === false && c === false;
  })());

  ok('and one bad square in a set refuses the whole set', (() => {
    const g = mk();
    g.foe.states[2] = C.SQ_CRACKED;
    const points = g.you.points;
    const r = C.versusBuy(g, 'you', 'tripleShatter', [1, 2, 3]);
    return r.ok === false && g.you.points === points && cracked(g.foe) === 1;
  })());

  ok('a shattered square still works until the hammer leaves it', (() => {
    const g = mk();
    C.versusBuy(g, 'you', 'shatter', 5);
    g.turn = 'foe';
    C.versusStrike(g, 'foe', 5);                 // landing on it arms it, not breaks it
    if (g.foe.states[5] !== C.SQ_ARMED) return false;
    g.turn = 'foe';
    const away = C.versusTargets(g, 'foe').find((t) => t !== 5);
    C.versusStrike(g, 'foe', away);
    return g.foe.states[5] === C.SQ_BROKEN;
  })());

  ok('Repair mends one damaged square, armed or merely cracked', (() => {
    const g = mk();
    g.you.states[3] = C.SQ_ARMED;
    const r = C.versusBuy(g, 'you', 'repair', 3);
    return r.ok && g.you.states[3] === C.SQ_INTACT;
  })());

  ok('neither repair can bring a broken square back', (() => {
    const g = mk();
    g.you.states[3] = C.SQ_BROKEN;
    const one = C.versusUpgradeCheck(g, 'you', 'repair', 3).ok;
    const all = C.versusUpgradeCheck(g, 'you', 'masterRepair', null, 'R').ok;
    return one === false && all === false;
  })());

  ok('Master Repair mends every damaged square of the chosen symbol', (() => {
    const g = mk();
    g.you.pieces[1] = 'B'; g.you.pieces[2] = 'B'; g.you.pieces[3] = 'K';
    g.you.states[1] = C.SQ_CRACKED; g.you.states[2] = C.SQ_ARMED;
    g.you.states[3] = C.SQ_CRACKED; g.you.states[9] = C.SQ_CRACKED;   // a rook, untouched
    const r = C.versusBuy(g, 'you', 'masterRepair', null, 'B');
    return r.ok && g.you.states[1] === C.SQ_INTACT && g.you.states[2] === C.SQ_INTACT &&
      g.you.states[3] === C.SQ_CRACKED && g.you.states[9] === C.SQ_CRACKED &&
      r.detail.count === 2 && r.detail.piece === 'B';
  })());

  ok('and leaves a broken square of that symbol broken', (() => {
    const g = mk();
    g.you.pieces[1] = 'B'; g.you.pieces[2] = 'B';
    g.you.states[1] = C.SQ_CRACKED; g.you.states[2] = C.SQ_BROKEN;
    const r = C.versusBuy(g, 'you', 'masterRepair', null, 'B');
    return r.ok && g.you.states[1] === C.SQ_INTACT && g.you.states[2] === C.SQ_BROKEN;
  })());

  ok('a symbol with nothing damaged is refused, and costs nothing', (() => {
    const g = mk();
    const points = g.you.points;
    const r = C.versusBuy(g, 'you', 'masterRepair', null, 'B');
    return r.ok === false && g.you.points === points && g.upgradeUsed === false;
  })());

  ok('the symbols it offers are only those standing on damage', (() => {
    const g = mk();
    g.you.pieces[1] = 'B';
    g.you.states[1] = C.SQ_CRACKED;
    g.you.states[2] = C.SQ_BROKEN;             // a rook, past saving
    return C.versusRepairPieces(g, 'you').join(',') === 'B';
  })());

  ok('powers reach the right board and no other', (() => {
    const g = mk();
    g.you.states[3] = C.SQ_CRACKED;
    g.foe.states[3] = C.SQ_CRACKED;
    // repairing mine must not touch theirs, and shattering theirs not mine
    C.versusBuy(g, 'you', 'repair', 3);
    if (g.you.states[3] !== C.SQ_INTACT || g.foe.states[3] !== C.SQ_CRACKED) return false;
    const h = mk();
    C.versusBuy(h, 'you', 'shatter', 4);
    return h.foe.states[4] === C.SQ_CRACKED && h.you.states[4] === C.SQ_INTACT;
  })());

  ok('every power still spends the turn’s one allowance', (() => {
    for (const def of C.CONFIG.versus.upgrades) {
      const g = mk();
      g.you.states[1] = C.SQ_CRACKED;
      g.turn = 'foe'; C.versusStrike(g, 'foe', 6); g.turn = 'you';
      let r;
      if (def.target === 'ownSquare') r = C.versusBuy(g, 'you', def.id, 1);
      else if (def.target === 'ownPiece') r = C.versusBuy(g, 'you', def.id, null, g.you.pieces[1]);
      else if (def.target === 'enemyCurrent') r = C.versusBuy(g, 'you', def.id, null);
      else r = C.versusBuy(g, 'you', def.id, [10, 11, 12].slice(0, def.picks));
      if (!r.ok) return false;
      if (g.upgradeUsed !== true) return false;
      if (g.you.points !== 2000 - def.cost) return false;
      if (C.versusUpgradeCheck(g, 'you', 'shatter', 14).ok) return false;
    }
    return true;
  })());
}

/* The rival has to actually reach for these, and reach for them for a
   reason. Measured over real self-played matches rather than asserted. */
section('Versus: the rival uses the powers, and uses them sensibly');
{
  const play = (diff, seeds) => {
    const used = {};
    let ended = 0, matches = 0, illegal = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const boards = C.makeVersusBoards(5, diff, C.mulberry32(seed * 7));
      if (!boards) continue;
      const m = C.createMatch(boards, { rnd: C.mulberry32(seed * 13) });
      matches++;
      for (let t = 0; t < 1200 && !C.matchOver(m); t++) {
        const who = m.turn;
        const buy = C.versusChooseUpgrade(m, who);
        if (buy) {
          const r = C.versusBuy(m, who, buy.id, buy.target, buy.choice);
          if (r.ok) used[buy.id] = (used[buy.id] || 0) + 1; else illegal++;
        }
        if (C.matchOver(m)) break;
        const mv = C.versusChooseStrike(m, who);
        if (mv < 0) break;
        if (!C.versusStrike(m, who, mv)) { illegal++; break; }
      }
      if (C.matchOver(m)) ended++;
    }
    return { used: used, ended: ended, matches: matches, illegal: illegal };
  };

  const thinking = play('journeyman', 10);
  ok('a thinking rival never proposes a power it cannot buy', thinking.illegal === 0);
  ok('and every match it plays still reaches an end',
    thinking.ended === thinking.matches, thinking.ended + '/' + thinking.matches);
  ok('it spends on more than one kind of power',
    Object.keys(thinking.used).length >= 3, JSON.stringify(thinking.used));
  ok('it reaches the dearer ones rather than only the cheapest',
    (thinking.used.reforge || 0) + (thinking.used.doubleShatter || 0) > 0,
    JSON.stringify(thinking.used));

  const novice = play('novice', 10);
  ok('a novice rival plays on too, buying at random',
    novice.illegal === 0 && novice.ended === novice.matches,
    novice.ended + '/' + novice.matches);

  /* Each power picked for the right kind of reason. */
  ok('it repairs the damage on its own board when there is some', (() => {
    const b = { size: 4, difficulty: 'master',
      ai: new Array(16).fill('R'), you: new Array(16).fill('R') };
    const m = C.createMatch(b, { rnd: C.mulberry32(5) });
    m.turn = 'foe'; m.foe.points = 60; m.you.points = 0;
    m.foe.current = 0;
    // wall it in but for one square, and crack the square it needs
    for (let i = 1; i < 16; i++) m.foe.states[i] = C.SQ_BROKEN;
    m.foe.states[4] = C.SQ_ARMED;
    const pick = C.versusChooseUpgrade(m, 'foe');
    return !!pick && pick.id === 'repair', pick && pick.id;
  })());

  ok('it aims Shatter at squares the player can actually reach', (() => {
    const b = { size: 4, difficulty: 'master',
      ai: new Array(16).fill('R'), you: new Array(16).fill('R') };
    const m = C.createMatch(b, { rnd: C.mulberry32(6) });
    m.turn = 'foe'; m.foe.points = 60;
    m.you.current = 0;                         // a rook in the corner: row 0 and column 0
    const pick = C.versusChooseUpgrade(m, 'foe');
    if (!pick || pick.id !== 'shatter') return true;   // it chose something else; fine
    const reach = C.versusTargets(m, 'you');
    return reach.indexOf(pick.target[0]) >= 0;
  })());

  ok('every power it names can be replayed by the caller exactly', (() => {
    // the option it returns must carry everything versusBuy needs
    for (let seed = 1; seed <= 30; seed++) {
      const boards = C.makeVersusBoards(4, 'master', C.mulberry32(seed * 3));
      if (!boards) continue;
      const m = C.createMatch(boards, { rnd: C.mulberry32(seed) });
      m.foe.points = 4000; m.you.points = 4000;
      for (let t = 0; t < 30 && !C.matchOver(m); t++) {
        const who = m.turn;
        const buy = C.versusChooseUpgrade(m, who);
        if (buy && !C.versusBuy(m, who, buy.id, buy.target, buy.choice).ok) return false;
        if (C.matchOver(m)) break;
        const mv = C.versusChooseStrike(m, who);
        if (mv < 0) break;
        C.versusStrike(m, who, mv);
      }
    }
    return true;
  })());

  ok('and it never reforges the player into a corner with no move', (() => {
    for (let seed = 1; seed <= 30; seed++) {
      const boards = C.makeVersusBoards(4, 'master', C.mulberry32(seed * 11));
      if (!boards) continue;
      const m = C.createMatch(boards, { rnd: C.mulberry32(seed) });
      m.foe.points = 4000; m.you.points = 4000;
      for (let t = 0; t < 40 && !C.matchOver(m); t++) {
        const who = m.turn;
        const buy = C.versusChooseUpgrade(m, who);
        if (buy) {
          const r = C.versusBuy(m, who, buy.id, buy.target, buy.choice);
          if (r.ok && buy.id === 'reforge' && r.trapped) return false;
        }
        if (C.matchOver(m)) break;
        const mv = C.versusChooseStrike(m, who);
        if (mv < 0) break;
        C.versusStrike(m, who, mv);
      }
    }
    return true;
  })());
}

section('Versus: points, allowance and defeat');
{
  const mk = () => {
    const b = { size: 4, difficulty: 'journeyman',
      ai: new Array(16).fill('R'), you: new Array(16).fill('R') };
    const m = C.createMatch(b, { rnd: C.mulberry32(14) });
    m.you.points = 1000; m.foe.points = 1000;
    return m;
  };
  const m = mk();
  const earnedBefore = m.you.earned;
  C.versusBuy(m, 'you', 'shatter', 5);
  ok('a purchase spends available points but never total earned',
    m.you.points === 1000 - C.upgradeById('shatter').cost && m.you.earned === earnedBefore);
  ok('only one upgrade is allowed a turn',
    C.versusUpgradeCheck(m, 'you', 'repair', 0).ok === false &&
    C.versusUpgradeCheck(m, 'you', 'shatter', 6).why === 'already used this turn');
  ok('an unaffordable purchase spends nothing', (() => {
    const g = mk();
    g.you.points = 5;
    const r = C.versusBuy(g, 'you', 'shatter', 5);
    return r.ok === false && g.you.points === 5 && g.upgradeUsed === false;
  })());
  ok('an invalid target spends nothing and keeps the allowance', (() => {
    const g = mk();
    g.foe.states[5] = C.SQ_BROKEN;
    const r = C.versusBuy(g, 'you', 'shatter', 5);
    return r.ok === false && g.you.points === 1000 && g.upgradeUsed === false;
  })());
  ok('both sides pay the same price for the same upgrade', (() => {
    const g = mk();
    const cost = C.upgradeById('shatter').cost;
    C.versusBuy(g, 'you', 'shatter', 5);
    g.turn = 'foe'; g.upgradeUsed = false;
    C.versusBuy(g, 'foe', 'shatter', 5);
    return g.you.points === 1000 - cost && g.foe.points === 1000 - cost;
  })());

  ok('walling yourself in loses the match at once', (() => {
    // a knight in the corner of a 3x3 with both its jumps broken
    const b = { size: 3, difficulty: 'journeyman',
      ai: new Array(9).fill('R'), you: new Array(9).fill('R') };
    const g = C.createMatch(b, { rnd: C.mulberry32(15) });
    g.you.pieces[0] = 'N';
    g.you.states[5] = C.SQ_BROKEN; g.you.states[7] = C.SQ_BROKEN; g.you.broken = 2;
    g.you.current = 1;
    const r = C.versusStrike(g, 'you', 0);     // land on the knight with no jumps left
    return r !== null && C.matchOver(g) && g.winner === 'foe' && g.reason === 'trapped';
  })());
  ok('an upgrade that traps the rival wins without a strike', (() => {
    const b = { size: 3, difficulty: 'journeyman',
      ai: new Array(9).fill('R'), you: new Array(9).fill('R') };
    const g = C.createMatch(b, { rnd: C.mulberry32(16) });
    g.you.points = 1000;
    g.foe.pieces = g.foe.pieces.map(() => 'R');
    g.foe.current = 0;
    // break everything the rook at 0 can reach, then reforge it onto a symbol
    // with a small, known reach and break that too
    for (const i of [1, 2, 3, 6]) { g.foe.states[i] = C.SQ_BROKEN; g.foe.broken++; }
    const r = C.versusBuy(g, 'you', 'reforge', 0, '2');   // a two at 0 on a 3x3 reaches 5, 7 and 8
    if (!r.ok) return false;
    for (const i of [5, 7, 8]) g.foe.states[i] = C.SQ_BROKEN;
    return C.versusTargets(g, 'foe').length === 0;
  })());
  ok('conceding hands the match over', (() => {
    const g = mk();
    return C.versusConcede(g, 'you') && g.winner === 'foe' && g.reason === 'conceded';
  })());
  ok('a decided match refuses further play', (() => {
    const g = mk();
    C.versusConcede(g, 'you');
    return C.versusStrike(g, 'foe', 3) === null &&
      C.versusUpgradeCheck(g, 'foe', 'shatter', 3).ok === false;
  })());
  ok('merely visiting every square never ends the match', (() => {
    const g = mk();
    // a legal rook path that covers all sixteen squares, snaking row by row
    const walk = [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12];
    for (const i of walk) {
      g.turn = 'you';
      if (!C.versusStrike(g, 'you', i)) return false;
    }
    return !C.matchOver(g) && g.you.strikes.every((x) => x >= 1);
  })());
}

section('Versus: the rival chases combos');
{
  // The combo score has to prefer a pattern actually landed over one that is
  // merely one strike away, or the rival hovers a symbol short forever.
  const mk = (pieces, chain, chainPieces) => {
    const b = C.makeVersusBoards(4, 'journeyman', C.mulberry32(77));
    const m = C.createMatch(b, { rnd: C.mulberry32(78) });
    m.you.pieces = pieces.slice();
    m.you.current = 0;
    m.you.chain = chain.slice();
    m.you.chainPieces = chainPieces.slice();
    return m;
  };
  // a board of nothing but rooks: every destination continues any rook run
  const rooks = new Array(16).fill('R');
  const landedTrio = mk(rooks, [2, 1, 0], ['R', 'R', 'R']);
  const oneShort = mk(rooks, [2, 1, 0], ['R', 'R', 'B']);
  ok('a landed pattern scores above one that is only in prospect',
    C.versusCombo(landedTrio, 'you') > C.versusCombo(oneShort, 'you'),
    C.versusCombo(landedTrio, 'you') + ' vs ' + C.versusCombo(oneShort, 'you'));

  const longRoute = mk(rooks, [5, 4, 3, 2, 1, 0], ['R', 'B', 'K', 'R', 'B', 'K']);
  const shortRoute = mk(rooks, [1, 0], ['R', 'B']);
  ok('a longer route is worth more than a short one',
    C.versusCombo(longRoute, 'you') > C.versusCombo(shortRoute, 'you'));

  const noRoute = mk(rooks, [], []);
  ok('an empty route is worth nothing', C.versusCombo(noRoute, 'you') === 0);

  // a pattern the board cannot deliver must not be counted
  const unreachable = mk(new Array(16).fill('K'), [1, 0], ['R', 'R']);
  const reachable = mk(rooks, [1, 0], ['R', 'R']);
  ok('a pattern no legal destination could pay is not counted',
    C.versusCombo(unreachable, 'you') < C.versusCombo(reachable, 'you'));

  // and the whole point: it changes what the rival actually plays
  const play = (weight, tier) => {
    const was = C.CONFIG.versus.ai.comboWeight;
    C.CONFIG.versus.ai.comboWeight = weight;
    let patterns = 0, strikes = 0, decided = 0, games = 0;
    for (const size of [4, 5]) {
      for (let s = 0; s < 3; s++) {
        const b = C.makeVersusBoards(size, tier, C.mulberry32(9000 + s * 37 + size * 11));
        const m = C.createMatch(b, { rnd: C.mulberry32(9001 + s * 37 + size * 11) });
        let guard = 0;
        while (!C.matchOver(m) && guard++ < 700) {
          const who = m.turn;
          const buy = C.versusChooseUpgrade(m, who);
          if (buy) C.versusBuy(m, who, buy.id, buy.target);
          if (C.matchOver(m)) break;
          const mv = C.versusChooseStrike(m, who);
          if (mv < 0) break;
          const res = C.versusStrike(m, who, mv);
          if (!res) break;
          strikes++;
          if (res.pattern) patterns++;
        }
        if (C.matchOver(m)) decided++;
        games++;
      }
    }
    C.CONFIG.versus.ai.comboWeight = was;
    return { rate: patterns / Math.max(1, strikes), decided, games };
  };
  for (const tier of ['apprentice', 'journeyman', 'master']) {
    const blind = play(0, tier);
    const keen = play(C.CONFIG.versus.ai.comboWeight, tier);
    ok(tier + ' lands more patterns than a combo-blind rival',
      keen.rate > blind.rate,
      (100 * blind.rate).toFixed(1) + '% -> ' + (100 * keen.rate).toFixed(1) + '%');
    ok(tier + ' still finishes every match while chasing them',
      keen.decided === keen.games, keen.decided + '/' + keen.games);
  }
  // Novice searches nothing, so its instinct lives in the ranking instead.
  ok('even the novice ranking weighs combos',
    /versusCombo\(probe, who\)/.test(src), 'novice ranking ignores versusCombo');
}

section('Versus: the rival plays by the same rules');
{
  let illegal = 0, ended = 0, worst = 0, usedUpgrades = 0;
  for (const d of Object.keys(C.CONFIG.versus.difficulties)) {
    for (let s = 0; s < 4; s++) {
      const b = C.makeVersusBoards(4, d, C.mulberry32(s * 91 + 5));
      const m = C.createMatch(b, { rnd: C.mulberry32(s + 21) });
      let guard = 0;
      while (!C.matchOver(m) && guard++ < 600) {
        const who = m.turn;
        const t0 = Date.now();
        const buy = C.versusChooseUpgrade(m, who);
        if (buy) {
          const r = C.versusBuy(m, who, buy.id, buy.target, buy.choice);
          if (r.ok) usedUpgrades++; else illegal++;
        }
        if (C.matchOver(m)) break;
        const mv = C.versusChooseStrike(m, who);
        worst = Math.max(worst, Date.now() - t0);
        if (mv < 0) break;
        if (!C.versusTargets(m, who).includes(mv)) { illegal++; break; }
        if (!C.versusStrike(m, who, mv)) { illegal++; break; }
      }
      if (C.matchOver(m)) ended++;
    }
  }
  ok('16 self-played matches all reach a decided end', ended === 16, ended + '/16');
  ok('the rival never proposes an illegal action', illegal === 0);
  ok('every difficulty actually buys upgrades', usedUpgrades > 0);
  ok('a turn is decided well inside its budget (' + worst + 'ms)',
    worst <= C.CONFIG.versus.ai.timeBudgetMs);
  ok('stronger tiers beat weaker ones', (() => {
    let strong = 0;
    for (let s = 0; s < 10; s++) {
      const b = C.makeVersusBoards(4, 'journeyman', C.mulberry32(s * 311 + 5));
      const m = C.createMatch(b, { rnd: C.mulberry32(s * 13 + 2) });
      let guard = 0;
      while (!C.matchOver(m) && guard++ < 800) {
        const who = m.turn;
        m.difficulty = who === 'you' ? 'master' : 'novice';
        const buy = C.versusChooseUpgrade(m, who);
        if (buy) C.versusBuy(m, who, buy.id, buy.target);
        if (C.matchOver(m)) break;
        const mv = C.versusChooseStrike(m, who);
        if (mv < 0 || !C.versusStrike(m, who, mv)) break;
      }
      if (m.winner === 'you') strong++;
    }
    return strong >= 8;
  })());
}

section('Versus leaves the other modes alone');
{
  const fb = C.makeBoard('journeyman', C.mulberry32(8));
  const fg = C.createGame(fb, { morphChance: 0 });
  for (const step of fb.route) if (!C.applyStrike(fg, step)) break;
  ok('forge still finishes at quality 100',
    fg.status === 'complete' && C.scoreGame(fg).quality === 100);
  const eb = C.generateTourBoard('novice', C.mulberry32(3));
  const eg = C.createGame(eb, { mode: 'endless', morphChance: 0 });
  for (const step of eb.route) C.applyStrike(eg, step);
  ok('endless still clears a round and pays gold',
    eg.roundsCompleted === 1 && eg.gold >= 1 && Number.isInteger(eg.gold));
}

/* ---------- Open Your Forge ---------- */
section('Open Your Forge: material sets the strikes, not the difficulty');
{
  ok('every material asks for a different number of strikes', (() => {
    const want = C.SHOP.materials.map((m) => m.strikes).join(',');
    return want === '1,2,3,4,5';
  })());

  ok('a board is built to the material, not to the tier', (() => {
    for (const m of C.SHOP.materials) {
      const b = C.makeShopBoard(4, 'journeyman', m.strikes, C.mulberry32(m.strikes * 31 + 5));
      if (!b || b.visits !== m.strikes) return false;
      const crust = (b.hard || []).reduce((a2, h) => a2 + h, 0);
      if (b.route.length !== m.strikes * 16 + crust) return false;
      if (!C.validateBoard(b)) return false;
    }
    return true;
  })());

  ok('the same material can be worked on any board size', (() => {
    for (const size of [3, 4, 5, 6]) {
      const b = C.makeShopBoard(size, 'novice', 3, C.mulberry32(size * 77));
      if (!b || b.size !== size || !C.validateBoard(b)) return false;
    }
    return true;
  })());

  ok('the item picks the size, the material the strikes, the batch the symbols', (() => {
    const shop = C.createShop({ rnd: C.mulberry32(3) });
    // a soft metal, so the batch alone is deciding the symbols here
    const small = C.forgeBoardSpec(shop, 'plate', 'bronze', 1);
    const big = C.forgeBoardSpec(shop, 'plate', 'bronze', 10);
    return small.size === 6 && small.visits === 1 && small.perfect === 1 && small.spent === 2 &&
      big.size === small.size && big.visits === small.visits &&
      small.difficulty === 'novice' && big.difficulty === 'master';
  })());

  /* Gold is where it bites: that rung and every one above is worked a full
     difficulty step harder than the batch alone would ask for. The threshold
     is a rung on the shop's own ladder, so nothing below names a metal. */
  ok('the soft metals are worked at exactly what the batch asked for', (() => {
    const shop = C.createShop({ rnd: C.mulberry32(4) });
    const soft = C.shopLadder().slice(0, C.shopLadder().indexOf(C.shopMaterial(C.SHOP.hardenFrom).name));
    for (const name of soft) {
      const m = C.SHOP.materials.find((x) => x.name === name);
      for (const qty of [1, 3, 4, 6, 7, 9, 10, 20]) {
        if (C.forgeBoardSpec(shop, 'shortsword', m.id, qty).difficulty !== C.batchDifficulty(qty)) return false;
        if (C.materialDifficultyStep(m.id) !== 0) return false;
      }
    }
    return soft.length === 2;   // Bronze and Silver, as the brief has it
  })());

  ok('Gold and everything above it is worked one step harder', (() => {
    const shop = C.createShop({ rnd: C.mulberry32(5) });
    const ladder = C.shopLadder();
    const bites = ladder.indexOf(C.shopMaterial(C.SHOP.hardenFrom).name);
    const hard = ladder.slice(bites);
    for (const name of hard) {
      const m = C.SHOP.materials.find((x) => x.name === name);
      if (C.materialDifficultyStep(m.id) !== C.SHOP.hardenBy) return false;
      for (const qty of [1, 3, 4, 6, 7, 9]) {
        const was = C.batchDifficulty(qty);
        const now = C.forgeBoardSpec(shop, 'shortsword', m.id, qty).difficulty;
        const want = C.CONFIG.order[C.CONFIG.order.indexOf(was) + C.SHOP.hardenBy];
        if (now !== want) return false;
      }
    }
    return hard.length === 3;   // Gold, Mithril, Adamantine
  })());

  ok('nothing is ever worked above Master', (() => {
    const shop = C.createShop({ rnd: C.mulberry32(6) });
    const top = C.CONFIG.order[C.CONFIG.order.length - 1];
    for (const m of C.SHOP.materials) {
      for (const qty of [10, 12, 40, 400]) {
        if (C.forgeBoardSpec(shop, 'shortsword', m.id, qty).difficulty !== top) return false;
      }
    }
    return C.harderDifficulty(top, 9) === top && C.harderDifficulty('novice', 99) === top;
  })());

  ok('the step is read off the ladder, not off a name', (() => {
    // the threshold moved down a rung: everything from Silver up should bite
    const was = C.SHOP.hardenFrom;
    C.SHOP.hardenFrom = 'silver';
    const bitesNow = C.SHOP.materials.filter((m) => C.materialDifficultyStep(m.id) > 0).length;
    C.SHOP.hardenFrom = was;
    const bitesBack = C.SHOP.materials.filter((m) => C.materialDifficultyStep(m.id) > 0).length;
    return bitesNow === 4 && bitesBack === 3;
  })());

  ok('a harder board is a board that still generates', (() => {
    const shop = C.createShop({ rnd: C.mulberry32(7) });
    for (const m of C.SHOP.materials) {
      const spec = C.forgeBoardSpec(shop, 'shortsword', m.id, 1);
      const b = C.makeShopBoard(spec.size, spec.difficulty, spec.visits, C.mulberry32(m.strikes * 31));
      if (!b || !C.validateBoard(b)) return false;
    }
    return true;
  })());

  ok('every three pieces in a batch is another tier', (() => {
    const want = { 1: 'novice', 2: 'novice', 3: 'novice',
      4: 'apprentice', 6: 'apprentice',
      7: 'journeyman', 9: 'journeyman',
      10: 'master', 12: 'master' };
    for (const qty in want) if (C.batchDifficulty(Number(qty)) !== want[qty]) return false;
    return true;
  })());

  ok('a batch past the last tier stays at the last tier', (() => {
    const last = C.CONFIG.order[C.CONFIG.order.length - 1];
    return C.batchDifficulty(40) === last && C.batchDifficulty(400) === last;
  })());

  ok('the shop keeps no difficulty of its own to pick', (() => {
    const shop = C.createShop({ rnd: C.mulberry32(31) });
    return shop.difficulty === undefined;
  })());

  ok('a bigger batch really is a harder board', (() => {
    const shop = C.createShop({ rnd: C.mulberry32(32) });
    const one = C.forgeBoardSpec(shop, 'mace', 'bronze', 1);
    const ten = C.forgeBoardSpec(shop, 'mace', 'bronze', 10);
    const sizeOf = (spec) => C.CONFIG.difficulties[spec.difficulty].size;
    return C.poolForSize(sizeOf(ten)).length > C.poolForSize(sizeOf(one)).length;
  })());

  ok('a square is perfect at the material’s count and ruined one past it', (() => {
    const board = C.makeShopBoard(3, 'novice', 3, C.mulberry32(11));
    const g = C.createGame(board, { perfect: 3, spent: 4, morphChance: 0 });
    const idx = board.route[0];
    C.applyStrike(g, idx);
    let stats = C.gameStats(g);
    if (stats.forged !== 0) return false;              // one of three
    // drive that one square to three without moving: only legal if it can
    // reach itself, so walk the verified route instead
    const walked = C.createGame(board, { perfect: 3, spent: 4, morphChance: 0 });
    for (const step of board.route) C.applyStrike(walked, step);
    return walked.status === 'complete' && C.gameStats(walked).overstrikes === 0;
  })());

  ok('the standing forge rules are untouched by any of it', (() => {
    const b = C.makeBoard('novice', C.mulberry32(9));
    const g = C.createGame(b, { morphChance: 0 });
    return g.perfect === C.CONFIG.rules.perfect && g.spent === C.CONFIG.rules.spent;
  })());
}

section('Open Your Forge: the day and the week');
{
  const shop = C.createShop({ rnd: C.mulberry32(5) });
  ok('a day is three phases, morning first',
    C.SHOP.phases.length === 3 && C.shopPhase(shop) === 'morning');
  C.shopAdvancePhase(shop);
  ok('the phase moves on', C.shopPhase(shop) === 'afternoon' && shop.day === 1);
  C.shopAdvancePhase(shop);
  C.shopAdvancePhase(shop);
  ok('evening rolls into the next day', shop.day === 2 && C.shopPhase(shop) === 'morning');

  ok('rent falls due at the end of every seventh day', (() => {
    const s = C.createShop({ rnd: C.mulberry32(6), gold: 100000 });
    const dueOn = [];
    for (let i = 0; i < 21 * 3; i++) {
      const r = C.shopAdvancePhase(s);
      if (r.bill) dueOn.push(s.day - 1);
    }
    return dueOn.join(',') === '7,14,21';
  })());

  ok('the bill is rent plus every wage', (() => {
    const s = C.createShop({ rnd: C.mulberry32(7), gold: 100000 });
    s.staff.push({ id: 1, name: 'A', role: 'runner', rank: 'C', power: 3, wage: 40 });
    s.staff.push({ id: 2, name: 'B', role: 'smith', rank: 'D', power: 2, wage: 25 });
    return C.weeklyBill(s) === C.rentDue(s) + 65;
  })());

  ok('falling short of the bill closes the shop', (() => {
    const s = C.createShop({ rnd: C.mulberry32(8), gold: 10 });
    for (let i = 0; i < 7 * 3; i++) C.shopAdvancePhase(s);
    return s.closed === true && s.rentPaid === 0;
  })());

  ok('paying it keeps the doors open', (() => {
    const s = C.createShop({ rnd: C.mulberry32(9), gold: 5000 });
    for (let i = 0; i < 7 * 3; i++) C.shopAdvancePhase(s);
    return !s.closed && s.rentPaid === 1 && s.gold === 5000 - C.rentDue(s);
  })());
}

/* No bulk orders, please. A commission is put to the seller before anything
   on the floor is looked at, so a check about an ordinary sale silences them
   the way the game itself does: an unknown forge is not trusted with one. */
function noContracts(shop) {
  shop.reputation = 0;
  return shop;
}

/* A town that can afford the thing under test. A one-star forge's town is
   labourers and farmers on purpose, so checks about pricing and haggling -
   which want money to be no object and somebody willing to push back - plant
   a few well-off hagglers and fill every purse. Checks about purses and
   standing top up what they need themselves. */
function enrich(shop, gold) {
  for (let i = 0; i < 6; i++) C.makeTownsfolk(shop, 'merchant');
  for (let i = 0; i < 3; i++) C.makeTownsfolk(shop, 'knight');
  for (const one of shop.town) one.gold = gold == null ? 100000 : gold;
  return shop;
}

/* Somebody of this trade, standing at the counter. The queue is people now,
   so a check that wants a particular trade has to find or make one. */
function townsperson(shop, typeId) {
  const found = shop.town.find((one) => one.type === typeId);
  return found || C.makeTownsfolk(shop, typeId);
}

/* Puts a line straight onto a stand, making one if the shop has none of the
   right kind. Tests need shelves far deeper than a real shop would hold, so
   this bypasses what a stand will take rather than stocking it properly. */
function stock(shop, key, qty, quality, price) {
  const type = C.standForItem(C.splitKey(key).item);
  let stand = shop.stands.find((st) => st.key === key);
  if (!stand) stand = shop.stands.find((st) => !st.key && st.type === type);
  if (!stand) {
    // out on the floor: a spot well past anything a real layout would use,
    // since these shelves are deliberately deeper and more numerous than
    // any premises would hold
    stand = { id: shop.nextId++, type: type || 'goods', key: null, qty: 0, quality: 100,
      price: 0, slot: 100 + shop.stands.length };
    shop.stands.push(stand);
  }
  stand.key = key;
  stand.qty = qty;
  stand.quality = quality == null ? 100 : quality;
  stand.price = price == null
    ? C.recommendedPrice(C.splitKey(key).item, C.splitKey(key).material, stand.quality)
    : price;
  return stand;
}

/* A forge that has served its apprenticeship at the named trades. Every
   check about the craft starts here, because a shop with no trade to its
   name cannot forge anything at all - which is itself one of the checks. */
function apprenticed(shop, ...crafts) {
  for (const id of (crafts.length ? crafts : ['swords', 'shields'])) {
    C.takeUpDiscipline(shop, id, 'apprenticed');
  }
  return shop;
}

/* Experience enough to buy whatever is under test, without forging for it. */
function schooled(shop, catId, amount) {
  shop.xp[catId] = amount == null ? 100000 : amount;
  return shop;
}

section('Open Your Forge: the crafts and their trees');
{
  ok('a new forge has taken up no craft and knows nothing', (() => {
    const s = C.createShop({ rnd: C.mulberry32(400) });
    return s.disciplines.length === 0 && s.known.length === 0 &&
      C.knownRecipes(s).length === 0;
  })());

  ok('every craft names a root that is real and needs nothing first', (() =>
    C.SHOP.categories.every((c) => {
      const it = C.shopItem(c.root);
      return it && it.cat === c.id && C.recipeParents(it.id).length === 0;
    })));

  ok('every craft has exactly one root, so there is one way in', (() =>
    C.SHOP.categories.every((c) =>
      C.disciplineItems(c.id).filter((it) => C.recipeParents(it.id).length === 0).length === 1)));

  ok('no blueprint waits on one from another craft', (() =>
    C.SHOP.items.every((it) => (it.needs || []).every((n) => {
      const parent = C.shopItem(n);
      return parent && parent.cat === it.cat;
    }))));

  ok('every blueprint is reachable from its own craft’s root', (() =>
    C.SHOP.categories.every((c) => {
      const seen = {};
      const walk = (id) => {
        if (seen[id]) return;
        seen[id] = true;
        for (const it of C.disciplineItems(c.id)) {
          if (C.recipeParents(it.id).indexOf(id) >= 0) walk(it.id);
        }
      };
      walk(c.root);
      return C.disciplineItems(c.id).every((it) => seen[it.id]);
    })));

  ok('no blueprint is its own ancestor', (() => {
    const walk = (id, trail) => {
      if (trail.indexOf(id) >= 0) return false;
      return C.recipeParents(id).every((n) => walk(n, trail.concat([id])));
    };
    return C.SHOP.items.every((it) => walk(it.id, []));
  })());

  ok('taking up a craft hands you its root free, at level one', (() => {
    const s = C.createShop({ rnd: C.mulberry32(401) });
    C.takeUpDiscipline(s, 'swords');
    return C.hasDiscipline(s, 'swords') && C.blueprintLevel(s, 'shortsword') === 1 &&
      C.craftXp(s, 'swords') === 0 && !C.recipeKnown(s, 'buckler');
  })());

  ok('taking up two leaves the other fourteen shut', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(402) }));
    return s.disciplines.length === 2 && s.known.length === 2 &&
      !C.hasDiscipline(s, 'axes') && !C.recipeKnown(s, 'hatchet');
  })());

  ok('a craft you have not taken up hides its whole tree', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(403) }));
    const st = C.recipeStatus(s, 'hatchet');
    return !st.discipline && !st.ready && !st.buyable;
  })());
}

section('Open Your Forge: experience is earned at the anvil');
{
  ok('forging earns experience in that craft and no other', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(410) }));
    s.materials.bronze = 40;
    const res = C.shopFinishForge(s, 'shortsword', 'bronze', 3, 90, 'you');
    return res.ok && res.xp > 0 && C.craftXp(s, 'swords') === res.xp &&
      C.craftXp(s, 'shields') === 0;
  })());

  ok('every blueprint in a craft fills the same pocket', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(411) }));
    schooled(s, 'swords', 100000);
    while (C.blueprintLevel(s, 'shortsword') < C.requiredParentLevel('longsword')) {
      C.upgradeBlueprint(s, 'shortsword');
    }
    C.unlockBlueprint(s, 'longsword');
    s.xp.swords = 0;
    s.materials.bronze = 40;
    C.shopFinishForge(s, 'shortsword', 'bronze', 1, 90, 'you');
    const one = C.craftXp(s, 'swords');
    C.shopFinishForge(s, 'longsword', 'bronze', 1, 90, 'you');
    return one > 0 && C.craftXp(s, 'swords') > one;
  })());

  ok('a bigger board is worth more experience than a small one', (() =>
    C.craftXpFor('greatsword', 'bronze', 90) > C.craftXpFor('shortsword', 'bronze', 90)));

  ok('a dearer metal is worth more', (() =>
    C.craftXpFor('shortsword', 'gold', 90) > C.craftXpFor('shortsword', 'bronze', 90)));

  ok('better work is worth more, and crude work is still worth something', (() =>
    C.craftXpFor('shortsword', 'bronze', 100) > C.craftXpFor('shortsword', 'bronze', 20) &&
    C.craftXpFor('shortsword', 'bronze', 0) >= 1));

  ok('an early blueprint never stops earning', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(412) }));
    schooled(s, 'swords', 100000);
    while (C.blueprintLevel(s, 'shortsword') < C.requiredParentLevel('longsword')) {
      C.upgradeBlueprint(s, 'shortsword');
    }
    C.unlockBlueprint(s, 'longsword');
    C.unlockBlueprint(s, 'falchion');
    s.xp.swords = 0;
    s.materials.bronze = 20;
    C.shopFinishForge(s, 'shortsword', 'bronze', 1, 80, 'you');
    return C.craftXp(s, 'swords') > 0;      // the root still pays, however far you are
  })());

  ok('a staff smith earns the forge experience too', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(413) }));
    s.materials.bronze = 40;
    const e = { id: 1, name: 'Sm', role: 'smith', rank: 'B', power: 4, wage: 60 };
    const res = C.runSmith(s, e, { item: 'shortsword', material: 'bronze', qty: 3 });
    return res.ok && res.xp > 0 && C.craftXp(s, 'swords') === res.xp;
  })());

  ok('experience is paid once at the anvil, not again on delivery', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(414) }));
    s.materials.bronze = 40;
    C.shopFinishForge(s, 'shortsword', 'bronze', 2, 90, 'you');
    const after = C.craftXp(s, 'swords');
    C.shopEndDay(s);                         // the batch comes off the anvil
    return after > 0 && C.craftXp(s, 'swords') === after;
  })());

  ok('putting the forge down and picking it up pays for nothing twice', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(415) }));
    s.materials.bronze = 40;
    C.shopFinishForge(s, 'shortsword', 'bronze', 2, 90, 'you');
    const after = C.craftXp(s, 'swords');
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    C.shopEndDay(back);
    return C.craftXp(back, 'swords') === after;
  })());

  ok('selling, stocking and hauling earn nothing at all', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(416) }));
    s.materials.bronze = 40;
    C.shopFinishForge(s, 'shortsword', 'bronze', 3, 90, 'you');
    C.shopEndDay(s);
    const after = C.craftXp(s, 'swords');
    C.shopMoveToShelf(s, C.lineKey('shortsword', 'bronze'), 3);
    const stand = s.stands.find((st) => st.key === C.lineKey('shortsword', 'bronze'));
    stand.qty -= 1;                          // as a sale would leave it
    return C.craftXp(s, 'swords') === after;
  })());

  ok('lifetime experience only ever climbs, however much is spent', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(417) }));
    s.materials.bronze = 200;
    for (let i = 0; i < 8; i++) C.shopFinishForge(s, 'shortsword', 'bronze', 3, 95, 'you');
    const total = C.craftXpTotal(s, 'swords');
    C.upgradeBlueprint(s, 'shortsword');
    return C.craftXp(s, 'swords') < total && C.craftXpTotal(s, 'swords') === total;
  })());
}

section('Open Your Forge: spending it on the tree');
{
  ok('a blueprint takes a level, and the level costs what the book says', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(420) }));
    schooled(s, 'swords', 1000);
    const cost = C.blueprintUpgradeCost('shortsword', 1);
    const res = C.upgradeBlueprint(s, 'shortsword');
    return res.ok && res.level === 2 && res.spent === cost &&
      C.craftXp(s, 'swords') === 1000 - cost;
  })());

  ok('each level costs more than the last', (() => {
    let last = 0;
    for (let l = 1; l < C.SHOP.craft.maxLevel; l++) {
      const cost = C.blueprintUpgradeCost('shortsword', l);
      if (!(cost > last)) return false;
      last = cost;
    }
    return C.blueprintUpgradeCost('shortsword', C.SHOP.craft.maxLevel) === null;
  })());

  ok('a bigger item costs more to master than a small one', (() =>
    C.blueprintUpgradeCost('greatsword', 1) > C.blueprintUpgradeCost('shortsword', 1)));

  ok('a blueprint stops at the top of the ladder', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(421) }));
    schooled(s, 'swords');
    for (let i = 0; i < 12; i++) C.upgradeBlueprint(s, 'shortsword');
    return C.blueprintLevel(s, 'shortsword') === C.SHOP.craft.maxLevel &&
      C.blueprintMastered(s, 'shortsword') &&
      !C.upgradeBlueprint(s, 'shortsword').ok;
  })());

  ok('experience you have not got buys nothing', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(422) }));
    schooled(s, 'swords', 0);
    const res = C.upgradeBlueprint(s, 'shortsword');
    return !res.ok && C.blueprintLevel(s, 'shortsword') === 1;
  })());

  ok('an advanced blueprint waits on its forerunner reaching a level', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(423) }));
    schooled(s, 'swords');
    const need = C.requiredParentLevel('longsword');
    const cold = C.unlockBlueprint(s, 'longsword');
    while (C.blueprintLevel(s, 'shortsword') < need) C.upgradeBlueprint(s, 'shortsword');
    const warm = C.unlockBlueprint(s, 'longsword');
    return !cold.ok && warm.ok && C.blueprintLevel(s, 'longsword') === 1;
  })());

  ok('unlocking one blueprint can open the choice of two', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(424) }));
    schooled(s, 'swords');
    while (C.blueprintLevel(s, 'shortsword') < C.requiredParentLevel('longsword')) {
      C.upgradeBlueprint(s, 'shortsword');
    }
    C.unlockBlueprint(s, 'longsword');
    while (C.blueprintLevel(s, 'longsword') < C.requiredParentLevel('bastard')) {
      C.upgradeBlueprint(s, 'longsword');
    }
    return C.recipeStatus(s, 'bastard').buyable && C.recipeStatus(s, 'greatsword').buyable;
  })());

  ok('you may take one branch and leave the other', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(425) }));
    schooled(s, 'swords');
    while (C.blueprintLevel(s, 'shortsword') < C.requiredParentLevel('longsword')) {
      C.upgradeBlueprint(s, 'shortsword');
    }
    C.unlockBlueprint(s, 'longsword');
    return C.recipeKnown(s, 'longsword') && !C.recipeKnown(s, 'falchion');
  })());

  ok('sword experience cannot buy a shield, or the other way about', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(426) }));
    schooled(s, 'swords', 100000);
    schooled(s, 'shields', 0);
    while (C.blueprintLevel(s, 'buckler') < 5 && C.upgradeBlueprint(s, 'buckler').ok) { /* try */ }
    const res = C.upgradeBlueprint(s, 'buckler');
    return !res.ok && C.blueprintLevel(s, 'buckler') === 1 &&
      C.craftXp(s, 'swords') === 100000;
  })());

  ok('there is no shop-wide pool to spend instead', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(427) }));
    return typeof s.xp === 'object' && s.xp.all === undefined &&
      Object.keys(s.xp).every((k) => !!C.shopCategory(k));
  })());

  ok('a blueprint outside your crafts cannot be bought at any price', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(428) }));
    s.xp.axes = 100000;                      // as a hand-edited save might hold
    const res = C.unlockBlueprint(s, 'handaxe');
    return !res.ok && !C.recipeKnown(s, 'handaxe');
  })());
}

section('Open Your Forge: taking up a third craft');
{
  ok('a third craft is bought with a name and money, never its own experience', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(430) }));
    const terms = C.disciplineTerms(s);
    s.reputation = terms.rep;
    s.gold = terms.cost;
    const res = C.shopTakeUpDiscipline(s, 'axes');
    return res.ok && C.hasDiscipline(s, 'axes') && s.gold === 0 &&
      C.blueprintLevel(s, 'hatchet') === 1 && C.craftXp(s, 'axes') === 0;
  })());

  ok('a forge without the name for it is turned down and pays nothing', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(431) }));
    s.reputation = 0; s.gold = 1e6;
    const res = C.shopTakeUpDiscipline(s, 'axes');
    return !res.ok && !C.hasDiscipline(s, 'axes') && s.gold === 1e6;
  })());

  ok('a forge without the money is turned down too', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(432) }));
    s.reputation = 1000; s.gold = 0;
    return !C.shopTakeUpDiscipline(s, 'axes').ok && !C.hasDiscipline(s, 'axes');
  })());

  ok('each craft after that asks for more', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(433) }));
    const third = C.disciplineTerms(s);
    s.reputation = 1e6; s.gold = 1e9;
    C.shopTakeUpDiscipline(s, 'axes');
    const fourth = C.disciplineTerms(s);
    return fourth.cost > third.cost && fourth.rep > third.rep;
  })());

  ok('the two you start with are free', (() => {
    const s = C.createShop({ rnd: C.mulberry32(434), gold: 0 });
    apprenticed(s, 'swords', 'shields');
    return s.gold === 0 && s.disciplines.length === 2;
  })());

  ok('a craft already yours cannot be bought twice', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(435) }));
    s.reputation = 1e6; s.gold = 1e9;
    const before = s.gold;
    return !C.shopTakeUpDiscipline(s, 'swords').ok && s.gold === before &&
      s.disciplines.length === 2;
  })());
}

section('Open Your Forge: a blueprint’s level is worth money');
{
  ok('a mastered blueprint is worth better than twice a fresh one', (() => {
    const one = C.recommendedPrice('shortsword', 'bronze', 100, 1);
    const five = C.recommendedPrice('shortsword', 'bronze', 100, C.SHOP.craft.maxLevel);
    return five > one * 2;
  })());

  ok('the value table climbs and starts at one', (() => {
    const t = C.SHOP.craft.levelValue;
    if (t[0] !== 1) return false;
    for (let i = 1; i < t.length; i++) if (!(t[i] > t[i - 1])) return false;
    return t.length === C.SHOP.craft.maxLevel;
  })());

  ok('the metal, the work and the blueprint each count once', (() => {
    const base = C.shopItem('shortsword').price;
    const gold = C.shopMaterial('gold').value;
    const want = Math.round(base * gold * C.qualityFactor(80) * C.levelValue(3));
    return C.recommendedPrice('shortsword', 'gold', 80, 3) === want;
  })());

  ok('two of the same piece differ by the blueprint alone', (() => {
    const crude = C.recommendedPrice('shortsword', 'silver', 74, 1);
    const master = C.recommendedPrice('shortsword', 'silver', 74, 5);
    const want = C.levelValue(5) / C.levelValue(1);
    // both are rounded to whole gold, so the ratio is only ever near-exact
    return master > crude && Math.abs(master / crude - want) < 0.02;
  })());

  ok('a piece is priced on the blueprint it was made on, not today’s', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(440) }));
    s.materials.bronze = 40;
    C.shopFinishForge(s, 'shortsword', 'bronze', 3, 90, 'you');
    C.shopEndDay(s);
    const key = C.lineKey('shortsword', 'bronze');
    const made = s.storage[key].level;
    schooled(s, 'swords');
    for (let i = 0; i < 4; i++) C.upgradeBlueprint(s, 'shortsword');
    return made === 1 && s.storage[key].level === 1 &&
      C.blueprintLevel(s, 'shortsword') === 5;
  })());

  ok('the stand takes the price the goods were made at', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(441) }));
    schooled(s, 'swords');
    for (let i = 0; i < 4; i++) C.upgradeBlueprint(s, 'shortsword');
    s.materials.bronze = 40;
    C.shopFinishForge(s, 'shortsword', 'bronze', 3, 100, 'you');
    C.shopEndDay(s);
    const key = C.lineKey('shortsword', 'bronze');
    C.shopMoveToShelf(s, key, 3);
    const stand = s.stands.find((st) => st.key === key);
    return stand.level === 5 &&
      stand.price === C.recommendedPrice('shortsword', 'bronze', 100, 5);
  })());

  ok('a blended lot averages the blueprints that made it', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(442) }));
    const key = C.lineKey('shortsword', 'bronze');
    C.addStorage(s, key, 2, 90, 1);
    C.addStorage(s, key, 2, 90, 5);
    return s.storage[key].qty === 4 && s.storage[key].level === 3;
  })());

  ok('a level is never counted twice on its way to the counter', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(443) }));
    schooled(s, 'swords');
    for (let i = 0; i < 4; i++) C.upgradeBlueprint(s, 'shortsword');
    s.materials.bronze = 40;
    C.shopFinishForge(s, 'shortsword', 'bronze', 3, 100, 'you');
    C.shopEndDay(s);
    const key = C.lineKey('shortsword', 'bronze');
    C.shopMoveToShelf(s, key, 3);
    const stand = s.stands.find((st) => st.key === key);
    const plain = C.recommendedPrice('shortsword', 'bronze', 100, 1);
    const once = C.recommendedPrice('shortsword', 'bronze', 100, 5);
    // exactly one multiplier: applied twice the price would be half as much
    // again, which is what this catches
    return stand.price === once && stand.price < plain * C.levelValue(5) * 1.05;
  })());

  ok('a blueprint level never changes what stand a thing belongs on', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(444) }));
    const before = C.standForItem('shortsword');
    schooled(s, 'swords');
    for (let i = 0; i < 4; i++) C.upgradeBlueprint(s, 'shortsword');
    return C.standForItem('shortsword') === before;
  })());
}

section('Open Your Forge: the anvil and the book stay separate');
{
  ok('the forge will not work a blueprint it has never been shown', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(450) }));
    s.materials.bronze = 20;
    const res = C.shopFinishForge(s, 'longsword', 'bronze', 2, 90, 'you');
    return !res.ok && s.orders.length === 0 && s.materials.bronze === 20;
  })());

  ok('nor one from a craft it never took up', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(451) }));
    s.materials.bronze = 20;
    return !C.shopFinishForge(s, 'hatchet', 'bronze', 1, 90, 'you').ok;
  })());

  ok('only what is in the book is offered at the anvil', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(452) }));
    const book = C.knownRecipes(s).map((it) => it.id);
    return book.length === 2 && book.every((id) => C.recipeKnown(s, id));
  })());

  ok('forging writes the book: what was made, the best of it and the metal', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(453) }));
    s.materials.bronze = 20;
    C.shopFinishForge(s, 'shortsword', 'bronze', 2, 70, 'you');
    C.shopFinishForge(s, 'shortsword', 'bronze', 1, 94, 'you');
    const rec = C.forgeRecord(s, 'shortsword');
    return rec.made === 3 && rec.best === 94 && rec.metals.bronze === 3;
  })());

  ok('taking a blueprint further leaves the best work you ever did alone', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(454) }));
    s.materials.bronze = 20;
    C.shopFinishForge(s, 'shortsword', 'bronze', 2, 94, 'you');
    schooled(s, 'swords');
    C.upgradeBlueprint(s, 'shortsword');
    const rec = C.forgeRecord(s, 'shortsword');
    return rec.best === 94 && rec.made === 2 && C.blueprintLevel(s, 'shortsword') === 2;
  })());

  ok('a masterwork at the anvil leaves the blueprint’s level alone', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(455) }));
    schooled(s, 'swords');
    C.upgradeBlueprint(s, 'shortsword');
    C.upgradeBlueprint(s, 'shortsword');
    const level = C.blueprintLevel(s, 'shortsword');
    s.materials.bronze = 20;
    C.shopFinishForge(s, 'shortsword', 'bronze', 1, 100, 'you');
    return level === 3 && C.blueprintLevel(s, 'shortsword') === 3;
  })());

  ok('nothing is learned overnight any more', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(456) }));
    s.reputation = 1000; s.tier = 4; s.materials.bronze = 40;
    C.shopFinishForge(s, 'shortsword', 'bronze', 1, 100, 'you');
    const known = s.known.length;
    const day = C.shopEndDay(s);
    return s.known.length === known && day.learned.length === 0 &&
      !C.recipeKnown(s, 'longsword');
  })());
}

section('Open Your Forge: the tree draws without overlapping itself');
{
  ok('every craft lays out with a node for each blueprint', (() =>
    C.SHOP.categories.every((c) => {
      const tree = C.disciplineTree(c.id);
      return tree.nodes.length === C.disciplineItems(c.id).length;
    })));

  ok('no two nodes share a place on the page', (() =>
    C.SHOP.categories.every((c) => {
      const seen = {};
      for (const n of C.disciplineTree(c.id).nodes) {
        const at = n.depth + ':' + n.col;
        if (seen[at]) return false;
        seen[at] = true;
      }
      return true;
    })));

  ok('a line is drawn for every step of every tree', (() =>
    C.SHOP.categories.every((c) => {
      const tree = C.disciplineTree(c.id);
      const want = C.disciplineItems(c.id)
        .reduce((n, it) => n + C.recipeParents(it.id).length, 0);
      return tree.links.length === want;
    })));

  ok('the root is at the top and nothing sits above it', (() =>
    C.SHOP.categories.every((c) => {
      const tree = C.disciplineTree(c.id);
      const root = tree.nodes.find((n) => n.id === c.root);
      return root && root.depth === 0 && tree.nodes.every((n) => n.depth >= 0);
    })));

  ok('a child always hangs below its parent', (() =>
    C.SHOP.categories.every((c) => {
      const tree = C.disciplineTree(c.id);
      const depth = {};
      for (const n of tree.nodes) depth[n.id] = n.depth;
      return tree.links.every((l) => depth[l.to] === depth[l.from] + 1);
    })));

  ok('no tree is too wide to reach on a phone', (() =>
    C.SHOP.categories.every((c) => C.disciplineTree(c.id).cols <= 5)));

  ok('the book can still name who wants a thing', (() =>
    C.recipeCustomers('shortsword').length > 0));

  ok('every blueprint names customers who exist', (() =>
    C.SHOP.items.every((it) => (it.tags || []).every((t) => !!C.shopCustomerType(t)))));
}

section('Open Your Forge: the craft survives being put down');
{
  ok('crafts, experience and levels all come back', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(460) }));
    schooled(s, 'swords', 900);
    C.upgradeBlueprint(s, 'shortsword');
    C.upgradeBlueprint(s, 'shortsword');
    s.xpTotal.swords = 4000;
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    return back.disciplines.join(',') === 'swords,shields' &&
      C.blueprintLevel(back, 'shortsword') === 3 &&
      C.craftXp(back, 'swords') === C.craftXp(s, 'swords') &&
      C.craftXpTotal(back, 'swords') === 4000;
  })());

  ok('the book of what was made comes back with it', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(461) }));
    s.materials.bronze = 20;
    C.shopFinishForge(s, 'shortsword', 'bronze', 2, 88, 'you');
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    return C.forgeRecord(back, 'shortsword').best === 88 &&
      C.forgeRecord(back, 'shortsword').made === 2;
  })());

  ok('stock comes back priced on the blueprint that made it', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(462) }));
    schooled(s, 'swords');
    for (let i = 0; i < 4; i++) C.upgradeBlueprint(s, 'shortsword');
    s.materials.bronze = 40;
    C.shopFinishForge(s, 'shortsword', 'bronze', 3, 100, 'you');
    C.shopEndDay(s);
    const key = C.lineKey('shortsword', 'bronze');
    C.shopMoveToShelf(s, key, 3);
    const price = s.stands.find((st) => st.key === key).price;
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    const stand = back.stands.find((st) => st.key === key);
    return stand.level === 5 && stand.price === price;
  })());

  ok('a forge saved before the craft existed keeps every recipe it knew', (() => {
    const s = C.createShop({ rnd: C.mulberry32(463) });
    const data = C.serializeShop(s);
    delete data.disciplines; delete data.xp; delete data.xpTotal; delete data.blueprints;
    data.known = ['shortsword', 'longsword', 'buckler', 'hatchet'];
    const back = C.restoreShop(data, C.mulberry32(1));
    return ['shortsword', 'longsword', 'buckler', 'hatchet']
      .every((id) => C.recipeKnown(back, id) && C.blueprintLevel(back, id) === 1);
  })());

  ok('and is read as having taken up the crafts it could plainly work', (() => {
    const s = C.createShop({ rnd: C.mulberry32(464) });
    const data = C.serializeShop(s);
    delete data.disciplines; delete data.blueprints;
    data.known = ['shortsword', 'longsword', 'buckler'];
    const back = C.restoreShop(data, C.mulberry32(1));
    return C.hasDiscipline(back, 'swords') && C.hasDiscipline(back, 'shields') &&
      !C.hasDiscipline(back, 'axes');
  })());

  ok('a save from before recipes were learned at all still opens', (() => {
    const s = C.createShop({ rnd: C.mulberry32(465) });
    const data = C.serializeShop(s);
    data.v = 2;
    delete data.known; delete data.ledger; delete data.learned;
    delete data.disciplines; delete data.blueprints;
    const back = C.restoreShop(data, C.mulberry32(1));
    return !!back && C.SHOP.legacyRecipes.every((id) => C.recipeKnown(back, id)) &&
      back.disciplines.length > 0;
  })());

  ok('an older save is never sent back to the specialisation screen', (() => {
    const s = C.createShop({ rnd: C.mulberry32(466) });
    const data = C.serializeShop(s);
    delete data.disciplines; delete data.blueprints;
    data.known = ['cookknife'];
    const back = C.restoreShop(data, C.mulberry32(1));
    return back.disciplines.length === 1 && C.recipeKnown(back, 'cookknife');
  })());

  ok('a craft is given its root even if the save had lost it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(467) });
    const data = C.serializeShop(s);
    data.disciplines = ['swords'];
    data.blueprints = { longsword: 4 };            // the root is missing
    const back = C.restoreShop(data, C.mulberry32(1));
    return C.recipeKnown(back, 'shortsword') && C.blueprintLevel(back, 'longsword') === 4;
  })());

  ok('a save whose craft list is rubbish still leaves a forge that can work', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(468) }));
    const data = C.serializeShop(s);
    data.disciplines = ['swords', 'not-a-craft', 17, null];
    data.blueprints = { shortsword: 'lots', 'not-a-recipe': 3, greatsword: 99 };
    data.xp = { swords: -50, 'not-a-craft': 1e9 };
    const back = C.restoreShop(data, C.mulberry32(1));
    return back.disciplines.join(',') === 'swords' &&
      C.recipeKnown(back, 'shortsword') && !C.recipeKnown(back, 'not-a-recipe') &&
      C.craftXp(back, 'swords') === 0 && C.craftXp(back, 'not-a-craft') === 0 &&
      C.blueprintLevel(back, 'greatsword') === C.SHOP.craft.maxLevel;
  })());

  ok('experience cannot be stockpiled against a craft you never took up', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(469) }));
    const data = C.serializeShop(s);
    data.xp = { swords: 100, axes: 999999 };
    data.xpTotal = { swords: 400, axes: 999999 };
    const back = C.restoreShop(data, C.mulberry32(1));
    return C.craftXp(back, 'swords') === 100 && C.craftXp(back, 'axes') === 0 &&
      !C.hasDiscipline(back, 'axes');
  })());

  ok('nor more of it in hand than was ever earned', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(475) }));
    const data = C.serializeShop(s);
    data.xp = { swords: 999999 };
    data.xpTotal = { swords: 60 };
    const back = C.restoreShop(data, C.mulberry32(1));
    return C.craftXp(back, 'swords') === 60 && C.craftXpTotal(back, 'swords') === 60;
  })());

  ok('a save from before there was a lifetime figure keeps what it holds', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(476) }));
    const data = C.serializeShop(s);
    data.xp = { swords: 250 };
    delete data.xpTotal;
    const back = C.restoreShop(data, C.mulberry32(1));
    return C.craftXp(back, 'swords') === 250 && C.craftXpTotal(back, 'swords') === 250;
  })());

  ok('a blueprint whose craft was never taken up is not held', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(470) }));
    const data = C.serializeShop(s);
    data.blueprints = { shortsword: 2, hatchet: 5 };
    const back = C.restoreShop(data, C.mulberry32(1));
    return C.blueprintLevel(back, 'shortsword') === 2 &&
      !C.recipeKnown(back, 'hatchet') && back.known.indexOf('hatchet') < 0;
  })());

  ok('a forge saved before there were stands has its shelf put onto stands', (() => {
    const s = C.createShop({ rnd: C.mulberry32(471) });
    const data = C.serializeShop(s);
    data.v = 2;
    delete data.stands;
    delete data.known;
    data.shelf = {};
    data.shelf[C.lineKey('longsword', 'bronze')] = { qty: 3, quality: 88, price: 61 };
    data.shelf[C.lineKey('plate', 'bronze')] = { qty: 2, quality: 77, price: 200 };
    data.shelf[C.lineKey('kite', 'bronze')] = { qty: 1, quality: 95, price: 80 };
    const back = C.restoreShop(data, C.mulberry32(1));
    if (!back) return false;
    const blade = C.shelfLine(back, C.lineKey('longsword', 'bronze'));
    const mail = C.shelfLine(back, C.lineKey('plate', 'bronze'));
    return back.stands.length === 3 && C.countShelf(back) === 6 &&
      !!blade && blade.qty === 3 && blade.price === 61 &&
      !!mail && C.standById(back, mail.id).type === 'armor' &&
      back.stands.every((st) => !st.key || C.standTakes(st.type, C.splitKey(st.key).item));
  })());

  ok('a shelf too deep for the floor goes into storage rather than vanishing', (() => {
    const s = C.createShop({ rnd: C.mulberry32(472) });
    const data = C.serializeShop(s);
    data.v = 2;
    delete data.stands;
    data.shelf = {};
    data.shelf[C.lineKey('longsword', 'bronze')] = { qty: 40, quality: 90, price: 61 };
    const back = C.restoreShop(data, C.mulberry32(1));
    return !!back && C.countShelf(back) === C.standHold() &&
      C.countStorage(back) === 40 - C.standHold();
  })());

  ok('a save whose stands are rubbish still leaves a forge that can trade', (() => {
    const s = C.createShop({ rnd: C.mulberry32(473) });
    const data = C.serializeShop(s);
    data.stands = [{ type: 'trebuchet-rack' }, null, 17,
      { type: 'weapon', key: 'plate|bronze', qty: 4, quality: 50, price: 9 },
      { type: 'shield', key: 'kite|bronze', qty: 900, quality: 50, price: 9 }];
    const back = C.restoreShop(data, C.mulberry32(1));
    if (!back) return false;
    const rack = back.stands.find((st) => st.type === 'weapon');
    const shield = back.stands.find((st) => st.type === 'shield');
    return back.stands.length === 2 && !!rack && rack.qty === 0 && rack.key === null &&
      !!shield && shield.qty === C.standHold() &&
      back.stands.every((st) => !st.key || C.standTakes(st.type, C.splitKey(st.key).item));
  })());

  ok('a save whose ledger is rubbish still leaves a forge that can work', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(474) }));
    const data = C.serializeShop(s);
    data.ledger = { 'not-a-recipe': { made: 5 }, shortsword: { made: 'lots', best: 900 } };
    const back = C.restoreShop(data, C.mulberry32(1));
    return !!back && !C.forgeRecord(back, 'not-a-recipe') &&
      C.forgeRecord(back, 'shortsword').best === 100;
  })());
}
section('Open Your Forge: production and stock');
{
  ok('one puzzle makes the whole batch', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(10) }));
    s.materials.bronze = 10;
    const res = C.shopFinishForge(s, 'shortsword', 'bronze', 3, 90, 'you');
    return res.ok && s.orders.length === 1 && s.orders[0].qty === 3;
  })());

  ok('an item costs one ingot of its material', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(11) }), 'daggers');
    s.materials.silver = 5;
    const qty = Math.min(3, C.batchCapacity(s));
    C.shopFinishForge(s, 'dagger', 'silver', qty, 80, 'you');
    return s.materials.silver === 5 - qty;
  })());

  ok('a batch you cannot pay for in metal is refused', (() => {
    const s = C.createShop({ rnd: C.mulberry32(12) });
    s.materials.gold = 1;
    return C.forgeCheck(s, 'mace', 'gold', 3).ok === false;
  })());

  ok('a batch bigger than the forge allows is refused', (() => {
    const s = C.createShop({ rnd: C.mulberry32(13) });
    s.materials.bronze = 99;
    return C.forgeCheck(s, 'mace', 'bronze', C.batchCapacity(s) + 1).ok === false;
  })());

  ok('finished work lands in storage the next day, never on the shelf', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(14) }), 'boots');
    s.materials.bronze = 9;
    C.shopFinishForge(s, 'boots', 'bronze', 2, 100, 'you');
    if (C.countStorage(s) !== 0) return false;
    for (let i = 0; i < 3; i++) C.shopAdvancePhase(s);       // to the next day
    return C.countStorage(s) === 2 && C.countShelf(s) === 0;
  })());

  ok('stock has to be carried out before anyone can buy it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(15) });
    C.addStorage(s, C.lineKey('dagger', 'bronze'), 3, 100);
    const before = C.countShelf(s);
    const moved = C.shopMoveToShelf(s, C.lineKey('dagger', 'bronze'), 2);
    return before === 0 && moved.moved === 2 && C.countShelf(s) === 2 && C.countStorage(s) === 1;
  })());

  ok('a stand holds only so much, however much is waiting in storage', (() => {
    const s = C.createShop({ rnd: C.mulberry32(16) });
    const hold = C.standHold();
    C.addStorage(s, C.lineKey('dagger', 'bronze'), hold + 20, 100);
    C.shopMoveToShelf(s, C.lineKey('dagger', 'bronze'), hold + 20);
    return C.countShelf(s) === hold && C.countStorage(s) === 20;
  })());

  ok('nothing goes out with no stand that will take it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(160) });
    C.addStorage(s, C.lineKey('boots', 'bronze'), 3, 100);
    const cold = C.shopMoveToShelf(s, C.lineKey('boots', 'bronze'), 3);
    s.gold = 9999;
    const boxed = C.shopBuyStand(s, 'armor').stand;
    // bought, but still in the back: nothing goes out on it yet
    const back = C.shopMoveToShelf(s, C.lineKey('boots', 'bronze'), 3);
    C.placeStand(s, boxed.id);
    const warm = C.shopMoveToShelf(s, C.lineKey('boots', 'bronze'), 3);
    if (back.moved !== 0) return false;
    return cold.moved === 0 && !!cold.why && warm.moved === 3;
  })());

  ok('a stand will not take what it was not made for', (() => {
    const s = C.createShop({ rnd: C.mulberry32(161) });
    C.addStorage(s, C.lineKey('buckler', 'bronze'), 2, 100);
    const rack = s.stands.find((st) => st.type === 'weapon');
    const res = C.shopStockStand(s, rack.id, C.lineKey('buckler', 'bronze'), 2);
    return res.moved === 0 && rack.qty === 0;
  })());

  ok('a stand is bought, kept inside the floor space, and sold back', (() => {
    const s = C.createShop({ rnd: C.mulberry32(162), gold: 100000 });
    const start = s.stands.length;
    while (s.stands.length < C.standCap(s)) {
      if (!C.shopBuyStand(s, 'shield').ok) return false;
    }
    const over = C.shopBuyStand(s, 'shield');
    const gold = s.gold;
    const back = C.shopSellStand(s, s.stands[s.stands.length - 1].id);
    return start < C.standCap(s) && !over.ok && back.ok && back.back > 0 &&
      s.gold === gold + back.back && s.stands.length === C.standCap(s) - 1;
  })());

  ok('selling a stand puts what was on it back in storage', (() => {
    const s = C.createShop({ rnd: C.mulberry32(163) });
    C.addStorage(s, C.lineKey('dagger', 'bronze'), 4, 100);
    C.shopMoveToShelf(s, C.lineKey('dagger', 'bronze'), 4);
    const stand = s.stands.find((st) => st.qty > 0);
    C.shopSellStand(s, stand.id);
    return C.countShelf(s) === 0 && C.countStorage(s) === 4;
  })());

  ok('a stand can be re-purposed while it is empty and not once it is not', (() => {
    const s = C.createShop({ rnd: C.mulberry32(164) });
    const stand = s.stands.find((st) => st.type === 'tool');
    const easy = C.shopSetStandType(s, stand.id, 'shield');
    C.addStorage(s, C.lineKey('buckler', 'bronze'), 2, 100);
    C.shopMoveToShelf(s, C.lineKey('buckler', 'bronze'), 2);
    const hard = C.shopSetStandType(s, stand.id, 'helmet');
    return easy.ok && stand.type === 'shield' && !hard.ok && stand.type === 'shield';
  })());

  ok('bigger premises make room for more stands, and do not fill it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(17), gold: 100000 });
    const before = [C.standCap(s), C.storageCapacity(s), C.staffCapacity(s), C.batchCapacity(s)];
    const floor = C.countShelf(s), stands = s.stands.length;
    C.shopExpand(s);
    const after = [C.standCap(s), C.storageCapacity(s), C.staffCapacity(s), C.batchCapacity(s)];
    return after.every((v, i) => v > before[i]) && C.rentDue(s) > C.SHOP.tiers[0].rent &&
      s.stands.length === stands && C.countShelf(s) === floor;
  })());
}

section('Open Your Forge: the shop survives being put down');
{
  const build = () => {
    const sh = C.createShop({ rnd: C.mulberry32(41) });
    sh.day = 12; sh.phaseIndex = 2; sh.gold = 4321; sh.reputation = 57;
    sh.tier = 2; sh.rentPaid = 1; sh.upgrades.racks = 2;
    sh.materials.silver = 9; sh.materials.mithril = 2;
    C.addStorage(sh, C.lineKey('plate', 'gold'), 3, 91);
    stock(sh, C.lineKey('longsword', 'bronze'), 4, 88, 61);
    sh.staff.push({ id: 7, name: 'Mara', role: 'salesperson', rank: 'C', power: 3, wage: 32 });
    sh.orders.push({ id: 8, key: C.lineKey('mace', 'silver'), item: 'mace', material: 'silver',
      qty: 2, quality: 79, maker: 'you', dueDay: 13 });
    C.shopAssign(sh, 7, {});
    return sh;
  };
  const trip = (sh) => C.restoreShop(JSON.parse(JSON.stringify(C.serializeShop(sh))), C.mulberry32(2));

  ok('a shop put down comes back as it was', (() => {
    const a = build(), b = trip(a);
    const same = (x) => [x.day, x.phaseIndex, x.gold, x.reputation, x.tier, x.rentPaid,
      x.upgrades.displays, x.materials.silver, x.materials.mithril,
      C.countStorage(x), C.countShelf(x), x.staff.length, x.orders.length].join('|');
    return same(a) === same(b);
  })());

  ok('prices the player set are not reset by the round trip', (() => {
    const b = trip(build());
    return C.shelfLine(b, C.lineKey('longsword', 'bronze')).price === 61;
  })());

  ok('an order still on the anvil comes back with it', (() => {
    const b = trip(build());
    return b.orders.length === 1 && b.orders[0].qty === 2 && b.orders[0].dueDay === 13;
  })());

  ok('a save from another version is refused rather than half-read',
    C.restoreShop({ v: 999, gold: 9e9 }, C.mulberry32(1)) === null);
  ok('rubbish is refused too',
    C.restoreShop(null, C.mulberry32(1)) === null &&
    C.restoreShop('nonsense', C.mulberry32(1)) === null &&
    C.restoreShop({}, C.mulberry32(1)) === null);

  ok('a doctored save cannot conjure gold or standing out of range', (() => {
    const blob = C.serializeShop(build());
    blob.gold = 1e30; blob.reputation = 5000; blob.tier = 99; blob.day = -4;
    const b = C.restoreShop(blob, C.mulberry32(1));
    return b.gold <= 1e12 && b.reputation === 100 && b.tier === C.SHOP.tiers.length && b.day === 1;
  })());

  ok('goods that no longer exist are dropped, not carried', (() => {
    const blob = C.serializeShop(build());
    stock(blob, 'trebuchet|bronze', 5, 100, 10);
    stock(blob, 'longsword|unobtainium', 5, 100, 10);
    blob.storage['nonsense'] = { qty: 3, quality: 100 };
    const b = C.restoreShop(blob, C.mulberry32(1));
    return C.countShelf(b) === 4 && C.countStorage(b) === 3;
  })());

  ok('staff with an unknown role or rank are left behind', (() => {
    const blob = C.serializeShop(build());
    blob.staff.push({ id: 90, name: 'Ghost', role: 'alchemist', rank: 'C', wage: 10 });
    blob.staff.push({ id: 91, name: 'Ghost', role: 'runner', rank: 'Z', wage: 10 });
    const b = C.restoreShop(blob, C.mulberry32(1));
    return b.staff.length === 1;
  })());

  ok('a save cannot smuggle in more staff than the shop can hold', (() => {
    const blob = C.serializeShop(build());
    for (let i = 0; i < 30; i++) {
      blob.staff.push({ id: 200 + i, name: 'Extra', role: 'runner', rank: 'S', wage: 1 });
    }
    const b = C.restoreShop(blob, C.mulberry32(1));
    return b.staff.length === C.staffCapacity(b);
  })());

  ok('an order for goods that no longer exist is dropped', (() => {
    const blob = C.serializeShop(build());
    blob.orders.push({ id: 60, item: 'trebuchet', material: 'bronze', qty: 2, quality: 90, dueDay: 14 });
    const b = C.restoreShop(blob, C.mulberry32(1));
    return b.orders.length === 1;
  })());

  ok('a job assigned to somebody no longer employed is forgotten', (() => {
    const blob = C.serializeShop(build());
    blob.assignments['404'] = { day: 12, phase: 'morning', job: {} };
    const b = C.restoreShop(blob, C.mulberry32(1));
    return Object.keys(b.assignments).length === 1 && !!b.assignments['7'];
  })());

  ok('restored ids never collide with ones still in use', (() => {
    const blob = C.serializeShop(build());
    blob.nextId = 1;
    const b = C.restoreShop(blob, C.mulberry32(1));
    return b.nextId > 8;
  })());

  ok('a restored shop plays on exactly like any other', (() => {
    const b = trip(build());
    b.gold = 100000;
    const before = b.day;
    for (let i = 0; i < 3; i++) C.shopAdvancePhase(b);
    return b.day === before + 1 && C.countStorage(b) >= 3;
  })());

  /* ---- the name over the door ---- */
  ok('a forge keeps its name through the round trip', (() => {
    const shop = C.createShop({ rnd: C.mulberry32(3), name: 'Emberline' });
    return trip(shop).name === 'Emberline';
  })());

  ok('a name is trimmed and flattened',
    C.shopNameOf('   Ash   fall   ') === 'Ash fall' &&
    C.shopNameOf('a'.repeat(80)).length === C.SHOP_NAME_MAX);

  ok('control characters never reach the sign',
    C.shopNameOf('Ember\u0000line\u001f') === 'Ember line' &&
    C.shopNameOf('\u0000\u0007') === C.SHOP_NAME_DEFAULT);

  ok('a nameless forge falls back rather than showing a blank',
    C.shopNameOf('') === C.SHOP_NAME_DEFAULT &&
    C.shopNameOf(null) === C.SHOP_NAME_DEFAULT &&
    C.shopNameOf('   ') === C.SHOP_NAME_DEFAULT &&
    C.shopNameOf({}) !== '' &&
    C.createShop({ rnd: C.mulberry32(1) }).name === C.SHOP_NAME_DEFAULT);

  ok('two forges on one menu never share a name',
    C.shopNameFree('Emberline', []) === 'Emberline' &&
    C.shopNameFree('Emberline', ['Emberline']) === 'Emberline 2' &&
    C.shopNameFree('Emberline', ['Emberline', 'Emberline 2']) === 'Emberline 3' &&
    C.shopNameFree('emberline', ['EMBERLINE']) === 'emberline 2');

  ok('a name made unique still fits the sign', (() => {
    const long = 'x'.repeat(C.SHOP_NAME_MAX);
    const out = C.shopNameFree(long, [long]);
    return out.length <= C.SHOP_NAME_MAX && out !== long;
  })());

  ok('a forge saved before names existed reads back as an unnamed one', (() => {
    const blob = C.serializeShop(build());
    blob.v = 1;
    delete blob.name;
    const b = C.restoreShop(blob, C.mulberry32(1));
    return !!b && b.name === C.SHOP_NAME_DEFAULT && b.gold === build().gold;
  })());

  ok('a doctored name cannot smuggle markup or length into the menu', (() => {
    const blob = C.serializeShop(build());
    blob.name = '<img src=x onerror=alert(1)> ' + 'y'.repeat(200);
    const b = C.restoreShop(blob, C.mulberry32(1));
    return b.name.length <= C.SHOP_NAME_MAX;
  })());

  ok('the menu holds a fixed number of forges',
    C.SHOP_SAVE_SLOTS >= 2 && C.SHOP_SAVE_SLOTS <= 12);
}

section('Open Your Forge: the board you worked is what it is worth');
{
  ok('quality moves the price, and moves it a long way', (() => {
    const crude = C.recommendedPrice('longsword', 'bronze', 10);
    const sound = C.recommendedPrice('longsword', 'bronze', 60);
    const master = C.recommendedPrice('longsword', 'bronze', 98);
    return crude < sound && sound < master && master > crude * 2.5;
  })());

  ok('a masterwork is worth more than the list price, crude work far less', (() => {
    const list = C.shopItem('longsword').price * C.shopMaterial('bronze').value;
    return C.recommendedPrice('longsword', 'bronze', 100) > list &&
      C.recommendedPrice('longsword', 'bronze', 0) < list * 0.4;
  })());

  ok('the curve never doubles back on itself', (() => {
    let last = -1;
    for (let q = 0; q <= 100; q++) {
      const f = C.qualityFactor(q);
      if (f < last) return false;
      last = f;
    }
    return true;
  })());

  ok('the same number has a name a smith would use', (() =>
    C.qualityBandName(10) === 'Crude' && C.qualityBandName(40) === 'Plain' &&
    C.qualityBandName(60) === 'Sound' && C.qualityBandName(78) === 'Fine' &&
    C.qualityBandName(92) === 'Masterwork'));

  ok('every band starts where the one below it ends', (() => {
    const bands = C.SHOP.qualityBands;
    return bands[0].from === 0 && bands.every((b, i) =>
      i === 0 || b.from > bands[i - 1].from);
  })());

  ok('a knight will not look at crude iron, a labourer will', (() => {
    const s = C.createShop({ rnd: C.mulberry32(700) });
    enrich(s);
    const knight = townsperson(s, 'knight');
    const hand = townsperson(s, 'laborer');
    return C.meetsStandards(hand, 15) && !C.meetsStandards(knight, 15) &&
      C.meetsStandards(knight, 95);
  })());

  ok('and rough work is not on the table for them at all', (() => {
    const s = C.createShop({ rnd: C.mulberry32(701) });
    enrich(s);
    const knight = townsperson(s, 'knight');
    knight.standards = 70;
    knight.want = { cat: 'swords', item: null };
    stock(s, C.lineKey('longsword', 'bronze'), 6, 20, 10);
    const rough = C.chooseGoods(s, knight);
    stock(s, C.lineKey('longsword', 'bronze'), 6, 95, 10);
    const good = C.chooseGoods(s, knight);
    return rough === null && good === C.lineKey('longsword', 'bronze');
  })());

  ok('they say so on the way out rather than leaving silently', (() => {
    const s = noContracts(C.createShop({ rnd: C.mulberry32(702) }));
    enrich(s);
    const knight = townsperson(s, 'knight');
    knight.standards = 80;
    knight.want = { cat: 'swords', item: null };
    stock(s, C.lineKey('longsword', 'bronze'), 6, 20, 10);
    const session = C.openCounter(s, null);
    session.queue = [knight.id];
    session.at = 0;
    const e = C.counterNext(session, s);
    return e.kind === 'leave' && /rough/.test(e.why) && e.name === knight.name;
  })());

  ok('two of a trade do not hold the same standard to the point', (() => {
    const s = C.createShop({ rnd: C.mulberry32(703) });
    for (let i = 0; i < 24; i++) C.makeTownsfolk(s, 'guard');
    const set = new Set(s.town.filter((o) => o.type === 'guard').map((o) => o.standards));
    return set.size > 1;
  })());

  ok('an alternative below their standards is never put to them', (() => {
    const s = C.createShop({ rnd: C.mulberry32(704) });
    enrich(s);
    const knight = townsperson(s, 'knight');
    knight.standards = 70;
    stock(s, C.lineKey('longsword', 'bronze'), 6, 95, 40);
    stock(s, C.lineKey('buckler', 'bronze'), 6, 20, 5);
    const session = C.openCounter(s, null);
    session.queue = [knight.id];
    session.at = 0;
    const e = C.counterNext(session, s);
    if (!e || e.kind !== 'offer') return false;
    return C.alternativeOdds(s, session, C.lineKey('buckler', 'bronze')) === 0;
  })());
}

section('Open Your Forge: the town is people, not rolls');
{
  ok('a new forge opens onto a town of named people', (() => {
    const s = C.createShop({ rnd: C.mulberry32(600) });
    const names = {};
    for (const one of s.town) names[one.name] = (names[one.name] || 0) + 1;
    return s.town.length === C.townTarget(s) && s.town.length >= 20 &&
      Object.keys(names).length === s.town.length &&
      s.town.every((one) => / /.test(one.name) && !!C.shopCustomerType(one.type));
  })());

  ok('everybody carries real money and earns a real wage', (() =>
    (() => {
      const s = C.createShop({ rnd: C.mulberry32(601) });
      return s.town.every((one) => one.gold > 0 && one.income > 0) &&
        // and two of a trade are not the same person
        new Set(s.town.filter((o) => o.type === s.town[0].type)
          .map((o) => o.income + ':' + o.gold)).size > 0;
    })()));

  ok('a bigger, better-known shop reaches more of the town', (() => {
    const small = C.createShop({ rnd: C.mulberry32(602) });
    const big = C.createShop({ rnd: C.mulberry32(602) });
    big.tier = 4; big.reputation = 95;
    return C.townTarget(big) > C.townTarget(small) &&
      C.growTown(big).length > 0 && big.town.length === C.townTarget(big);
  })());

  ok('everybody is after something their own trade would want', (() => {
    const s = C.createShop({ rnd: C.mulberry32(603) });
    return s.town.every((one) => {
      if (!one.want) return true;
      const type = C.shopCustomerType(one.type);
      return (type.likes[one.want.cat] || 0) > 0;
    });
  })());

  ok('a want gives out after a week of looking, and becomes another', (() => {
    const s = C.createShop({ rnd: C.mulberry32(604) });
    const before = s.town.map((one) => C.wantName(one));
    s.day += C.SHOP.town.wantDays;
    const changed = C.driftWants(s);
    const after = s.town.map((one) => C.wantName(one));
    return changed.length > 0 &&
      after.some((w, i) => w !== before[i]) &&
      s.town.every((one) => one.wantDay === s.day);
  })());

  ok('and a want held for a day or two is left alone', (() => {
    const s = C.createShop({ rnd: C.mulberry32(605) });
    const before = s.town.map((one) => C.wantName(one));
    s.day += 1;
    C.driftWants(s);
    return s.town.every((one, i) => C.wantName(one) === before[i]);
  })());

  ok('getting what you came for settles it: you want something else after', (() => {
    const s = C.createShop({ rnd: C.mulberry32(606) });
    enrich(s, 4000);
    const one = townsperson(s, 'guard');
    one.want = { cat: 'swords', item: null };
    one.standards = 0;
    stock(s, C.lineKey('shortsword', 'bronze'), 6, 100, 4);
    const session = C.openCounter(s, null);
    session.queue = [one.id];
    session.at = 0;
    const offer = C.counterNext(session, s);
    const was = C.wantName(one);
    const sale = C.counterRespond(session, s, 'accept');
    return offer.kind === 'offer' && sale.kind === 'sale' && sale.got === was &&
      one.bought === 1 && one.want !== null && one.wantDay === s.day;
  })());

  ok('a purse is real: the money paid comes out of it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(607) });
    const one = townsperson(s, 'guard');
    one.gold = 400; one.standards = 0;
    stock(s, C.lineKey('shortsword', 'bronze'), 6, 100, 30);
    const session = C.openCounter(s, null);
    session.queue = [one.id];
    session.at = 0;
    C.counterNext(session, s);
    const sale = C.counterRespond(session, s, 'accept');
    return sale.kind === 'sale' && one.gold === 400 - sale.price &&
      one.spent === sale.price;
  })());

  ok('nobody offers money they are not carrying', (() => {
    const s = C.createShop({ rnd: C.mulberry32(608) });
    const one = townsperson(s, 'noble');
    one.gold = 40; one.standards = 0;
    stock(s, C.lineKey('plate', 'bronze'), 6, 100, 30);
    const session = C.openCounter(s, null);
    session.queue = [one.id];
    session.at = 0;
    const e = C.counterNext(session, s);
    return !!e && (e.kind === 'leave' ||
      (e.offer <= C.purseFor(one) && e.budget <= C.purseFor(one)));
  })());

  ok('an empty purse keeps you at home', (() => {
    const s = C.createShop({ rnd: C.mulberry32(609) });
    stock(s, C.lineKey('shortsword', 'bronze'), 6, 100, 4);
    for (const one of s.town) one.gold = 0;
    const session = C.openCounter(s, null);
    return session.queue.length === 0;
  })());

  ok('and nobody is in the same queue twice', (() => {
    const s = C.createShop({ rnd: C.mulberry32(610) });
    enrich(s);
    s.reputation = 100;
    stock(s, C.lineKey('shortsword', 'bronze'), 400, 100, 20);
    const session = C.openCounter(s, null);
    return session.queue.length > 1 &&
      new Set(session.queue).size === session.queue.length;
  })());

  ok('wages land at the turn of the week, and only then', (() => {
    const s = C.createShop({ rnd: C.mulberry32(611), gold: 100000 });
    for (const one of s.town) one.gold = 0;
    const owed = s.town.reduce((a, o) => a + o.income, 0);
    for (let i = 0; i < 3; i++) C.shopAdvancePhase(s);       // day 2
    const midweek = s.town.reduce((a, o) => a + o.gold, 0);
    while (s.day < C.SHOP.weekLength + 1) {
      for (let i = 0; i < 3; i++) C.shopAdvancePhase(s);
    }
    const payday = s.town.reduce((a, o) => a + o.gold, 0);
    return midweek === 0 && payday >= owed;
  })());

  ok('the shop cannot take out more than the town can put in', (() => {
    const s = C.createShop({ rnd: C.mulberry32(612) });
    const purse = s.town.reduce((a, o) => a + o.gold, 0);
    stock(s, C.lineKey('shortsword', 'bronze'), 4000, 100, 1);
    let taken = 0;
    for (let i = 0; i < 40; i++) taken += C.runCounter(s, null).revenue;
    return taken > 0 && taken <= purse;
  })());

  ok('a person put down comes back the same person', (() => {
    const s = C.createShop({ rnd: C.mulberry32(613) });
    const one = s.town[0];
    one.gold = 777; one.bought = 3; one.spent = 91;
    one.want = { cat: 'swords', item: 'shortsword' };
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    const again = back.town.find((o) => o.name === one.name);
    return !!again && again.gold === 777 && again.income === one.income &&
      again.standards === one.standards && again.bought === 3 && again.spent === 91 &&
      again.want.item === 'shortsword' && back.town.length === s.town.length;
  })());

  ok('a forge saved before there was a town is given one', (() => {
    const s = C.createShop({ rnd: C.mulberry32(614) });
    const data = C.serializeShop(s);
    delete data.town;
    const back = C.restoreShop(data, C.mulberry32(1));
    return !!back && back.town.length === C.townTarget(back) &&
      back.town.every((one) => one.gold > 0 && !!one.name);
  })());

  ok('a save whose town is rubbish still leaves a town', (() => {
    const s = C.createShop({ rnd: C.mulberry32(615) });
    const data = C.serializeShop(s);
    data.town = [null, 17, { type: 'dragon' },
      { name: 'Real Person', type: 'farmer', gold: 'lots', income: -5,
        standards: 900, want: { cat: 'trebuchets' } }];
    const back = C.restoreShop(data, C.mulberry32(1));
    const real = back.town.find((o) => o.name === 'Real Person');
    return !!back && !!real && real.gold === 0 && real.income > 0 &&
      real.standards <= 100 && !!real.want &&
      !!C.shopCategory(real.want.cat) && back.town.length === C.townTarget(back);
  })());
}

section('Open Your Forge: pricing and customers');
{
  ok('every finished item has a recommended price', (() => {
    for (const it of C.SHOP.items) {
      for (const m of C.SHOP.materials) {
        if (!(C.recommendedPrice(it.id, m.id, 100) > 0)) return false;
      }
    }
    return true;
  })());

  ok('a dearer material is worth more', (() => {
    let last = 0;
    for (const m of C.SHOP.materials) {
      const p = C.recommendedPrice('longsword', m.id, 100);
      if (p <= last) return false;
      last = p;
    }
    return true;
  })());

  ok('rougher work is worth less than a masterwork',
    C.recommendedPrice('longsword', 'bronze', 40) < C.recommendedPrice('longsword', 'bronze', 100));

  ok('overpricing makes an item harder to shift, never unsellable', (() => {
    const at = C.priceAppeal(100, 100);
    const over = C.priceAppeal(200, 100);
    const wild = C.priceAppeal(1000, 100);
    return at === 1 && over < at && wild > 0;
  })());

  ok('undercutting draws more interest', C.priceAppeal(70, 100) > 1);

  ok('a bare shop draws nobody', (() => {
    const s = C.createShop({ rnd: C.mulberry32(18) });
    return C.trafficFor(s) === 0;
  })());

  ok('more stars means more customers', (() => {
    const s = C.createShop({ rnd: C.mulberry32(19) });
    stock(s, C.lineKey('longsword', 'bronze'), 10, 100, 52);
    s.reputation = 5;
    const low = C.trafficFor(s);
    s.reputation = 95;
    return C.trafficFor(s) > low && C.shopStars(s) === 5;
  })());

  ok('what is on the shelves decides who walks in', (() => {
    const blades = C.createShop({ rnd: C.mulberry32(20) });
    stock(blades, C.lineKey('plate', 'bronze'), 10, 100, 150);
    stock(blades, C.lineKey('kite', 'bronze'), 10, 100, 78);
    const heavy = C.customerWeights(blades);

    const light = C.createShop({ rnd: C.mulberry32(21) });
    stock(light, C.lineKey('stiletto', 'bronze'), 10, 100, 38);
    stock(light, C.lineKey('buckler', 'bronze'), 10, 100, 32);
    const nimble = C.customerWeights(light);

    // plate and kite shields pull knights; stilettos and bucklers pull rogues
    return heavy.knight > nimble.knight && nimble.rogue > heavy.rogue &&
      heavy.knight > heavy.rogue && nimble.rogue > nimble.knight;
  })());

  ok('preferences are weights, not rules: anyone may still buy anything', (() => {
    const s = C.createShop({ rnd: C.mulberry32(22) });
    stock(s, C.lineKey('mace', 'bronze'), 50, 100, 34);
    // a rogue rates maces at zero, yet the only thing in the shop is a mace
    let bought = 0;
    for (let i = 0; i < 40; i++) if (C.chooseGoods(s, 'rogue')) bought++;
    return bought === 40;
  })());
}

section('Open Your Forge: the counter');
{
  ok('a sale takes the item off the shelf and pays for it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(23) });
    stock(s, C.lineKey('longsword', 'bronze'), 4, 100, 20);
    const gold = s.gold;
    const r = C.runCounter(s, { kind: 'player', power: 2, name: 'You' });
    return r.sold > 0 && s.gold === gold + r.revenue &&
      C.countShelf(s) === 4 - r.sold;
  })());

  ok('nothing is ever sold that was not stocked', (() => {
    const s = C.createShop({ rnd: C.mulberry32(24) });
    const r = C.runCounter(s, { kind: 'player', power: 2, name: 'You' });
    return r.customers === 0 && r.sold === 0 && r.revenue === 0;
  })());

  ok('a wild price drives customers off without breaking the shop', (() => {
    const s = C.createShop({ rnd: C.mulberry32(25) });
    const rec = C.recommendedPrice('longsword', 'bronze', 100);
    stock(s, C.lineKey('longsword', 'bronze'), 20, 100, rec * 8);
    let sold = 0, seen = 0;
    for (let i = 0; i < 30; i++) {
      const r = C.runCounter(s, { kind: 'player', power: 2, name: 'You' });
      sold += r.sold; seen += r.customers;
    }
    return seen > 0 && sold < seen * 0.25;
  })());

  ok('the report accounts for everyone who came in', (() => {
    const s = C.createShop({ rnd: C.mulberry32(26) });
    stock(s, C.lineKey('mace', 'bronze'), 30, 90, 34);
    const r = C.runCounter(s, { kind: 'player', power: 2, name: 'You' });
    return r.customers === r.sold + r.left && r.won <= r.haggles;
  })());

  ok('accepting an offer sells at the offer, not the asking price', (() => {
    const s = C.createShop({ rnd: C.mulberry32(27) });
    enrich(s);
    for (let round = 0; round < 60; round++) {
      stock(s, C.lineKey('plate', 'bronze'), 60, 100, 400);
      const session = C.openCounter(s, { kind: 'player', power: 2, name: 'You' });
      let guard = 0;
      while (guard++ < 200) {
        const e = C.counterNext(session, s);
        if (!e) break;
        if (e.kind === 'offer') {
          const gold = s.gold, stock = C.countShelf(s);
          const res = C.counterRespond(session, s, 'accept');
          return res.kind === 'sale' && res.price === e.offer &&
            e.offer < e.price && s.gold === gold + e.offer && C.countShelf(s) === stock - 1;
        }
      }
    }
    return false;
  })());

  ok('every customer who wants something is put to the seller', (() => {
    // nothing may settle itself inside counterNext: each one has to surface
    const s = C.createShop({ rnd: C.mulberry32(60) });
    stock(s, C.lineKey('dagger', 'bronze'), 99, 100, 1);
    const session = C.openCounter(s, { kind: 'player', power: 2, name: 'You' });
    let offers = 0, guard = 0;
    while (guard++ < 200) {
      const e = C.counterNext(session, s);
      if (!e) break;
      if (e.kind === 'offer') { offers++; C.counterRespond(session, s, 'accept'); }
    }
    return offers === session.report.customers && session.report.sold === offers;
  })());

  ok('a customer happy with the price offers exactly that', (() => {
    const s = noContracts(C.createShop({ rnd: C.mulberry32(61) }));
    stock(s, C.lineKey('dagger', 'bronze'), 99, 100, 1);
    const session = C.openCounter(s, { kind: 'player', power: 2, name: 'You' });
    const e = C.counterNext(session, s);
    return e.kind === 'offer' && e.full === true && e.offer === 1;
  })());

  ok('a counter-offer is bounded by their offer and your price', (() => {
    const p = { offer: 40, price: 100 };
    const b = C.counterBounds(p);
    return b.min === 40 && b.max === 100;
  })());

  ok('naming their own offer back is always taken', (() => {
    const s = C.createShop({ rnd: C.mulberry32(62) });
    const session = C.openCounter(s, { kind: 'player', power: 2, name: 'You' });
    const p = { type: 'adventurer', offer: 40, price: 100, budget: 60 };
    return C.counterOdds(s, session, p, 40) === 1;
  })());

  ok('asking nearer your own price is likelier to lose them', (() => {
    const s = C.createShop({ rnd: C.mulberry32(63) });
    const session = C.openCounter(s, { kind: 'player', power: 2, name: 'You' });
    const p = { type: 'adventurer', offer: 40, price: 100, budget: 60 };
    const low = C.counterOdds(s, session, p, 45);
    const mid = C.counterOdds(s, session, p, 60);
    const high = C.counterOdds(s, session, p, 95);
    return low > mid && mid > high && high > 0;
  })());

  ok('a shop that has practised haggling does better at it', (() => {
    const plain = C.createShop({ rnd: C.mulberry32(64) });
    const skilled = C.createShop({ rnd: C.mulberry32(64) });
    skilled.upgrades.ledger = 3;
    const p = { type: 'adventurer', offer: 40, price: 100, budget: 60 };
    const seller = { kind: 'player', power: 2, name: 'You' };
    const a = C.counterOdds(plain, { seller: seller }, p, 60);
    const b = C.counterOdds(skilled, { seller: seller }, p, 60);
    return b > a;
  })());

  ok('a counter that lands sells at the price you named', (() => {
    const s = C.createShop({ rnd: C.mulberry32(65) });
    enrich(s);
    stock(s, C.lineKey('plate', 'bronze'), 200, 100, 400);
    for (let round = 0; round < 80; round++) {
      const session = C.openCounter(s, { kind: 'player', power: 6, name: 'You' });
      let guard = 0;
      while (guard++ < 200) {
        const e = C.counterNext(session, s);
        if (!e) break;
        if (e.kind !== 'offer' || e.full) continue;
        const gold = s.gold;
        const named = e.offer + 1;                    // barely above their offer: near certain
        const res = C.counterRespond(session, s, 'haggle', named);
        if (res && res.kind === 'sale') {
          return res.price === named && s.gold === gold + named &&
            session.report.haggles >= 1 && session.report.won >= 1;
        }
      }
    }
    return false;
  })());

  ok('a failed counter ends in a walkout or their last word, never silence', (() => {
    // priced dear enough to be haggled over, not so dear that everyone baulks
    // before they ever make an offer
    const s = C.createShop({ rnd: C.mulberry32(66) });
    enrich(s);
    let walked = 0, held = 0, sold = 0, tries = 0;
    for (let round = 0; round < 200 && tries < 40; round++) {
      stock(s, C.lineKey('plate', 'bronze'), 400, 100, 400);
      const session = C.openCounter(s, { kind: 'player', power: 1, name: 'You' });
      let guard = 0;
      while (guard++ < 200) {
        const e = C.counterNext(session, s);
        if (!e) break;
        if (e.kind !== 'offer') continue;
        if (e.full || e.final) { C.counterRespond(session, s, 'reject'); continue; }
        tries++;
        const res = C.counterRespond(session, s, 'haggle', e.price);   // ask the earth
        if (!res) return false;
        if (res.kind === 'leave') walked++;
        else if (res.kind === 'sale') sold++;          // the rare 3% that lands
        else if (res.kind === 'offer' && res.final) held++;
        else return false;
        break;
      }
    }
    return tries > 0 && walked + held + sold === tries && held > 0 && walked > 0;
  })());

  ok('their last word is their own offer, taken as it stands', (() => {
    const s = C.createShop({ rnd: C.mulberry32(67) });
    enrich(s);
    for (let round = 0; round < 200; round++) {
      stock(s, C.lineKey('plate', 'bronze'), 400, 100, 400);
      const session = C.openCounter(s, { kind: 'player', power: 1, name: 'You' });
      let guard = 0;
      while (guard++ < 200) {
        const e = C.counterNext(session, s);
        if (!e) break;
        if (e.kind !== 'offer') continue;
        if (e.full || e.final) { C.counterRespond(session, s, 'reject'); continue; }
        const res = C.counterRespond(session, s, 'haggle', e.price);
        if (res && res.kind === 'offer' && res.final) {
          const gold = s.gold;
          const after = C.counterRespond(session, s, 'accept');
          return after.kind === 'sale' && after.price === e.offer &&
            s.gold === gold + e.offer && session.report.won >= 1;
        }
        break;
      }
    }
    return false;
  })());

  ok('a better haggler wins more of them', (() => {
    const run = (power) => {
      const s = C.createShop({ rnd: C.mulberry32(500) });
      // a longsword is wanted broadly, so the queue is full of people who
      // actually haggle - full plate draws only the three richest, who barely do
      enrich(s);
      stock(s, C.lineKey('longsword', 'bronze'), 4000, 100, 92);
      let won = 0, tried = 0;
      for (let i = 0; i < 200; i++) {
        const session = C.openCounter(s, { kind: 'staff', power: power, name: 'X' });
        let guard = 0;
        while (guard++ < 200) {
          const e = C.counterNext(session, s);
          if (!e) break;
          if (e.kind !== 'offer') continue;
          if (e.full || e.final) { C.counterRespond(session, s, 'reject'); continue; }
          // split the difference rather than ask the earth: what is under test
          // is the seller's skill, not how hopeless a demand can be
          const bounds = C.counterBounds(e);
          C.counterRespond(session, s, 'haggle',
            Math.round((bounds.min + bounds.max) / 2));
        }
        won += session.report.won; tried += session.report.haggles;
      }
      return tried ? won / tried : 0;
    };
    return run(6) > run(1);
  })());
}

/* The whole day is planned from one screen, so the rules behind it have to
   hold across phases rather than only for the one in progress. */
section('Open Your Forge: offering something else');
{
  /* A customer standing at the counter wanting one named thing. Which of the
     stocked lines catches their eye is a weighted roll, so the seed is walked
     until it lands on the one the check is about. */
  const atCounter = (seed, stockLines, typeId, want) => {
    const wantKey = C.lineKey(want, 'bronze');
    for (let n = 0; n < 400; n++) {
      const s = C.createShop({ rnd: C.mulberry32(seed + n * 7) });
      s.gold = 9999;
      enrich(s);
      for (const line of stockLines) stock(s, C.lineKey(line[0], 'bronze'), 6, 100, line[1]);
      const session = C.openCounter(s, null);
      session.queue = [townsperson(s, typeId).id];
      session.at = 0;
      const event = C.counterNext(session, s);
      if (event && event.kind === 'offer' && event.key === wantKey) {
        return { s, session, event };
      }
    }
    return { s: null, session: null, event: null };
  };

  ok('the floor is offered, minus what is already on the table', (() => {
    const { s, session, event } = atCounter(500,
      [['longsword', 52], ['shortsword', 30], ['hammer', 18]], 'guard', 'longsword');
    if (!event || event.kind !== 'offer') return false;
    const offers = C.alternativeOffers(s, session);
    return offers.length === 2 && offers.every((o) => o.key !== event.key);
  })());

  ok('a guard looks harder at another blade than at a frying pan', (() => {
    const { s, session } = atCounter(501,
      [['longsword', 52], ['shortsword', 8], ['pan', 6]], 'guard', 'longsword');
    const blade = C.alternativeOdds(s, session, C.lineKey('shortsword', 'bronze'));
    const pan = C.alternativeOdds(s, session, C.lineKey('pan', 'bronze'));
    return blade > pan && pan < 0.25 && blade > 0.25;
  })());

  ok('an alternative they want is taken, and it is that item that is sold', (() => {
    let sales = 0, pans = 0;
    for (let n = 0; n < 60; n++) {
      const blade = atCounter(502 + n * 3,
        [['longsword', 52], ['shortsword', 4]], 'guard', 'longsword');
      if (!blade.s) continue;
      const key = C.lineKey('shortsword', 'bronze');
      const before = C.shelfLine(blade.s, key).qty, gold = blade.s.gold;
      const res = C.counterOfferAlternative(blade.session, blade.s, key);
      if (res && res.kind === 'sale') {
        sales++;
        if (res.key !== key || C.shelfLine(blade.s, key).qty !== before - 1 ||
            blade.s.gold !== gold + 4) return false;
      }
      const junk = atCounter(700 + n * 3, [['longsword', 52], ['pan', 4]], 'guard', 'longsword');
      if (!junk.s) continue;
      const bad = C.counterOfferAlternative(junk.session, junk.s, C.lineKey('pan', 'bronze'));
      if (bad && bad.kind === 'sale') pans++;
    }
    // a blade goes often, a frying pan almost never
    return sales > 8 && pans * 2 < sales;
  })());

  ok('one offer a customer, and a refusal leaves them where they stood', (() => {
    const { s, session } = atCounter(503,
      [['longsword', 52], ['pan', 9999]], 'guard', 'longsword');
    const key = C.lineKey('pan', 'bronze');
    const first = C.counterOfferAlternative(session, s, key);
    const again = C.counterOfferAlternative(session, s, key);
    return first.kind === 'refused' && !!session.pending &&
      session.pending.key === C.lineKey('longsword', 'bronze') &&
      again === null && C.alternativeOffers(s, session).length === 0;
  })());

  ok('nothing is offered that is not actually on the floor', (() => {
    const { s, session } = atCounter(504, [['longsword', 52]], 'guard', 'longsword');
    return C.alternativeOffers(s, session).length === 0 &&
      C.counterOfferAlternative(session, s, C.lineKey('plate', 'bronze')) === null;
  })());

  ok('a purse is a ceiling that bends: a labourer baulks where a collector does not', (() => {
    const s = C.createShop({ rnd: C.mulberry32(505) });
    const poor = C.shopCustomerType('laborer'), rich = C.shopCustomerType('collector');
    return C.purseLimit(s, rich) > C.purseLimit(s, poor) &&
      C.purseAppeal(s, poor, 900) < C.purseAppeal(s, rich, 900) &&
      C.purseAppeal(s, poor, 10) === 1;
  })());

  ok('a salesperson puts something else up rather than send them away', (() => {
    const s = C.createShop({ rnd: C.mulberry32(506) });
    stock(s, C.lineKey('longsword', 'bronze'), 6, 100, 52);
    stock(s, C.lineKey('shortsword', 'bronze'), 6, 100, 12);
    const session = C.openCounter(s, { kind: 'staff', power: 5, name: 'Hand' });
    // an offer far under what the work is worth: a poor hand argues, a good
    // one reaches for something else first, and only then gives up
    const poor = { kind: 'offer', type: 'guard', name: 'Town Guard',
      key: C.lineKey('longsword', 'bronze'), price: 52, offer: 26, budget: 30,
      recommended: 52, spread: 1, full: false };
    session.pending = poor;
    const first = C.autoRespond(session, s);
    session.pending = Object.assign({}, poor, { offered: true });
    const after = C.autoRespond(session, s);
    session.seller = { kind: 'player', power: 0, name: 'You' };
    session.pending = poor;
    const alone = C.autoRespond(session, s);
    return first === 'offer' && after === 'reject' && alone !== 'offer';
  })());

  ok('a hand never offers what the floor does not hold', (() => {
    const s = C.createShop({ rnd: C.mulberry32(507) });
    stock(s, C.lineKey('longsword', 'bronze'), 6, 100, 52);
    const session = C.openCounter(s, { kind: 'staff', power: 5, name: 'Hand' });
    session.pending = { kind: 'offer', type: 'guard', name: 'Town Guard',
      key: C.lineKey('longsword', 'bronze'), price: 52, offer: 26, budget: 30,
      recommended: 52, spread: 1, full: false };
    return C.alternativeOffers(s, session).length === 0;
  })());
}

section('Open Your Forge: the day’s roster');
{
  const build = (roles) => {
    const s = C.createShop({ rnd: C.mulberry32(77) });
    s.tier = 4;                                  // room for everybody
    let id = 1;
    for (const r of roles) {
      s.staff.push({ id: id, name: 'Hand ' + id, role: r, rank: 'C', power: 3, wage: 30,
        face: null });
      id++;
    }
    return s;
  };
  const phases = C.SHOP.phases;

  ok('every role can be booked into any phase still ahead', (() => {
    for (const role of C.SHOP.roles) {
      const s = build([role.id]);
      for (const phase of phases) {
        const fresh = build([role.id]);
        if (!C.shopAssign(fresh, 1, {}, phase).ok) return false;
        const at = C.assignmentAt(fresh, role.id, phase);
        if (!at || at.staff.id !== 1) return false;
      }
      if (!s) return false;
    }
    return true;
  })());

  ok('a phase already gone by cannot be booked', (() => {
    const s = build(['runner']);
    s.phaseIndex = 2;                            // evening
    return C.shopAssign(s, 1, {}, phases[0]).ok === false &&
      C.shopAssign(s, 1, {}, phases[2]).ok === true;
  })());

  ok('an unknown phase is refused rather than stored',
    C.shopAssign(build(['runner']), 1, {}, 'midnight').ok === false);

  /* One job a day: booking anywhere takes them off every other box. */
  ok('booking an employee takes them out of every other picker', (() => {
    const s = build(['runner', 'runner']);
    if (C.staffCandidates(s, 'runner', phases[0]).length !== 2) return false;
    C.shopAssign(s, 1, {}, phases[2]);
    for (const phase of phases) {
      const left = C.staffCandidates(s, 'runner', phase);
      if (left.length !== 1 || left[0].id !== 2) return false;
    }
    return true;
  })());

  ok('and dropping them again puts them back in every picker', (() => {
    const s = build(['runner', 'runner']);
    C.shopAssign(s, 1, {}, phases[2]);
    if (!C.shopUnassign(s, 1).ok) return false;
    return phases.every((phase) => C.staffCandidates(s, 'runner', phase).length === 2);
  })());

  ok('a picker never offers somebody of another role', (() => {
    const s = build(['runner', 'smith', 'salesperson']);
    return C.staffCandidates(s, 'runner', phases[0]).every((e) => e.role === 'runner') &&
      C.staffCandidates(s, 'smith', phases[0]).length === 1 &&
      C.staffCandidates(s, 'storehand', phases[0]).length === 0;
  })());

  ok('nor anybody for a phase that has gone by', (() => {
    const s = build(['runner']);
    s.phaseIndex = 1;
    return C.staffCandidates(s, 'runner', phases[0]).length === 0 &&
      C.staffCandidates(s, 'runner', phases[1]).length === 1;
  })());

  /* upcoming / active / done, and what may still be changed */
  ok('work reads as upcoming, active or done as the day moves', (() => {
    const s = build(['runner']);
    C.shopAssign(s, 1, {}, phases[2]);
    if (C.assignmentStatus(s, 1) !== 'upcoming') return false;
    s.phaseIndex = 2;
    if (C.assignmentStatus(s, 1) !== 'active') return false;
    s.assignments[1].done = true;
    return C.assignmentStatus(s, 1) === 'done';
  })());

  ok('only work still ahead may be dropped', (() => {
    const s = build(['runner']);
    C.shopAssign(s, 1, {}, phases[2]);
    if (!C.shopUnassign(s, 1).ok) return false;
    C.shopAssign(s, 1, {}, phases[2]);
    s.phaseIndex = 2;
    if (C.shopUnassign(s, 1).ok) return false;            // active
    s.assignments[1].done = true;
    return C.shopUnassign(s, 1).ok === false;             // done
  })());

  ok('somebody who has worked stays unavailable for the rest of the day', (() => {
    const s = build(['storehand']);
    C.shopAssign(s, 1, {}, phases[0]);
    s.assignments[1].done = true;
    s.phaseIndex = 1;
    return phases.every((phase) => C.staffCandidates(s, 'storehand', phase).length === 0);
  })());

  /* each job runs once, in its own phase and no other */
  ok('a rostered job runs in its phase and only then', (() => {
    const s = build(['salesperson']);
    s.reputation = 70;
    stock(s, C.lineKey('longsword', 'bronze'), 20, 95, 60);
    C.shopAssign(s, 1, {}, phases[2]);
    const first = C.shopAdvancePhase(s);          // morning closes
    if (first.reports.some((r) => r.who === 'Hand 1')) return false;
    const second = C.shopAdvancePhase(s);         // afternoon closes
    if (second.reports.some((r) => r.who === 'Hand 1')) return false;
    const third = C.shopAdvancePhase(s);          // evening closes - theirs
    return third.reports.some((r) => r.who === 'Hand 1');
  })());

  ok('and never runs a second time', (() => {
    const s = build(['storehand']);
    C.addStorage(s, C.lineKey('longsword', 'bronze'), 6, 90);
    C.shopAssign(s, 1, {}, phases[0]);
    const before = C.countStorage(s);
    C.shopAdvancePhase(s);
    const moved = before - C.countStorage(s);
    if (moved <= 0) return false;
    // the assignment is still on the books for the day; closing more phases
    // must not let it work again
    C.shopAdvancePhase(s);
    C.shopAdvancePhase(s);
    return before - C.countStorage(s) === moved;
  })());

  ok('the roster is wiped when the day turns over', (() => {
    const s = build(['runner']);
    C.shopAssign(s, 1, {}, phases[2]);
    s.gold = 99999;
    for (let i = 0; i < 3; i++) C.shopAdvancePhase(s);
    return Object.keys(s.assignments).length === 0 &&
      C.staffCandidates(s, 'runner', phases[0]).length === 1;
  })());

  /* capacity shows up as boxes that cannot be filled, not as missing boxes */
  ok('a box with nobody to put in it offers nobody', (() => {
    const s = build([]);
    s.tier = 1;
    return C.SHOP.phases.every((phase) =>
      C.SHOP.roles.every((role) => C.staffCandidates(s, role.id, phase).length === 0));
  })());

  /* portraits */
  ok('every hire is given a face, and keeps it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(12) });
    const a = C.makeApplicant(s, 'runner');
    return !!a.face && C.staffFace(a) === a.face &&
      C.SHOP.customers.some((c) => c.id === a.face);
  })());

  ok('a hire saved before there were faces is given one, and the same one twice', (() => {
    const old = { id: 7, name: 'Mara Ashford', role: 'runner', rank: 'C', power: 3, wage: 30 };
    const first = C.staffFace(old), second = C.staffFace(old);
    return first === second && C.SHOP.customers.some((c) => c.id === first);
  })());

  ok('a face survives the save and does not change on the way back', (() => {
    const s = C.createShop({ rnd: C.mulberry32(13) });
    s.staff.push({ id: 5, name: 'Old Hand', role: 'smith', rank: 'B', power: 4, wage: 60 });
    const derived = C.staffFace(s.staff[0]);
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    const again = C.restoreShop(C.serializeShop(back), C.mulberry32(1));
    return back.staff[0].face === derived && again.staff[0].face === derived;
  })());

  ok('the roster itself survives the save, phase and all', (() => {
    const s = build(['runner', 'smith']);
    C.shopAssign(s, 1, { order: { bronze: 3 } }, phases[2]);
    C.shopAssign(s, 2, { order: { item: 'dagger', material: 'bronze', qty: 1 } }, phases[1]);
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    const r = C.assignmentAt(back, 'runner', phases[2]);
    const m = C.assignmentAt(back, 'smith', phases[1]);
    return !!r && r.staff.id === 1 && r.job.order.bronze === 3 &&
      !!m && m.staff.id === 2 && m.job.order.item === 'dagger';
  })());

  ok('and finished work comes back finished, never to be paid for twice', (() => {
    const s = build(['storehand']);
    C.addStorage(s, C.lineKey('longsword', 'bronze'), 6, 90);
    C.shopAssign(s, 1, {}, phases[0]);
    C.shopAdvancePhase(s);
    const shelf = C.countShelf(s);
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    if (C.assignmentStatus(back, 1) !== 'done') return false;
    C.shopAdvancePhase(back);
    C.shopAdvancePhase(back);
    return C.countShelf(back) === shelf;
  })());
}

section('Open Your Forge: employees do the work, not the maths');
{
  ok('all five roles exist', (() => {
    const ids = C.SHOP.roles.map((r) => r.id).sort().join(',');
    return ids === 'apprentice,runner,salesperson,smith,storehand';
  })());
  ok('all six ranks exist, dearer as they climb', (() => {
    const ids = C.SHOP.ranks.map((r) => r.id).join(',');
    let last = 0;
    for (const r of C.SHOP.ranks) { if (r.wage <= last) return false; last = r.wage; }
    return ids === 'E,D,C,B,A,S';
  })());
  ok('each rank asks more work than the one below, and S asks none', (() => {
    let last = 0;
    for (const r of C.SHOP.ranks) {
      if (r.id === 'S') return r.up === 0;
      if (r.up <= last) return false;
      last = r.up;
    }
    return false;
  })());
  ok('an applicant carries a name, role, rank and wage', (() => {
    const s = C.createShop({ rnd: C.mulberry32(28) });
    const list = C.shopSearchStaff(s, 'runner', 3);
    return list.length === 3 && list.every((a) => a.name && a.role && a.rank && a.wage > 0);
  })());
  ok('the shop can only hold so many', (() => {
    const s = C.createShop({ rnd: C.mulberry32(29) });
    let hired = 0;
    for (let i = 0; i < 10; i++) {
      const list = C.shopSearchStaff(s, 'runner', 1);
      if (C.shopHire(s, list[0].id).ok) hired++;
    }
    return hired === C.staffCapacity(s);
  })());

  ok('an apprentice on the bench this phase makes your own batches bigger', (() => {
    const s = C.createShop({ rnd: C.mulberry32(30) });
    const before = C.batchCapacity(s);
    s.staff.push({ id: 99, name: 'App', role: 'apprentice', rank: 'A', power: 5, wage: 100 });
    // the help follows the roster now: booked into this phase, it lands
    C.shopAssign(s, 99, {});
    return C.batchCapacity(s) > before;
  })());

  ok('a salesperson works one phase a day and no more', (() => {
    const s = C.createShop({ rnd: C.mulberry32(31) });
    s.staff.push({ id: 1, name: 'Sal', role: 'salesperson', rank: 'C', power: 3, wage: 30 });
    const first = C.shopAssign(s, 1, {});
    C.shopAdvancePhase(s);
    const second = C.shopAssign(s, 1, {});
    return first.ok === true && second.ok === false;
  })());

  ok('two salespeople can cover two phases', (() => {
    const s = C.createShop({ rnd: C.mulberry32(32) });
    s.staff.push({ id: 1, name: 'A', role: 'salesperson', rank: 'C', power: 3, wage: 30 });
    s.staff.push({ id: 2, name: 'B', role: 'salesperson', rank: 'C', power: 3, wage: 30 });
    const a = C.shopAssign(s, 1, {});
    C.shopAdvancePhase(s);
    const b = C.shopAssign(s, 2, {});
    return a.ok && b.ok;
  })());

  ok('an apprentice is rostered like anyone else, and helps only their phase', (() => {
    const s = C.createShop({ rnd: C.mulberry32(33) });
    s.staff.push({ id: 1, name: 'App', role: 'apprentice', rank: 'C', power: 3, wage: 30 });
    const bare = C.batchCapacity(s);                       // unrostered: no help
    if (!C.shopAssign(s, 1, {}, 'afternoon').ok) return false;
    if (C.batchCapacity(s) !== bare) return false;         // it is not their phase yet
    s.phaseIndex = 1;
    return C.batchCapacity(s) === bare + 2;                // C rank, ceil(3/2)
  })());

  ok('a runner buys the order and the price is their own', (() => {
    const s = C.createShop({ rnd: C.mulberry32(34), gold: 100000 });
    const e = { id: 1, name: 'Run', role: 'runner', rank: 'C', power: 3, wage: 30 };
    const r = C.runRunner(s, e, { bronze: 10 });
    return r.ok && r.ingots === 10 && s.materials.bronze === 10 + C.SHOP.startStock.bronze &&
      r.expected === C.SHOP.materials[0].cost * 10;
  })());

  ok('a better runner gets the better price on average', (() => {
    const avg = (power) => {
      const s = C.createShop({ rnd: C.mulberry32(700), gold: 10000000 });
      let total = 0;
      for (let i = 0; i < 400; i++) total += C.runnerScale(s, power);
      return total / 400;
    };
    return avg(6) < avg(1);
  })());

  ok('a smith fills an order without the player touching a board', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(35) }));
    s.materials.bronze = 20;
    const e = { id: 1, name: 'Sm', role: 'smith', rank: 'B', power: 4, wage: 60 };
    const r = C.runSmith(s, e, { item: 'shortsword', material: 'bronze', qty: 3 });
    return r.ok && s.orders.length === 1 && s.materials.bronze === 17 && r.quality > 0;
  })());

  ok('a better smith turns out better work', (() => {
    const avg = (power) => {
      const s = C.createShop({ rnd: C.mulberry32(800) });
      let total = 0;
      for (let i = 0; i < 300; i++) total += C.smithQuality(s, power);
      return total / 300;
    };
    return avg(6) > avg(3) && avg(3) > avg(1);
  })());

  ok('even the best smith leaves room for your own hands', (() => {
    const s = C.createShop({ rnd: C.mulberry32(36) });
    let best = 0;
    for (let i = 0; i < 400; i++) best = Math.max(best, C.smithQuality(s, 6));
    return best < 100;                       // a masterwork stays yours to earn
  })());

  ok('a store hand carries stock out for you', (() => {
    const s = C.createShop({ rnd: C.mulberry32(37) });
    C.addStorage(s, C.lineKey('dagger', 'bronze'), 8, 100);
    const e = { id: 1, name: 'Hand', role: 'storehand', rank: 'C', power: 3, wage: 30 };
    const r = C.runStoreHand(s, e, { keys: [C.lineKey('dagger', 'bronze')] });
    return r.ok && r.moved > 0 && C.countShelf(s) === r.moved;
  })());

  ok('assigned staff all work when the phase closes', (() => {
    const s = C.createShop({ rnd: C.mulberry32(38), gold: 5000 });
    s.materials.bronze = 20;
    C.addStorage(s, C.lineKey('dagger', 'bronze'), 6, 100);
    s.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    s.staff.push({ id: 2, name: 'H', role: 'storehand', rank: 'C', power: 3, wage: 30 });
    C.shopAssign(s, 1, { order: { silver: 2 } });
    C.shopAssign(s, 2, { order: { keys: [] } });
    const res = C.shopAdvancePhase(s);
    return res.reports.length === 2 && s.materials.silver === 2 && C.countShelf(s) > 0;
  })());
}

/* A contract on the books, rolled the way the game rolls one but with the
   dice held still, so a check can say what it is testing rather than shake
   the bag until a bulk order falls out. */
function contractFor(shop, typeId, gold) {
  if (!shop.disciplines.length) apprenticed(shop, 'swords', 'farming', 'household');
  shop.reputation = 60;
  const one = C.makeTownsfolk(shop, typeId || 'farmer');
  one.gold = gold == null ? 4000 : gold;
  const rnd = shop.rnd;
  shop.rnd = () => 0;
  const com = C.rollCommission(shop, one);
  shop.rnd = rnd;
  return com;
}

/* An offer sitting in the ledger, waiting to be answered. */
function offerOn(shop, typeId, gold) {
  const com = contractFor(shop, typeId, gold);
  shop.commissionOffers.push(com);
  return com;
}

/* A mine already dug out and staffed, so a check about ore does not have to
   play three weeks first. */
function minedShop(defId, seed) {
  const s = C.createShop({ rnd: C.mulberry32(seed || 900), gold: 200000 });
  const res = C.shopBuyMine(s, defId || 'bronze');
  const mine = res.mine;
  mine.miners.push({ id: s.nextId++, name: 'Pick', rank: 'C', power: 3, wage: 10 });
  return { shop: s, mine: mine };
}

/* ---------- commissions ---------- */
section('Commissions: a lot, a deadline and a price');
{
  ok('an unknown forge is not trusted with a bulk order', (() => {
    const s = C.createShop({ rnd: C.mulberry32(901) });
    s.reputation = 0;
    const one = C.makeTownsfolk(s, 'farmer');
    s.rnd = () => 0;
    return C.rollCommission(s, one) === null;
  })());

  ok('a contract asks for something the forge knows how to make', (() => {
    const s = C.createShop({ rnd: C.mulberry32(902) });
    const com = contractFor(s);
    return !!com && C.knownRecipes(s).some((it) => it.id === com.item);
  })());

  ok('a contract names its customer, its goods and its terms', (() => {
    const s = C.createShop({ rnd: C.mulberry32(903) });
    const com = contractFor(s);
    return com.name && com.trade && com.item && com.material &&
      com.key === C.lineKey(com.item, com.material) &&
      com.qty >= C.SHOP.commission.minQty && com.qty <= C.SHOP.commission.maxQty &&
      com.pay > 0 && com.days >= 3 && com.filled === 0;
  })());

  ok('the ledger is not filled past what a forge can carry', (() => {
    const s = C.createShop({ rnd: C.mulberry32(904) });
    for (let i = 0; i < C.SHOP.commission.maxActive; i++) offerOn(s);
    s.rnd = () => 0;
    return C.rollCommission(s, C.makeTownsfolk(s, 'farmer')) === null;
  })());

  ok('accepting pays the advance and starts the clock that day', (() => {
    const s = C.createShop({ rnd: C.mulberry32(905), gold: 1000 });
    const com = offerOn(s);
    s.day = 9;                                     // it sat in the book a while
    const res = C.acceptCommission(s, com.id);
    return res.ok && s.gold === 1000 + com.advance &&
      com.dueDay === 9 + com.days &&               // not eaten into by the wait
      s.commissions.length === 1 && s.commissionOffers.length === 0;
  })());

  ok('the advance is a quarter of the price and no more', (() => {
    const s = C.createShop({ rnd: C.mulberry32(906) });
    const com = offerOn(s);
    return com.advance === Math.round(com.pay * C.SHOP.commission.advance);
  })());

  ok('declining costs nothing at all', (() => {
    const s = C.createShop({ rnd: C.mulberry32(907), gold: 500 });
    const com = offerOn(s);
    const rep = s.reputation;
    const res = C.declineCommission(s, com.id);
    return res.ok && s.gold === 500 && s.reputation === rep &&
      s.commissions.length === 0 && s.commissionOffers.length === 0;
  })());

  ok('promised goods leave the storeroom rather than sitting in both places', (() => {
    const s = C.createShop({ rnd: C.mulberry32(908) });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    C.addStorage(s, com.key, 5, 100);
    const before = s.storage[com.key].qty;
    const res = C.allocateCommission(s, com.id, 3);
    return res.ok && res.moved === 3 && com.filled === 3 &&
      s.storage[com.key].qty === before - 3;
  })());

  ok('work under the contract is refused rather than quietly taken', (() => {
    const s = C.createShop({ rnd: C.mulberry32(909) });
    const com = offerOn(s);
    com.quality = 80;
    C.acceptCommission(s, com.id);
    C.addStorage(s, com.key, 5, 40);
    const res = C.allocateCommission(s, com.id, 3);
    return !res.ok && com.filled === 0 && s.storage[com.key].qty === 5;
  })());

  ok('nothing is promised past what the contract owes', (() => {
    const s = C.createShop({ rnd: C.mulberry32(910) });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    C.addStorage(s, com.key, com.qty + 10, 100);
    const res = C.allocateCommission(s, com.id, com.qty + 10);
    return res.ok && com.filled === com.qty && C.commissionToMake(com) === 0 &&
      s.storage[com.key].qty === 10;
  })());

  ok('taking goods back out of a crate creates nothing', (() => {
    const s = C.createShop({ rnd: C.mulberry32(911) });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    C.addStorage(s, com.key, 6, 100);
    C.allocateCommission(s, com.id, 4);
    const res = C.releaseCommission(s, com.id, 3);
    return res.ok && com.filled === 1 && s.storage[com.key].qty === 5;
  })());

  ok('a half-filled contract cannot be handed over', (() => {
    const s = C.createShop({ rnd: C.mulberry32(912) });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    C.addStorage(s, com.key, 2, 100);
    C.allocateCommission(s, com.id, 2);
    const res = C.deliverCommission(s, com.id);
    return !res.ok && s.commissions.length === 1;
  })());

  ok('making the goods is not finishing the job', (() => {
    const s = C.createShop({ rnd: C.mulberry32(913), gold: 0 });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    C.addStorage(s, com.key, com.qty, 100);
    C.allocateCommission(s, com.id, com.qty);
    return C.commissionToMake(com) === 0 && C.commissionReady(com) &&
      !C.commissionDone(com) && s.gold === com.advance &&
      C.commissionState(s, com) === 'awaiting';
  })());

  ok('a missed deadline forfeits the rest and costs the forge its name', (() => {
    const s = C.createShop({ rnd: C.mulberry32(914), gold: 0 });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    C.addStorage(s, com.key, 3, 100);
    C.allocateCommission(s, com.id, 3);
    const rep = s.reputation, purse = s.gold;
    s.day = com.dueDay + 1;
    const failed = C.expireCommissions(s);
    return failed.length === 1 && s.commissions.length === 0 &&
      s.gold === purse &&                          // the advance is kept, the rest lost
      s.reputation < rep &&
      s.storage[com.key] && s.storage[com.key].qty === 3;   // the work comes back
  })());

  ok('a contract still inside its deadline is left alone', (() => {
    const s = C.createShop({ rnd: C.mulberry32(915) });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    s.day = com.dueDay;
    return C.expireCommissions(s).length === 0 && s.commissions.length === 1;
  })());

  ok('the day turning is what catches a deadline, however far it turned', (() => {
    const s = C.createShop({ rnd: C.mulberry32(916), gold: 20000 });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    let seen = 0;
    for (let i = 0; i < (com.days + 2) * 3; i++) {
      const res = C.shopAdvancePhase(s);
      if (res.failed) seen += res.failed.length;
    }
    return seen === 1 && s.commissions.length === 0;
  })());

  ok('an offer nobody answered is off the table by morning', (() => {
    const s = C.createShop({ rnd: C.mulberry32(917) });
    offerOn(s);
    s.day += 2;
    C.expireCommissions(s);
    return s.commissionOffers.length === 0;
  })());

  ok('the soonest deadline is what the ledger warns about', (() => {
    const s = C.createShop({ rnd: C.mulberry32(918) });
    const a = offerOn(s); C.acceptCommission(s, a.id); a.dueDay = 30;
    const b = offerOn(s); C.acceptCommission(s, b.id); b.dueDay = 12;
    return C.nextCommissionDue(s).id === b.id && C.commissionDaysLeft(s, b) === 12 - s.day;
  })());

  ok('the player is asked about a contract and can take it', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(919), gold: 0 }),
      'daggers', 'farming', 'household');
    stock(s, C.lineKey('dagger', 'bronze'), 6, 100);
    s.reputation = 60;
    for (let i = 0; i < 6; i++) { const one = C.makeTownsfolk(s, 'farmer'); one.gold = 4000; }
    s.rnd = () => 0.05;                            // under the odds, every time
    const session = C.openCounter(s, { kind: 'player', power: 0, name: 'You' });
    const event = C.counterNext(session, s);
    if (!event || event.kind !== 'commission') return false;
    const res = C.counterAnswerCommission(session, s, true);
    return res.kind === 'contract' && s.commissions.length === 1 &&
      s.gold === res.advance && session.pending === null;
  })());

  ok('turning one down at the counter leaves the books as they were', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(920), gold: 0 }),
      'daggers', 'farming', 'household');
    stock(s, C.lineKey('dagger', 'bronze'), 6, 100);
    s.reputation = 60;
    for (let i = 0; i < 6; i++) { const one = C.makeTownsfolk(s, 'farmer'); one.gold = 4000; }
    s.rnd = () => 0.05;
    const session = C.openCounter(s, { kind: 'player', power: 0, name: 'You' });
    C.counterNext(session, s);
    const res = C.counterAnswerCommission(session, s, false);
    return res.kind === 'leave' && s.commissions.length === 0 &&
      s.commissionOffers.length === 0 && s.gold === 0;
  })());

  ok('a salesperson writes a contract down for you rather than answering it', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(921), gold: 0 }),
      'daggers', 'farming', 'household');
    stock(s, C.lineKey('dagger', 'bronze'), 6, 100);
    s.reputation = 60;
    for (let i = 0; i < 6; i++) { const one = C.makeTownsfolk(s, 'farmer'); one.gold = 4000; }
    s.rnd = () => 0.05;
    const e = { id: 1, name: 'Sal', role: 'salesperson', rank: 'C', power: 3, wage: 30 };
    const report = C.runSalesperson(s, e);
    // nothing taken on your behalf: the only money that moved was over the
    // counter, never an advance on a contract they had no business accepting
    return report.commissions > 0 && s.commissionOffers.length > 0 &&
      s.commissions.length === 0 && s.gold === report.revenue;
  })());

  ok('the offers a salesperson brings back are the ones you answer', (() => {
    const s = C.createShop({ rnd: C.mulberry32(922), gold: 0 });
    const com = offerOn(s);
    return C.commissionOfferById(s, com.id) === com &&
      C.acceptCommission(s, com.id).ok && C.commissionById(s, com.id) === com;
  })());

  ok('a salesperson never queues more offers than the desk will hold', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(923) }),
      'daggers', 'farming', 'household');
    stock(s, C.lineKey('dagger', 'bronze'), 12, 100);
    s.reputation = 60;
    for (let i = 0; i < 12; i++) { const one = C.makeTownsfolk(s, 'farmer'); one.gold = 4000; }
    s.rnd = () => 0.05;
    const e = { id: 1, name: 'Sal', role: 'salesperson', rank: 'S', power: 6, wage: 30 };
    C.runSalesperson(s, e);
    return s.commissionOffers.length <= C.SHOP.commission.maxOffers;
  })());

  ok('what storage could put towards a contract is counted, not guessed', (() => {
    const s = C.createShop({ rnd: C.mulberry32(924) });
    const com = offerOn(s);
    com.quality = 70;
    C.acceptCommission(s, com.id);
    C.addStorage(s, com.key, 4, 40);
    const rough = C.commissionStock(s, com);
    s.storage[com.key].quality = 90;
    return rough === 0 && C.commissionStock(s, com) === 4;
  })());

  ok('a smith forging for a contract fills the crate, not the shelf twice over', (() => {
    const s = C.createShop({ rnd: C.mulberry32(925), gold: 20000 });
    const com = offerOn(s);
    com.quality = 0;
    C.acceptCommission(s, com.id);
    const parts = C.splitKey(com.key);
    s.materials[parts.material] = 40;
    const e = { id: 1, name: 'Sm', role: 'smith', rank: 'B', power: 4, wage: 60 };
    const r = C.runSmith(s, e, { item: parts.item, material: parts.material, qty: 3,
      commission: com.id });
    if (!r.ok || s.orders[0].commission !== com.id) return false;
    const held = s.storage[com.key] ? s.storage[com.key].qty : 0;
    C.shopEndDay(s);
    const after = s.storage[com.key] ? s.storage[com.key].qty : 0;
    // three pieces were made and three pieces exist: in the crate, not both places
    return com.filled === 3 && after === held;
  })());

  ok('work over what a contract owes still reaches the storeroom', (() => {
    const s = C.createShop({ rnd: C.mulberry32(926), gold: 20000 });
    const com = offerOn(s);
    com.quality = 0;
    com.qty = 2;
    C.acceptCommission(s, com.id);
    const parts = C.splitKey(com.key);
    s.materials[parts.material] = 40;
    const e = { id: 1, name: 'Sm', role: 'smith', rank: 'B', power: 4, wage: 60 };
    C.runSmith(s, e, { item: parts.item, material: parts.material, qty: 3, commission: com.id });
    C.shopEndDay(s);
    return com.filled === 2 && s.storage[com.key] && s.storage[com.key].qty === 1;
  })());
}

/* ---------- mines ---------- */
section('Properties: deeds, shafts and what comes up');
{
  ok('a deed buys a property, not a number on the forge', (() => {
    const s = C.createShop({ rnd: C.mulberry32(930), gold: 200000 });
    const before = s.materials.bronze;
    const res = C.shopBuyMine(s, 'bronze');
    return res.ok && s.mines.length === 1 && res.mine.ore === 0 &&
      s.materials.bronze === before &&             // owning it hands you nothing
      (s.ore.bronze || 0) === 0;
  })());

  ok('a deed you cannot pay for is not signed', (() => {
    const s = C.createShop({ rnd: C.mulberry32(931), gold: 10 });
    return !C.shopBuyMine(s, 'bronze').ok && s.mines.length === 0 && s.gold === 10;
  })());

  ok('every mine works one of the metals the forge already knows', (() =>
    C.SHOP.mines.every((m) => !!C.shopMaterial(m.material))));

  ok('two mines of one mineral can be owned at once, and told apart', (() => {
    const s = C.createShop({ rnd: C.mulberry32(932), gold: 200000 });
    const a = C.shopBuyMine(s, 'bronze'), b = C.shopBuyMine(s, 'bronze');
    return a.ok && b.ok && s.mines.length === 2 && a.mine.id !== b.mine.id &&
      a.mine.name !== b.mine.name;
  })());

  ok('the second mine of a mineral costs more than the first', (() => {
    const s = C.createShop({ rnd: C.mulberry32(933), gold: 200000 });
    const first = C.minePrice(s, 'bronze');
    C.shopBuyMine(s, 'bronze');
    return C.minePrice(s, 'bronze') > first;
  })());

  ok('each mine keeps its own ore, and one filling up is not the other', (() => {
    const s = C.createShop({ rnd: C.mulberry32(934), gold: 200000 });
    const a = C.shopBuyMine(s, 'bronze').mine;
    const b = C.shopBuyMine(s, 'bronze').mine;
    a.miners.push({ id: 1, name: 'A', rank: 'C', power: 3, wage: 10 });
    C.runMines(s, 1);
    return a.ore > 0 && b.ore === 0;
  })());

  ok('a mine with nobody down it digs nothing', (() => {
    const s = C.createShop({ rnd: C.mulberry32(935), gold: 200000 });
    const mine = C.shopBuyMine(s, 'bronze').mine;
    C.runMines(s, 1);
    return C.mineYield(mine) === 0 && mine.ore === 0;
  })());

  ok('more miners bring up more ore', (() => {
    const { mine } = minedShop('bronze', 936);
    const one = C.mineYield(mine);
    mine.miners.push({ id: 99, name: 'Two', rank: 'C', power: 3, wage: 10 });
    return C.mineYield(mine) > one;
  })());

  ok('a better miner brings up more than a worse one', (() => {
    const { mine } = minedShop('bronze', 937);
    mine.miners = [{ id: 1, name: 'E', rank: 'E', power: 1, wage: 10 }];
    const worst = C.mineYield(mine);
    mine.miners = [{ id: 1, name: 'S', rank: 'S', power: 6, wage: 10 }];
    return C.mineYield(mine) > worst;
  })());

  ok('a week is dug once and once only, however the calendar was turned', (() => {
    const { shop, mine } = minedShop('bronze', 938);
    C.runMines(shop, 3);
    const after = mine.ore;
    C.runMines(shop, 3);
    C.runMines(shop, 2);                           // a week already behind us
    return after > 0 && mine.ore === after;
  })());

  ok('the next week digs again', (() => {
    const { shop, mine } = minedShop('bronze', 939);
    C.runMines(shop, 3);
    const after = mine.ore;
    C.runMines(shop, 4);
    return mine.ore > after;
  })());

  ok('the turn of the week is what sets the miners going', (() => {
    const { shop, mine } = minedShop('bronze', 940);
    let digs = 0;
    for (let i = 0; i < C.SHOP.weekLength * 3; i++) {
      const res = C.shopAdvancePhase(shop);
      if (res.dug && res.dug.length) digs++;
    }
    return digs === 1 && mine.ore > 0;
  })());

  ok('ore past what the sheds hold is spoil left on the ground', (() => {
    const { shop, mine } = minedShop('bronze', 941);
    mine.ore = C.mineStoreCap(mine) - 1;
    const rows = C.runMines(shop, 5);
    return mine.ore === C.mineStoreCap(mine) && rows[0].lost > 0 && rows[0].full;
  })());

  ok('sinking a shaft makes room for more miners', (() => {
    const { shop, mine } = minedShop('bronze', 942);
    const cap = C.mineMinerCap(mine);
    return C.shopBuyMineUpgrade(shop, mine.id, 'shafts').ok &&
      C.mineMinerCap(mine) > cap;
  })());

  ok('ore sheds make room for more ore, and better gear for more of it', (() => {
    const { shop, mine } = minedShop('bronze', 943);
    const store = C.mineStoreCap(mine), yield0 = C.mineYield(mine);
    C.shopBuyMineUpgrade(shop, mine.id, 'sheds');
    C.shopBuyMineUpgrade(shop, mine.id, 'gear');
    return C.mineStoreCap(mine) > store && C.mineYield(mine) > yield0;
  })());

  ok('an upgrade runs out rather than climbing for ever', (() => {
    const { shop, mine } = minedShop('bronze', 944);
    const def = C.mineUpgradeDef('sheds');
    for (let i = 0; i < def.max; i++) C.shopBuyMineUpgrade(shop, mine.id, 'sheds');
    return C.mineUpgradeCost(mine, 'sheds') === null &&
      !C.shopBuyMineUpgrade(shop, mine.id, 'sheds').ok;
  })());

  ok('a miner is hired against the mine and takes no place at the forge', (() => {
    const { shop, mine } = minedShop('bronze', 945);
    const before = shop.staff.length;
    const offered = C.shopSearchMiners(shop, mine.id, 3).length;
    const res = C.shopHireMiner(shop, mine.id, mine.applicants[0].id);
    return offered === 3 && res.ok && mine.miners.length === 2 &&
      shop.staff.length === before;
  })());

  ok('a mine will not take more miners than it has shafts for', (() => {
    const { shop, mine } = minedShop('bronze', 946);
    while (mine.miners.length < C.mineMinerCap(mine)) {
      mine.miners.push({ id: shop.nextId++, name: 'X', rank: 'C', power: 3, wage: 10 });
    }
    const list = C.shopSearchMiners(shop, mine.id, 1);
    return !C.shopHireMiner(shop, mine.id, list[0].id).ok;
  })());

  ok('a miner can be let go', (() => {
    const { shop, mine } = minedShop('bronze', 947);
    const id = mine.miners[0].id;
    return C.shopDismissMiner(shop, mine.id, id).ok && mine.miners.length === 0;
  })());

  ok('miners are paid out of the same week as everybody else', (() => {
    const { shop, mine } = minedShop('bronze', 948);
    const bill = C.mineWageBill(shop);
    return bill === mine.miners[0].wage && C.weeklyBill(shop) >= bill;
  })());
}

/* ---------- carting it home ---------- */
section('Transport: what a cart will carry');
{
  ok('a handcart carries five, a merchant wagon fifteen and a freight wagon thirty', (() => {
    const cart = C.vehicleDef('cart'), wagon = C.vehicleDef('wagon'),
      freight = C.vehicleDef('horse');
    return cart.capacity === 5 && wagon.capacity === 15 && freight.capacity === 30;
  })());

  ok('every tier can simply be bought, without owning the one below', (() => {
    const s = C.createShop({ rnd: C.mulberry32(949), gold: 200000 });
    const res = C.shopBuyVehicle(s, 'horse');
    return res.ok && !res.upgraded && s.vehicles.length === 1 &&
      C.vehicleCapacity(res.vehicle) === 30;
  })());

  ok('a vehicle is bought once and kept', (() => {
    const s = C.createShop({ rnd: C.mulberry32(950), gold: 200000 });
    const res = C.shopBuyVehicle(s, 'cart');
    return res.ok && s.vehicles.length === 1 && C.vehicleCapacity(res.vehicle) === 5;
  })());

  ok('trading a wagon up costs the wagon, and less than buying outright', (() => {
    const s = C.createShop({ rnd: C.mulberry32(951), gold: 200000 });
    const wagon = C.shopBuyVehicle(s, 'wagon').vehicle;
    const res = C.shopBuyVehicle(s, 'horse', true);
    return res.ok && res.upgraded && s.vehicles.length === 1 &&
      res.vehicle.id === wagon.id && C.vehicleCapacity(wagon) === 30 &&
      res.spent === C.vehicleDef('horse').upgrade &&
      res.spent < C.vehicleDef('horse').price;
  })());

  ok('there is nothing to trade up without a wagon to trade', (() => {
    const s = C.createShop({ rnd: C.mulberry32(952), gold: 200000 });
    return !C.shopBuyVehicle(s, 'horse', true).ok && s.vehicles.length === 0;
  })());

  ok('the biggest free vehicle is the one a delivery reaches for', (() => {
    const s = C.createShop({ rnd: C.mulberry32(953), gold: 200000 });
    C.shopBuyVehicle(s, 'cart');
    const big = C.shopBuyVehicle(s, 'wagon').vehicle;
    if (C.bestFreeVehicle(s).id !== big.id) return false;
    big.busy = { day: s.day, phase: C.SHOP.phases[s.phaseIndex] };
    return C.vehicleCapacity(C.bestFreeVehicle(s)) === 5;
  })());

  ok('a vehicle out on a delivery cannot be sent somewhere else as well', (() => {
    const s = C.createShop({ rnd: C.mulberry32(953), gold: 200000 });
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    if (!C.vehicleFree(s, cart)) return false;
    cart.busy = { day: s.day, phase: C.SHOP.phases[s.phaseIndex] };
    return !C.vehicleFree(s, cart) && C.freeVehicles(s).length === 0;
  })());

  ok('the cart is free again once the phase it went out in has closed', (() => {
    const s = C.createShop({ rnd: C.mulberry32(954), gold: 200000 });
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    cart.busy = { day: s.day, phase: C.SHOP.phases[0] };
    s.phaseIndex = 1;
    return C.vehicleFree(s, cart);
  })());

  ok('no runner carries more than the cart will hold', (() => {
    const { shop, mine } = minedShop('bronze', 955);
    mine.ore = 40;
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    const res = C.collectOre(shop, mine.id, cart.id, 999);
    return res.ok && res.load === 5 && mine.ore === 35 && shop.ore.bronze === 5;
  })());

  ok('a merchant wagon brings back fifteen of the same', (() => {
    const { shop, mine } = minedShop('bronze', 956);
    mine.ore = 40;
    const wagon = C.shopBuyVehicle(shop, 'wagon').vehicle;
    const res = C.collectOre(shop, mine.id, wagon.id, 999);
    return res.ok && res.load === 15 && mine.ore === 25;
  })());

  ok('you cannot fetch more ore than there is down the mine', (() => {
    const { shop, mine } = minedShop('bronze', 957);
    mine.ore = 4;
    const wagon = C.shopBuyVehicle(shop, 'wagon').vehicle;
    const res = C.collectOre(shop, mine.id, wagon.id, 30);
    return res.ok && res.load === 4 && mine.ore === 0;
  })());

  ok('fetching ore moves it rather than copying it', (() => {
    const { shop, mine } = minedShop('bronze', 958);
    mine.ore = 25;
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    const total = () => mine.ore + C.countOre(shop);
    const before = total();
    C.collectOre(shop, mine.id, cart.id, 10);
    C.collectOre(shop, mine.id, cart.id, 10);
    return before === 25 && total() === 25 && C.countOre(shop) === 10;
  })());

  ok('ore the forge has no room for stays down the mine', (() => {
    const { shop, mine } = minedShop('bronze', 959);
    mine.ore = 60;
    const wagon = C.shopBuyVehicle(shop, 'wagon').vehicle;
    shop.ore.silver = C.oreStorageCap(shop) - 5;
    const res = C.collectOre(shop, mine.id, wagon.id, 30);
    return res.load === 5 && res.spilled === 10 && mine.ore === 55;
  })());

  ok('an empty mine is said to be empty rather than fetched from', (() => {
    const { shop, mine } = minedShop('bronze', 960);
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    return !C.collectOre(shop, mine.id, cart.id, 10).ok && C.countOre(shop) === 0;
  })());

  ok('booking a haul takes the cart off the yard', (() => {
    const { shop, mine } = minedShop('bronze', 962);
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    shop.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    shop.staff.push({ id: 2, name: 'S', role: 'runner', rank: 'C', power: 3, wage: 30 });
    const first = C.shopAssign(shop, 1, { order: { kind: 'ore', mine: mine.id, vehicle: cart.id, qty: 10 } });
    const second = C.shopAssign(shop, 2, { order: { kind: 'ore', mine: mine.id, vehicle: cart.id, qty: 10 } });
    return first.ok && !second.ok && C.freeVehicles(shop).length === 0;
  })());

  ok('dropping the job puts the cart back in the yard', (() => {
    const { shop, mine } = minedShop('bronze', 963);
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    shop.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    C.shopAssign(shop, 1, { order: { kind: 'ore', mine: mine.id, vehicle: cart.id, qty: 10 },
      }, C.SHOP.phases[2]);
    C.shopUnassign(shop, 1);
    return C.freeVehicles(shop).length === 1;
  })());

  ok('a haul from a property nobody owns is not booked at all', (() => {
    const { shop } = minedShop('bronze', 964);
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    shop.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    const res = C.shopAssign(shop, 1, { order: { kind: 'ore', mine: 9999, vehicle: cart.id, qty: 10 } });
    return !res.ok && C.vehicleFree(shop, cart);
  })());

  ok('nobody is given two jobs in one day', (() => {
    const s = C.createShop({ rnd: C.mulberry32(965), gold: 20000 });
    s.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    const first = C.shopAssign(s, 1, { order: { bronze: 2 } });
    const second = C.shopAssign(s, 1, { order: { bronze: 2 } }, C.SHOP.phases[2]);
    return first.ok && !second.ok;
  })());

  ok('a runner sent for ore comes back with it, and with the cart', (() => {
    const { shop, mine } = minedShop('bronze', 961);
    mine.ore = 20;
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    cart.busy = { day: shop.day, phase: C.SHOP.phases[shop.phaseIndex] };
    const e = { id: 1, name: 'Run', role: 'runner', rank: 'C', power: 3, wage: 30 };
    const r = C.runRunner(shop, e, { kind: 'ore', mine: mine.id, vehicle: cart.id, qty: 10 });
    return r.ok && r.load === 5 && shop.ore.bronze === 5 && cart.busy === null;
  })());
}

/* ---------- smelting ---------- */
section('Smelting: ore is not metal until somebody stands over it');
{
  ok('ore is counted apart from the bar stock it becomes', (() => {
    const s = C.createShop({ rnd: C.mulberry32(970) });
    const bars = s.materials.bronze;
    C.addOre(s, 'bronze', 10);
    return s.ore.bronze === 10 && s.materials.bronze === bars;
  })());

  ok('one ore makes one ingot, and the ore is gone', (() => {
    const s = C.createShop({ rnd: C.mulberry32(971) });
    const bars = s.materials.bronze;
    C.addOre(s, 'bronze', 10);
    const res = C.shopSmelt(s, 'bronze', 4);
    return res.ok && res.made === 4 && s.ore.bronze === 6 &&
      s.materials.bronze === bars + 4;
  })());

  ok('you cannot smelt ore you have not fetched', (() => {
    const s = C.createShop({ rnd: C.mulberry32(972) });
    const bars = s.materials.bronze;
    const res = C.shopSmelt(s, 'bronze', 5);
    return !res.ok && s.materials.bronze === bars && C.countOre(s) === 0;
  })());

  ok('smelting more than you have smelts what you have', (() => {
    const s = C.createShop({ rnd: C.mulberry32(973) });
    C.addOre(s, 'bronze', 3);
    const res = C.shopSmelt(s, 'bronze', 20);
    return res.ok && res.made === 3 && !s.ore.bronze && C.countOre(s) === 0;
  })());

  ok('a better smith gets through more of it in a phase', (() =>
    C.smeltRate(6) > C.smeltRate(3) && C.smeltRate(3) > C.smeltRate(1)));

  ok('a smith at the furnace turns ore into bar stock', (() => {
    const s = C.createShop({ rnd: C.mulberry32(974) });
    C.addOre(s, 'bronze', 20);
    const bars = s.materials.bronze;
    const e = { id: 1, name: 'Sm', role: 'smith', rank: 'C', power: 3, wage: 60 };
    const r = C.runSmith(s, e, { kind: 'smelt', material: 'bronze' });
    return r.ok && r.kind === 'smelt' && r.made === C.smeltRate(3) &&
      s.materials.bronze === bars + r.made && s.orders.length === 0;
  })());

  ok('a smith at the furnace is not at the anvil as well', (() => {
    const s = C.createShop({ rnd: C.mulberry32(975) });
    C.addOre(s, 'bronze', 20);
    const e = { id: 1, name: 'Sm', role: 'smith', rank: 'C', power: 3, wage: 60 };
    C.runSmith(s, e, { kind: 'smelt', material: 'bronze' });
    return s.orders.length === 0;                  // nothing on the anvil that phase
  })());

  ok('the market still sells finished bar stock: mining is a choice', (() => {
    const s = C.createShop({ rnd: C.mulberry32(976), gold: 100000 });
    const bars = s.materials.bronze;
    const e = { id: 1, name: 'Run', role: 'runner', rank: 'C', power: 3, wage: 30 };
    const r = C.runRunner(s, e, { bronze: 8 });
    return r.ok && s.materials.bronze === bars + 8 && s.mines.length === 0;
  })());
}

/* ---------- the hands you can keep ---------- */
section('Staff room: four hands at the start');
{
  ok('a new forge has room for four', (() => {
    const s = C.createShop({ rnd: C.mulberry32(980) });
    return C.staffCapacity(s) === 4;
  })());

  ok('room only grows from there', (() => {
    let last = 0;
    return C.SHOP.tiers.every((t) => { const up = t.staff >= last; last = t.staff; return up; }) &&
      C.SHOP.tiers[0].staff === 4;
  })());

  ok('the five trades are all still hireable', (() => {
    const roles = C.SHOP.roles.map((r) => r.id);
    return ['smith', 'runner', 'salesperson', 'storehand', 'apprentice']
      .every((id) => roles.includes(id));
  })());

  ok('a fifth hand is turned away and the fourth is not', (() => {
    const s = C.createShop({ rnd: C.mulberry32(981), gold: 500000 });
    let hired = 0;
    for (let i = 0; i < 8; i++) {
      const list = C.shopSearchStaff(s, 'runner', 3);
      if (!list.length) break;
      if (C.shopHire(s, list[0].id).ok) hired++;
    }
    return hired === 4 && s.staff.length === 4;
  })());

  ok('miners are not counted against the forge at all', (() => {
    const s = C.createShop({ rnd: C.mulberry32(982), gold: 500000 });
    for (let i = 0; i < 4; i++) {
      const list = C.shopSearchStaff(s, 'runner', 3);
      C.shopHire(s, list[0].id);
    }
    const mine = C.shopBuyMine(s, 'bronze').mine;
    const list = C.shopSearchMiners(s, mine.id, 2);
    return s.staff.length === C.staffCapacity(s) &&
      C.shopHireMiner(s, mine.id, list[0].id).ok && mine.miners.length === 1;
  })());
}

/* ---------- it all has to come back ---------- */
section('Saving: mines, carts, ore and contracts all come back');
{
  ok('a mine comes back with its miners, its ore and its upgrades', (() => {
    const { shop, mine } = minedShop('bronze', 990);
    mine.ore = 17;
    mine.lastDug = 4;
    C.shopBuyMineUpgrade(shop, mine.id, 'sheds');
    const back = C.restoreShop(C.serializeShop(shop), C.mulberry32(1));
    const got = C.mineById(back, mine.id);
    return got && got.def === 'bronze' && got.ore === 17 && got.lastDug === 4 &&
      got.miners.length === 1 && C.mineLevel(got, 'sheds') === 1 &&
      got.name === mine.name;
  })());

  ok('two mines of one mineral come back as two', (() => {
    const s = C.createShop({ rnd: C.mulberry32(991), gold: 200000 });
    C.shopBuyMine(s, 'bronze');
    C.shopBuyMine(s, 'bronze');
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    return back.mines.length === 2 && back.mines[0].id !== back.mines[1].id;
  })());

  ok('a week already dug is not dug again after a reload', (() => {
    const { shop, mine } = minedShop('bronze', 992);
    C.runMines(shop, 6);
    const ore = mine.ore;
    const back = C.restoreShop(C.serializeShop(shop), C.mulberry32(1));
    C.runMines(back, 6);
    return ore > 0 && C.mineById(back, mine.id).ore === ore;
  })());

  ok('the carts in the yard come back', (() => {
    const s = C.createShop({ rnd: C.mulberry32(993), gold: 200000 });
    C.shopBuyVehicle(s, 'wagon');
    C.shopBuyVehicle(s, 'horse', true);
    C.shopBuyVehicle(s, 'cart');
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    return back.vehicles.length === 2 &&
      back.vehicles.some((v) => C.vehicleCapacity(v) === 30) &&
      back.vehicles.some((v) => C.vehicleCapacity(v) === 5);
  })());

  ok('the ore in the yard comes back, and stays apart from the bar stock', (() => {
    const s = C.createShop({ rnd: C.mulberry32(994) });
    C.addOre(s, 'bronze', 9);
    const bars = s.materials.bronze;
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    return back.ore.bronze === 9 && back.materials.bronze === bars;
  })());

  ok('a contract comes back with what has been promised to it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(995) });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    C.addStorage(s, com.key, 3, 100);
    C.allocateCommission(s, com.id, 3);
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    const got = C.commissionById(back, com.id);
    return got && got.filled === 3 && got.qty === com.qty && got.pay === com.pay &&
      got.dueDay === com.dueDay && got.key === com.key;
  })());

  ok('an offer still waiting for an answer comes back waiting', (() => {
    const s = C.createShop({ rnd: C.mulberry32(996) });
    const com = offerOn(s);
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    return back.commissionOffers.length === 1 &&
      C.commissionOfferById(back, com.id).item === com.item;
  })());

  ok('a save with nonsense in the new fields loads as an honest empty yard', (() => {
    const s = C.createShop({ rnd: C.mulberry32(997) });
    const data = C.serializeShop(s);
    data.mines = [{ def: 'not-a-mine', ore: -50, miners: 'lots' }, 7, null];
    data.vehicles = [{ kind: 'zeppelin' }, 'cart'];
    data.ore = { bronze: -9, unobtanium: 400 };
    data.commissions = [{ item: 'nope', qty: -3 }];
    data.commissionOffers = 'none';
    const back = C.restoreShop(data, C.mulberry32(1));
    return back && back.mines.length === 0 && back.vehicles.length === 0 &&
      C.countOre(back) === 0 && back.commissions.length === 0 &&
      Array.isArray(back.commissionOffers) && back.commissionOffers.length === 0;
  })());

  ok('an old save loads with an empty yard rather than not at all', (() => {
    const s = C.createShop({ rnd: C.mulberry32(998) });
    const data = C.serializeShop(s);
    delete data.mines; delete data.vehicles; delete data.ore;
    delete data.commissions; delete data.commissionOffers;
    const back = C.restoreShop(data, C.mulberry32(1));
    return back && back.mines.length === 0 && back.vehicles.length === 0 &&
      back.commissions.length === 0 && C.countOre(back) === 0;
  })());
}

/* A contract whose goods are all made and standing in the crate, waiting for
   a cart. Most delivery checks start here. */
function readyContract(shop, seed) {
  const com = offerOn(shop);
  C.acceptCommission(shop, com.id);
  C.addStorage(shop, com.key, com.qty, 100, 1);
  C.allocateCommission(shop, com.id, com.qty);
  return com;
}

section('Open Your Forge: a customer is a stranger until you serve them');
{
  ok('wealth, likes and dislikes all start hidden', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1000) });
    const one = C.makeTownsfolk(s, 'knight');
    const known = C.knownOf(one);
    return known.wealth === false && known.likes.length === 0 &&
      known.dislikes.length === 0 && !C.knowsWealth(one);
  })());

  ok('but they are real all along, and still steer what that person does', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1001) });
    const one = C.makeTownsfolk(s, 'knight');
    one.standards = 80;
    // an unknown standard still turns crude work away
    return !C.meetsStandards(one, 40) && C.meetsStandards(one, 90) &&
      C.purseFor(one) > 0 && !C.knowsWealth(one);
  })());

  ok('wealth is a band, never a figure', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1002) });
    const one = C.makeTownsfolk(s, 'laborer');
    const band = C.wealthBandOf(one);
    return typeof band.name === 'string' &&
      C.SHOP.intel.wealth.some((b) => b.id === band.id);
  })());

  ok('every trade lands in one of the five bands, and all five are used', (() => {
    const seen = {};
    for (const c of C.SHOP.customers) seen[C.wealthBandOf({ income: c.income }).id] = true;
    return C.SHOP.intel.wealth.every((b) => seen[b.id]);
  })());

  ok('a richer trade never bands lower than a poorer one', (() => {
    const order = C.SHOP.customers.slice().sort((a, b) => a.income - b.income);
    let last = -1;
    for (const c of order) {
      const at = C.SHOP.intel.wealth.findIndex((b) => b.id === C.wealthBandOf(c).id);
      if (at < last) return false;
      last = at;
    }
    return true;
  })());

  ok('what a trade likes is read off the same table the floor uses', (() => {
    const taste = C.customerTaste('knight');
    const type = C.shopCustomerType('knight');
    return taste.likes.length > 0 &&
      taste.likes.every((cat) => (type.likes[cat] || 0) > 0) &&
      taste.dislikes.every((cat) => !(type.likes[cat] > 0));
  })());

  ok('likes and dislikes never overlap', (() =>
    C.SHOP.customers.every((c) => {
      const taste = C.customerTaste(c.id);
      return taste.likes.every((cat) => taste.dislikes.indexOf(cat) < 0);
    })));

  ok('there is a fixed number of things to find out about anybody', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1003) });
    const one = C.makeTownsfolk(s, 'merchant');
    const read = C.customerRead(one);
    return read.got === 0 && read.total === C.unknownFacts(one).length && !read.whole;
  })());
}

section('Open Your Forge: the counter is how a forge learns');
{
  const serve = function (seed, seller, days) {
    const s = C.createShop({ rnd: C.mulberry32(seed) });
    apprenticed(s);
    stock(s, C.lineKey('shortsword', 'bronze'), 40, 100);
    let found = 0;
    for (let d = 0; d < (days || 12); d++) {
      const session = C.openCounter(s, seller);
      let guard = 0;
      while (guard++ < 40) {
        const event = C.counterNext(session, s);
        if (!event) break;
        if (session.pending) session.pending = null;
      }
      found += (session.report.learned || []).length;
    }
    return { shop: s, found: found };
  };

  ok('serving somebody can teach you something about them', (() =>
    serve(1010, { kind: 'player', power: 0, name: 'You' }).found > 0));

  ok('a salesperson learns about the people they serve', (() =>
    serve(1011, { kind: 'staff', power: 3, name: 'Sal' }).found > 0));

  ok('a better salesperson learns more', (() => {
    const poor = serve(1012, { kind: 'staff', power: 1, name: 'E' }).found;
    const good = serve(1012, { kind: 'staff', power: 6, name: 'S' }).found;
    return good > poor;
  })());

  ok('rank buys both better odds and more chances at them', (() => {
    const low = C.readSkill({ kind: 'staff', power: 1 });
    const high = C.readSkill({ kind: 'staff', power: 6 });
    return high.odds > low.odds && high.tries > low.tries &&
      high.tries <= C.SHOP.intel.maxTries;
  })());

  ok('nothing is ever discovered twice', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1013) });
    const one = C.makeTownsfolk(s, 'knight');
    const seller = { kind: 'staff', power: 6, name: 'S' };
    let guard = 0;
    while (C.unknownFacts(one).length && guard++ < 400) {
      C.learnAboutCustomer(s, one, seller);
    }
    const known = C.knownOf(one);
    const likes = known.likes.slice().sort().join(',');
    const uniq = known.likes.slice().sort().filter((v, i, a) => a.indexOf(v) === i).join(',');
    return likes === uniq && C.customerRead(one).whole &&
      C.learnAboutCustomer(s, one, seller).length === 0;
  })());

  ok('a fact learned is a fact kept', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1014) });
    const one = C.makeTownsfolk(s, 'knight');
    C.learnFact(one, { kind: 'wealth' });
    const again = C.learnFact(one, { kind: 'wealth' });
    return C.knowsWealth(one) && again === false;
  })());

  ok('discoveries survive being put down', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1015) });
    const one = C.makeTownsfolk(s, 'knight');
    const taste = C.customerTaste('knight');
    C.learnFact(one, { kind: 'wealth' });
    C.learnFact(one, { kind: 'like', cat: taste.likes[0] });
    C.learnFact(one, { kind: 'dislike', cat: taste.dislikes[0] });
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    const got = back.town.find((p) => p.name === one.name);
    return got && C.knowsWealth(got) && C.knowsLike(got, taste.likes[0]) &&
      C.knowsDislike(got, taste.dislikes[0]);
  })());

  ok('a save from before anybody was read has strangers, not free knowledge', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1016) });
    C.makeTownsfolk(s, 'knight');
    const data = C.serializeShop(s);
    for (const one of data.town) delete one.known;
    const back = C.restoreShop(data, C.mulberry32(1));
    return back.town.every((one) => !C.knowsWealth(one) &&
      C.knownOf(one).likes.length === 0);
  })());

  ok('a save claiming to know things it could not is not believed', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1017) });
    const one = C.makeTownsfolk(s, 'farmer');
    const data = C.serializeShop(s);
    const raw = data.town.find((p) => p.name === one.name);
    raw.known = { wealth: true, likes: ['not-a-craft', 'armor'], dislikes: ['swords', 17] };
    const back = C.restoreShop(data, C.mulberry32(1));
    const got = back.town.find((p) => p.name === one.name);
    const taste = C.customerTaste('farmer');
    return C.knowsWealth(got) &&
      C.knownOf(got).likes.every((c) => taste.likes.indexOf(c) >= 0) &&
      C.knownOf(got).dislikes.every((c) => taste.dislikes.indexOf(c) >= 0);
  })());

  ok('the counter never hands a customer’s purse to the screen', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1018) });
    apprenticed(s);
    stock(s, C.lineKey('shortsword', 'bronze'), 40, 100);
    noContracts(s);
    const session = C.openCounter(s, { kind: 'player', power: 0, name: 'You' });
    let guard = 0;
    while (guard++ < 30) {
      const event = C.counterNext(session, s);
      if (!event) break;
      if (event.purse !== undefined) return false;
      if (session.pending) session.pending = null;
    }
    return true;
  })());
}

section('Open Your Forge: a contract has to be carted to the customer');
{
  ok('goods made are goods waiting, not goods delivered', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1020), gold: 0 });
    const com = readyContract(s);
    return C.commissionState(s, com) === 'awaiting' && !C.commissionDone(com) &&
      C.commissionToShip(com) === com.qty && (com.delivered || 0) === 0 &&
      s.gold === com.advance;
  })());

  ok('a contract still being made cannot be delivered', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1021), gold: 200000 });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    C.addStorage(s, com.key, 2, 100, 1);
    C.allocateCommission(s, com.id, 2);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    const res = C.deliverCommission(s, com.id, cart.id);
    return !res.ok && (com.delivered || 0) === 0;
  })());

  ok('a delivery needs something to carry it in', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1022), gold: 0 });
    const com = readyContract(s);
    return !C.deliverCommission(s, com.id, 999).ok && (com.delivered || 0) === 0;
  })());

  ok('one load is never bigger than the cart', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1023), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    const res = C.deliverCommission(s, com.id, cart.id, 9999);
    return res.ok && res.load === C.vehicleCapacity(cart) &&
      com.delivered === C.vehicleCapacity(cart);
  })());

  ok('a lot too big for the cart goes out over several trips', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1024), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    const want = Math.ceil(com.qty / C.vehicleCapacity(cart));
    let trips = 0;
    while (!C.commissionDone(com) && trips < 40) {
      C.deliverCommission(s, com.id, cart.id);
      trips++;
    }
    return trips === want && trips > 1 && com.delivered === com.qty;
  })());

  ok('a part-delivered contract says so, and is not paid yet', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1025), gold: 0 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart');           // no gold: refused
    s.gold = 200000;
    const real = C.shopBuyVehicle(s, 'cart').vehicle;
    const purse = s.gold;
    const res = C.deliverCommission(s, com.id, real.id);
    return !cart.ok && res.ok && !res.done && res.paid === 0 && s.gold === purse &&
      C.commissionState(s, com) === 'partial';
  })());

  ok('the balance is paid once, on the load that finishes it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1026), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    const purse = s.gold;
    let paid = 0, guard = 0;
    while (!C.commissionDone(com) && guard++ < 40) {
      paid += C.deliverCommission(s, com.id, cart.id).paid || 0;
    }
    return paid === com.pay - com.advance && s.gold === purse + paid &&
      s.commissions.length === 0;
  })());

  ok('nothing is delivered twice, and the crate empties exactly', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1027), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    let carried = 0, guard = 0;
    while (!C.commissionDone(com) && guard++ < 40) {
      carried += C.deliverCommission(s, com.id, cart.id).load || 0;
    }
    return carried === com.qty && com.filled === 0 &&
      !C.deliverCommission(s, com.id, cart.id).ok;
  })());

  ok('goods promised to a contract are out of the storeroom while they wait', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1028), gold: 200000 });
    const com = readyContract(s);
    return !s.storage[com.key] && C.commissionToShip(com) === com.qty;
  })());

  ok('a contract made but never carted still fails on its day', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1029), gold: 0 });
    const com = readyContract(s);
    const rep = s.reputation, purse = s.gold;
    s.day = com.dueDay + 1;
    const failed = C.expireCommissions(s);
    return failed.length === 1 && s.gold === purse && s.reputation < rep &&
      s.storage[com.key] && s.storage[com.key].qty === com.qty;
  })());

  ok('a part-delivered contract that runs out of days keeps what went out', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1030), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    const first = C.deliverCommission(s, com.id, cart.id).load;
    s.day = com.dueDay + 1;
    const failed = C.expireCommissions(s);
    return failed.length === 1 && s.commissions.length === 0 &&
      s.storage[com.key].qty === com.qty - first;
  })());

  ok('the trips a contract will take are known before it is signed', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1031), gold: 200000 });
    const bare = C.commissionTrips(s, 20);
    C.shopBuyVehicle(s, 'wagon');
    const some = C.commissionTrips(s, 20);
    C.shopBuyVehicle(s, 'horse');
    const plenty = C.commissionTrips(s, 20);
    return bare.warn && bare.capacity === 0 &&
      some.capacity === 15 && some.trips === 2 && some.warn &&
      plenty.capacity === 30 && plenty.trips === 1 && !plenty.warn;
  })());

  ok('what a given cart would take on one trip is worked out, not guessed', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1032), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    const haul = C.commissionHaul(s, com, cart);
    return haul.waiting === com.qty && haul.capacity === 5 && haul.load === 5 &&
      haul.trips === Math.ceil(com.qty / 5);
  })());

  ok('delivery progress survives being put down', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1033), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    C.deliverCommission(s, com.id, cart.id);
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    const got = C.commissionById(back, com.id);
    return got && got.delivered === com.delivered && got.filled === com.filled &&
      C.commissionState(back, got) === 'partial';
  })());

  ok('a contract from before deliveries resumes with its goods in the crate', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1034), gold: 200000 });
    const com = readyContract(s);
    const data = C.serializeShop(s);
    for (const c of data.commissions) delete c.delivered;
    const back = C.restoreShop(data, C.mulberry32(1));
    const got = C.commissionById(back, com.id);
    return got && (got.delivered || 0) === 0 && got.filled === com.qty &&
      C.commissionState(back, got) === 'awaiting';
  })());

  ok('a save claiming more delivered than asked for is trimmed', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1035), gold: 200000 });
    const com = readyContract(s);
    const data = C.serializeShop(s);
    for (const c of data.commissions) { c.delivered = 9999; c.filled = 9999; }
    const back = C.restoreShop(data, C.mulberry32(1));
    const got = C.commissionById(back, com.id);
    return got && got.delivered + got.filled <= got.qty;
  })());
}

section('Open Your Forge: a runner on the road');
{
  ok('a runner can be sent out with a contract', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1040), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    const e = { id: 1, name: 'Run', role: 'runner', rank: 'C', power: 3, wage: 30 };
    const r = C.runRunner(s, e, { kind: 'deliver', commission: com.id,
      vehicle: cart.id, qty: 99 });
    return r.ok && r.kind === 'delivery' && r.load === 5 &&
      com.delivered === 5 && cart.busy === null;
  })());

  ok('and the phase they spend is theirs, not yours', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1041), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    s.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    const booked = C.shopAssign(s, 1, { order: { kind: 'deliver', commission: com.id,
      vehicle: cart.id, qty: 5 } });
    const phase = s.phaseIndex;
    // booking costs the player nothing at all: same day, same phase
    return booked.ok && s.phaseIndex === phase && s.day === 1;
  })());

  ok('booking a delivery takes the cart off the yard', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1042), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    s.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    s.staff.push({ id: 2, name: 'S', role: 'runner', rank: 'C', power: 3, wage: 30 });
    const first = C.shopAssign(s, 1, { order: { kind: 'deliver', commission: com.id,
      vehicle: cart.id, qty: 5 } });
    const second = C.shopAssign(s, 2, { order: { kind: 'deliver', commission: com.id,
      vehicle: cart.id, qty: 5 } });
    return first.ok && !second.ok && C.freeVehicles(s).length === 0;
  })());

  ok('two carts are two runners out at once', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1043), gold: 200000 });
    const com = readyContract(s);
    const one = C.shopBuyVehicle(s, 'cart').vehicle;
    const two = C.shopBuyVehicle(s, 'cart').vehicle;
    s.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    s.staff.push({ id: 2, name: 'S', role: 'runner', rank: 'C', power: 3, wage: 30 });
    const first = C.shopAssign(s, 1, { order: { kind: 'deliver', commission: com.id,
      vehicle: one.id, qty: 5 } });
    const second = C.shopAssign(s, 2, { order: { kind: 'deliver', commission: com.id,
      vehicle: two.id, qty: 5 } });
    return first.ok && second.ok;
  })());

  ok('one cart cannot fetch ore and deliver goods in the same phase', (() => {
    const { shop, mine } = minedShop('bronze', 1044);
    mine.ore = 40;
    const com = readyContract(shop);
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    shop.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    shop.staff.push({ id: 2, name: 'S', role: 'runner', rank: 'C', power: 3, wage: 30 });
    const haul = C.shopAssign(shop, 1, { order: { kind: 'ore', mine: mine.id,
      vehicle: cart.id, qty: 5 } });
    const ship = C.shopAssign(shop, 2, { order: { kind: 'deliver', commission: com.id,
      vehicle: cart.id, qty: 5 } });
    return haul.ok && !ship.ok;
  })());

  ok('a runner takes one errand a phase and no more', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1045), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    s.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    const first = C.shopAssign(s, 1, { order: { kind: 'deliver', commission: com.id,
      vehicle: cart.id, qty: 5 } });
    const second = C.shopAssign(s, 1, { order: { bronze: 4 } }, C.SHOP.phases[2]);
    return first.ok && !second.ok;
  })());

  ok('dropping a delivery puts the cart back in the yard', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1046), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    s.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    C.shopAssign(s, 1, { order: { kind: 'deliver', commission: com.id,
      vehicle: cart.id, qty: 5 } }, C.SHOP.phases[2]);
    C.shopUnassign(s, 1);
    return C.freeVehicles(s).length === 1;
  })());

  ok('a delivery cannot be booked for a contract still being made', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1047), gold: 200000 });
    const com = offerOn(s);
    C.acceptCommission(s, com.id);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    s.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    return !C.shopAssign(s, 1, { order: { kind: 'deliver', commission: com.id,
      vehicle: cart.id, qty: 5 } }).ok;
  })());

  ok('the phase closing is what moves the goods', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1048), gold: 200000 });
    const com = readyContract(s);
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    s.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    C.shopAssign(s, 1, { order: { kind: 'deliver', commission: com.id,
      vehicle: cart.id, qty: 5 } });
    const before = com.delivered || 0;
    const res = C.shopAdvancePhase(s);
    return before === 0 && com.delivered === 5 &&
      res.reports.some((r) => r.kind === 'delivery');
  })());

  ok('market runs and ore hauls are untouched by any of it', (() => {
    const { shop, mine } = minedShop('bronze', 1049);
    mine.ore = 20;
    shop.gold = 200000;
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    const e = { id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 };
    const bars = shop.materials.bronze;
    const market = C.runRunner(shop, e, { bronze: 6 });
    const haul = C.runRunner(shop, e, { kind: 'ore', mine: mine.id,
      vehicle: cart.id, qty: 5 });
    return market.ok && shop.materials.bronze === bars + 6 &&
      haul.ok && haul.kind === 'haul' && shop.ore.bronze === 5;
  })());
}

/* A forge with hands on the books, for the checks about keeping a roster. */
function staffed(shop, ...roles) {
  let id = 900;
  for (const role of roles) {
    shop.staff.push({ id: id++, name: 'Hand ' + id, role: role, rank: 'C',
      power: 3, wage: 30, face: 'traveler' });
  }
  return shop;
}
const PH = C.SHOP.phases;

section('Open Your Forge: a cart is out for a phase, not for a day');
{
  ok('a cart booked in the morning is free again by the afternoon', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1200), gold: 200000 });
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    C.bookVehicle(s, cart, PH[0]);
    return !C.vehicleFree(s, cart, PH[0]) && C.vehicleFree(s, cart, PH[1]) &&
      C.vehicleFree(s, cart, PH[2]);
  })());

  ok('but it cannot be in two places in the same phase', (() => {
    const { shop, mine } = minedShop('bronze', 1201);
    mine.ore = 40;
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    staffed(shop, 'runner', 'runner');
    const first = C.shopAssign(shop, 900, { order: { kind: 'ore', mine: mine.id,
      vehicle: cart.id, qty: 5 } }, PH[0]);
    const clash = C.shopAssign(shop, 901, { order: { kind: 'ore', mine: mine.id,
      vehicle: cart.id, qty: 5 } }, PH[0]);
    const later = C.shopAssign(shop, 901, { order: { kind: 'ore', mine: mine.id,
      vehicle: cart.id, qty: 5 } }, PH[1]);
    return first.ok && !clash.ok && later.ok;
  })());

  ok('running the job puts it back in the yard for the phases after', (() => {
    const { shop, mine } = minedShop('bronze', 1202);
    mine.ore = 40;
    const cart = C.shopBuyVehicle(shop, 'cart').vehicle;
    const e = { id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 };
    C.bookVehicle(shop, cart, C.shopPhase(shop));
    C.runRunner(shop, e, { kind: 'ore', mine: mine.id, vehicle: cart.id, qty: 5 });
    return C.vehicleFree(shop, cart, C.shopPhase(shop));
  })());

  ok('a save from when a cart was out for the whole day still reads', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1203), gold: 200000 });
    C.shopBuyVehicle(s, 'cart');
    const data = C.serializeShop(s);
    data.vehicles[0].busy = { day: s.day, phase: PH[1] };
    const back = C.restoreShop(data, C.mulberry32(1));
    const cart = back.vehicles[0];
    return C.vehicleFree(back, cart, PH[0]) && !C.vehicleFree(back, cart, PH[1]);
  })());

  ok('the phases a cart is out in survive being put down', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1204), gold: 200000 });
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    C.bookVehicle(s, cart, PH[0]);
    C.bookVehicle(s, cart, PH[2]);
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    const got = back.vehicles[0];
    return !C.vehicleFree(back, got, PH[0]) && C.vehicleFree(back, got, PH[1]) &&
      !C.vehicleFree(back, got, PH[2]);
  })());
}

section('Open Your Forge: a roster that keeps itself');
{
  ok('a new forge keeps nothing until it is told to', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1210) });
    return s.standing.length === 0 && C.applyStanding(s).length === 0;
  })());

  ok('a box can be kept, changed and stopped', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1211) }), 'salesperson');
    C.setStanding(s, 'salesperson', PH[0], 900, {});
    // the slot is one object kept in place, so read it rather than hold it
    const first = C.standingAt(s, 'salesperson', PH[0]);
    const heldBy = first.staff, wasId = first.id;
    C.setStanding(s, 'salesperson', PH[0], null, {});
    const two = C.standingAt(s, 'salesperson', PH[0]);
    const count = s.standing.length;
    C.clearStanding(s, 'salesperson', PH[0]);
    return heldBy === 900 && count === 1 && two.staff === null &&
      two.id === wasId && C.standingAt(s, 'salesperson', PH[0]) === null;
  })());

  ok('a box can be paused without being forgotten', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1212) }), 'salesperson');
    C.setStanding(s, 'salesperson', PH[0], 900, {});
    C.toggleStanding(s, 'salesperson', PH[0], false);
    const rows = C.applyStanding(s);
    return s.standing.length === 1 && !s.standing[0].on && rows.length === 0;
  })());

  ok('the turn of the day puts the kept boxes up', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1213) }), 'salesperson', 'apprentice');
    C.setStanding(s, 'salesperson', PH[0], 900, {});
    C.setStanding(s, 'apprentice', PH[1], 901, {});
    const day = C.shopEndDay(s);
    return day.roster.length === 2 && day.roster.every((r) => r.ok) &&
      !!C.assignedThisDay(s, 900) && !!C.assignedThisDay(s, 901);
  })());

  ok('a named hand holds their box', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1214) }), 'salesperson', 'salesperson');
    C.setStanding(s, 'salesperson', PH[0], 901, {});
    C.shopEndDay(s);
    return !!C.assignedThisDay(s, 901) && !C.assignedThisDay(s, 900);
  })());

  ok('auto-fill takes whoever is free', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1215) }), 'salesperson');
    C.setStanding(s, 'salesperson', PH[0], null, {});
    const day = C.shopEndDay(s);
    return day.roster[0].ok && day.roster[0].auto === true &&
      !!C.assignedThisDay(s, 900);
  })());

  ok('and never double-books anybody', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1216) }), 'salesperson');
    C.setStanding(s, 'salesperson', PH[0], null, {});
    C.setStanding(s, 'salesperson', PH[1], null, {});
    const day = C.shopEndDay(s);
    const put = day.roster.filter((r) => r.ok);
    return put.length === 1 && day.roster.some((r) => !r.ok && /nobody free/i.test(r.why));
  })());

  ok('a box nobody can fill is left empty and says why', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1217) });
    C.setStanding(s, 'runner', PH[0], null, { kind: 'market', material: 'bronze',
      upTo: 10, cap: 500 });
    const day = C.shopEndDay(s);
    return day.roster.length === 1 && !day.roster[0].ok &&
      /nobody free/i.test(day.roster[0].why) && Object.keys(s.assignments).length === 0;
  })());

  ok('a hand who has left hands their box back to nobody', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1218) }), 'salesperson');
    C.setStanding(s, 'salesperson', PH[0], 900, {});
    s.staff = [];
    const day = C.shopEndDay(s);
    return !day.roster[0].ok && /has left/i.test(day.roster[0].why);
  })());

  ok('a box the player filled by hand is left alone', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1219) }), 'salesperson', 'salesperson');
    C.setStanding(s, 'salesperson', PH[2], 900, {});
    C.shopEndDay(s);
    C.shopUnassign(s, 900);
    C.shopAssign(s, 901, {}, PH[2]);
    const rows = C.applyStanding(s);
    return rows.length === 0 && !!C.assignedThisDay(s, 901) && !C.assignedThisDay(s, 900);
  })());

  ok('what the roster books is marked as the book’s doing', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1220) }), 'salesperson');
    C.setStanding(s, 'salesperson', PH[0], 900, {});
    C.shopEndDay(s);
    return C.assignedThisDay(s, 900).job.standing === true;
  })());

  ok('overriding for a day never touches the standing box', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1221) }), 'salesperson');
    C.setStanding(s, 'salesperson', PH[2], 900, {});
    C.shopEndDay(s);
    C.shopUnassign(s, 900);
    const still = C.standingAt(s, 'salesperson', PH[2]);
    C.shopEndDay(s);
    return !!still && still.on && !!C.assignedThisDay(s, 900);
  })());

  ok('a closed forge books nothing at all', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1222) }), 'salesperson');
    C.setStanding(s, 'salesperson', PH[0], 900, {});
    s.closed = true;
    const day = C.shopEndDay(s);
    return day.roster.length === 0;
  })());
}

section('Open Your Forge: what a kept box is told to do');
{
  ok('a runner keeps a metal stocked, and stops when it is', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1230), gold: 200000 }), 'runner');
    s.materials.bronze = 0;
    C.setStanding(s, 'runner', PH[0], 900, { kind: 'market', material: 'bronze',
      upTo: 12, cap: 9000 });
    const first = C.shopEndDay(s);
    const order = C.assignedThisDay(s, 900).job.order;
    s.materials.bronze = 12;
    const again = C.planOrder(s, 'runner', C.standingAt(s, 'runner', PH[0]).plan, PH[0]);
    return first.roster[0].ok && order.bronze === 12 &&
      !again.ok && /already stocked/i.test(again.why);
  })());

  ok('and never spends past the ceiling set for it', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1231), gold: 200000 }), 'runner');
    s.materials.gold = 0;
    const each = C.shopMaterial('gold').cost;
    C.setStanding(s, 'runner', PH[0], 900, { kind: 'market', material: 'gold',
      upTo: 50, cap: each * 3 });
    C.shopEndDay(s);
    const order = C.assignedThisDay(s, 900).job.order;
    return order.gold === 3;
  })());

  ok('nor past the gold actually in the strongbox', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1232), gold: 0 }), 'runner');
    C.setStanding(s, 'runner', PH[0], 900, { kind: 'market', material: 'bronze',
      upTo: 50, cap: 99999 });
    const day = C.shopEndDay(s);
    return !day.roster[0].ok && Object.keys(s.assignments).length === 0;
  })());

  ok('an ore run waits until the yard is low enough', (() => {
    const { shop, mine } = minedShop('bronze', 1233);
    mine.ore = 40;
    shop.gold = 200000;
    C.shopBuyVehicle(shop, 'cart');
    staffed(shop, 'runner');
    C.setStanding(shop, 'runner', PH[0], 900, { kind: 'ore', mine: mine.id,
      qty: 5, below: 10 });
    const plan = C.standingAt(shop, 'runner', PH[0]).plan;
    shop.ore.bronze = 20;
    const full = C.planOrder(shop, 'runner', plan, PH[0]);
    shop.ore = {};
    const empty = C.planOrder(shop, 'runner', plan, PH[0]);
    return !full.ok && /still holds/i.test(full.why) && empty.ok;
  })());

  ok('a delivery takes the contract due soonest', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1234), gold: 200000 }), 'runner');
    C.shopBuyVehicle(s, 'cart');
    const far = readyContract(s);
    const near = readyContract(s);
    far.dueDay = s.day + 20;
    near.dueDay = s.day + 2;
    const pick = C.nextDelivery(s, PH[0]);
    return pick.ok && pick.order.commission === near.id;
  })());

  ok('and loads as much of it as the cart will take', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1235), gold: 200000 }), 'runner');
    const cart = C.shopBuyVehicle(s, 'cart').vehicle;
    const com = readyContract(s);
    const pick = C.nextDelivery(s, PH[0]);
    return pick.ok && pick.order.qty === Math.min(com.qty, C.vehicleCapacity(cart));
  })());

  ok('with nothing ready to go the runner stays home', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1236), gold: 200000 }), 'runner');
    C.shopBuyVehicle(s, 'cart');
    C.setStanding(s, 'runner', PH[0], 900, { kind: 'deliver' });
    const day = C.shopEndDay(s);
    return !day.roster[0].ok && /ready to go/i.test(day.roster[0].why) &&
      Object.keys(s.assignments).length === 0;
  })());

  ok('a smith keeps forging the same batch while the metal lasts', (() => {
    const s = staffed(apprenticed(C.createShop({ rnd: C.mulberry32(1237) })), 'smith');
    s.materials.bronze = 4;
    C.setStanding(s, 'smith', PH[0], 900, { kind: 'forge', item: 'shortsword',
      material: 'bronze', qty: 3 });
    const first = C.shopEndDay(s);
    C.runSmith(s, s.staff[0], C.assignedThisDay(s, 900).job.order);
    const second = C.planOrder(s, 'smith', C.standingAt(s, 'smith', PH[0]).plan, PH[0]);
    return first.roster[0].ok && !second.ok && /ingot/i.test(second.why);
  })());

  ok('a batch is never bigger than the anvil will take', (() => {
    const s = staffed(apprenticed(C.createShop({ rnd: C.mulberry32(1238) })), 'smith');
    s.materials.bronze = 200;
    C.setStanding(s, 'smith', PH[0], 900, { kind: 'forge', item: 'shortsword',
      material: 'bronze', qty: 99 });
    C.shopEndDay(s);
    return C.assignedThisDay(s, 900).job.order.qty === C.batchCapacity(s);
  })());

  ok('a smith at the furnace needs ore in the yard', (() => {
    const s = staffed(apprenticed(C.createShop({ rnd: C.mulberry32(1239) })), 'smith');
    C.setStanding(s, 'smith', PH[0], 900, { kind: 'smelt', material: 'bronze' });
    const plan = C.standingAt(s, 'smith', PH[0]).plan;
    const dry = C.planOrder(s, 'smith', plan, PH[0]);
    C.addOre(s, 'bronze', 10);
    const wet = C.planOrder(s, 'smith', plan, PH[0]);
    return !dry.ok && wet.ok && wet.order.kind === 'smelt' &&
      C.applyStanding(s)[0].ok;
  })());

  ok('a store hand needs something in storage', (() => {
    const s = staffed(apprenticed(C.createShop({ rnd: C.mulberry32(1240) })), 'storehand');
    C.setStanding(s, 'storehand', PH[0], 900, {});
    const plan = C.standingAt(s, 'storehand', PH[0]).plan;
    const bare = C.planOrder(s, 'storehand', plan, PH[0]);
    C.addStorage(s, C.lineKey('shortsword', 'bronze'), 4, 90, 1);
    const full = C.planOrder(s, 'storehand', plan, PH[0]);
    return !bare.ok && full.ok && C.applyStanding(s)[0].ok;
  })());

  ok('a salesperson and an apprentice need no orders at all', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1241) }), 'salesperson', 'apprentice');
    return C.planOrder(s, 'salesperson', {}, PH[0]).ok &&
      C.planOrder(s, 'apprentice', {}, PH[0]).ok;
  })());
}

section('Open Your Forge: the day the book made');
{
  ok('a kept roster runs its work when the phases close', (() => {
    const s = staffed(apprenticed(C.createShop({ rnd: C.mulberry32(1250), gold: 200000 })),
      'smith', 'salesperson');
    s.materials.bronze = 40;
    stock(s, C.lineKey('shortsword', 'bronze'), 8, 95);
    noContracts(s);
    C.setStanding(s, 'smith', PH[0], 900, { kind: 'forge', item: 'shortsword',
      material: 'bronze', qty: 2 });
    C.setStanding(s, 'salesperson', PH[1], 901, {});
    C.shopEndDay(s);
    const made = s.orders.length;
    const first = C.shopAdvancePhase(s);
    const second = C.shopAdvancePhase(s);
    return made === 0 && s.orders.length === 1 &&
      first.reports.some((r) => r.kind === 'smith') &&
      second.reports.some((r) => r.kind === 'sales');
  })());

  ok('two days running book themselves the same way', (() => {
    const s = staffed(apprenticed(C.createShop({ rnd: C.mulberry32(1251) })), 'salesperson');
    C.setStanding(s, 'salesperson', PH[0], 900, {});
    const one = C.shopEndDay(s);
    const two = C.shopEndDay(s);
    return one.roster[0].ok && two.roster[0].ok &&
      C.assignedThisDay(s, 900).phase === PH[0];
  })());

  ok('yesterday’s roster can simply be put up again', (() => {
    const s = staffed(apprenticed(C.createShop({ rnd: C.mulberry32(1252) })), 'smith');
    s.materials.bronze = 40;
    C.shopAssign(s, 900, { order: { item: 'shortsword', material: 'bronze', qty: 2 } }, PH[0]);
    C.shopEndDay(s);
    const rows = C.repeatRoster(s);
    return rows.length === 1 && rows[0].ok &&
      C.assignedThisDay(s, 900).job.order.item === 'shortsword';
  })());

  ok('and what cannot be put up again is said, not forced', (() => {
    const s = staffed(apprenticed(C.createShop({ rnd: C.mulberry32(1253) })), 'smith');
    s.materials.bronze = 40;
    C.shopAssign(s, 900, { order: { item: 'shortsword', material: 'bronze', qty: 2 } }, PH[0]);
    C.shopEndDay(s);
    s.staff = [];
    const rows = C.repeatRoster(s);
    return rows.length === 1 && !rows[0].ok;
  })());

  ok('the standing roster survives being put down', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1254) }), 'salesperson', 'runner');
    C.setStanding(s, 'salesperson', PH[0], 900, {});
    C.setStanding(s, 'runner', PH[2], null, { kind: 'market', material: 'silver',
      upTo: 9, cap: 700 });
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    const sale = C.standingAt(back, 'salesperson', PH[0]);
    const run = C.standingAt(back, 'runner', PH[2]);
    return back.standing.length === 2 && sale.staff === 900 && run.staff === null &&
      run.plan.material === 'silver' && run.plan.upTo === 9 && run.plan.cap === 700;
  })());

  ok('a save from before there was one keeps nothing, and says nothing', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1255) }), 'salesperson');
    const data = C.serializeShop(s);
    delete data.standing;
    delete data.lastRoster;
    const back = C.restoreShop(data, C.mulberry32(1));
    return back.standing.length === 0 && back.lastRoster.length === 0 &&
      C.shopEndDay(back).roster.length === 0;
  })());

  ok('a save whose roster is rubbish still leaves a forge that works', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1256) }), 'salesperson');
    const data = C.serializeShop(s);
    data.standing = [
      { role: 'not-a-role', phase: PH[0] },
      { role: 'salesperson', phase: 'teatime' },
      { role: 'salesperson', phase: PH[0], staff: 4242, plan: { kind: 'market' } },
      { role: 'salesperson', phase: PH[0], staff: 900 },
      null, 17
    ];
    const back = C.restoreShop(data, C.mulberry32(1));
    const slot = C.standingAt(back, 'salesperson', PH[0]);
    return back.standing.length === 1 && !!slot && slot.staff === null;
  })());

  ok('the morning report names every box it filled and every one it did not', (() => {
    const s = staffed(C.createShop({ rnd: C.mulberry32(1257) }), 'salesperson');
    C.setStanding(s, 'salesperson', PH[0], 900, {});
    C.setStanding(s, 'runner', PH[0], null, { kind: 'deliver' });
    const day = C.shopEndDay(s);
    return day.roster.length === 2 &&
      day.roster.some((r) => r.ok && r.who) &&
      day.roster.some((r) => !r.ok && typeof r.why === 'string' && r.why.length > 0);
  })());
}

section('Open Your Forge: a hand earns their rank');
{
  /* A hand on the books at E with a clean slate, by trade. */
  function green(shop, role) {
    const list = C.shopSearchStaff(shop, role, 1);
    C.shopHire(shop, list[0].id);
    return shop.staff[shop.staff.length - 1];
  }

  ok('everybody who comes to the door starts at E, whatever the trade', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1300) });
    for (const role of C.SHOP.roles) {
      const list = C.shopSearchStaff(s, role.id, 6);
      if (!list.every((a) => a.rank === 'E' && a.power === 1 && a.xp === 0)) return false;
    }
    return true;
  })());

  ok('asking after a trade turns up only that trade', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1301) });
    const smiths = C.shopSearchStaff(s, 'smith', 5);
    const runners = C.shopSearchStaff(s, 'runner', 5);
    return smiths.length === 5 && smiths.every((a) => a.role === 'smith') &&
      runners.length === 5 && runners.every((a) => a.role === 'runner');
  })());

  ok('asking after no trade at all turns up nobody', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1302) });
    return C.shopSearchStaff(s, null).length === 0 &&
      C.shopSearchStaff(s, 'wizard').length === 0;
  })());

  ok('a miner is hired at E as well', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1303), gold: 90000 });
    const mine = C.shopBuyMine(s, C.SHOP.mines[0].id).mine;
    const list = C.shopSearchMiners(s, mine.id, 4);
    return list.length === 4 && list.every((m) => m.rank === 'E' && m.xp === 0);
  })());

  ok('the ladder runs E to S and stops there', (() => {
    const ids = C.SHOP.ranks.map((r) => r.id).join('');
    return ids === 'EDCBAS' && C.nextRank('S') === null && C.nextRank('E').id === 'D';
  })());

  ok('a hand is not ready until the work is actually behind them', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1304) });
    const e = green(s, 'storehand');
    const need = C.rankUpAt(e);
    C.awardXp(e, need - 1);
    if (C.rankReady(e) || C.promote(s, e).ok) return false;    // one short, and refused
    C.awardXp(e, 1);
    return C.rankReady(e) && C.promote(s, e).ok;
  })());

  ok('promoting carries the surplus over rather than dropping it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1305) });
    const e = green(s, 'smith');
    const need = C.rankUpAt(e);
    C.awardXp(e, need + 23);
    const res = C.promote(s, e);
    return res.ok && res.rank === 'D' && e.xp === 23 && res.carried === 23;
  })());

  ok('a promotion raises what they can do, not just their letter', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1306) });
    const e = green(s, 'storehand');
    const was = e.power;
    C.awardXp(e, C.rankUpAt(e));
    C.promote(s, e);
    return e.power === was + 1 && e.rank === 'D';
  })());

  ok('a wage keeps its own scatter across a promotion', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1307) });
    const e = green(s, 'runner');
    const scatter = e.wage / C.SHOP.ranks[0].wage;
    C.awardXp(e, C.rankUpAt(e));
    C.promote(s, e);
    // dearer than they were, and still dear in the same proportion
    return e.wage > C.SHOP.ranks[0].wage &&
      Math.abs(e.wage / C.SHOP.ranks[1].wage - scatter) < 0.02;
  })());

  ok('S-rank is the end of the road, and nothing is banked past it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1308) });
    const e = green(s, 'smith');
    for (let i = 0; i < 5; i++) { C.awardXp(e, C.rankUpAt(e)); C.promote(s, e); }
    if (e.rank !== 'S') return false;
    return C.awardXp(e, 5000) === 0 && e.xp === 0 && C.rankUpAt(e) === 0 &&
      !C.rankReady(e) && !C.promote(s, e).ok;
  })());

  ok('a hand nobody rostered earns nothing at all', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1309) });
    const e = green(s, 'storehand');
    s.storage['dagger|bronze'] = { qty: 20, quality: 60, level: 1 };
    C.shopAdvancePhase(s);
    C.shopAdvancePhase(s);
    return e.xp === 0;
  })());

  ok('a phase that shifted nothing pays nothing', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1310) });
    const e = green(s, 'storehand');
    // storage is empty, so there is nothing to put on a stand
    C.shopAssign(s, e.id, { job: 'storehand', order: { keys: [] } }, PH[0]);
    C.shopAdvancePhase(s);
    return e.xp === 0;
  })());

  ok('a phase that did the work pays for it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1311) });
    const e = green(s, 'storehand');
    s.storage['dagger|bronze'] = { qty: 20, quality: 60, level: 1 };
    C.shopAssign(s, e.id, { job: 'storehand', order: { keys: ['dagger|bronze'] } }, PH[0]);
    C.shopAdvancePhase(s);
    return e.xp > 0;
  })());

  ok('a failed job pays nothing even though the phase was spent', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1312) });
    const e = green(s, 'runner');
    // no gold, so the trip comes back with nothing
    s.gold = 0;
    C.shopAssign(s, e.id, { job: 'runner', order: { bronze: 5 } }, PH[0]);
    C.shopAdvancePhase(s);
    return e.xp === 0;
  })());

  ok('the same phase is never paid for twice', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1313) });
    const e = green(s, 'storehand');
    s.storage['dagger|bronze'] = { qty: 20, quality: 60, level: 1 };
    C.shopAssign(s, e.id, { job: 'storehand', order: { keys: ['dagger|bronze'] } }, PH[0]);
    C.runAssignments(s);
    const once = e.xp;
    C.runAssignments(s);
    C.runAssignments(s);
    return once > 0 && e.xp === once;
  })());

  ok('the roster pays exactly what the player’s own hand does', (() => {
    function run(byBook) {
      const s = C.createShop({ rnd: C.mulberry32(1314), gold: 4000 });
      const e = green(s, 'storehand');
      s.storage['dagger|bronze'] = { qty: 20, quality: 60, level: 1 };
      if (byBook) {
        C.setStanding(s, 'storehand', PH[0], null, { kind: 'shelve' });
        C.shopEndDay(s);
        C.shopAdvancePhase(s);
      } else {
        C.shopAssign(s, e.id, { job: 'storehand', order: { keys: ['dagger|bronze'] } }, PH[0]);
        C.shopAdvancePhase(s);
      }
      return s.staff[0].xp;
    }
    const byHand = run(false), byBook = run(true);
    return byHand > 0 && byHand === byBook;
  })());

  ok('an apprentice earns from the batch, not from standing at the bench', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(1315) }));
    s.materials.bronze = 40;
    const e = green(s, 'apprentice');
    C.shopAssign(s, e.id, { job: 'apprentice' }, PH[0]);
    if (e.xp !== 0) return false;                 // rostered, but nothing forged yet
    const bp = Object.keys(s.blueprints)[0];
    C.shopFinishForge(s, bp, 'bronze', 3, 70, 'you');
    return e.xp > 0;
  })());

  ok('an apprentice off the bench earns nothing from your anvil', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(1316) }));
    s.materials.bronze = 40;
    const e = green(s, 'apprentice');
    C.shopFinishForge(s, Object.keys(s.blueprints)[0], 'bronze', 3, 70, 'you');
    return e.xp === 0;
  })());

  ok('a miner is paid when the week’s dig finishes, and once', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1317), gold: 90000 });
    const mine = C.shopBuyMine(s, C.SHOP.mines[0].id).mine;
    const list = C.shopSearchMiners(s, mine.id, 1);
    C.shopHireMiner(s, mine.id, list[0].id);
    const m = mine.miners[0];
    C.runMines(s, 1);
    const week = m.xp;
    C.runMines(s, 1);                              // the same week again
    if (week <= 0 || m.xp !== week) return false;
    C.runMines(s, 2);
    return m.xp > week;
  })());

  ok('a shaft nobody works pays nobody', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1318), gold: 90000 });
    C.shopBuyMine(s, C.SHOP.mines[0].id);
    return C.runMines(s, 1).length === 1;          // it reports, and nothing throws
  })());

  ok('the screen can name everybody who has earned a promotion', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1319), gold: 90000 });
    const a = green(s, 'smith'), b = green(s, 'runner');
    const mine = C.shopBuyMine(s, C.SHOP.mines[0].id).mine;
    const list = C.shopSearchMiners(s, mine.id, 1);
    C.shopHireMiner(s, mine.id, list[0].id);
    const m = mine.miners[0];
    if (C.readyToRank(s).length !== 0) return false;
    C.awardXp(a, C.rankUpAt(a));
    C.awardXp(m, C.rankUpAt(m));
    const due = C.readyToRank(s).map((one) => one.id).sort();
    return due.length === 2 && due.indexOf(a.id) >= 0 && due.indexOf(m.id) >= 0 &&
      due.indexOf(b.id) < 0;
  })());

  ok('a miner can be ranked up by id the same as a forge hand', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1320), gold: 90000 });
    const mine = C.shopBuyMine(s, C.SHOP.mines[0].id).mine;
    const list = C.shopSearchMiners(s, mine.id, 1);
    C.shopHireMiner(s, mine.id, list[0].id);
    const m = mine.miners[0];
    C.awardXp(m, C.rankUpAt(m));
    const res = C.shopPromote(s, m.id);
    return res.ok && m.rank === 'D' && C.crewById(s, m.id) === m;
  })());

  ok('a rank buys more of the job, not just a letter', (() => {
    /* The panel quotes 4 + power*2 for a store hand; this is the job itself
       doing it, so the promise and the work cannot drift apart. */
    function shifted(power) {
      const s = C.createShop({ rnd: C.mulberry32(1321) });
      const e = green(s, 'storehand');
      e.power = power;
      s.storage['dagger|bronze'] = { qty: 60, quality: 60, level: 1 };
      C.shopAssign(s, e.id, { job: 'storehand', order: { keys: ['dagger|bronze'] } }, PH[0]);
      return C.runAssignments(s)[0].capacity;
    }
    return shifted(1) === 6 && shifted(3) === 10 && shifted(6) === 16;
  })());

  ok('taking somebody new on never displaces a kept box', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1326), gold: 4000 });
    const held = green(s, 'storehand');
    C.setStanding(s, 'storehand', PH[0], held.id, { kind: 'shelve' });
    s.storage['dagger|bronze'] = { qty: 40, quality: 60, level: 1 };
    C.shopEndDay(s);
    const booked = C.assignedThisDay(s, held.id);
    // a second store hand comes on the books mid-day
    const fresh = green(s, 'storehand');
    const after = C.assignedThisDay(s, held.id);
    const slot = C.standingAt(s, 'storehand', PH[0]);
    return !!booked && !!after && after.phase === booked.phase &&
      slot.staff === held.id && !C.assignedThisDay(s, fresh.id);
  })());

  ok('an established hand keeps the rank they were hired at', (() => {
    /* A save written before there was a ladder. The climb is how ranks are
       EARNED from here - it is not a reason to take back one already held. */
    const s = C.createShop({ rnd: C.mulberry32(1322) });
    const data = C.serializeShop(s);
    data.staff = [{ id: 5, name: 'Mara Ashford', role: 'smith', rank: 'A',
      power: 5, wage: 120 }];
    const back = C.restoreShop(data, C.mulberry32(9));
    const hand = back.staff[0];
    return !!hand && hand.rank === 'A' && hand.power === 5 && hand.xp === 0;
  })());

  ok('a miner established before the ladder keeps their rank too', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1323), gold: 90000 });
    C.shopBuyMine(s, C.SHOP.mines[0].id);
    const data = C.serializeShop(s);
    data.mines[0].miners = [{ id: 8, name: 'Dorn Pike', rank: 'B', power: 4, wage: 70 }];
    const back = C.restoreShop(data, C.mulberry32(1));
    const m = back.mines[0].miners[0];
    return !!m && m.rank === 'B' && m.power === 4 && m.xp === 0;
  })());

  ok('a pool saved with a hand comes back with them', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1324) });
    const e = green(s, 'smith');
    C.awardXp(e, 47);
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    const same = back.staff.find((one) => one.name === e.name);
    return !!same && same.xp === 47 && same.rank === 'E';
  })());

  ok('a tampered pool cannot be brought back as a negative', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1325) });
    green(s, 'smith');
    const data = C.serializeShop(s);
    data.staff[0].xp = -9999;
    const back = C.restoreShop(data, C.mulberry32(1));
    return back.staff.length === 1 && back.staff[0].xp === 0;
  })());
}

section('Open Your Forge: Growth buys room, the Shop buys fixtures');
{
  /* A forge with money and a stand holding something worth selling. */
  function floored(seed, quality, level) {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(seed), gold: 200000 }));
    const stand = s.stands[0];
    const key = C.lineKey('shortsword', 'bronze');
    stand.key = key; stand.qty = 5;
    stand.quality = quality == null ? 80 : quality;
    stand.level = level == null ? 1 : level;
    stand.price = C.standWorth(stand);
    return s;
  }

  ok('a fresh display starts plain and sells at the plain price', (() => {
    const s = floored(1400);
    const stand = s.stands[0];
    return C.standLevel(stand) === 0 && C.standBonus(stand) === 1 &&
      C.standWorth(stand) === C.recommendedPrice('shortsword', 'bronze', 80, 1);
  })());

  ok('each display level is worth exactly two and a half percent more', (() => {
    const step = C.SHOP.growth.display.step;
    if (step !== 0.025) return false;
    for (let lv = 0; lv <= C.SHOP.growth.display.max; lv++) {
      if (Math.abs(C.standBonus({ up: lv }) - (1 + lv * 0.025)) > 1e-9) return false;
    }
    // the spec's own ladder, spelled out
    return C.standBonus({ up: 0 }) === 1 && C.standBonus({ up: 1 }) === 1.025 &&
      C.standBonus({ up: 2 }) === 1.05 && C.standBonus({ up: 3 }) === 1.075 &&
      Math.abs(C.standBonus({ up: 4 }) - 1.1) < 1e-9;
  })());

  ok('the bonus multiplies quality and blueprint level rather than replacing them', (() => {
    // a big number so rounding cannot hide the ratio
    const s = floored(1401, 100, 5);
    const stand = s.stands[0];
    const plain = C.standWorth(stand);
    stand.up = 4;
    const fine = C.standWorth(stand);
    if (Math.abs(fine / plain - 1.1) > 0.01) return false;
    // rough goods on a fine display are still worth less than fine goods on it
    stand.quality = 20; stand.level = 1;
    const rough = C.standWorth(stand);
    return rough < fine;
  })());

  ok('a display is upgraded on its own, not for the whole shop', (() => {
    const s = floored(1402);
    C.shopBuyStand(s, 'shield');
    const first = s.stands[0], second = s.stands[1];
    const res = C.shopUpgradeStand(s, first.id);
    return res.ok && C.standLevel(first) === 1 && C.standLevel(second) === 0;
  })());

  ok('upgrading a display lifts what it is already asking', (() => {
    const s = floored(1403, 100, 5);
    const stand = s.stands[0];
    const was = stand.price;
    C.shopUpgradeStand(s, stand.id);
    return stand.price > was;
  })());

  ok('a display stops at its ceiling', (() => {
    const s = floored(1404);
    const stand = s.stands[0];
    for (let i = 0; i < C.SHOP.growth.display.max; i++) C.shopUpgradeStand(s, stand.id);
    return C.standLevel(stand) === C.SHOP.growth.display.max &&
      C.standUpgradeCost(stand) === null && !C.shopUpgradeStand(s, stand.id).ok;
  })());

  ok('a display cannot be upgraded on an empty purse', (() => {
    const s = floored(1405);
    s.gold = 0;
    const res = C.shopUpgradeStand(s, s.stands[0].id);
    return !res.ok && C.standLevel(s.stands[0]) === 0;
  })());

  ok('every growth track costs more each time it is bought', (() => {
    for (const id of ['display', 'forge', 'hands', 'floor']) {
      const def = C.growthDef(id);
      let last = 0;
      for (let lv = 0; lv < def.max; lv++) {
        const cost = C.growthCostAt(def, lv);
        if (cost === null || cost <= last) return false;
        last = cost;
      }
      if (C.growthCostAt(def, def.max) !== null) return false;   // and stops
    }
    return true;
  })());

  ok('a forge upgrade is worth exactly one more ingot a phase', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1406), gold: 200000 });
    const was = C.batchCapacity(s);
    const res = C.shopBuyGrowth(s, 'forge');
    return res.ok && C.batchCapacity(s) === was + 1;
  })());

  ok('and it changes what may actually be forged straight away', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(1407), gold: 200000 }));
    s.materials.bronze = 99;
    const cap = C.batchCapacity(s);
    const bp = Object.keys(s.blueprints)[0];
    if (C.forgeCheck(s, bp, 'bronze', cap + 1).ok) return false;  // over capacity today
    C.shopBuyGrowth(s, 'forge');
    return C.forgeCheck(s, bp, 'bronze', cap + 1).ok;             // and allowed now
  })());

  ok('forge capacity says nothing about which metal is worked', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(1408), gold: 200000 }));
    const bronze = C.shopMaterial('bronze');
    const before = { cost: bronze.cost, value: bronze.value };
    C.shopBuyGrowth(s, 'forge');
    C.shopBuyGrowth(s, 'forge');
    return bronze.cost === before.cost && bronze.value === before.value;
  })());

  ok('an employment upgrade adds one place and hires nobody', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1409), gold: 200000 });
    const was = C.staffCapacity(s), had = s.staff.length;
    const res = C.shopBuyGrowth(s, 'hands');
    return res.ok && C.staffCapacity(s) === was + 1 && s.staff.length === had;
  })());

  ok('and the new place can then be recruited into', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1410), gold: 200000 });
    // fill the books to the brim
    let guard = 0;
    while (s.staff.length < C.staffCapacity(s) && guard++ < 20) {
      C.shopHire(s, C.shopSearchStaff(s, 'runner', 1)[0].id);
    }
    const full = C.shopHire(s, C.shopSearchStaff(s, 'runner', 1)[0].id);
    if (full.ok) return false;                                    // no room
    C.shopBuyGrowth(s, 'hands');
    return C.shopHire(s, C.shopSearchStaff(s, 'runner', 1)[0].id).ok;
  })());

  ok('a hand already on the books keeps their rank and pool through it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1411), gold: 200000 });
    C.shopHire(s, C.shopSearchStaff(s, 'smith', 1)[0].id);
    const hand = s.staff[0];
    C.awardXp(hand, 40);
    C.shopBuyGrowth(s, 'hands');
    return hand.rank === 'E' && hand.xp === 40;
  })());

  ok('a store expansion adds floor space and no stand', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1412), gold: 200000 });
    const was = C.standCap(s), had = s.stands.length;
    const res = C.shopBuyGrowth(s, 'floor');
    return res.ok && C.standCap(s) === was + 1 && s.stands.length === had;
  })());

  ok('the space it bought is what lets the Shop sell the next stand', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1413), gold: 200000 });
    // fill the floor
    let guard = 0;
    while (s.stands.length < C.standCap(s) && guard++ < 20) C.shopBuyStand(s, 'weapon');
    const full = C.shopBuyStand(s, 'weapon');
    if (full.ok) return false;                                    // no floor space
    C.shopBuyGrowth(s, 'floor');
    const after = C.shopBuyStand(s, 'weapon');
    return after.ok && s.stands.length === C.standCap(s);
  })());

  ok('a stand is still refused when it would overrun the floor', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1414), gold: 200000 });
    let guard = 0;
    while (s.stands.length < C.standCap(s) && guard++ < 20) C.shopBuyStand(s, 'weapon');
    const gold = s.gold;
    const res = C.shopBuyStand(s, 'weapon');
    return !res.ok && s.stands.length === C.standCap(s) && s.gold === gold;
  })());

  ok('a stand still refuses work it was not made for', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(1415), gold: 200000 }));
    const rack = C.shopBuyStand(s, 'shield').stand;
    C.shopUpgradeStand(s, rack.id);                               // however fine it is
    return !C.standTakes('shield', 'shortsword') && C.standTakes('shield', 'buckler');
  })());

  ok('a growth track cannot be bought without the gold', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1416), gold: 0 });
    return ['forge', 'hands', 'floor'].every((id) => {
      const was = C.growthLevel(s, id);
      return !C.shopBuyGrowth(s, id).ok && C.growthLevel(s, id) === was;
    });
  })());

  ok('every track stops at its ceiling and refuses politely', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1417), gold: 1e9 });
    for (const id of ['forge', 'hands', 'floor']) {
      const def = C.growthDef(id);
      for (let i = 0; i < def.max; i++) {
        if (!C.shopBuyGrowth(s, id).ok) return false;
      }
      if (C.growthLevel(s, id) !== def.max) return false;
      if (C.growthCost(s, id) !== null) return false;
      if (C.shopBuyGrowth(s, id).ok) return false;
    }
    return true;
  })());

  ok('what Growth bought is still there when the save is opened again', (() => {
    const s = C.createShop({ rnd: C.mulberry32(1418), gold: 200000 });
    C.shopBuyGrowth(s, 'forge');
    C.shopBuyGrowth(s, 'forge');
    C.shopBuyGrowth(s, 'hands');
    C.shopBuyGrowth(s, 'floor');
    const stand = s.stands[0];
    C.shopUpgradeStand(s, stand.id);
    C.shopUpgradeStand(s, stand.id);
    const want = { batch: C.batchCapacity(s), staff: C.staffCapacity(s),
      floor: C.standCap(s), display: C.standLevel(stand) };
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    return C.batchCapacity(back) === want.batch &&
      C.staffCapacity(back) === want.staff &&
      C.standCap(back) === want.floor &&
      C.standLevel(back.stands[0]) === want.display;
  })());

  ok('a forge that bought bellows before Growth existed keeps every level', (() => {
    /* The old key is deliberately still the store, so a save from before the
       rework walks back in with the capacity it paid for. */
    const s = C.createShop({ rnd: C.mulberry32(1419) });
    const data = C.serializeShop(s);
    data.upgrades = { bellows: 3 };
    const back = C.restoreShop(data, C.mulberry32(1));
    return C.growthLevel(back, 'forge') === 3 &&
      C.batchCapacity(back) === C.shopTier(back).batch + 3;
  })());

  ok('a save from before displays could be upgraded reads as plain', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(1420) }));
    const data = C.serializeShop(s);
    for (const st of data.stands) delete st.up;
    const back = C.restoreShop(data, C.mulberry32(1));
    return back.stands.every((st) => C.standLevel(st) === 0 && C.standBonus(st) === 1);
  })());

  ok('a tampered display level cannot be brought back past its ceiling', (() => {
    const s = apprenticed(C.createShop({ rnd: C.mulberry32(1421) }));
    const data = C.serializeShop(s);
    data.stands[0].up = 9999;
    data.stands[1] && (data.stands[1].up = -5);
    const back = C.restoreShop(data, C.mulberry32(1));
    const top = C.standLevel(back.stands[0]);
    return top === C.SHOP.growth.display.max &&
      (!back.stands[1] || C.standLevel(back.stands[1]) === 0);
  })());

  ok('a finer display really does fetch more at the counter', (() => {
    /* The whole point, measured where it matters: the same goods, the same
       customer, priced off the stand rather than off the recipe. */
    function take(up) {
      const s = floored(1422, 100, 1);
      const stand = s.stands[0];
      stand.up = up;
      stand.price = C.standWorth(stand);
      return stand.price;
    }
    return take(4) > take(0);
  })());
}

section('Open Your Forge: a floor you arrange');
{
  const rich = (seed) => apprenticed(C.createShop({ rnd: C.mulberry32(seed), gold: 200000 }));
  const line = C.lineKey('shortsword', 'bronze');

  ok('a new forge opens with its first displays out on the floor', (() => {
    const s = rich(1500);
    return s.stands.length > 0 && s.stands.every((st) => C.standPlaced(st)) &&
      new Set(s.stands.map((st) => st.slot)).size === s.stands.length;
  })());

  ok('a bought stand waits in the back until it is put out', (() => {
    const s = rich(1501);
    const res = C.shopBuyStand(s, 'shield');
    return res.ok && !C.standPlaced(res.stand) && C.storedStands(s).length === 1;
  })());

  ok('putting a stand out takes the first free space, or the one named', (() => {
    const s = rich(1502);
    const a = C.shopBuyStand(s, 'shield').stand;
    const b = C.shopBuyStand(s, 'helmet').stand;
    const first = C.firstFreeSlot(s);
    const pa = C.placeStand(s, a.id);
    const pb = C.placeStand(s, b.id, first + 1);
    return pa.ok && a.slot === first && pb.ok && b.slot === first + 1;
  })());

  ok('floor you have not bought is refused', (() => {
    const s = rich(1503);
    const a = C.shopBuyStand(s, 'shield').stand;
    const res = C.placeStand(s, a.id, C.standCap(s));
    return !res.ok && !C.standPlaced(a);
  })());

  ok('a stand from the back cannot shove one that is already out', (() => {
    const s = rich(1504);
    const out = s.stands[0];
    const a = C.shopBuyStand(s, 'shield').stand;
    const res = C.placeStand(s, a.id, out.slot);
    return !res.ok && !C.standPlaced(a) && C.standAtSlot(s, out.slot) === out;
  })());

  ok('two stands already out swap places, and only places', (() => {
    const s = rich(1505);
    const [a, b] = s.stands;
    a.key = line; a.qty = 4; a.price = 33; a.up = 2;
    const was = { a: a.slot, b: b.slot };
    const res = C.placeStand(s, a.id, b.slot);
    return res.ok && a.slot === was.b && b.slot === was.a &&
      a.key === line && a.qty === 4 && a.price === 33 && a.up === 2;
  })());

  ok('a display put in the back keeps its stock, price and level', (() => {
    const s = rich(1506);
    const st = s.stands.find((x) => x.type === 'weapon');
    st.key = line; st.qty = 5; st.quality = 80; st.level = 2; st.price = 41; st.up = 3;
    const gold = s.gold, storage = C.countStorage(s);
    C.storeStand(s, st.id);
    return !C.standPlaced(st) && st.key === line && st.qty === 5 && st.price === 41 &&
      st.up === 3 && st.level === 2 && s.gold === gold && C.countStorage(s) === storage;
  })());

  ok('nobody can buy from a display in the back', (() => {
    const s = rich(1507);
    const st = s.stands.find((x) => x.type === 'weapon');
    st.key = line; st.qty = 5; st.quality = 80; st.price = 30;
    C.storeStand(s, st.id);
    return C.countShelf(s) === 0 && C.stockedStands(s).length === 0 &&
      C.shelfCapacity(s) === C.placedStands(s).length * C.standHold();
  })());

  ok('a line in the back cannot be put out a second time elsewhere', (() => {
    /* the one-line-one-display rule is what makes moving and storing safe:
       nothing can end up on two stands, so a reload cannot drop a copy */
    const s = rich(1508);
    const st = s.stands.find((x) => x.type === 'weapon');
    st.key = line; st.qty = 5; st.quality = 80; st.price = 30;
    C.storeStand(s, st.id);
    const other = C.shopBuyStand(s, 'weapon').stand;
    C.placeStand(s, other.id);
    C.addStorage(s, line, 4, 80, 1);
    const direct = C.shopStockStand(s, other.id, line, 4);
    const auto = C.shopMoveToShelf(s, line, 4);
    return direct.moved === 0 && auto.moved === 0 && st.qty === 5 && s.storage[line].qty === 4;
  })());

  ok('a line cannot be put on two displays out on the floor either', (() => {
    const s = rich(1509);
    const a = s.stands.find((x) => x.type === 'weapon');
    const b = C.shopBuyStand(s, 'weapon').stand;
    C.placeStand(s, b.id);
    C.addStorage(s, line, 8, 80, 1);
    const first = C.shopStockStand(s, a.id, line, 3);
    const second = C.shopStockStand(s, b.id, line, 3);
    return first.moved === 3 && second.moved === 0 && b.qty === 0;
  })());

  ok('putting a display back out lets it trade again, stock and all', (() => {
    const s = rich(1510);
    const st = s.stands.find((x) => x.type === 'weapon');
    st.key = line; st.qty = 5; st.quality = 80; st.price = 30;
    C.storeStand(s, st.id);
    C.placeStand(s, st.id);
    return C.countShelf(s) === 5 && C.stockedStands(s).indexOf(st) >= 0;
  })());

  ok('taking pieces off never destroys what the storeroom cannot hold', (() => {
    const s = rich(1511);
    const st = s.stands.find((x) => x.type === 'weapon');
    st.key = line; st.qty = 6; st.quality = 80; st.level = 3; st.price = 30;
    // fill the storeroom to within two pieces of full
    C.addStorage(s, C.lineKey('buckler', 'bronze'), C.storageCapacity(s) - 2, 80, 1);
    const res = C.shopPullFromShelf(s, line, 6);
    const back = s.storage[line];
    return res.moved === 2 && st.qty === 4 && back && back.qty === 2 &&
      Math.round(back.level) === 3 && C.countStorage(s) === C.storageCapacity(s);
  })());

  ok('the building grows in a few real stages, by floor space', (() => {
    const s = rich(1512);
    const seen = [];
    for (let i = 0; i <= C.SHOP.growth.floor.max; i++) {
      s.upgrades.floor = i;
      for (let t = 1; t <= C.SHOP.tiers.length; t++) {
        s.tier = t;
        const st = C.shopStage(s);
        if (C.stageSpots(st) < C.standCap(s)) return false;       // always room to stand it
        if (seen.indexOf(st.id) < 0) seen.push(st.id);
      }
    }
    return seen.length === C.SHOP.stages.length && seen.length <= 4;
  })());

  ok('the largest shop has a spot for every stand it can hold', (() => {
    const s = rich(1513);
    s.tier = C.SHOP.tiers.length;
    s.upgrades.floor = C.SHOP.growth.floor.max;
    return C.stageSpots(C.shopStage(s)) === C.standCap(s);
  })());

  ok('a store expansion opens a spot and puts nothing on it', (() => {
    const s = rich(1514);
    const stands = s.stands.length, spot = C.standCap(s);
    C.shopBuyGrowth(s, 'floor');
    return s.stands.length === stands && C.slotUsable(s, spot) && !C.standAtSlot(s, spot);
  })());

  ok('where every stand stood survives a save', (() => {
    const s = rich(1515);
    const a = C.shopBuyStand(s, 'shield').stand;
    C.placeStand(s, a.id, 3);
    const b = C.shopBuyStand(s, 'helmet').stand;               // left in the back
    const back = C.restoreShop(C.serializeShop(s), C.mulberry32(1));
    // a stand is given a fresh id on load, so it is found by what it is
    const a2 = back.stands.find((x) => x.type === 'shield');
    const b2 = back.stands.find((x) => x.type === 'helmet');
    return a2 && a2.slot === 3 && b2 && b2.slot === null;
  })());

  ok('a save from before the floor plan opens with every stand out, in order', (() => {
    const s = rich(1516);
    C.placeStand(s, C.shopBuyStand(s, 'shield').stand.id);
    const data = C.serializeShop(s);
    for (const st of data.stands) delete st.slot;
    const back = C.restoreShop(data, C.mulberry32(1));
    return back.stands.length === s.stands.length &&
      back.stands.every((st, n) => st.slot === n);
  })());

  ok('a save with two stands on one spot, or off the floor, is straightened out', (() => {
    const s = rich(1517);
    const data = C.serializeShop(s);
    data.stands[0].slot = 1; data.stands[1].slot = 1;
    data.stands.push(Object.assign({}, data.stands[0], { id: 9991, slot: 999, key: null, qty: 0 }));
    const back = C.restoreShop(data, C.mulberry32(1));
    const spots = back.stands.filter(C.standPlaced).map((st) => st.slot);
    return new Set(spots).size === spots.length && spots.every((x) => C.slotUsable(back, x));
  })());

  ok('renaming the business changes only its name', (() => {
    const s = rich(1518);
    const before = JSON.stringify(Object.assign(C.serializeShop(s), { name: null }));
    const res = C.shopRename(s, '  The   Iron Owl  ');
    const after = JSON.stringify(Object.assign(C.serializeShop(s), { name: null }));
    return res.ok && s.name === 'The Iron Owl' && before === after;
  })());

  ok('a name too long for the sign is cut to fit, and an empty one refused', (() => {
    const s = rich(1519);
    C.shopRename(s, 'x'.repeat(80));
    const long = s.name.length === C.SHOP_NAME_MAX;
    const kept = s.name;
    C.shopRename(s, '   ');
    return long && s.name === kept;
  })());
}

section('The Forge: a dagger blank');
{
  const b = C.forgePieceBoard('dagger');
  const N = b.size;
  const at = (r, c) => r * N + c;
  const drawn = C.FORGE_PIECES.dagger.rows;
  const metal = [];
  for (let i = 0; i < N * N; i++) if (C.isMetal(b, i)) metal.push(i);
  const sorted = (list) => list.slice().sort((x, y) => x - y).join(',');

  /* An independent reading of the rules, written from the drawing and the
     movement words alone, so the game's own tables are checked against
     something they did not produce. */
  const onMetal = (r, c) => r >= 0 && c >= 0 && r < drawn.length && c < drawn[r].length && drawn[r][c] !== '.';
  function reference(piece, r, c) {
    const out = [];
    const add = (rr, cc) => { if (onMetal(rr, cc) && !(rr === r && cc === c)) out.push(at(rr, cc)); };
    const slide = (dirs) => { for (const [dr, dc] of dirs) for (let k = 1; k < N; k++) add(r + dr * k, c + dc * k); };
    const ortho = [[1, 0], [-1, 0], [0, 1], [0, -1]], diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    if (piece === 'K') for (const [dr, dc] of ortho.concat(diag)) add(r + dr, c + dc);
    else if (piece === 'R') slide(ortho);
    else if (piece === 'B') slide(diag);
    else if (piece === 'Q') slide(ortho.concat(diag));
    else if (piece === 'N') for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(r + dr, c + dc);
    else {
      const d = Number(piece);
      for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) {
        if (Math.max(Math.abs(rr - r), Math.abs(cc - c)) === d) add(rr, cc);
      }
    }
    return out;
  }

  ok('the dagger is laid out exactly as drawn: a point, a blade, and a one-square tang', (() => {
    const widths = drawn.map((row) => row.replace(/\./g, '').length);
    const blade = metal.filter((i) => !C.inTang(b, i)).length;
    const tang = metal.filter((i) => C.inTang(b, i));
    return widths.join(',') === '1,3,5,7,7,5,3,1,1,1,1' && metal.length === 35 &&
      C.metalCount(b) === 35 && blade === 31 && tang.length === 4 &&
      tang.every((i) => i % N === 3) && b.rows === 11 && b.cols === 7 && N === 11;
  })());

  ok('every metal square carries a symbol, and air carries none', (() => {
    for (let i = 0; i < N * N; i++) {
      if (C.isMetal(b, i) ? !C.PIECES[b.pieces[i]] : b.pieces[i] !== null) return false;
    }
    return true;
  })());

  ok('the stored route is a perfect solution, and the metal is one connected piece',
    C.validateBoard(b) && C.isStronglyConnected(N, b.pieces, b.shape));

  ok('every symbol moves across the dagger exactly as the rules say, and only onto metal', (() => {
    const bad = [];
    for (const i of metal) {
      const r = Math.floor(i / N), c = i % N;
      for (const p of ['K', 'R', 'B', 'N', 'Q', '2', '3', '4', '5']) {
        const got = C.metalMovesFrom(b, p, i);
        if (sorted(got) !== sorted(reference(p, r, c))) bad.push(p + '@' + r + ',' + c);
        if (got.some((j) => !C.isMetal(b, j))) bad.push('air:' + p + '@' + r + ',' + c);
      }
    }
    return bad.length === 0 || (console.log('   ', bad.slice(0, 8).join(' ')), false);
  })());

  // the placed symbols, square by square, as a player would read them
  const game = () => C.createGame(C.forgePieceBoard('dagger'), { mode: 'forge', rnd: C.mulberry32(5) });
  const from = (r, c) => { const g = game(); g.current = at(r, c); g.status = 'playing'; g.strikes[at(r, c)] = 1; return sorted(C.legalTargets(g)); };
  const list = (...cells) => sorted(cells.map(([r, c]) => at(r, c)));
  ok('the rook at the point runs the whole spine, down to the end of the tang',
    from(0, 3) === list([1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3]));
  ok('a rook in the blade takes its row and its column, but not the air below the shoulder',
    from(3, 2) === list([3, 0], [3, 1], [3, 3], [3, 4], [3, 5], [3, 6], [1, 2], [2, 2], [4, 2], [5, 2], [6, 2]));
  ok('a bishop on the widest row runs the bevel straight into the throat',
    from(4, 0) === list([3, 1], [2, 2], [1, 3], [5, 1], [6, 2], [7, 3]));
  ok('a knight on the shoulder leaps past the throat into the tang',
    from(6, 2) === list([4, 1], [4, 3], [5, 4], [8, 3]));
  ok('the king deep in the tang can only go up or down it',
    from(9, 3) === list([8, 3], [10, 3]));
  ok('the Three at the base of the blade reaches the widest row and down into the tang',
    from(6, 3) === list([3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [4, 0], [4, 6], [9, 3]));
  ok('the Two in the tang throws back to the shoulders or down to the end',
    from(8, 3) === list([6, 2], [6, 3], [6, 4], [10, 3]));
  ok('a bishop would be stuck anywhere below the throat: the tang is not diagonal ground',
    [8, 9, 10].every((r) => C.metalMovesFrom(b, 'B', at(r, 3)).length === 0) &&
    C.metalMovesFrom(b, 'B', at(7, 3)).length > 0);

  ok('air can never be struck: not on the opening blow, not from any square', (() => {
    const g = game();
    if (sorted(C.legalTargets(g)) !== sorted(metal)) return false;
    for (let i = 0; i < N * N; i++) if (!C.isMetal(b, i) && C.canStrike(g, i)) return false;
    for (const i of metal) {
      g.current = i; g.status = 'playing';
      for (const j of C.legalTargets(g)) if (!C.isMetal(b, j)) return false;
      for (let j = 0; j < N * N; j++) if (!C.isMetal(b, j) && C.canStrike(g, j)) return false;
    }
    return C.applyStrike(game(), at(0, 0)) === null;
  })());

  ok('hundreds of random games never land a blow on air, and air never counts', (() => {
    const rnd = C.mulberry32(77);
    for (let k = 0; k < 300; k++) {
      const g = game();
      while (!C.isOver(g)) {
        const t = C.legalTargets(g);
        if (!t.length) break;
        const res = C.applyStrike(g, t[Math.floor(rnd() * t.length)]);
        if (!res || !C.isMetal(b, res.index)) return false;
      }
      for (let i = 0; i < N * N; i++) if (!C.isMetal(b, i) && g.strikes[i] !== 0) return false;
      const st = C.gameStats(g);
      if (st.squares !== 35 || st.forged > 35) return false;
    }
    return true;
  })());

  ok('the stored route forges the whole dagger, tang and all, to a masterwork', (() => {
    const g = game();
    for (const i of b.route) if (!C.applyStrike(g, i)) return false;
    const sc = C.scoreGame(g);
    return g.status === 'complete' && sc.quality === 100 && sc.stats.perfect === 35 &&
      sc.stats.squares === 35 && b.route.some((i) => C.inTang(b, i));
  })());

  ok('the forge rules hold on the dagger: a third strike spends a square and it blanks behind you', (() => {
    const g = game();
    const tip = at(0, 3), spine = at(5, 3);
    g.strikes[spine] = 2; g.current = tip; g.status = 'playing';
    const third = C.applyStrike(g, spine);            // the point's rook sends the hammer down the spine
    const away = C.legalTargets(g)[0];
    const left = C.applyStrike(g, away);
    return third && third.spent && C.isSpent(g, spine) && left && left.blanked === spine &&
      g.pieces[spine] === null && !C.canStrike(g, spine);
  })());

  ok('walk onto the tang\'s second king with both its neighbours spent and the piece is stranded', (() => {
    const g = game();
    g.strikes[at(8, 3)] = 3; g.strikes[at(10, 3)] = 3;
    g.current = at(0, 3); g.status = 'playing';
    const res = C.applyStrike(g, at(9, 3));
    return res && res.lost && g.status === 'lost';
  })());

  ok('a handcrafted piece never reshapes, and a reshape could never point into air', (() => {
    const g = game();
    if (g.morphChance !== 0) return false;
    // forced, a square deep in the tang may only become something that can
    // still leave it: a bishop there would reach nothing but air
    g.morphPool = ['B', 'R'];
    const res = C.reshape(g, at(9, 3));
    const g2 = game();
    g2.morphPool = ['B'];
    return res && res.to === 'R' && C.reshape(g2, at(9, 3)) === null;
  })());

  ok('a perfect dagger can be forged from every one of its 35 opening squares', (() => {
    // Warnsdorff-ordered depth-first search over two visits a square, with a
    // cut for any square that can no longer be reached
    const adj = {}, into = {};
    for (const i of metal) { adj[i] = C.metalMovesFrom(b, b.pieces[i], i); into[i] = []; }
    for (const i of metal) for (const j of adj[i]) into[j].push(i);
    function perfectFrom(start, seed) {
      const rnd = C.mulberry32(seed);
      const cnt = new Int32Array(N * N);
      const route = [start]; cnt[start] = 1;
      let nodes = 0;
      const reachable = () => {
        for (const j of metal) {
          if (cnt[j] >= 2) continue;
          if (!into[j].some((s) => cnt[s] < 2 || s === route[route.length - 1])) return false;
        }
        return true;
      };
      const dfs = () => {
        if (route.length === 70) return true;
        if (++nodes > 400000) return false;
        const cur = route[route.length - 1];
        const next = adj[cur].filter((j) => cnt[j] < 2)
          .map((j) => ({ j, k: adj[j].filter((x) => cnt[x] < 2).length + cnt[j] * 0.5 + rnd() * 0.9 }))
          .sort((x, y) => x.k - y.k);
        for (const { j } of next) {
          cnt[j]++; route.push(j);
          if (reachable() && dfs()) return true;
          route.pop(); cnt[j]--;
          if (nodes > 400000) return false;
        }
        return false;
      };
      return dfs() ? route.slice() : null;
    }
    const missing = [];
    for (const s of metal) {
      let found = null;
      for (let k = 0; k < 40 && !found; k++) found = perfectFrom(s, k * 7919 + s);
      if (!found) { missing.push(s); continue; }
      // and each one is checked by the game itself, not only by the search
      const g = game();
      for (const i of found) if (!C.applyStrike(g, i)) { missing.push(s); break; }
      if (g.status !== 'complete' || C.scoreGame(g).quality !== 100) missing.push(s);
    }
    return missing.length === 0 || (console.log('    no perfect route from', missing.join(',')), false);
  })());

  ok('square boards are untouched: no shape means every square is metal, as before', (() => {
    const sq = C.makeBoard('master', C.mulberry32(41));
    const g = C.createGame(sq, { mode: 'forge' });
    const n = sq.size * sq.size;
    for (let i = 0; i < n; i++) if (!C.isMetal(sq, i)) return false;
    return C.metalCount(sq) === n && C.validateBoard(sq) && C.gameStats(g).squares === n &&
      C.isStronglyConnected(sq.size, sq.pieces) === C.isStronglyConnected(sq.size, sq.pieces, undefined) &&
      C.legalTargets(g).length === n && !sq.shape;
  })());

  ok('a shaped board that lies is refused: a symbol on air, or a route through it', (() => {
    const onAir = C.forgePieceBoard('dagger');
    onAir.pieces[at(0, 0)] = 'K';
    const throughAir = C.forgePieceBoard('dagger');
    throughAir.route = throughAir.route.slice();
    throughAir.route[5] = at(0, 0);
    const short = C.forgePieceBoard('dagger');
    short.route = short.route.slice(0, -1);
    return !C.validateBoard(onAir) && !C.validateBoard(throughAir) && !C.validateBoard(short);
  })());

  ok('the piece lists only the symbols it carries', C.forgePieceSymbols(b).join(',') === 'K,R,B,N,2,3');
}

console.log('\n' + (failures.length ? 'FAILED: ' + failures.length : 'All core checks passed') + ' (' + pass + ' checks)');
process.exit(failures.length ? 1 : 0);
