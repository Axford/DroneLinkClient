# DroneLinkClient architecture

Status: observed source. Reviewed: 2026-11-04.

Client owns the React/TypeScript source at `src/`, public assets at `public/`, its package/lockfile, frontend/codec tests and local release tooling. SEP-03 imports Datastore's frontend subtree history without rewriting the existing Client history. LICENSE and local documentation are retained. There is one authoritative frontend source tree; Server `hosted/` now owns the Express backend and same-origin artifact hosting; Datastore owns persistence/protocol libraries.

[App](../src/App.tsx) owns session/domain startup; [DomainDetailPage](../src/DomainDetailPage.tsx) owns the map/inspector layout; [DroneLinkState](../src/dronelink/DroneLinkState.ts) projects shared persisted observations into the existing map/inspector model through the owned CloudObservations lifecycle; packet history is separate. SEP-06 adds packet cursors and request cancellation; the M2 Client uses the shared [HTTP contract](../../DroneLinkDatastore/docs/contracts/http.md).

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


## Channel rediscovery on module replacement

When Workbench receives a nonempty module type that differs from the known type for the same node, channel and transport, the Client replaces that channel's cached parameters and starts discovery with the new type. The first type report and repeats preserve observations. Workbench learns from subsequent publications; it does not issue an automatic device query.

Cloud views compare successive channel revisions within the same node generation. When the Client sees a type change, it excludes saved name and value facets received before that change, including stale write metadata. New receipts rebuild the channel independently of other channels. Receipts at the same instant as the type change are retained because packed telemetry shares a receipt timestamp. The Client keeps the cutoff during automatic resynchronisation for the current observation session. A fresh browser session cannot infer a previous module type from the latest snapshot alone. This display behavior changes neither persisted observations nor the existing explicit whole-node reset.

## M1-C shared observation source — 2026-11-07

CloudObservations owns snapshot pages, revision/generation catch-up, cancellable live waits, automatic resynchronisation and expected-generation reset. The React hook exposes shared loading/status and the saved Domain failed-write count. Canonical value/NAME bytes use the existing codec; source and original receipt/change times survive reads/reload. NAME-only rows retain name attribution without inventing a value receipt. Quiet nodes retain structure and carry no inferred offline badge. Reset is visible only for canEdit Domains, confirms the retained identity/history and gateway-suppression limit, and applies authoritative results/events. The M2 Client derives write metadata from the canonical observation envelope.

Source generations fence navigation/access/cancellation. Passive diagnostics have one independent five-second request, so they cannot stall live updates. A failed resynchronisation retries a fresh snapshot with bounded delay; it does not silently continue from an incomplete view. The legacy loadHistory method is a documented compatibility alias to shared observations, and current React call sites use loadSharedObservations. No database package enters Client. New immutable Client manifests declare observationPolicyVersion1 for matched Server packaging. Managed C activation remains separately scoped.


## M1-D cloud operator view — 2026-11-08

