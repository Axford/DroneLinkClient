# Working in DroneLinkClient

Read [local documentation](docs/README.md) and the [system summary](../DroneLinkDatastore/docs/SUMMARY.md) before changing behaviour. Follow the [shared documentation conventions](../DroneLinkDatastore/docs/contributing.md).

This repository owns the React web interface, frontend tests/build and local release artifacts. Consult [local architecture](docs/architecture.md) and [operations](docs/operations.md) for source boundaries and commands. Shared contracts and roadmap status live in Datastore; do not duplicate them here.

When changing a cross-repository boundary, update the owning contract, affected local guide, central plan/evidence and critical summary. Record companion revisions and actual validation; distinguish observed implementation from proposals. Generated reference definitions are not runtime dependencies until their adoption plan is implemented.

## Objective and architecture alignment

Before implementation, follow [project objectives and requirements](../DroneLinkDatastore/docs/project/objectives.md), [traceability](../DroneLinkDatastore/docs/project/traceability.md) and [target architecture](../DroneLinkDatastore/docs/architecture/target.md). Plans must name system requirement IDs and matching acceptance evidence. The confirmed product decisions and accepted ADR-0003 target responsibilities guide future work; package/migration details remain under review. Do not execute runtime extraction while the design interview is ongoing. Preserve current source ownership until the separation gates are accepted and implemented.

## Accepted target ownership

This repository is to own the web interface. Client source/build extraction is implemented by SEP-03; SEP-04 now separates hosted/backend persistence ownership; broader product/deployment gates remain. Read the accepted ADR-0003 and the proposed SEP implementation plan; do not confuse target acceptance with completed extraction.

## Frozen baseline and first slice

Use [ARCH-1.0](../DroneLinkDatastore/docs/architecture/baseline.md) and the [canonical glossary](../DroneLinkDatastore/docs/project/glossary.md). Baseline amendments require explicit acceptance; implementation details must remain within accepted boundaries. [SEP-01](../DroneLinkDatastore/docs/planning/sep-01-protocol-compatibility.md) is complete for its bounded protocol subset. [SEP-03](../DroneLinkDatastore/docs/planning/repository-separation.md#sep-03-planning-decisions--2026-11-05) owns Client extraction evidence; it does not authorise backend/persistence relocation.

Run `CI=true npm test -- --watchAll=false`, `npm run test:protocol`, `npm run test:release` and `npm run build` for relevant changes. Release packaging requires committed clean sources: `npm run pack:release`; verify with `npm run verify:release -- <archive>` (optional `--extract <new-directory>`). See operations for Python/Node requirements. Never make ordinary builds import/copy sibling sources or bundles. After each completed slice, record acceptance evidence and remaining scope in its central plan and commit implementation/tests/docs together; name companion commits.
