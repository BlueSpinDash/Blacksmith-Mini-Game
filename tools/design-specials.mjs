// Designs the symbol layout and a perfect route for a Special Commission
// silhouette, using the game's own movement tables and validation.
//
//   node tools/design-specials.mjs <id> [seeds] [--json]
//
// A silhouette is drawn below with '#' for metal and '.' for air. The search
// is route-first, like the board generator: it walks the metal, visiting
// every square exactly as many times as the commission's metal needs blows,
// and narrows each square's possible symbols to the ones that legalise every
// move made out of it. A layout is only kept if the game's own validateBoard
// accepts it (route, counts, legal moves, every square reachable from every
// other). Each candidate is then played by simple simulated smiths - one who
// avoids squares already at their count, picking at random among the rest -
// so the layout that goes into the game is chosen knowing roughly how often
// such a player gets it perfect.
//
// The chosen layout and route are copied into SHOP.specials in index.html by
// hand; the test suite re-validates them from there. This tool is only for
// authoring.
import { loadCore } from './load-core.mjs';

const C = await loadCore();

export const SILHOUETTES = {
  embercleaver: { visits: 1, rows: [
    '...#####',
    '...####.',
    '########',
    '...#####',
    '....####'
  ] },
  deepvein: { visits: 1, rows: [
    '...###...',
    '#########',
    '##.###..#',
    '#...#....',
    '....#....',
    '....#....',
    '....#....',
    '....#....'
  ] },
  harvestmoon: { visits: 2, rows: [
    '..#####.',
    '.##...##',
    '##.....#',
    '##......',
    '###.....',
    '.###....',
    '..##....',
    '..#.....',
    '..#.....'
  ] },
  thornwatch: { visits: 2, rows: [
    '...#...',
    '..###..',
    '.#####.',
    '..###..',
    '#..#..#',
    '#######',
    '...#...',
    '..###..',
    '..###..'
  ] },
  gatewarden: { visits: 3, rows: [
    '##.##',
    '#####',
    '#.#.#',
    '#####',
    '#.#.#',
    '#####',
    '.###.',
    '..#..'
  ] },
  whisperfang: { visits: 3, rows: [
    '....#.',
    '...##.',
    '..##..',
    '.###..',
    '.###.#',
    '######',
    '..#...',
    '..#...',
    '.###..'
  ] },
  vowkeeper: { visits: 4, rows: [
    '...#...',
    '..###..',
    '..#.#..',
    '..#.#..',
    '..###..',
    '#######',
    '#..#..#',
    '...#...',
    '...#...'
  ] },
  aegis: { visits: 5, rows: [
    '##...##',
    '##.#.##',
    '.#####.',
    '..###..',
    '.#####.'
  ] }
};

const POOL = ['K', 'R', 'B', 'N', '2', '3'];

function layout(rows) {
  const h = rows.length;
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  const size = Math.max(h, w);
  const shape = new Array(size * size).fill(0);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') shape[r * size + c] = 1;
  }
  return { size, shape, h, w };
}

function mulberry(seed) { return C.mulberry32(seed >>> 0); }

/* One route search. Every metal square is owed `visits` arrivals; a move is
   open when some symbol still possible on the square being left allows it. */
function searchRoute(L, visits, rnd, budget) {
  const { size, shape } = L;
  const n = size * size, T = C.tableFor(size);
  const need = new Int32Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) { need[i] = shape[i] ? visits : 0; total += need[i]; }
  const counts = new Int32Array(n);
  const opts = new Array(n);
  const want = new Array(n);
  for (let i = 0; i < n; i++) {
    opts[i] = POOL.slice();
    want[i] = POOL[Math.floor(rnd() * POOL.length)];
  }
  const metal = [];
  for (let i = 0; i < n; i++) if (shape[i]) metal.push(i);
  const route = new Array(total);
  route[0] = metal[Math.floor(rnd() * metal.length)];
  counts[route[0]] = 1;
  let nodes = 0;

  // how many open targets a square would still have, for the dead-end look-ahead
  const onward = (t) => {
    let k = 0;
    for (const u of metal) {
      if (u === t || counts[u] >= need[u]) continue;
      for (const p of opts[t]) if (T[p].mask[t][u]) { k++; break; }
    }
    return k;
  };

  function candidates(cur) {
    const res = [];
    for (const t of metal) {
      if (t === cur || counts[t] >= need[t]) continue;
      let ok = null, keepsWish = false;
      for (const p of opts[cur]) {
        if (T[p].mask[cur][t]) { (ok || (ok = [])).push(p); if (p === want[cur]) keepsWish = true; }
      }
      if (!ok) continue;
      const key = counts[t] * 100 + (keepsWish ? 0 : 4) + onward(t) * 0.9 - ok.length * 0.3 + rnd() * 3;
      res.push({ t, ok, key });
    }
    res.sort((a, b) => a.key - b.key);
    return res;
  }
  function dfs(depth) {
    if (depth === total) return true;
    if (++nodes > budget) return false;
    const cur = route[depth - 1];
    const saved = opts[cur];
    for (const c of candidates(cur)) {
      opts[cur] = c.ok;
      counts[c.t]++;
      route[depth] = c.t;
      if (dfs(depth + 1)) return true;
      counts[c.t]--;
      opts[cur] = saved;
      if (nodes > budget) break;
    }
    opts[cur] = saved;
    return false;
  }
  return dfs(1) ? route : null;
}

