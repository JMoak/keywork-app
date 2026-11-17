# Creatures and a stead that can fold

Status: a first native implementation is in the working tree on `codex/creatures-courtyards`.
It is not an SDK release or an installed Stead update. The remaining contracts below are
proposals, not changes to the engine's current creature format.

## Direction

Creatures can be animals, imagined biology, materials, mechanisms, weather or geometry.
Their common language is the drawing and the quality of movement: clear silhouettes,
deliberate pixel clusters, readable outlines, restrained theme roles and expressive pauses.
They do not need a common skeleton, face, number of limbs or relationship to gravity.

Character should show in how something notices, waits, handles a task and settles afterward.
It must never imply different model competence, silently change permissions, or conceal a
request behind a charming animation. One authoritative work state reaches every surface.

The target is a starter selection of roughly 20–22 genuinely different designs. We should
approve them in small animated batches at actual display size. A concept grid is an art
brief; a production creature includes a complete manifest, authored motion, graceful still
frames and validation. Palette swaps do not count as additional designs.

## First native build

Two contrasting designs are now built alongside the existing tinkerer, carter and joiner.

| Design | Anatomy and character | Work, attention and rest |
|---|---|---|
| Tessera | Six coordinated legs beneath a segmented porcelain shell; careful, quietly industrious | Braces to work, adjusts panels at idle, raises its crown toward a request, closes around a broken seam when blocked, tucks its feet to rest |
| Cairn | Three separate floating stones; patient, curious and occasionally playful | Uses a stone as a counterweight or pestle, opens the stack to wait, loses alignment when blocked, settles into a low mound to rest |

Each has a real 384×1092 indexed atlas: eight 48×52 columns and 21 pose rows. The atlas is
assembled from authored pixel parts; each row declares its actual frame count and hold
times, so unused columns are transparent padding. Existing theme roles supply the colors.
All eight look directions follow the pose system's compass, rather than playing as an
ordinary animation sequence. No new runtime dependency or engine-format change is involved.

The first-meeting screen offers the registered designs, a non-repeating design roll, undo,
and a live preview. Choosing or rolling does not create a creature; keeping it uses the
existing creation route. This roll chooses a design. It does not yet generate anatomical
traits, roll a coat or persist a versioned appearance recipe.

Onboarding, the creature profile, the stead and the floating companion resolve the same
registered designs. Live renames, coats and skin changes reconcile without losing ongoing
pose history in the stead. The companion receives the skin identity over its existing
desktop channel and uses that design's timing. Missing artwork is visible and never
silently replaced by a different animal. Reduced-motion previews update at frame zero.

Built-in skins share their validated atlas bytes across residents. The lower-level slice
cache includes the complete rendering manifest and compares bytes after its hash lookup.
Its limits are 32 retained slices and 32 MiB of reserved atlas/frame storage. Caller-owned
registries are revalidated, not treated as immutable built-ins.

## Twenty candidate concepts

This is a candidate library, not a claim that all twenty have production sheets. Keep the
three existing creatures available while selecting the final starter roster.

| Concept | Form | Distinctive action to author | Possible architectural motif |
|---|---|---|---|
| Frond | Frilled axolotl-like amphibian | Gill fans open before a deliberate reach | Shallow pools and scalloped eaves |
| Purl | Small cuttlefish | Mantle pulses; arms arrange tools | Curved shelves and tidal bands |
| Tine | Mantis-like craftsperson | Forelimbs fold into precise working angles | Fine braces and tall narrow openings |
| Shale | Pangolin-like burrower | Scales settle in overlapping waves | Layered stone and curved thresholds |
| Folio | Compact paper-winged dragon | Wings fold like a book; tail holds a place | Accordion roofs and booklike shutters |
| Tessera | Porcelain shell on six feet | Shell panels adjust; tripods coordinate | Segmented ceramic tiles |
| Vela | Floating air ray | Rippling fins counterbalance a carried parcel | Suspended canopies |
| Hush | Weather held within a ring | Cloud gathers to listen; ring tilts to work | Open circles and sheltered hollows |
| Vug | Walking geode | Opens a crystal cavity to inspect its work | Split rock and inset light |
| Cairn | Three floating stones | Each stone contributes a different motion | Offset masonry and balanced lintels |
| Wick | Root creature | Roots brace, curl and gently release | Root arches and woven supports |
| Loam | Garden-backed creature | Growth settles with a slow exhale | Planted roofs and soft berms |
| Fold | Living folded paper | Creases articulate, with broad still poses | Folded planes and tucked doors |
| Knot | Interwoven ribbon | Loops tighten around a task then relax | Braided rails and ribbon paths |
| Luma | Lantern organism | Shutters open to attend; light rests low | Small light courts and pierced screens |
| Bobbin | Living spool | Thread feeds a tool and winds neatly home | Spindles and concentric rails |
| Pip | Mechanical seed | Petals expose a tiny mechanism | Seed pods and hinged roof leaves |
| Cres | Crescent balancing a small mass | Counterweight travels around its curve | Crescent terraces |
| Hollow | Walking arch or hollow stone | Negative space changes shape through posture | Deep thresholds and framed views |
| Triad | Three related geometric forms | Shape relationships carry expression | Three-part courtyards |

