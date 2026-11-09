# Cutting a keywork-app release

> The release rail (M5.2, M5.3): conventional commits on main, three native installers,
> a checksum-named SDK, and the 60-second install clock.

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
`protocolVersion`, which is also what the app's version check against `/doc` expects.

## Automatic releases

Every merge or direct commit to `main` runs the shared three-platform CI checks once.
The release planner examines commits since the latest published, reachable stable release:
`fix` and `perf` select a patch, `feat` selects a minor, and conventional breaking
changes select a major. Maintenance-only histories do not publish. Reverted unreleased
changes cancel out; an ordinary revert does not independently request a release. Squash
merges need a conventional title because that title becomes the retained commit.

The first release is explicitly `v0.2.2`. Main waits until that release is published;
it never interprets the repository's entire old feature history as a new version. Publish
the matching keywork `v0.2.2` binaries first so the app's unchanged sidecar pin resolves.
Create the initial app tag at the approved commit and push it to start the release workflow.

When a release is due, the workflow assigns its version to the desktop manifest in each
build workspace. Electron, updater metadata, and the SDK all consume that version; the SDK
packer also verifies the expected release tag. The repository does not receive version-bump
commits, and the engine/protocol pin is independent of the desktop release version.

After CI passes, all three platforms fetch and verify the pinned sidecar, build and package
the app, and checksum their installers. The Linux build also packs the SDK. The publish job
verifies every checksum, writes `SHA256SUMS`, and runs the install clock. It then creates or
verifies the release tag at the tested commit, uploads assets into a draft, and publishes the
completed release as GitHub's latest. This all happens in one workflow; it does not depend on
a token-created tag starting a second workflow. Only the publish job has write access.

Read the install clock in the publish job log. The job fails above 60 seconds; when the runner
cannot exercise the installer headlessly it reports that the clock was not measured.

## Retry and tagged builds

Rerun the original failed workflow to recover an unfinished release. Existing tags must still
point to that run's tested commit. Draft assets may be replaced during recovery; obsolete
checksum-named SDK assets are removed before the draft becomes public. Published releases
and their assets are left unchanged.

A tag-triggered run assigns the version from its tag before building, so future tags reproduce
the correct version even when the committed desktop manifest still shows `0.2.2`. Manual
workflow runs on main use the same conventional-commit planner. Release runs are serialized.

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
