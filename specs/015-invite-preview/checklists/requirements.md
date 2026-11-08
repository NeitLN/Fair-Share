# Specification Quality Checklist: An invited person knows which house they are joining

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-08
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

- The privacy change (FR-001, FR-012: a valid code shows the house's name and the owner's name, where rule D4 hid
  even the name) is the one decision the owner of the project should confirm; it is written as an assumption with its
  reason rather than as an open question.
- The signed-out preview (a former User Story 4) was cut in review: it would have needed an exception to the
  access rule for a P3 gain. Previews need a signed-in account.
- Reviewed in several rounds (08/11): outcomes stored for the requester only, five request states told apart by
  each check, the 30-preview cap kept apart from J2, the start page after a refusal, focus rules. No contradiction
  left.
- The boundary with spec 012 PR-L is FR-014: the house rows are theirs, the waiting cards, join form, start page and
  sign-in line are this spec's.
