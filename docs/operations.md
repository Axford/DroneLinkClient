# DroneLinkClient operations

Reviewed: 2026-11-05. Client owns the React application extracted by [SEP-03](../../DroneLinkDatastore/docs/planning/repository-separation.md#sep-03-planning-decisions--2026-11-05). Live Google/MongoDB, full-browser deployment and hardware checks remain separate.

## Install, test and build

Requirements: Node.js/npm compatible with the locked React Scripts 5 application and Python 3.9+ for the standard-library release tools/tests. Validation uses Node 22.23.4, npm 10.9.9 and Python 3. No sibling checkout is needed for these commands:

```sh
npm ci
CI=true npm test -- --watchAll=false
npm run test:protocol
npm run test:release
npm run build
```

The React tests use the actual router with Jest-only mappings for React Router's package exports and TextEncoder/TextDecoder globals. Heavy page components are isolated in the app-startup tests; this does not prove full map/inspector browser interaction. Existing dependency deprecations, Browserslist-age and bundle-size advisories are not resolved by extraction. No dependency versions were upgraded. The vendored protocol 0.1.1 archive and lockfile integrity remain pinned; no backend/database package enters the browser graph.

`npm start` starts the React dev server. It has no configured backend proxy, and a separate origin does not inherit backend sessions. For integrated API/auth checks use the production artifact served by the backend; do not assume the dev server supplies same-origin integration.

## Versioned releases

Commit source/tests/docs before packaging. `npm run pack:release` rejects a dirty checkout, runs the production build and writes only ignored local `releases/` outputs. It uses Python's standard library, Node/npm and Git; it neither publishes nor copies to another repository.

```sh
npm run pack:release
npm run verify:release -- releases/dronelink-client-<version>-<fullClientRevision>.tgz
npm run verify:release -- releases/dronelink-client-<version>-<fullClientRevision>.tgz --extract /absolute/new-release-directory
```

The archive contains `build/` plus `release-manifest.json`; the adjacent `.sha256` covers the archive bytes. Keep both together. The manifest records schema version, package version, clean Client revision, protocol version/archive SHA-256, Node/npm versions and every built file's SHA-256. It is deliberately separate from React's `asset-manifest.json`. Existing source maps are retained. Use only intended browser build inputs; never supply backend credentials to the build.

Verification checks archive identity/digest, manifest/provenance shape, exact regular-file set/hashes and required shell/static files before extracting. Absolute/traversing paths, duplicate entries, symlinks and hardlinks are rejected. Extraction requires an explicit fresh destination and refuses to overwrite an existing release. Verification is integrity evidence, not publisher authentication. Reusing a release identity with different bytes fails. Archive generation normalizes tar/gzip metadata, but cross-toolchain byte reproducibility is not guaranteed.

Select `/absolute/new-release-directory/build` in the backend's optional `clientBuildDir`. The backend continues to serve the same origin and URLs, with its own Google/session checks; this is not a separate UI service. Keep the previous verified release directory and matching backend/config revision. Roll back by selecting that directory; do not replace the selected release in place. A deployment retaining the backend's default path may explicitly install a verified build at Server `hosted/private/build`; this directory contains artifacts only. Clear or replace a stale ignored default build deliberately during cutover.

## Coordinated acceptance

These development checks require the named sibling repositories and installed dependencies; they are separate from ordinary Client builds:

```sh
cd ../DroneLinkServer/hosted
CLIENT_BUILD_DIR=/absolute/new-release-directory/build npm run test:application
CLIENT_BUILD_DIR=/absolute/new-release-directory/build npm run test:integration
cd ../../DroneLinkDatastore
DRONELINK_CLIENT_DIR=../DroneLinkClient npm run test:protocol
python3 tools/check_docs.py
```

The HTTP suite uses real middleware/session/routing and isolated identity/model adapters. It replays pre-SEP-02 behavior and the SEP-02 backend; it does not contact Google or MongoDB. Repeat with the retained pre-extraction build for the bounded old/new compatibility matrix. See the central [plan/evidence](../../DroneLinkDatastore/docs/planning/repository-separation.md#sep-03-planning-decisions--2026-11-05) for exact companion revisions and completion results.

## SEP-03 initial implementation checks

Before the release commit: locked `npm ci` succeeds, three React startup tests pass, 20 actual TypeScript codec tests pass, 12 release tests pass and the production build succeeds. The original React test could not resolve React Router under Jest; the test-only mappings/globals fix it without changing application behavior. The release tests include source edits and concurrent commits during a build, both rejected before publication. The source import is split revision `bed5bd275a9fb37fa581e0b227ca5ca3ae07039b` from Datastore `9bed13e101e5941f712f14a9e243186a7bf4f981`. All application/public/codec source bytes are unchanged except `App.test.tsx` and `setupTests.ts`; package metadata, documentation and ignore rules change for ownership/test/release tooling. Final isolated release/matrix results and companion revisions belong in the central SEP-03 evidence.

## Completed SEP-03 local acceptance

Companion Datastore commit: `3864195` (source removal, explicit artifact/client test inputs, compatibility tests and central evidence). The tested Client implementation/release remains `afcb0a2b78a1e6e026c0cc8b019fedcb3d903262`; this documentation follow-up changes no application/tooling bytes. The original Client and imported frontend histories are both ancestors of that release commit.

A separate C1 clone with its own locked installation and no sibling repositories passes three React startup tests, 20 codec tests, 12 release tests and production packaging/verification/extraction. Repackaging produces identical bytes in the checked environment. Dirty sources and identity collisions are rejected. Both old and new frontend artifacts pass 51 HTTP/session checks against the SEP-02 and current backends; retained release selection, missing/installed default paths and invalid-artifact failures pass. Coordinated protocol checks pass 20 tests; unchanged gateway checks pass 27 tests and 16 browser fixture round trips. Documentation checks pass.

Local ignored `releases/` retains the C1 archive and checksum, verified `installed-afcb0a2/` directory, pre-extraction `baseline-f0-9bed13e/` build with source/checksum inventory, and acceptance logs. C1 archive SHA-256: `8eaa3456c36079ce1089f4b4945f09dbfaacff96664d241d1b5d62bbb2d786f6`. No service configuration was changed and no artifact was deployed or published. Live Google/MongoDB/full-browser deployment, hardware and backend/persistence extraction remain pending.

## SEP-04 service ownership update

The active backend now belongs to Server `hosted/`, with its own installation/configuration and a pinned persistence archive. Client source and C1 release bytes are unchanged. Use [hosted operations](../../DroneLinkServer/hosted/README.md) for selection of a verified Client build and HTTP/real-storage acceptance. Relative `clientBuildDir` resolves against the hosted package root; its default is `hosted/private/build`. Datastore retains shared contracts, persistence/protocol libraries and coordinated development checks; it has no backend start command. Earlier SEP-03 evidence above describes its then-current Datastore backend and is retained as historical evidence.

SEP-04 companions: Server hosted implementation `975651f`, Datastore completion/evidence `b288660`. This documentation follow-up changes no Client source or C1 release bytes; Client codec/release/archive checks still pass.

## SEP-06 native Client adoption

Current Client uses the matched native hosted API: opaque domain cursor stack for Next/Previous; complete fixed-window history pagination followed by the final cursor into live polling, including empty history. Domain navigation/unmount aborts requests/timers and generation checks discard late replies. Recent packet IDs are deduplicated with bounded memory. Retained packet counts are requested only by Count/Refresh controls. Google/pending admission remains Server-owned; there is no database SDK in Client. The command stub reports unavailable rather than delivered. React tests now include history continuation, empty-history live start and stale-domain response exclusion. Test-only Jest transforms include the pinned protocol ESM module. Protocol bytes/releases remain unchanged. Real managed/browser acceptance belongs in the central SEP-06 ledger.

## SEP-06 page lifecycle acceptance follow-up

DomainDetailPage now follows domain route changes rather than a component-lifetime loaded flag. Its metadata requests are abortable, late results cannot replace the current domain, and cleanup stops the previous stream. Map initialization follows loading completion, including history replays exceeding the earlier retry window. Two actual-page/real-hook React regressions demonstrate the old domain-switch and slow-map failures and pass with the fixes. Eight React tests now pass; standards/spec review found no additional issues. The protocol and storage interfaces are unchanged. This follow-up pairs with Server1fd14d5/native0.2.0 and replaces the earlier Clientf638585 artifact in the next matched staging deployment.

## SEP-06 completed hosted acceptance — 2026-11-06

Client19619c7 is the verified deployed artifact, paired with Server artifact1fd14d5/native persistence0.2.0. Real Google pending/approved/disabled flows, domain creation, retained count, map/inspector rendering, decoded history and live changes pass. The user manually confirmed reload/reconnect at six messages/value43.5, then a seventh packet changed the open page to44.5 without refresh. Eight React regressions and the production build pass; unchanged protocol/release tooling results remain valid and the final immutable archive verifies. This documentation follow-up changes no release bytes. The shared plan owns exact image/source/archive identities and completion evidence.

Production, physical gateway preservation and M1/M2 product behavior remain outside SEP-06.

## Inspector expansion fix — 2026-11-06

ChannelList owns expansion state for both bulk controls and individual channel headers. ChannelCard uses that controlled value directly, so Expand All and Collapse All update the visible parameter lists and stay synchronized after individual toggles. A real-component regression reproduced the old bulk-expansion failure and now covers repeated bulk and individual actions. Nine React tests,20 codec tests and12 release tests pass; the production build and matched staging release are recorded in the shared plan.

## M1 A.3 local acceptance — 2026-11-06

The matching Server source is94cf71b with persistence0.3.0, plus A.4 release guards; deploy only a matched verified artifact under the M1 maintenance procedure. New Client manifests carry accessPolicyVersion1; the new Server release tool rejects older Client contracts. GET logout is no longer a sign-out action: Client obtains a CSRF token and uses protected POST before navigating away.

Local acceptance includes collaboration/targeted-invitation interactions, Viewer key exclusion, stale key/context/domain denial cleanup, archive controls and retained history, plus the existing map/inspector/codec/release checks. Real isolated Chrome against native emulator-backed Server verifies creation, copy/accept, Viewer denial, Editor key visibility, demotion cleanup and archive/reload/restore in two browser contexts. Only OAuth provider responses are substituted; production app/storage/Client and real OAuth-state handling are used. This is not a managed Google claim. Browser runner is Server hosted/tests/browser/access.cjs with explicit CLIENT_BUILD_DIR and optionally DRONELINK_PLAYWRIGHT_MODULE, using an installed Chrome and owned demo project.

The user chose one real Admin account for managed acceptance and deferred real ordinary-role accounts. Do not claim full M1/A-T8 closure from local synthetic identities. Retain the previous staging release as historical evidence; after policy activation recovery is maintenance plus a compatible M1 release.
