# Checksmith

A smithing puzzle for the phone, and the standalone minigame for a future fantasy
business game. The board is a metal die; every square carries a chess symbol that
describes movement. Strike every square exactly twice and you produce a
masterwork. Hot metal does not sit still, though: a square can reshape itself
under the hammer, and a square struck once too often crumbles into a hole.

**[`index.html`](index.html) is the whole game** — one self-contained file with
embedded CSS and JavaScript, procedural Web Audio sound and inline SVG/CSS
artwork. No build step, no backend, no external assets, no accounts.

## The opening

The game opens on black with the title track, fades the studio logo up and out,
holds a beat of black so it is **entirely gone**, then brings the title card up
and out, and lifts onto the menu. The track carries on behind the menu — it is
the title screen's music — and stops once a board is in front of the player.
A tap, Enter, Space or Escape skips the whole thing.

Browsers will not start audio without a gesture. The sequence tries anyway,
because a browser the player has already used the page in usually allows it;
when it is refused the curtain **waits on black with one line of instruction**
rather than playing the opening in silence, and that same tap starts it.

Timings live in one object (`INTRO`): the black lead, the fade, the hold, the
gap between plates and the curtain. `prefers-reduced-motion` gets a second set
that keeps the beats but drops the fades.

Loading the page with `#skipintro` (or `?skipintro`) goes straight to the menu,
which is how the browser suite gets past it without every check learning about
it; the opening has a section of its own that loads the page as a player would.

## The score

One `<audio>` element, one track at a time, with a short fade between them so
the title theme does not cut off mid-bar when a run begins:

| Where | Track |
| --- | --- |
| Title screen, and under the opening | Title theme |
| An Endless run | Endless theme |
| Open Your Forge, **the anvil included** | Forge theme |
| Forge, Versus | silence |

The shop's track runs the whole day rather than dropping out each time a batch
goes on the anvil: the forge floor is one place, and the silence would be the
loudest thing about it.

All three obey the mute button and the volume slider — the score is the game's
sound as much as the hammer is. The top bar sits **above** the title screen for
that reason: music plays there, so the controls have to be reachable there.

**Sending the app away stops the music.** `Music.suspend()` pauses the element
outright rather than fading, because a fade needs the timers the system is
about to take away, and half a second of music leaking out of a pocket is the
whole complaint. The track name is kept, so coming back picks the song up where
it stood instead of restarting it — and only a track that pair parked is
restarted, so a muted player, or a Forge board with no music of its own, comes
back to the same silence it left. The page listens on `visibilitychange` and
`pagehide`; the Android shell also calls `window.checksmithPause()` and
`window.checksmithResume()` from `onPause`/`onResume`, because a WebView is not
obliged to report being sent away as a visibility change and `WebView.onPause()`
alone does not reliably stop HTML5 audio. The pause call goes in first, while
the page's scripts still run; the resume call goes in last, once the timers are
back.

**The assets are embedded like everything else**, so the file is still the whole
game — and that is what takes `index.html` from about 370 KB to **12.6 MB**. The
opening's artwork is WebP at 1100px (270 KB together); the three tracks are the
supplied 256 kbps masters carried at **112 kbps**, 3.3 MB each. Those two
numbers are essentially the whole file, and they are the single thing to change
if the size matters more than the fidelity or the other way round —
`MUSIC_TRACKS` and `INTRO_ASSETS` are plain strings.

## Opening it

Double-click `index.html`, or drag it into any modern browser. To try it on a
phone on the same network:

```sh
npx http-server . -p 8080      # then browse to http://<your-ip>:8080
```

Portrait phones are the design target, down to 320 CSS pixels wide. Mouse,
touch and keyboard all work; arrow keys move the focus ring across the board and
Enter or Space swings the hammer.

## Installing on iPhone

`index.html` is a complete offline app, so the quickest route needs no Mac at
all: open it in **Safari** and use **Share → Add to Home Screen**. It installs
with the hammer icon and runs full screen with no browser chrome — the page
carries the `apple-mobile-web-app-*` tags and an embedded 180px
`apple-touch-icon`, and pads every edge for the notch and the home indicator
through `env(safe-area-inset-*)`.

