# Checksmith

A smithing puzzle for the phone, and the standalone minigame for a future fantasy
business game. The board is a metal die; every square carries a chess symbol that
describes movement. Strike every square exactly twice and you produce a
masterwork. Hot metal does not sit still, though: a square can reshape itself
under the hammer, and a square struck once too often crumbles into a hole.

**[`index.html`](index.html) is the whole game** — one self-contained file with
embedded CSS and JavaScript, procedural Web Audio sound and inline SVG/CSS
artwork. No build step, no backend, no external assets, no accounts.

## Opening it

Double-click `index.html`, or drag it into any modern browser. To try it on a
phone on the same network:

```sh
npx http-server . -p 8080      # then browse to http://<your-ip>:8080
```

Portrait phones are the design target, down to 320 CSS pixels wide. Mouse,
touch and keyboard all work; arrow keys move the focus ring across the board and
Enter or Space swings the hammer.

## Installing on Android

`android/` wraps the same `index.html` in a minimal WebView shell so the game
installs as a real app with a launcher icon and runs completely offline. No
permissions are requested.

```sh
cd android && ./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk  (~1.2 MB)
```

Min SDK 24 (Android 7.0), target SDK 35. The build copies the root
`index.html` into the APK every time, so the game has one source of truth —
edit it at the root and rebuild. See [android/README.md](android/README.md) for
installing, signing for Play, regenerating the icon, and what is and is not
verified about the build.

## Playing

1. Tap any square for the opening blow. That square becomes your position.
2. **The piece on the square you are standing on decides where the hammer may go
   next.** The symbol on the destination is irrelevant — it only matters once you
   are standing there.
3. Two strikes forge a square perfectly.
4. The board finishes by itself once every square has at least two strikes.

Two things make that harder than it sounds:

**The metal reshapes.** A square's *first* strike can knock it into a different
piece entirely. Later strikes never change it. The odds rise with difficulty and
Novice never reshapes at all, so a memorised route is worth less the higher you
climb — read the board again after every blow.

**Third strikes are fatal to the square.** Strike a finished square again and it
cracks apart. Its symbol carries you away one last time, and then the square goes
blank: a hole that nothing can ever land on again. Blank squares still count as
forged, but each one costs quality.

**You can lose.** If the square you are standing on has no legal destination
left, the run ends where it stands and nothing is scored. Spend squares
carelessly and you will wall yourself in.

## Endless mode

The game opens on a **title screen** offering three modes — Forge, Endless and
Versus — then whatever settings that mode takes, then Begin. Forge picks a
difficulty; Endless picks nothing and always starts on 3×3; Versus picks a board
size and the rival's skill independently. The hamburger button in the top bar
takes you back there at any time.

Endless replaces the two-strike rules with a score chase:

- A round is striking every square **exactly once**. The piece on your current
  square still decides the next move, and struck squares never block a slide or
  a jump — only the destination has to be unstruck.
- Clearing a board earns a bonus and recasts it in the next metal: Bronze,
  Silver, Gold, Platinum, Mithril, Adamantine, then Adamantine II, III and on
  with no final round. Each round is a fresh verified layout and the score
  carries forward.
- **10 points a strike, 100 for each board cleared**, both in `CONFIG.endless`.
  A round that clears is settled *before* the game checks for a dead end, so the
  blow that finishes a board can never be the blow that ends the run.
- The run ends when the square you are standing on has no unstruck square left
  to reach: *"No legal moves remaining."* The board freezes so you can see where
  the route died. Best score is saved per difficulty, separately from forge.

Nothing crumbles in endless — every square is struck once, so the spent/blank
rules never fire. Everything else gets harder as you go:

- **The metal reshapes, and the odds climb.** Every square can reshape under the
  hammer. Because you are standing on the square you just struck, a reshape
  redirects your *very next move*. Odds start at 5% and rise 3% every three
  rounds, capped at 60%.
