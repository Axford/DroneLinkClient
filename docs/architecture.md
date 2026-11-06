# DroneLinkClient architecture

Status: observed source. Reviewed: 2026-11-04.

Client owns the React/TypeScript source at `src/`, public assets at `public/`, its package/lockfile, frontend/codec tests and local release tooling. SEP-03 imports Datastore's frontend subtree history without rewriting the existing Client history. LICENSE and local documentation are retained. There is one authoritative frontend source tree; Server `hosted/` now owns the Express backend and same-origin artifact hosting; Datastore owns persistence/protocol libraries.

[App](../src/App.tsx) owns session/domain startup; [DomainDetailPage](../src/DomainDetailPage.tsx) owns the map/inspector layout; [DroneLinkState](../src/dronelink/DroneLinkState.ts) reconstructs observed state from history/polling. SEP-06 adds packet cursors and request cancellation; commands remain unavailable until M2; see the shared [HTTP contract](../../DroneLinkDatastore/docs/contracts/http.md).

The actual TypeScript codec consumes the checked-in protocol 0.1.1 archive under `vendor/`, with a lockfile integrity pin. Normal install/build/test/release uses no sibling source. [Release tooling](../tools/release.py) owns archive/provenance/integrity and fresh-directory extraction; the backend owns route authentication and artifact selection through `clientBuildDir`. Browser APIs and assets retain their same-origin/root-relative paths; no API origin or auth redesign is introduced. Build artifacts contain no server source/configuration or node_modules. See [operations](operations.md).

## Accepted target responsibility boundary

See [target architecture](../../DroneLinkDatastore/docs/architecture/target.md) and [ADR-0003](../../DroneLinkDatastore/docs/decisions/0003-repository-boundaries.md) for the accepted target allocation and [SEP](../../DroneLinkDatastore/docs/planning/repository-separation.md) for review/extraction gates. Client source ownership has moved under SEP-03; backend/persistence extraction is now completed under the SEP-04 local gate.

Accepted on 2026-11-05: this repository owns web interface. SEP-03 implements this Client ownership; hosted/persistence source separation now follows SEP-04; broader product/deployment gates remain.

## Agreed workbench Client direction

After the first usable cloud release, WB adds the shared Client workbench experience. Connected use is cloud-hosted Client with a local gateway link; standalone/offline uses that same Client served locally by the gateway. Choose Local/Cloud per node using current gateway reachability, show source/freshness and support browser-local overrides per gateway/domain/node (Auto default). New commands follow the selected direct-local/cloud-dispatch path without migrating existing entries. Cloud views/actions require the collaborator's Google role; direct-local work remains available without cloud login.

Files start from the node; Upload and Restart stay separate. In cloud use, changed-content read/written node-file snapshots are backed up with configurable retention, no draft backups, non-blocking pending/retry status and manual editor-only restore. No automatic cloud deployment. Gateway process pairing/relay is separately domain-scoped and uses its own revocable credential. These are agreed target behaviours; APIs, browser permission/access integration and implementation remain pending. See [SYS-19–SYS-22](../../DroneLinkDatastore/docs/project/requirements.md).

## Iridium command target — later S1

Later S1 sends satellite commands through the hosted Server, which submits to Iridium rather than a second platform delivery queue. Keep requested/submitted status separate from observed node execution; do not infer provider submission means the device executed the command.
