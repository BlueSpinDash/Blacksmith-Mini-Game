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

## Versus the Rival

The mode menu at the top switches between **Solo** and **Versus**. In versus you
and the Rival take turns on *one* board. Every blow either of you lands counts
for both of you, so the work fills twice as fast — but you each have your own
hammer standing on your own square, so you rarely have the same moves available.

The blow that takes a square from one strike to two is its **perfecting blow**,
credited to whoever landed it. When the board finishes, whoever landed more
perfecting blows wins. Run out of legal strikes on your turn and you lose on the
spot, which makes blanking a square the Rival is standing on a real tactic.

**One extra rule makes it fair: freshly shaped metal is too hot to finish.** A
square that took its first strike on the previous swing cannot take its second on
the very next one. Without it, strict alternation is a solved game — whoever
moves second simply finishes whatever the other just started and takes every
blow. Measured over 120 self-play bouts per difficulty, with both sides using the
same evaluation:

| First-mover win rate | Novice | Apprentice | Journeyman | Master |
| --- | --- | --- | --- | --- |
| Without cool-off | 3% | 18% | 34% | 23% |
| **With cool-off** | **33%** | **38%** | **47%** | **51%** |

Journeyman and Master are close to even. Novice stays second-mover-favoured: a
3×3 board of kings and rooks is small enough that the harvest still dominates, so
treat versus on Novice as a tutorial rather than a fair fight. Set
`CONFIG.rules.coolOff` to `false` to play without the rule and see for yourself.

The Rival is a one-ply search: it wants perfecting blows, avoids spending
squares, keeps its own room to move, and mildly prefers leaving you with fewer
options. `CONFIG.ai.thinkMs` sets its pause before swinging and `CONFIG.ai.jitter`
how much randomness it adds, so it does not replay the same bout twice.

Rooks, bishops and queens slide over anything in the way; only the destination is
struck. There are no captures, no blockers, no timer. Tapping the square you are
already on is not a move.

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
CONFIG.rules.coolOff                   // versus: a square shaped last swing cannot be finished yet
CONFIG.ai.thinkMs                      // the Rival's pause before it swings
CONFIG.ai.jitter                       // randomness in the Rival's move scores
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
node tools/verify-core.mjs                                  # 117 rule/generation checks
node tools/verify-ui.mjs                                    # 111 browser checks (Playwright)
PW_PATH=/path/to/playwright node tools/verify-ui.mjs        # if Playwright is installed globally
```

`tools/verify-core.mjs` extracts the core block from `index.html` and exercises
it directly, so the tests run against the shipped file rather than a copy.

## Not in this prototype

Business management, shops, inventory, crafting economies, blueprints and the
world map are deliberately out of scope. Pawns are omitted: their directional and
capture rules would need game-specific decisions that this puzzle does not make.