- **Endless has no difficulty to pick.** Every run starts on the 3×3 board and
  steps up a size every five rounds, to 6×6 where it stays. The title screen
  hides the difficulty picker when Endless is selected, and there is one endless
  best score rather than one per difficulty.
- **Every symbol can turn up on any endless board** — king, rook, bishop, knight
  and queen — regardless of the tier's usual pool.

| Round | 1 | 4 | 7 | 10 | 16 | 31 |
| --- | --- | --- | --- | --- | --- | --- |
| Reshape chance | 5% | 8% | 11% | 14% | 20% | 35% |
| Board size | 3×3 | 3×3 | 4×4 | 4×4 | 6×6 | 6×6 |

Reshaping means a round's verified route is a promise about the board you are
*handed*, not the board you will be standing on three blows later. The generator
still proves a full tour exists at the start of every round; from there you are
reading and re-planning, and you can dead-end. The test suite replays verified
routes with reshaping pinned off, which is the only condition under which those
routes mean anything.

## Gold and the forge shop

Clearing a board earns gold, banked the moment it is earned so walking away
never costs you what you already won. Gold and everything bought with it persist
between runs.

**Gold is always a whole number.** The *rate* a board earns can be fractional —
`1` base **+ 0.25 for every 300 points** scored in the run **+ 1 per Gilded
Hammer level** — but you are only ever paid whole coins, and the leftover
fraction is **carried to the next board** rather than rounded away. Over a run
you receive exactly the sum of the rates; you just never see a fractional purse.

| Score when the board clears | 0 | 300 | 900 | 1500 | 3000 |
| --- | --- | --- | --- | --- | --- |
| Rate earned (no upgrades) | 1 | 1.25 | 1.75 | 2.25 | 3.5 |

So four boards at a 1.25 rate pay 1, 1, 1, 2 — five coins for five rates' worth.
The banner above the board always shows the whole number the next cleared board
will actually hand you.

The **Forge Shop** on the title screen sells three permanent upgrades, **ten
levels each**. Costs grow geometrically — `round(costBase × costGrowth^level)`:

| Upgrade | Per level | At level 10 | Costs (L1 → L10) |
| --- | --- | --- | --- |
| Gilded Hammer | +1 gold a board | +10 a board | 5, 8, 12, 19, 29, 45, 69, 107, 167, 258 |
| Smith's Ledger | +0.15 score multiplier | Score ×2.5 | 4, 6, 9, 14, 20, 30, 46, 68, 103, 154 |
| Tempering | −3% reshape chance | −30% reshape | 6, 9, 14, 20, 30, 46, 68, 103, 154, 231 |

Because the Ledger raises your score and the score raises the board rate, the two
gold upgrades compound. Everything above lives in `CONFIG.shop` — base, step,
per-level values and cost curves — so retuning the economy is a few numbers.

## Versus mode

Two smiths, **two separate boards, side by side** — the rival on the left, you on
the right. Both boards are the same size and hold the **same bag of symbols in a
different arrangement**, so neither side gets an easier pool. Board size (3×3 to
6×6) and the rival's skill are chosen independently on the title screen. You
strike first, then the rival, turn about.

**Points do not decide the match.** The winner is whoever is *not* out of legal
moves. Strand the rival and you win; wall yourself in and you lose. Visiting every
square wins nothing and resets nothing — squares may be struck as often as you
like, and none of them is ever "finished".

A turn is **at most one upgrade, then exactly one strike**. The upgrade is
optional, the strike is not. **Concede** ends the match.

### Points and the route bonus

| Award | Value |
| --- | --- |
| Strike | 10 |
| Pair (two of the same symbol in a row) | +5 |
| Three of a Kind | +10 |
| Variety (three different symbols in a row) | +8 |
| Route multiplier | `1 + 0.1 × (route length − 1)` |

Only the **largest** pattern pays, and the award is
`floor((10 + bonus) × multiplier)`. Striking a square already in the current
route **restarts the route from that square alone** — no bonus, multiplier back
to 1.0×. Bouncing between two squares pays its Pair once and is then locked until
you strike elsewhere, so there is no farming a two-square loop for points.

