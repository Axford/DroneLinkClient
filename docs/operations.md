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

## M1 A.4 managed Admin acceptance — 2026-11-06

Clientce6a9da is deployed with Server0753e33/runtime persistence0.3.0 on staging revision00005-9lh. Fresh real Google sign-in opened the three migrated domains. Real Chrome Admin acceptance passed creation/Owner assignment, last-Owner denial, key Show/Hide, targeted invitation/reissue/revocation, archive/restore and permanent invalidation of pre-archive invitations. One synthetic fixture reached the live inspector; Expand All exposed node1/channel1/parameter1/value1. Final archive/reload retained its history/read-only banner while ingress rejected new traffic. The acceptance domain remains archived; the dashboard returned to the original three active domains. Their keys/memberships and26 original history chunks are unchanged. This docs-only follow-up changes no release bytes. Ordinary-account managed checks remain explicitly deferred; full A-T8/M1 is not closed. See the central M1 evidence ledger for exact release/recovery identities and private evidence location.


## M1-C local acceptance — 2026-11-07

The Client now requires the C observation API and matching persistence0.5.0 hosted release. Shared state starts empty at first C activation; retained history never hydrates the live view. Load/catch-up/resynchronisation preserve saved receipt/change times. Whole-node Reset is cloud-only; unchanged gateway-suppressed values need a fresh Server receipt to reappear. Viewer reset is hidden and Server-enforced. Review the passive cumulative failed snapshot-write count in the inspector; no transient storage-error banner is introduced.

Local checks pass28 React tests,20 protocol cases,12 release regressions and the production build. State tests cover complete scan/catch-up equality, expired continuation, reset, delayed Domain replies, passive stalled diagnostics, NAME-only source/time and transient resynchronisation failure. Existing page lifecycle/access regressions now use snapshot fixtures. The real installed-Chrome runner in Server verifies two synthetic-account contexts sharing observations, reset propagation, unchanged identity/history, rebuild/reload, Viewer denial and archive/read-only behavior. Only provider responses are substituted; app, storage, build and session/CSRF handling are real. These are local/emulator results, not managed Google or C staging acceptance.

