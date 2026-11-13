# Published engine adoption

Keywork's successful release workflow sends `keywork-engine-published` to this repository
after publication and its public install smoke check. `engine-update.yml` also reconciles
daily and supports manual reruns, so a lost notification does not strand an update.

The event is only a wake-up signal. The updater reads the canonical public Keywork release,
its lightweight tag's full commit SHA, and contract fixtures from that exact source. All
five native artifacts must have their individual checksums and `SHA256SUMS`; these must
agree with GitHub's stored artifact digest. Historical assets without that digest are
downloaded and hashed. The host binary must report the exact release and current App
contract before adoption continues.

The engine's contract number must equal the App's existing `contractVersion`. Its routes,
request bodies, events, and event shapes must also pass the existing contract checker.
Any drift stops the workflow for protocol review. Automation changes only `protocolVersion`
in `packages/protocol/src/routes.ts`; it does not change the contract, Electron, migrations,
or recorded fixtures.

Compatible updates share `automation/keywork-engine` and one PR. Newer releases replace
older pending pins, while duplicates and older releases cannot downgrade either main or a
pending update. The updater refuses unrelated branch edits and uses a push lease and an
exact PR head for squash auto-merge. It runs focused adoption, download, and contract tests
on the exact committed update before pushing it or requesting auto-merge. It verifies the
tested commit remains unchanged, then binds auto-merge to that SHA. Existing PR CI and any
configured required branch checks remain in force; no new global ruleset is needed.
The `fix(deps): adopt keywork <version>` squash commit triggers the App's patch release,
which publishes its SDK for downstream consumers.

Configure the same dependency GitHub App as `DEPENDENCY_APP_ID` (Actions variable) and
`DEPENDENCY_APP_PRIVATE_KEY` (Actions secret) in Keywork and Keywork App. Install it on
Keywork App with repository contents and pull requests write permissions. Enable repository
auto-merge. These workflows do not need checks or actions permissions. App installation
tokens let its branch pushes and merged dependency commits trigger ordinary CI and release
workflows. Bot identity comes from the App token action, not a hard-coded account name.

Missing credentials and failed auto-merge requests fail visibly with setup instructions;
there is no fallback to a user token or silent manual workflow. Rerun `engine-update` after
fixing setup or an interrupted run. Publication notifications can also be retried from
Keywork's failed notification job without rebuilding or changing an existing release tag.
