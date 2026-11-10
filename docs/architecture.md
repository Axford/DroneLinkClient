# DroneLinkClient architecture

Status: observed source. Reviewed: 2026-11-04.

Client owns the React/TypeScript source at `src/`, public assets at `public/`, its package/lockfile, frontend/codec tests and local release tooling. SEP-03 imports Datastore's frontend subtree history without rewriting the existing Client history. LICENSE and local documentation are retained. There is one authoritative frontend source tree; Server `hosted/` now owns the Express backend and same-origin artifact hosting; Datastore owns persistence/protocol libraries.

[App](../src/App.tsx) owns session/domain startup; [DomainDetailPage](../src/DomainDetailPage.tsx) owns the map/inspector layout; [DroneLinkState](../src/dronelink/DroneLinkState.ts) projects shared persisted observations into the existing map/inspector model through the owned CloudObservations lifecycle; packet history is separate. SEP-06 adds packet cursors and request cancellation; commands remain unavailable until M2; see the shared [HTTP contract](../../DroneLinkDatastore/docs/contracts/http.md).

The actual TypeScript codec consumes the checked-in protocol 0.1.2 archive under `vendor/`, with a lockfile integrity pin. Normal install/build/test/release uses no sibling source. [Release tooling](../tools/release.py) owns archive/provenance/integrity and fresh-directory extraction; the backend owns route authentication and artifact selection through `clientBuildDir`. Browser APIs and assets retain their same-origin/root-relative paths; no API origin or auth redesign is introduced. Build artifacts contain no server source/configuration or node_modules. See [operations](operations.md).

## Accepted target responsibility boundary

See [target architecture](../../DroneLinkDatastore/docs/architecture/target.md) and [ADR-0003](../../DroneLinkDatastore/docs/decisions/0003-repository-boundaries.md) for the accepted target allocation and [SEP](../../DroneLinkDatastore/docs/planning/repository-separation.md) for review/extraction gates. Client source ownership has moved under SEP-03; backend/persistence extraction is now completed under the SEP-04 local gate.

Accepted on 2026-11-05: this repository owns web interface. SEP-03 implements this Client ownership; hosted/persistence source separation now follows SEP-04; broader product/deployment gates remain.

## Agreed workbench Client direction

After the first usable cloud release, WB adds the shared Client workbench experience. Connected use is cloud-hosted Client with a local gateway link; standalone/offline uses that same Client served locally by the gateway. Choose Local/Cloud per node using current gateway reachability, show source/freshness and support browser-local overrides per gateway/domain/node (Auto default). New commands follow the selected direct-local/cloud-dispatch path without migrating existing entries. Cloud views/actions require the collaborator's Google role; direct-local work remains available without cloud login.

Files start from the node; Upload and Restart stay separate. In cloud use, changed-content read/written node-file snapshots are backed up with configurable retention, no draft backups, non-blocking pending/retry status and manual editor-only restore. No automatic cloud deployment. Gateway process pairing/relay is separately domain-scoped and uses its own revocable credential. These are agreed target behaviours; APIs, browser permission/access integration and implementation remain pending. See [SYS-19–SYS-22](../../DroneLinkDatastore/docs/project/requirements.md).

## Iridium command target — later S1

Later S1 sends satellite commands through the hosted Server, which submits to Iridium rather than a second platform delivery queue. Keep requested/submitted status separate from observed node execution; do not infer provider submission means the device executed the command.

## M1 A.3 collaboration source — 2026-11-06

Client now consumes the M1 access API: explicit capabilities, targeted invitations and per-session CSRF, with401/403/409 handled distinctly. Domain summaries contain no keys or shared tokens. Collaboration owns bounded member/invitation pages and separately fetched ephemeral keys/share links; role/lifecycle changes clear privileged state. Request generations discard obsolete key/list/context results, including responses crossing domain switches. Domain revisions refresh externally changed memberships without discarding a newly issued link. Context refresh runs on focus and every15 seconds; Server remains the authorization authority.

Archived domains have a dedicated list/read-only banner and retained history without live polling. Owner/Admin restore re-enables subsequent observations; it does not replay rejected traffic. Invite pages reveal no domain metadata before the targeted verified identity, preserve a validated invitation return path across Google/account switching and require explicit acceptance. Parameter controls are observation-only until commands are implemented. New release manifests declare accessPolicyVersion1 for matched Server packaging. Managed ordinary-account checks are deferred by the user's decision; local multi-role browser evidence lives in the owning M1 plan.


## M1-C shared observation source — 2026-11-07

CloudObservations owns snapshot pages, revision/generation catch-up, cancellable live waits, automatic resynchronisation and expected-generation reset. The React hook exposes shared loading/status and the saved Domain failed-write count. Canonical value/NAME bytes use the existing codec; source and original receipt/change times survive reads/reload. NAME-only rows retain name attribution without inventing a value receipt. Quiet nodes retain structure and carry no inferred offline badge. Reset is visible only for canEdit Domains, confirms the retained identity/history and gateway-suppression limit, and applies authoritative results/events. Parameter dispatch stays unavailable until M2.

