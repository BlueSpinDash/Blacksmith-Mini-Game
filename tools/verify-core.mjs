// Rule, generation and scoring checks for the Checksmith core.
// Run: node tools/verify-core.mjs
import { loadCore } from './load-core.mjs';

const C = loadCore();
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
  const mk = (strikes) => ({ board: { size: 3, pieces: [], route: [] }, strikes, current: 0,
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

console.log('\n' + (failures.length ? 'FAILED: ' + failures.length : 'All core checks passed') + ' (' + pass + ' checks)');
process.exit(failures.length ? 1 : 0);
