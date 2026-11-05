# DroneLinkClient architecture

Status: observed source. Reviewed: 2026-11-04.

This checkout contains Git metadata/configuration and LICENSE only. There is no application, build manifest, packet codec or test suite here as of reviewed code revision `1431a15`.

The current React browser application is in [DroneLinkDatastore/private](../../DroneLinkDatastore/private); the original browser tools are in [DroneLinkServer/public](../../DroneLinkServer/public). Do not assume the Client name implies either application has been extracted here.

Any future extraction needs an architecture decision covering ownership, deployment, API/session assumptions and shared-contract distribution. The proposed separation plan now assigns future operator application extraction here, under the accepted boundary, pending API/build/hosting validation; there is still no implemented application in this checkout.

## Accepted target responsibility boundary

See [target architecture](../../DroneLinkDatastore/docs/architecture/target.md) and [ADR-0003](../../DroneLinkDatastore/docs/decisions/0003-repository-boundaries.md) for the accepted target allocation and [SEP](../../DroneLinkDatastore/docs/planning/repository-separation.md) for review/extraction gates. No runtime relocation is implemented.

Accepted on 2026-11-05: this repository owns web interface. This is target ownership; the observed source described above has not yet moved.

## Agreed workbench Client direction

After the first usable cloud release, WB adds the shared Client workbench experience. Connected use is cloud-hosted Client with a local gateway link; standalone/offline uses that same Client served locally by the gateway. Choose Local/Cloud per node using current gateway reachability, show source/freshness and support browser-local overrides per gateway/domain/node (Auto default). New commands follow the selected direct-local/cloud-dispatch path without migrating existing entries. Cloud views/actions require the collaborator's Google role; direct-local work remains available without cloud login.

Files start from the node; Upload and Restart stay separate. In cloud use, changed-content read/written node-file snapshots are backed up with configurable retention, no draft backups, non-blocking pending/retry status and manual editor-only restore. No automatic cloud deployment. Gateway process pairing/relay is separately domain-scoped and uses its own revocable credential. These are agreed target behaviours; APIs, browser permission/access integration and implementation remain pending. See [SYS-19–SYS-22](../../DroneLinkDatastore/docs/project/requirements.md).

## Iridium command target — later S1

Later S1 sends satellite commands through the hosted Server, which submits to Iridium rather than a second platform delivery queue. Keep requested/submitted status separate from observed node execution; do not infer provider submission means the device executed the command.
