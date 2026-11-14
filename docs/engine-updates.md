# Published engine adoption

This repository adopts a new Keywork engine by itself. Nothing is sent between repositories:
Keywork publishes a public release, and `engine-update.yml` here reads it. The workflow runs
twice an hour and can be run by hand from the Actions tab when waiting is not wanted. It
uses only the token GitHub gives every workflow run, so there is no GitHub App, personal
token, or shared secret to create, rotate, or lose.

## What a run does

The updater reads the latest public Keywork release, its lightweight tag's full commit SHA,
and the contract fixtures from that exact source. Then one of three things happens:

- **Nothing to adopt.** The published engine is not newer than `protocolVersion`. The run
  says so and ends.
- **Held.** The engine is newer but serves a contract number other than the App's
  `contractVersion`. The run reports the hold as a notice and ends green. Adopting a contract
  is a change a person makes in the App; once it lands, the next run moves the pin.
- **Adopted.** The contract number matches, so the release is verified in full and its pin
  is committed to `main`.

Full verification means the engine's routes, request bodies, events, and event shapes pass
the existing contract checker; all five native artifacts carry individual checksums and a
`SHA256SUMS` that agree with GitHub's stored artifact digest (historical assets without that
digest are downloaded and hashed); and the host binary reports the exact release and the
App's contract. Drift under an unchanged contract number is an engine defect and fails the
run.

## The commit and the release

Automation changes only `protocolVersion` in `packages/protocol/src/routes.ts`; it does not
change the contract, Electron, migrations, or recorded fixtures. The commit is
`fix(deps): adopt keywork <version>`, authored as the repository owner through the account's
no-reply address and committed by `github-actions[bot]`, so the history shows who owns the
change and that automation made it without adding a bot to the contributor list. Focused
adoption, download, and contract tests run on that exact commit, and the engine tag is read
again, before anything is pushed.

The commit goes straight to `main`. If `main` moved while the release was being verified,
the run holds and the next one adopts against the new `main`. A push made with the workflow
token does not start other workflows, so the updater then starts `release.yml` on `main`
itself. That run is the ordinary release: the full check suite gates it, and the `fix(deps)`
commit selects at least a patch version. If starting the release fails after the push, run
`release.yml` by hand; the pin is already in place.

## Limits

- Adoption lags a Keywork release by up to half an hour unless the workflow is run by hand.
- GitHub pauses scheduled workflows in a repository with no activity for 60 days. Running
  `engine-update` by hand re-enables the schedule.
- A branch rule that forbids direct pushes to `main` would stop the updater. None exists.
