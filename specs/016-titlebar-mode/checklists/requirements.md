# Specification Quality Checklist: Titlebar Mode

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-01
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`
- Architecture references (the shell-mode state machine, guest-view/DevTools layout, and
  source paths where they exist) are confined to the Context, Assumptions, and
  Dependencies sections, matching the convention of specs 001/004/009/012/013/015; the
  Functional Requirements and Success Criteria stay behavior-focused.
- Naming resolved during specification: the existing chromeless default is the "focus"
  layout; the new opt-in docked layout is "titlebar mode". The toggle is `⌘⇧F` plus a
  command-palette entry (FR-007, US3).
- Other key decisions (reasonable defaults, documented in Assumptions): titlebar mode
  is opt-in and per-window with persisted state; new windows start in the default
  overlay mode; the strip keeps the current height (~30–36px) and the guest page gets
  the remainder; `⌘B` is superseded while the mode is on; docked DevTools and
  full-window surfaces live inside the pushed content area; toggling never reloads the
  guest page.
- No blocking open questions remain.
