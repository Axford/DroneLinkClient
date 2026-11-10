# Legacy Domain workspace UI review

Reviewed: 2026-11-10. Status: research evidence; implementation scope and acceptance plan are not yet agreed.

The purpose of this review is to understand the legacy Node Inspector and floating node list before planning their alignment in the modern Domain detail page. Relevant existing requirements are SYS-01 (typed module parameters), SYS-04 (observation time/freshness), SYS-15 (shared observations/reset), SYS-16 (requested versus observed state) and SYS-17 (mapping/inspection/editing). This note does not change those requirements or the M2 command plan.

## Evidence and limits

- Legacy source: DroneLinkServer `ecb30bd`; modern baseline: DroneLinkClient `927a386`.
- Screenshots use the actual legacy `observer.htm`, `observer.js`, NodeUI, module interfaces and CSS in an isolated loopback preview. Three synthetic nodes, Management/NMEA/Servo/INA219 modules, documentation-range IP addresses and illustrative observations were supplied through Socket.IO.
- Firebase imports were substituted with inert functions in served responses. Outbound socket events had no handlers and could not reach hardware or hosted services. No gateway process, device, staging data, credentials or M2 checkout was changed. The existing public basemap was used.
- The warning banner identifies the synthetic preview and overlaps the legacy top toolbar. No prepared firmware/catalog release was selected; release-dependent controls were unavailable. These screenshots establish layout and interaction evidence, not hardware or cloud acceptance.
- Module values are illustrative, not a firmware correctness fixture. Legacy specialist rendering itself exposes rough formatting, including an unrounded HDOP value. Discovery timers also logged protocol payload-length errors in this disconnected preview; this review does not diagnose or certify that query path.
- Browser checks exercised overlay selection, selected-node title/marker changes, specialist-to-parameter switching, multiple inspector columns at 1600×1000, and returning to a node with its parameter view retained. Drag-reordering, stale time thresholds, server-backed preference persistence and command execution were inspected in source only.

## Screenshots

[Operational overview](legacy-ui/01-overview.jpg): map, top-left node summaries, selected blue edge, warning-coloured widgets and a two-column inspector with specialist views.

![Legacy map and specialist inspector](legacy-ui/01-overview.jpg)

[Raw parameter presentation](legacy-ui/02-parameters.jpg): generic typed value cards alongside specialist module views; channel numbers/names/age/reset counts remain visible.

![Legacy parameter cards](legacy-ui/02-parameters.jpg)

[Writable parameter distinction](legacy-ui/03-writable-parameters.jpg): Rudder parameter cards show writable-value styling, arrays split into individual cells and full addresses/type/priority in the card heading.

## Floating node list

The list is an operational summary for the whole observed fleet. Each compact card combines numeric node address, discovered hostname, map-related icon, elapsed last-heard time and module-provided telemetry widgets. Selected state is a blue right edge. Clicking a card focuses the matching inspector, highlights its map marker and flies to its known location. The inspector opens when needed; first-discovered and remembered nodes can auto-select.

The overlay remains attached to the map, independently of the inspector scroll position. CSS anchors it 8px from the top/left, with compact cards at least 150px wide. Active nodes sort before inactive nodes, then by numeric address. Widgets include battery voltage, satellite count, navigation and other module-dependent summaries; warning/danger colours convey module-specific thresholds.

Legacy last-heard timers turn yellow after 60 seconds and red after 120 seconds. After ten minutes the node fades and its widgets/time/icons and map elements hide. Legacy Firebase-sourced nodes are deactivated independently of age. These are observed legacy rules, not approved cloud connectivity semantics.

Source references (DroneLinkServer):

- `public/observer.htm`: `#nodes` inside `#mapPanel`, separate `#rightPanel`.
- `public/css/observer.css:417–490`: placement, sizing, selection and age styling.
- `public/modules/oui/NodeUI.mjs:75–123,256–264,319–419,710–739,802–809`: card construction, age/activity, focus and widgets.
- `public/observer.js:627–672`: single-node focus, remembered selection, panel opening and ordering.
- `public/modules/oui/interfaces/NMEA.mjs:218–223`, `INA219.mjs:164–171`, `Nav.mjs:304–309`, `MPU6050.mjs:250–255`, `RFM69.mjs:164–169`, `WaterSensor.mjs:127`: summary-widget examples.

## Node Inspector

The inspector is a per-node workspace with a node title/address, Rebuild control, receive sparkline and Management/Visualisation/Configuration/UI Settings tabs. Management is more than a parameter tree: known module types choose purpose-built interfaces, such as GPS/heading, battery gauge and servo calibration graphics. A channel can switch between its specialist interface and generic parameters.