### Upgrades

| Upgrade | Cost | Effect |
| --- | --- | --- |
| Reforge | 80 | Change one unbroken rival square to a different symbol |
| Row Shuffle | 60 | Shuffle the symbols along one rival row |
| Shatter | 40 | Crack an intact rival square |
| Repair | 50 | Clear a crack from one of your own squares |

**Repair costs 50, not the prototype's 30.** At 30 it is strictly cheaper to undo
damage than to cause it, so two competent players trade shatter-for-repair
forever and no board ever degrades: self-play measured **0 of 12 matches reaching
an end**. Sweeping the cost, every match ends from 45 upward; at 50, **127 of 128
matches terminate**. The spec invites tuning prototype numbers, and this one
needed it. Everything is in `CONFIG.versus.upgrades`.

### Damage is a four-state machine

```text
Intact  --Shatter-->  Cracked  --struck-->  Armed  --departed-->  Broken
                         \__________ Repair __________/
```

A cracked square is **safe to stand on**. It arms only when struck, and collapses
into a permanent hole the moment you leave it. **Repair restores a Cracked or
Armed square to Intact — including the one you are standing on. Nothing repairs a
Broken square.** So a shattered square is not a square you must avoid; it is one
you must pay for or walk into.

Damaged metal wears the same split, glowing art the forge gives a square on its
third strike, with a dashed amber ring for Cracked and a solid red one for Armed.
That art hangs off the square's state alone, so Repair — which only resets the
state — returns the square to whatever colour its strike count had given it.

The state rings are drawn as `outline` with a negative `outline-offset`, not as
`::after`. A tile has only one `::after` and the current-square diamond and the
legal-move ring need it, and an inset outline cannot spill across the grid gap
onto the neighbouring square. Every ring around a square is kept within the gap
width for the same reason; a browser check asserts it.

Each strike runs in a fixed order: validate → land the blow and move the marker →
arm a cracked destination → break the vacated square if it was armed → award
points → **recalculate legal destinations, after the departure square has
broken**. No destinations means that smith has lost. Walling yourself in with your
own upgrade loses immediately, and an upgrade that strands the rival wins without
a strike.

### The rival

| Tier | Piece pool | Search depth |
| --- | --- | --- |
| Novice | King, Rook | 0 (greedy, buys at random) |
| Apprentice | King, Rook, Bishop | 1 |
| Journeyman | King, Rook, Bishop, Knight | 2 |
| Master | King, Rook, Bishop, Knight, occasional Queens | 3 |

The tiers differ by **decision quality, not by delay**: a minimax from the
rival's own point of view, weighing exits, reachable squares, holes punched in
each board and the damage standing on it, under a node and wall-clock budget
(`CONFIG.versus.ai`). Self-play confirms stronger tiers beat weaker ones and that
a turn resolves well inside its budget.

**Every tier plays for combos.** `versusCombo` scores a side's route as the
multiplier it has already built, plus the bonus its tail has just paid, plus —
at a 0.4 discount — the best bonus a *legal destination* could pay next. Both
halves matter. Without the discount the rival prefers hovering one symbol short
of a pattern to landing one, because an unspent setup evaluates higher than a
tail that has just paid and reset; an early version did exactly that and scored
*fewer* patterns than a combo-blind rival. Without the reachability check it
chases patterns the board cannot deliver.

The term is weighted by `CONFIG.versus.ai.comboWeight` (1.5) and sits below
mobility on purpose: it decides between moves that are already safe rather than
talking the rival into a dead end. Novice searches nothing, so the same instinct
is folded into its move ranking instead.

Measured over 16 self-played matches per tier, at 4×4 and 5×5:

| Tier | Strikes that land a pattern | Longest route |
| --- | --- | --- |
| Novice | 66% → 67% | 19.3 → 19.2 |
| Apprentice | 38% → 58% | 9.8 → 14.8 |
| Journeyman | 35% → 49% | 9.5 → 14.7 |
| Master | 40% → 49% | 10.6 → 14.5 |

