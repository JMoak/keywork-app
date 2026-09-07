# keywork-app: Docs

keywork-app is the native desktop surface for [keywork](https://github.com/JMoak/keywork). It
is a client of `keywork serve`, never a port of the engine. Read in this order; later docs
assume the earlier ones.

| Doc | What it covers |
|---|---|
| [`architecture.md`](architecture.md) | The binding decisions AD1–AD12: third mounting surface, one server per workspace with the terminal and the app as peers, Electron with a thin main process, Solid with a pure projection, tiling by keywork's verbs, one theme system, the design language translated with serif prose, trust on the server, refusals |
| [`stack.md`](stack.md) | Every component with its exact pin and why it won, the alternatives considered, the repository layout |
| [`plan.md`](plan.md) | Milestones M0–M5 with sized tasks and acceptance criteria, the server lane that lives in the keywork repo, and the assumptions to confirm before building |

The keywork docs this plan derives from, in the keywork repo: `docs/vision.md` (D1–D10),
`docs/events.md` (the wire), `docs/headless.md` (exit classes), `docs/design-language.md`,
`docs/textures.md`, `docs/ux-principles.md`, and `docs/backlog/80-p2-reach.md` (the
external-surface posture and the native-shell revisit gate).