Channels show number/name, reset count and last-heard age. Headers expand/collapse; controls include help and, where applicable, module enable/disable. Channels can be dragged into a custom order and expansion/order preferences have persistence code. The inspector divider can close the panel to zero; opening starts at half the workspace width. Management adds columns at roughly 300px per column, and raw parameter cards form a grid with a 160px minimum.

Generic parameter cards hide system parameter IDs below eight. Remaining values sort numerically and show name, full node/channel/parameter address, type and priority. Arrays use individual cells; integers use locale separators and floats use four decimal places. Address values can resolve to symbolic names, and writable/address values have visual distinctions. Query, CSV export, dragging and editing controls are present in legacy code. The screenshot review did not execute writes.

Source references (DroneLinkServer):

- `public/modules/oui/NodeUI.mjs:145–240,426–436,694–739`: inspector header, panels, preferences and selection.
- `public/observer.js:140–156,585–614`: panel sizing and drag divider.
- `public/modules/oui/panels/Management.mjs:33–105,146–217`: channel sorting, expansion and responsive columns.
- `public/modules/oui/Channel.mjs:67–175,202–347`: channel controls, specialist selection, parameter filtering and sorting.
- `public/css/modules/oui/Channel.css:119–123`: parameter-card grid.
- `public/modules/oui/Parameter.mjs:52–166,200–272,305–423` and `public/css/modules/oui/Parameter.css:13–40,64–74`: formatting, metadata, address resolution, actions and styling.

## Comparison with the modern Client

| Concern | Modern baseline | Gap revealed by legacy |
| --- | --- | --- |
| Multi-node awareness | Dropdown and node buttons inside Inspector | No floating map list or module summary widgets |
| Selection | Inspector and map markers share a selected node callback | Map does not receive current selected ID for selected-marker styling/recentering |
| Inspector content | Node information and generic collapsible channels | No specialist module interfaces or per-node workspace tabs |
| Density | Single vertical channel stack; generic comma-separated values | No multi-column channels or individually formatted typed value cells |
| Working context | Changing nodes remounts Inspector/ChannelList | Expansion context is discarded on node switches |
| Channel summary | Name/ID/type/parameter count/recentness | Reset-count summary and module help are absent |
| Parameter context | Full address/change/name provenance in details dialog | Type/priority/writability/address meaning are less visible in the primary view |
| Freshness | Persisted receipt/change times and last-known observations | Legacy live/inactive rules need reinterpretation, not direct copying |

Modern source references (DroneLinkClient): `src/DomainDetailPage.tsx:29–39,128–136`; `src/components/InspectorPanel.tsx:37–74`; `NodeSelector.tsx:11–43`; `NodeInfo.tsx:35–54`; `ObservedMap.tsx:13–20,79–111`; `ChannelList.tsx:15–46`; `ChannelCard.tsx:24–103`; `ParameterList.tsx:11–29`; `ParameterRow.tsx:8–29`.

## Implications for the next discussion

These are findings to inform planning, not an implementation plan or approved feature list:

1. The floating list needs to support both fast node selection and useful at-a-glance summaries. Merely moving the existing selector over the map would recover only part of its value.
2. Clear selected state should connect list, map and inspector. Automatic map movement and remembered selection deserve an explicit interaction decision.
3. Inspector alignment has two distinct depths: improve the generic channel/parameter presentation, and restore specialist module interfaces. They have substantially different scope.
4. Dense cards, sensible initial expansion and retained per-node context can reduce inspection effort. Useful legacy behaviour can be expressed in the current DroneWright design system without copying its old colours/type scale.
5. Preserve receipt/change/name/source provenance, validation/write-failure warnings, archived/read-only rules and reset permissions. An old observation is not evidence that a node is disconnected; age alone must not erase last-known positions.
6. Parameter editing must align with M2 requested-versus-observed semantics. Rebuild is not automatically equivalent to cloud Reset. Files, configuration, firmware, gamepads, playback and other legacy workbench tabs require their own scope decisions.

Follow-up: the user requested a sliced implementation plan on 2026-11-10. [UI-01](../../../DroneLinkDatastore/docs/planning/ui-01-domain-workspace.md) now records proposed defaults, slice dependencies, requirement-linked acceptance and M2/M4 scope gates in the isolated Datastore planning branch. Review those choices before implementation. No production UI code or milestone completion status changed during this review.