For a real signed app there is a complete Xcode project in
[`ios/`](ios/README.md): a `WKWebView` shell, matching the Android one, that
copies `index.html` into its bundle on every build. It has been checked
structurally by `python3 ios/tools/verify-project.py` but **never compiled** —
that needs macOS, which is not available where this was built. See
[`ios/README.md`](ios/README.md) for what is and is not verified.

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

The game opens on a **title screen** offering four modes — Forge, Endless,
Versus and Open Your Forge — then whatever settings that mode takes, then Begin.
Forge picks a difficulty; Endless picks nothing and always starts on 3×3; Versus
picks a board size and the rival's skill independently; Open Your Forge picks
nothing at all, taking every board's difficulty from the size of the batch being
worked. The hamburger button in the top bar takes you back there at any time.

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

## Open Your Forge

A shop-management mode built on the Forge puzzle. You own a smithy: buy metal,
forge the stock yourself, put it on the shelves, price it, serve the customers,
and have the rent on the table at the end of every seventh day. Fall short and
the shop closes. Forge, Endless and Versus are untouched — this mode *uses* the
Forge puzzle, it does not change it.

### The day

Three phases — morning, afternoon, evening — and the player personally takes
**one** action in each: Forge, Tend the Store, Purchase Materials, Stock
Shelves, or Search for Employees. **The three phases never increase.** What
grows is how much happens inside them, because employees work alongside you.

Early on a day might be *buy metal → forge → stock shelves*, with no phase left
to open the shop. Later the same day is *forge while the Runner buys and the
Store Hand stocks*, then *forge again while a Salesperson serves*, then *serve
the counter yourself*. That shift is the whole progression.

### Three levers, all of them the order

Nothing about the board is picked on the title screen — this mode has no
difficulty selector. Every property of the puzzle falls out of the order:

| | Sets | Comes from |
| --- | --- | --- |
| **Item** | how big the board is | the item ordered |
| **Material** | how many strikes each square needs, and which strike ruins it | the material ordered |
| **Batch size** | which chess symbols appear on the board | how many pieces the batch holds |

The board-size picker is Forge's alone. It is not offered in Open Your Forge at
all — changing it at the anvil would deal a different board out from under the
batch being worked.

Batch size steps the difficulty every `SHOP.batchPerTier` (3) pieces:

| Batch | Tier | Symbols |
| --- | --- | --- |
| 1–3 | Novice | King, Rook |
| 4–6 | Apprentice | + Bishop |
| 7–9 | Journeyman | + Knight |
| 10+ | Master | + the occasional Queen |

That makes a large batch the efficient choice and the dangerous one at the same
time: more goods from a single puzzle, on a board much more likely to strand
you. The order sheet names the tier, its symbols and what batch would step up
again, before the player commits.

| Material | Strikes per square | Ruined on | Ingot | Value |
| --- | --- | --- | --- | --- |
| Bronze | 1 | 2nd | 14g | ×1.0 |
| Silver | 2 | 3rd | 34g | ×2.3 |
| Gold | 3 | 4th | 76g | ×4.6 |
| Mithril | 4 | 5th | 150g | ×8.6 |
| Adamantine | 5 | 6th | 330g | ×15.0 |

A square may be left part-worked and returned to; what ruins it is one strike
past its count. So Adamantine is not a different puzzle, it is the same board
crossed five times without ever over-striking a finished square.

This needed the core generator to build a route visiting every square *n* times
rather than exactly twice (`buildRoute(..., visits)`), and the game to carry its
own `perfect`/`spent` thresholds rather than reading the global rules. Forge and
Endless pass nothing and get the standing values, so their behaviour is
unchanged — there is a check for exactly that.

Generation holds up across the whole matrix: 240/240 boards over every size 3–6
× every material, worst case 396 ms.

### One puzzle is one batch

Five swords take **one** board, not five. Batch size comes from the premises,
the Greater Bellows upgrade and whichever Apprentice is at the anvil. Finish the
board and the ingots are spent and the batch goes on the anvil overnight; ruin
it and the phase is gone but **the metal is not**. The puzzle's quality score
becomes the goods' quality, which sets what they are worth.

Finished work lands in **storage** the next morning. It never goes straight to
the shelves — moving it there costs a phase (or a Store Hand).

### Pricing and customers