These motifs are visual possibilities. No creature's species should determine its job,
grant scope, substrate, model or access to a feature.

## Uniqueness without arbitrary combinations

Proposed appearance generation separates three layers:

1. **Authored design.** A body plan, rig or independent part layout, complete motion grammar,
   material roles and tested silhouette envelope.
2. **Compatible variation.** A small set of meaningful axes for that design: shell-panel
   arrangement for Tessera, relative stone proportions for Cairn, gill shape for Frond.
   Each axis declares compatible parts, permitted bounds and palette-role constraints.
3. **Resolved individual.** The selected parts, palette mapping, motion-profile choice and
   generator version are saved together. A seed is useful for repeatability, but must not
   be the only record: changing a generator must not redraw an existing creature.

A future roll operates on unlocked axes, previews locally and has undo. An explicit keep
writes the resolved appearance once. Name, work and permissions remain intact. Do not
repurpose the existing body seed or change the existing workspace-seeded surprise choice.
Avoid combinatorial hats and arbitrary hue noise as the main source of individuality.

Before adding a trait axis, prove that every allowed combination still reads at native
size in all states, has correct bounds/grounding, and remains recognizable in monochrome.
An authored small family is better than thousands of unreviewed combinations.

## User sprite sheets are a first-class remaining deliverable

The current built-in registry and lower-level Codex-atlas adapter are not an installation
workflow. The product does not yet let a user import and retain their own sprite sheet.
The earlier chat study's local PNG preview is also separate from this native implementation.

The next implementation must include the complete lifecycle:

- Choose a PNG or a data-only pack, preview its grid and animation mapping, and explain
  missing states before installation. Offer native 21-state mapping and an explicit
  nine-state adapter. A borrowed state must be declared; never invent convincing work
  activity from an unrelated animation.
- Validate encoded length before decode, pixel dimensions before allocation, grid
  divisibility, row/frame bounds, finite timing, transparency, every index or palette role,
  ground/hover anchors, still frames, facing and supported gaze directions. Start with
  explicit resource ceilings and test each boundary. Do not accept scripts, executable
  hooks or network references in a pack.
- Let the user see the effect of a theme-role conversion. Full-color art requires a
  supported renderer path; do not silently recolor a user's original into the native
  indexed palette. Native built-ins keep the common art direction without forcing a
  conventional body plan on custom art.
- Copy an accepted pack into managed storage atomically. A moved source file must not
  break the creature. Store a content digest and format revision; route byte access
  through the typed host boundary. Renderer code never gains filesystem access.
- Support replace, rename, export, remove and missing-pack recovery. Replacement is
  validated before activation; export includes everything needed to reproduce appearance.
  In-use removal must be explicit and recoverable. An unavailable pack never stops work.
- Resolve the same installed revision in onboarding, profile, courtyard/detail and the
  floating window. Test restart, another machine without the pack, damaged storage,
  replacement during animation and repeated import/export.

The engine owns durable creature references; the shared app owns decoding, validation and
presentation. Exact manifest names, installed-asset ownership and backward-compatible
appearance fields need a coordinated producer contract before implementation. Automatic
distribution between machines is separate from local import/export.

## A place that grows without becoming a maze

The chosen presentation direction is a quilt of courts opening into the existing
side-view stead. Opening a court means stepping into a recognizable place, not creating a
second work-state model. The continuous view stays available and remains the default.

The current local implementation provides:

- Optional saved `view` and `courtOrder` pane preferences through the existing layout
  persistence route. Old pane specs remain valid. Newly known creatures append in raised
  order; removing one reserves its address, and returning it restores that address.
