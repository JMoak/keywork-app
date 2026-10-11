# keywork-app: Textures of Record

MIRROR: keywork `docs/textures.md`. A texture is a small correctness detail people feel without
naming; each one here carries a ratchet, a number that may only improve. Every number lives in
one file, [`scripts/textures/ratchets.json`](../scripts/textures/ratchets.json), each with a
direction (`better: higher | lower`) and a written `why`. The tests read the file and fail on the
worse side of a number; `bun run check:textures` (part of `check`) measures what it can without a
DOM, fails a regression, and fails any value that loosened against `HEAD` without a rewritten
`why`, pins-style.

| Ratchet | Number | Better | Measured in |
|---|---|---|---|
| `T1.graphemeCorpusSamples` | 17 | higher | `packages/ui/src/composer/textures.test.tsx`, `check:textures` |
| `T2.floodBytes` | 5242880 | higher | `packages/ui/src/composer/textures.test.tsx` |
| `T2.floodLines` | 10000 | higher | `packages/ui/src/composer/textures.test.tsx` |
| `T2.floodDraftChars` | 33 | lower | `packages/ui/src/composer/textures.test.tsx` |
| `T6.minMarginLc.keywork-night` | 3.1 | higher | `packages/ui/src/flavor/textures.test.ts`, `check:textures` |
| `T6.minMarginLc.keywork-day` | 13.1 | higher | `packages/ui/src/flavor/textures.test.ts`, `check:textures` |
| `T7.emptyStateMinWidthPx` | 127 | lower | `packages/ui/src/panes/registry.test.ts` |
| `T8.eventsPerFrame` | 800 | higher | `packages/ui/src/shell/frame-tick-budget.test.tsx` |
| `T8.reducerStepsPerFrame` | 14 | lower | `packages/ui/src/shell/frame-tick-budget.test.tsx` |
| `T8.firstPaintElements` | 185 | lower | `packages/ui/src/shell/frame-tick-budget.test.tsx` |

## T1: grapheme-correct editing

The corpus (`composer/grapheme-corpus.ts`: combining marks, ZWJ and skin-tone emoji, flags,
keycaps, Devanagari, Hangul jamo, Hebrew, Arabic, bidi mixes, CJK wide, zero-width characters,
astral surrogate pairs, tabs, newlines) goes through the real composer: the caret walks one
cluster per step both ways, Backspace and Delete erase one whole cluster even with the caret
inside one, and the submitted text is byte-identical in UTF-8. The composer trims the outer
whitespace of a prompt exactly as keywork's does, so samples carry whitespace inside only. A new
text surface registers by running the corpus; a new hard family raises the sample count.

## T2: paste-flood survival

A paste past six lines or 4096 characters lands as one placeholder,
`[pasted #1, 10528 lines, 5.0 MB]` (keywork's `[pasted #n, N lines]` with the UTF-8 size added),
and expands in place on submit. Pasting never submits; one Backspace erases a held paste whole.
The frame budget is counted, not timed: the textarea lays out the placeholder, never the
payload, so `floodDraftChars` bounds what a flood costs the frame.

## T6: first-class light

`flavor/contrast-audit.ts` measures every composited pair with keywork's APCA floors (text 60,
textMid 30, textDim 15, border 5, focus, accent, outcomes and the density ramp) and checks
polarity: every pair in a light flavor reads dark-on-light and every pair in a dark one reads
light-on-dark, so a tinted dark flavor fails. The ratchet is each flavor's smallest headroom
above its floor, so a flavor that drifts toward the floor fails before it crosses it.

## T7: empty states that teach

The pane inventory renders each empty state with marked keys and requires exactly two parts,
`state · action`, with no chord in the state and exactly one bound chord in the action. The
narrowest width a line needs is its padding plus its longest unbreakable run at a worst-case
monospace advance (0.6em at 16px); it must fit 320 px and the ratchet.

## T8: latency honesty

Every recorded fixture is streamed one character per event through `batchPerFrame` and
`frameTick` at `eventsPerFrame` events a frame; the projection must equal the unbatched one and
the busiest frame may take at most `reducerStepsPerFrame` reducer steps. The conversation pane's
first paint over every fixture builds at most `firstPaintElements` DOM elements. Work is
counted, so the numbers hold on any CI runner.

## Moving a number

- **Tightening** (the common case): when a change improves a measure, lower or raise the value
  in `ratchets.json` to the new measurement. `check:textures` prints a hint for the numbers it
  measures itself.
- **Loosening** needs a reason: change the value and rewrite its `why` in the same change, and
  say why in the PR. A loosened value with an unchanged `why` fails `check:textures`, and so does
  dropping a ratchet.
- **Adding** a ratchet: a new `T<n>.<measure>` entry plus the test that reads it.
