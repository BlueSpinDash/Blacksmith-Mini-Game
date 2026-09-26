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
it stood instead of restarting it. The page listens on `visibilitychange` and
`pagehide`; the Android shell also calls `window.checksmithPause()` and
`window.checksmithResume()` from `onPause`/`onResume`, because a WebView is not
obliged to report being sent away as a visibility change and `WebView.onPause()`
alone does not reliably stop HTML5 audio. The pause call goes in first, while
the page's scripts still run; the resume call goes in last, once the timers are
back.

**A real minimise fires several of those at once**, so `suspend` has to be
idempotent: a second one landing on an already-paused element must not undo the
first. It used to, which meant the music stopped and never came back. `resume`
no longer keys off a "we parked it" flag at all — `track` is the record of what
belongs on this screen, so anything paused with one still set is picked up
again, whether this pair parked it or the system stopped it behind our back. A
screen with no music of its own has no track, and stays silent.

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

### Fresh metal pays; worked ground pays the rival

A square you have never struck pays in full. Striking ground you have already
worked pays you `restrikeKeep` of the blow and hands `restrikeGift` of it to the
rival — shipping at **half and half**.

It is a **transfer, not a burn**, and that is deliberate. Keeping 0 and gifting
0.5 is the harsher version and was measured: it starves the thing that actually
ends matches, since fewer points buy fewer Shatters and fewer squares break.
Self-play went from **42 of 42** matches reaching an end to **39 of 42**, running
a fifth longer. Both shares are one number each in `CONFIG.versus.scoring`, so
the harsher rule is a one-character change if that trade is wanted.

The board carries the message rather than a banner: a legal square you have never
struck is ringed **solid pale gold**, a worked one keeps the ordinary dashed
ember, and the small red number says how many times it has been struck. Four
strikes in five land on worked ground, so a banner that often would be
wallpaper — the distinction belongs at the moment you are choosing, not after.

**What this does and does not move.** A fresh square is reachable on about 77% of
turns, so the incentive is live rather than theoretical. But the rival is a
positional player: `versusChooseStrike` searches for a move that stalls the other
smith, not one that banks points, so its own restrike rate barely shifts. The
rule is aimed at a human, who watches the score and wants the powers it buys.
Measured at the shipping settings: 42/42 matches decided, 80% of strikes on
worked ground.

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

### Powers

Six, and every one of them moves metal on a board. One a turn, spent before your
strike.

| Power | Cost | Picks | Effect |
| --- | --- | --- | --- |
| Shatter | 40 | 1 | Crack an intact rival square |
| Repair | 50 | 1 | Clear the damage from one of your own |
| Double Shatter | 90 | 2 | Crack two rival squares at once |
| Reforge | 100 | — | Reshape the square the rival is **standing on** |
| Master Repair | 140 | — | Clear every damaged square of one symbol on your board |
| Triple Shatter | 150 | 3 | Crack three rival squares at once |

**The multi-square powers cost more than buying the single one that many times**
— two Shatters is 80, Double Shatter is 90. A turn only ever carries *one*
power, so the premium buys **tempo**, which is the scarcest thing in the match,
not raw damage.

**Repair costs 50, not the prototype's 30.** At 30 it is strictly cheaper to undo
damage than to cause it, so two competent players trade shatter-for-repair
forever and no board ever degrades: self-play measured **0 of 12 matches reaching
an end**. Sweeping the cost, every match ends from 45 upward; at 50, **127 of 128
matches terminate**.

