# Church Dashboard UX Audit — 2026-09-11

## Goal
Evaluate the church-facing portal as a client experience, not as an internal operations screen. The dashboard should make it immediately clear what is available this week, what needs attention, where prior resources live, and what each status means without exposing unnecessary implementation language.

## Audit scope
- Portal navigation and information hierarchy
- Current-week package clarity
- Resource-link affordance and unavailable-resource states
- Approval/revision status language
- Recent activity usefulness
- History/archive readability and sorting
- Pagination/result-count clarity
- Loading, empty, and error states
- Keyboard/focus semantics and responsive behavior
- Security-sensitive copy from the church user's perspective

## First-pass findings

### High priority
1. **Unavailable resources looked clickable.** Current-package resources without preview URLs used the same dark button treatment as active links, and archive resources without URLs used the same pill treatment as links. This makes availability ambiguous.
2. **Review guidance exposed internal implementation language.** The dashboard explained that it did not expose or recreate a private token. That is accurate internally but unnecessary for a church user. The church only needs to know where approval happens.
3. **Some package statuses were system-oriented.** Values such as `sent_for_approval` were mechanically title-cased instead of translated into language a reviewer naturally understands.
4. **History pagination lacked range context.** `Page X of Y` did not tell the user which records were currently visible.

### Medium priority
5. The dashboard repeats current status in both the summary metrics and Current Package card. This is not harmful, but the summary row should eventually earn its space by surfacing actionable information rather than duplicating content.
6. Recent Activity is useful, but event wording should continue to be reviewed for church-facing language as new event types are added.
7. The history table is functional on mobile, but the six-column horizontal-scroll model should be tested with real church users. A stacked history-card treatment may ultimately be easier on phones.
8. The signed-in email is helpful for troubleshooting but is visually prominent relative to the week's content. Consider lowering its emphasis if user testing shows it distracts from the package itself.

## Changes made in the first pass
- Changed the Revisions back-link label from `Production dashboard` to `Approvals` while preserving its `/approvals` destination.
- Made current-package resources without a preview URL read as plain unavailable text instead of button-like controls.
- Made unavailable archive resources plain text instead of link-like pills.
- Replaced token-oriented review guidance with: `To approve these resources or request changes, use the secure review link sent to you by email.`
- Added church-facing status labels for Approved, Changes requested, Ready for review, and Awaiting approval.
- Added `Showing A–B of N` context to approval history pagination.
- Added `role="status"` to the dashboard loading state.

## Next audit pass
1. Review the summary metrics and decide whether `Total packages` and `Approved` are the most useful client-facing measures.
2. Evaluate whether the Current Package card should include a stronger next-step treatment when a package is awaiting approval.
3. Review Recent Activity event vocabulary against real workflow events.
4. Test the history table at narrow widths and decide between horizontal scrolling and responsive cards.
5. Audit focus states for all portal links, resource links, sorting controls, and pagination controls.
6. Test missing/broken church logo behavior and add a graceful fallback if needed.
7. Review empty-state copy for newly onboarded churches before their first Sunday package.
