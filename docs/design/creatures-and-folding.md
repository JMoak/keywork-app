# Creatures and a stead that can fold

Status: native implementation continues on `codex/creatures-courtyards`.
It is not an SDK release or an installed Stead update. The remaining contracts below are
proposals, not changes to the engine's current creature format.

**Latest direction, 2026-11-19:** the full-color illustrated interpretation below is the
new approved visual baseline. The native pixel adaptation was still too constrained;
the user explicitly preferred the subsequent smooth, richly drawn characters. The
consumer home, first meeting and profile now use those illustrations in local source.
The live miniature world still uses the authored pixel animations. This is an intentional
transition, not a claim that the new illustrations already have complete motion sets.

**Earlier art direction correction, 2026-11-19:** Jordan preferred the character in the original
creature concept sheet to the cleaner native interpretation, then selected **B · Bold
Little Legends** from three new studies. This is the selected visual baseline. The native
adaptation below now carries its shapes and materials through three full pose sets. This
implements the direction; the user has not yet approved the resulting native animation.

The [selected concept board](art/bold-little-legends-2026-11-19.png) establishes strong warm
outlines, broad deliberate color shapes and prominent material marks. The
[large/small concept study](art/bold-little-legends-size-study-2026-11-19.png) explores the
same language at reduced visual complexity. Both are generated art studies, not validated
sprite sheets or evidence of actual in-app size. The built-in image-generation
[prompt record](art/bold-little-legends-prompts.json) preserves their provenance.

Keep Folio's paired olive leaf wings, cream throat and slender neck opening; Tessera's
single overhanging porcelain dome, teal botanical sprigs and jointed legs; Cairn's tilted
upper slab, pierced middle stone, small lower shard and selective moss. Purl retains its
ochre/teal mantle and large lateral eye; Hush retains open air around a contained storm;
Knot expresses itself through the twist and tension of one continuous patterned ribbon.
These shapes and materials carry identity and must survive simplification.

Do not substitute generic colored plates or pebbles for those features, and do not assume
a larger atlas alone fixes their loss. Before authoring another complete pose set, compare
one faithful neutral pose at native and doubled drawing resolution at identical display
size. Qualify the silhouette, material cues, transparency, ground line and theme handling.
Changing image resolution requires preserving logical footprint and pointer targeting.
The earlier cut used 48×52 authored cells; the 96×104 Cairn comparison remains a neutral
study. Neither is a resolution or palette ceiling for the illustrated product.

## Direction

Creatures can be animals, imagined biology, materials, mechanisms, weather or geometry.
Their common language is the drawing and the quality of movement: clear silhouettes,
confident contours, rich material color, selective detail and expressive pauses.
They do not need a common skeleton, face, number of limbs or relationship to gravity.

Character should show in how something notices, waits, handles a task and settles afterward.
It must never imply different model competence, silently change permissions, or conceal a
request behind a charming animation. One authoritative work state reaches every surface.

The target is a starter selection of roughly 20–22 genuinely different designs. We should
approve them in small animated batches at actual display size. A concept grid is an art
brief; a production creature includes a complete manifest, authored motion, graceful still
frames and validation. Palette swaps do not count as additional designs.

## Illustrated home: a place worth returning to, 2026-11-19

Stead should feel like a small extraordinary place where useful things happen. A creature
can be a leaf-winged dragon, a porcelain organism or an arrangement of impossible stones;
its drawing and behavior make it approachable without giving every shape a mascot face.
Quiet modern controls belong beside this world. A new keeper should immediately understand
who is here, what they can do together and what needs their attention.

The latest local implementation includes full-color transparent Folio, Tessera and Cairn
portraits and a separately illustrated workshop clearing. The originals are preserved in
`packages/ui/src/creatures/assets/illustrations/`; the
[asset briefs and provenance](art/illustrated-home-2026-11-19.json) record their sources.
The raster renderer preserves their colors and alpha instead of reducing them to a native
palette. Validated source rectangles, normalized ground anchors, facing and independent
logical footprints keep large art crisp without changing a creature's geometry. Decoding
is shared and bounded; an unavailable asset falls back to the existing still portrait.
Explicit frame clips are supported by the renderer contract, but these three assets are
stills. A still is never bobbed or slid around to imply that it is an authored animation.

