// Plays Open Your Forge as a competent-but-plain shopkeeper and reports how
// the economy behaves week to week. Run: node tools/measure-shop.mjs
import { loadCore } from './load-core.mjs';
const C = loadCore();

/* What this plain shopkeeper works: the dearest thing they know how to make
   that the town can actually pay for. Purses are real money now, so making
   greatswords for a street of labourers is a way to go under, and a bot that
   did it would measure the shop's floor rather than its ceiling. */
function bestSeller(shop, quality = 88) {
  const purses = shop.town.map((one) => C.purseFor(one)).sort((a, b) => a - b);
  // what the better half of the town could put on the counter
  const reach = purses.length ? purses[Math.floor(purses.length * 0.45)] : 40;
  let best = null, fallback = null;
  for (const it of C.knownRecipes(shop)) {
    const price = C.recommendedPrice(it.id, 'bronze', quality);
    if (!fallback || price < C.recommendedPrice(fallback.id, 'bronze', quality)) fallback = it;
    if (price > reach) continue;
    if (!best || price > C.recommendedPrice(best.id, 'bronze', quality)) best = it;
  }
  return (best || fallback || { id: 'shortsword' }).id;
}

/* A shopkeeper who notices the floor is full buys another stand for it, which
   is the choice the mode now turns on. */
function buyFloorSpace(shop) {
  if (shop.stands.length >= C.standCap(shop)) return;
  const want = {};
  for (const key of Object.keys(shop.storage)) {
    const type = C.standForItem(C.splitKey(key).item);
    if (type) want[type] = (want[type] || 0) + shop.storage[key].qty;
  }
  const order = Object.keys(want).sort((a, b) => want[b] - want[a]);
  for (const type of order) {
    const def = C.shopStandDef(type);
    const room = shop.stands.some((st) => st.type === type &&
      (!st.key || st.qty < C.standHold()));
    if (room) continue;
    if (shop.gold > def.cost * 2) {
      // a bought stand arrives in the back; a player puts it straight out
      const res = C.shopBuyStand(shop, type);
      if (res.ok) C.placeStand(shop, res.stand.id);
      return;
    }
  }
}

function playWeeks(seed, weeks, opts = {}) {
  const shop = C.createShop({ rnd: C.mulberry32(seed) });
  /* A forge chooses two trades before it opens. The bot picks the pair a
     one-star town actually buys from, and spends whatever experience it earns
     on taking those blueprints further rather than on branching out - the
     point of the measurement is whether the shop pays its rent, not whether
     the bot plays the tree well. */
  for (const id of (opts.crafts || ['tools', 'farming'])) {
    C.takeUpDiscipline(shop, id, 'apprenticed');
  }
  const trace = [];
  const weekly = [];
  let guard = 0;
  while (shop.day <= weeks * C.SHOP.weekLength && !shop.closed && guard++ < 400) {
    /* Spend the day's experience the way a player would: reach for the next
       blueprint when it is within reach, and otherwise put it into what you
       already make. Branching out is what pays, so the bot does it. */
    for (const craft of shop.disciplines) {
      let spent = true;
      while (spent) {
        spent = false;
        for (const it of C.disciplineItems(craft)) {
          if (!C.recipeKnown(shop, it.id) && C.unlockBlueprint(shop, it.id).ok) spent = true;
        }
        for (const it of C.disciplineItems(craft)) {
          if (C.recipeKnown(shop, it.id) && C.upgradeBlueprint(shop, it.id).ok) spent = true;
        }
      }
    }
    const phase = C.shopPhase(shop);
    const shelf = C.countShelf(shop);
    const store = C.countStorage(shop);
    const mat = shop.materials;

    if (phase === 'morning') {
      // buy enough bronze for a full batch if we are short
      const need = C.batchCapacity(shop);
      if (mat.bronze < need && shop.gold > C.ingotPrice(shop, 'bronze') * need) {
        C.shopBuyMaterials(shop, { bronze: need * 2 });
      } else if (mat.bronze >= need) {
        // forge a full batch at a plausible player quality
        const q = opts.quality ?? 88;
        C.shopFinishForge(shop, bestSeller(shop), 'bronze', need, q, 'you');
      }
    } else if (phase === 'afternoon') {
      if (store > 0) {
        buyFloorSpace(shop);
        for (const key of Object.keys(shop.storage)) C.shopMoveToShelf(shop, key, 99);
      } else if (mat.bronze >= C.batchCapacity(shop)) {
        C.shopFinishForge(shop, bestSeller(shop), 'bronze', C.batchCapacity(shop),
          opts.quality ?? 88, 'you');
      }
    } else {
      if (shelf > 0) {
        const r = C.runCounter(shop, { kind: 'player', power: 2, name: 'You' });
        trace.push({ day: shop.day, ...r });
      }
    }
    const before = shop.day;
    C.shopAdvancePhase(shop);
    if (shop.day !== before && (shop.day - 1) % C.SHOP.weekLength === 0) {
      weekly.push({ week: (shop.day - 1) / C.SHOP.weekLength, gold: shop.gold, closed: shop.closed });
    }
  }
  const sold = trace.reduce((a, t) => a + t.sold, 0);
  const revenue = trace.reduce((a, t) => a + t.revenue, 0);
  const customers = trace.reduce((a, t) => a + t.customers, 0);
  const purses = shop.town.reduce((a, o) => a + o.gold, 0);
  return { seed, closed: shop.closed, day: shop.day, gold: shop.gold,
    weeksPaid: shop.rentPaid, stars: C.shopStars(shop),
    known: shop.known.length, stands: shop.stands.length,
    town: shop.town.length, purses: purses,
    customers, sold, revenue, sellPhases: trace.length,
    afterWeek: weekly.map((w) => w.gold).join(' / ') };
}

const weeks = Number(process.argv[2]) || 4;
const runs = Number(process.argv[3]) || 8;
const rows = [];
for (let s = 0; s < runs; s++) rows.push(playWeeks(100 + s * 17, weeks));
console.table(rows);
const survived = rows.filter((r) => !r.closed).length;
console.log(`survived ${weeks} weeks: ${survived}/${rows.length}`);
console.log('median end gold:', rows.map(r => r.gold).sort((a, b) => a - b)[rows.length >> 1]);
