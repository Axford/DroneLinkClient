# DroneLinkClient documentation

Reviewed: 2026-11-06. Role: React web interface, build/test ownership and versioned frontend artifacts.

- [DroneWright design guidelines](../../DroneLinkDatastore/docs/design-guidelines.md)
- [Local architecture](architecture.md)
- [Local operations](operations.md)
- [System documentation index](../../DroneLinkDatastore/docs/README.md)
- [Critical system summary](../../DroneLinkDatastore/docs/SUMMARY.md)
- [Shared packet/API contracts](../../DroneLinkDatastore/docs/contracts/README.md)
- [Master roadmap and implementation plans](../../DroneLinkDatastore/docs/planning/roadmap.md)
- [Documentation conventions](../../DroneLinkDatastore/docs/contributing.md)

System facts and roadmap status are maintained in Datastore; this repo owns its component details. Cross-repo links assume sibling checkouts with these names.

## Project intent and accepted target boundaries

Read [objectives and requirements](../../DroneLinkDatastore/docs/project/objectives.md), [traceability](../../DroneLinkDatastore/docs/project/traceability.md) and [target repository architecture](../../DroneLinkDatastore/docs/architecture/target.md). The target responsibilities are accepted; Client extraction is implemented under SEP-03; backend/persistence separation is now implemented under SEP-04's local gate. The local architecture guide describes current source.

## Architecture baseline

The current cross-repository direction is frozen as [ARCH-1.1](../../DroneLinkDatastore/docs/architecture/baseline.md). Use the [canonical glossary](../../DroneLinkDatastore/docs/project/glossary.md) for actors and terms, and [requirements](../../DroneLinkDatastore/docs/project/requirements.md) for policy. [SEP-01](../../DroneLinkDatastore/docs/planning/sep-01-protocol-compatibility.md) established the pinned protocol and [SEP-03](../../DroneLinkDatastore/docs/planning/repository-separation.md#sep-03-planning-decisions--2026-11-05) completed Client source/build ownership.

ARCH-1.1 publication (2026-11-06): accepted [ADR-0004](../../DroneLinkDatastore/docs/decisions/0004-cloud-access-and-domain-retirement.md) defines managed-cloud access/domain retirement; [M1 slice A](../../DroneLinkDatastore/docs/planning/m1-contracts-and-telemetry.md#slice-a-implementation-plan--2026-11-06) is ready, runtime implementation unstarted. The local annotated `architecture-v1.1` tag captures this documentation adoption; the original `architecture-v1.0` snapshot is retained unchanged. This component documentation change modifies no runtime, deployment, account or firmware.

## Domain workspace alignment

- [Legacy inspector/map-overlay research and screenshots](research/legacy-domain-ui-review.md).
- [UI-01 sliced implementation plan](../../DroneLinkDatastore/docs/planning/ui-01-domain-workspace.md), maintained in the isolated Datastore planning branch. Proposed; implementation unstarted. Read-only slices preserve cloud provenance/permissions; M2 owns command delivery and later action integration.
