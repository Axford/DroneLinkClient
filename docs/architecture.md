# DroneLinkClient architecture

Status: observed source. Reviewed: 2026-11-04.

This checkout contains Git metadata/configuration and LICENSE only. There is no application, build manifest, packet codec or test suite here as of reviewed code revision `1431a15`.

The current React browser application is in [DroneLinkDatastore/private](../../DroneLinkDatastore/private); the original browser tools are in [DroneLinkServer/public](../../DroneLinkServer/public). Do not assume the Client name implies either application has been extracted here.

Any future extraction needs an architecture decision covering ownership, deployment, API/session assumptions and shared-contract distribution. The proposed separation plan now assigns future operator application extraction here, under the accepted boundary, pending API/build/hosting validation; there is still no implemented application in this checkout.

## Accepted target responsibility boundary

See [target architecture](../../DroneLinkDatastore/docs/architecture/target.md) and [ADR-0003](../../DroneLinkDatastore/docs/decisions/0003-repository-boundaries.md) for the accepted target allocation and [SEP](../../DroneLinkDatastore/docs/planning/repository-separation.md) for review/extraction gates. No runtime relocation is implemented.

Accepted on 2026-11-05: this repository owns web interface. This is target ownership; the observed source described above has not yet moved.