Source generations fence navigation/access/cancellation. Passive diagnostics have one independent five-second request, so they cannot stall live updates. A failed resynchronisation retries a fresh snapshot with bounded delay; it does not silently continue from an incomplete view. The legacy loadHistory method is a documented compatibility alias to shared observations, and current React call sites use loadSharedObservations. No database package enters Client. New immutable Client manifests declare observationPolicyVersion1 for matched Server packaging. Managed C activation remains separately scoped.


## M1-D cloud operator view — 2026-11-08

The owned `mapBindings` projection reconstructs legacy semantic role registrations from shared snapshots, choosing higher mapping priority then lower channel ID, independently of receipt age. NMEA and Nav primary positions feed the Mapbox `ObservedMap`; the inspector exposes selected role/address/path/priority and source/receipt provenance for all six roles. Bindings are rebuilt after module-type discovery, reset and reload without packet-history replay or device queries. Live headers missing a Drone ID are enriched through the existing bounded identities API before publishing, with Domain-generation fencing. The [shared roadmap](../../DroneLinkDatastore/docs/planning/roadmap.md#map-visualisation-phasing) allocates deferred overlays to M4.

ObservedMap owns SDK initialization, marker updates/cleanup, explicit Fit observed positions and debounced protected map-view saving. Marker clicks select the carried node/singleton inspector; Domain changes and access denial unmount the old map/selection. Invalid selected coordinates remove the current marker without choosing a lower-priority source. Legacy zero-longitude suppression remains explicit. Saved snapshots cannot reproduce the legacy browser's last-valid marker after an invalid value overwrites it. Missing basemap configuration/errors preserve inspector access. Cloud updates expose retrying/recovery without discarding saved observations or refreshing receipt timestamps. Current role/archive capabilities control reset; parameter/channel dispatch controls remain unavailable for M2.


## M1.2 bounded codec corrections — 2026-11-08

DroneLinkMsg still consumes portable constants only. Protocol0.1.2 updates optional conformance coverage; its wire constants/types and firmware snapshots match0.1.1 apart from version banners. Framed link output validates length, wraps the existing unframed bytes and adds CRC-8; it is not the active serial mesh envelope. ADDR helpers preserve up to four complete flat entries, validating before mutation. Binary-log reads use unsigned big-endian low32-bit timestamps; encoding/time-base and raw-parser/string behavior remain unchanged. The [shared contract](../../DroneLinkDatastore/docs/contracts/packet.md#m12-bounded-codec-software-corrections--2026-11-08) owns exact bytes and deferred policies.

## Homepage administration and operational view — 2026-11-10

`HomePage`/`DomainCard` own domain overview and administration. Cards count accepted members through every existing member page and retained Drone/node identities through the identity endpoint; these are retained totals, not online-device counts. Packet counts remain explicit reads. The collapsed `DomainCollaboration` panel expands its card to the full row width, loads member/invitation pages on opening and clears displayed keys/share links on closing. Its existing role/lifecycle and obsolete-response safeguards remain in use. The homepage refreshes access context on focus/every 15 seconds and after actions; archive/restore/leave update the owning list. A denied access event unmounts privileged card state during reauthorization; transient background list failures retain the displayed list.

`DomainDetailPage` presents map/inspector and operational observation/reset feedback, with Domains navigation. It retains its independent access refresh, Viewer restrictions and archive read-only handling. No administration panel is mounted there. This is a Client presentation change against the existing APIs; no new token type or authorization policy is introduced. Acceptance and deployment limits are recorded in the central [M1 follow-up](../../DroneLinkDatastore/docs/planning/m1-contracts-and-telemetry.md#homepage-domain-administration-follow-up--2026-11-10).

Homepage review refinement: Bootstrap `data-bs-theme="dark"` scopes the signed-in shell and creation modal, including cards, tabs, forms and settings. Status filters use an accessible tab list and labelled results panel. Card titles are the sole operational links; the count-refresh icon retains its accessible name. Role/status badges remain visible in the card header, allowing the expansion label to read simply Domain settings. These presentation changes preserve the access/data lifecycle described above.

## Shared design foundation — 2026-11-10

Client `public/design-tokens.css` is the single styling-token source for the hosted UI. It declares semantic dark colours, a 14px base and common typography, spacing, dimensions, borders, radii, elevation, focus and motion values. `public/design-system.css` maps them into Bootstrap and common surface classes. Both ship as ordinary immutable Client release assets and are loaded by the HTML entry; no runtime sibling imports or UI framework migration occurs. Server serves these exact files from its selected Client artifact, allowing its sign-in page to share the foundation. Shared `components/ui` own accessible icon actions, focus-managed settings dialogs and page feedback; surface adoption is recorded separately in the central plan.