/* Pick a symbol per square from what the route allows, spreading the pool. */
function assign(L, route, rnd) {
  const { size, shape } = L;
  const opts = C.pieceOptionsFor(size, route, POOL.concat(['Q']));
  if (!opts) return null;
  const n = size * size;
  const pieces = new Array(n).fill(null);
  const use = {};
  const order = [];
  for (let i = 0; i < n; i++) if (shape[i]) order.push(i);
  // the most constrained squares choose first
  order.sort((a, b) => opts[a].length - opts[b].length || rnd() - 0.5);
  for (const i of order) {
    const all = opts[i];
    const choices = all.length > 1 ? all.filter((p) => p !== 'Q') : all;
    let best = null, score = Infinity;
    for (const p of choices) {
      const s = (use[p] || 0) + rnd() * 0.8;
      if (s < score) { score = s; best = p; }
    }
    pieces[i] = best;
    use[best] = (use[best] || 0) + 1;
  }
  return pieces;
}

/* Simulated smiths. `careful` never strikes a square already at its count
   when it has any other choice; `plain` picks among every legal move;
   `thoughtful` is careful and also looks one blow ahead, preferring a square
   it will not be stranded on - closer to a person planning the next move. */
function simulate(board, visits, trials, seed) {
  const rnd = mulberry(seed);
  const out = { careful: { complete: 0, perfect: 0 }, plain: { complete: 0, perfect: 0 },
    thoughtful: { complete: 0, perfect: 0 } };
  const T = C.tableFor(board.size);
  const onwards = (g, i) => {
    const p = g.pieces[i];
    if (!p) return 0;
    let k = 0;
    for (const j of T[p].list[i]) {
      if (j !== i && C.isMetal(board, j) && g.strikes[j] < visits) k++;
    }
    return k;
  };
  for (const kind of ['careful', 'plain', 'thoughtful']) {
    for (let k = 0; k < trials; k++) {
      const g = C.createGame(board, { mode: 'forge', rules: 'shop', perfect: visits, spent: visits + 1,
        rnd: rnd });
      while (g.status === 'ready' || g.status === 'playing') {
        const legal = C.legalTargets(g);
        if (!legal.length) break;
        let pool = legal;
        if (kind !== 'plain') {
          const fresh = legal.filter((i) => g.strikes[i] < visits);
          if (fresh.length) pool = fresh;
        }
        if (kind === 'thoughtful' && pool.length > 1) {
          // one blow ahead: unless this is the last blow owed, avoid a square
          // with nowhere still open to go on to
          let owed = 0;
          for (let j = 0; j < g.strikes.length; j++) {
            if (C.isMetal(board, j)) owed += Math.max(0, visits - g.strikes[j]);
          }
          if (owed > 1) {
            const left = pool.filter((i) => onwards(g, i) > 0);
            if (left.length) pool = left;
          }
        }
        C.applyStrike(g, pool[Math.floor(rnd() * pool.length)]);
      }
      if (g.status === 'complete') {
        out[kind].complete++;
        if (C.scoreGame(g).quality === 100) out[kind].perfect++;
      }
    }
  }
  return out;
}

export function design(id, seeds, opts) {
  const def = SILHOUETTES[id];
  if (!def) throw new Error('no silhouette ' + id);
  const L = layout(def.rows);
  const found = [];
  for (let s = 1; s <= seeds; s++) {
    const rnd = mulberry(s * 7919 + id.length * 104729);
    const route = searchRoute(L, def.visits, rnd, (opts && opts.budget) || 400000);
    if (!route) continue;
    for (let a = 0; a < 4; a++) {
      const pieces = assign(L, route, rnd);
      if (!pieces) continue;
      const board = { size: L.size, rows: L.h, cols: L.w, shape: L.shape, pieces, route: route.slice(),
        visits: def.visits, difficulty: null };
      if (!C.validateBoard(board, def.visits)) continue;
      const sim = simulate(board, def.visits, (opts && opts.trials) || 400, s * 31 + a);
      const rows = [];
      for (let r = 0; r < L.h; r++) {
        let line = '';
        for (let c = 0; c < L.w; c++) line += pieces[r * L.size + c] || '.';
        rows.push(line.replace(/\.+$/, (m) => m));
      }
      const tally = {};
      for (const p of pieces) if (p) tally[p] = (tally[p] || 0) + 1;
      found.push({ seed: s, assign: a, rows, route, tally, sim });
    }
  }
  return { id, visits: def.visits, size: L.size, squares: L.shape.filter(Boolean).length, found };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const id = process.argv[2];
  const seeds = Number(process.argv[3] || 12);
  const json = process.argv.includes('--json');
  const res = design(id, seeds);
  if (json) { console.log(JSON.stringify(res)); process.exit(0); }
  console.log(id, 'visits', res.visits, 'squares', res.squares, 'candidates', res.found.length);
  for (const f of res.found) {
    // finished / finished perfectly, out of the trials, for each simulated smith
    console.log('seed', f.seed, 'assign', f.assign, JSON.stringify(f.tally),
      'thoughtful', f.sim.thoughtful.complete + '/' + f.sim.thoughtful.perfect,
      'careful', f.sim.careful.complete + '/' + f.sim.careful.perfect,
      'plain', f.sim.plain.complete + '/' + f.sim.plain.perfect);
    for (const r of f.rows) console.log('   ' + r);
  }
}