Chasing combos costs nothing in strength: against a combo-blind twin of the same
tier over 160 matches each, the chaser wins 58% (apprentice), 52% (journeyman)
and 51% (master). Every match still reaches a decided end. `node
tools/measure-combo.mjs` reproduces the table.

### Narrow screens

Both boards stay side by side so the whole match is readable at a glance. When
that makes the tiles smaller than a comfortable 44 CSS-px target, **the first tap
on a board enlarges it rather than striking a tiny cell**; strike from there, and
"Back to both boards" returns to the overview. The zoom buttons in each panel
header do the same deliberately.

### Squares darken as they are worked

Both modes share one per-square palette, keyed by `data-metal` on the tile.
Endless gives every struck square the **round's** metal; versus walks a single
square up the ladder on **its own strike count** — one strike Bronze, then
Silver, Gold, Platinum, Mithril, Adamantine, holding there rather than wrapping.
Versus squares take strikes without a cap, so the ladder is what tells you at a
glance which squares each smith has been leaning on.

The palette rule sits *above* the damage art and the ring rules in the
stylesheet, so a cracked square still looks cracked over whatever metal it had
reached, and the square under the hammer keeps its brass ring. It did not, in
endless, before this was shared: the old `.board[data-mode="endless"]` rule
outranked `.tile[data-current="1"]` and buried the ring on every struck square.

| Piece | Legal move from its square |
| --- | --- |
| King | One square in any horizontal, vertical or diagonal direction |
| Rook | Any positive distance horizontally or vertically |
| Bishop | Any positive distance diagonally |
| Knight | Two squares along one axis and one along the other; jumps |
| Queen | Any positive distance horizontally, vertically or diagonally |

| Difficulty | Board | Piece pool | Strikes for perfection | Reshape chance |
| --- | --- | --- | --- | --- |
| Novice | 3 × 3 | King, Rook | 18 | 0% |
| Apprentice | 4 × 4 | King, Rook, Bishop | 32 | 15% |
| Journeyman | 5 × 5 | King, Rook, Bishop, Knight | 50 | 25% |
| Master | 6 × 6 | King, Rook, Bishop, Knight, occasional Queens | 72 | 35% |

Scoring at completion:

```text
N            = number of squares
overstrikes  = sum(max(0, square.strikes - 2))
quality      = max(0, round(100 * (1 - overstrikes / (2 * N))))
```

Because a square can never be struck more than three times, every spent square
costs exactly one overstrike — so `overstrikes` is simply the number of holes you
punched in the work. 100 = Masterwork · 90–99 Excellent · 75–89 Good · 50–74 Rough
· 0–49 Poor. There is no time penalty. A stranded run scores nothing at all. Best
quality per difficulty and your audio settings are remembered locally when
storage is available.

## Fair boards

Symbols are never scattered at random. Generation is solution-first: a bounded
backtracking search looks for a route that visits every square exactly twice
while tracking, for each square, which pieces could still legalise *every*
departure made from it. Only then are symbols assigned, and the finished board
must pass an independent check — the stored route replays legally, each square is
visited exactly twice, and the directed movement graph is **strongly connected**,
so any opening choice can still finish if you accept extra strikes.

A verified perfect route exists from *one* starting square. That does not mean
perfection is reachable from every starting square, and the game never claims it
is. The route is kept for internal verification and is never revealed in play.

**Reshaping voids that guarantee, deliberately.** The verified route is a promise
about a board whose symbols hold still. Once a first strike can reshape a square,
the promise only covers the board you start with — from there you are reading and
re-planning, and you can be stranded. Novice keeps the old guarantee intact by
never reshaping; the test suite replays every verified route with reshaping
switched off, which is the only condition under which that route means anything.

The search is bounded by node count and wall clock, so the interface can never
hang. If a search is bounded out, the game falls back to one of twelve embedded
prevalidated layouts (three per difficulty), each usable in any of the eight
symmetries of a square — all 96 combinations are checked by the test suite.