Use the shared [grouped local runbook](../../DroneLinkDatastore/docs/operations.md#m1-c-local-validation-runbook-and-grouped-approval) to batch validation and matched packaging. No browser download, physical node, firmware/config upload, real account or cloud mutation is part of that local runner. C.4 managed activation remains separately approved against a concrete matched release.


## M1-D operator-view verification — 2026-11-08

Run `CI=true npm test -- --watchAll=false --runInBand`, `./node_modules/.bin/tsc --noEmit`, `npm run test:protocol`, `npm run test:release` and `npm run build`. The real-component checks cover semantic binding precedence, late type discovery, invalid preferred coordinates, carried-node marker selection/update/removal, Viewer controls, source/time attribution, rebuilt channel expansion and transient access/update failures, live identity hydration and late cross-Domain identity responses. Local verification passes40 React tests, strict TypeScript,20 codec cases,12 release regressions and the production build; the central plan records browser/release completion.

The existing Server `hosted/tests/browser/access.cjs` runner now also exercises real Mapbox markers with an inert intercepted style, synthetic OAuth identities and native emulator-backed snapshots. It uses installed Chrome with software WebGL, no real Mapbox token or external basemap service. The browser gate covers Nav then preferred NMEA selection, competing lower-precedence observations, two-context source/identity, fit/selection, update retry/reconnect, reload, Domain isolation and reset removal. External basemap/managed Google acceptance remains the separate M1-E gate. See the [owning plan](../../DroneLinkDatastore/docs/planning/m1-d-cloud-operator-view.md) for actual evidence and companion revisions.


M1-D final local browser acceptance passes against the native owned emulator: both independent Chrome contexts render/select the correct semantic binding and singleton identity, retain the view across an update failure, reconnect/reload, remove markers on Domain switch/reset and preserve Viewer/archive restrictions. The test substitutes OAuth provider responses and an inert map style only; production Client/Server/persistence, Mapbox SDK/DOM and session/CSRF paths are real. Software WebGL is explicit. Screenshot review confirms a readable bounded operator layout; the map camera remains user-controlled via Fit observed positions. Managed/staging/real basemap acceptance belongs to E. Central companion/release evidence is recorded in the M1-D plan.


## M1.2 codec software checks — 2026-11-08

The Client now pins immutable protocol0.1.2 under vendor with exact lock integrity; retain0.1.1 for historical releases. `npm run test:protocol` passes24 cases, including exact framed CRC/limits, complete address arrays with mutation-safe rejection and unsigned timestamp boundaries. Strict TypeScript,40 React/12 release checks and production build pass. Datastore's coordinated suite additionally proves JS↔TS interchange and an independent archive install/build/repack/C++ host run. This is software acceptance only; firmware serial and physical validation are a separate slice. No cloud activation occurs.

## M1-F strict codec and degraded observations — 2026-11-09

Client now pins protocol0.2.0. Actual TS decode/set/serialize paths enforce exact packet/log boundaries, alignment and representable typed inputs before mutation. Valid wire bytes, single-byte NUL behavior and low32 log timestamps remain unchanged. History rejects invalid records individually; cloud replacement isolates value/name facets, retains valid companions and marks only failed parts unavailable. Inspector displays the current unavailable-part count; reset/removal/domain replacement discards stale facets and warnings. This does not change cloud admission, identity, role, reset or mapping policy.

Local acceptance: locked install, strict typecheck,23 codec tests,12 release tests,46 React/state tests and production build pass. Native hosted real-Chrome tests pass the existing two-context observation/map/reset/reload and access-role flows. Central M1-F owns final matched release identities and staged/physical acceptance; this source checkpoint does not claim a managed deployment.

### M1-F managed acceptance complete — 2026-11-09

Client release `ac0816e` is deployed with Server `30d5704` on staging revision `dronewright-staging-00009-rn9`. Exact static assets, managed valid/malformed ingress, persisted map/inspector provenance, live change and reload pass. The user performed reset in native Chrome; readback proves generation1, preserved Drone/history and post-reset reconstruction without old names. The fixture is archived, its credentials invalidated and all57 original Domain/history record hashes preserved. The isolated browser could inspect observations but its session-token request failed; native Chrome supplied the actual Admin mutation evidence. See central M1-F for artifact identities and verification limits; ordinary-account managed acceptance remains deferred.

## Homepage administration verification — 2026-11-10

Domain administration is reached through each homepage card's Domain settings icon and modal dialog. The domain title opens the operational map/inspector view; the shared rail’s Home link returns to the cards. Counts describe accepted members and retained identities, with explicit Refresh totals/packet count controls. The settings dialog preserves space for the overview cards. Existing Owner/Editor/Viewer/Admin permissions, archive/restore and explicit key replacement confirmations remain in force. The central [M1 follow-up](../../DroneLinkDatastore/docs/planning/m1-contracts-and-telemetry.md#homepage-domain-administration-follow-up--2026-11-10) owns acceptance and companion revisions; staging activation is separate.

Local acceptance passes: 50 React tests, strict `tsc --noEmit`, 23 codec tests, 12 release tests and production build. Matched Server real-Chrome/native-store tests pass invitation/role/key cleanup, two-context observations/map/reset/reconnect and homepage archive/restore; a separate sample-data Chrome check confirms retained totals and full-width expansion. Build retains the existing Browserslist-age/bundle-size advisories. No release archive or managed deployment is produced by this follow-up.

### Homepage review refinements — 2026-11-10

The signed-in homepage and creation dialog use Bootstrap dark styling. Active domains/Archived domains are selected tabs above the list. Cards use title-only operational navigation, top-right role/status badges and an accessible Refresh totals icon on the right of the counts row. Domain settings is the accessible settings action label. Explicit retained packet counts, role enforcement and archive/restore behaviour are preserved. Local verification passes 51 React tests, strict types, 23 protocol tests, 12 release tests, production build and the updated real-Chrome/native-store access/observation/map flow. Desktop screenshot review covers the dark cards and expanded settings; browser checks also confirm dark dialog theming, tab selection, icon placement and badge placement. The running sample preview serves the rebuilt Client; managed deployment remains separate.

## Design-system adoption verification — 2026-11-10

The modern hosted surfaces now share Client-owned `design-tokens.css`/`design-system.css`, a 14px base and dark styling. Home uses compact icon actions and modal settings; Domain operations use the common collapsed rail, compact observation rows and tools/provenance dialogs. Below 768px the rail remains narrow and map/inspector stack vertically. Account, Home and active-Domain shortcuts remain available; no new Admin/command capabilities are introduced. Metadata and headings use named type-scale roles rather than reducing each nested inspector's base size.

Use the modal close/Escape action to dismiss Domain settings; closing clears any displayed key/share link. Parameter details retains receipt/change/name provenance; Inspector tools contains reset and diagnostics. Nonzero write failures and unavailable observation warnings remain directly visible. Invite acceptance and Google sign-in retain their existing authentication requirements. Hosted sign-in consumes the selected Client artifact’s public style assets, so deploy a matched Client/Server release. The [central adoption ledger](../../DroneLinkDatastore/docs/planning/m1-contracts-and-telemetry.md#design-system-adoption--2026-11-10) owns validation, exact companions and deployment limits.

Final local adoption acceptance: 53 React tests, strict types, 23 codec tests, 12 release tests and production build pass. Real Chrome/native Firestore verifies the updated dialogs/navigation plus all prior access/observation/map gates, including modal focus/secret cleanup and 390px layouts. The base is 14px, with explicit metadata/headings type-scale roles. Desktop/native in-app sign-in/Home/settings/inspection and native mobile screenshots were visually reviewed. The sample preview has disposable accounts/data and no real external basemap credential; managed deployment and real-provider acceptance remain separate. Current Server release preparation enforces the two shared style assets.

## Colour-block panel refinement — 2026-11-10

The shared theme now uses borderless buttons, filled primary actions, clear secondary actions with hover fill, and tonal panels/control backgrounds with spacing. Domain settings groups identity, members, keys and invitations; tools/provenance/create dialogs use the same panels. All shared modals use a tinted darkening backdrop with 6px blur and transparent modal roots; unsupported backdrop blur falls back to the tint. Focus outlines and focus trapping/restoration are preserved. Home omits its redundant page heading, retaining status tabs and the create action in one toolbar; contextual Domain/dialog headings remain. No permissions, data workflow or managed deployment is changed. The central [refinement ledger](../../DroneLinkDatastore/docs/planning/m1-contracts-and-telemetry.md#colour-block-and-panel-refinement--2026-11-10) owns acceptance and companions.

## Attached tabs, row actions and danger warnings — 2026-11-10

Home tabs now directly join their content panel with an accent-selected tab. Member role/removal and invitation actions sit together at each row's right edge; key and node actions use the same inline layout. Significant archive, key replacement and shared reset actions have their own danger-tinted group with visible impact text. Membership/leave and invitation revocation carry concise scoped warnings; existing confirmations, last-Owner checks and Server authorization remain unchanged. Warnings are programmatically associated with their icon controls. The central [refinement ledger](../../DroneLinkDatastore/docs/planning/m1-contracts-and-telemetry.md#attached-tabs-row-actions-and-danger-groups--2026-11-10) owns acceptance and companion revisions. No permanent deletion or managed deployment is added.

## Grid and padding verification — 2026-11-10

The shared 4px grid now governs layout spacing, default gutters, panels/cards/dialog bodies, field/button padding, icon dimensions and map controls. Body typography remains 14px with a 20px line height. Framework utility values resolve to the same scale; no independent rem-based spacing scale is used on the current surfaces. Browser acceptance checks actual computed 24px desktop / 12px narrow workspace padding, 16px content/card/dialog/panel padding, and 32px fields/close controls, aligned card heights/bottom actions, and prior responsive/modal/access/observation checks. See the central [grid acceptance ledger](../../DroneLinkDatastore/docs/planning/m1-contracts-and-telemetry.md#consistent-design-grid-and-padding--2026-11-10). No data, permission or managed deployment changes accompany this refinement.

## UI.1 floating node list — 2026-11-10

Use the map's node cards to choose an inspector; selection highlights the corresponding map marker without moving the camera. Locate explicitly centres on a valid last-known position; nodes without positions remain inspectable. Receipt age is saved Server evidence, not an online/offline signal. Missing basemap configuration or map errors leave the node list/inspector available. Narrow screens keep a compact selected-node header; Expand node list opens a scrollable dialog with keyboard selection and focus restoration, including when the map panel is at its minimum height.

UI.1 local verification uses the isolated Server companion's `hosted/tests/browser/access.cjs` with `CLIENT_BUILD_DIR=<frozen-build-directory>` and an installed Playwright/Chrome, Java 21 and the explicitly prepared pinned Firestore emulator. Use a build copied outside hidden worktree directories because Express sendFile's dotfile policy rejects those asset paths. This gate uses synthetic OAuth responses, an owned disposable database and an inert map style; it is not managed-account, external basemap or hardware evidence. The [central UI-01 ledger](../../DroneLinkDatastore/docs/planning/ui-01-domain-workspace.md) records exact results and companions. No staging deployment is included.

UI.1-R keeps blue selection and dark card surfaces while removing the permanent desktop list header. Collapse/Expand is the small control next to the desktop cards. Receipt badges use short ages (for example 4s/3m/2h); hover reveals the exact Server receipt and assistive descriptions preserve it. A dash means no saved receipt, not zero age. Locate sits within each card and keeps its separate keyboard action. Widgets remain planned in UI.4.
