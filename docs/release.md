# Cutting a keywork-app release

> The release rail (M5.2, M5.3). `MIRROR:keywork docs/release.md`: the same shape, the same
> tag ritual, the same 60-second install clock, read on the desktop installers instead of a
> single binary.

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

## The ritual

1. Bump `version` in `packages/desktop/package.json` (that manifest is the release version;
   electron-updater compares it against the published `latest*.yml`).
2. Commit, then tag: `git tag v0.1.0 && git push origin v0.1.0`.
3. `release.yml` runs: check + test on all three runners → sidecar fetched by checksum →
   `electron-vite build` → `electron-builder --publish never` → per-artifact `.sha256` →
   a publish job that re-verifies every checksum, writes `SHA256SUMS`, runs the install clock,
   and creates a **draft** GitHub release with every artifact and the sums.
4. Read the install clock in the publish job log (`install → --version took …ms`). The job
   fails above 60 s; when the runner cannot exercise the installer headlessly it warns instead.
5. Review the draft and publish it. The updater only sees published releases.

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