**Restart Board** re-heats the identical arrangement; **New Puzzle** casts a fresh
one at the current difficulty. Both ask first if you have already started.

## Adjusting it

Everything tunable sits in one `CONFIG` object near the top of the script in
`index.html`:

```js
CONFIG.difficulties.master.size        // board edge length
CONFIG.difficulties.master.pool        // piece pool: route search, and reshaping
CONFIG.difficulties.master.maxQueens   // queens promoted in after the search
CONFIG.difficulties.master.morphChance // odds a first strike reshapes a square
CONFIG.rules.perfect                   // strikes that finish a square
CONFIG.rules.spent                     // strikes that blank a square for good
CONFIG.endless.pointsPerStrike         // endless: points for each strike
CONFIG.endless.roundBonus              // endless: points for clearing a board
CONFIG.endless.materials               // the named metals, in order
CONFIG.endless.pool                    // symbols that can appear in endless
CONFIG.endless.morphBase/Step/Every    // the reshape ramp
CONFIG.endless.morphMax                // reshape ceiling
CONFIG.endless.startTier               // the board every endless run starts on
CONFIG.endless.difficultyEvery         // rounds between tier step-ups
CONFIG.shop.goldPerBoard               // base gold for clearing a board
CONFIG.shop.scoreStep                  // points per gold step (300)
CONFIG.shop.goldPerScoreStep           // rate added per step (0.25)
CONFIG.shop.goldPerGildLevel           // gold added per Gilded Hammer level
CONFIG.shop.upgrades                   // levels, cost base and growth per upgrade
CONFIG.versus.sizes                    // board sizes offered in versus
CONFIG.versus.difficulties             // versus: pool, queens and search depth per tier
CONFIG.versus.scoring                  // strike, pair, trio, variety, route step
CONFIG.versus.upgrades                 // versus upgrade ids, costs and targets
CONFIG.versus.ai.comboWeight            // how hard the rival plays for combos
CONFIG.versus.ai                       // rival node, time and think budgets
CONFIG.versus.generation               // attempts and mobility tolerance for board pairs
CONFIG.generation.nodeBudget           // search nodes before giving up
CONFIG.generation.timeBudgetMs         // hard wall-clock cap per board request
CONFIG.animation.strikeMs              // full hammer action (250-350ms feels right)
CONFIG.animation.impactAt              // fraction of strikeMs where the head lands
CONFIG.animation.reducedMs             // duration under prefers-reduced-motion
CONFIG.animation.liftDeg / .sparks     // swing arc and spark count
CONFIG.scoring.penaltyScale            // divisor in the quality formula
```

Board sizes and pools take effect on the next **New Puzzle**. Adding a difficulty
means adding an entry to `CONFIG.difficulties`, listing it in `CONFIG.order` and
adding a matching `.diff-btn` in the markup. Sound design lives in `SOUNDS`
(partials, decay and noise per strike state); tile colours are CSS custom
properties on `:root`.

If you change board sizes or pools, regenerate the embedded fallbacks:

```sh
node tools/make-fallbacks.mjs
```

The code is split so the rules are testable on their own: the block between
`/* ==== CORE START ==== */` and `/* ==== CORE END ==== */` holds movement, board
generation and validation, game state and scoring, and touches no DOM, audio or
timers. Rendering, animation, sound and input sit below it.

## Tests

```sh
node tools/verify-core.mjs                                  # 264 rule/generation checks
node tools/verify-ui.mjs                                    # 204 browser checks (Playwright)
PW_PATH=/path/to/playwright node tools/verify-ui.mjs        # if Playwright is installed globally
```

`tools/verify-core.mjs` extracts the core block from `index.html` and exercises
it directly, so the tests run against the shipped file rather than a copy.

## Not in this prototype

Business management, shops, inventory, crafting economies, blueprints and the
world map are deliberately out of scope. Pawns are omitted: their directional and
capture rules would need game-specific decisions that this puzzle does not make.
