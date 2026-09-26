// Plays Open Your Forge as a competent-but-plain shopkeeper and reports how
// the economy behaves week to week. Run: node tools/measure-shop.mjs
import { loadCore } from './load-core.mjs';
const C = loadCore();

/* What this plain shopkeeper works. It is whatever the forge knows that is
   worth the most, so the run follows the blueprint tree upward as the shop
   learns rather than staying on one recipe forever. */
function bestSeller(shop) {
  let best = null;
  for (const it of C.knownRecipes(shop)) {
    if (!best || it.price > best.price) best = it;
  }
  return best ? best.id : 'shortsword';
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
    if (shop.gold > def.cost * 2) { C.shopBuyStand(shop, type); return; }
  }
}

function playWeeks(seed, weeks, opts = {}) {
  const shop = C.createShop({ rnd: C.mulberry32(seed) });
  const trace = [];
  const weekly = [];
  let guard = 0;
  while (shop.day <= weeks * C.SHOP.weekLength && !shop.closed && guard++ < 400) {
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
  return { seed, closed: shop.closed, day: shop.day, gold: shop.gold,
    weeksPaid: shop.rentPaid, stars: C.shopStars(shop),
    known: shop.known.length, stands: shop.stands.length,
    customers, sold, revenue, sellPhases: trace.length,
    afterWeek: weekly.map((w) => w.gold).join(' / ') };
}

const rows = [];
for (let s = 0; s < 8; s++) rows.push(playWeeks(100 + s * 17, 4));
console.table(rows);
const survived = rows.filter((r) => !r.closed).length;
console.log(`survived 4 weeks: ${survived}/${rows.length}`);
console.log('median end gold:', rows.map(r => r.gold).sort((a, b) => a - b)[rows.length >> 1]);