The owned `mapBindings` projection reconstructs legacy semantic role registrations from shared snapshots, choosing higher mapping priority then lower channel ID, independently of receipt age. NMEA and Nav primary positions feed the Mapbox `ObservedMap`; the inspector exposes selected role/address/path/priority and source/receipt provenance for all six roles. Bindings are rebuilt after module-type discovery, reset and reload without packet-history replay or device queries. Live headers missing a Drone ID are enriched through the existing bounded identities API before publishing, with Domain-generation fencing. The [shared roadmap](../../DroneLinkDatastore/docs/planning/roadmap.md#map-visualisation-phasing) allocates deferred overlays to M4.

ObservedMap owns SDK initialization, marker updates/cleanup, explicit Fit observed positions and debounced protected map-view saving. Marker clicks select the carried node/singleton inspector; Domain changes and access denial unmount the old map/selection. Invalid selected coordinates remove the current marker without choosing a lower-priority source. Legacy zero-longitude suppression remains explicit. Saved snapshots cannot reproduce the legacy browser's last-valid marker after an invalid value overwrites it. Missing basemap configuration/errors preserve inspector access. Cloud updates expose retrying/recovery without discarding saved observations or refreshing receipt timestamps. Current role and archive capabilities control reset and command submission.

The Domain map uses a circular marker centred on the primary GPS fix and places the node name to its right. A heading chevron appears at the marker centre when the selected heading is a finite scalar from 0° through 360°. Mapbox aligns the chevron to map north as the camera turns. The position button exposes the heading's own address, source and receipt alongside the position provenance. Invalid preferred headings hide the arrow, and removing the position also removes its arrow. The Inspector's Map source bindings retains the underlying binding details.

The Domain map also shows the selected NMEA secondary position as a ring, using the same coordinate checks and binding precedence as the primary position. The ring can appear on its own and selects the same node without moving the camera. It reports its own address, source and receipt. Fit includes both positions, while Locate, heading and Nav Follow continue to use the primary position. When the two fixes overlap at the current zoom, the primary marker stays on top.

A blue 10 m map line starts at the primary position and follows the saved world-relative bearing from the selected WindFromWing binding. The line scales with zoom and the primary marker description reports its address, source and receipt. Wind publishes a local sensor angle, and Sailor's subscribed value has no known reference frame in the observation, so both remain inspectable as bindings. An invalid wing bearing removes only the wind line.

The shared navigation tokens use the module renderer palette. The map heading chevron and Inspector compass share readout green, and the wind layer uses instrument blue. The node list's identity ring and map markers share the platform blue accent and the selected card and marker share the primary blue fill. See the [navigation and node identity guidelines](../../DroneLinkDatastore/docs/design-guidelines.md#navigation-indicators-and-node-identity).

The map plots the observed Nav target and previous waypoint independently of the GPS fix. It draws a leg when both selected bindings belong to the same Nav channel and their coordinates differ. A valid target radius draws the target ring and offsets the dashed corridor edges. Node settings stores the optional grey previous waypoint ring in the browser per account, Domain and node. Editors can drag an eligible target to request a new position through the existing command journal. After the drop, the marker shows the last observed position until the drone publishes a new target. The Inspector's Map source bindings table exposes both observations with their values and provenance.


## M1.2 bounded codec corrections — 2026-11-08

DroneLinkMsg still consumes portable constants only. Protocol0.1.2 updates optional conformance coverage; its wire constants/types and firmware snapshots match0.1.1 apart from version banners. Framed link output validates length, wraps the existing unframed bytes and adds CRC-8; it is not the active serial mesh envelope. ADDR helpers preserve up to four complete flat entries, validating before mutation. Binary-log reads use unsigned big-endian low32-bit timestamps; encoding/time-base and raw-parser/string behavior remain unchanged. The [shared contract](../../DroneLinkDatastore/docs/contracts/packet.md#m12-bounded-codec-software-corrections--2026-11-08) owns exact bytes and deferred policies.

## Shared design system and surface ownership — 2026-11-10

The [DroneWright design guidelines](../../DroneLinkDatastore/docs/design-guidelines.md) govern presentation. Client `public/design-tokens.css` owns semantic dark colours, the 14px base, metadata/heading type roles, spacing, dimensions, borders, radii, elevation, focus and motion values. `public/design-system.css` maps these into Bootstrap and shared surface classes. Both ship as ordinary Client release assets, loaded before the application; Server serves their exact bytes from its selected artifact for React and sign-in surfaces. There are no runtime sibling source imports or new UI framework dependencies. Extend these tokens rather than adding surface-specific colours or base sizes.

`components/ui/SurfacePanel` groups related controls with shared background and spacing. `IconButton` supplies accessible names, icon sizing and hover explanations; `SettingsDialog` supplies dark, scrollable Bootstrap dialogs with focus trapping/restoration, Escape and close controls; `PageFeedback` handles loading/access failure screens. `useNarrowLayout` supplies the shared below-768px layout decision. Surface modules retain their policy/data workflows rather than duplicating them in generic presentation primitives.

`WorkspaceShell` reads all authorized Domain shortcut pages with cancellation, generation checks and focus/15-second refresh. `PrimaryNavBar` presents Home, active Domain shortcuts and the account control in both Home and operational views. It follows the shared [navigation guidelines](../../DroneLinkDatastore/docs/design-guidelines.md#primary-nav-bar), using viewport orientation and the length of the occupied edge. In portrait, the top bar is 52 CSS pixels tall with square 44 CSS pixel controls. The workspace flexes into the remaining space.

`HomePage`/`DomainCard` own domain overview. Counts enumerate accepted member pages and retained Drone/node identities, not online-device counts. A Details disclosure contains the domain ID, count interpretation and explicit retained-packet read. The card title opens operations; settings open `DomainCollaboration` in a shared modal. Existing role/lifecycle, CSRF/revision, pagination and stale-result safeguards remain. Closing the dialog clears displayed keys/share links and invalidates pending responses. Home access refresh/removal still updates the owning list and clears privileged state on denied access.

`DomainDetailPage` uses the common shell and token-styled map/inspector. Panels stack vertically below 768px and resize horizontally otherwise. Frequent node/channel selection and observed values remain visible, with source/receipt and degradation/write-failure feedback. Inspector tools contains diagnostics and authorized reset; Node details, Map source bindings and Parameter details preserve identity/provenance/timestamps in shared dialogs. Map controls use common icon actions; map details retains the saved-observation/inspector-fallback explanation. No commands are enabled. Semantic map binding precedence, observations, reset/history isolation and independent access refresh remain unchanged.

`InvitePage` and hosted sign-in use the shared authentication surface. Invitations preserve targeted-identity disclosure, validated return paths and explicit acceptance; sign-in retains Google's existing route. Toasts, errors, forms and dialogs use dark styling. Current source adoption and bounded local acceptance are recorded in [M1 design-system adoption](../../DroneLinkDatastore/docs/planning/m1-contracts-and-telemetry.md#design-system-adoption--2026-11-10); managed deployment is separate.

The colour-block refinement uses shared panel/control tones and a tinted 6px-blur modal backdrop. Modal roots stay transparent so the backdrop preserves workspace context; dialog content and inner panels provide the solid surfaces. Buttons have no persistent borders: primary actions use accent fill, secondary actions are clear until hover, and keyboard focus remains outlined. Inputs, lists, channel rows and navigation rely on tonal blocks/spacing rather than outlines. Domain settings separates identity, members, keys and invitations into panels; node details/binding actions share the node-summary panel. Home's redundant page heading is omitted; Domain, dialog and useful panel headings remain.

Attached tabs and row actions: Home's `dw-attached-tabs` strip meets `dw-tab-content` directly, with the selected tab and content accent strip using the primary/accent token. Shared `dw-item-row`/`dw-row-actions` styles keep member role/removal, invitation, key and node controls inline at the right edge. Table action cells remain together within the existing responsive table scroll surface. `components/ui/DangerAction` owns a danger-tinted group, concise visible impact text and the action's `aria-describedby` association. It wraps archive/leave, key rotation, membership/invitation removal and shared reset without changing their policy/confirmation callbacks. Warnings describe membership removal accurately even for Platform Admins who retain platform authority.

Grid foundation: `--dw-grid` is 4px, independent of the 14px font size. Spacing/dimension/radius tokens derive from it; the type scale uses 14/20px body, 12/16px metadata, 18/24px section and 24/32px page-title roles. The Bootstrap bridge maps standard spacing utilities 0–5, row gutters, cards, fields, buttons, dropdowns, alerts and modal insets onto those tokens, retaining axis-specific utility precedence. Root theme variables outrank framework defaults so actual computed spacing/line height follows the library. Standard panels/dialog bodies use 16px; workspace padding is 24px desktop / 12px narrow; controls and action icons use 32/16px. Modal close controls explicitly use border-box sizing. Map controls use grid-aligned sizing/insets and the map toolbar reserves attribution clearance. Domain cards share row heights and anchor actions to a common bottom edge, including when titles wrap. These are presentation changes only.

## UI.1 floating node selection — 2026-11-10

`ObservedMap` owns the floating `NodeSelector`, including the map-unavailable fallback. Cards sort by numeric node address, show saved receipt age and remain selectable without a valid position. DomainDetailPage owns the selected node shared with Inspector and marker pressed states; selecting a node leaves the camera unchanged. Locate explicitly centres on the existing selected semantic location binding, while Fit observed positions remains separate. Neither action queries a device or changes observations. Missing/invalid positions and failed maps disable Locate.

On narrow screens the floating header keeps the selected-node context and opens a scrollable, focus-managed node dialog, avoiding dependence on the resizable map panel's height. Desktop cards use a bounded scroll area clear of navigation and attribution. The panel group is keyed by orientation because the installed panel library otherwise retains an unresponsive divider after direction changes; a Domain-scoped viewport ref preserves camera position across that remount while selected-node state stays in DomainDetailPage. Inspector keeps its node information, channel/provenance controls and permission-gated Reset, with a selection prompt when no node is chosen. Domain navigation suppresses the prior Domain workspace immediately; access denial also clears selection. Later slices retain their own acceptance evidence.

UI.1-R refines that overlay into independent dark single-line cards in a transparent 224px bounded container. Desktop starts directly with cards and an adjacent collapse icon; mobile retains its compact context/dialog. Each card combines identity, neutral seconds/minutes/hours receipt age and a separate accessible Locate action. Exact Server receipt and full truncated names remain accessible. Selected cards retain full blue fill by explicit user preference. The one shared clock updates seconds labels without changing saved observations or introducing device traffic. Operational widget rows remain UI.4.

## UI.2 typed observation inspection — 2026-11-10

Inspector channels use row-major responsive grids, with normal channel content expanded initially and an explicit disclosure for system parameter IDs below eight. Bulk expansion applies to channels; the system disclosures remain independently accessible. Channel headers lead with the channel number and observed name, using the module type when the name is unavailable. The header shows the age of the latest channel receipt and any valid reset count, including zero. A single clock per list updates the age labels. The shared glass surface is neutral for enabled channels, more transparent with dimmed controls for disabled channels, amber for waiting, and red for a reported error. The separate error flag takes visual precedence over operating status. Status and error come from the observed UINT8 parameters. Reset counts accept the firmware UINT32 format and legacy UINT8 observations.

`parameterPresentation` projects decoded state into typed display cells plus exact decoded values. Integers use locale formatting, floats use four decimal places with zero/negative-zero/nonfinite handling, text preserves whitespace/empty values and ADDR values retain every four-byte entry. Exact values and independent value/name source/receipt/change evidence remain in details. Unknown/unavailable facets do not fabricate type, zero or writability. Each tile shows the full address, abbreviated type, observed packet priority and instrument-green values. A lighter blue background indicates observed writability. The entire tile opens its details dialog, where full type, provenance and existing permission-scoped commands are available. Priority comes from the local packet or the optional hosted value facet. Older hosted observations without priority display an unavailable marker.

The Inspector supplies an observation-name context scoped to its current Domain snapshot. ADDR resolution masks packed parameter bits, retains numeric source/node/channel/parameter addresses and resolves available names from that context only, including late metadata. Domain replacement, access loss and reset remove old lookup state through the existing observation/component lifecycle. The projection reads no history, contacts no device and changes no packet/storage/API contract. UI.3 owns later session presentation context and reordering; specialist interfaces/widgets and M2 command integration retain their own slices.

## UI.3 Inspector session context — 2026-11-10

The authorised Domain workspace owns an Inspector session above the orientation-keyed panels. It retains only node/channel IDs, observation generation, order, channel expansion, system disclosure and reorder mode. Each node's choices follow that node while switching selection or resizing. The provider is keyed by user and Domain and unmounts on departure or access loss; reload and logout start a fresh session. There is no browser persistence, shared preference endpoint, telemetry copy or credential storage.

Complete observation inventories prune removed nodes/channels/disclosures and invalidate reset generations. An incomplete loading/resynchronising inventory temporarily hides unavailable structure without pruning its preferences; the completed replacement then reconciles it. Existing custom order is preserved and new channels follow it in numeric order. Default order is numeric with normal channels expanded and system disclosures closed. UI.5 will own specialist view choices when those views exist.

Reorder mode exposes earlier/later actions in row-major order and announces the resulting position. Focus stays with the action at an order boundary and follows the matching control across a panel remount. An open Inspector dialog closes on the breakpoint and focus returns to its opener when the node/generation still matches. Changes are presentation-only for every role, including Viewer/archived views; reset and command authority are unchanged.

## UI.4 operational summaries

`src/dronelink/moduleVisualizations.ts` owns the Client registry keyed by observed module type. The NMEA and INA219 entries project channel observations into read-only summaries for both the floating node cards and the selected node's Inspector. Each matching channel contributes independently. Summary evaluation uses the current observation inventory and keeps each parameter's original provenance. The Inspector's spatial readings reuse `mapBindings` and its existing priority and channel tie-break. Channel cards retain the generic parameter view.

## UI.5 specialist channel summaries

Registry entries can contribute an Inspector summary independently of their overlay chip. The Management, NMEA and INA219 summaries select validated readings from the channel being inspected and identify their primary and supporting values. The common summary UI adapts their arrangement to the card width. NMEA leads with a compass and bearing, INA219 with the cell-voltage readout, and Management with uptime and IP address above the per-core reset reasons. NMEA and INA219 share interpretation with the overlay for satellite count and cell voltage. The node-level map binding remains independently selected by the existing map rules.

The Inspector session remembers the Parameters choice by node, observation generation, channel and observed module type. Supported channels default to Summary. The header uses one icon button to switch to the other view and keeps Reading Details available in both views. Channels without a specialist view open directly to Parameters. A completed inventory that removes the channel or replaces its module type discards its choice. Breakpoint remounts keep the selected view and restore focus to matching controls.

### Legacy instrument palette

The shared channel Summary uses the instrument face and reading tokens in `public/design-tokens.css` in both the Domain workspace and standalone Workbench. Available readings and the compass needle use legacy readout green. Unavailable readings are muted, and severity uses the product warning and danger tints with separate cues. The NMEA compass and bearing are centred in their tile. Its term remains available to assistive technology and becomes visible when no bearing can be drawn. The Inspector controls and node chips use the product palette. See the [DroneWright renderer guidelines](../../DroneLinkDatastore/docs/design-guidelines.md#shared-style-and-colour-for-module-renderers).

### Packet telemetry summaries

SerialTelemetry groups Sent, Received and Rejected into three equal columns when space allows. Counts and rates retain their own availability, source and receipt time. The reading-details dialog identifies complete RX handoffs before DroneLink CRC validation and serial framing rejects. The same read-only summary is available through the Domain workspace and standalone Workbench. The packet telemetry renderer owns the shared projection for these columns. Each module supplies its counter and rate parameter IDs and any transport-specific note. UDPTelemetry uses the same layout with counts at parameter 10 and rates at parameter 11. Each channel supplies its own readings and provenance, including when both transports appear on one node.

### Sampled graphics

`sampledObservations.ts` prepares bounded, in-memory windows for specialist graphics from the latest scalar FLOAT observation. A future renderer supplies its value interpretation and a host scope that identifies the Domain, node, channel, module, parameter and stream generation. The host clears the scope on disconnect and changes it on reset, source-path changes and resync. The sampler also separates reported sources and rejects receipts older than the last accepted one in the current scope.

Windows keep at most 100 receipts from the last five minutes. A new receipt with the same value is still a sample. Reading the same snapshot again adds nothing. Invalid values with a known receipt mark a gap. Without a usable receipt the series clears. A snapshot can contribute its latest receipt once. The sampler preserves Server timestamps when the browser clock is behind. It can age on redraw and neither polls nor reconstructs packet history. Trace rendering may split at a caller-specified gap between receipts. Histogram bins and trace styling belong to their respective renderers.

### RFM69 signal summary

The firmware and legacy dispatcher identify the module as `RFM69Telemetry`. The specialist view combines packet counts and rates at parameters 9 and 10 with an independent RSSI reading at parameter 8. The firmware sends a magnitude from 0 to 100. The summary and node chip display its negative dBm value, with zero retained. Reading Details includes the RSSI source and receipt. Radio settings remain in the generic Parameters view.

The signal trace uses the sampled window while the expanded Summary is visible on an active Domain with ready observations or a connected Workbench path. It plots receipt time and breaks across unavailable samples or gaps over 15 seconds. The marker highlights the plotted point that matches the current valid receipt. Switching node or path, leaving the Summary, losing the connection or resetting its observations clears the trace. Archived snapshots can display the last observed RSSI.

### Shared power telemetry

The INA219 and INA3221 registry entries use the same power telemetry renderer for electrical readings. Each configures the firmware input count and usage parameter. The renderer checks observation availability, message type, declared and received width, and the numeric value of each input. It owns measurement labels, units, precision, device alarm interpretation and the cell-voltage projection. Both summaries use the same reading tiles and fixed-scale dial. INA219 alone supplies saved voltage thresholds and projects the node chip.

### Anemometer speed distribution

The Anemometer Summary leads with the observed FLOAT parameter 10 in knots and shows metres per second derived using the firmware conversion factor. Reading Details links to the single source observation. The histogram counts recent receipts in 1 kn bins centred on 0 through 30 kn, with a green pointer for the current bin. Speeds that round above 30 kn stay numeric and are counted outside the plotted bins. Invalid observations contribute no count. The chart and RFM69 trace share the sampled window hook and its scope lifecycle. Archived snapshots can display the latest speed.

### WaterSensor level and alarm

WaterSensor compares the observed raw ADC level and threshold (UINT32 parameters 11 and 12) on the legacy 0–4096 scale. The dashed line marks a positive threshold. A zero threshold remains visible as a reading. Out-of-scale readings retain their numeric values. The node chip uses the raw-to-threshold percentage with a positive threshold and shows the raw level otherwise. A ratio strictly between 50% and 100% gives a warning. The independently observed FLOAT alarm at parameter 13 supplies the triggered state and takes precedence over the ratio warning. Reading Details lists the three source observations separately.

### Neopixel scene preview

Neopixel shows four segment colours in firmware order from the observed scene at parameter 8. The UINT8 payload contains 16 bytes. Brightness, effect and two effect arguments occupy the first four bytes, followed by four RGB triples. The preview shows the scene colours directly. Brightness and effect settings remain available through Parameters. A missing or invalid payload leaves all four swatches unavailable, while an observed zero RGB triple is shown as black. Reading Details links to the single source observation.

### Joystick position

Joystick plots observed scalar FLOAT X and Y (parameters 10 and 11) on equal, centred axes from −1 to +1. Positive X points right and positive Y points up. The ring around the marker shows signed Z (parameter 12), clockwise for positive and counterclockwise for negative. A positive button value (parameter 13) fills the marker and shows Pressed alongside the plot. The four observations retain independent source and receipt details. An invalid or unavailable X or Y leaves the crosshair without a position marker.

### Receiver output and raw PWM

Receiver plots the first four observed FLOAT outputs (parameters 11–14) on a shared scale from −1 to +1. Each slot shows its signed value. Zero sits on the centre line. Values outside the scale retain their numeric reading and show an above-range or below-range cue. The observed FLOAT switch at parameter 29 selects Passthrough below 0.5 and Active otherwise. The raw PWM row preserves the order of all six parameter 20 bytes, multiplying each by 10 for microseconds. Reading Details keeps separate provenance for the mode, all six published outputs and the raw vector.

### Motor speed input

Motor reads the observed signed speed input from FLOAT parameter 8. The bar shows the derived speed after applying the firmware clamp and remap to the configured FLOAT limit pair at parameter 12. The scale includes zero for asymmetric and one-sided limits. The shaded band uses the absolute magnitude of FLOAT parameter 13. The mapped value represents the stage before deadband and inversion. Reading Details keeps each observation's source and receipt. A missing or invalid limit pair leaves the numeric input available and the scale unavailable.

### Servo mapping and PWM output angle

Servo plots normalized input from −1 to +1 against output angle from 0 to 180°. The configured curve uses the four observed FLOAT control points at parameter 12 and the centre adjustment at parameter 13. It samples the firmware's cubic mapping, truncation and bounds. The independently observed position input at parameter 8 and PWM controller angle at parameter 14 provide separate guides and readouts. The reported output can lag the configured mapping while the firmware applies its movement rate limit. Each observation has its own source and receipt in Reading Details.

### NMEA fix and correction details

The NMEA Summary keeps heading and satellite status alongside primary position, speed in knots and metres per second, and observed HDOP. The firmware sends HDOP as a UINT8 in tenths with 255 reserved for unknown. Reading Details lists the secondary GPS position, configured reference fix and differential correction offsets when their parameters are present. Coordinates arrive longitude first and display latitude first. Correction shows the signed latitude, longitude and altitude offsets. Some firmware transmits a fourth correction float before assigning its distance, so the Summary relies on the three verified components.

### LSM9DS1 heading and magnetic calibration

LSM9DS1 leads with the reported heading at FLOAT parameter 11. The independent map binding retains priority 3. Reading Details shows the latest magnetic X/Y sample, recent samples from parameter 10, the X/Y calibration bounds and centre from parameters 13 and 14, and the quadrant limits ellipse from parameter 18. Axes have equal scale in microteslas. Invalid bounds and limits leave their geometry unavailable. The scatter shares the bounded observation window with the scalar instruments and collects receipts while the live Summary is expanded.

### Expanded 3D diagnostics

The shared diagnostic dialog projects signed X/Y/Z data into a rotatable SVG scene. Consumers provide the latest vector, optional samples and calibration centre and radii in their own units, plus a text equivalent. The XY view and keyboard-accessible rotation controls use the same data. Closing the dialog unmounts the scene and resets its camera. Rendering follows React updates. The component uses browser SVG and owns no animation loop or graphics context. HMC5883L and MPU6050 supply their own observation mappings. The shared dialog uses green observed values, muted labels and neutral unavailable values.

### Shared heading and attitude displays

NMEA, LSM9DS1 and CMPS12 use the same heading projection and compass face. Each registry entry supplies its own heading parameter and supporting observations. Map role selection still uses the independent bindings registry. The signed attitude dial shares geometry between pitch and roll. The caller supplies the zero direction, positive rotation and common scale for the bins. CMPS12 owns the signed vector decoding and receipt distribution.

### CMPS12 heading and attitude

CMPS12 shows the reported heading at FLOAT parameter 10. Firmware already applies declination and the trim at parameter 12 to that heading. The pitch and roll dials use the signed degrees from FLOAT parameter 13 in vector order. Positive pitch rises from the rightward horizontal reference and positive roll moves clockwise from the upright reference. The polar distributions count observed vector receipts in 15-degree bins using the shared five-minute window and the same radial count scale for both dials. Reading Details keeps the heading, trim and attitude vector provenance.

### HMC5883L and QMC5883L heading and magnetic calibration

Both modules inherit the same firmware compass parameters and share the renderer. The instrument uses the reported heading at parameter 11, signed pitch and roll at 22 and 24, and the calibrated vector and quality score at 10. The calibration dialog projects the raw magnetic observations at 21. Its ellipsoid uses observed min/max bounds at 13–15. The line to the latest raw point starts at the reported calibration centre when available. Recent points use the shared five-minute observation window, and Reading Details retains the provenance of each input.

### MPU6050 attitude and acceleration

MPU6050 shares the artificial horizon with HMC5883L and displays signed pitch and roll from parameters 13 and 14. Temperature at parameter 12 drives both the Summary and node chip. The legacy chip thresholds are above 30 °C for warning and above 40 °C for danger. The diagnostic projects the calibrated acceleration at parameter 10 from the origin. Its calibration ellipsoid uses the reported centres and half-spans from parameters 16–18. Invalid calibration hides the ellipsoid while independently observed acceleration remains visible. Calibration mode stays in the generic parameter workflow.

### INA219 voltage and usage

The INA219 Summary leads with measured cell voltage on a fixed 0–5 V dial. The compact layout places two columns of supporting readings beside the dial when there is room and flows them below it on narrower cards. Above-scale values keep their numeric reading and receive an explicit scale cue. Negative readings remain numeric and unavailable values have no dial. Saved display thresholds colour the voltage tile and node chip. The separately observed device load-voltage alarm and signed cumulative usage are read-only supporting values with independent provenance.

### INA3221 input summaries

The INA3221 Summary presents the firmware's three ordered input slots, each with the INA219 0–5 V dial and its own load voltage, current, power, signed usage and observed alarm. Wide cards align the input rows. Input numbers and unit-redundant labels are available to assistive technology and in Reading Details. The Summary shows a label where a missing value would otherwise be ambiguous, and for the unitless alarm. Narrow cards stack the inputs and place supporting values beside their dial where space allows. Each reading retains provenance from its source parameter vector. Invalid vector shapes show unavailable for that parameter, while other vectors and valid individual entries remain visible. INA219 display thresholds remain specific to INA219.

### Shared navigation geometry

Attitude, Wind, Nav and Sailor share circular guides and hand geometry. Their callers supply the angle frame and presentation. The sailing profile projection places 32 relative-speed sectors at their centres, mirrors the configured polar half, and leaves partial speed profiles open. Callers supply the wind reference and radial range so each sailing renderer can keep space for its own steering graphics.

### Polar response and sample coverage

Polar mirrors 16 firmware sectors into a wind-relative dial. The outer trace uses relative speed at 11 on a 0–255 scale, with gaps where the sample count at 12 is zero or unavailable. The inner trace uses counts scaled to the largest observed sector count. The adjusted heading at 14 is drawn relative to wind at 34. Mode at 9 reports Passive, Active or Reset. Reading Details preserves independent receipts and reported sector values. Map rings, historical plots and controls retain their separate scope.

### KiteController flight plot

KiteController projects the reported yaw, pitch, payout distance and estimated roll at parameter 14 into a 2D plot. Positive yaw points left and positive pitch points up. The waypoint's angular radius comes from 16. The recent trail uses the shared receipt window, with gaps at invalid samples. The payout target and rate limit at 13 describe configuration, while distance in the flight vector is actual payout. Reading Details preserves the independent vector, waypoint and control receipts. The legacy disabled 3D scene stays in separate scope.

### TankSteer drive comparison

TankSteer displays signed motor outputs at 8 and 9 on the same −1 to +1 scale. Heading at 22 and signed target at 20 share a north-referenced dial. Distance at 24 sets the length of the observed target vector up to the 20 m ring, while the readout keeps the full distance. Mode at 10 reports Manual or Automatic. Reading Details preserves independent receipts. Stop and target writes retain their separate action scope.

### TurnRate dial

TurnRate compares the heading at 12 and signed target at 10 on the shared circular dial. Parameter 16 is a signed controller output, not an angular velocity. Firmware clamps it to ±10, while the arc preserves the legacy visual cap at ±6. Positive output draws clockwise from heading. Parameter 17 supplies the angular threshold band around target, and 19 supplies the observed Normal, Possible gybe or Gybing mode. Sailor and TurnRate share the amber and red cues for possible and active gybes. Each reading retains its own receipt. The heading map binding remains independent of the renderer.

### Proa steering and wind profiles

Proa rotates its shared polar and speed profiles by live wind. Heading rotates the vessel drawing and its observed steering. The wing output maps to ±90° and the two pontoon outputs to ±120°. Course over water is already vessel-relative. The target frame adds the observed offset to course. Parameter 29 reports passive/active operation, while the fourth debug value at 30 reports Normal, Brake or Run. Missing inputs omit their marks and retain independent receipt provenance in Reading Details.

### Sailor marine dial

Sailor shares the navigation guides and hands. Target and course accept signed bearings from Nav. Live wind at parameter 12 determines the estimated wing orientation with the FLOAT wing command at 22. Course wind comes from byte 3 of flags at 21 and rotates the mirrored polar profile (18) and the independently reported speed halves (19 and 20). The chart marks incomplete speed coverage and uses a common relative radial scale. Sheet at 17 sits in the centre. Rudder at 24 drives a signed arc from heading, with a gybing cue from the flags. Four-byte flags retain course, tack, helm and course wind. The crossing-wind state needs a fifth byte. Firmware `69cd31f` declares five bytes but copies only four in its live update, so the Summary marks a supplied crossing-wind flag as unverified. Reading Details retains the reported byte and observation receipt.

### Waypoint route progress

Waypoint displays a one-based index from parameter 10 and count from 9, loop mode from 14, and estimated route speed from 16. Parameter 15 supplies the distance to the next waypoint, remaining distance and planned route length in metres. The track shows estimated distance covered and the next waypoint on the same scale. Before the route starts, the approach distance can exceed the planned length. A zero-length route has no proportional track but can still have an ETA with positive speed and a valid active waypoint. An empty route suppresses stale distance and speed readouts while Reading Details retains their observations. Route actions retain their separate scope.

### Nav bearing comparison

The Nav Summary shares the circular guides used by the wind dials. It compares north-referenced heading (8), adjusted heading (20) and wind (21) with distinct hands. It shows the signed cross-track value (17) as reported because firmware may normalize it against the target corridor. Distance to target (9) also drives the node chip. Following reflects the observed target subscription (13) and resolves names only in the current Inspector scope. The map context actions still use their existing command path. Reading Details uses the observed address and independent receipts.

### Wind direction and distribution

Wind reads the independent FLOAT bearings at parameter 14 (World, north-referenced) and 10 (Local, vessel-relative). The clockwise dials use the shared circular geometry. Only World contributes to the 24-sector distribution, which counts actual receipts in the shared five-minute window. The distribution and needle can differ when the latest reading is unavailable. WindFromWing uses the same World dial for its estimated FLOAT bearing at parameter 15 and labels it as a wing estimate. Its samples stay scoped to that channel and parameter. Map bindings select World wind independently of the Inspector and prefer WindFromWing over Wind.

### Depth readout and log trace

Depth reports current measured metres at parameter 13 and logs location and depth in parameter 14. The Summary uses the third log value for its downward trace, ordered by received sample. The firmware logs by movement, so sample spacing conveys neither elapsed time nor a fixed distance. Zero means no echo. Zero and invalid log readings break the trace. The shared observation window retains up to 100 samples over five minutes and resets with the Inspector source scope. Reading Details keeps the two receipts separate.

### Management summary

Management leads with last reported uptime (parameter 13, seconds) and IP address (12). An all-zero IP observation means no address is assigned and retains its receipt in Reading Details. Reset reasons use bytes 1 and 2 of parameter 10 in core order. The optional firmware build reads the abbreviated Git commit published as CHAR at parameter 9 of the same Management channel. It has its own observation provenance. The summary displays the device-reported identifier without a release comparison. Device operations belong to the Workbench workflows.

## Shared module visualization settings

The authorized Domain workspace owns the settings snapshot, shared by the node overlay and Inspector. The Client refreshes it on entry and window focus and applies the committed response after saving. The INA219 registry entry defines the voltage fields and uses one interpretation for both surfaces. The Server validates writes and returns the next revision. Settings live outside observation and Inspector session state and survive observation reset. An older hosted API leaves settings controls unavailable and voltage displays neutral.


## Nav map context menus

`mapContextActions` collects module contributions at the map-background and marker registration points and groups choices by action label. Nav contributes **Set target** and **Follow**. Each eligible choice identifies its receiving Nav channel. The map keeps the opening point and the available choices in memory for the current workspace. It refreshes choice details from shared observations and drops a Follow choice whose selected location address or observation generation changes. Position changes at the same address can update the receipt age while the menu is open.

The menus use M2's existing scope, write metadata, submission journal and Domain commands status. Set target uses the clicked point and the latest saved radius and duration in the observed three- or four-float format. Follow uses the other node's selected map location as the subscription source and writes the receiving Nav channel's parameter 13. Server rechecks role, Domain state and the receiving parameter's write metadata. The map and Inspector continue to render shared publications. See the [central acceptance record](../../DroneLinkDatastore/docs/planning/ui-01-domain-workspace.md#nav-map-context-menus).

### Dragging an observed Nav target

The map enables dragging when the selected Nav reports a valid guarded move capability for the displayed coordinates. A drag sends the observed guard and requested coordinates through the Domain command journal. Firmware determines whether Nav or its local Waypoint subscription owns the move. The displayed target follows Nav telemetry. See the [shared packet contract](../../DroneLinkDatastore/docs/contracts/packet.md#guarded-nav-target-move).

### Verified route preview

The Domain map requests geometry for the selected node's reported Waypoint digest. It removes the preview when that digest changes or the node selection changes. The cloud must have received the digest and hold a matching backup. The preview reports the digest receipt and backup capture times. The existing Nav overlay continues to display the observed leg and target. See the [route preview contract](../../DroneLinkDatastore/docs/contracts/workbench.md#verified-route-preview).

## Cloud and Workbench lenses

The Cloud workspace and standalone Workbench share the Nodes, Map and Network toolbar. Switching lenses preserves the selected node and Inspector. Network uses the same gateway routes and diagnostics in Workbench and paired active Domains. In Cloud, the observed node selector remains available independently of live routes, including when viewing an archived Domain.

The Cloud Inspector exposes Files with a prompt when a node or file access is unavailable. In archived Domains, Owners, Editors and Platform Admins can browse and open Cloud files in the read-only Explorer. The archived view omits node operations and Cloud save controls. Hosted authorization also enforces the role and active-Domain requirements on writes.

The shared Inspector size selector switches between a full-window view, the normal resizable panel and a collapsed toolbar. Size is independent of the active tab. The Inspector remains mounted across size changes so file drafts and tab selection survive. Files uses its picker when the available panel width is narrow.

The root configuration draft opens in the Logical graph within Files. React Flow renders module cards, subscription ports and the viewport from the existing draft parser. Code and Logical share the Files draft, and source edits patch the declared address in place. Graph edges show references to local modules declared in the file. Parameter compatibility and remote sources remain unverified.