The first meeting defaults to Folio while retaining explicit choices, rolling and undo.
The large illustration leads; the existing motion study is behind “See it move” and is
clearly labeled “Pixel animation.” Profile artwork uses the same source and placement.
Loading failure offers a retry instead of pretending an empty world was loaded. Creating
the first resident preserves model setup through live refresh, and the returning home
does not compete with the active encounter or advanced setup.

Returning Stead keepers see a composed clearing, one featured resident and a concrete
action. A real request can feature its resident; unattributed requests remain reviewable.
“Talk to” opens that resident's ongoing conversation, independently of any active job.
Neighbor controls expose name, status and permanent address, retaining keyboard focus
as time and state change. The home mounts at most sixteen neighbors, including overflow
neighborhoods beyond the retained-address limit. Held chores use the same porch meaning
as other surfaces. Hidden workbench approvals cannot be answered through inherited keys.

“Explore the stead” opens the existing scene or courtyard mode with the saved architecture,
gardens and arrangement. Back home restores focus. Home suspends the native scene loop
and avoids hidden whole-world work summaries and project-link reads. The Keywork profile
keeps its existing workbench entry point. The illustrated clearing is a home vignette;
its painted building does not claim to preview every saved architectural choice.

The next visual milestone is a continuous journey, not another gallery of disconnected
ideas: meet Folio, ask for something, return to a real result at its workshop threshold.
First author one full-fidelity action with visible contact, weight and release. Then carry
that illustration and workshop language into the courtyard detail transition. Review both
at a narrow 320-pixel pane and a normal desktop width, with keyboard use and reduced motion.
Only an approved working sequence should become the template for the broader roster.

The broader vision has four connected parts:

- **An authored bestiary.** Build the roughly twenty-design roster across living biology,
  material beings, weather, mechanisms and abstract forms. Contrast silhouettes, movement
  and habits as deliberately as color. Every candidate earns its place with a recognizable
  neutral pose and one distinctive action before a full animation set is commissioned.
- **Places that unfold.** A small home, a courtyard and a neighborhood are views of the same
  persistent residents and work. Expanding changes how much can be seen; folding preserves
  addresses, pending requests and the keeper's place. Architecture and planting vary with
  authored compatibility rules, preview and undo. The current immediate fold remains until
  a richer transition can preserve those guarantees.
- **Personal character.** Resolved variations combine compatible material marks, anatomy
  and accessories without erasing a design's identity. Let a keeper lock what they like,
  reroll the rest and bring their own artwork. Installed sprites need a durable asset-pack
  contract, declared animation states and reliable fallback; a temporary image URL is not
  an installation. These contracts remain separate work, not completed by this portrait API.
- **Optional life around the work.** Cultivation, tiny crafted objects and creature moments
  enrich the place without attendance penalties or invented productivity rewards. A real
  result can appear at a threshold; an ornamental garden never impersonates real work.
  Durable play belongs in the owning runtime before an interface claims it is saved.

Independent review checked transparent crops and grounding at small and large sizes on
light and dark backgrounds. The clearing's arch avoids the creatures' defining openings;
the scene uses containment rather than destructive background cropping. These were offline
art and composition checks, not live browser captures. Full desktop layout, animation and
Windows/Linux release qualification remain outstanding.

The final integrated local run passed **633 tests in 82 files** across native art, the
illustration pipeline, companion, encounter, creature profile, home and courtyard routes.
Both full-app home suites also passed **11 tests**, including notification focus and
preservation of the existing courtyard preference. The static type, theme, color, copy,
architecture and test-import checks exited 0. Changed-source formatting exited 0 with
four advisory CSS importance warnings for sizing the legacy portrait fallback. The
production UI build passed; all four emitted PNGs match their source hashes byte for byte.
The build retains its large-chunk advisory. These are local proofs, not CI or release proof.

