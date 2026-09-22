// Self-play instrumentation: how much of the rival's scoring comes from
// patterns, and how long its routes get. Run: node tools/measure-combo.mjs
import { loadCore } from './load-core.mjs';
const C = loadCore();

const TIERS = ['novice', 'apprentice', 'journeyman', 'master'];
const SIZES = [4, 5];
const REPS = 8;

function playMatch(size, tier, seed) {
  const boards = C.makeVersusBoards(size, tier, C.mulberry32(seed));
  const m = C.createMatch(boards, { rnd: C.mulberry32(seed + 1) });
  const tally = { pair: 0, trio: 0, variety: 0, plain: 0, points: 0, longest: 0, turns: 0 };
  let guard = 0;
  while (!C.matchOver(m) && guard++ < 900) {
    const who = m.turn;
    const buy = C.versusChooseUpgrade(m, who);
    if (buy) C.versusBuy(m, who, buy.id, buy.target, buy.choice);
    const t = C.versusChooseStrike(m, who);
    if (t < 0) break;
    const res = C.versusStrike(m, who, t);
    if (!res) break;
    tally.turns++;
    const name = res.pattern;   // versusStrike returns the pattern NAME
    if (name === 'Pair') tally.pair++;
    else if (name === 'Three of a Kind') tally.trio++;
    else if (name === 'Variety') tally.variety++;
    else tally.plain++;
    tally.longest = Math.max(tally.longest, C.sideOf(m, who).longestChain);
  }
  tally.points = m.you.points + m.foe.points;
  tally.decided = C.matchOver(m);
  return tally;
}

const rows = [];
for (const tier of TIERS) {
  const sum = { pair: 0, trio: 0, variety: 0, plain: 0, longest: 0, turns: 0, decided: 0, n: 0 };
  for (const size of SIZES) {
    for (let r = 0; r < REPS; r++) {
      const t = playMatch(size, tier, 9000 + r * 37 + size * 11);
      sum.pair += t.pair; sum.trio += t.trio; sum.variety += t.variety; sum.plain += t.plain;
      sum.longest += t.longest; sum.turns += t.turns; sum.decided += t.decided ? 1 : 0; sum.n++;
    }
  }
  const scoring = sum.pair + sum.trio + sum.variety;
  rows.push({
    tier,
    'strikes': sum.turns,
    'pattern %': ((100 * scoring) / Math.max(1, sum.turns)).toFixed(1),
    'pair': sum.pair, 'trio': sum.trio, 'variety': sum.variety,
    'avg longest route': (sum.longest / sum.n).toFixed(2),
    'decided': sum.decided + '/' + sum.n
  });
}
console.table(rows);
