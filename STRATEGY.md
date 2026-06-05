---
name: OmniFocus ↔ Reclaim.ai Sync
last_updated: 2026-06-05
---

# OmniFocus ↔ Reclaim.ai Sync Strategy

## Target problem

OmniFocus owns *what* needs doing, but it has no way to defend *when*. Tasks sit
in projects and never get time on the calendar, so the plan and the day drift
apart.

## Our approach

OmniFocus stays the single source of truth. The plugin pushes work into Reclaim
purely as a scheduling engine and flows completion back, so the user never
maintains two task lists. The bet: don't rebuild scheduling — borrow Reclaim's
AI and keep OF canonical.

## Who it's for

**Primary:** Time-blocking GTD practitioner — someone practicing time-blocking
on top of GTD who is frustrated that OmniFocus and a scheduling tool don't talk.
They're hiring the plugin to close that gap so planned work actually gets
calendar time.

## Key metrics

- **Sync fidelity** — % of enrolled OF tasks with a live, matching Reclaim task (no orphans/drift). Checked by inspection / sync logs.
- **Completion round-trip coverage** — % of Reclaim-completed tasks marked done in OF. Checked by inspection.
- **Scheduling rate** — % of synced tasks Reclaim actually defends calendar time for. Checked in Reclaim.
- **Manual reconciliations** — count of times you hand-fix drift; target trends to ~0.

## Tracks

### Sync engine reliability

The bidirectional sync core: task matching, drift detection, completion round-trip, error handling.

_Why it serves the approach:_ Fidelity and the completion round-trip are what let OF stay canonical without going stale.

### OF-native control surface

The tag hierarchy, actions, and reversible opt-in enrollment that all live inside OmniFocus.

_Why it serves the approach:_ Keeping control inside OF is how the user manages one list, not two.

### Reclaim scheduling coverage

Mapping OF attributes to Reclaim's scheduling levers: priority, hours, up-next, split, duration.

_Why it serves the approach:_ The richer the mapping, the more of OF's intent Reclaim can defend time for.

### Runtime hardening

OmniAutomation constraints, Keychain credentials, API resilience, batch operations.

_Why it serves the approach:_ A bridge the user can't trust mechanically defeats "OF is canonical" — robustness is load-bearing.