- Eight authored workshop families: gable, ceramic, cairn, folded, root, tidal, lantern and
  canopy. Their roof silhouettes differ, while doors, lamps, boards and ground contact share
  a consistent visual grammar. The overview and open scene use the same authored facade.
  Appearance does not grant a capability or dictate a creature's anatomy or occupation.
- Automatic architecture follows the permanent address through a frozen eight-family
  sequence. Rename, changing skin, work state and window size never reroll it. A saved
  explicit style overrides that default; returning to Automatic restores the same choice.
- Optional saved herbs, flowers or mushrooms occupy a reserved garden strip. All workshops
  keep the same footprint whether planted or bare, so planting never displaces a neighbor.
  These are ornamental mature gardens, not a crop simulation or a work-progress signal.
- A responsive overview of static portraits, miniature buildings and authoritative state
  labels. Roomy and compact arrangements reflow with the available width while preserving
  addresses and reserved vacancies. Style, planting and arrangement have one-step undo.
  There is one
  shared appearance listener and one minute-aligned semantic clock, not an animation loop
  per tile. Scene animation stops while folded; the semantic clock pauses when hidden.
- Neighborhoods hold sixteen stable court addresses. Only the selected neighborhood's
  cards, creature bodies and scene are mounted and composed; opening a court no longer
  composes every resident. Neighborhood navigation includes occupancy and waiting counts.
- Open/fold controls with native keyboard activation. Opening centers the workshop
  location, and folding restores focus to its court. Per-court scroll is retained for this
  mount; it is deliberately not yet durable across restart.
- Needs-you access across the whole stead. Folded shortcuts open the actual request;
  they cannot answer an invisible permission card. Counts include creatures with missing
  art, and card state includes held chores and decisions.
- An explicit 4,096 retained-address bound. On overflow, additional residents remain
  reachable in bounded additional neighborhoods in the scene. Their temporary addresses
  are not saved; the overview explains the limit instead of allocating an enormous grid.
- Bounded infrastructure art: one storehouse doorway, up to two relevant mills and four
  outlying plots. A visible summary preserves actual whole-world totals and running mills
  when their representation is condensed. All work facts stay in the full world model.
  A stress fixture with 10,000 wings and mills reaches 4,308 by 72 logical pixels rather
  than growing with history. District canvas backing scale is capped at 8,192 pixels wide
  for these scenes, while CSS size, integer pixel drawing and hit coordinates stay intact.

This is a recognizable miniature opening into a bounded side-view neighborhood. It is not
an animated paper-fold transformation, freeform town editor or seamless two-dimensional
walking map. Folding uses an immediate transition, including under reduced motion.
Per-court scroll is transient; saved architecture and arrangement are pane preferences,
not engine-owned geography. Retained vacancies are not automatically compacted.

Independent review drove corrections for project-window preference persistence, inherited
object keys in creature names, missing-art navigation targeting the wrong creature,
overflow accessibility, garden-induced neighbor movement and unbounded shared buildings.
Regressions cover those cases. Static day/night art has been inspected at small and large
sizes. Browser composition, animation cadence, high-DPI presentation and Linux behavior
still need live qualification; bounded allocations and model timings do not prove them.

## Optional play: cultivation and shared places

The next game layer should make a place worth returning to without imposing a chore list.
The following is a proposed sequence, not an implemented farming system:

1. **Cultivate a small plot.** A keeper opts in, chooses a planting and tends it with a
   deliberate action. Three visible stages and an authored harvest action give it character.
   Absence never kills or degrades it; mature plants wait. No streak, daily login reward,
   expiring harvest or pressure to produce more work. A purely ornamental garden remains
   available without this mode.
2. **Make decorations.** A short, deterministic recipe book turns cultivated materials into
   trellises, lantern screens, path edges or tiny water features. Preview and undo placement.
   Avoid randomized loot and an economy before a small complete planting-to-decoration loop
   has proved enjoyable. Decorations never unlock model abilities or permissions.
3. **Create a shared place.** Expand by adding a courtyard-sized commons chosen by the
   keeper. A conservatory holds collected plant forms; a kiln displays authored ceramic
   objects; an observatory gives weather and sky a place; a pond shelters strange aquatic
   forms. These are candidate interactions to prototype, not four new feature promises.
4. **Author creature moments.** A design may inspect a sprout, balance a pebble or rest under
   a canopy. Idle gestures yield immediately to real requests and never impersonate ongoing
   work. Multipart, flying and non-animal creatures need their own actions, not a shared
   human farming rig.

