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
climb — read the board again after every blow. (Open Your Forge's anvil is the
exception: its symbols never change.)

**Third strikes are fatal to the square.** Strike a finished square again and it
cracks apart. Its symbol carries you away one last time, and then the square goes
blank: a hole that nothing can ever land on again. Blank squares still count as
forged, but each one costs quality.

**You can lose.** If the square you are standing on has no legal destination
left, the run ends where it stands and nothing is scored. Spend squares
carelessly and you will wall yourself in.

## The Forge: weapon designs

The Forge mode no longer deals a square board. **Begin** opens a gallery of
handcrafted designs; pick one and the anvil holds the blank of metal for that
piece — the forged component, not the finished weapon. Only the squares that
make up the metal can be struck. After finishing, or at any point through
**All Designs**, the player goes back to the gallery.

| Design | Squares | Shape | What it asks |
|---|---|---|---|
| Dagger | 35 | point, a blade broadening to 7, a 4-square tang | the introductory piece: get into the tang and back out on purpose |
| Shortsword | 40 | a broad, even blade 5 wide, a short tang | rook lanes down both edges, rings of Twos and Threes through the middle |
| Spearhead | 37 | a leaf blade on a one-square neck, a 3-wide socket | only the neck's own king steps across it; everything else slides or leaps |
| Axe Head | 45 | a tall edge narrowing to the eye, which is a hole | sideways routing; rooks slide straight across the eye |
| Mace Head | 39 | a heavy head with three spikes a side, a short mount | no rooks at all — kings, knights, bishops and short numbers, all close work |
| Longsword | 41 | a blade 3 wide for 11 rows, flaring at the guard, a short tang | a long corridor: too narrow for bishops, crossed by rooks and counted in rings |

Each card in the gallery shows the design's own outline with every square
marked, its difficulty, its size and the best quality it has been forged to.
The difficulty labels are measured, not guessed: a player who only avoids
squares they have already finished, otherwise playing at random, clears the
dagger about two times in three and the longsword under one in two. The
gallery runs gentlest first, and the core tests hold it to that order.

The rules are the Forge's own, unchanged: every square twice, a third strike
ruins it, and where the next blow may land is decided by the square you are
standing on. Quality is scored exactly as before, over the design's own
squares. The darker iron on each design — the tang, socket, eye or mount — is
the part a grip, haft or shaft will hide; it is struck like any other square.