## Bold Little Legends: renderer and interface iteration, 2026-11-19

Folio, Tessera and Cairn have each been redrawn across 120 frames and all 21 native poses.
Folio now has paired leaf wings with forked gold veins, a cream S-neck, teal flank and an
open tail curl. Tessera has a continuous overhanging porcelain dome, large botanical marks
and six articulated, tapered legs. Cairn has a slanted slab, a truly transparent aperture
through its middle stone, a pointed lower shard and localized moss. Each retains eight
compass looks. Full native PNG exports and the day/night proof are generated in
`artifacts/shots/bold-legends/`; they are artwork exports, not installable user packs.

An optional material profile on the native skin manifest selects leaf, porcelain or
sandstone relationships. Semantic `--kw-art-*` theme tokens define the authored pigments;
a restrained ambient tint lets them sit within each theme. The coat seed varies small
markings while preserving the dominant material. Legacy creatures keep their coat palette,
and signal inks and forced colors retain their established roles. The manifest cache
includes this metadata. No creature wire format or engine-side appearance field changed.

The first meeting and profile now share a character stage with actual pose playback,
turning and pause controls. A gallery uses still native portraits, while the selected
character can move. Material descriptions distinguish anatomy and character from live
work status. Preview controls do not issue work or mutate a creature. The meeting retains
roll, undo and its explicit creation actions; the profile retains its existing body-change
save route and keyboard choices.

The shared portrait handles motion preference changes, document visibility, offscreen
suspension, inherited pane themes and display-density changes. It caches resolved pigments
and skips unchanged drawings. Its logical display footprint is independent of a source
cell's resolution, so the 48×52 and 96×104 preview fixtures occupy the same space. That
normalization currently applies to portraits: the world and floating companion still use
their native cell geometry. A higher-resolution production atlas needs corresponding
grounding, placement and hit-mask work in those surfaces before it can be installed.

The renderer compiles palette-independent drawing runs once per canonical frame and shares
them across instances. Paint-only portraits avoid scaled hit-mask allocation. Retained
drawing data is bounded to 512 entries / 8 MiB; retained masks to 64 entries / 4 MiB. These
are cache limits, not a total application-memory claim. Existing callers can retain their
frames independently. Oversized or nonfinite scale requests fail before allocation.

An interleaved local counting-surface benchmark of 4,800 Folio paints measured median
dispatch time of 6.50 ms against 13.70 ms for the reference pixel scanner, with identical
draw calls and covered pixels. It measures drawing preparation and dispatch, not browser
frame rate. Regression tests compare exact pixels, mirroring, transparency, masks, cache
eviction, pane-local theme changes and idle redraw suppression. Separate review exposed
and drove fixes for stale courtyard pigments, redundant preview painting and picker focus.

An already-open floating companion now follows remembered gallery themes and system
appearance changes, including while motionless. A tucked window keeps the latest choice
for its next reveal. Theme updates preserve clip progress and hit masks. This uses the
existing boot theme resolver; server-only theme definitions are not carried by that
companion bridge.

The integrated local Windows run passed **645 tests in 77 files**, including the full
workspace keyboard path and all native appearance surfaces. Type, color, architecture,
copy, theme synchronization, test-import and changed-source formatting checks passed.
Independent review rechecked the corrected paths with focused reruns. The motion fixture
uses a fixed clock epoch so the engine's intentional timing jitter remains deterministic.

The current source remains a six-design selection. User sprite installation, resolved
anatomical variation, the remaining roster and cultivation are separate unfinished work.
Offline native artwork has been inspected. Live layout and animation qualification on
Windows and Linux remain outstanding; these changes have not been published or installed.

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

## A living field guide: 2026-11-19

The next artistic cut makes each court a composed place. A fixed 144×84 landscape contains
the existing workshop, its threshold and path, a foreground landing and distant terrain.
The creature remains the focal point. Its own ground line anchors it to the landing; the
facade sits slightly farther back. Clear space around the body, entrance and roof makes
their silhouettes readable. Terrain texture stays subordinate to those three shapes.

