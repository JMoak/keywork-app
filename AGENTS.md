# keywork-app: Agent Instructions

keywork-app is the native desktop surface for [keywork](https://github.com/JMoak/keywork), a
keyboard-first coding-agent harness. It is a **client of `keywork serve`**, never a port of
the engine. `docs/README.md` indexes the plan; `docs/architecture.md` holds the binding
decisions (AD1–AD12); `docs/stack.md` names every component and why; `docs/plan.md` is the
milestone and task list, including the server-side lane that lives in the keywork repo.

## Hard guardrails (never violate)

1. **No engine logic in this repo.** Sessions, tools, permissions, memory, providers, and
   inference resolution live in keywork and are reached over HTTP + SSE. When the app needs
   something the server does not expose, the server grows (a task in `docs/plan.md`'s server
   lane); the app never re-implements it. `scripts/check-guardrails.ts` fails the build on any
   import of `@keywork/engine`, `@keywork/tui`, or `@keywork/cli`.
2. **Anthropic is API-key / Agent-SDK only**, exactly as in keywork. This app never handles a
   model credential: connection setup runs through keywork's own `connect` flow. No OAuth of
   any kind, no Claude-Code client impersonation, no ported login flows from anywhere.
3. **The gate lives on the server.** The app displays and answers permission asks; it never
   loosens policy, never bypasses a denial, and never runs a tool itself.
4. **Licensing:** Pi (`earendil-works/pi`) and OpenCode (`sst/opencode`) are MIT and may be
   adapted **with attribution recorded in `NOTICE`**. Crush (`charmbracelet/crush`) is never a
   source: no code, no design credits. Zed's review UI is GPL: observed behavior only.
5. **Git:** the user commits; agents never run `git commit` or `git push` unless explicitly
   asked in the current conversation.

## Code style: the perspective

Write with recent-MIT-grad hunger and craft: the cleanest, most elegant code you can produce,
organized top-down so it reads naturally **without comments**. If code seems to need a
comment, restructure or rename until it doesn't. The only acceptable comments state genuinely
irreducible constraints (a Chromium quirk, a protocol rule): never narration, never justification
of a change. Small well-named functions. Public surface at the top of the file, helpers below,
with descriptive names doing the work documentation would. Pass this section verbatim to any
subagent writing keywork-app code; the perspective is the point.

## Conventions

- Strict TypeScript everywhere; no `any` without a written reason in the PR description.
- Every behavior lands with tests; acceptance criteria in `docs/plan.md` are the bar.
- Exact-pinned dependencies only (`scripts/check-pins.ts` enforces).
- One theme system: keywork flavors. No hard-coded colors anywhere; every color is a token.
- Every new config option needs a `.describe()` justification in the schema (keywork D9).
- The wire is the contract: `docs/events.md` and `/doc` in keywork. The protocol package
  mirrors them and `scripts/check-contract.ts` fails when a real `keywork serve` disagrees.
- The Electron main process stays thin: windows, sidecar, PTY, menus, tray, notifications,
  updater. Product logic lives in the renderer. `contextIsolation` on, `nodeIntegration` off,
  `sandbox` on; the preload exposes one typed `HostPort` and nothing else.
- Solid, not React: components run once. Never destructure `props`; read them inside JSX or
  through `splitProps`. Derived values are functions or `createMemo`, never plain `const`s
  computed from a signal. Lists use `<For>` / `<Index>`, conditionals `<Show>` / `<Switch>`;
  `.map` in JSX is a bug. Signals are read by calling them; a stray `count` where `count()`
  was meant renders `[Function]`. Stores update through `setStore` paths or `produce`, never
  by mutation. Tests use `@solidjs/testing-library` and `createRoot` for reactive units.
- `bun run check && bun run test` must be green before any task is called done.
