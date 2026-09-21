# Forge Pattern

A smithing puzzle for the phone, and the standalone minigame for a future fantasy
business game. The board is a metal mold; every square carries a permanent chess
symbol that describes movement. Strike every square exactly twice and you produce
a masterwork.

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
3. Two strikes forge a square perfectly. A third cracks it and costs quality.
   Damaged squares stay usable, and revisiting them is sometimes the only way to
   finish.
4. The board finishes by itself once every square has at least two strikes.

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

| Difficulty | Board | Piece pool | Strikes for perfection |
| --- | --- | --- | --- |
| Novice | 3 × 3 | King, Rook | 18 |
| Apprentice | 4 × 4 | King, Rook, Bishop | 32 |
| Journeyman | 5 × 5 | King, Rook, Bishop, Knight | 50 |
| Master | 6 × 6 | King, Rook, Bishop, Knight, occasional Queens | 72 |

Scoring at completion:

```text
N            = number of squares
overstrikes  = sum(max(0, square.strikes - 2))
quality      = max(0, round(100 * (1 - overstrikes / (2 * N))))
```

100 = Masterwork · 90–99 Excellent · 75–89 Good · 50–74 Rough · 0–49 Poor. There
is no time penalty. Best quality per difficulty and your audio settings are
remembered locally when storage is available.

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
CONFIG.difficulties.master.pool        // piece pool used by the route search
CONFIG.difficulties.master.maxQueens   // queens promoted in after the search
CONFIG.generation.nodeBudget           // search nodes before giving up
CONFIG.generation.timeBudgetMs         // hard wall-clock cap per board request
CONFIG.animation.strikeMs              // full hammer action (250-350ms feels right)
CONFIG.animation.impactAt              // fraction of strikeMs where the head lands
CONFIG.animation.reducedMs             // duration under prefers-reduced-motion
CONFIG.animation.liftDeg / .sparks     // swing arc and spark count
CONFIG.scoring.perfect                 // strikes that make a square perfect
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
node tools/verify-core.mjs                                  # 65 rule/generation checks
node tools/verify-ui.mjs                                    # 67 browser checks (Playwright)
PW_PATH=/path/to/playwright node tools/verify-ui.mjs        # if Playwright is installed globally
```

`tools/verify-core.mjs` extracts the core block from `index.html` and exercises
it directly, so the tests run against the shipped file rather than a copy.

## Not in this prototype

Business management, shops, inventory, crafting economies, blueprints and the
world map are deliberately out of scope. Pawns are omitted: their directional and
capture rules would need game-specific decisions that this puzzle does not make.
