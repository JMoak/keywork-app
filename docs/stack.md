# keywork-app: The Stack

> Every component, its exact pin as of 2026-09-07 (`npm view` on that day), and why it
> won. Pins are re-verified at scaffold time; `scripts/check-pins.ts` keeps them exact after
> that. Where keywork already pins a shared tool, the same version is used (AD11).

## Shell and main process

| Layer | Choice | Version | Why | Considered |
|---|---|---|---|---|
| Shell | Electron | 44.2.0 | Bundled Chromium: identical rendering on Windows, Linux, macOS; the proven PTY and terminal stack; OpenCode's desktop is Electron and MIT | Tauri 2.11 (8 MB shell, but WebKitGTK on Linux and a Rust PTY under xterm without WebGL), embedding the TUI in xterm alone |
| Build | electron-vite | 5.0.0 | One Vite config for main, preload, and renderer; HMR in the renderer | electron-forge's Vite plugin |
| Packaging | electron-builder | 26.15.3 | NSIS, dmg, AppImage and deb; code signing and notarization; `extraResources` carries the keywork sidecar | electron-forge |
| Updates | electron-updater (ships with electron-builder) | 26.15.3 | Signed updates from GitHub releases | none |
| PTY | node-pty | 1.1.0 | ConPTY on Windows, `forkpty` elsewhere; VS Code's terminal backend | a Rust PTY (Tauri only) |
| Sidecar | `child_process` | Node built-in | Spawn `keywork serve`, parse its stdout, supervise; job objects on Windows through `windowsHide` plus tree kill | none |
| Config store | `electron-store`-free: one JSON file through `zod` 4.5.4 | n/a | The one typed config file (AD9), validated on read | electron-store |

## Renderer

| Layer | Choice | Version | Why | Considered |
|---|---|---|---|---|
| Framework | Solid | `solid-js` 1.9.15 → 2.0 when final (rc.6 today) | Fine-grained reactivity fits a delta stream; Svelte-sized adoption; TC39 Signals lineage; OpenCode's web UI proves it here | React 19.2 (wider ecosystem, coarser updates, more memo ceremony) |
| Build | Vite | 8.2.2 · `vite-plugin-solid` 2.11.14 | electron-vite's renderer | none |
| Primitives | Kobalte | `@kobalte/core` 0.13.14 | Accessible dialogs, menus, popovers with zero visual opinion | Radix (React only) |
| Palette | own, over Kobalte's combobox | n/a | Generated from the keymap; cmdk is React only | none |
| Reactive helpers | `@solid-primitives/keyboard` 1.3.7 · `@solid-primitives/resize-observer` 2.2.0 | | Chords and the width-tier container observer | own |
| Styling | Tailwind v4 over CSS variables | `tailwindcss` 4.3.3 · `@tailwindcss/vite` 4.3.3 | Utilities bound to flavor tokens; no color literals (a check script ratchets it) | CSS modules |
| Virtualization | `@tanstack/solid-virtual` | 3.13.38 | Long transcripts and file trees | own |
| Diff / review | CodeMirror 6 merge view | `@codemirror/merge` 6.12.2 · `@codemirror/view` 6.43.11 · `@codemirror/state` 6.7.4 | Best embeddable diff; read-only, deep-link to `$EDITOR` | Monaco |
| Terminal | xterm | `@xterm/xterm` 6.0.0 · `@xterm/addon-fit` 0.11.0 · `@xterm/addon-webgl` 0.19.0 | The terminal pane over node-pty; the bridge that runs the real keywork TUI in a pane | none |
| Markdown | `marked` 18.0.12 rendering to Solid through a small own renderer | | The transcript's prose; `solid-markdown` 2.1.1 is the fallback if the own renderer is not worth it | remark pipeline |
| Highlighting | shiki | 4.4.3 | Fences and diffs themed from flavor tokens | highlight.js |
| Fonts | bundled: one monospace, one text serif (chosen in the design pass) with system fallbacks | n/a | Zero network; serif prose is the AD7 decision | none |

## Toolchain and quality

| Tool | Version | Note |
|---|---|---|
| Bun | 1.3.x (`packageManager` pinned) | Workspaces, scripts, the check rail; matches keywork. Electron itself runs on Node; Bun drives the repo |
| TypeScript | 5.9.3 | keywork's pin; TypeScript 7 (7.0.2 today) evaluated once keywork moves |
| Vitest | 4.1.10 | keywork's pin; `happy-dom` 20.14.0 and `@solidjs/testing-library` 0.8.10 for components |
| Biome | 2.5.12 | Lint and format |
| Playwright | 1.63.0 | End-to-end against the built app with a mock server; screenshots per flavor and per width tier |

## Repository layout

```
keywork-app/
  AGENTS.md · CLAUDE.md (shim) · NOTICE · README.md
  docs/                 architecture.md · stack.md · plan.md · README.md
  packages/
    protocol/           envelope + event types mirrored from docs/events.md, OpenAPI route ids, fixtures
    client/             typed HTTP client, SSE reader with resume and backoff, the projection reducer
    ui/                 the Solid renderer: panes, tiling, palette, keymap, flavors (shell-agnostic via HostPort)
    desktop/            the Electron project: main, preload, packaging, the sidecar binaries
  scripts/              check-pins.ts · check-guardrails.ts · check-contract.ts · check-colors.ts · record-fixtures.ts
```

`protocol` and `client` have no DOM dependency and run under plain Vitest; `ui` runs under
`happy-dom`; `desktop` builds with electron-builder and is exercised by Playwright.

## What the server must grow

The app is only as capable as `keywork serve`. Today the server exposes sessions (list,
create, read, prompt, abort) and the event stream; asks are answered no. The server lane in
`docs/plan.md` lists the routes the app needs, in the order the milestones need them. That
work lands in the keywork repo under keywork's rules.