The existing porch, storehouse and mills already communicate real requests, stored work
and routines. Keep those meanings legible alongside optional play. Appearance selection
can be automatic; enabling play, expanding a common area, moving an address or compacting
vacancies must be an explicit reversible choice. Window resizing only rearranges display.

Durable cultivation needs an engine-owned versioned plot state and typed commands before
the renderer can implement it. Planting identity, stage, selected recipe and placed result
must survive restart and clock changes. Writes need expected revisions and operation IDs
so retries cannot double-harvest or lose materials; concurrent windows must converge.
The local preview must not report success until the owner accepts the change. Prove this
contract with save/reload, duplicate-command, clock rollback, conflict and offline tests.
Only then add a small playable vertical slice and observe whether people enjoy it.

## Delivery and review sequence

| Cut | Owner | Required proof |
|---|---|---|
| First native art + live identity + optional courts | Keywork-app; implemented locally | Every pose, eight look directions, crop/outline/contact, theme roles, still/reduced motion, first-meet selection/undo, live skin changes, missing art, keyboard routing, request visibility, clock aging, stable addresses, cache identity and bounds |
| Pack contract and installed library | Keywork + Keywork-app | Bounded malformed inputs, declared state adapters, atomic install, restart/source loss, replacement/export/remove, all surfaces use one revision |
| Resolved variation | Keywork + Keywork-app | Old creature files unchanged, deterministic versioned rolls, locks/undo, failed-save recovery, exhaustive compatible trait combinations |
| Further art batches | Product art owner + Keywork-app | Four to six contrasting forms per batch; animated actual-size art review before expanding the registry |
| Recognizable folded architecture | Keywork-app; implemented locally | Eight shared facades, sixteen-court neighborhoods, saved styles/gardens/arrangement, growth and overflow, bounded infrastructure and backing allocation; live browser qualification remains |
| Cultivation and shared places | Keywork durable play contract, then Keywork-app | Opt-in planting-to-decoration loop, restart and concurrency, no absence penalties, explicit reversible placement and authored creature interactions |
| Publication and Stead adoption | Producer release, then Stead | Published SDK/runtime artifacts, exact consumer pins, Windows and Linux qualification; installed behavior verified separately |

Independent review of this first build found and drove fixes for compass-direction art,
duplicate native atlas retention, hidden permission shortcuts, native keyboard activation,
frozen folded status, workshop centering and missing-art counts. Regression tests accompany
the fixes. Static PNG inspection has been performed; browser layout, live animation
cadence, Linux behavior and downstream artifact adoption are still unverified.

No commit, publication or dependency adoption is implied by this ledger.

## Local validation record

Windows, 2026-11-17. First-cut integrated run: **464 tests passed in 56 files**, exit 0:

```sh
bun run test -- packages/habitat/src/skins packages/habitat/src/place packages/habitat/src/render packages/ui/src/companion packages/ui/src/onboarding packages/ui/src/panes/stead packages/ui/src/panes/creature packages/ui/src/shell/courtyard-keyboard.test.tsx --reporter=dot
```

`bun run check:types`, `bun run check:colors`, `bun run check:guardrails`,
`bun run check:copy`, `bun run check:test-imports`, changed-source Biome checks and
`git diff --check` each exited 0. Later review also fixed folded footer guidance and
preserved a selected design when entering or cancelling advanced customization; both
are exercised in the final integrated run.

These are local checks, not CI or an installed-application test. Static day/night sheets
were regenerated from the final native source and inspected. Browser layout/live cadence,
Linux and downstream adoption remain outside this evidence.

The subsequent workshop/neighborhood cut passed **587 tests in 70 files**, exit 0:

```sh
bun run test -- packages/habitat/src/skins packages/habitat/src/place packages/habitat/src/render packages/habitat/src/world packages/ui/src/companion packages/ui/src/onboarding packages/ui/src/panes/stead packages/ui/src/panes/creature packages/ui/src/shell/courtyard-keyboard.test.tsx --reporter=dot
```

Type checking, colors, guardrails, copy and test-import checks passed. Biome checked all 70
changed source files without findings; `git diff --check` passed. A separate cold review
passed 102 focused checks in ten files, including the existing local PNG golden images.
The final flower contrast adjustment and all integration fixes are included in the
587-test run. Final day/night workshop artwork was regenerated and visually inspected.
The live application and cross-platform qualification limits above remain unchanged.
