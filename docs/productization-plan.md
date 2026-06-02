# Arrakis Server Console Productization Plan

This plan keeps Arrakis Server Console moving toward a friendly web admin panel while avoiding unsafe or speculative feature work. Each phase should preserve existing working admin actions, hide raw CLI/JSON behind advanced troubleshooting controls, and keep unsupported features clearly marked.

## Phase 12A: UI Presentation Cleanup and Low-Risk UX Fixes

Goal: remove the remaining "CLI wrapper" feel from normal workflows without changing command behavior.

- Home: structured identity and health cards, better population/listener parsing, responsive layout, raw status/readiness only in collapsed advanced diagnostics.
- Setup: better spacing and a structured Review step with identity, network, auth/token, maps/services, and warnings.
- Server Control: friendly service restart selector, grouped readiness checks, friendly port/listener rows, clearer doctor warnings, less visible technical output.
- Services: friendly service names and compact side-by-side actions.
- Players: structured player summary and capability badges only by default, raw profile data collapsed.
- Admin Tools: player selector, structured catalog/history displays, less cramped global tools. Keep broadcast experimental.
- Live Map: friendlier marker labels and optional map image if licensing/calibration are verified.
- Logs: friendly service names and remove redundant free-text service field.
- Settings: structured runtime/file checklist only by default.

## Phase 12B: Server Control Improvements, Scheduled Restarts, Server Title Update, Redeploy Flow

Goal: add operational controls only where existing RedBlink manager behavior is clear and testable.

- Inspect `runtime/scripts/dune`, `runtime/scripts/manager.sh`, setup scripts, and compose behavior.
- Scheduled restarts: implement only if a manager command or durable configuration exists. Otherwise document required scheduler/service design.
- Server title update: implement only if the stack has a safe config write/apply path and restart requirements are explicit.
- Redeploy: implement only if existing CLI provides a safe redeploy/update command. Otherwise link users to Setup/Updates and document the intended flow.
- Add audit events and confirmations for any disruptive action.

## Phase 12C: Admin Tools and Starter Kit Interactive Selectors

Goal: replace free-text workflows with selectors and structured result tables.

- Admin player selector from Players API using character name, online status, DB actor ID, and Admin action ID.
- Item selector/search from existing catalog endpoints with category/template display.
- Structured command history table.
- Starter Kit item picker/table with quantity and durability/quality controls, plus collapsed manual/raw override.
- Specialization XP and faction unlock flow only after verifying exact RedBlink admin tooling or DB/RMQ semantics.

## Phase 12D: Live Map and Maps/UserEngine/UserGame Configuration

Goal: make map operations understandable without exposing raw command text.

- Live Map: evaluate compatible map image licensing and coordinate calibration before plotting over a background.
- Friendly marker names for vehicles/classes; raw class paths only in details/tooltips.
- Maps page: map table and edit panel for mode, memory, name/password, and safe per-map settings.
- Inspect manager support for global UserEngine, per-map UserGame overrides, memory defaults, second map/survival support, and revert-to-default flows.
- Do not expose INI editing until supported keys and rollback behavior are verified.

## Phase 12E: Backups Automation, Remote SSH Import, Character Transfer/Account Takeover Analysis

Goal: improve backup UX while keeping destructive DB operations safe.

- Backups table with row-level restore/delete and automatic initial load.
- Auto-backup settings only if existing manager has durable scheduling and retention support.
- Remote SSH import only after verifying secret handling, host validation, progress reporting, and audit logging.
- Character transfer/account takeover: analyze schema, ownership, account identity, and recovery risks before implementation. Keep blocked until backup, preview, transaction, and rollback requirements are defined.

## Phase 12F: Updates Dashboard, Auto Game Updates, Stack Rollback

Goal: make update state visible and safe.

- Auto-load game and stack update checks into status cards.
- Expose update buttons only when an update is available or when a manual re-check is requested.
- Auto game updates only if the manager supports durable scheduling, maintenance windows, and safe failure handling.
- Stack rollback only if previous stack state is captured and a verified restore command exists.

## Phase 12G: Remaining Player/Admin Features

Goal: close remaining parity gaps without guessing.

- Faction unlock and specialization XP progression flow after verified CLI/DB/RMQ path.
- Progression/events/stats/history mappings after schema confirmation.
- Whisper only after GM/courier identity and recipient routing are verified.
- Shutdown broadcast only after non-destructive envelope verification and explicit safety design.
- Blueprint/base import/delete/clone only after full object graph, ownership, ID remapping, backup, and transaction behavior are verified.

## Current Implementation Notes

- Broadcast remains Partial/Experimental: RabbitMQ publish and history logging are verified, but in-game display is not working/verified.
- Starter Kit auto-grant is partial: it runs as a web-admin scanner, not a standalone durable service.
- Market automation remains blocked until a RedBlink-compatible market automation runtime exists.
- Live Map currently supports marker/list views without calibrated background-map placement.
