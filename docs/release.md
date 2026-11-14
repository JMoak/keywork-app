# Cutting a keywork-app release

> The release rail (M5.2, M5.3): conventional commits on main, three native installers,
> an npm SDK, native installers, and the 60-second install clock.

## What ships

One installer per platform, each built on its own runner by `release.yml`, with the pinned
keywork sidecar inside it under `resources/sidecar/`.

| asset | built on | contents |
|---|---|---|
| `keywork-app-<version>-win-x64.exe` | `windows-latest` | NSIS installer |
| `keywork-app-<version>-mac-arm64.dmg` | `macos-latest` | dmg (unsigned until the secrets below exist) |
| `keywork-app-<version>-linux-x64.AppImage` | `ubuntu-latest` | AppImage |
| `keywork-app-<version>-linux-amd64.deb` | `ubuntu-latest` | deb |

Every asset has a `<asset>.sha256` beside it and the release carries a combined `SHA256SUMS`.
electron-builder also emits `latest.yml`, `latest-mac.yml` and `latest-linux.yml` with the
`.blockmap` files; those are what electron-updater reads, so they ship with the release too.

## The sidecar pin

The app bundles the keywork binary whose version equals `protocolVersion` in
`packages/protocol/src/routes.ts`. `bun run fetch:sidecar` downloads that version's asset
from the keywork GitHub release (`keywork-windows-x64.exe`, `keywork-darwin-arm64`,
`keywork-linux-x64`, ...) together with its published `.sha256`, verifies the digest, and
writes it to `packages/desktop/sidecar/` where electron-builder's `extraResources` picks it
up. Nothing is written on a mismatch. `--all` fans every platform out into
`sidecar/<platform>-<arch>/` for a multi-platform package. Bumping the sidecar is bumping
`protocolVersion`. At launch the app compares only `contractVersion` against `/doc`, so an engine of
another release that speaks the same contract is accepted.

## Automatic releases

Every merge or direct commit to `main` runs the shared Linux CI checks once.
PRs use that same test suite. Explicit release tags skip the repeated full test suite;
every release still type-checks and builds its installers on all three native platforms.
The release planner examines commits since the highest reserved, reachable stable release tag:
`fix` and `perf` select a patch, `feat` selects a minor, and conventional breaking
changes select a major. Maintenance-only histories do not publish. Reverted unreleased
changes cancel out; an ordinary revert does not independently request a release. Squash
merges need a conventional title because that title becomes the retained commit.

The first release uses an explicit stable tag at or above `v0.2.2`. Main waits until a
baseline tag exists; it never interprets the repository's entire old feature history as a
new version. Release tags reserve versions even when a later publication step fails.

When a release is due, the workflow assigns its version to the desktop manifest in each
build workspace. Electron, updater metadata, and the SDK all consume that version; the SDK
packer also verifies the expected release tag. The repository does not receive version-bump
commits, and the engine/protocol pin is independent of the desktop release version.

After CI passes, the reserve job creates or verifies the immutable release tag at the tested
commit. A Linux SDK job builds and packs the desktop library without downloading a sidecar or
packaging an installer. The npm publication job consumes that archive immediately. In parallel,
all three native platforms fetch and verify the sidecar, build and package the app, and checksum
their installers. The native publish job verifies every checksum, writes `SHA256SUMS`, runs the
install clock, and publishes the completed GitHub release with the SDK archive retained for
existing consumers. Native publication does not depend on npm publication.
The reserve and native publish jobs have repository write access; the npm job has OIDC access.

The stages share `release.yml` and its global release concurrency lock. An SDK can publish before
its own installers finish, but the next workflow run still waits for the preceding run to end.

Read the install clock in the publish job log. The job fails above 60 seconds; when the runner
cannot exercise the installer headlessly it reports that the clock was not measured.

## Retry and tagged builds

Rerun the original failed workflow to recover an unfinished release. The planner reuses the tag
already reserved at that run's source SHA, even if a newer version has since shipped. A reserved
version is never reused for another SHA. Later conventional commits advance beyond the highest
reserved tag even if that version's installers or npm publication failed; gaps are acceptable.
Draft assets may be replaced during recovery; obsolete checksum-named SDK assets are removed
before the draft becomes public. Published GitHub releases and their assets are left unchanged.
An older recovery never replaces a newer GitHub or npm `latest` version.