**Moves are counted across the whole grid the piece sits on.** A rook still
slides along its row or column, a bishop along its diagonals, a knight still
jumps two and one, and a number still counts rings — and sliders pass over the
air around and inside a piece (across the axe's eye, say) the way they pass
over struck squares. Only where the blow lands has to be metal. The air is
never drawn, never focused, never struck.

**The symbols are fixed, and none of them reshape.** Every design can be
forged perfectly from **every one of its opening squares** — the core test
suite proves it for all six by search, then plays each route through the game.
The squares that give each shape its puzzle (points, tangs, the spear's neck,
the axe's eye, the mace's spikes, the longsword's guard) were placed by hand;
the squares between them were filled under the rule that a perfect route must
stay possible, mirrored so each piece reads as made, and each finished layout
was then checked and chosen by hand from the candidates that passed.

The Forge keeps its best quality per design (`best.dagger`, `best.axe`, … in
the save), and the title counts how many designs have been forged. The old
per-difficulty records from the square boards are left where they were.

### How a shaped board works

A board may carry a `shape`: one flag per square of its grid, 1 for metal and 0
for air. The grid underneath is still square and still indexed `row * size +
col`, so every movement table in the game serves it unchanged; `isMetal`,
`metalCount` and `metalMovesFrom` are the only new questions, and a board
without a shape answers them exactly as every board did before. That is what
keeps Endless, Versus and Open Your Forge untouched: none of their boards carry
a shape, and a fingerprint of generated boards and played-out games across all
of them is byte-identical to the version before Forge mode had shapes at all.

A design is plain data in `FORGE_PIECES`: a name, a difficulty label, a line
for the gallery, rows of symbols with `.` for air, its named parts (by row or
column range, `rough` for the hidden iron), whether it has a point or sideways
spikes, and one stored perfect route that `validateBoard` checks like any other
board. `FORGE_PIECE_ORDER` is the gallery's order. Adding a seventh design is
adding an entry to both.

Both the board and the gallery picture are drawn from the shape alone. The
outline is traced round the edges of the metal — including round holes — and
staircases are smoothed into bevels: one-square steps make a dagger's 45° edge,
steps two rows tall make a spear's long leaf, a pointed design gets a point on
its top square, and a spiked one gets a point on every sideways spike. No
design has art of its own, so a new one draws its own silhouette.

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
- **What an endless board deals is decided by its size**, as everywhere else,
  so every step up in size brings a new kind of symbol into play.

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

**Endless Upgrades** on the title screen sells three permanent upgrades, **ten
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

The board's **size** decides which symbols both sides are dealt; the tier
decides only how far ahead the rival thinks.

| Tier | Search depth |
| --- | --- |
| Novice | 0 (greedy, buys at random) |
| Apprentice | 1 |
| Journeyman | 2 |
| Master | 3 |

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
header do the same deliberately (on a screen under 700 pixels tall they are the
only way back, to leave the boards the room).

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

| Batch | Tier | Hardened |
| --- | --- | --- |
| 1–3 | Novice | 0% |
| 4–6 | Apprentice | 10% |
| 7–9 | Journeyman | 16% |
| 10+ | Master | 22% |

The symbols are **not** on that list: the item decides the board size and the
size decides the symbols, so a dagger is a 3×3 of kings, rooks and numbers
however many you order at once.

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
the item owns that, and the size owns the symbols — so a raised tier changes
one thing on this anvil: **hardened squares**, 0% → 10% → 16% → 22%. The
tier's reshape chance, which the Forge's square boards and Endless use, is
never applied here (see *The anvil never reshapes* below).

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

That makes a large batch the efficient choice and the harder one at the same
time: more goods from a single puzzle, on a board with more crust to work
through. The order sheet names the tier, its symbols and what batch would step up
again, before the player commits.

### The anvil never reshapes (1.41)

Open Your Forge's puzzles never change a struck square's symbol. This is the
"hot metal" reshape that the Forge's square boards and Endless use; Versus's
*Reforge* is a separate bought power that only ever acts on the Versus match
boards. The rule is written once, in `CONFIG.modes` (`shop: { reshape: false }`),
and read only through `reshapeAllowed(mode)`:

- `createGame(board, { rules })` names the mode whose rules a board is played
  under. Under a mode that forbids reshaping the game is made with
  `reshapes: false`, its chance pinned at 0 for good (`morphFixed`), and no
  `morphChance` passed alongside can raise it.
- Every strike asks `canReshape(game)`, and `reshape` itself refuses such a
  game, so a chance set on the live game afterwards (by leftover state, an old
  save or anything else) still changes nothing.
- Every way onto the anvil goes through it: a new order and *Restart Board*
  both come through `startGame`, which lays `rules: App.mode` on last, and a
  batch resumed from a save is rebuilt with `rules: 'shop'`. The anvil's save
  no longer records a reshape chance, and one written by an older build is
  ignored; squares an older build had already reshaped keep their symbol,
  because the route walked so far was walked on it.
- Opening a forge drops any live Endless game, Versus match, armed Versus
  power and pending rival turn, along with the hammer timers every mode
  shares.
- Nothing promises otherwise: the order sheet no longer quotes a reshape
  chance, the help says the anvil's symbols never change, and the legend and
  the "Still a Rook" line after a first strike only appear where a symbol
  could actually have changed.

Everything else about the anvil is unchanged: chess movement, each metal's
strikes, spent squares, hardened squares, the metal colour ladder, quality,
rewards and the phase an order costs. The Forge's square boards still reshape
at their difficulty, Endless still ramps its chance (less Tempering), and
Versus still sells Reforge.

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

Five swords take **one** board, not five. Batch size comes from the forge
itself (3 for a new one), the Forge upgrade in Growth and whichever Apprentice
is at the anvil. Finish the
board and the ingots are spent and the batch goes on the anvil overnight; ruin
it and the phase is gone but **the metal is not**. The puzzle's quality score
becomes the goods' quality, which sets what they are worth.

Finished work lands in **storage** the next morning. It never goes straight to
the floor — moving it there costs a phase (or a Store Hand).

### The Almanac: sixteen crafts, sixteen trees

A blueprint is not a thing you collect. It is a thing you get better at.

**Every category is a craft** with its own experience, its own tree and its own
root — the one recipe in it with no prerequisite, which taking the craft up
hands you free at level 1. No blueprint waits on one from another craft, so a
locked discipline can never need its own experience to open, which would be an
impossible loop. A check enforces that, and another checks every blueprint is
reachable from its craft's root.

**A new forge chooses two.** Before the doors open, the smith says what they
served their apprenticeship at (`SHOP.craft.startingPicks`). They get the first
blueprint of each, free, and nothing else. A third craft is bought later with
**reputation and gold** — never that craft's experience — and both climb with
how many you already hold.

**Experience is earned at the anvil and nowhere else.** `recordCraft` is the
only place a finished piece is written into the book and the only place
experience is paid, so the player's own batches and a staff smith's both go
through it and neither can be counted twice. It runs when the work is done, not
when it is delivered, so reloading a save with a batch still on the anvil cannot
pay for it again. Selling, stocking and hauling earn nothing.

`craftXpFor` scales one piece by the board it is worked on, the metal, and the
quality of the work — with a floor, so crude work still earns. `shop.xp` is a
map keyed by craft and there is deliberately no shop-wide pool; a check asserts
every key in it is a real category, and restoring a save drops experience
banked against a craft the forge never took up.

| | Level 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| Worth | ×1.00 | ×1.20 | ×1.45 | ×1.75 | ×2.15 |

**A level is money, and it is also the road on.** `blueprintUpgradeCost` takes
a blueprint one level further; `blueprintUnlockCost` and `requiredParentLevel`
say what an advanced node costs and how far its parent must have come first,
both by the node's depth in the tree. Reaching a level often opens a *choice* of
two, and you need not take both.

**The level and the quality never touch.** The level is bought in the Almanac
and is permanent; the quality is scored at the anvil, per batch. Taking a
blueprint further leaves the best work you ever did alone, and a masterwork at
the anvil leaves the level alone. A finished piece **keeps the level it was made
on** — stamped on the order, carried into the storage lot (blended by the piece,
like quality) and onto the stand — so a later upgrade never silently reprices
stock already on the shelf.

`recommendedPrice(item, material, quality, level)` applies the recipe's price,
the metal, the work and the blueprint exactly once each. A check multiplies them
out by hand and compares; another catches the multiplier being applied twice.

**The screen** is two deep. `almanacCraftsHtml` draws the sixteen crafts as
illustrated cards; picking one opens `almanacCraftHtml`, which heads the page
with experience in hand, experience ever earned, blueprints unlocked and
blueprints mastered, then draws the tree. `disciplineTree` does the layout in
core — leaves take the next free column, a parent sits centred over its own
children, and each subtree owns a contiguous run of columns, so no two branches
can overlap. It is checked without a browser: a node per blueprint, no two in
one place, a line per step, every child one row below its parent, and no tree
wider than five columns. Nodes read *locked*, *available*, *unlocked* or
*mastered*, and the connector lights up once the blueprint it leads out of is
far enough along to follow.

Everything the progression runs on is in `SHOP.craft` and nowhere else.

### A forge becoming something

What the progression actually feels like, played straight through by a check:

```
chose swords and shields; book: shortsword, buckler
after 9 days of arming swords: level 3 · sword xp 0 · shield xp 0
longsword now available for 94 xp
unlock longsword: { ok: true, spent: 94, level: 1 }
book now: shortsword, buckler, longsword
shields untouched: 0 xp, buckler level 1
research axes: 50g, then three mornings given to study
research done: { cat: 'axes', days: 3, done: true, root: 'hatchet' }
hatchet level 1 · axe xp 0
```

The shields pocket is untouched because no buckler was ever made — the two
trees are entirely independent, which is the whole point. The axes came later,
by three days of the smith's own study rather than earned at the anvil,
because there was no other way in.

### The floor is fixtures, not slots

Floor space says how many **display stands** will fit: 4 in a new forge
(`SHOP.tiers[0].stands`) and one more per Store Expansion level. Each stand is
bought separately from the Shelves tab and holds six pieces of a single line. `SHOP.stands` names the six kinds, and which categories
each takes is read off the category table (`standCategories`), so a stand can
never be offered something it was not made for. A Store Expansion buys *room*
— it never fills that room.

A stand is the stock line: `shop.stands` is the only record of what is on the
floor, and `shelfLine(shop, key)` is how the counter asks about it. Tapping a
stand opens its panel — what it is, what it holds, what it will take, stock it,
price it, clear it, change what it is while it is empty, or sell it back for
half. Stocking opens straight on that stand with only the compatible lines
listed, and still costs the one phase however many stands are filled. A Store
Hand does the same through `shopMoveToShelf`, which places a line on the stand
already holding it or an empty one that will take it.

Saves from before there were stands carry a `shelf` map; `restoreShop` gives
each line a stand of the right kind up to what the floor holds and puts the
overflow into storage rather than dropping it.

### The board you worked is the price tag

Quality is the forge puzzle's own score, 0–100, and `qualityFactor` turns it
into what the goods are actually worth. The spread is deliberately wide —
`SHOP.quality` runs from **0.30** of the list price at quality 0 to **1.15** at
100 — so the same sword can be worth four times another one. `qualityBand`
names the six bands (Crude, Plain, Sound, Fine, Superb, and Masterwork, which is
exactly 100 and nothing less) and they are shown
wherever a piece is: on the stand, in storage, on the anvil, in the picker and
at the counter.

Quality is also a gate, not only a multiplier. Every archetype carries a
`standards` floor and every person strays from it a little, and `chooseGoods`
drops anything under it before price is even considered. A labourer buys
whatever works; a collector will not look at anything below Superb work. A
botched board does not merely fetch less — it costs you the people who would
have paid most.

### The town is people, not rolls

`shop.town` is a persistent roster of **named** people, saved with the shop.
Each one has a trade, a purse with real money in it, an `income` paid at the
turn of the week, a `standards` floor and a standing `want`. They come back.

- **Wealth is real.** `purseFor` is the most somebody will put into one piece.
  Nobody offers gold they are not carrying, `settleSale` takes the money out of
  that purse, and a purse you empty stays empty until payday. The shop cannot
  take out more than the town can put in.
- **Payday is the week's turn** — the same beat as the rent. `payTown` pays
  everybody their wage and `growTown` brings new faces as the shop's name
  spreads.
- **Wants change.** `rollWant` draws from the trade's own taste, so a farmer
  wants farm things; one want in four is a single named recipe rather than a
  kind of thing. `driftWants` gives up on a want that has gone `SHOP.town.wantDays`
  unanswered, and buying what you came for settles it and starts another.
  Somebody who can see what they want on the floor comes in sooner.
- **Your name decides who is in town at all.** `townReach` reads a trade's
  standards back as the stars a shop needs before that trade has heard of it —
  a one-star corner forge is known to labourers and the town watch; a collector
  will not cross the road for anything under five. It is derived, not a second
  table.

The **Customers** tab lists everybody by name with their face, trade, purse and what
they want; tapping one reads them in full.

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
| Runner | Fetches ingots at a price that may beat the market or miss it — or carts ore home from a mine you own |
| Smith | Fills a production order alone — you keep the phase, they keep the hammer — or stands at the furnace smelting ore |
| Store Hand | Carries finished goods out to the shelves |

Ranks E→S set `power`, which drives every rank-sensitive roll, and wage.
Everyone takes **one job a day**, which is why keeping the shop open all day
takes two salespeople plus you. A new forge has room for **four** of them;
**miners** are hired against a property rather than the forge and are counted
apart from that four entirely.

### Nobody is hired good

There is no market in ready-made talent. `makeApplicant` and `makeMiner` both
take `SHOP.ranks[0]`, so **every** hire — forge hand or miner — arrives at E
with an empty pool and no specialization, and the only things that vary between
two applicants are the wage scatter, the face and, for a Smith, whether they
come with a flaw. `shopSearchStaff(shop, roleId, count)` refuses a
role it does not recognise and returns only that role, which is what lets the
hiring screen ask which trade first.

Asking is free. `shopAct('hire')` opens the sheet with no trade chosen and
turns up nobody; picking a trade, switching trade, re-asking and leaving are
all plain redraws. Exactly one path spends a phase — a `data-hire` or
`data-minehire` click that *succeeded* — so a refusal for want of room or coin
leaves the day untouched.

A hire is only attempted when that phase can actually be paid.
`shopPhaseBlocker()` names the reason it cannot (the forge has closed, the
last phase is still playing out, or the counter is open), and while it does
the search still opens and browses, every hire button is off and the sheet
says why. Both hire handlers ask it again before calling `shopHire` or
`shopHireMiner`, so a hire can never land without its phase, and a second tap
finds the applicant gone or the phase already playing and spends nothing.

### Rank is earned at the work

`SHOP.ranks[].up` is the pool a hand must fill to leave that rank (60 / 150 /
320 / 640 / 1200, S has none), so each step asks about twice the one below it.

`xpFromReport(report)` is the whole rule, and it reads the **report a job
produced** rather than the fact somebody was rostered:

| Report | Pays |
| --- | --- |
| `sales` | per sale, per haggle won, per customer read, per contract taken down |
| `runner` / `haul` / `delivery` | a trip fee plus what was actually carried |
| `smith` / `smelt` | per piece made, per ingot smelted |
| `storehand` | per piece that reached a stand |
| anything with `ok: false`, or a zero count | **nothing** |

That last row is the rule the spec cares about: a phase that sold nothing,
shifted nothing or came back empty pays nothing, and a hand nobody rostered
never produces a report at all. `payCrewXp` is called once per report inside
`runAssignments`, behind the same `a.done` guard that stops a phase running
twice — so a job cannot be paid for twice, and a job the standing roster booked
pays exactly what one the player booked does. A check runs both paths and
compares the pools.

Two roles are paid away from that chokepoint, because their work happens
elsewhere:

- an **apprentice** earns in `shopFinishForge` — their work is the player's
  batch, so `apprenticeOnBench` has to find them rostered *and* a batch has to
  come off the anvil. Rostered with nothing forged pays nothing.
- a **miner** earns in `runMines`, at the turn of the week, on what came out of
  the ground rather than what the sheds had room for. `lastDug` already stops a
  week being dug twice, so it stops it being paid twice.

`promote()` subtracts the threshold rather than zeroing the pool, so a surplus
carries; it raises `power` (which is what every rank-sensitive roll already
reads) and rescales the wage by the hand's own scatter, so somebody who was
dear for an E stays dear as a D. S is a hard ceiling: `awardXp` returns 0 for
an S-rank hand, so nothing is banked against a rank that does not exist.

`readyToRank(shop)` sweeps the forge's books *and* every shaft, which is what
lets the Staff screen name who has earned a promotion instead of making the
player open six people. Ranking up costs no phase.

Old saves keep what they had: a hand restored at A stays at A and simply starts
their pool at nothing. The climb is how ranks are earned from here, never a
reason to take back one already held.

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

### A roster that keeps itself

A forge with nine hands should not be re-booked from scratch every morning.
`shop.standing` holds one slot per box of the roster — a role and a phase —
with either a named employee or `null` for auto-fill, plus the orders that job
should be given, written once.

Nothing in it does any work. `applyStanding` runs at the turn of the day and
books the same roster the player books by hand, through the same `shopAssign`,
so every rule still applies exactly as it did: one job an employee a day, one
cart to a phase, no metal bought that cannot be paid for. A box already filled
by hand is skipped, so an override is never overwritten.

`planOrder` turns a standing plan into today's concrete order, or an honest
reason it cannot run:

| Role | Standing plan | Resolves to |
| --- | --- | --- |
| Runner | `{kind:'market', material, upTo, cap}` | tops the metal back up, trimming the order until it fits both the ceiling and the gold |
| Runner | `{kind:'ore', mine, qty, below}` | an ore run, held back while the yard still holds `below` |
| Runner | `{kind:'deliver'}` | the contract due soonest, in the largest cart free that phase, loaded to capacity |
| Smith | `{kind:'forge', item, material}` | one piece a phase (an older plan's `qty` is ignored), checked against the metal and other Smiths' ingots |
| Smith | `{kind:'smelt', material}` | the furnace, if there is ore for it |
| Store hand | `{}` | carries out whatever storage holds |
| Salesperson / Apprentice | `{}` | needs no orders |

When a slot cannot be filled the box is **left empty** and the reason goes into
the morning report — it never silently does something else. The day-break
screen lists every box filled and every one that was not, and an unfilled
standing box on the Staff screen reads the reason back off that same log so the
two cannot disagree.

**A cart is out for a phase, not a day.** `vehicle.busy` became the list of
phases a vehicle is spoken for in, so one handcart can do an ore run in the
morning and a delivery in the afternoon when two runners are booked to different
phases. A save written when `busy` named a single phase still reads.

`captureRoster` saves yesterday's bookings at the day turn and `repeatRoster`
puts them back up on request, re-picking vehicles and re-checking contracts
rather than trusting yesterday's choices.

### Everyone is a stranger until you serve them

A townsperson's purse, standards and taste are real from the day they arrive
and steer everything they do. None of it is visible. `one.known` records what
this forge has found out — `{ wealth, likes[], dislikes[] }` — and every screen
that draws a customer asks the knowledge functions rather than reading the
person, so nothing can leak through a card, a tooltip or the haggle screen.
A check walks a whole selling phase asserting the counter never even hands the
purse to the UI.

Wealth reads as one of five bands (`SHOP.intel.wealth`), never a figure,
because a purse moves week to week and what is being learned is the sort of
customer somebody is. The bands are cut so all five are populated: labourers
and farmers poor, the watch and the rank and file modest, craftsmen and clerics
comfortable, merchants and knights wealthy, nobles and collectors affluent.
Likes and dislikes come from `customerTaste`, read off the same `likes` table
the shop floor already uses, so the book and the customer can never drift.

`learnAboutCustomer` runs on every visit, sale or no sale. `readSkill` turns the
seller into odds and attempts: the player has their own eye, and a salesperson's
rank buys both better odds and more chances to use them. Measured over 56 visits:
an E-rank finds 9 facts, the player 18, a C-rank 49, an S-rank 66 — which is the
point of the feature, since a salesperson was previously only worth their haggle.
Discoveries are permanent, never repeated, and restored only where they could
really have been made (a category the trade was never cold on is dropped).

### Commissions: a lot, a deadline and a price

Once the forge has a reputation worth trusting (`SHOP.commission.minRep`), a
customer at the counter may put a **bulk order** to you instead of buying one of
something. It is a different conversation and gets a different screen: so many
of one line, no worse than a stated quality band, inside a stated number of
days, for `premium` above what the pieces would fetch singly.

* **Accepting** pays `advance` (a quarter) at once and starts the clock *from
  the day you accept* — a queued offer is not eaten into by the time it sat in
  the ledger.
* **Declining costs nothing at all.** No reputation, no gold. That is the point
  of being asked.
* **Delivering** pays the remaining three quarters and nudges reputation up.
* **Missing the day** forfeits the rest, takes `repFailed` off your name, and
  returns the promised goods to storage — they were made, after all.

A **salesperson** minding the counter never answers one on your behalf. They
write it down (`queueCommission`) and it is waiting in the **Ledger** tab when
the phase closes.

**Making the goods is not finishing the job.** Three numbers track a contract
and they mean different things: `qty` asked for, `filled` made and standing in
the crate, `delivered` in the customer's hands. The lifecycle runs
*In production → Awaiting delivery → Partly delivered → Completed*, and
`commissionState` names it in one place that the ledger, the staff screen and
the customer's page all read.

A delivery takes a **vehicle** and a **phase**. `deliverCommission(shop, id,
vehicleId, want)` moves one load, capped by the crate and the cart, out of
`filled` and into `delivered`; the balance is paid **once**, on the load that
completes it, so splitting a job across four trips pays exactly what one trip
would. A check carries a contract out by handcart and asserts the total paid
equals the balance and nothing is carried twice.

The deadline is counted against **delivery**, so a crate of finished swords with
nothing to cart them in is still late; `expireCommissions` returns only the
undelivered crate and the customer keeps whatever already arrived.
`commissionTrips` warns at the offer screen how many runs a contract will need
in the best vehicle owned — and the player may sign anyway.

Goods are **allocated**, not counted: `allocateCommission` moves them out of
`shop.storage` into `com.filled`, so the same piece can never be on a stand and
in a crate at once. `releaseCommission` puts them back while the contract is
still open. A smith can be given an order *for* a contract, and `shopEndDay`
routes that batch into its crate first, with any overflow (or work under the
contract's quality) landing in storage like any other batch — nothing is ever
created or dropped on the way.

Expiry runs at the **turn of the day**, in `shopEndDay`, so a calendar advanced
by any route catches every deadline it passed.

### Special commissions: one named piece, made once (1.42)

Eight one-off requests, each from one trade, each for a named masterwork that
the player must design, mold and forge **perfectly** themselves. A perfect
forge delivers the piece to its customer and puts its blueprint in the book
for good; after that it is an ordinary recipe that you and your Smiths make
copies of. They never touch the bulk orders above: no deadline, no quantity,
no delivery run, no place among `maxActive`, and their own record
(`shop.specials`, by permanent id) and offer queue (`shop.specialOffers`).

| Item | Trade | Craft | Rep | Design | Mold | Each attempt | Puzzle |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Embercleaver | Cook | Household Goods | 12 | 1 | 1 | 2 Bronze | 26 squares × 1 strike |
| Deepvein | Miner | Tools | 18 | 1 | 2 | 3 Bronze | 24 × 1 |
| Harvestmoon | Farmer | Farming Equipment | 26 | 2 | 2 | 2 Silver | 24 × 2 |
| Thornwatch | Hunter | Spears | 36 | 2 | 2 | 3 Silver | 29 × 2 |
| Gatewarden | Town Guard | Shields | 46 | 2 | 3 | 3 Gold | 29 × 3 |
| Whisperfang | Rogue | Daggers | 56 | 3 | 3 | 3 Gold | 23 × 3 |
| Vowkeeper | Knight | Swords | 70 | 3 | 4 | 4 Mithril | 23 × 4 |
| Sovereign’s Aegis | Noble | Body Armor | 85 | 4 | 4 | 4 Adamantine | 22 × 5 |

**Being asked.** A commission is *eligible* once the forge has its reputation
and has taken up its craft; it is never accepted for you. On each visit by a
customer of its trade, `rollSpecial` puts it with chance `SHOP.special.odds`
(25%), rising by `step` (15%) for every eligible visit that did not, up to
certainty. `patience` (8) bounds the wait: once a commission has been eligible
through that many selling phases unasked, somebody of its trade is put in the
next queue, and asks. `seatSpecialPatrons` moves one of that trade into town
if nobody follows it. Measured over 150 forges per commission, every one was
put within 9 selling phases of becoming eligible, median 1–4. The player
answers at the counter; a Salesperson writes it down (`queueSpecial`) and it
waits in the phase summary and the Ledger, one offer per commission at most.
Answering is free. A declined commission comes back after `cooldown` (5
days); one accepted or completed never does. The customer who asks spends
their visit asking, as with a bulk order.

**The work.** From the Ledger's *Special Commissions* section: *Work on Design
(Uses Phase)* and *Fashion Mold (Uses Phase)* each spend one of the player's
phases and add one to that stage (`specialWork`); no employee can do either.
*Attempt Forge* opens a sheet with the metal required and the ingots held;
*Start Attempt* commits the ingots **when the attempt starts**
(`beginSpecialAttempt`, refused without them or while one is under way), and
the piece goes on the anvil. The attempt is recorded on the commission
(`rec.attempt`) and the board in the save slot, so a game closed half way
reopens on the same blows without charging again; *Restart Board* is hidden,
and *Abandon Attempt* always asks first and says the ingots are lost.
`finishSpecialAttempt` closes it once: only a completed board at quality 100
completes the commission. An imperfect finish shows its quality; running out
of legal moves is the ordinary failure; either way the metal is gone and the
design and mold are kept. Each attempt uses the phase.

**The puzzles.** Each piece is a handcrafted silhouette built by the same
`shapedPieceBoard` the Forge's designs use, with its own symbols and named
parts, struck as often as its metal asks (`specialBoard`). Every layout was
searched for with `tools/design-specials.mjs` (route first, symbols fitted to
it, then the game's own `validateBoard`), and each stored `route` is one
perfect solution: the test suite validates all eight and plays each route to
quality 100. No two share a shape or a layout, and none ever reshapes.

**The blueprint.** The eight items are ordinary catalogue entries marked
`special`, priced about 1.35–1.45× the dearest comparable recipe in their
craft (Embercleaver 58g, Deepvein 62g, Harvestmoon 70g, Thornwatch 112g,
Gatewarden 168g, Whisperfang 128g, Vowkeeper 124g, Sovereign’s Aegis 206g, all
in bronze). `learnRecipe` refuses them except from a completed commission, and
`unlockBlueprint` refuses them outright, so neither experience nor an edited
save can unlock one early; `restoreShop` drops a named blueprint whose
commission is not done. Once earned, copies use the ordinary square board of
the item's size, any metal and batch, the normal difficulty, experience and
blueprint levels, and Smiths make them through the roster. They are left out
of `deriveCustomerLikes`, so no trade's tastes change: copies sell to whoever
already likes their craft, and the trades in `tags` may come in asking for one
by name once it exists. Named work is edged in gold wherever it is drawn
(`.sprite.named`). In the Almanac each craft lists its masterwork beside the
tree, locked with the reason, or earned with its level.

### Property, miners and ore

The **Property** tab sells deeds to mines. You may own as many of one mineral as
you can pay for — `minePrice` charges 1.6× more for each one you already hold —
and each is a property of its own with its own id, name, miners, upgrades and
ore sheds.

**Owning a mine hands the forge nothing.** What it digs sits at the mine until a
runner fetches it. That gap is the whole point of the chain:

```
mine digs (weekly) → mine's own ore store → runner + vehicle → forge ore yard
  → smith at the furnace → ingots → the anvil
```

**Miners** are hired against the mine (`shopHireMiner`), never against
`staffCapacity`. `runMines` runs once at the turn of the week and is keyed to
the **week number** through `mine.lastDug`, so a week can never be dug twice
however the calendar was advanced or a save reloaded. Anything over
`mineStoreCap` is spoil left on the ground, which is what makes ore sheds worth
buying.

| Vehicle | Carries | Price | Notes |
| --- | --- | --- | --- |
| Handcart | 5 | 190g | |
| Merchant Wagon | 15 | 760g | |
| Freight Wagon | 30 | 1750g | Or trade a merchant wagon up for 1150g |

One set of vehicles does **every** job that moves goods — ore home from a mine
and finished contracts out to customers. Any tier can be bought outright; the
trade-up is a cheaper road that costs you the wagon, which matters because two
vehicles are two runners out at once.

Vehicles are **equipment, never consumed**. Booking any haul reserves one for
that phase (`vehicle.busy`), so the same cart cannot fetch ore and deliver goods
at once, and the runner gives it back when they get home.

**A runner has three errands**, one a phase, all booked through the existing
staff roster: `{}` for market, `{kind:'ore'}` for a mine, `{kind:'deliver'}` for
a contract. `jobGap` and `jobSummary` name each one on the roster box, and
`shopAssign` refuses a delivery for a contract still being made. `collectOre` caps the load three
ways — what the mine has, what the vehicle carries, and what the forge can still
hold — and *moves* the ore rather than copying it, so nothing is created or lost
by fetching it.

**Ore is not an ingot.** It is counted apart from bar stock in `shop.ore`, with
its own cap, and the anvil will not take it. `shopSmelt` converts it one for one;
a smith on the furnace gets through `smeltRate(power)` in a phase and cannot
also manufacture that phase. None of it is compulsory — the market still sells
finished ingots, and a forge that never buys a deed plays exactly as it did.

### The week

Rent and every wage fall due together at the end of every 7th day. Miss it and
the shop closes. There is no moving house (since 1.40): every forge opens as the
Corner Forge and stays there, growing through Growth instead. Its base figures
are `SHOP.tiers[0]`:

| Rent | Staff places | Stand spaces | Storage | Batch |
| --- | --- | --- | --- | --- |
| 145g a week | 4 | 4 | 45 | 3 |

The three larger tiers (Village Smithy, Town Forge, Guild Foundry) are still in
the table only so a forge saved after moving keeps the rent, staff places, stand
spaces, storage and batch size it had; nothing can move a forge into or out of
them.

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
| A hand hired, an upgrade | `prosper` — a rising figure, longer for the bigger moments |
| The landlord takes the keys | `ruin` — four sawtooth notes falling through a closing filter |

The doorbell rings for a *new* customer only: haggling redraws the same screen,
and a bell on every redraw would be the most annoying sound in the game.
`SHOPUI.ringed` holds whoever it last rang for.

### The storefront

The shop's home screen is the shop: one continuous room, seen from fixed
viewpoints (see *One screen, no scrolling*), rather than a menu of actions. It is a
**presentation layer only**. Every object in it hands straight to a function
the menus already called — the counter to `shopAct('tend')` or the roster
picker, the forge to `shopAct('forge')`, the table to `shopOpenAlmanac`, and so
on — so the rules cannot drift between the room and the menus, and opening any
station costs nothing. The quick-action buttons and the tabs stay under the
room as the compact navigation, which is also why every earlier screen is still
reachable.

It is plain HTML over one backdrop SVG (`sceneRender`). The backdrop is redrawn
only when the building changes; the stations, displays and people are redrawn
from the live shop on every render, which is what keeps what you see honest.
New scenery follows the sprite sheet's idiom — flat fills, `#12141a` outlines,
a white highlight on the lit side — and uses no patterns or gradients from the
hidden sprite sheet, because browsers do not reliably paint those from a
`display:none` SVG.

**A floor you arrange.** Each stand now has a `slot`: a numbered spot on the
floor, or `null` for furniture waiting in the back. Spot *i* sits in column
`floor(i/2)`, back row when even, so a spot never moves when the building
grows. A bought stand arrives in the back; `placeStand` puts it out (swapping
with another stand that is already out), `storeStand` puts it away. The model
has one invariant that makes rearranging safe: **a display in the back keeps
everything on it** — stock, price, level — but `stockedStands`, `countShelf`
and `standFor` only look at stands that are out, so nothing on it can sell or be
topped up. And `shopStockStand` now refuses a line already standing on another
display, in the floor or in the back. Nothing is ever moved off a stand by
moving the stand, and no line can ever be on two stands — which matters,
because `restoreShop` keeps only the first of two, and a second would have been
lost on reload. A save written before slots existed has every stand given the
next free spot in order, so an old shop opens looking and playing exactly as
it did.

Doing this turned up a real bug in `shopPullFromShelf`: it took pieces off a
stand whether or not the storeroom could hold them, silently destroying the
overflow, and it forgot their blueprint level. It now moves only what fits and
carries the level.

**Stages.** `SHOP.stages` is four visible buildings — Humble Beginnings,
Established Smithy, Merchant Forge, Master Establishment — chosen by floor
space (`standCap`), so the room you paid for is the room you see. Each lays out
`cols × 2` spots; spots past what you own are drawn roped off. The top stage has
exactly 20 spots, which is what the largest premises plus every Store
Expansion can hold, and a check walks every tier and expansion level to prove
there is never floor space with nowhere to stand on it. A forge opened since
1.40 starts with 4 spaces and reaches 12 at most, so it tops out at the
Merchant Forge; the Master Establishment is only seen by saves that had moved
into larger premises before moving was removed. The sign over the door
grows grander with the stage; a long name is squeezed to the board with SVG
`textLength` rather than spilling off it.

**The phase, played back.** `shopSpendPhase` resolves the phase in
`shopAdvancePhase` — once — and then saves, *before* a frame is shown, a plain
snapshot of what is still owed to the player (`SHOPUI.replay`: the reports, the
closing phase, any day-break). `shopPlayPhase` then plays three to five
seconds read only off those reports: it never calls a rule and never touches the
purse, the stock or anybody's experience. Its `finish` is guarded to run once,
so skipping, skipping twice, or letting it run all reach the same single
summary. A check reads the shop's state the instant the phase is spent, skips
twice, and confirms nothing moved. The snapshot rides in the save slot, so a
game closed mid-playback reopens on the summary; it is cleared once seen.

The summary is one sheet with only the categories that happened, the contracts
a salesperson brought back (still the player's to accept or decline), and each
hand's full report a tap away. The playback is on by default, off under
`prefers-reduced-motion`, and switchable from the sign.

**The camera shows each worker (1.39).** The playback is a sequence of shots,
one per employee whose job came to something this phase (`phaseShots`): a
salesperson who served customers, a store hand who shelved stock, a smith who
forged or smelted, a runner who bought, hauled or delivered, and an apprentice
only in a phase where the player finished a batch (`SHOPUI.forgedNow`, set by
*Return to Shop*). A hand who was idle, whose job failed or who produced
nothing gets no shot. Shots are read off the reports and the crew captured
before the phase advanced, so Repeat Daily bookings appear like any other.

For each shot the camera pans to frame the worker and their workstation
(`targetFor`, keeping clear of the Skip Animations button). If they are already
in view it stays still. The pan is its own `requestAnimationFrame` loop, so it
knows when it has arrived, and only then does the worker's animation start. The
shot then waits on that animation's own end event (`animationend`,
`transitionend`, a Web Animations `finished`), with a timer behind each one
and a cap on the whole sequence, so a missing or interrupted animation cannot
hold the phase. Moving figures (customers walking in, the runner leaving) are
followed. Afterwards the camera pans back to where the player left it.

*Skip Animations* finishes at once and puts the camera back. A drag, wheel,
arrow key or any scroll the playback did not make hands the camera to the
player for the rest of the phase: shots still play, but the camera neither
moves nor returns. *Automatically Show Worker Actions* (Shop Settings, on by
default, `workerCam` in the store) plays the same sequence with a still camera.
While a menu or prompt is open nothing moves and no new shot or summary starts.
A check plays one phase from the same save and the same random seed four ways
(watched, skipped, camera taken, camera off) and finds the forge identical.

#### 1.34: the room in front, the paperwork behind it

**Lighting stays in the room.** The room's light is drawn in layers at
`z-index` 60–70 (tint, lamp and forge glow, effects) with the Skip button at 90.
The room itself never formed a stacking context, so those numbers were being
compared with the menus' own (every sheet is 60), and the forge glow — a
`mix-blend-mode: screen` layer — painted over open panels. `.scene` and
`.scene-wrap` now carry `isolation: isolate`, which makes every number inside
them local; the lighting is unchanged, it simply can no longer rise above
anything outside the room. A browser check renders the evening forge glow under
an open panel and compares the panel's pixels with the room's light on and off,
in all three views; the same check fails against 1.33.

**Navigation.** The five actions are one row of short labels (`short` in
`SHOP_ACTIONS`; the full name and any reason it is shut are the accessible
label and tooltip — nothing is ever ellipsed). The eight tabs keep their ids but
live in three drawers (`SHOP_TAB_GROUPS`: Inventory, Business, Staff), all shut
when the shop opens, so the page ends shortly under the room. Opening a drawer
returns to the screen it was last left on; a count on a drawer says something
inside is waiting (contract offers, promotions). Stations still open their
screens directly through `shopShowTab`. A check scans every screen and station
panel at 320, 360, 390 and 430 pixels for any text wider than its box.

**The playback shows the phase that ended.** It used to look the performer up in
the live roster *after* the phase had advanced, which found whoever was booked
next — and after the evening, nobody, because the day's turn wipes the roster.
`sceneCrewNow` now records who held each station *before* `shopAdvancePhase`,
and the playback reads only that. `shopSpendPhase` and `shopAct` refuse to run
while a playback is under way, so a second press cannot advance the day twice. A
check books a different salesperson into each phase and watches a full day.

**Novice has a bishop.** `CONFIG.pools[3]` is `K, R, B, 2`. The larger pools are
unchanged, and the Novice fallback boards were regenerated to carry bishops
(`make-fallbacks.mjs` is stale for the hardened tiers, so only the Novice
entries were regenerated, with the same generators and eight-way validation).

### Growth buys room, the Shop buys fixtures

One line runs through both tabs: **Growth sells capacity, never an object.**
Nothing bought on Growth puts a stand on the floor or a person on the books —
it makes space for one. The Shop is the only place a physical stand is bought,
and `shopOpenBuyStand` refuses when `standCap(shop) - shop.stands.length <= 0`,
pointing at Growth instead of selling the space itself. There is exactly one
`data-buy-stand` emitter and one handler, both inside the Shop sheet, so the
two tabs cannot drift into doing each other's job.

`SHOP.growth` holds eight tracks, all priced `round(base * rate^level)` so each
purchase costs more than the last, and all returning `null` for the cost at
their ceiling — which every caller reads as "nothing left to buy here".

| Track | Card | Key | Effect a level | Max | Prices |
| --- | --- | --- | --- | --- | --- |
| `display` | the stand's name | on the stand (`up`) | +2.5% on what that stand sells for | 4 | 70g × 1.55ⁿ |
| `forge` | Forge | `bellows` | +1 item a batch | 8 | 300g × 1.7ⁿ |
| `hands` | Employment | `hands` | +1 staff place (the hiring limit) | 10 | 620g × 1.85ⁿ |
| `floor` | Store Expansion | `floor` | +1 space on the floor | 8 | 400g × 1.75ⁿ |
| `smiths` | Smith Staffing | `smithSeats` | +1 Smith working in each phase | 3 | 900g × 2.2ⁿ |
| `storehands` | Store Hand Staffing | `storeSeats` | +1 Store Hand working in each phase | 3 | 400g × 2ⁿ |
| `runners` | Runner Staffing | `runnerSeats` | +1 Runner working in each phase | 3 | 600g × 2ⁿ |
| `sales` | Salesperson Earnings | `salesBonus` | +5% on every hired Salesperson's sale | 5 | 600g × 1.8ⁿ |

`forge` deliberately stores under the **old `bellows` key**, so a save written
before this existed walks back in with every level it paid for; `restoreShop`
walks `SHOP.growth` as well as `SHOP.upgrades` so the key is never dropped now
that `bellows` has left the legacy list. `staffCapacity`, `standCap` and
`batchCapacity` each read their track directly, so a purchase changes what the
shop can do on the very next call rather than at some later refresh.

**Displays are per stand**, not per shop, which is what makes them a decision:
the money can go into the one display carrying your best line. A stand's own
level lives in `up` and is read only through `standLevel` — deliberately *not*
`level`, which on a stand already means the blueprint level of the goods
standing on it. Two different things called "level" in one object is exactly
the kind of collision this codebase has been bitten by before.

`standBonus` returns `1 + level * 0.025` and is applied in **one place**,
`standWorth(stand)`:

```js
recommendedPrice(item, material, stand.quality, stand.level) * standBonus(stand)
```

Because it multiplies a figure that already carries quality and blueprint
level, it lands *alongside* them and can never overwrite either — a check
drives a display to its top level and confirms the ratio is 1.1 while rough
goods on that same fine display still fetch less than good ones. Every place a
stand is priced — the customer's interest, their offer, the settled sale, an
alternative offered, the price sheet, the stand box — goes through
`standWorth`, so the floor cannot disagree with the counter about what a piece
is worth.

### Staffing and Salesperson Earnings (1.40)

**Moving is gone.** The Corner Forge card, *Move to Village Smithy* and every
other relocation offer, its purchase and its text were removed (`shopExpand`
and `shopNextTier` no longer exist). Rent still falls due weekly from
`rentDue(shop)`, now shown in the heading over the older upgrades. A save made
after moving keeps its tier, so its rent and every capacity it earned stay
exactly as they were; a check restores a tier-3 save and compares them.

**Hiring and working are two different limits.** Employment raises how many
people can be on the books. The three Staffing tracks raise how many of one
role can work **in the same phase**: `phaseSeats(shop, role)` is 1 plus that
role's Staffing level (Salesperson and Apprentice stay at 1). Buying a level
hires nobody and promotes nobody. Employment's ceiling went from 6 to 10 so
the hiring limit can still cover every place the Staffing tracks open.

| Track | Price of each level | Places per phase |
| --- | --- | --- |
| Smith Staffing | 900g, 1,980g, 4,356g | 1 → 4 |
| Store Hand Staffing | 400g, 800g, 1,600g | 1 → 4 |
| Runner Staffing | 600g, 1,200g, 2,400g | 1 → 4 |

Each place is a **seat**. An assignment carries `seat`, `shopAssign` refuses
once every seat in that phase is taken (*all 2 Smith places in the morning are
filled*), and a recurring assignment is kept per seat (`standingAt`,
`setStanding`, `clearStanding` all take one), so "Smith 2, Morning" can repeat
daily on its own. The Staff screen draws one row of three boxes per seat as
soon as a level is bought, and its role heading reads *3 hired · 2 per phase*
so the two limits are never confused. Every other rule is unchanged: one job
per employee per day, one trip per vehicle per phase, and the job system's own
checks for materials, stock, blueprints and contracts.

**Shared things are spent once.** All the work booked for a phase resolves in
that phase, worker by worker, and each job takes what it uses before the next
one looks — two Smiths cannot forge from the same ingots, two Store Hands
cannot carry the same pieces, two Runners cannot take the same cart. Planning
looks ahead too: a recurring Smith is refused if the ingots it needs are
already promised to another Smith (`planOrder(..., except)`), a Runner's
market run counts what other Runners are already buying, and `nextDelivery`
skips a contract whose goods are already on their way. Each worker's report
carries `staffId`, so the phase playback shows every worker in turn.

**Salesperson Earnings.** `salesBonusRate(shop)` is 5% a level, up to 25% at
level 5 (600g, 1,080g, 1,944g, 3,499g, 6,299g). `settleSale` — the one place a
sale is credited — adds `salesBonusFor(shop, price)` = `round(price × rate)`
when the seller is a hired Salesperson, on the final price after haggling. It
is added once per sale, shows in the Salesperson's report and the phase
summary as its own line, and is paid by the shop, not the customer. The
player's own sales at the counter never get it, and wages, ranks and
experience are untouched.

`restoreShop` reads every new key; assignments are given a seat, and two that
claim the same seat are moved apart. Saves from before 1.40 load with every
assignment in seat 1.

### Several forges, each with a name

You name a forge when you open it — the sign over the door, up to 24
characters — and you can keep **five** going at once. The title screen lists
them: name, day and phase, purse, stars, staff, and whether a batch is
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
save cannot smuggle in more staff than its hiring limit allows, assignments for people
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
| **2 – 5** | Exactly that many squares away — count the rings out, in any direction |

### The board's size decides what is on it

Not the difficulty. `CONFIG.pools` is one table keyed by board edge, read by
Forge, Endless, Versus and the shop alike, so a 3×3 deals the same symbols
whoever asked for it. Every rank up brings one more kind of symbol into play,
because a bigger board is what gives that symbol room to mean anything — a
knight on a 3×3 could not move at all.

| Board | Symbols dealt | Queens promoted |
| --- | --- | --- |
| 3 × 3 | King, Rook, **2** | — |
| 4 × 4 | + Bishop, **3** | — |
| 5 × 5 | + Knight, **4** | — |
| 6 × 6 | + **5** | up to 2 |

A **number** sends you exactly that many squares away: Chebyshev distance, so
it reads as the ring that far out, in any direction. That makes `1` the king
exactly, which is why numbers start at two. A number can have *no* legal
destination — there is no square two away from the middle of a 3×3 — so the
generator simply never places one where the route departs from it, and
`reshape` refuses to turn a square into one that would strand you.

| Difficulty | Board | Strikes for perfection | Reshape chance | Hardened chance |
| --- | --- | --- | --- | --- |
| Novice | 3 × 3 | 18 | 0% | 0% |
| Apprentice | 4 × 4 | 32 | 15% | 10% |
| Journeyman | 5 × 5 | 50 | 25% | 16% |
| Master | 6 × 6 | 72 | 35% | 22% |

### Hardened squares

A hardened square wears a **crust** of one or two layers. Blows land on the
crust first and do not touch the metal underneath: they neither count towards
finishing the square nor can they ruin it, and you still land there, so the
symbol still steers the next blow.

The crust is a **routing problem, not a tax**. It is rolled *before* the route
is searched for, and `buildRoute` takes a visit count per square — base visits
plus one for every layer — so a hardened board still has an exact solution in
its stored route. `validateBoard` checks the same sum, and the blows a crust
owes are never counted as overstrikes, so a hardened board still finishes at
quality 100 when walked properly.

Endless and Versus are left plain: a tour visits each square once and has
nowhere to come back to, and a duel is already a fight over ground.

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

## One screen, no scrolling (1.43)

Nothing in the game scrolls: not the page, not a window, not the storefront,
by finger, wheel or keyboard. Every screen is exactly the height of the phone,
and anything with more in it than fits is turned in pages instead. Nothing was
hidden to get there; every line and every control is still reachable, and the
browser checks prove it at 320×568, 360×640 and 412×915.

**Each screen has one row that gives.** `.app` is one screen tall
(`100dvh`, safe areas padded) and every row in it keeps its natural height
except one, which `fitScreen()` sizes to the room that is left:

- **The board** (Forge, Endless, the shop's anvil). A square board is as wide as
  the screen or as tall as the space left, whichever is smaller. A weapon design
  is fitted by its height as well as its width, closing its gaps from 6 to 4
  pixels before its squares get any smaller, so the whole piece, point to tang,
  is always on screen. On the shortest phones (568 tall) the Longsword, the
  tallest piece at fifteen rows, gets 16-pixel squares; at 640 it gets 18, and
  at 740 or more, 21 or larger.
- **The two Versus boards** share whatever height the turn bar, prompt and
  powers leave, side by side or one enlarged.
- **The storefront** keeps its drawing scale wherever it fits and is drawn
  smaller as a whole (down to 62%) on a short screen, never cropped.
- **The design gallery** fills the screen and turns in pages.

Rows that only report something got slimmer on short screens rather than
pushing the board off: below 700 pixels the stats read across one line, the
best-result line waits for the results screen and the gallery card (both still
show it), and Versus's own zoom button is the way back to both boards. A
`ResizeObserver` on the rows refits the screen when one of them grows: a
longer prompt, a second line of rent.

**Every window is laid out the same way** (`.sheet.win`): a head with the title
and its **Close** or **Back**, an optional row of tabs, the body, a page bar and
a foot of actions. Every overlay in the game uses it: the shop's dialog, the
drawers, How to Play, the symbols, Endless Upgrades, the results, the name field
and the confirmations. In the shop's dialog the way out is taken from the
actions it is given (`Back` or `Close`) and put in the head, where it is in
every window; two actions sit side by side, and three or more two to a row, so
the actions never crowd out what they act on. The background stays visible,
only slightly darkened, and the room's lighting stays under every window (the
1.34 isolation still holds; a check still compares the pixels).

**Pages, not scrolling** (`pgFit`). A window body that holds more than fits is
measured where it stands and grouped into runs that fit. Everything outside the
current run is set aside with `display:none`, and nothing is moved, copied or
re-rendered to turn a page, so the listeners on a body, the focus in it and any
form state survive, and a dialog redrawn by a stepper tap stays on its page.
The rules for where a page breaks:

- a plain section or list is split between its own rows; a drawn box (a card
  with a border or a fill) is kept whole unless it is taller than a page;
- items side by side in a grid turn over together, so a grid keeps its columns;
- a heading never ends a page; it goes over with what it heads;
- every page is checked as shown, margins and all, and the runs are cut shorter
  until each one fits.

A window keeps one size through its pages, says "Page 2 of 5", and remembers its
page: a drawer reopens on the tab and the page it was left at, and a dialog
reopened from scratch starts on its first page while one returned to with Back
is as it was left. Prev and Next only ever turn pages; they never act on the
game.

**One window at a time.** A window opened from another (a stand from the
Shelves drawer, a person from Customers, a blueprint from the Almanac) puts the
one underneath out of sight until it closes, so there is only ever one to read,
and its Back leads to the one before. Confirmations and the name field are
small questions about the window under them and leave it in view. A window
opened from the room is docked at the foot of the screen with the room above
it, unless it would not fit there, in which case it has the whole screen for as
long as it stays open (a run of customers at the counter does not hop about). A
note announced while a window covers the shop's prompt line is shown over
everything for a moment as well.

**The storefront is seen from fixed viewpoints.** The room is wider than a
phone and is never scrolled. It is seen from **Workshop**, **Floor** and
**Front**. Once the shop has grown past one screen of floor, the floor is taken
in sections ("Floor 2/3"; pressing Floor again moves along it), each
overlapping the last by a column, so every stand is seen whole from some view.
A sideways swipe, or the arrow keys, moves one view along; a wheel does
nothing. The positions are in the room's own units and scaled with the room.
The phase playback's camera still pans as before and still comes home to the
view the player was on.

The paperwork moved off the shop floor into windows. **Inventory**,
**Business** and **Staff** under the room open drawers, each a window whose tabs
are the old tab row; the old list under the room is gone, so the room and its
actions always fit. The line under the actions says how many are working and
opens the Staff drawer: the names are on the figures in the room and in the
drawer, not in a line that grew with the staff. Edit Shop's tray lies over the
rows under the room rather than pushing them away, and pages its stands in the
back. Main Menu is the menu button in the top bar, as in every other mode.

**The Almanac** is a book with the whole window. The crafts are a grid of
cards, two to a row and paged. A craft's tree is drawn to fit the window: its
columns share the width, and its tiers (one per step along the craft) are shown
as many at a time as the height holds. A tree with more tiers turns with
**Earlier** and **Later**, and each page after the first opens on the last tier
of the page before, so every line of the progression is seen whole on some page
and a line leading off the page is drawn as a dashed stub. The named
masterworks are a page of their own, from a button under the tree. Costs, XP,
requirements and what a tap on a blueprint does are unchanged.

**How to Play** has a tab for each mode (Basics, Forge, Endless, Versus, Your
Forge) and opens on the one being played. The movement rules under the board
became a **Symbols** button that opens them in a window.

**Back follows the same path everywhere.** `window.checksmithBack()` closes the
window on top, or steps Back to the one it came from, then leaves editing or
skips a playback, then asks to return to the main menu, and on the main menu
reports `false` so the app closes. The Android shell's back gesture calls it
(with the old behaviour kept only as a fallback), and Escape does the same short
of leaving. A confirmation is dismissed as No, and a question that must be
answered (a customer at the counter) is not dismissed at all.

**Nothing about the game changed.** No rule, score, generator, price or save
field was touched: the core block is byte-for-byte the core of 1.42, all 1036
core checks pass unchanged, and the board fingerprint is the same. Opening, closing and paging windows, switching drawers and views, and
looking about the Almanac never spend a phase or change the forge; a browser
check tours every drawer, page, station, view and window of a fully grown forge
and compares the forge before and after.

## Scene first: the shop is the screen (1.44)

Open Your Forge is the shop itself now, drawn edge to edge between two slim
dark bars, and everything the old rows of buttons and drawers did is done by
walking up to the thing in the shop that does it. This replaces the 1.43
viewpoints, the status card, the action and drawer rows and the crew line.

**The bars.** The bar over the shop says the day and the phase, the gold and
the rating, has the **menu** (☰), and names the three places; the one in view is
underlined. The bar under it shows how far through the day it is (three pips)
and ends the phase. On the shop floor it also has **Arrange**, which is Edit
Shop. Rent, wages, staffing and money moved into the objects that own them, and
what the player must not miss is said as a **notice**: one line over the top of
the shop that fades by itself, said over a window if one is open. The day's
first notice says when the weekly bill falls due within two days (and by how
much the purse is short), and when a commission is due today or tomorrow.

**Three places, each composed for a phone.** Each place is laid out once, in
its own 360×600 units, and drawn as large as the space between the bars allows
without cropping a fixture. Its backdrop is drawn past those units out to the
screen's edges, so a taller, wider or shorter phone sees more wall, floor, sky
or street around the same furniture and never an empty margin.

- **The Workshop**: the forge (it grows grander with its upgrade level), an
  anvil for every Smith's place, the storeroom shelves (showing the metals and
  ore held), the supplies crates and the Almanac's blueprint table, with the
  quench tub and coal scuttle on the flagstones. Smiths stand behind their
  anvils, or at the forge's mouth when smelting; the apprentice works the
  bellows.
- **The Shop Floor**: the displays in rows, as large as the floor allows (three
  across, then four, then five as the floor grows) with a roped-off space while
  it can still grow; the counter with the Salesperson behind it; the ledger on
  its lectern; and the plans for the next improvement pinned to the wall. More
  windows appear on the back wall as the building grows.
- **The Front**, from the street: the sign with the shop's name, the door
  (closed, and open while a phase plays out), the **hiring board** to the left of
  it and the **commission board** to the right, neither touching it, lanterns
  either side, the cart on the cobbles once there is a vehicle, and the Runners
  on the street.

**Swiping is how you move.** A finger drags the three places sideways and, let
go, they glide to a whole place: the next one along when the swipe went a fifth
of the way across or was flung, back where they were otherwise. Past the first
and last place the row gives a little and no further. The camera never rests
between two places. A tap is never a swipe (a press that moved more than ten
pixels does not land as a tap), and a swipe is never a tap. The names in the top
bar and the arrow keys move between places too. Nothing moves while a window is
open or while the floor is being arranged, and closing a window leaves the
camera where it was. A shop opens on its floor.

**The environment is the button.** Every fixture is a labelled object with a
generous touch area that lifts under the finger; objects with something waiting
carry a small badge (offers on the commission board, staff ready for promotion
on the hiring board, goods ready to cart at the door, the bill coming due at the
ledger). Employees, displays and empty floor are tappable too, as before.

**Every object opens one window, organised by what it is for**, with a tab for
each page of its subject, its own art in the head, and its actions at the foot:

| Object | Window and tabs |
|---|---|
| Forge, anvils | **Forge**: batch size, forge level and ingots at a glance; Special Commissions worked at the anvil; batches cooling; who is at the anvils this phase (Smith and Apprentice places, tap to assign). *Forge a Batch.* |
| Storeroom | **Storeroom**: *Metal & Ore* (a tile per metal; ore to smelt) and *Finished Goods* (a tile per line, quality at a glance; what arrives tomorrow). |
| Supplies | **Supplies**: today's market prices and the Runner's places. *Buy Metal.* |
| Almanac table | **The Checksmith Almanac**, as in 1.43. |
| Counter | **Counter**: *Counter* (what is on display, the town, the rating, who is behind the counter; *Tend the Store*), *Displays* (every stand; *Arrange Floor*, *Buy Stand*), *Customers*. |
| Ledger | **Ledger**: *Accounts* (the purse, the next bill and whether it is covered, the bill line by line, the next commission due, and the money the shop's records show: sales, Runners' purchases, carted commissions, weekly bills), *Properties* (mines and deeds). |
| Plans | **Upgrades**: *Shop* (Store Expansion, each display, the fittings), *Workshop* (Forge, Smith Staffing), *Staff* (Employment, the other Staffing tracks, Salesperson Earnings). Every card says its level, what it gives now, what the next level changes, the cost, and whether it can be bought. |
| Hiring board | **Hiring Board**: *Employees* (the roster, promotions called out), *Schedule* (the day's roster), *Hire* (a card for each trade, how many are hired, "See applicants"). |
| Commission board | **Commission Board**: *Available*, *Active* and *Completed*, each with **Special Commissions** (gold-sealed, no deadline, design → mold → perfect forge) and **Bulk Orders** (a lot, a deadline, a price) kept apart. Completed bulk orders are remembered per forge, outside the save itself. |
| Door, cart | **Entrance**: *Deliveries* (what is crated and ready to cart, deliver it yourself, the Runner's places) and *Vehicles*. |
| Sign | **Shop Settings**: name, phase animation, worker camera. |

Opening a window, switching tabs, turning pages and swiping never spend a
phase; only the actions that always did still do.

**The menu (☰)** replaces the top bar's mute, volume and leave buttons in every
mode. It holds sound (mute and volume), the mode's own items (Shop Settings in
the shop, Symbols on This Board on a board), How to Play, and the way out (Save
and Leave in the shop, Main Menu elsewhere, asking first wherever leaving loses
something). Android's back gesture closes the window on top, then leaves
arranging or skips a playback, then opens the menu; on the title it still
closes the app.

**The phase playback** visits the places: the camera goes to the place each
employee works in, waits until it is there, plays their job and moves on, and
comes back to the place the player left. Swiping or choosing a place takes the
camera for the rest of the phase. Customers walk in to the counter, Runners walk
off down the street, the door stands open.

**The other modes, board first.** How to Play moved from every board's row into
the menu, and Main Menu with it, so the rows under the boards hold only what
acts on the board (Restart, All Designs, New Puzzle, Symbols; Concede in
Versus). The **Forge's gallery** is an item picker: the chosen design fills the
screen (its shape, name, difficulty, size, parts and best result) over a strip
of every design, and **Forge the Dagger** (or whichever is chosen) lays it on
the anvil. **Versus** stands its two boards one above the other, each with its
score beside it, whenever that makes them larger, which on most phones it does.
**Results** lead with the outcome ("Masterwork", "Stranded") in large letters,
then the quality, then the details.

**Windows** are one family in the fantasy style: dark wood, a bronze edge, a
gold title, a crest or the object's own art in the head, Close or Back in the
same place, over a visible, darkened shop. The shop's light and glow are still
isolated under every window.

**Responsive.** Portrait phones get the full layout with safe areas padded in
both bars. On a phone on its side the bars become a column beside the shop. The
Android build is held in portrait.

**Nothing about the game changed.** The core is byte-for-byte that of 1.43: all
1036 core checks pass unchanged and the board fingerprint is the same. Saves
load as they were; the only new stored data are the remembered completed bulk
orders, kept beside the saves.

## Dialogs to match the windows (1.45)

Every smaller dialog in Open Your Forge, from buying ingots to a runner's
errand, is now built like the object windows of 1.44: the thing it is about in
the head, choices as tiles to tap, and the numbers that decide it in one short
table. No dialog has a drop-down list any more, and none scrolls; a long one
turns pages like the windows do.

**The parts.** Each dialog is put together from the same few pieces, so they
read alike:

- a **hero** card: the item, stand, person, mine or ore the dialog is about,
  with the one figure that matters most beside it (what it is worth, how many
  are on display, the wage, the balance owed);
- **tiles** for every choice, with art and a line under the name: metals with
  what is held, items with board size and worth, vehicles with what they carry,
  mines with the ore waiting, employees with their rank. A choice that cannot be
  taken is shown greyed with the reason, rather than left out, so the dialog
  looks the same however much the shop owns. Long lists are split: the forge's
  blueprints are a row of craft chips over one craft's items at a time;
- a **quantity** box: the stepper, a **Max** button, and a bar showing today's
  limit against how far it could grow;
- a **summary** table of the figures behind the choice, in the same place in
  every dialog;
- big **option tiles** where the choice is between whole jobs (a runner's
  market, ore or delivery; a smith's anvil or furnace), each saying what it
  would do now, or why it cannot.

**Growth in view.** The shop grows, and every dialog that hits a limit says
which limit it is, how far it can still go and what the next step costs:

- **Forge a Batch**: the batch size against the largest the Forge upgrades
  allow.
- **A stand**: its display level as pips, what the level adds to every sale
  and what the next level costs. The upgrade is bought in the stand's own
  dialog.
- **Buy Stand** and an **empty or locked floor space**: floor space used
  against the floor's size, and what a Store Expansion costs and how many are
  left. On a full floor the stand catalogue stays in view, greyed, and **Expand
  the Floor** buys the next space right there.
- **Search for Employees**: staff places against capacity and the next
  Employment cost; for miners, the mine's places and the next shaft. When every
  place is full, **Add a Staff Place** (or **Sink a Shaft**) is the first
  button.
- **Assigning a role**: how many of that role may work each phase, and what
  that role's Staffing upgrade costs. Everyone in the trade is listed, the busy
  ones greyed with what they are doing.
- **Collect Ore**: which of the mine, the vehicle and the ore storage is
  holding the trip back, and what would loosen it (a larger vehicle, or Storage
  Racks).
- **Smelting**: the smith's rate now and at the next rank.
- **Employee card**: the rank ladder as pips, the XP bar, and what the rank
  gives now and after promotion side by side.

Buying a level, a space or a place from inside a dialog costs gold and never
the phase, exactly as it does at the Upgrades board.

**Everything else** was brought into line: price presets either side of the
recommended price with how much less likely a higher price is to sell; the
Repeat Daily editor as tiles (an employee, the job, the item and metal, the
batch) with what would happen if it ran now; the customer card as a grid of
what is known; the delivery and hand-over dialogs with the vehicles as tiles;
the mine as four figures, its miners, its applicants and three upgrade tiles;
reports and the phase summary opening on the outcome ("4 items sold", "+233g
taken"); the morning report as tiles for what was forged, learned and dug; and
Shop Settings as two clear switches.

**Nothing about the game changed.** The core is byte-for-byte that of 1.44:
all 1036 core checks pass unchanged and the board fingerprint is the same.
Saves load as they were.

## Smiths, specializations and research (1.46)

Three changes to Open Your Forge. The puzzle, the player's own batches and
Special Commissions are untouched: the one-piece rule below is for employed
Smiths only.

### A Smith makes one piece a phase

A Smith no longer forges a batch. Each Smith on a phase makes **one
attempt** at one item, and several Smiths in the same phase make separate
attempts. An attempt uses one ingot and either comes off or does not:

| Rank | Comes off | Quality rolled (inclusive) |
|------|-----------|----------------------------|
| E | 75% | 55–65 |
| D | 80% | 60–70 |
| C | 85% | 65–75 |
| B | 90% | 70–80 |
| A | 95% | 75–85 |
| S | 98% | 80–90 |

The two rolls are independent. Final quality is the roll, plus specialization
bonuses, less flaw penalties, clamped to 0–100. **Masterwork is exactly 100**,
whoever made it: a Smith who reaches 100 through their specializations makes
the same Masterwork as a perfect puzzle (an S-rank's 90, +1 passive and +9
from Quality III is 100). The old 85–99 "Masterwork" band is now **Superb**;
every other band and the price curve are unchanged.

A failed attempt makes nothing and still spends its ingot. The old batch
spoilage is gone. A finished piece goes into the same order queue as before:
in storage, or a commission's crate, the next morning. Smiths now earn rank XP
for every attempt (6) and more for each piece made (10 each).

### Specializations

A Smith grows into lines of work by doing them. Every attempt counts towards
its **craft** and its **metal** (+2 made, +1 failed), and each phase at the
furnace counts towards that ore (+1). The list is built from the game's own
tables: one craft specialization per category (Sword Smith, Shield Smith,
Arrowsmith, …) and one metal specialization per metal (Bronze Smith to
Adamantine Smith).

- **Discovered** at 5 XP. It is then offered on the Smith's card. The player
  can look it over, tree and all, and **accept** it or leave it. Leaving it
  loses nothing.
- **Accepting is permanent** and takes one of **three slots**. A flaw takes a
  slot too, and only one may be a flaw. A full Smith discovers nothing more.
- On acceptance it gives a small **passive** at once, but no perk.
- Its own XP then buys **three perk choices**: +10 XP at any rank, +20 more at
  **C-rank**, +30 more at **A-rank**. No XP towards a choice is earned until the
  rank is reached, none is paid backwards for earlier work, and XP stops at
  the choice still waiting, so nothing spills past it.
- Each choice opens Level I of a path or raises a taken path one level, up to
  III. The same three paths can take all three choices or share them. The
  rules refuse an illegal choice, not just the screen.

| Kind | Passive | Path I / II / III (current bonus, plus the passive) |
|------|---------|------------------------------------------------------|
| Craft | +1% sale value, +1 quality, +1% extra-item chance | **Value** +5/10/15% · **Quality** +3/6/9 · **Production** +2/4/6% |
| Metal | +5% Conservation, +1% bonus ingot, +1 quality | **Conservation** +25/50/75% · **Smelting** +2/4/6% · **Metallurgy** +3/6/9 |

So a focused tree tops out at +16% value, +10 quality, 7% extra item, 80%
Conservation, 7% bonus ingot or +10 Metallurgy. Craft Quality and metal
Metallurgy stack, and nothing passes 100.

- **Production** rolls once per piece made in that craft. A success adds one
  more piece from the same ingot, with the same quality and blueprint level.
  The extra piece never rolls again.
- **Conservation** rolls once per *failed* piece in that metal, after the ingot
  is spent and after any flaw, and gives exactly one ingot back.
- **Smelting** rolls for a bonus ingot on each ingot smelted. Throughput is
  still the rank's.
- **Value** is written on the pieces that Smith made and travels with them
  through storage, stands, commission crates and back. It blends by the piece
  exactly as quality and blueprint level already do, so a lot of one
  specialist sword and three ordinary ones carries a quarter of the bonus on
  each, and the total is never lost or spread to other goods.

### Flaws

About 30% of Smith applicants (`SHOP.specialties.flawChance`) come with one
permanent flaw, shown on the hiring board before they are taken on:
**Careless** −5 points crafting success, **Heavy-Handed** −5 quality,
**Wasteful** 20% chance a failure spoils one more ingot, **Poor Smelter** 10%
chance to waste one more ore a smelting phase, **Shoddy Workmanship** −5% sale
value on everything they make. Each applies at most once per action. Hands
from older saves keep no flaw. The data is written per role, so other trades
can be given specializations and flaws later; only Smiths have any now.

### The Smith's card

A Smith's card shows rank and rank XP, the three slots (specializations, a
flaw in red, empty slots), discoveries waiting, and what the work is still
working towards. Each specialization opens its **tree**: three paths of three
levels, with acquired levels lit, the levels a waiting choice could take
glowing, and locked levels saying what stands in the way (XP or rank). A
discovered specialization shows the same tree before it is accepted.
Accepting and choosing a perk are each confirmed, saying that they are
permanent. Cards with a decision waiting are flagged on the Staff board.

### Researching a craft

A craft beyond the two a forge opens with is now **researched**, not bought,
from its page in the Almanac. The reputation requirement and 900g price are
gone.

- **Cost**: 50g for the first researched craft, then 150g, 250g, 350g, 450g
  and so on: 50g plus 100g for every craft already learned this way. It is
  paid when the study begins. Abandoned study is never counted.
- **Three full days**. Each is begun in the morning and committed one at a
  time. A day of study is the player's whole day: no forging, counter,
  buying, smelting, delivering or hiring yourself. Staff work as normal and
  the phases are ended as usual. The day counts when it is over.
- The days need not run together, and a break costs nothing.
- Only one craft is studied at a time. Turning to another is confirmed with a
  warning, and throws away the days and the gold. Coming back later costs the
  full price again.
- The third day unlocks the craft and its first blueprint at level 1.
  Blueprints, levels and craft XP work exactly as before.

Sixty-seven new core checks cover these rules, including every rate and range,
Conservation, Production, the flaws, the slot and rank gates, research costs,
timing and switching, and saves. Twenty-two new browser checks cover the Smith's
card, the tree, accepting and choosing, the one-piece order, flaws on the
hiring board, research in the Almanac and the morning report. The puzzle
generators are byte-for-byte unchanged.

**Saves** from 1.45 load unchanged. Staff gain no flaws and no
specializations, every order and lot carries no value bonus, and no study is
under way. Production orders now also keep their blueprint level and
commission across a reload, which they previously lost.

## Menus close at the turn of a phase, and notes name the goods (1.47)

**A phase that passes puts everything away.** Whenever a phase actually
advances (ending it from the bar, finishing a batch at the anvil, closing the
counter, stocking stands, or any other way; all of them pass through the one
`shopAdvancePhase` call) every window,
page, menu and question still open is closed and the shop is in view again. A
question left open is answered *no*, never *yes*. The camera stays exactly
where it was: Workshop, Shop Floor or Front. What the new phase opens itself
(its summary, a new day's report) still opens as before. Nothing that spends
no phase closes anything: opening a window, turning its pages, backing out,
free actions such as buying a stand, and an attempt to end a phase that cannot
be ended (one still playing out, or a closed forge) all leave the windows as
they were. `shopCloseMenus()` is called from the one place a phase is spent,
`shopSpendPhase`, and only when `shopAdvancePhase` reports that it advanced.

**The small notes say what the goods were.** The floating notes over the
scene during the phase playback, and the notice line for the player's own
work, now name each item and count it:

| Who | Before | Now |
|-----|--------|-----|
| Smith | `+1 made` | `+1 Silver Longsword Made` |
| Store Hand | `+3 shelved` | `+3 Bronze Daggers Stocked`, one line per kind of item |
| Salesperson | `+58g` | `+58g`, with `+1 Silver Longsword Sold` above it, one line per kind |
| You, stocking | `Stocked 4 items onto stands.` | `+3 Bronze Arming Swords Stocked · +1 Silver Arming Sword Stocked` |
| You, at the counter | `Afternoon has started.` | `+2 Bronze Arming Swords Sold · +1 Silver Arming Sword Sold` |
| You, at the anvil | `Afternoon has started.` | `+2 Bronze Arming Swords Made` |

Names come from the item and metal tables through `lineCount(key, qty)`: one
piece takes the item's name, more than one its plural from `itemPlural(it)`.
Most names take an *s* (*Knife* to *Knives*, *Lockbox* to *Lockboxes*), names
that are already a pair or a set stay as they are (*Reinforced Boots*,
*Arrowheads*), and the three whose plural is their own carry it in the table
(`plural`: *Becs de Corbin*, *Decorative Gatework*, *Sovereign’s Aegises*). The
notes keep their animation, place, timing and colours. A long name is drawn in
from the edge of the place so none of it is cut off, and one wider than the
place itself wraps, centred. Several kinds of goods stack one a line. The
Smith's smelting note (`+2 ingots`) and the gold note are unchanged, and no new
panel or summary was added.

The rules are untouched: the phases advance exactly as before, the economy and
staff are the same, and the board fingerprint is unchanged. Four new core
checks cover the names and plurals; fifteen new browser checks cover every
kind of window closing at the turn of a phase from each of the three places,
nothing closing when no phase passes, the notes of every worker and of the
player, and long names and long lists staying inside the place.

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
CONFIG.pools                           // SYMBOLS BY BOARD SIZE - the one table
CONFIG.hardening                       // how many layers a crust can be
CONFIG.difficulties.master.size        // board edge length
CONFIG.difficulties.master.morphChance // odds a first strike reshapes a square
CONFIG.difficulties.master.hardenChance// odds a square comes up hardened
CONFIG.rules.perfect                   // strikes that finish a square
CONFIG.rules.spent                     // strikes that blank a square for good
CONFIG.endless.pointsPerStrike         // endless: points for each strike
CONFIG.endless.roundBonus              // endless: points for clearing a board
CONFIG.endless.materials               // the named metals, in order
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
CONFIG.versus.difficulties             // versus: how far ahead the rival thinks
CONFIG.versus.scoring                  // strike, pair, trio, variety, route step
CONFIG.versus.upgrades                 // versus upgrade ids, costs and targets
CONFIG.versus.ai.comboWeight            // how hard the rival plays for combos
CONFIG.versus.ai                       // rival node, time and think budgets
CONFIG.versus.generation               // attempts and mobility tolerance for board pairs
SHOP.materials                         // strikes per square, ingot cost and value
SHOP.categories                        // the sixteen shelves of the catalogue
SHOP.items                             // every recipe: size, price, tree depth, needs, tags
SHOP.special                           // special commission odds, step, patience and cooldown
SHOP.specials                          // the eight: trade, reputation, phases, metal, silhouette
SHOP.categories[].root / .blurb        // each craft's first blueprint, and its card
SHOP.craft.maxLevel / .levelValue      // how far a blueprint goes, and what each level is worth
SHOP.craft.xpBase / .xpPerSize         // experience for one piece, and what a bigger board adds
SHOP.craft.xpMaterial / .xpQuality     // how hard the metal and the work pull on it
SHOP.craft.upgradeCost / .upgradeSize  // taking a blueprint a level further
SHOP.craft.unlockCost / .needLevel     // learning a new one, and how far its parent must come
SHOP.craft.startingPicks               // how many trades a new forge chooses
SHOP.craft.disciplineRep / .Cost       // what taking up a further craft asks for
SHOP.legacyRecipes                     // what a pre-craft save is read as having known
SHOP.stands / SHOP.standHold           // the six fixtures, and how much one holds
SHOP.customers                         // the trades: budget, haggle, standards, income
SHOP.town                              // town size, wants, purses and how fast they refill
SHOP.intel.wealth                      // the five bands a customer's means are read as
SHOP.intel.tastes                      // how many likes and dislikes are learnable
SHOP.intel.playerOdds / .staffOdds     // reading somebody over the counter
SHOP.intel.staffPerPower / .triesPerPower  // what a salesperson's rank buys
SHOP.vehicles                          // the yard: what each carries, costs and trades up for
shop.standing[]                        // the roster kept day after day: role, phase, hand, orders
SHOP.quality / SHOP.qualityBands       // what the puzzle result is worth, and its five names
SHOP.purseBase                         // what a middling customer thinks twice at
SHOP.roles / SHOP.ranks                // the five jobs, the six grades and their wages
SHOP.tiers                             // base rent, staff, stands, storage, batch (tier 1 for new forges)
SHOP.growth                            // every Growth track: key, price curve, ceiling, step
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

## Player-facing text

Every label, button, prompt and description says what a feature does, in plain
terms, with the numbers the code actually uses (1.37 audit). The conventions:

- **Buttons** are short actions: *Hire · 9g/wk*, *Unlock Blueprint · 70 XP*,
  *Accept Commission*, *Deliver (Uses Phase)*. Anything that spends the phase
  says so on the button or in the line above it.
- **One name per thing**: *commission* (a customer's bulk request, never
  *contract*), *order* (a batch at the anvil), *stand*,
  *storage*, *ore storage*, *staff place*, *floor space*, *XP*, *rival* (Versus),
  *Customers* tab, *Shelves* tab, *Endless Upgrades*.
- **Numbers come from the tables.** Text that quotes a value reads it from
  `CONFIG` or `SHOP` (`SHOP.commission.repFailed`, `SHOP.mining.hireWeeks`,
  `CONFIG.endless.morphStep`, ...), so a rebalance never leaves a stale figure.
- **How to Play is generated**: `helpHtml()` builds the help sheet at boot from
  the same tables (symbol pools by board size, metal strike counts, Versus
  powers, growth tracks, vehicles, quality bands), one short section per mode.
- Error messages from the core (`why`) are lower-case fragments that read on
  their own in a toast: *requires 18 reputation*, *storage is full*.

## Tests

```sh
node tools/verify-core.mjs                                  # 1108 rule/generation checks
node tools/verify-ui.mjs                                    # 1073 browser checks (Playwright)
node tools/design-specials.mjs <id> [seeds]                 # lay out a special commission's puzzle
PW_PATH=/path/to/playwright node tools/verify-ui.mjs        # if Playwright is installed globally
```

`tools/verify-core.mjs` extracts the core block from `index.html` and exercises
it directly, so the tests run against the shipped file rather than a copy.

The Forge mode lays its dagger now, but the square boards it used to deal are
still what Endless and Open Your Forge's anvil play on, and the browser checks
for striking, reshaping, crust, spending and losing were written against the
Forge screen. They keep running there: a check that names a difficulty for the
Forge has that square board dealt onto the Forge screen through a test-only hook
(`window.CHECKSMITH.squareForge`), which nothing a player can reach calls. The
designs have their own sections: the gallery, every design laid out, lit and
forged to the end through the interface, switching between them, and every
design again at seven screen sizes.

The shop's checks (1.44) take the player's path: an object is tapped and the
action pressed at the foot of its window, the menu is opened from whichever bar
is showing, and the places are moved between by swipe (mouse and touch), by the
names in the top bar and by the arrow keys. They prove a tap never swipes and a
swipe never taps, that a window holds the camera still and closing it leaves the
camera where it was, that the phase playback visits each place and comes home,
and that every window and page of a fully grown forge fits at five screen sizes
without scrolling or spending a phase.

## Not in this prototype

Business management, shops, inventory, crafting economies, blueprints and the
world map are deliberately out of scope. Pawns are omitted: their directional and
capture rules would need game-specific decisions that this puzzle does not make.
