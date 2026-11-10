<p align="center">
  <img src="docs/assets/keywork-app-hero.svg" alt="keywork — native desktop workbench. An abstract tiled window and Ctrl/K keycaps in the app's night-theme palette." width="100%">
</p>

<p align="center">
  <a href="packages/desktop/package.json"><img src="https://img.shields.io/badge/desktop-Electron-bb9af7?style=flat-square&amp;labelColor=1a1b26" alt="Electron desktop"></a>
  <a href="packages/ui/package.json"><img src="https://img.shields.io/badge/renderer-Solid-7aa2f7?style=flat-square&amp;labelColor=1a1b26" alt="Solid renderer"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Bun-1.3.14-7dcfff?style=flat-square&amp;labelColor=1a1b26" alt="Bun 1.3.14"></a>
</p>

<p align="center">
  <strong>Keywork, as a native app.</strong><br>
  A keyboard-first desktop for conversations, code, review, and the work around them.
</p>

<p align="center">
  <a href="#the-workbench">Explore</a> ·
  <a href="#run-from-source">Run from source</a> ·
  <a href="#one-engine-several-surfaces">Architecture</a> ·
  <a href="#the-desktop-sdk">Desktop SDK</a> ·
  <a href="docs/release.md">Releases</a>
</p>

---

## The workbench

Keep the conversation, the change, and the evidence beside each other. Keywork-app brings [Keywork](https://github.com/JMoak/keywork)'s coding-agent harness into a native desktop window, with tiling panes, a command palette, an embedded terminal, and the same keyboard grammar as the terminal client.

The app is a client of `keywork serve`. Sessions, tools, permissions, memory, and model execution stay in the shared engine. The desktop presents that work through a typed event stream.

| Bring into view | What it is for |
| :--- | :--- |
| **Conversations & sessions** | Follow streaming work, move between sessions, and keep related tasks in view. |
| **Files & diffs** | Inspect the source and review changes alongside the conversation. |
| **Context & memory** | See the information the engine exposes about a session and its memory. |
| **Terminal** | Work in an embedded PTY without leaving the desktop. |
| **Permissions & needs-you** | See the questions waiting on you and answer through the server's gate. |
| **Stead** | Open the optional creature home inside the workbench. |

### Arrange it with your hands on the keys

The default leader is **Ctrl+K**. Pane actions include focus, summon, dock, move, rotate, and zoom. The command palette and key hints expose the same action definitions, and terminals and editors can own their keyboard input when focused.

Themes come from Keywork's shared theme system. Window chrome, individual work panes, code, terminal output, and prose use the same token vocabulary. The header above is an illustration in the `keywork-night` palette, not an application screenshot.

## Run from source

Use **Bun 1.3.14**. For a browser preview of the renderer:

```sh
git clone https://github.com/JMoak/keywork-app.git
cd keywork-app
bun install --frozen-lockfile
bun run --cwd packages/ui dev
```

Open the local address Vite prints. Browser mode uses a development host with simulated native integrations. Attaching a server is a separate step; the preview alone does not establish live engine behavior.

### Native desktop development

From the same checkout:

```sh
bun run setup:electron
bun run fetch:sidecar
bun run dev
```

`setup:electron` ensures the Electron binary is installed. `fetch:sidecar` fetches and verifies the pinned Keywork runtime for the host platform. The native app requires a compatible runtime; consult the [architecture](docs/architecture.md) and [release runbook](docs/release.md) for attachment, packaging, and compatibility requirements.

<details>
<summary><strong>Develop against a scripted server or inspect the wire contract</strong></summary>

The fixture tools can use an existing Keywork checkout at `../keywork`, or the path in `KEYWORK_REPO`:

```sh
bun run fixtures:record
bun scripts/fixtures/serve-mock.ts --write-ticket
```

The mock-server command runs Keywork's real server with a scripted provider and writes an attachment ticket. These tools are for development; ordinary packaged clients consume the verified runtime rather than importing sibling source.

Check the recorded contract without a sibling checkout:

```sh
bun run check:contract -- --source fixture
```

Or compare against a live server with `bun run check:contract -- --url http://127.0.0.1:4770`.

</details>

## One engine, several surfaces

```text
       Keywork desktop                    Stead
               │                            │
               └────── typed HTTP + SSE ─────┘
                              │
                     shared Keywork runtime
               sessions · tools · memory · permissions
                              │
                         model providers
```

Packaged apps register with an authorized shared runtime and attach to its workspace servers on loopback. A compatible running engine can be reused. Runtime selection, compatibility admission, and safe replacement belong to the engine; closing a desktop window does not itself authorize replacing that runtime.

The renderer runs with context isolation and a sandbox. A typed `HostPort` connects it to the thin Electron shell, which handles windows, native integrations, terminal transport, and runtime attachment. The server token remains in the main process. Model connection setup uses Keywork's own flow; permission policy stays on the server.

## The desktop SDK

This repository also produces **`@jmoak/keywork-desktop`**, a compiled SDK with a `startDesktop` entry and immutable product profiles:

```sh
bun run pack:sdk
```

The archive is written under `dist/sdk/`. Stead consumes that versioned artifact without importing this source checkout.

**Keywork** opens the IDE and offers Stead as an optional pane. **Stead** opens the creature home before a project is selected. The products share desktop capabilities and live runtime state while keeping application identity, settings, protocol handlers, and update feeds separate.

An SDK release, a consumer updating its pin, and a running application activating a runtime are distinct steps. See the [release runbook](docs/release.md) for the artifact and compatibility checks.

## Development & verification

```sh
bun run check   # types, exact pins, guardrails, copy, themes, colors, contract, lint
bun run test    # protocol/client tests, desktop logic, and the Solid renderer
```

Use focused checks for local changes; CI owns the full gate. The screenshot and first-light tools cover different layers of the experience. Read [AGENTS.md](AGENTS.md) before changing execution boundaries or shared contracts.

| Reference | Purpose |
| :--- | :--- |
| [Documentation index](docs/README.md) | The reading order and current plans. |
| [Architecture](docs/architecture.md) | The binding client/server, shell, trust, and design decisions. |
| [Stack](docs/stack.md) | Component choices and repository layout; package manifests hold current pins. |
| [Milestones](docs/plan.md) | Tasks, acceptance criteria, and integration history. |
| [Interface quality](docs/textures.md) | Rendering, input, light themes, latency, and empty-state checks. |
| [Release runbook](docs/release.md) | Native installers, checksums, signing, SDK publication, and upgrades. |
| [Third-party notices](NOTICE) | Attribution for bundled and adapted material. |

Automatic update download and installation are currently held for manual shared-runtime compatibility review. Installer availability and signing vary by release; consult its release notes and the runbook rather than treating a source build as installed-product acceptance.