Three settings are selected by permanent address: an orchard terrace, a stone garden and
a tidal inlet. Returning residents and reserved vacancies keep that assignment. Orchard
canopies, quarried arches and offshore stacks provide different large shapes; restrained
theme-derived terrain pigments separate their materials. Signal inks keep their established
meanings, and forced colors use the canonical system palette. These are cosmetic settings,
not simulated geography or a new crop system.

The overview now has a quieter editorial hierarchy: a neighborhood heading, readable serif
names, small monospace addresses, and written status with a simple state mark. The common
art aperture scales scenery and resident together. Roomy courts reach a clean 2× native
size when there is space; narrow and compact courts scale proportionally. Habitat names
are available to assistive technology. Hover changes ink rather than moving the scene.

Appearance controls live behind an explicit button in an open courtyard. Choosing a style
or garden keeps the editor open; Done returns focus. Escape closes the editor before
folding the courtyard, while select menus retain their native Escape behavior. Moving to
another resident starts with the editor closed. Saved choices and one-step undo retain
their existing persistence route.

The initial Folio cut joined the five existing offered designs. That paper-winged dragon had **120
authored frames across all 21 poses**, including eight compass looks. It creases a sheet
with its snout, raises a folded wing to listen, shelters beneath a buckled cover when blocked
and closed like a bookmarked book to rest. The Bold Little Legends leaf-wing redraw above
replaces that interpretation. Its atlas is offered through the shared
registry, onboarding, profile, stead and companion. The importer and resolved trait system
remain unfinished; adding this authored design does not claim to complete the roster.

Three Astra specialists handled environment art, character art and independent review while
the main implementation integrated the UI. Review corrected reversed standing/walking
orientation, a distracting shoreline, suppressed habitat descriptions, excessive portrait
resolution and unnecessary redraws. Unchanged visual facts, a semantic minute tick, a rename
and a same-density resize now avoid repainting the folded artwork. Both layers share an
integer backing-scale ceiling of four, keeping sixteen native courts' RGBA canvas buffers
at or below 14.25 MiB, excluding masks, atlases and runtime overhead. There are no new
animation timers, dependencies or engine-format changes.

Continue this art direction through authored material relationships and characteristic
movement. Future creatures can be weather, interwoven ribbons or open geometric forms;
each needs a complete motion grammar and a readable actual-size silhouette. Future shared
places should have one recognizable form and a clear interaction before accumulating props.
Custom sprite installation and live desktop qualification remain the next product gaps.

Local validation on Windows: **558 tests in 68 files passed**, covering skins, place/render,
companion, onboarding, stead, profile and full-shell courtyard keyboard routing. Type,
color, architecture guardrail, copy, test-import and changed-source Biome checks passed.
The native day/night compositions and Folio's 2×/4× sheets were visually reviewed; the
animated proof is an offline render. CSS layout, desktop animation and native select-menu
behavior still need live Windows/Linux qualification. No publication or installed Stead
adoption is implied.

## Twenty candidate concepts

This is a candidate library, not a claim that all twenty have production sheets. Keep the
three existing creatures available while selecting the final starter roster.

| Concept | Form | Distinctive action to author | Possible architectural motif |
|---|---|---|---|
| Frond | Frilled axolotl-like amphibian | Gill fans open before a deliberate reach | Shallow pools and scalloped eaves |
| Purl | Small cuttlefish | Mantle pulses; arms arrange tools | Curved shelves and tidal bands |
| Tine | Mantis-like craftsperson | Forelimbs fold into precise working angles | Fine braces and tall narrow openings |
| Shale | Pangolin-like burrower | Scales settle in overlapping waves | Layered stone and curved thresholds |
| Folio | Compact leaf-winged dragon | Veined leaves fold to shelter its cream neck; tail curls to rest | Veined canopies and botanical screens |
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