**Reforge costs 100, above two cracks.** It measures as by far the strongest
thing on the list: a well-aimed one is worth several times what a Shatter is
(mean gain 6.8 against Shatter's 0.9, on the same evaluator). At 80 the rival
bought nothing else; at 120 it never bought one at all. 100 is where all four of
the powers it can reach see real use.

Everything is in `CONFIG.versus.upgrades`.

#### Reforge redirects; it never executes

Reforge lands on whichever square the rival is standing on — there is no square
to choose, only a symbol — and **it can never be the blow that ends the match**.
`versusReforgeOptions` filters out any replacement that would leave the rival
with nowhere legal to go, checked against the board as it actually stands with
its holes in it, so the option is not merely disabled in the interface: it is
never offered, and buying it by hand is refused. What it is *for* is steering
them onto cracked squares, into corners, or off a symbol that was serving them
well. A core check walks 40 boards, every square the rival could stand on and
every symbol offered there, and asserts none of them strands anybody.

#### Targeting

A power is armed from the rail, not bought. Valid targets light up, everything
else on that board dims to 38%, and the prompt says what is wanted — *Select 2
squares*, then *1 square remaining*. A chosen square goes brass rather than
blue, so "picked" and "pickable" are never the same light, and tapping it again
takes it back. **Nothing is charged until the last pick lands**, so cancelling
half way through costs nothing at all. Already-damaged and broken squares are
not offered to Shatter; only damaged ones are offered to either Repair.

#### Banners

Every power announces itself: the name in large type, a line of context under
it (`3 squares cracked`, `Rook → Bishop`, `2 squares of Bishop mended`), in for
1.5 seconds and out. The rival's come in red and read *Rival: Shatter — on your
board*, because the one thing a player must never miss is the opponent doing
something to their board. `pointer-events` is off throughout, so a banner can
never eat a tap meant for a square beneath it, and it sits over the turn header
rather than the first row of squares so the damage it is announcing stays
visible.

#### What the rival does with them

The rival judges every power the same way: clone the match, buy it there, and
see how much better the position got. `versusEvaluate` already counts points, so
a gain is what the power does **after paying for itself** — about +0.9 for one
crack, +1.4 for two, +1.5 for three, and far more for a good Reforge.

Two things make it play with the whole set rather than the cheapest item.
`ai.minGain` (0.9) is what a power must be worth before it is worth a turn's
allowance at all: without it the rival fires a 40-point Shatter every single
turn and so never holds the 100 for a Reforge. And the multi-square powers are
chosen **greedily** — best square, then the best second given the first —
because trying every pair and triple on a 6×6 board is 630 and 7,140 clones,
far past the AI's time budget.

Measured over 42 self-played matches at 5×5: all 42 reach an end, and the rival
spends on Shatter, Repair, Reforge and Double Shatter in real numbers. It does
not reach for Triple Shatter or Master Repair against another copy of itself —
Master Repair only pays once somebody has multi-shattered several squares of one
symbol on its board, which a human does and its mirror does not.

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
own power loses immediately, and a Shatter that strands the rival wins without a
strike. Reforge is the one exception and never can — see above.

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
forge the stock yourself, stand it on a display, price it, serve the customers,
and have the rent on the table at the end of every seventh day. Fall short and
the shop closes. Forge, Endless and Versus are untouched — this mode *uses* the
Forge puzzle, it does not change it.

### The day

Three phases — morning, afternoon, evening — and the player personally takes
**one** action in each: Forge, Tend the Store, Purchase Materials, Checksmith
Almanac, or Search for Employees. **The three phases never increase.** What
grows is how much happens inside them, because employees work alongside you.
Stocking is reached from the floor itself — tap a stand — and costs the phase
the same way; reading the Almanac costs nothing at all.

Early on a day might be *buy metal → forge → stock a stand*, with no phase left
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

#### One ladder, shared by every mode

A square climbs the metals as it is worked: **one blow, one rung.** The shop's
list is built so the metal that wants *n* strikes sits *n*th on it, which is
what makes that true.

| Ordered | Blows | The square walks |
| --- | --- | --- |
| Bronze | 1 | Bronze |
| Silver | 2 | Bronze → Silver |
| Gold | 3 | Bronze → Silver → Gold |
| Mithril | 4 | Bronze → Silver → Gold → Mithril |
| Adamantine | 5 | Bronze → Silver → Gold → Mithril → Adamantine |

Reaching the ordered metal is the **finished** state — the tile wears that
metal's colour and takes the finishing ring. Only the blow *after* it cracks the
square and counts as an overstrike. `forgeBoardSpec` has always set `perfect` to
the metal's own strike count and `spent` to one more, so the rules were right;
what was wrong was the tile art, which counted to the plain forge's
two-and-three and so drew a finished Gold square as a ruined one.

Three functions in the core settle it for every mode, and nothing draws a worked
square without going through them:

- `advanceMaterialTier(strikes, ladder)` — one blow, one rung.
- `squareMetalTier(game, idx)` — which rung *this* square should show. Endless
  is the one exception and says so: there a whole board is worked in the
  round's metal, so every struck square shows the round's rung rather than its
  own count. A blueprint board walks its own ladder. The plain forge keeps its
  hot-metal art and takes no rung.
- `strikeState(game, idx)` — 0 cold, 1 worked, 2 finished, 3 ruined, read off
  the board's own thresholds rather than a hardcoded two-and-three.

**A rung is resolved by name, not by position.** The two ladders are different
lengths: endless climbs six (it has Platinum), the shop works five (it does
not). Mithril is the fourth metal a smith can buy but the fifth colour on the
palette, and a Mithril blade has to come off the anvil looking like Mithril.
`METAL_PALETTE` is the order the tile art is written in and
`metalPaletteIndex` maps a name onto it.

Fifty-eight core checks and forty-five browser checks walk every blueprint metal
rung by rung, on real tiles, and assert the plain forge and endless still count
exactly as they did.

Batch size steps the difficulty every `SHOP.batchPerTier` (3) pieces:

| Batch | Tier | Symbols |
| --- | --- | --- |
| 1–3 | Novice | King, Rook, Bishop |
| 4–6 | Apprentice | the same three |
| 7–9 | Journeyman | + Knight |
| 10+ | Master | + the occasional Queen |

**And the metal raises it.** From `SHOP.hardenFrom` (Gold) up, an order is
worked `SHOP.hardenBy` (1) difficulty steps harder than the batch alone would
ask for. Bronze and Silver are worked at whatever the batch asked; Gold,
Mithril and Adamantine are a tier above it; nothing goes past Master.

| Batch | Bronze / Silver | Gold / Mithril / Adamantine |
| --- | --- | --- |
| 1–3 | Novice | **Apprentice** |
| 4–6 | Apprentice | **Journeyman** |
| 7–9 | Journeyman | **Master** |
| 10+ | Master | Master |

So Gold is the point where the shop stops being a formality: a single Gold
piece is an Apprentice board, and nine of them is a Master one.

**What the step actually buys, tier by tier.** The board *size* never moves —
the item owns that — so a raised tier changes the symbol pool and the reshape
chance, nothing else. Since Bishop joined Novice, Novice and Apprentice now draw
from the same three symbols, so the first step up (Novice → Apprentice) is
purely **reshaping turning on, 0% → 15%**. That is the mechanic the game itself
calls the risky one: it voids the verified-route guarantee, so a Gold order can
no longer be walked from a route worked out before the first blow. From there
the steps add symbols as well: Journeyman brings the Knight and 25%, Master the
occasional Queen and 35%.

| Step | Pool | Reshape |
| --- | --- | --- |
| Novice → Apprentice | unchanged (K, R, B) | 0% → 15% |
| Apprentice → Journeyman | + Knight | 15% → 25% |
| Journeyman → Master | + occasional Queen | 25% → 35% |

The piece-movement legend reads the **board's** difficulty rather than the
player's setting, because in Open Your Forge those are not the same thing — the
order sets the tier, and a legend keyed off the mode would name the wrong pieces
on every board the metal had raised. The threshold is
a rung on the shop's own ladder rather than a name — `materialDifficultyStep`
compares ladder positions, so a metal slotted in above or below Gold later takes
its place without another edit. `harderDifficulty` walks `CONFIG.order` and
stops at the top, and `forgeDifficulty(material, qty)` is the single answer the
order sheet and the anvil both read, so the sheet can never name a tier the
anvil does not deal.

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
the floor — moving it there costs a phase (or a Store Hand).

### What the forge knows: the Checksmith Almanac

A forge opens knowing **eight** recipes out of eighty-two and learns the rest.
`SHOP.items` is the whole catalogue — sixteen categories, each recipe carrying
its board size, its bronze price, how deep in the tree it sits, the recipes that
must come before it, and the customers who come looking for it. `recipeNeeds`
turns that row into a requirement: the prerequisites that must have been
*forged*, the reputation the shop must have made, and the premises it must be
working out of. Nothing branches on a recipe id anywhere.

Two paths open a recipe. `discoverRecipes` runs at the turn of the day and
learns everything the shop has worked its way up to, which is the quiet half of
the mode's progression and is reported in the morning. `buySchematic` sells the
rest of the way to anyone who has done the groundwork at the anvil: gold skips
the waiting, never the anvil work. `shop.ledger` is the book of what the forge
has actually made — how many, the best quality it ever reached, and every metal
it has been worked in — and `forgeCheck` refuses anything the shop has no
blueprint for.

The Almanac screen draws one page a category and the recipes on it as the tree
they are, elbows and all, as nested lists rather than a laid-out canvas, so it
reflows to any width. Known nodes carry their best quality, ready ones are
ringed, and undiscovered ones show the shape of the thing in grey with what it
would take written under it. Tapping one opens its page: category, best work,
metals worked, who wants it, which stand it goes on, and either how it was
learned or the checklist to learn it.

### The floor is fixtures, not slots

The premises say how many **display stands** will fit (`SHOP.tiers[].stands`,
4/6/9/12); each stand is bought separately from the Grow tab and holds six
pieces of a single line. `SHOP.stands` names the six kinds, and which categories
each takes is read off the category table (`standCategories`), so a stand can
never be offered something it was not made for. Moving into bigger premises buys
*room* — it never fills that room.

A stand is the stock line: `shop.stands` is the only record of what is on the
floor, and `shelfLine(shop, key)` is how the counter asks about it. Tapping a
stand opens its panel — what it is, what it holds, what it will take, stock it,
price it, clear it, change what it is while it is empty, or sell it back for
half. Stocking opens straight on that stand with only the compatible lines
listed, and still costs the one phase however many stands are filled. A Store
Hand does the same through `shopMoveToShelf`, which places a line on the stand
already holding it or an empty one that will take it.

Saves from before there were stands carry a `shelf` map; `restoreShop` gives
each line a stand of the right kind up to what the premises hold and puts the
overflow into storage rather than dropping it.

### Pricing and customers

Every line has a recommended price and starts there; the player may ask
anything. Overpricing makes a piece hard to shift, never unsellable —
`priceAppeal` decays smoothly and never reaches zero.

Who comes through the door is decided by **what is on the stands**. Each
customer type weights each category, and those weights are not written by hand:
`deriveCustomerLikes` computes them from the recipes' own `tags`, so adding a
recipe a farmer wants makes farmers care about its category with no second table
to keep in step. The same weights are read backwards to pick the queue: a shop
full of plate and shields draws knights and soldiers; one full of daggers and
boots draws rogues, scouts and travellers; one full of ploughshares and picks
draws farmers, miners and labourers. Weights, not rules — a rogue will still buy
the only mace in an otherwise empty shop. The player never declares a
specialism; the shop acquires one.

A customer's `purse` is a soft ceiling on what they could stretch to at all: a
labourer does not buy plate at any price and a collector will buy nearly
anything, so `purseAppeal` decays past the limit rather than stopping. A shop
with a name draws people who can spend more, which is the other half of what
reputation buys.

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

### Offering something else

A customer who came in for a longsword can be steered to the arming sword
standing beside it. **Offer Alternative** lists everything on the floor but the
thing already on the table, sorted by how well it suits them, and says so in
words before the offer is made — "Just their sort of thing" down to "They would
only be insulted". `alternativeOdds` is their taste for that category, the price
against what this one will bear, their purse and the seller's skill; a guard
will look twice at another blade and nobody ever came to a forge for a frying
pan.

One such offer a customer. Taking it sells *that* item instead; waving it away
leaves the original offer exactly where it was, so the swap is a move rather
than a gamble on the whole sale.

An employee at the counter runs the identical queue, with `autoRespond` and
`autoCounterPrice` standing in for the player's judgement and nerve — one code
path, so the two cannot drift apart. A good hand reaches for an alternative
rather than send away a customer standing there with money in their hand.

### Staff take work, not stat lines

| Role | What they take off your hands |
| --- | --- |
| Salesperson | Minds the counter for one phase a day |
| Apprentice | Works beside you; every batch *you* forge comes out larger |
| Runner | Fetches ingots at a price that may beat the market or miss it |
| Smith | Fills a production order alone — you keep the phase, they keep the hammer |
| Store Hand | Carries finished goods out to the shelves |

Ranks E→S set `power`, which drives every rank-sensitive roll, and wage. Better
ranks are rarer among applicants as well as dearer. Everyone takes **one job a
day**, which is why keeping the shop open all day takes two salespeople plus
you.

A Smith never quite matches a good run at the anvil — even an S-rank tops out
short of 100 quality, verified by a check — so delegating production is a real
trade rather than an upgrade.

### The day's roster

The **Staff** tab is the whole day on one screen: a section for each role, and
inside it a box for every phase the game defines. No phase-by-phase screens, no
handing work out three times.

Opening it costs nothing and **filling a box costs nothing** — the player's own
one action a phase is untouched. Work planned into a later phase simply sits
there, and `runAssignments` does it when that phase closes, the same code path
that always ran the work.

A box is in one of four states, and they read differently at a glance:

| State | What it means |
| --- | --- |
| empty | tap to pick somebody; disabled when nobody qualifies, or the phase has gone |
| **upcoming** (amber) | booked and still ahead — the only state you may still change |
| **active** (gold) | its phase is under way, so it is out of your hands |
| **done** (dimmed) | worked; that employee is finished for the day |

A box outlined in red is booked but **missing its orders** — a Runner with an
empty shopping list, a Smith with no order, a Store Hand with bare storage — and
says so before its phase arrives rather than failing silently when it runs.

Tapping an empty box opens a picker of everyone who could take it: right role,
employed, and with nothing else on today. Anyone already working is simply
**absent** rather than shown greyed out. Each card carries their portrait, name,
role, rank and what that rank buys in that role. With nobody eligible it says so
plainly. Booking one removes them from every other picker on the day at once.

Tapping a filled box opens the assignment: who, which phase, what they were told
to do, and — while it is still upcoming — *Change orders*, *Change employee* and
*Remove*. A swap only releases the old employee **once the replacement is
actually chosen**; backing out of the picker leaves the original booking alone.

The task controls are the player's own. A Runner's shopping list is the buy
dialog, a Smith's order is the forge dialog, a Store Hand's picks are the stand
grid — the same screens, not copies of them. `rosterBook` is the one way a job
reaches the roster from any of them.

**The Apprentice is rostered like everyone else now**, and their help lands in
the phase they were booked into rather than all day. `apprenticeBonus` reads
the current phase's assignment, so an apprentice idle in the afternoon does
nothing for a morning at the anvil. That is a change to an existing rule: before
this, an apprentice on the books helped every batch you forged, whatever the
hour.

### Everyone has a face

Staff wear the same portraits the customers do — same symbols, same framing,
same palette — so the shop looks like one place. `face` is stored on the hire,
and `staffFace` is the single read: it returns the stored one, or, for an
employee saved before there were any, derives one from the two things that never
change about them (id and name). That makes it stable across screens, reloads
and save round trips without touching anything else in an old save, and the
first save afterwards writes it down. The same face follows them through
recruitment, the roster list, the pickers and their box.

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

### The forge floor has a voice

Open Your Forge is a shop, not an anvil, so its sounds are money, wood and a
doorbell rather than struck steel. They are synthesised the same way the hammer
is — no samples, nothing to download — and they go through the same master gain,
so the mute button and the volume slider own them too.

| Moment | Sound |
| --- | --- |
| A customer steps up to the counter | `doorbell` — two strokes of a shop bell |
| A sale lands | `coins` — a handful of chinks, scaled by the price |
| They walk out | `walkout` — two falling notes and the door |
| Buying ingots, and the week's rent | `coins`, pitched down and dulled — money going the other way |
| A piece set on a stand | `shelve` — wood, not metal, over in a blink |
| A phase turns over | `chime` — one mellow stroke, nothing triumphant |
| A hand hired, an upgrade, new premises | `prosper` — a rising figure, longer for premises |
| The landlord takes the keys | `ruin` — four sawtooth notes falling through a closing filter |

The doorbell rings for a *new* customer only: haggling redraws the same screen,
and a bell on every redraw would be the most annoying sound in the game.
`SHOPUI.ringed` holds whoever it last rang for.

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
| Novice | 3 × 3 | King, Rook, Bishop | 18 | 0% |
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
SHOP.categories                        // the sixteen shelves of the catalogue
SHOP.items                             // every recipe: size, price, tree depth, needs, tags
SHOP.startingRecipes / SHOP.unlock     // what a forge opens knowing, and what the rest cost
SHOP.stands / SHOP.standHold           // the six fixtures, and how much one holds
SHOP.customers                         // who shops here; `likes` is derived, never written
SHOP.purseBase                         // what a middling customer thinks twice at
SHOP.roles / SHOP.ranks                // the five jobs, the six grades and their wages
SHOP.tiers                             // premises: rent, staff, stands, storage, batch
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
