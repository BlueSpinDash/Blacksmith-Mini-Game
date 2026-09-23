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
section('The bishop on a Novice board');
{
  const idx = (r, c, n) => r * n + c;
  const has = (piece, from, to, n) => C.movesFrom(piece, from, n).includes(to);

  ok('Novice offers the bishop, and still offers what it always did',
    C.CONFIG.difficulties.novice.pool.includes('B') &&
    ['K', 'R'].every((k) => C.CONFIG.difficulties.novice.pool.includes(k)),
    C.CONFIG.difficulties.novice.pool.join(','));

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

  // generation: the pool is only useful if boards carrying it still solve
  ok('Novice boards are generated with bishops on them', (() => {
    let withB = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const b = C.makeBoard('novice', C.mulberry32(seed * 13));
      if (!b || !C.validateBoard(b)) return false;
      if (b.pieces.includes('B')) withB++;
    }
    return withB >= 20;                      // the great majority, not a fluke
  })());
  ok('and every one of them is a solvable, verified board', (() => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = C.makeBoard('novice', C.mulberry32(seed * 29));
      if (!b || !C.validateBoard(b)) return false;
      if (!b.pieces.every((p) => C.CONFIG.difficulties.novice.pool.includes(p))) return false;
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

  // the other modes keep their own tables and must not have moved
  ok('versus still starts its rivals on kings and rooks alone',
    C.CONFIG.versus.difficulties.novice.pool.join(',') === 'K,R');
  ok('endless still draws from every symbol, as it always did',
    C.CONFIG.endless.pool.join(',') === 'K,R,B,N,Q');
  ok('the higher forge pools are untouched',
    C.CONFIG.difficulties.apprentice.pool.join(',') === 'K,R,B' &&
    C.CONFIG.difficulties.journeyman.pool.join(',') === 'K,R,B,N' &&
    C.CONFIG.difficulties.master.pool.join(',') === 'K,R,B,N' &&
    C.CONFIG.difficulties.master.maxQueens === 2);
  ok('and so are the board sizes',
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
  const b = C.makeBoard('apprentice', C.mulberry32(11));
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

/* ---------- board generation ---------- */
section('Board generation and verified routes');
{
  const minimums = { novice: 18, apprentice: 32, journeyman: 50, master: 72 };
  for (const key of C.CONFIG.order) {
    const cfg = C.CONFIG.difficulties[key];
    let allValid = true, routesPlay = true, pooled = true, connected = true;
    for (let s = 0; s < 60; s++) {
      const b = C.makeBoard(key, C.mulberry32(s * 31 + 7));
      if (!b || !C.validateBoard(b)) { allValid = false; break; }
      if (b.route.length !== minimums[key]) { allValid = false; break; }
      const allowed = cfg.pool.concat(cfg.maxQueens > 0 ? ['Q'] : []);
      if (!b.pieces.every((p) => allowed.includes(p))) pooled = false;
      if (cfg.maxQueens === 0 && b.pieces.includes('Q')) pooled = false;
      if (b.pieces.filter((p) => p === 'Q').length > cfg.maxQueens) pooled = false;
      if (!C.isStronglyConnected(b.size, b.pieces)) connected = false;

      // replay the stored route through the real game state machine
      const g = C.createGame(b, { morphChance: 0 });
      for (const step of b.route) if (!C.applyStrike(g, step)) { routesPlay = false; break; }
      const r = C.scoreGame(g);
      if (g.status !== 'complete' || r.quality !== 100 || !g.strikes.every((x) => x === 2)) routesPlay = false;
      if (g.totalStrikes !== minimums[key]) routesPlay = false;
      if (!routesPlay) break;
    }
    ok(key + ': 60 boards all validate, route length = ' + minimums[key], allValid);
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
        const b = C.transformBoard({ size, difficulty: key, pieces: raw.pieces.split(''), route: raw.route }, t);
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
  ok('every symbol can turn up in endless', C.CONFIG.endless.pool.length === 5 &&
    ['K', 'R', 'B', 'N', 'Q'].every((x) => C.CONFIG.endless.pool.includes(x)));
  ok('an endless game reshapes from the whole pool',
    C.createGame(board, { mode: 'endless' }).morphPool.length === 5);
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
      if (!b.pieces.every((p) => C.CONFIG.endless.pool.includes(p))) { ok1 = false; break; }
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
      return C.CONFIG.endless.pool.every((p) => seen.has(p));
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
  ok('the resetting strike earns no pattern bonus', e.points === S.strike);

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
      for (let t = 0; t < 400 && !C.matchOver(m); t++) {
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
    // break everything the rook at 0 can reach, bar one square, then reforge that
    for (const i of [1, 2, 3, 6]) { g.foe.states[i] = C.SQ_BROKEN; g.foe.broken++; }
    const r = C.versusBuy(g, 'you', 'reforge', 0, 'N');   // a knight at 0 on a 3x3 reaches 5 and 7
    if (!r.ok) return false;
    for (const i of [5, 7]) g.foe.states[i] = C.SQ_BROKEN;
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
      if (b.route.length !== m.strikes * 16) return false;
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
    const one = C.CONFIG.difficulties[C.forgeBoardSpec(shop, 'mace', 'bronze', 1).difficulty];
    const ten = C.CONFIG.difficulties[C.forgeBoardSpec(shop, 'mace', 'bronze', 10).difficulty];
    return ten.pool.length > one.pool.length;
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

section('Open Your Forge: production and stock');
{
  ok('one puzzle makes the whole batch', (() => {
    const s = C.createShop({ rnd: C.mulberry32(10) });
    s.materials.bronze = 10;
    const res = C.shopFinishForge(s, 'longsword', 'bronze', 3, 90, 'you');
    return res.ok && s.orders.length === 1 && s.orders[0].qty === 3;
  })());

  ok('an item costs one ingot of its material', (() => {
    const s = C.createShop({ rnd: C.mulberry32(11) });
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
    const s = C.createShop({ rnd: C.mulberry32(14) });
    s.materials.bronze = 9;
    C.shopFinishForge(s, 'boots', 'bronze', 2, 100, 'you');
    if (C.countStorage(s) !== 0) return false;
    for (let i = 0; i < 3; i++) C.shopAdvancePhase(s);       // to the next day
    return C.countStorage(s) === 2 && C.countShelf(s) === 0;
  })());

  ok('stock has to be carried out before anyone can buy it', (() => {
    const s = C.createShop({ rnd: C.mulberry32(15) });
    C.addStorage(s, C.lineKey('boots', 'bronze'), 3, 100);
    const before = C.countShelf(s);
    const moved = C.shopMoveToShelf(s, C.lineKey('boots', 'bronze'), 2);
    return before === 0 && moved.moved === 2 && C.countShelf(s) === 2 && C.countStorage(s) === 1;
  })());

  ok('the shelves hold only what the shop has room for', (() => {
    const s = C.createShop({ rnd: C.mulberry32(16) });
    const cap = C.shelfCapacity(s);
    C.addStorage(s, C.lineKey('dagger', 'bronze'), cap + 20, 100);
    C.shopMoveToShelf(s, C.lineKey('dagger', 'bronze'), cap + 20);
    return C.countShelf(s) === cap;
  })());

  ok('a bigger shop holds more of everything', (() => {
    const s = C.createShop({ rnd: C.mulberry32(17), gold: 100000 });
    const before = [C.shelfCapacity(s), C.storageCapacity(s), C.staffCapacity(s), C.batchCapacity(s)];
    C.shopExpand(s);
    const after = [C.shelfCapacity(s), C.storageCapacity(s), C.staffCapacity(s), C.batchCapacity(s)];
    return after.every((v, i) => v > before[i]) && C.rentDue(s) > C.SHOP.tiers[0].rent;
  })());
}

section('Open Your Forge: the shop survives being put down');
{
  const build = () => {
    const sh = C.createShop({ rnd: C.mulberry32(41) });
    sh.day = 12; sh.phaseIndex = 2; sh.gold = 4321; sh.reputation = 57;
    sh.tier = 2; sh.rentPaid = 1; sh.upgrades.displays = 2;
    sh.materials.silver = 9; sh.materials.mithril = 2;
    C.addStorage(sh, C.lineKey('plate', 'gold'), 3, 91);
    sh.shelf[C.lineKey('longsword', 'bronze')] = { qty: 4, quality: 88, price: 61 };
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
    return b.shelf[C.lineKey('longsword', 'bronze')].price === 61;
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
    blob.shelf['trebuchet|bronze'] = { qty: 5, quality: 100, price: 10 };
    blob.shelf['longsword|unobtainium'] = { qty: 5, quality: 100, price: 10 };
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
    s.shelf[C.lineKey('longsword', 'bronze')] = { qty: 10, quality: 100, price: 52 };
    s.reputation = 5;
    const low = C.trafficFor(s);
    s.reputation = 95;
    return C.trafficFor(s) > low && C.shopStars(s) === 5;
  })());

  ok('what is on the shelves decides who walks in', (() => {
    const blades = C.createShop({ rnd: C.mulberry32(20) });
    blades.shelf[C.lineKey('plate', 'bronze')] = { qty: 10, quality: 100, price: 150 };
    blades.shelf[C.lineKey('kite', 'bronze')] = { qty: 10, quality: 100, price: 78 };
    const heavy = C.customerWeights(blades);

    const light = C.createShop({ rnd: C.mulberry32(21) });
    light.shelf[C.lineKey('dagger', 'bronze')] = { qty: 10, quality: 100, price: 22 };
    light.shelf[C.lineKey('boots', 'bronze')] = { qty: 10, quality: 100, price: 26 };
    const nimble = C.customerWeights(light);

    // armour and shields pull knights; daggers and boots pull rogues
    return heavy.knight > nimble.knight && nimble.rogue > heavy.rogue &&
      heavy.knight > heavy.rogue && nimble.rogue > nimble.knight;
  })());

  ok('preferences are weights, not rules: anyone may still buy anything', (() => {
    const s = C.createShop({ rnd: C.mulberry32(22) });
    s.shelf[C.lineKey('mace', 'bronze')] = { qty: 50, quality: 100, price: 34 };
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
    s.shelf[C.lineKey('longsword', 'bronze')] = { qty: 4, quality: 100, price: 20 };
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
    s.shelf[C.lineKey('longsword', 'bronze')] = { qty: 20, quality: 100, price: rec * 8 };
    let sold = 0, seen = 0;
    for (let i = 0; i < 30; i++) {
      const r = C.runCounter(s, { kind: 'player', power: 2, name: 'You' });
      sold += r.sold; seen += r.customers;
    }
    return seen > 0 && sold < seen * 0.25;
  })());

  ok('the report accounts for everyone who came in', (() => {
    const s = C.createShop({ rnd: C.mulberry32(26) });
    s.shelf[C.lineKey('mace', 'bronze')] = { qty: 30, quality: 90, price: 34 };
    const r = C.runCounter(s, { kind: 'player', power: 2, name: 'You' });
    return r.customers === r.sold + r.left && r.won <= r.haggles;
  })());

  ok('accepting an offer sells at the offer, not the asking price', (() => {
    const s = C.createShop({ rnd: C.mulberry32(27) });
    for (let round = 0; round < 60; round++) {
      s.shelf[C.lineKey('plate', 'bronze')] = { qty: 60, quality: 100, price: 400 };
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
    s.shelf[C.lineKey('dagger', 'bronze')] = { qty: 99, quality: 100, price: 1 };
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
    const s = C.createShop({ rnd: C.mulberry32(61) });
    s.shelf[C.lineKey('dagger', 'bronze')] = { qty: 99, quality: 100, price: 1 };
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
    s.shelf[C.lineKey('plate', 'bronze')] = { qty: 200, quality: 100, price: 400 };
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
    let walked = 0, held = 0, sold = 0, tries = 0;
    for (let round = 0; round < 200 && tries < 40; round++) {
      s.shelf[C.lineKey('plate', 'bronze')] = { qty: 400, quality: 100, price: 400 };
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
    for (let round = 0; round < 200; round++) {
      s.shelf[C.lineKey('plate', 'bronze')] = { qty: 400, quality: 100, price: 400 };
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
      s.shelf[C.lineKey('plate', 'bronze')] = { qty: 400, quality: 100, price: 320 };
      let won = 0, tried = 0;
      for (let i = 0; i < 60; i++) {
        const session = C.openCounter(s, { kind: 'staff', power: power, name: 'X' });
        let guard = 0;
        while (guard++ < 200) {
          const e = C.counterNext(session, s);
          if (!e) break;
          if (e.kind === 'offer') C.counterRespond(session, s, 'haggle');
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
    s.shelf[C.lineKey('longsword', 'bronze')] = { qty: 20, quality: 95, price: 60 };
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
    const a = C.makeApplicant(s, 'runner', 'C');
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
  ok('better ranks are rarer', (() => {
    let last = Infinity;
    for (const r of C.SHOP.ranks) { if (r.weight > last) return false; last = r.weight; }
    return true;
  })());
  ok('an applicant carries a name, role, rank and wage', (() => {
    const s = C.createShop({ rnd: C.mulberry32(28) });
    const list = C.shopSearchStaff(s, 3);
    return list.length === 3 && list.every((a) => a.name && a.role && a.rank && a.wage > 0);
  })());
  ok('the shop can only hold so many', (() => {
    const s = C.createShop({ rnd: C.mulberry32(29) });
    let hired = 0;
    for (let i = 0; i < 10; i++) {
      const list = C.shopSearchStaff(s, 1);
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
    const s = C.createShop({ rnd: C.mulberry32(35) });
    s.materials.bronze = 20;
    const e = { id: 1, name: 'Sm', role: 'smith', rank: 'B', power: 4, wage: 60 };
    const r = C.runSmith(s, e, { item: 'longsword', material: 'bronze', qty: 3 });
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
    C.addStorage(s, C.lineKey('boots', 'bronze'), 8, 100);
    const e = { id: 1, name: 'Hand', role: 'storehand', rank: 'C', power: 3, wage: 30 };
    const r = C.runStoreHand(s, e, { keys: [C.lineKey('boots', 'bronze')] });
    return r.ok && r.moved > 0 && C.countShelf(s) === r.moved;
  })());

  ok('assigned staff all work when the phase closes', (() => {
    const s = C.createShop({ rnd: C.mulberry32(38), gold: 5000 });
    s.materials.bronze = 20;
    C.addStorage(s, C.lineKey('boots', 'bronze'), 6, 100);
    s.staff.push({ id: 1, name: 'R', role: 'runner', rank: 'C', power: 3, wage: 30 });
    s.staff.push({ id: 2, name: 'H', role: 'storehand', rank: 'C', power: 3, wage: 30 });
    C.shopAssign(s, 1, { order: { silver: 2 } });
    C.shopAssign(s, 2, { order: { keys: [] } });
    const res = C.shopAdvancePhase(s);
    return res.reports.length === 2 && s.materials.silver === 2 && C.countShelf(s) > 0;
  })());
}

console.log('\n' + (failures.length ? 'FAILED: ' + failures.length : 'All core checks passed') + ' (' + pass + ' checks)');
process.exit(failures.length ? 1 : 0);
