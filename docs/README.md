# DroneLinkClient documentation

Reviewed: 2026-11-05. Role: React web interface, build/test ownership and versioned frontend artifacts.

- [Local architecture](architecture.md)
- [Local operations](operations.md)
- [System documentation index](../../DroneLinkDatastore/docs/README.md)
- [Critical system summary](../../DroneLinkDatastore/docs/SUMMARY.md)
- [Shared packet/API contracts](../../DroneLinkDatastore/docs/contracts/README.md)
- [Master roadmap and implementation plans](../../DroneLinkDatastore/docs/planning/roadmap.md)
- [Documentation conventions](../../DroneLinkDatastore/docs/contributing.md)

System facts and roadmap status are maintained in Datastore; this repo owns its component details. Cross-repo links assume sibling checkouts with these names.

## Project intent and accepted target boundaries

Read [objectives and requirements](../../DroneLinkDatastore/docs/project/objectives.md), [traceability](../../DroneLinkDatastore/docs/project/traceability.md) and [target repository architecture](../../DroneLinkDatastore/docs/architecture/target.md). The target responsibilities are accepted; Client extraction is implemented under SEP-03; backend/persistence migration remains pending. The local architecture guide describes current source.

## Architecture baseline

The agreed cross-repository direction is frozen as [ARCH-1.0](../../DroneLinkDatastore/docs/architecture/baseline.md). Use the [canonical glossary](../../DroneLinkDatastore/docs/project/glossary.md) for actors and terms, and [requirements](../../DroneLinkDatastore/docs/project/requirements.md) for policy. [SEP-01](../../DroneLinkDatastore/docs/planning/sep-01-protocol-compatibility.md) established the pinned protocol and [SEP-03](../../DroneLinkDatastore/docs/planning/repository-separation.md#sep-03-planning-decisions--2026-11-05) moves Client source/build ownership.