Every line has a recommended price and starts there; the player may ask
anything. Overpricing makes a piece hard to shift, never unsellable —
`priceAppeal` decays smoothly and never reaches zero.

Who comes through the door is decided by **what is on the shelves**. Each
customer type weights each category, and the same table is read backwards to
pick the queue: a shop full of plate and shields draws knights and soldiers; one
full of daggers and boots draws rogues, scouts and travellers. Weights, not
rules — a rogue will still buy the only mace in an otherwise empty shop. The
player never declares a specialism; the shop acquires one.

### The counter is played one customer at a time

Every customer who wants something **surfaces as its own beat**: a banner as
they step up, their offer fading in and popping as a figure of its own, the
seller's answer, then a **Sold** or **Walked out** stamp before the next one.
Nothing resolves off-screen. It used to: a customer happy to pay the asking
price was settled silently inside `counterNext`, so only hagglers ever reached
the player and a selling phase felt as though it ended after the first one.

Answering is accept / refuse / **haggle**, and haggling means naming a figure
of your own anywhere between their offer and your asking price — not taking an
automatic midpoint. `counterOdds` reads that figure: easy near their own offer,
falling away as it climbs the band and falling off a cliff past what they can
actually afford, shifted by the Haggler's Ledger, the seller's rank and how
much of a haggler the customer is. The screen reports it qualitatively
("They look willing" → "You will likely lose them") rather than as a number.

A counter that fails is not the end of them: they either walk out or give their
**last word** — the offer they first made, with no further haggling — which the
seller may still take. One counter per customer, so a phase cannot be ground
down indefinitely.

An employee at the counter runs the identical queue, with `autoRespond` and
`autoCounterPrice` standing in for the player's judgement and nerve — one code
path, so the two cannot drift apart.

### Staff take work, not stat lines

| Role | What they take off your hands |
| --- | --- |
| Salesperson | Minds the counter for one phase a day |
| Apprentice | Works beside you; every batch *you* forge comes out larger |
| Runner | Fetches ingots at a price that may beat the market or miss it |
| Smith | Fills a production order alone — you keep the phase, they keep the hammer |
| Store Hand | Carries finished goods out to the shelves |

Ranks E→S set `power`, which drives every rank-sensitive roll, and wage. Better
ranks are rarer among applicants as well as dearer. Only the Apprentice works
alongside you; everyone else takes **one job a day**, which is why keeping the
shop open all day takes two salespeople plus you.

A Smith never quite matches a good run at the anvil — even an S-rank tops out
short of 100 quality, verified by a check — so delegating production is a real
trade rather than an upgrade.

### The week

Rent and every wage fall due together at the end of every 7th day. Miss it and
the shop closes. Premises scale both sides of that:

| Tier | Rent | Staff | Shelf | Storage | Batch | To move in |
| --- | --- | --- | --- | --- | --- | --- |
| Corner Forge | 220g | 2 | 14 | 45 | 3 | — |
| Village Smithy | 620g | 4 | 26 | 90 | 5 | 1,800g |
| Town Forge | 1,500g | 6 | 44 | 170 | 7 | 6,500g |
| Guild Foundry | 3,400g | 9 | 70 | 300 | 10 | 22,000g |

Five upgrades (bellows, display cases, storage racks, haggler's ledger, painted
signboard), three levels each, on a framework that takes a new row without
touching the rules.

Star rating is a 0–100 reputation shown as 1–5 stars. Today it drives one thing
— how many customers a selling phase draws — but it moves on sales, fair
pricing, quality, walkouts and rent paid, so the other levers are already wired.
It is a slow climb on purpose: a new shop opens at one star and reaching five
takes months of good trading, not a fortnight.

`node tools/measure-shop.mjs` plays a plain, competent shopkeeper for four weeks
and prints the result. At the time of writing that is 8/8 survival with roughly
500g a week of profit at tier 1 — comfortable for tidy play, and thin enough
that a wasted phase or a ruined board is felt.

### Sprites and portraits

Every item is drawn as an inline SVG `<symbol>`, and so is every customer type.
They are defined once at the top of the document and drawn with `<use>`, so a
sword shown on six rows costs six short elements rather than six copies of the
artwork — 29 symbols for 18 items, an ingot and 11 faces, in about 24 KB.