A tag-triggered run assigns the version from its tag before building, so future tags reproduce
the correct version even when the committed desktop manifest still shows `0.2.2`. Manual
workflow runs on main use the same conventional-commit planner. Release runs are serialized.

## npm desktop SDK

`@jmoak/keywork-desktop` contains the compiled runtime and renderer, declarations, external runtime
dependencies (including `node-pty`), and `build.json` with `{version, engine, contract, electron}`.
Its package manifest records `gitHead` as the immutable source SHA. Consumers pin the exact npm
version and lockfile integrity; the GitHub release tag identifies the same source independently
of installer availability.

The `publish-sdk` job uses Node 24 and npm 12.2.2 with OIDC trusted publishing and public provenance.
The package owner must first bootstrap a genuine legacy SDK version to create the npm package.
A local bootstrap cannot satisfy the workflow's provenance check: preserve that version's
actual release SHA and build tuple, and use a new version for the first automated publication.
Configure the npm trusted publisher for `@jmoak/keywork-desktop` with owner **JMoak**, repository **keywork-app**, workflow
filename **release.yml** (the file is `.github/workflows/release.yml`), and no environment name.
Allow direct `npm publish`. After setup, set the GitHub repository variable
`NPM_TRUSTED_PUBLISHING_READY` to `true`. No npm token secret is used. Until setup is complete,
the job reports `setup-needed` and the native installer path can still finish.

Publication succeeds only after npm exposes the expected package/version, source SHA, SHA-512
integrity, and provenance metadata, and the downloaded archive passes its integrity and build
tuple checks. A retry verifies an existing version instead of publishing it again. A newly
published archive must also match the exact bytes uploaded by this run.

Publication notifies no consumer, and this repository holds no credential for another
repository. A consumer such as Stead reads the public npm version and its `build.json` tuple
when it advances its own pin. The same rule runs upstream: [engine-updates.md](engine-updates.md)
describes how this repository adopts a published engine by itself.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for the package-side setup.

## Signing secrets

Signing and notarization run only when the secret exists; without them the workflow is still
green and the artifacts are unsigned.

| secret | used for |
|---|---|
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Authenticode signing of the NSIS installer and `keywork.exe` |
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | Developer ID signing of the macOS app and dmg |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarization after signing |

Linux artifacts are never signed; their `.sha256` is the integrity story.

## The updater

`packages/desktop/src/main/updater.ts` holds the policy and `updater-electron.ts` the wiring:
electron-updater against the `JMoak/keywork-app` GitHub releases, a check 30 s after launch
and every 6 h, downloads in the background, and `update-ready` surfaced to the renderer over
`HostPort.onUpdateReady`. Nothing installs until the user accepts (`HostPort.acceptUpdate`),
and then only on quit. The updater is disabled in dev (`app.isPackaged` is false).

**Windows updates need a signed build.** electron-updater verifies the downloaded installer's
Authenticode signature against the running app's publisher. An unsigned build updates only
with a warning: the installer runs, Windows SmartScreen interrupts it with an unknown-publisher
prompt, and users have to click through. Set the `WIN_CSC_*` secrets before shipping an
update that is meant to be quiet. macOS updates require a signed and notarized app outright;
unsigned dmgs install by hand only.

## Locally

```sh
bun run fetch:sidecar                       # the host platform's keywork, verified
bun run --cwd packages/desktop build        # electron-vite build
bun run --cwd packages/desktop pack         # electron-builder --publish never → packages/desktop/release/
bun run dist                                # both, the publish behavior left to electron-builder
```

## Pins

Every action in `.github/workflows/` is pinned to a full commit SHA with the version as a
comment (`scripts/check-pins.ts` enforces it), and `release.yml` uses the same Bun as
`ci.yml`. Bump by looking up the tag's commit (`git ls-remote --tags
https://github.com/<owner>/<action>`) and updating both the SHA and the comment.