**Metal parts inherit `currentColor`; cloth, skin and leather do not.** That is
the whole tinting mechanism: one sword symbol serves all five materials, tinted
from `SHOP.materials[].tint`, while a knight in a gold helm stays a knight
rather than becoming a gold man. Shading is flat white and black washes over
the inherited colour, because a `<use>` shadow tree can only inherit properties
from its host — it cannot reach a gradient defined outside it, and `var()` is
not valid in a presentation attribute. Both of those were tried first and both
render black.

Adding art for a new item is a `<symbol id="it-<itemid>">`; the id matches the
item's id in `SHOP.items` and nothing else needs to know. A browser check
asserts every item, customer type and material is covered, so a new row in the
table without a sprite fails the suite rather than rendering an empty box.

### Several forges, each with a name

You name a forge when you open it — the sign over the door, up to 24
characters — and you can keep **five** going at once. The title screen lists
them: name, day and phase, purse, stars, premises, and whether a batch is
sitting on the anvil. Tap a row to pick it, Begin to carry it on. *New forge*
raises the naming dialog; the × beside a row closes that forge for good and
asks first, by name. With nothing saved, Begin asks for a name before it opens
anything, so the first forge is named like every other.

Names are trimmed, flattened and cut to length before they are ever shown,
control characters included, and an empty one falls back to *Your Forge*. Two
forges on one menu never share a name: `shopNameFree` counts up until it finds
one free, and the result still fits the sign. Everything is escaped where it is
drawn.

Each forge lives in a slot: `{ id, name, saved, shop, anvil }`, stored under
`shopSaves`. The forge last played is the one waiting when you come back. A
single `shopSave` written by the build before slots existed is folded in as the
first forge rather than lost, and reads back as an unnamed one.

Saving happens as you play — after anything that changes the business, and
**never in the middle of a selling phase**. The counter mutates gold and stock
as it goes, so a save taken half way through would let the player quit, reload
and serve the same queue again; leaving it alone until the phase closes means an
interrupted phase is simply unplayed. A batch left on the anvil is saved **with
its board**, so quitting mid-puzzle resumes the same one rather than dealing a
fresh board for a second try at the same order. Leaving for the main menu puts
the forge down where it stands; only an open counter costs anything, and that
one asks first.

Everything read back is treated as hostile. A save can be stale, hand-edited or
written by an older build, so `restoreShop` checks every field and drops what
does not survive rather than trusting it or throwing: a version it does not know
is refused outright (version 1, from before names, is still read), numbers are
clamped to their ranges, goods and orders naming an item or material that no
longer exists are dropped, staff with an unknown role or rank are left behind, a
save cannot smuggle in more staff than the premises hold, assignments for people
no longer employed are forgotten, a doctored name cannot smuggle markup or
length onto the menu, and restored ids are bumped clear of anything still in
use. Twenty core checks and fifteen browser checks cover exactly those cases.

### Everything is a table

`SHOP` holds materials, items, categories, customer types, roles, ranks, tiers
and upgrades. Adding an item, a customer type, a role, a shop tier or an upgrade
is a row in that table and nothing else; the rules below it never name a price,
a category or a customer. Items already carry their own board size and base
price, so per-item layouts and demand profiles are a field away.

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
SHOP.materials                         // strikes per square, ingot cost and value
SHOP.items                             // board size and base price per product
SHOP.customers                         // who shops here, and what pulls them in
SHOP.roles / SHOP.ranks                // the five jobs, the six grades and their wages
SHOP.tiers                             // premises: rent, staff, shelf, storage, batch
SHOP.upgrades                          // the upgrade framework
SHOP.batchPerTier                      // pieces per step up the difficulty tiers
SHOP.weekLength / SHOP.startGold       // how long a week is, and what you start with
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
node tools/verify-core.mjs                                  # 342 rule/generation checks
node tools/verify-ui.mjs                                    # 292 browser checks (Playwright)
PW_PATH=/path/to/playwright node tools/verify-ui.mjs        # if Playwright is installed globally
```

`tools/verify-core.mjs` extracts the core block from `index.html` and exercises
it directly, so the tests run against the shipped file rather than a copy.

## Not in this prototype

Business management, shops, inventory, crafting economies, blueprints and the
world map are deliberately out of scope. Pawns are omitted: their directional and
capture rules would need game-specific decisions that this puzzle does not make.
